import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pkg from '../package.json';
import scenePacks from '../src/data/scene-packs.json';
import { farmScene, foundryFloorScene, goldenGateScene } from '../src/data/scenes';
import { hashBytes } from './mirror-core.mjs';
import { comparePackRecord, compareRuntimeRecord, main, packRecord, parseSums, stagePack, stagedPackDirectory, verifyPack } from './scene-pack.mjs';
import { CEILINGS, checkCeiling, measureFrameRuntime } from './scene-runtime.mjs';

const directories: string[] = [];
afterEach(async () => {
  mock.restore();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const files: Record<string, string> = {
  'models/a.glb': 'model a',
  'models/b.glb': 'model b, a little longer',
  'data/layout.json': '{"cells":[]}',
  'licenses/ASSET-LICENSE.txt': 'licence text',
};

const MODULES = ['C:/scenes/packages/scene-kit/src/renderer/three-runtime.ts', 'C:/scenes/node_modules/three/build/three.core.js', 'C:/scenes/node_modules/react/index.js'];

/** A small pack in the standalone layout: assets/{pack.json,SHA256SUMS,...} beside the notices. */
async function fixture(id = 'farm') {
  const root = await mkdtemp(join(tmpdir(), 'kiln-scene-pack-'));
  directories.push(root);
  const assets = join(root, 'assets');
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(assets, path, '..'), { recursive: true });
    await writeFile(join(assets, path), text);
  }
  const sealed = Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hashBytes(Buffer.from(text)) }));
  await writeFile(join(assets, 'SHA256SUMS'), sealed.map((file) => `${file.sha256}  ${file.path}\n`).join(''));
  await writeFile(
    join(assets, 'pack.json'),
    JSON.stringify({
      schema: 'kiln.scene-pack/1',
      id,
      release: 'r9',
      three: '0.186.0',
      models: [{ id: 'a', path: 'models/a.glb' }, { id: 'b', path: 'models/b.glb' }],
      data: { layout: 'data/layout.json' },
      files: sealed,
    }),
  );
  await writeFile(join(assets, 'index-abc.js'), 'not part of the pack');
  await writeFile(join(root, 'bundle-modules.json'), JSON.stringify({ modules: MODULES }));
  await writeFile(join(root, 'THIRD-PARTY-NOTICES.txt'), 'notices');
  return { root, assets, notices: join(root, 'THIRD-PARTY-NOTICES.txt') };
}

