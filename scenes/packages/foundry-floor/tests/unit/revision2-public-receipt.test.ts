import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { writePublicReceipt } from '../tools/public-receipt';

test('the standalone intake carries the exact public receipt beside its entry with complete byte accounting', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'ff3-public-receipt-'));
  try {
    const html = Buffer.from('<!doctype html>'), modules = Buffer.from('{"modules":[]}');
    writeFileSync(resolve(root, 'index.html'), html);
    writeFileSync(resolve(root, 'bundle-modules.json'), modules);
    const evidence = resolve(root, 'evidence', 'bundle-public.json');
    const record = writePublicReceipt(root, evidence, {
      mode: 'public', release: 'ff3-review2', outputFiles: 2, outputBytes: html.length + modules.length,
      initialCode: { bytes: 400, gzipBytes: 200 }, initialChunks: ['assets/index-abc.js'],
      chunks: [{ name: 'assets/index-abc.js', role: 'startup', bytes: 400, gzipBytes: 200, sha256: 'preserved' }],
      packSha256: 'exact-pack-identity', note: 'Entrée: metadata is counted in UTF-8 bytes.',
    });
    const adjacent = readFileSync(resolve(root, 'bundle-public.json'));
    expect(adjacent.equals(readFileSync(evidence))).toBe(true);
    expect(JSON.parse(adjacent.toString())).toEqual(record);
    expect(record.outputFiles).toBe(3);
    expect(record.outputBytes).toBe(html.length + modules.length + statSync(resolve(root, 'bundle-public.json')).size);
    expect(record.initialCode).toEqual({ bytes: 400, gzipBytes: 200 });
    expect(record.initialChunks).toEqual(['assets/index-abc.js']);
    expect(record.packSha256).toBe('exact-pack-identity');
    expect(record.release).toBe('ff3-review2');
    expect(record.chunks[0]!.sha256).toBe('preserved');
    expect(() => writePublicReceipt(root, evidence, record)).toThrow(/already exists/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
