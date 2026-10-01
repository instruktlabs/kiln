import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mirrorPath, pinMirrorFile, removeUnder, sha256Hex, syncGroup, upsertBy, writeJson, writeMirrorFile } from './media-pins.mjs';

describe('list helpers', () => {
  test('upsertBy replaces in place or appends, and never reorders', () => {
    const list = [{ path: 'a', v: 1 }, { path: 'b', v: 1 }, { path: 'c', v: 1 }];
    expect(upsertBy(list, 'path', { path: 'b', v: 2 })).toEqual([{ path: 'a', v: 1 }, { path: 'b', v: 2 }, { path: 'c', v: 1 }]);
    expect(upsertBy(list, 'path', { path: 'd', v: 2 }).map((entry) => entry.path)).toEqual(['a', 'b', 'c', 'd']);
    // The input is not modified.
    expect(list.map((entry) => entry.v)).toEqual([1, 1, 1]);
  });

  test('syncGroup makes a prefix group exactly the wanted entries and leaves the rest alone', () => {
    const list = [
      { path: 'packs/farm/x.bin', v: 'farm' },
      { path: 'packs/vehicles/old.glb', v: 'stale' },
      { path: 'packs/vehicles/keep.glb', v: 'old bytes' },
      { path: 'standalone/y.bin', v: 'bridge' },
    ];
    const next = [{ path: 'packs/vehicles/keep.glb', v: 'new bytes' }, { path: 'packs/vehicles/new.glb', v: 'added' }];
    expect(syncGroup(list, 'path', 'packs/vehicles/', next)).toEqual([
      { path: 'packs/farm/x.bin', v: 'farm' },
      { path: 'packs/vehicles/keep.glb', v: 'new bytes' },
      { path: 'standalone/y.bin', v: 'bridge' },
      { path: 'packs/vehicles/new.glb', v: 'added' },
    ]);
  });

  test('syncGroup is a fixed point: applying the same group again changes nothing', () => {
    const list = [{ path: 'packs/farm/x.bin' }, { path: 'packs/vehicles/a.glb' }];
    const next = [{ path: 'packs/vehicles/a.glb' }, { path: 'packs/vehicles/b.glb' }];
    const once = syncGroup(list, 'path', 'packs/vehicles/', next);
    expect(syncGroup(once, 'path', 'packs/vehicles/', next)).toEqual(once);
    expect(JSON.stringify(syncGroup(once, 'path', 'packs/vehicles/', next))).toBe(JSON.stringify(once));
  });

  test('syncGroup ignores entries that have no key value, and an empty group removes the prefix', () => {
    expect(syncGroup([{ other: 1 }, { path: 'p/a' }], 'path', 'p/', [])).toEqual([{ other: 1 }]);
    expect(removeUnder([{ path: 'p/a' }, { path: 'q/b' }, {}], 'path', 'p/')).toEqual([{ path: 'q/b' }, {}]);
  });
});

describe('mirror files', () => {
  test('a mirror path stays inside the mirror', () => {
    expect(mirrorPath('packs/vehicles/r1/models/sedan.glb')).toBe('packs/vehicles/r1/models/sedan.glb');
    for (const unsafe of ['/etc/passwd', '../outside', 'a/../b', 'a//b', 'a\\b', './a', '', 'a/.']) expect(() => mirrorPath(unsafe)).toThrow('Unsafe mirror path');
  });

  test('writes the bytes and returns the pin, and pins them in a manifest without disturbing it', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'kiln-site-pins-'));
    try {
      const manifestFile = join(temp, 'manifest.json');
      await writeJson(manifestFile, { base: 'https://example.invalid/', files: [{ path: 'a.bin', bytes: 1, sha256: sha256Hex('a') }] });
      const bytes = Buffer.from('a vehicle');
      const record = await writeMirrorFile(join(temp, 'mirror'), 'packs/vehicles/r1/models/sedan.glb', bytes);
      expect(record).toEqual({ path: 'packs/vehicles/r1/models/sedan.glb', bytes: bytes.length, sha256: sha256Hex(bytes) });
      expect((await readFile(join(temp, 'mirror', record.path))).equals(bytes)).toBe(true);
      const pin = await pinMirrorFile({ mirror: join(temp, 'mirror'), manifestFile, path: 'b.bin', bytes: Buffer.from('b') });
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      expect(manifest.base).toBe('https://example.invalid/');
      expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(['a.bin', 'b.bin']);
      expect(manifest.files[1]).toEqual(pin);
      // Pinning the same path again replaces the pin.
      await pinMirrorFile({ mirror: join(temp, 'mirror'), manifestFile, path: 'b.bin', bytes: Buffer.from('bb') });
      expect(JSON.parse(await readFile(manifestFile, 'utf8')).files).toHaveLength(2);
      await expect(writeMirrorFile(join(temp, 'mirror'), '../escape', bytes)).rejects.toThrow('Unsafe mirror path');
    } finally {
      const target = resolve(temp);
      if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-pins-')) throw new Error('Unsafe cleanup path');
      await rm(target, { recursive: true, force: true });
    }
  });
});
