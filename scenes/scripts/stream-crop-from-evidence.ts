// SPEC 19.7 stream crop at the mill bank, computed from an existing parity run's retained watermill-wheel
// captures (no new capture). Same tile metric and thresholds as B-06, on the crop only.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { cropImage } from './capture-woodland-ab';
import { STREAM_CROP } from './capture-farm-parity';
import { compareParityImages, type RgbaImage } from './parity-images';

const workspace = resolve(import.meta.dir, '..'), run = process.argv[2];
if (!run || !/^[a-z0-9-]+$/.test(run)) throw new Error('Usage: stream-crop-from-evidence.ts <parity run directory under evidence/parity>');
const root = resolve(workspace, 'evidence/parity', run), out = resolve(root, 'stream-crop'); await mkdir(out, { recursive: true });
const read = async (file: string): Promise<RgbaImage> => { const png = PNG.sync.read(await readFile(file)); return { width: png.width, height: png.height, data: new Uint8Array(png.data) }; };
const write = (name: string, image: RgbaImage) => writeFile(resolve(out, name), PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }));
const results = [];
for (const backend of ['webgpu', 'webgl2']) {
  const dir = resolve(root, `watermill-wheel-${backend}`), attempts = (await readdir(dir)).filter(name => /^attempt-\d+$/.test(name)).sort();
  const attempt = attempts.at(-1)!, base = resolve(dir, attempt);
  const [pilot, repeat, rewrite] = await Promise.all(['pilot', 'pilot-repeat', 'new'].map(kind => read(resolve(base, `watermill-wheel-${kind}-${backend}.png`))));
  const a = cropImage(pilot!, STREAM_CROP), b = cropImage(repeat!, STREAM_CROP), c = cropImage(rewrite!, STREAM_CROP), metric = compareParityImages(a, b, c);
  await write(`stream-crop-pilot-${backend}.png`, a); await write(`stream-crop-pilot-repeat-${backend}.png`, b); await write(`stream-crop-new-${backend}.png`, c); await write(`stream-crop-diff-${backend}.png`, metric.diff);
  const { diff: _diff, tiles, ...numbers } = metric;
  results.push({ backend, source: `evidence/parity/${run}/watermill-wheel-${backend}/${attempt}`, ...numbers, failingTiles: tiles.filter(tile => !tile.pass) });
}
const summary = { id: 'B-06 extra (SPEC 19.7)', subject: 'Stream crop at the mill bank', run, rectangle: STREAM_CROP,
  rule: 'Crop of the 1280 by 720 watermill-wheel captures; 16 by 9 tiles of 40 by 28 px; tile threshold max(3 x old-old noise, .02); pass at >= 97% tiles and global mean < .02',
  note: 'Computed from retained captures; the rewrite was frozen at time 0 and the pilot ran its own clock (SPEC 19.4), so stream phase differences are bounded by the pilot old-old noise',
  pass: results.every(result => result.pass), results };
await writeFile(resolve(out, 'stream-crop.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ pass: summary.pass, results: results.map(({ backend, passingTiles, globalMean, noiseGlobalMean, pass }) => ({ backend, passingTiles, globalMean, noiseGlobalMean, pass })) }));
