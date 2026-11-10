import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { cathedralInputArchive } from './stage-cathedral-site-inputs.mjs';
import { hashBytes } from './mirror-core.mjs';
import { stageSceneInputs } from './scene-inputs.mjs';
import { verifyPack } from './scene-pack.mjs';

const dirs: string[] = [];
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cathedral-input-')); dirs.push(root);
  const source = join(root, 'source'), model = Buffer.from('small GLB fixture'), path = 'models/cathedral.glb';
  await mkdir(join(source, 'assets/models'), { recursive: true });
  await writeFile(join(source, 'assets', path), model);
  const file = { path, bytes: model.length, sha256: hashBytes(model) };
  await writeFile(join(source, 'assets/pack.json'), JSON.stringify({ schema: 'kiln.scene-pack/1', id: 'cathedral-square', release: 'cs2', three: '0.187.0', models: [{ id: 'cathedral', path }], files: [file] }));
  await writeFile(join(source, 'assets/SHA256SUMS'), `${file.sha256}  ${path}\n`);
  await writeFile(join(source, 'THIRD-PARTY-NOTICES.txt'), 'Fixture notices');
  return { root, source };
}

test('portable Cathedral input is deterministic, contains only sealed data and restores to a clean workspace', async () => {
  const { root, source } = await fixture();
  // A standalone entry is not scene data and must not accidentally enter the portable input.
  await writeFile(join(source, 'index.html'), '<html>developer entry</html>');
  const first = await cathedralInputArchive(source), second = await cathedralInputArchive(source);
  expect(first.record.sha256).toBe(second.record.sha256);
  expect(Object.keys(unzipSync(first.bytes)).sort()).toEqual(['THIRD-PARTY-NOTICES.txt', 'assets/SHA256SUMS', 'assets/models/cathedral.glb', 'assets/pack.json']);
  const site = join(root, 'site'), scenes = join(root, 'scenes'), mirror = join(root, 'mirror');
  await mkdir(join(scenes, 'packages/farm'), { recursive: true });
  await writeFile(join(scenes, 'packages/farm/package.json'), '{}');
  await mkdir(join(site, 'src/data'), { recursive: true });
  await writeFile(join(site, 'src/data/scene-inputs.json'), JSON.stringify({ base: 'https://invalid.example/', files: [first.record] }));
  await mkdir(join(mirror, first.record.path, '..'), { recursive: true });
  await writeFile(join(mirror, first.record.path), first.bytes);
  await stageSceneInputs({ site, only: 'cathedral-square', env: { KILN_ASSET_MIRROR: mirror } });
  const restored = join(scenes, '.cache/site-inputs/cathedral-square/standalone');
  const inventory = await verifyPack(join(restored, 'assets'), join(restored, 'THIRD-PARTY-NOTICES.txt'));
  expect(inventory.packJsonSha256).toBe(first.record.packJsonSha256);
  expect(await readFile(join(restored, 'THIRD-PARTY-NOTICES.txt'), 'utf8')).toBe('Fixture notices');
});

test('portable input refuses source corruption before writing an archive', async () => {
  const { source } = await fixture();
  await writeFile(join(source, 'assets/models/cathedral.glb'), 'modified');
  await expect(cathedralInputArchive(source)).rejects.toThrow();
});

test('portable input refuses private workspace paths even in otherwise verified notices', async () => {
  const { source } = await fixture();
  await writeFile(join(source, 'THIRD-PARTY-NOTICES.txt'), 'Source: C:\\Users\\private-author\\asset-workspace');
  await expect(cathedralInputArchive(source)).rejects.toThrow(/private|path/i);
});
