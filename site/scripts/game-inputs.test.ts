import { expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { hashBytes } from './mirror-core.mjs';
import { checkedGameArchive, validateGameManifest, verifyStagedGames } from './game-inputs.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const original = { 'index.html': strToU8('<!doctype html><html lang="en"><title>H-7</title></html>'), 'assets/game-Ab123456.js': strToU8('console.log("game");') };
function fixture(files = original) {
  const bytes = zipSync(files);
  const sha256 = hashBytes(bytes);
  const sourceCommit = 'a'.repeat(40);
  const record = { id: 'h-7', sourceCommit, path: `game-inputs/h-7/${sourceCommit}/${sha256}.zip`, sha256, bytes: bytes.length, files: Object.entries(files).filter(([path]) => !path.endsWith('/')).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hashBytes(bytes) })) };
  return { bytes, record };
}
test('sealed compiled game is accepted without transforming its document', () => {
  const { bytes, record } = fixture();
  expect(checkedGameArchive(bytes, record)['index.html']).toEqual(original['index.html']);
});
test('rejects altered bytes, unknown archive members and missing files', () => {
  const { bytes, record } = fixture();
  expect(() => checkedGameArchive(bytes, { ...record, sha256: '0'.repeat(64) })).toThrow();
  expect(() => checkedGameArchive(bytes, { ...record, files: record.files.slice(0, 1) })).toThrow();
  expect(() => checkedGameArchive(bytes, { ...record, files: [...record.files, { path: 'assets/missing.js', bytes: 1, sha256: '0'.repeat(64) }] })).toThrow();
});
test('rejects sources, maps, traversal, source map references and symlinks', () => {
  for (const path of ['src/main.ts', 'assets/game.js.map', '../escape.js', 'package.json', 'assets/source.ts', 'assets\\escape.js']) {
    const { bytes, record } = fixture({ ...original, [path]: strToU8('source') });
    expect(() => checkedGameArchive(bytes, record)).toThrow();
  }
  const mapped = fixture({ ...original, 'assets/mapped.js': strToU8('//# sourceMappingURL=inline.map') });
  expect(() => checkedGameArchive(mapped.bytes, mapped.record)).toThrow();
  const { bytes, record } = fixture();
  const mutated = Buffer.from(bytes);
  const central = mutated.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  mutated.writeUInt32LE((0xa1ff << 16) >>> 0, central + 38);
  const sha256 = hashBytes(mutated);
  expect(() => checkedGameArchive(mutated, { ...record, sha256, path: record.path.replace(record.sha256, sha256) })).toThrow(/symlink|regular/i);
});
test('manifest pins immutable host, commit, archive and unique game IDs', () => {
  const { record } = fixture();
  const manifest = { schemaVersion: 1, base: 'https://assets.kilnstudio.tools/', games: [record] };
  expect(validateGameManifest(manifest)).toEqual([record]);
  expect(() => validateGameManifest({ ...manifest, base: 'https://example.com/' })).toThrow();
  expect(() => validateGameManifest({ ...manifest, games: [record, record] })).toThrow();
});
test('build receipt verifies exact staged files and detects later mutation', async () => {
  const site = await mkdtemp(join(tmpdir(), 'game-inputs-'));
  try {
    const { record } = fixture();
    await mkdir(join(site, 'src/data'), { recursive: true });
    await writeFile(join(site, 'src/data/game-inputs.json'), JSON.stringify({ schemaVersion: 1, base: 'https://assets.kilnstudio.tools/', games: [record] }));
    for (const [path, bytes] of Object.entries(original)) {
      await mkdir(join(site, 'dist/play/h-7', path, '..'), { recursive: true });
      await writeFile(join(site, 'dist/play/h-7', path), bytes);
    }
    expect((await verifyStagedGames({ site, dist: join(site, 'dist') }))['h-7'].sourceCommit).toBe(record.sourceCommit);
    await writeFile(join(site, 'dist/play/h-7/assets/game-Ab123456.js'), 'tampered');
    await expect(verifyStagedGames({ site, dist: join(site, 'dist') })).rejects.toThrow();
  } finally { await rm(site, { recursive: true, force: true }); }
});
