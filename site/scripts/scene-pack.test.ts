import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pkg from '../package.json';
import farm from '../src/data/packs/farm.json';
import { farmScene } from '../src/data/scenes';
import { hashBytes } from './mirror-core.mjs';
import { comparePackRecord, main, packRecord, parseSums, stagePack, stagedPackDirectory, verifyPack } from './scene-pack.mjs';

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

/** A small pack in the standalone layout: assets/{pack.json,SHA256SUMS,...} beside the notices. */
async function fixture() {
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
      id: 'farm',
      release: 'r9',
      three: '0.186.0',
      models: [{ id: 'a', path: 'models/a.glb' }, { id: 'b', path: 'models/b.glb' }],
      data: { layout: 'data/layout.json' },
      files: sealed,
    }),
  );
  await writeFile(join(assets, 'index-abc.js'), 'not part of the pack');
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
  /** A site directory whose catalog holds `record`, beside the pack fixture's root. */
  async function site(root: string, record: unknown) {
    const directory = join(root, 'site');
    await mkdir(join(directory, 'src/data/packs'), { recursive: true });
    await writeFile(join(directory, 'src/data/packs/farm.json'), JSON.stringify({ scene: { available: false, pack: record } }));
    return directory;
  }
  const catalogOf = async (directory: string) => JSON.parse(await readFile(join(directory, 'src/data/packs/farm.json'), 'utf8'));
  const quiet = () => spyOn(console, 'log').mockImplementation(() => {});

  test('without a workspace or pack it skips and clears every pack staged earlier', async () => {
    quiet();
    const { root } = await fixture();
    const directory = await site(root, { base: '/scene-packs/farm/r9/', source: 'packages/farm/dist/r9/standalone' });
    for (const release of ['r8', 'r9']) {
      await mkdir(join(directory, 'public/scene-packs/farm', release), { recursive: true });
      await writeFile(join(directory, 'public/scene-packs/farm', release, 'pack.json'), '{}');
    }
    expect(await main([], { KILN_SITE_SCENES_DIR: 'off' }, directory)).toBeNull();
    expect(existsSync(join(directory, 'public/scene-packs'))).toBe(false);
    expect(await main([], { KILN_SITE_SCENES_DIR: 'off' }, directory)).toBeNull();
  });

  test('stages the pack its record agrees with and refuses one that has drifted', async () => {
    quiet();
    const { root, assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const directory = await site(root, packRecord(inventory));
    const env = { KILN_SITE_SCENES_DIR: 'off', KILN_SITE_SCENE_PACK_DIR: root };
    await mkdir(join(directory, 'public/scene-packs/farm/r8'), { recursive: true });
    await writeFile(join(directory, 'public/scene-packs/farm/r8/pack.json'), '{}');
    const staged = await main([], env, directory);
    expect(staged?.totalBytes).toBe(inventory.totalBytes);
    expect(await readFile(join(directory, 'public/scene-packs/farm/r9/models/a.glb'), 'utf8')).toBe('model a');
    expect(existsSync(join(directory, 'public/scene-packs/farm/r8'))).toBe(false);

    await writeFile(join(directory, 'src/data/packs/farm.json'), JSON.stringify({ scene: { pack: { ...packRecord(inventory), totalBytes: inventory.totalBytes + 1 } } }));
    await expect(main([], env, directory)).rejects.toThrow('disagrees');
  });

  test('--record rewrites the catalog record from the verified pack and stages it', async () => {
    quiet();
    const { root, assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const directory = await site(root, { ...packRecord(inventory), release: 'r8', base: '/scene-packs/farm/r8/', totalBytes: 1 });
    await main(['--record'], { KILN_SITE_SCENES_DIR: 'off', KILN_SITE_SCENE_PACK_DIR: root }, directory);
    const written = await catalogOf(directory);
    expect(written.scene.pack).toEqual(packRecord(inventory));
    expect(written.scene.available).toBe(false);
    expect(existsSync(join(directory, 'public/scene-packs/farm/r9/pack.json'))).toBe(true);
  });
});

describe('scene pack catalog record', () => {
  test('a record built from a verified pack agrees with it, and drift names the field', async () => {
    const { assets, notices } = await fixture();
    const inventory = await verifyPack(assets, notices);
    const record = packRecord(inventory);
    expect(record).toMatchObject({ release: 'r9', base: '/scene-packs/farm/r9/', source: 'packages/farm/dist/r9/standalone' });
    expect(comparePackRecord(record, inventory)).toEqual([]);
    expect(comparePackRecord({ ...record, totalBytes: record.totalBytes + 1 }, inventory)[0]).toContain('totalBytes');
    expect(comparePackRecord({ ...record, release: 'r10' }, inventory)[0]).toContain('release');
    expect(comparePackRecord(undefined, inventory)).toEqual(['farm.json has no scene.pack record']);
  });

  test('the Farm catalog records the pack the site serves', () => {
    const record = farm.scene.pack;
    expect(record.release).toBe('r34');
    expect(record.base).toBe(`/scene-packs/farm/${record.release}/`);
    expect(record.source).toBe(`packages/farm/dist/${record.release}/standalone`);
    expect(record.three).toBe(pkg.dependencies.three);
    expect(record.totalFiles).toBe(record.sealedFiles + 3);
    expect(record.totalBytes).toBeGreaterThan(record.sealedBytes);
    for (const digest of [record.packJsonSha256, record.sha256sumsSha256, record.noticesSha256]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(farmScene.assetBase).toBe(record.base);
    expect(farm.scene.assetBase).toStartWith('https://assets.kilnstudio.tools/packs/farm/');
    expect(stagedPackDirectory(record, '/site')).toBe(resolve('/site', 'public', 'scene-packs', 'farm', 'r34'));
    expect(() => stagedPackDirectory({ base: '/../escape/' }, '/site')).toThrow('Unexpected');
  });

  test('the scene stays out of search results whatever its availability says', async () => {
    const page = await readFile(new URL('../src/pages/scenes/farm.astro', import.meta.url), 'utf8');
    expect(page).toMatch(/^\s*noindex\s*$/m);
    expect(page).toMatch(/^\s*nofollow\s*$/m);
    expect(page).not.toContain('noindex={');
  });
});
