export interface RgbaImage { width: number; height: number; data: Uint8Array }
export interface ParityTile { x: number; y: number; pixels: number; noise: number; mean: number; threshold: number; pass: boolean }
const linear = Float64Array.from({ length: 256 }, (_, n) => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
const luminance = (data: Uint8Array, i: number) => .2126 * linear[data[i]!]! + .7152 * linear[data[i + 1]!]! + .0722 * linear[data[i + 2]!]!;
function measureImages(pilot: RgbaImage, repeat: RgbaImage, rewrite: RgbaImage) {
  const { width, height } = pilot;
  if (width < 16 || height < 9 || width % 16 || height % 9) throw new Error('Image dimensions must partition into 16 by 9 equal tiles');
  for (const image of [pilot, repeat, rewrite]) if (image.width !== width || image.height !== height || image.data.length !== width * height * 4) throw new Error('Image dimensions differ');
  const counts = new Uint32Array(144), noise = new Float64Array(144), differences = new Float64Array(144), diff = new Uint8Array(width * height * 4);
  let sum = 0, noiseSum = 0, over32 = 0, noiseOver32 = 0;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    if (pilot.data[i + 3] !== 255 || repeat.data[i + 3] !== 255 || rewrite.data[i + 3] !== 255) throw new Error('Parity inputs must be opaque');
    const a = luminance(pilot.data, i), oldDelta = Math.abs(a - luminance(repeat.data, i)), delta = Math.abs(a - luminance(rewrite.data, i));
    let channelDelta = 0, repeatDelta = 0;
    for (let c = 0; c < 3; c++) {
      channelDelta = Math.max(channelDelta, Math.abs(pilot.data[i + c]! - rewrite.data[i + c]!));
      repeatDelta = Math.max(repeatDelta, Math.abs(pilot.data[i + c]! - repeat.data[i + c]!));
    }
    if (channelDelta > 32) over32++;
    if (repeatDelta > 32) noiseOver32++;
    const x = pixel % width, y = Math.floor(pixel / width), tile = Math.floor(y * 9 / height) * 16 + Math.floor(x * 16 / width);
    counts[tile]++; noise[tile] += oldDelta; differences[tile] += delta; sum += delta; noiseSum += oldDelta;
    // Fourfold gain is only a visual aid. Tile/global means use unamplified linear luminance;
    // the thin-line count above uses the adopted >32 sRGB-channel difference.
    diff[i] = diff[i + 1] = diff[i + 2] = Math.min(255, Math.round(delta * 255 * 4)); diff[i + 3] = 255;
  }
  const tiles: ParityTile[] = Array.from(counts, (pixels, n) => {
    const oldNoise = noise[n]! / pixels, mean = differences[n]! / pixels, threshold = Math.max(3 * oldNoise, .02);
    return { x: n % 16, y: Math.floor(n / 16), pixels, noise: oldNoise, mean, threshold, pass: mean <= threshold };
  });
  const passingTiles = tiles.filter(tile => tile.pass).length, passingFraction = passingTiles / tiles.length, globalMean = sum / (width * height);
  const luminancePass = passingFraction >= .97 && globalMean < .02;
  return { width, height, globalMean, noiseGlobalMean: noiseSum / (width * height), passingTiles, passingFraction,
    luminancePass, over32, noiseOver32, tiles, diff: { width, height, data: diff } };
}

/** SPEC 19 + D18: fixed luminance thresholds AND a thin-line budget beyond repeat noise.
 * The adopted default is 100 pixels per 1280×720 full view. Other sizes require an explicit
 * custom budget, or compareLuminanceImages for the original crop diagnostic. No area scaling.
 */
export function compareParityImages(pilot: RgbaImage, repeat: RgbaImage, rewrite: RgbaImage, options: { over32Budget?: number } = {}) {
  const fullView = pilot.width === 1280 && pilot.height === 720;
  if (!fullView && options.over32Budget === undefined) throw new Error('Non-full-view parity requires an explicit thin-line budget or compareLuminanceImages');
  const budget = options.over32Budget ?? 100;
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Thin-line budget must be a finite nonnegative integer');
  const { over32, noiseOver32, ...metric } = measureImages(pilot, repeat, rewrite);
  const lines = { over32, noise: noiseOver32, budget, pass: over32 <= noiseOver32 + budget };
  return { ...metric, scope: fullView && budget === 100 ? 'b06-d18' as const : 'custom-budget' as const, pass: metric.luminancePass && lines.pass, lines };
}

/** Original SPEC 19 tile/global luminance comparison, for explicit crop or historical diagnostics.
 * `pass` applies only to this scope; it never grants full-view D18 qualification.
 */
export function compareLuminanceImages(pilot: RgbaImage, repeat: RgbaImage, rewrite: RgbaImage) {
  const { over32: _over32, noiseOver32: _noiseOver32, ...metric } = measureImages(pilot, repeat, rewrite);
  return { ...metric, scope: 'luminance-only' as const, pass: metric.luminancePass };
}
