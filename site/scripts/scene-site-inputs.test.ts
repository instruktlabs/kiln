import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { SITE_INPUT_SCENES, sceneInputArchive, stageSceneSiteInputs } from './stage-scene-site-inputs.mjs';
import { cathedralInputArchive } from './stage-cathedral-site-inputs.mjs';
import { hashBytes } from './mirror-core.mjs';
import { stageSceneInputs } from './scene-inputs.mjs';
import { verifyPack } from './scene-pack.mjs';

const dirs: string[] = [];
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture(id: string, release: string) {
  const root = await mkdtemp(join(tmpdir(), `${id}-input-`)); dirs.push(root);
  const source = join(root, 'source'), model = Buffer.from(`small ${id} GLB fixture`), path = 'models/roof.glb';
  const data = Buffer.from('{"kits":[]}'), dataPath = 'data/kits.json';
  await mkdir(join(source, 'assets/models'), { recursive: true });
  await mkdir(join(source, 'assets/data'), { recursive: true });
  await writeFile(join(source, 'assets', path), model);
  await writeFile(join(source, 'assets', dataPath), data);
  const files = [{ path: dataPath, bytes: data.length, sha256: hashBytes(data) }, { path, bytes: model.length, sha256: hashBytes(model) }];
  await writeFile(join(source, 'assets/pack.json'), JSON.stringify({ schema: 'kiln.scene-pack/1', id, release, three: '0.187.0', models: [{ id: 'roof', path }], data: { kits: dataPath }, files }));
  await writeFile(join(source, 'assets/SHA256SUMS'), files.map(file => `${file.sha256}  ${file.path}\n`).join(''));
  await writeFile(join(source, 'THIRD-PARTY-NOTICES.txt'), 'Fixture notices');
  return { root, source };
}

test('the site input scenes are Cathedral Square and Seed Town, each with its own local mirror', () => {
  expect(Object.keys(SITE_INPUT_SCENES)).toEqual(['cathedral-square', 'seed-town']);
  expect(SITE_INPUT_SCENES['cathedral-square'].mirror).toBe('.localdata/cathedral-release');
  expect(SITE_INPUT_SCENES['seed-town'].mirror).toBe('.localdata/seed-town-release');
  expect(SITE_INPUT_SCENES['seed-town'].source).toBe('../scenes/packages/seed-town/standalone/public');
});

test('the Cathedral entry point packages exactly what the shared staging packages', async () => {
  const { source } = await fixture('cathedral-square', 'cs2');
  const shared = await sceneInputArchive(source, 'cathedral-square'), own = await cathedralInputArchive(source);
  expect(own.record).toEqual(shared.record);
  expect(Buffer.from(own.bytes).equals(Buffer.from(shared.bytes))).toBe(true);
  expect(own.record.path).toBe('scene-inputs/cathedral-square/cs2/cathedral-square.zip');
});

test('portable Seed Town input is deterministic, contains only sealed data and restores to a clean workspace', async () => {
  const { root, source } = await fixture('seed-town', 'st1');
  await writeFile(join(source, 'index.html'), '<html>developer entry</html>');
  const first = await sceneInputArchive(source, 'seed-town'), second = await sceneInputArchive(source, 'seed-town');
  expect(first.record.sha256).toBe(second.record.sha256);
  expect(first.record.path).toBe('scene-inputs/seed-town/st1/seed-town.zip');
  expect(Object.keys(unzipSync(first.bytes)).sort()).toEqual(['THIRD-PARTY-NOTICES.txt', 'assets/SHA256SUMS', 'assets/data/kits.json', 'assets/models/roof.glb', 'assets/pack.json']);
  const site = join(root, 'site'), scenes = join(root, 'scenes'), mirror = join(root, 'mirror');
  await mkdir(join(scenes, 'packages/farm'), { recursive: true });
  await writeFile(join(scenes, 'packages/farm/package.json'), '{}');
  await mkdir(join(site, 'src/data'), { recursive: true });
  const other = { id: 'farm', release: 'r1', path: 'scene-inputs/farm.zip', bytes: 1, sha256: '0'.repeat(64) };
  await writeFile(join(site, 'src/data/scene-inputs.json'), JSON.stringify({ base: 'https://invalid.example/', files: [other] }));
  await writeFile(join(site, 'src/data/scene-packs.json'), JSON.stringify({ farm: { id: 'farm' } }));
  const staged = await stageSceneSiteInputs({ id: 'seed-town', site, source, mirror });
  expect(staged.target).toBe(join(mirror, first.record.path));
  const inputs = JSON.parse(await readFile(join(site, 'src/data/scene-inputs.json'), 'utf8'));
  expect(inputs.files).toEqual([other, first.record]);
  const catalog = JSON.parse(await readFile(join(site, 'src/data/scene-packs.json'), 'utf8'));
  expect(Object.keys(catalog)).toEqual(['farm', 'seed-town']);
  expect(catalog['seed-town']).toMatchObject({ id: 'seed-town', release: 'st1', base: '/scene-packs/seed-town/st1/', source: '.cache/site-inputs/seed-town/standalone', packJsonSha256: first.record.packJsonSha256 });
  // Re-running replaces the scene's own records instead of adding to them.
  await stageSceneSiteInputs({ id: 'seed-town', site, source, mirror });
  expect(JSON.parse(await readFile(join(site, 'src/data/scene-inputs.json'), 'utf8')).files).toEqual([other, first.record]);
  await stageSceneInputs({ site, only: 'seed-town', env: { KILN_ASSET_MIRROR: mirror } });
  const restored = join(scenes, '.cache/site-inputs/seed-town/standalone');
  const inventory = await verifyPack(join(restored, 'assets'), join(restored, 'THIRD-PARTY-NOTICES.txt'));
  expect(inventory.packJsonSha256).toBe(first.record.packJsonSha256);
});

test('staging refuses a pack of another scene, an unknown scene and source corruption', async () => {
  const { source } = await fixture('seed-town', 'st1');
  await expect(sceneInputArchive(source, 'cathedral-square')).rejects.toThrow(/Cathedral Square/);
  await expect(sceneInputArchive(source, 'farm')).rejects.toThrow(/Unknown/);
  await writeFile(join(source, 'assets/models/roof.glb'), 'modified');
  await expect(sceneInputArchive(source, 'seed-town')).rejects.toThrow();
});
