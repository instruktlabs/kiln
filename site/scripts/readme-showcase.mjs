import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { fetchPinnedFile, hashBytes } from './mirror-core.mjs';

// Regenerate README stills from the same hash-verified captures used by the site.
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async (path) => JSON.parse(await readFile(resolve(site, path), 'utf8'));
/** README choices are explicit and independent of site covers or capture ordering. */
export function selectReadmeShots(selections, shots, sceneMedia = {}) {
  const seen = new Set();
  return selections.map((pick) => {
    if (seen.has(pick.worldId)) throw new Error(`Duplicate README world: ${pick.worldId}`);
    seen.add(pick.worldId);
    let shot = shots.packs[pick.worldId]?.find((shot) => shot.view === pick.view);
    if (!shots.packs[pick.worldId]) {
      const scene = sceneMedia[pick.worldId];
      const source = scene?.capture?.view === pick.view ? scene : scene?.captures?.[pick.view];
      if (source?.poster && source.capture) {
        if (!pick.url) throw new Error(`Missing README scene URL: ${pick.worldId}`);
        shot = { ...source.poster, view: pick.view, sha256: source.capture.pngSha256, capture: {
          ...source.capture, world: pick.url,
          backend: source.capture.renderer?.backend === 'webgpu' ? 'WebGPU' : source.capture.renderer?.backend,
        } };
      }
    }
    if (!shot) throw new Error(`Missing README capture: ${pick.worldId}/${pick.view}`);
    if (!Number.isSafeInteger(pick.width) || pick.width < 320 || pick.width > 1920 || pick.width % 16 !== 0) throw new Error(`Invalid README width: ${pick.worldId}`);
    return { ...pick, shot };
  });
}

async function main() {
  const selections = await json('../assets/readme/selection.json');
  const shots = await json('src/data/holodeck-shots.json');
  const sceneMedia = await json('src/data/scene-media.json');
  const worlds = await json('src/data/holodeck-worlds.json');
  const mirror = await json('src/data/mirror-manifest.json');
  const output = resolve(site, '../assets/readme');
  await mkdir(output, { recursive: true });
  const images = [];
  for (const { worldId: id, shot, width, position = 'centre' } of selectReadmeShots(selections, shots, sceneMedia)) {
    const pin = mirror.files.find((file) => file.path === shot.inputPath);
    if (!pin || pin.sha256 !== shot.sha256) throw new Error(`Missing scene capture pin: ${id}`);
    const input = await fetchPinnedFile(pin, {
      mirror: process.env.KILN_ASSET_MIRROR,
      cache: resolve(site, '.cache/readme-showcase'),
      base: mirror.base,
    });
    const height = width * 9 / 16;
    const { data, info } = await sharp(input).resize({ width, height, fit: 'cover', position, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height) throw new Error(`Capture is too small for the README frame: ${id}`);
    const file = `${worlds.worlds[id] ?? id}.webp`;
    await writeFile(resolve(output, file), data);
    images.push({ file, alt: shot.alt, world: shot.capture.world, view: shot.view, inputPath: pin.path, inputSha256: pin.sha256, sha256: hashBytes(data), width: info.width, height: info.height, framing: { fit: 'cover', position } });
  }
  await writeFile(resolve(output, 'holodeck-showcase.json'), `${JSON.stringify({ images }, null, 2)}\n`);
  console.log(`Wrote ${images.length} README scene images and their provenance.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
