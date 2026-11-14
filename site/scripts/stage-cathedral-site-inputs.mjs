import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, sceneInputArchive, stageSceneSiteInputs } from './stage-scene-site-inputs.mjs';

/** Cathedral Square's entry point to the shared site input staging (scripts/stage-scene-site-inputs.mjs). */
export function cathedralInputArchive(source) {
  return sceneInputArchive(source, 'cathedral-square');
}

export function stageCathedralSiteInputs({ site, source, mirror } = {}) {
  return stageSceneSiteInputs({ id: 'cathedral-square', ...(site ? { site } : {}), source, mirror });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await main(process.argv.slice(2), { scene: 'cathedral-square' }), null, 2));
}
