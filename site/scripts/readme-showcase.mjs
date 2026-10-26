import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fetchPinnedFile, hashBytes } from './mirror-core.mjs';

// Regenerate README stills from the same hash-verified captures used by the site.
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async (path) => JSON.parse(await readFile(resolve(site, path), 'utf8'));
const curation = await json('src/data/site-curation.json');
const shots = await json('src/data/holodeck-shots.json');
const worlds = await json('src/data/holodeck-worlds.json');
const mirror = await json('src/data/mirror-manifest.json');
const output = resolve(site, '../assets/readme');
await mkdir(output, { recursive: true });
const images = [];
for (const id of curation.featuredWorlds) {
  const shot = shots.packs[id][1];
  const pin = mirror.files.find((file) => file.path === shot.inputPath);
  if (!pin || pin.sha256 !== shot.sha256) throw new Error(`Missing scene capture pin: ${id}`);
  const input = await fetchPinnedFile(pin, {
    mirror: process.env.KILN_ASSET_MIRROR,
    cache: resolve(site, '.cache/readme-showcase'),
    base: mirror.base,
  });
  const { data, info } = await sharp(input).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const file = `${worlds.worlds[id]}.webp`;
  await writeFile(resolve(output, file), data);
  images.push({ file, alt: shot.alt, world: shot.capture.world, view: shot.view, inputPath: pin.path, inputSha256: pin.sha256, sha256: hashBytes(data), width: info.width, height: info.height });
}
await writeFile(resolve(output, 'holodeck-showcase.json'), `${JSON.stringify({ images }, null, 2)}\n`);
console.log(`Wrote ${images.length} README scene images and their provenance.`);
