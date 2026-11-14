import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { imageRecord } from './generate-commons.mjs';
import { pinMirrorFile, readJson, upsertBy, writeJson } from './media-pins.mjs';

/**
 * Record the Seed Town scene page's picture from a capture of the scene's own canvas.
 *
 *   bun scripts/record-seed-town-poster.mjs --file ../scenes/packages/seed-town/review/poster-town.png \
 *       --mirror .localdata/seed-town-release [--seed 2026] [--hour day] [--view town] [--width 2560]
 *
 * The capture comes from `scenes/packages/seed-town/scripts/capture.mjs`, which reads the canvas back at
 * its own pixel size. It is taken larger than it is published and scaled down here, which is the only
 * change made to it. The picture is written to the mirror, pinned in mirror-manifest.json, added to the
 * build's image plan and recorded in scene-media.json with what it shows. Nothing is uploaded.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENE = 'seed-town';
export const SEED_TOWN_POSTER_ALT = 'A small old town of brick and plaster houses round a market square, seen from above, with autumn trees and paved roads leading out across open country.';

export async function recordSeedTownPoster({ file, mirror, seed = '2026', hour = 'day', view = 'town', width = 2560, site = SITE }) {
  const source = await readFile(file);
  const from = await sharp(source).metadata();
  if (!from.width || !from.height || from.width < width) throw new Error(`The capture must be at least ${width} pixels wide; it is ${from.width}`);
  const height = Math.round(width * from.height / from.width);
  const png = await sharp(source).resize(width, height, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  const pack = (await readJson(join(site, 'src/data/scene-packs.json')))[SCENE];
  if (!pack) throw new Error(`No scene pack record for ${SCENE}`);
  const path = `media/scenes/${SCENE}/${pack.release}/${SCENE}-scene-${view}.png`;
  const pin = await pinMirrorFile({ mirror: resolve(site, mirror), manifestFile: join(site, 'src/data/mirror-manifest.json'), path, bytes: png });
  const image = imageRecord(path, width, height, SEED_TOWN_POSTER_ALT);
  const planFile = join(site, 'src/data/commons-build.json');
  const plan = await readJson(planFile);
  await writeJson(planFile, { ...plan, images: upsertBy(plan.images, 'inputPath', image) });
  const mediaFile = join(site, 'src/data/scene-media.json');
  const media = await readJson(mediaFile);
  media[SCENE] = {
    ...media[SCENE],
    poster: image,
    capture: {
      tool: 'scenes/packages/seed-town/scripts/capture.mjs',
      view, seed, hour,
      release: pack.release,
      size: [width, height],
      source: `The scene's canvas read back at ${from.width} by ${from.height} pixels and scaled down; nothing composited or retouched.`,
      packJsonSha256: pack.packJsonSha256,
      pngBytes: pin.bytes,
      pngSha256: pin.sha256,
    },
  };
  await writeJson(mediaFile, media);
  return { path, width, height, bytes: pin.bytes, sha256: pin.sha256 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const option = (flag, fallback) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : fallback);
  const file = option('--file'), mirror = option('--mirror', process.env.KILN_ASSET_MIRROR);
  if (!file || !mirror) throw new Error('Usage: bun scripts/record-seed-town-poster.mjs --file CAPTURE.png --mirror DIR [--seed 2026] [--hour day] [--view town] [--width 2560]');
  console.log(JSON.stringify(await recordSeedTownPoster({ file: resolve(file), mirror, seed: option('--seed', '2026'), hour: option('--hour', 'day'), view: option('--view', 'town'), width: Number(option('--width', '2560')) })));
}
