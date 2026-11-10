import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { assetPath, fetchPinnedFile, hashBytes, verifyBytes } from './mirror-core.mjs';
import { resolveScenesDir } from './scene-source.mjs';
import {decodeUtf8} from './public-text.mjs';
import {isPublicTextFile} from './validate-public-text.mjs';

const SITE = resolve(import.meta.dirname, '..');
export const SCENE_INPUT_IDS = ['farm', 'golden-gate', 'foundry-floor', 'cathedral-square'];

export function checkedSceneArchive(bytes, record) {
  verifyBytes(bytes, record);
  const files = unzipSync(bytes);
  for (const [path,content] of Object.entries(files)) {
    assetPath(path);
    if (isPublicTextFile(path)) decodeUtf8(content, `Scene archive ${record.path}: ${path}`);
  }
  if (record.packJsonSha256) {
    const bytes = files['assets/pack.json'];
    if (!bytes || hashBytes(bytes) !== record.packJsonSha256) throw new Error(`Scene archive ${record.path}: embedded pack hash mismatch`);
    const pack = JSON.parse(decodeUtf8(bytes, `${record.path}: assets/pack.json`));
    if (pack.id !== record.id) throw new Error(`Scene archive ${record.path}: pack id mismatch`);
    if (pack.release !== record.release) throw new Error(`Scene archive ${record.path}: pack release mismatch`);
  }
  return files;
}

/** Restore the reviewed, sealed scene inputs without requiring an author's private workspace. */
export async function stageSceneInputs({ site = SITE, env = process.env, only } = {}) {
  if (['0', 'false'].includes(env.KILN_SITE_PACKS ?? '1')) return;
  const scenes = resolveScenesDir({ site, env });
  if (!scenes) throw new Error('Production scene inputs require the repository scenes/ source');
  const manifest = JSON.parse(await readFile(join(site, 'src/data/scene-inputs.json'), 'utf8'));
  if (only && (!SCENE_INPUT_IDS.includes(only) || !manifest.files.some(record => record.id === only))) throw new Error(`Unknown scene input: ${only}`);
  for (const record of manifest.files) {
    if (!SCENE_INPUT_IDS.includes(record.id)) throw new Error(`Unknown scene input: ${record.id}`);
    if (only && record.id !== only) continue;
    const archive = await fetchPinnedFile(record, { mirror: env.KILN_ASSET_MIRROR, cache: join(site, '.cache/scene-inputs'), base: manifest.base });
    const files = checkedSceneArchive(await readFile(archive), record);
    const target = join(scenes, '.cache/site-inputs', record.id, 'standalone');
    // Fixed scene IDs and a fixed generated directory keep removal inside this workspace.
    await rm(target, { recursive: true, force: true });
    for (const [path, bytes] of Object.entries(files)) {
      if (path.endsWith('/')) continue;
      await mkdir(dirname(join(target, path)), { recursive: true });
      await writeFile(join(target, path), bytes);
    }
    console.log(`Scene inputs: ${record.id}/${record.release}, SHA-256 verified.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--scene');
  if (index >= 0 && !process.argv[index + 1]) throw new Error('--scene requires a scene id');
  await stageSceneInputs({ only: index >= 0 ? process.argv[index + 1] : undefined });
}