describe('scene pack staging', () => {
  test('copies a verified pack byte for byte and reports its totals', async () => {
    const { root } = await fixture();
    const target = join(root, 'served');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'stale.txt'), 'left by an earlier stage');
    const inventory = await stagePack({ source: root, target });
    const sealedBytes = Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
    expect(inventory).toMatchObject({ id: 'farm', release: 'r9', sealedFiles: 4, sealedBytes, totalFiles: 7 });
    const overhead = ['pack.json', 'SHA256SUMS'].reduce((sum, name) => sum + Bun.file(join(root, 'assets', name)).size, 0) + Buffer.byteLength('notices');
    expect(inventory.totalBytes).toBe(sealedBytes + overhead);
    for (const [path, text] of Object.entries(files)) expect(await readFile(join(target, path), 'utf8')).toBe(text);
    expect(await readFile(join(target, 'THIRD-PARTY-NOTICES.txt'), 'utf8')).toBe('notices');
    expect((await readdir(target)).sort()).toEqual(['SHA256SUMS', 'THIRD-PARTY-NOTICES.txt', 'data', 'licenses', 'models', 'pack.json']);
    expect((await verifyPack(target, join(target, 'THIRD-PARTY-NOTICES.txt'))).totalBytes).toBe(inventory.totalBytes);
  });

  test('refuses a corrupt, resized, unsealed or unlisted file', async () => {
    const corrupt = await fixture();
    await writeFile(join(corrupt.assets, 'models/a.glb'), 'model X');
    await expect(verifyPack(corrupt.assets, corrupt.notices)).rejects.toThrow('SHA-256');

    const unsealed = await fixture();
    await writeFile(join(unsealed.assets, 'models/extra.glb'), 'not sealed');
    await expect(verifyPack(unsealed.assets, unsealed.notices)).rejects.toThrow('Unsealed');

    const missing = await fixture();
    await rm(join(missing.assets, 'data/layout.json'));
    await expect(verifyPack(missing.assets, missing.notices)).rejects.toThrow('missing');

    const unlisted = await fixture();
    const manifest = JSON.parse(await readFile(join(unlisted.assets, 'pack.json'), 'utf8'));
    manifest.files.pop();
    await writeFile(join(unlisted.assets, 'pack.json'), JSON.stringify(manifest));
    await expect(verifyPack(unlisted.assets, unlisted.notices)).rejects.toThrow('does not');

    const resized = await fixture();
    const sized = JSON.parse(await readFile(join(resized.assets, 'pack.json'), 'utf8'));
    sized.files[0].bytes += 1;
    await writeFile(join(resized.assets, 'pack.json'), JSON.stringify(sized));
    await expect(verifyPack(resized.assets, resized.notices)).rejects.toThrow('Size');
  });

  test('every directory of the pack must be sealed, not only the ones a scene names', async () => {
    const { assets, notices } = await fixture();
    await mkdir(join(assets, 'vehicles'), { recursive: true });
    await writeFile(join(assets, 'vehicles/loose.glb'), 'not sealed');
    await expect(verifyPack(assets, notices)).rejects.toThrow('Unsealed file in the scene pack: vehicles/loose.glb');
  });

  test('rejects malformed, duplicate and escaping SHA256SUMS entries', () => {
    const digest = 'a'.repeat(64);
    expect(parseSums(`${digest}  models/a.glb\n`).get('models/a.glb')).toBe(digest);
    expect(() => parseSums('')).toThrow('no files');
    expect(() => parseSums('not a digest  models/a.glb\n')).toThrow('Malformed');
    expect(() => parseSums(`${digest}  models/a.glb\n${digest}  models/a.glb\n`)).toThrow('Duplicate');
    expect(() => parseSums(`${digest}  ../outside.glb\n`)).toThrow('Unsafe');
    expect(() => parseSums(`${digest}  /absolute.glb\n`)).toThrow('Unsafe');
  });

  test('a stage that cannot verify its source leaves the served copy untouched', async () => {
    const { root, assets } = await fixture();
    const target = join(root, 'served');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'kept.txt'), 'previous stage');
    await writeFile(join(assets, 'models/a.glb'), 'model X');
    await expect(stagePack({ source: root, target })).rejects.toThrow('SHA-256');
    expect(await readFile(join(target, 'kept.txt'), 'utf8')).toBe('previous stage');
  });
});

