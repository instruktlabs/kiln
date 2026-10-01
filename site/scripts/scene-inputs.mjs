import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { assetPath, fetchPinnedFile, verifyBytes } from './mirror-core.mjs';
import { resolveScenesDir } from './scene-source.mjs';

const SITE = resolve(import.meta.dirname, '..');

export function checkedSceneArchive(bytes, record) {
  verifyBytes(bytes, record);
  const files = unzipSync(bytes);
  for (const path of Object.keys(files)) assetPath(path);
  return files;
}

/** Restore the reviewed, sealed scene inputs without requiring an author's private workspace. */
export async function stageSceneInputs({ site = SITE, env = process.env } = {}) {
  if (['0', 'false'].includes(env.KILN_SITE_PACKS ?? '1')) return;
  const scenes = resolveScenesDir({ site, env });
  if (!scenes) throw new Error('Production scene inputs require the repository scenes/ source');
  const manifest = JSON.parse(await readFile(join(site, 'src/data/scene-inputs.json'), 'utf8'));
  for (const record of manifest.files) {
    if (!['farm', 'golden-gate', 'foundry-floor'].includes(record.id)) throw new Error(`Unknown scene input: ${record.id}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await stageSceneInputs();
