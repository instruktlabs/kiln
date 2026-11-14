import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deterministicZip } from './asset-delivery.mjs';
import { hashBytes } from './mirror-core.mjs';
import { verifyPack, packRecord } from './scene-pack.mjs';
import { checkedSceneArchive } from './scene-inputs.mjs';
import { describeFinding, scanFiles } from './private-data.mjs';

const SITE = resolve(import.meta.dirname, '..');

/**
 * Scenes whose portable site input is made here from a staged standalone pack. `source` (the staged pack) and
 * `mirror` (the local release mirror the ZIP is written into) are relative to `site/`. Nothing is uploaded.
 */
export const SITE_INPUT_SCENES = {
  'cathedral-square': { name: 'Cathedral Square', source: '../scenes/packages/cathedral-square/standalone/public', mirror: '.localdata/cathedral-release' },
  'seed-town': { name: 'Seed Town', source: '../scenes/packages/seed-town/standalone/public', mirror: '.localdata/seed-town-release' },
};

function sceneConfig(id) {
  const config = Object.hasOwn(SITE_INPUT_SCENES, id) ? SITE_INPUT_SCENES[id] : undefined;
  if (!config) throw new Error(`Unknown site input scene: ${id}. Expected ${Object.keys(SITE_INPUT_SCENES).join(' or ')}`);
  return config;
}

/** Package only the verified runtime data, never an author's workspace or unrelated build files. */
export async function sceneInputArchive(source, id) {
  const { name } = sceneConfig(id);
  const inventory = await verifyPack(join(source, 'assets'), join(source, 'THIRD-PARTY-NOTICES.txt'));
  if (inventory.id !== id) throw new Error(`Expected ${name} pack`);
  const scans = await Promise.all([
    scanFiles(join(source, 'assets'), { files: ['pack.json', 'SHA256SUMS', ...inventory.paths] }),
    scanFiles(source, { files: ['THIRD-PARTY-NOTICES.txt'] }),
  ]);
  const findings = scans.flatMap(scan => scan.findings);
  if (findings.length) throw new Error(findings.map(describeFinding).join('\n'));
  const members = {};
  for (const path of ['pack.json', 'SHA256SUMS', ...inventory.paths].sort()) {
    members[`assets/${path}`] = new Uint8Array(await readFile(join(source, 'assets', path)));
  }
  members['THIRD-PARTY-NOTICES.txt'] = new Uint8Array(await readFile(join(source, 'THIRD-PARTY-NOTICES.txt')));
  const bytes = deterministicZip(members);
  const record = { id: inventory.id, release: inventory.release, path: `scene-inputs/${id}/${inventory.release}/${id}.zip`, bytes: bytes.length, sha256: hashBytes(bytes), packJsonSha256: inventory.packJsonSha256 };
  checkedSceneArchive(bytes, record);
  return { bytes, record, inventory };
}

/**
 * Write the scene's deterministic input ZIP into the local mirror and pin it: its record in
 * src/data/scene-inputs.json and its pack record in src/data/scene-packs.json are replaced, other scenes' are kept.
 */
export async function stageSceneSiteInputs({ id, site = SITE, source, mirror } = {}) {
  const config = sceneConfig(id);
  const result = await sceneInputArchive(source ?? resolve(site, config.source), id);
  const target = join(mirror ?? resolve(site, config.mirror), result.record.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, result.bytes);
  const inputsPath = join(site, 'src/data/scene-inputs.json');
  const inputs = JSON.parse(await readFile(inputsPath, 'utf8'));
  inputs.files = [...inputs.files.filter(record => record.id !== result.record.id), result.record];
  await writeFile(inputsPath, `${JSON.stringify(inputs, null, 2)}\n`);
  const catalogPath = join(site, 'src/data/scene-packs.json');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog[result.record.id] = packRecord(result.inventory, { ...catalog[result.record.id], source: `.cache/site-inputs/${id}/standalone` });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { target, ...result.record };
}

/** `--scene <id>` (required unless a scene's own entry point fixes it), optional `--source <staged pack dir>` and `--mirror <dir>`. */
export async function main(argv = process.argv.slice(2), { scene } = {}) {
  const option = flag => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  const id = scene ?? option('--scene');
  if (!id) throw new Error(`--scene is required: ${Object.keys(SITE_INPUT_SCENES).join(' or ')}`);
  const source = option('--source'), mirror = option('--mirror');
  return stageSceneSiteInputs({ id, source: source && resolve(source), mirror: mirror && resolve(mirror) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await main(), null, 2));
}