describe('scene pack command', () => {
  /** A site directory whose scene pack catalog holds `records`, beside the pack fixture's root. */
  async function site(root: string, records: Record<string, unknown>) {
    const directory = join(root, 'site');
    await mkdir(join(directory, 'src/data'), { recursive: true });
    await writeFile(join(directory, 'src/data/scene-packs.json'), JSON.stringify(records));
    return directory;
  }
  const catalogOf = async (directory: string) => JSON.parse(await readFile(join(directory, 'src/data/scene-packs.json'), 'utf8'));
  const quiet = () => spyOn(console, 'log').mockImplementation(() => {});
  const off = { KILN_SITE_SCENES_DIR: 'off' };

  test('without a workspace or pack it skips and clears every pack staged earlier', async () => {
    quiet();
    const { root } = await fixture();
    const directory = await site(root, { farm: { base: '/scene-packs/farm/r9/', source: 'packages/farm/dist/r9/standalone' } });
    for (const release of ['r8', 'r9']) {
      await mkdir(join(directory, 'public/scene-packs/farm', release), { recursive: true });
      await writeFile(join(directory, 'public/scene-packs/farm', release, 'pack.json'), '{}');
    }
    await mkdir(join(directory, 'public/scene-runtime/golden-gate'), { recursive: true });
    await writeFile(join(directory, 'public/scene-runtime/golden-gate/runtime.json'), '{}');
    expect(await main([], off, directory)).toEqual([]);
    expect(existsSync(join(directory, 'public/scene-packs'))).toBe(false);
    expect(existsSync(join(directory, 'public/scene-runtime/golden-gate'))).toBe(false);
    expect(await main([], off, directory)).toEqual([]);
  });

  test('stages the pack its record agrees with and refuses one that has drifted', async () => {
    quiet();
    const { root, assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const directory = await site(root, { farm: packRecord(inventory) });
    const env = { ...off, KILN_SITE_SCENE_PACK_DIR: root };
    await mkdir(join(directory, 'public/scene-packs/farm/r8'), { recursive: true });
    await writeFile(join(directory, 'public/scene-packs/farm/r8/pack.json'), '{}');
    const staged = await main([], env, directory);
    expect(staged.map((entry: { totalBytes: number }) => entry.totalBytes)).toEqual([inventory.totalBytes]);
    expect(await readFile(join(directory, 'public/scene-packs/farm/r9/models/a.glb'), 'utf8')).toBe('model a');
    expect(existsSync(join(directory, 'public/scene-packs/farm/r8'))).toBe(false);

    await writeFile(join(directory, 'src/data/scene-packs.json'), JSON.stringify({ farm: { ...packRecord(inventory), totalBytes: inventory.totalBytes + 1 } }));
    await expect(main([], env, directory)).rejects.toThrow('disagrees');
  });

  test('--record rewrites the catalog record from the verified pack and stages it', async () => {
    quiet();
    const { root, assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const directory = await site(root, { farm: { ...packRecord(inventory), release: 'r8', base: '/scene-packs/farm/r8/', totalBytes: 1 }, other: { kept: true } });
    await main(['--record'], { ...off, KILN_SITE_SCENE_PACK_DIR: root }, directory);
    const written = await catalogOf(directory);
    expect(written.farm).toEqual(packRecord(inventory));
    expect(written.other).toEqual({ kept: true });
    expect(existsSync(join(directory, 'public/scene-packs/farm/r9/pack.json'))).toBe(true);
  });

  test('--scene stages one scene and leaves another one staged', async () => {
    quiet();
    const { root, assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const directory = await site(root, { farm: packRecord(inventory) });
    await mkdir(join(directory, 'public/scene-packs/golden-gate/g3'), { recursive: true });
    await writeFile(join(directory, 'public/scene-packs/golden-gate/g3/pack.json'), '{}');
    await main(['--scene', 'farm'], { ...off, KILN_SITE_SCENE_PACK_DIR: root }, directory);
    expect(existsSync(join(directory, 'public/scene-packs/farm/r9/pack.json'))).toBe(true);
    expect(existsSync(join(directory, 'public/scene-packs/golden-gate/g3/pack.json'))).toBe(true);
    await expect(main(['--scene', 'nowhere'], off, directory)).rejects.toThrow('Unknown scene');
    await expect(main(['--source', root], off, directory)).rejects.toThrow('--source needs --scene');
  });

  test('a standalone-built scene also stages its chunk as built, and drift in it is named', async () => {
    quiet();
    const { root, assets, notices } = await fixture('golden-gate');
    const inventory = await verifyPack(assets, notices);
    const { record } = await measureFrameRuntime({ id: 'golden-gate', source: root });
    const directory = await site(root, { 'golden-gate': { ...packRecord(inventory), runtime: record } });
    const env = { ...off, KILN_SITE_SCENE_PACK_DIR_GOLDEN_GATE: root };
    await main(['--scene', 'golden-gate'], env, directory);
    const staged = join(directory, 'public/scene-runtime/golden-gate');
    expect((await readdir(staged)).sort()).toEqual(['frame.html', 'index-abc.js', 'runtime.json']);
    expect(await readFile(join(staged, 'index-abc.js'), 'utf8')).toBe('not part of the pack');
    expect(await readFile(join(directory, 'public/scene-packs/golden-gate/r9/models/a.glb'), 'utf8')).toBe('model a');
    // The chunk beside the pack is the scene's code, not pack data: it is not served under the pack.
    expect(existsSync(join(directory, 'public/scene-packs/golden-gate/r9/index-abc.js'))).toBe(false);

    await writeFile(join(root, 'assets/index-abc.js'), 'a different chunk');
    await expect(main(['--scene', 'golden-gate'], env, directory)).rejects.toThrow('runtime.sha256');
    expect(existsSync(staged)).toBe(false);
  });
});

describe('scene pack catalog record', () => {
  test('a record built from a verified pack agrees with it, and drift names the field', async () => {
    const { assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const record = packRecord(inventory);
    expect(record).toMatchObject({ release: 'r9', base: '/scene-packs/farm/r9/', source: 'packages/farm/dist/m4/standalone' });
    expect(comparePackRecord(record, inventory)).toEqual([]);
    expect(comparePackRecord({ ...record, totalBytes: record.totalBytes + 1 }, inventory)[0]).toContain('totalBytes');
    expect(comparePackRecord({ ...record, release: 'r10' }, inventory)[0]).toContain('release');
    expect(comparePackRecord(undefined, inventory)).toEqual(['scene-packs.json has no record for farm']);
  });

  test('a recorded runtime that differs from its build names the field', () => {
    const recorded = { kind: 'frame', file: 'index-a.js', bytes: 10, gzipBytes: 5, gzipMethod: 'bun-zlib', sha256: 'a'.repeat(64), modulesSha256: 'b'.repeat(64) };
    expect(compareRuntimeRecord(recorded, { ...recorded })).toEqual([]);
    expect(compareRuntimeRecord(recorded, { ...recorded, bytes: 11 })).toEqual(['runtime.bytes: catalog 10, build 11']);
    expect(compareRuntimeRecord(undefined, recorded)).toEqual(['the record has no runtime for this standalone build']);
  });

  test('the Farm record is the pack the site serves: the m4 build, byte-identical to r34', () => {
    const record = scenePacks.farm;
    expect(record.release).toBe('r34');
    expect(record.base).toBe(`/scene-packs/farm/${record.release}/`);
    expect(record.source).toBe('packages/farm/dist/m4/standalone');
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    expect(record.totalBytes).toBeGreaterThan(record.sealedBytes);
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(farmScene.assetBase).toBe(record.base);
    expect(farmScene.pack).toBe(record);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'farm', 'r34'));
    expect(() => stagedPackDirectory({ base: '/../escape/' }, '/site')).toThrow('Unexpected');
  });

  test('the Golden Gate record is the g5 pack and its public chunk, inside its ceiling', () => {
    const record = scenePacks['golden-gate'];
    expect(record.release).toBe('g5');
    expect(record.base).toBe('/scene-packs/golden-gate/g5/');
    // Round 3's staging of g5 printed these (review/round-3/golden-gate/stage-g5.log); g5 is g4 with bridge-fix review 5's web tier.
    expect(record).toMatchObject({ sealedFiles: 103, sealedBytes: 12_616_781, packJsonSha256: '45fd9e8ef1e7bdec173863ad520e42e8f996c943dfcf57c4842d432ea006335c', sha256sumsSha256: 'b86a5b11c007a1ef14a0fd4b2c3c0b324eba5e6fb55273585c416a8319126341' });
    expect(record.source).toBe('packages/golden-gate/dist/standalone');
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256, record.runtime.sha256, record.runtime.modulesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(record.runtime).toMatchObject({ kind: 'frame', file: 'index-CA13LcNQ.js', bytes: 1_716_992 });
    expect(checkCeiling('golden-gate', record.runtime).within).toBe(true);
    expect(record.runtime.bytes).toBeLessThanOrEqual(CEILINGS['golden-gate'].bytes);
    expect(goldenGateScene.assetBase).toBe(record.base);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'golden-gate', 'g5'));
  });

  test('the Foundry Floor record is the ff2 pack and its public chunk, inside its ceiling', () => {
    const record = scenePacks['foundry-floor'];
    expect(record.release).toBe('ff2');
    expect(record.base).toBe('/scene-packs/foundry-floor/ff2/');
    expect(record.source).toBe('packages/foundry-floor/dist/standalone');
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    // Round 3's staging of ff2 printed these (review/round-3/foundry-floor/stage-ff2.log).
    expect(record).toMatchObject({ sealedFiles: 40, sealedBytes: 6_148_457, packJsonSha256: '2a6840fbe3e541090753b5fdca23934442a4be2788b74765c16afcc4a63ff8fc' });
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256, record.runtime.sha256, record.runtime.modulesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(record.runtime).toMatchObject({ kind: 'frame', file: 'index-UyCWwb6D.js', bytes: 1_586_280, gzipBytes: 473_835 });
    expect(checkCeiling('foundry-floor', record.runtime).within).toBe(true);
    expect(foundryFloorScene.assetBase).toBe(record.base);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'foundry-floor', 'ff2'));
  });

  test.each(['farm', 'golden-gate', 'foundry-floor'])('the %s scene page stays out of search results whatever its availability says', async (id) => {
    const page = await readFile(new URL(`../src/pages/scenes/${id}.astro`, import.meta.url), 'utf8');
    expect(page).toMatch(/^\s*noindex\s*$/m);
    expect(page).toMatch(/^\s*nofollow\s*$/m);
    expect(page).not.toContain('noindex={');
  });
});
