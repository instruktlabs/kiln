import { open } from 'node:fs/promises';

/**
 * The engine note under every 3D view says what the download is (a standard glTF 2.0 file with PBR metallic-roughness
 * materials) and which tone mapping the preview uses. These rules keep it true: the note has to be there, say those
 * things, and agree with the GLB the view actually loads.
 */

/** A page with a 3D view of one GLB: a reviewed asset page, or the page of one earlier example. */
export const isAssetPageRoute = (route) => (/^\/gallery\/[^/]+\/$/.test(route) && !['/gallery/archive/', '/gallery/foundry-floor/'].includes(route)) || /^\/gallery\/(?:archive|foundry-floor)\/[^/]+\/$/.test(route);

/** The claims about the file: glTF 2.0, nothing required of the engine beyond the core, and the core's PBR model. */
export function factsOf(document, container) {
  return {
    container,
    version: document.asset?.version,
    extensionsUsed: [...(document.extensionsUsed ?? [])].sort(),
    extensionsRequired: [...(document.extensionsRequired ?? [])].sort(),
    materials: (document.materials ?? []).length,
  };
}

/** What a GLB says about itself, from its 12-byte header and the JSON chunk that follows; the binary chunk is never read. */
export async function readGlbFacts(file) {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(20);
    const { bytesRead } = await handle.read(head, 0, 20, 0);
    if (bytesRead < 20 || head.toString('latin1', 0, 4) !== 'glTF' || head.toString('latin1', 16, 20) !== 'JSON') throw new Error(`${file} is not a GLB`);
    const json = Buffer.alloc(head.readUInt32LE(12));
    await handle.read(json, 0, json.length, 20);
    return factsOf(JSON.parse(json.toString('utf8')), head.readUInt32LE(4));
  } finally {
    await handle.close();
  }
}

// Extensions that replace the core's metallic-roughness model, which the note would then misdescribe.
const OTHER_SHADING = ['KHR_materials_unlit', 'KHR_materials_pbrSpecularGlossiness'];
const PROMISES = ['glTF 2.0', 'PBR metallic-roughness', 'Review Neutral', 'ACES', 'Linear'];

/**
 * `pages` maps a route to its inspection (`engineNotes`: the text of each note); `facts` maps a route to the facts of
 * the GLB its 3D view loads, or `{ error }` when that file could not be read.
 */
export function engineNoteErrors({ pages, facts }) {
  const errors = [];
  for (const [route, page] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isAssetPageRoute(route)) continue;
    const add = (message) => errors.push({ page: route, message });
    if (page.engineNotes.length !== 1) { add(`Asset page must carry exactly one engine note, found ${page.engineNotes.length}`); continue; }
    const text = page.engineNotes[0];
    for (const phrase of PROMISES) if (!text.includes(phrase)) add(`The engine note does not say "${phrase}"`);
    const model = facts.get(route);
    if (!model) { add('The 3D view names no GLB that the engine note can be checked against'); continue; }
    if (model.error) { add(`The GLB behind the 3D view could not be read: ${model.error}`); continue; }
    if (model.version !== '2.0') add(`The engine note says glTF 2.0 but the GLB declares ${model.version}`);
    for (const name of model.extensionsRequired) add(`The GLB requires ${name}, so it is not plain glTF 2.0 for every engine`);
    for (const name of model.extensionsUsed.filter((used) => OTHER_SHADING.includes(used))) add(`The GLB declares ${name}, which replaces the metallic-roughness model the engine note describes`);
    const declaresLod = model.extensionsUsed.includes('MSFT_lod');
    if (declaresLod && !text.includes('MSFT_lod')) add('The GLB declares MSFT_lod but the engine note does not mention it');
    if (!declaresLod && text.includes('MSFT_lod')) add('The engine note mentions MSFT_lod but the GLB does not declare it');
    for (const name of model.extensionsUsed.filter((used) => used !== 'MSFT_lod' && !OTHER_SHADING.includes(used))) if (!text.includes(name)) add(`The GLB declares ${name}, which the engine note does not mention`);
  }
  return errors;
}
