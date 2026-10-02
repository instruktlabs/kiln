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
test('review release suffixes stay confined to one pack directory', () => {
  expect(stagedPackDirectory({ base: '/scene-packs/farm/r35-local-review/' }, '/site'))
    .toBe(resolve('/site/public/scene-packs/farm/r35-local-review'));
  for (const base of ['/scene-packs/farm/../', '/scene-packs/farm/r35/../../', '/scene-packs/farm/-review/', '/scene-packs/farm/r35\\escape/'])
    expect(() => stagedPackDirectory({ base }, '/site')).toThrow('Unexpected');
});

test('packs-off mode clears served scenes even when an explicit pack input exists', async () => {
  const { root } = await fixture();
  const site = join(root, 'site');
  for (const directory of ['scene-packs/farm/r1', 'scene-runtime/farm', 'scene-runtime/golden-gate']) {
    await mkdir(join(site, 'public', directory), { recursive: true });
    await writeFile(join(site, 'public', directory, 'stale.json'), '{}');
  }
  await main(['--scene', 'farm', '--source', root], { KILN_SITE_PACKS: '0' }, site);
  expect(existsSync(join(site, 'public/scene-packs/farm'))).toBe(false);
  expect(existsSync(join(site, 'public/scene-runtime/farm'))).toBe(false);
});
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
async function fixture(id = 'farm', content: Record<string, string> = files) {
  const root = await mkdtemp(join(tmpdir(), 'kiln-scene-pack-'));
  directories.push(root);
  const assets = join(root, 'assets');
  for (const [path, text] of Object.entries(content)) {
    await mkdir(join(assets, path, '..'), { recursive: true });
    await writeFile(join(assets, path), text);
  }
  const sealed = Object.entries(content).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hashBytes(Buffer.from(text)) }));
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
  test('an initial-load receipt must name the sealed pack release even when its pack hash matches', async () => {
    const { root, assets } = await fixture('foundry-floor');
    const pack = JSON.parse(await readFile(join(assets, 'pack.json'), 'utf8'));
    pack.release = 'ff3-review2';
    const bytes = Buffer.from(JSON.stringify(pack));
    await writeFile(join(assets, 'pack.json'), bytes);
    await writeFile(join(root, 'bundle-public.json'), JSON.stringify({ mode: 'public', release: 'ff3', packSha256: hashBytes(bytes), chunks: [], initialChunks: [] }));
    await expect(measureFrameRuntime({ id: 'foundry-floor', source: root })).rejects.toThrow(/release/);
  });
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

  test('refuses a sealed pack that carries a local user path, before copying anything', async () => {
    // The Golden Gate g5 terrain record named the author's local path (design and engineering reviews, finding 1).
    const path = ['C:', 'Users', 'alexq', 'X', 'kiln-commons', 'golden-gate.glb'].join('\\');
    const { root } = await fixture('golden-gate', { ...files, 'terrain/frame.json': `{"bridge_glb":{"path":"${path}"}}` });
    const target = join(root, 'served');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'kept.txt'), 'previous stage');
    await expect(stagePack({ source: root, target, names: ['alexq'] })).rejects.toThrow('The scene pack carries private data and is not staged (2)');
    expect(await readFile(join(target, 'kept.txt'), 'utf8')).toBe('previous stage');
    // The build's own module list beside the pack is not part of it and is never copied, so it is not scanned.
    const clean = await fixture('golden-gate');
    await writeFile(join(clean.root, 'bundle-modules.json'), JSON.stringify({ modules: [['C:', 'Users', 'alexq', 'scenes'].join('/')] }));
    await expect(stagePack({ source: clean.root, target: join(clean.root, 'served'), names: ['alexq'] })).resolves.toMatchObject({ id: 'golden-gate' });
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

  test('the Farm record serves the r36 local review with repaired clothing and retained walking controls', () => {
    const record = scenePacks.farm;
    expect(record.release).toBe('r36-local-review');
    expect(record.base).toBe(`/scene-packs/farm/${record.release}/`);
    expect(record.source).toBe('.cache/site-inputs/farm/standalone');
    expect(record).toMatchObject({ sealedFiles: 34, sealedBytes: 7_133_727, packJsonSha256: '5d046aa2c04637436d7e3918db690f4f25f6684a58ae7a78d333dec9df428f48' });
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    expect(record.totalBytes).toBeGreaterThan(record.sealedBytes);
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(farmScene.assetBase).toBe(record.base);
    expect(farmScene.pack).toBe(record);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'farm', 'r36-local-review'));
    expect(() => stagedPackDirectory({ base: '/../escape/' }, '/site')).toThrow('Unexpected');
  });

  test('the Golden Gate record is the g9 local review with the final six vehicles, inside its ceiling', () => {
    const record = scenePacks['golden-gate'];
    expect(record.release).toBe('g9');
    expect(record.base).toBe('/scene-packs/golden-gate/g9/');
    // Preserved g9 carries the new six-vehicle delivery with the qualified water opening and controls.
    expect(record).toMatchObject({ sealedFiles: 103, sealedBytes: 12_186_327, packJsonSha256: 'c2a1d83fce6caf07a7b3e87070ccb8a983dd68e0c7f98eee3f1ba5255ce059cb', sha256sumsSha256: '75ce79fc746eafd27d7b597396489294a821fef5d88a05981b6bb9572159a58a' });
    expect(record.source).toBe('.cache/site-inputs/golden-gate/standalone');
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256, record.runtime.sha256, record.runtime.modulesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(record.runtime).toMatchObject({ kind: 'frame', file: 'index-BDTQ3svb.js', bytes: 1_724_619, gzipBytes: 518_716 });
    expect(checkCeiling('golden-gate', record.runtime).within).toBe(true);
    expect(record.runtime.bytes).toBeLessThanOrEqual(CEILINGS['golden-gate'].bytes);
    expect(goldenGateScene.assetBase).toBe(record.base);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'golden-gate', 'g9'));
  });

  test('the Foundry Floor record is ff3-review2 with a verified initial closure inside its ceiling', () => {
    const record = scenePacks['foundry-floor'];
    expect(record.release).toBe('ff3-review2');
    expect(record.base).toBe('/scene-packs/foundry-floor/ff3-review2/');
    expect(record.source).toBe('.cache/site-inputs/foundry-floor/standalone');
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    // Final frozen FF3 intake verifies 85 sealed files and every initial/deferred chunk.
    expect(record).toMatchObject({ sealedFiles: 85, sealedBytes: 11_519_818, packJsonSha256: '6ce49d05791bf42d21f3628237a5cf005ce9f2fa15938f0c321430d781c2c5d4' });
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256, record.runtime.sha256, record.runtime.modulesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(record.runtime).toMatchObject({ kind: 'frame', file: 'index-Y86dU6mu.js', bytes: 1_705_082, gzipBytes: 517_258, initialLoad: { bytes: 1_527_808, gzipBytes: 446_414 } });
    expect(checkCeiling('foundry-floor', record.runtime).within).toBe(true);
    expect(foundryFloorScene.assetBase).toBe(record.base);
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'foundry-floor', 'ff3-review2'));
  });

  test.each(['farm', 'golden-gate', 'foundry-floor'])('the %s scene page stays out of search results whatever its availability says', async (id) => {
    const page = await readFile(new URL(`../src/pages/scenes/${id}.astro`, import.meta.url), 'utf8');
    expect(page).toMatch(/^\s*noindex\s*$/m);
    expect(page).toMatch(/^\s*nofollow\s*$/m);
    expect(page).not.toContain('noindex={');
  });
});
