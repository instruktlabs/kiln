import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { assetPath, fetchPinnedFile, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';

describe('pinned Commons delivery', () => {
  test('rejects corrupt bytes, missing seals and unsafe member paths', () => {
    const data = strToU8('original');
    expect(() => verifyBytes(data, { bytes: data.length, sha256: hashBytes(data) }, 'asset')).not.toThrow();
    expect(() => verifyBytes(strToU8('modified'), { bytes: data.length, sha256: hashBytes(data) }, 'asset')).toThrow('SHA-256');
    expect(() => assetPath('../outside')).toThrow('Unsafe');
    expect(() => assetPath('C:/outside')).toThrow('Unsafe');
    expect(() => assetPath('dir\\outside')).toThrow('Unsafe');
    expect(() => verifyArchive(zipSync({ 'source.kiln.js': data }))).toThrow('delivery.json');
  });
  test('verifies every declared member and refuses unsealed extras', () => {
    const source = strToU8('const asset = 1;');
    const manifest = strToU8(JSON.stringify({ files: { 'sources/a.kiln.js': { bytes: source.length, sha256: hashBytes(source) } } }));
    const files = { 'delivery.json': manifest, 'sources/a.kiln.js': source };
    expect(verifyArchive(zipSync(files)).files['sources/a.kiln.js']).toEqual(source);
    expect(() => verifyArchive(zipSync({ ...files, 'sources/a.kiln.js': strToU8('tampered') }))).toThrow('SHA-256');
    expect(() => verifyArchive(zipSync({ ...files, 'extra.txt': source }))).toThrow('Unsealed');
  });
  test('standalone editable bundles verify the revision manifest', () => {
    const source = strToU8('source');
    const path = 'asset/revision/';
    const manifest = strToU8(JSON.stringify({ files: { 'source.kiln.js': { bytes: source.length, sha256: hashBytes(source) } } }));
    expect(verifyArchive(zipSync({ [`${path}manifest.json`]: manifest, [`${path}source.kiln.js`]: source }), 'editable').manifest.files['source.kiln.js'].bytes).toBe(6);
  });
  test('local mirror resolution verifies cache on every read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-mirror-'));
    try {
      const value = strToU8('sealed');
      const record = { path: 'asset.glb', bytes: value.length, sha256: hashBytes(value) };
      await writeFile(join(dir, record.path), value);
      const local = await fetchPinnedFile(record, { mirror: dir, cache: join(dir, 'cache') });
      expect(await readFile(local)).toEqual(Buffer.from(value));
      await writeFile(local, 'bad cache');
      await expect(fetchPinnedFile(record, { mirror: dir, cache: join(dir, 'cache') })).rejects.toThrow('SHA-256');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
