export interface RgbaImage { width: number; height: number; data: Uint8Array }
export interface ParityTile { x: number; y: number; pixels: number; noise: number; mean: number; threshold: number; pass: boolean }
const linear = Float64Array.from({ length: 256 }, (_, n) => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
const luminance = (data: Uint8Array, i: number) => .2126 * linear[data[i]!]! + .7152 * linear[data[i + 1]!]! + .0722 * linear[data[i + 2]!]!;
/** SPEC 19: fixed thresholds; raw old-old noise is reported and never used to alter the global gate. */
export function compareParityImages(pilot: RgbaImage, repeat: RgbaImage, rewrite: RgbaImage) {
  const { width, height } = pilot;
  if (width < 16 || height < 9 || width % 16 || height % 9) throw new Error('Image dimensions must partition into 16 by 9 equal tiles');
  for (const image of [pilot, repeat, rewrite]) if (image.width !== width || image.height !== height || image.data.length !== width * height * 4) throw new Error('Image dimensions differ');
  const counts = new Uint32Array(144), noise = new Float64Array(144), differences = new Float64Array(144), diff = new Uint8Array(width * height * 4);
  let sum = 0, noiseSum = 0;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    if (pilot.data[i + 3] !== 255 || repeat.data[i + 3] !== 255 || rewrite.data[i + 3] !== 255) throw new Error('Parity inputs must be opaque');
    const a = luminance(pilot.data, i), oldDelta = Math.abs(a - luminance(repeat.data, i)), delta = Math.abs(a - luminance(rewrite.data, i));
    const x = pixel % width, y = Math.floor(pixel / width), tile = Math.floor(y * 9 / height) * 16 + Math.floor(x * 16 / width);
    counts[tile]++; noise[tile] += oldDelta; differences[tile] += delta; sum += delta; noiseSum += oldDelta;
    // Fourfold gain is only a visual aid; all metrics use unamplified linear luminance.
    diff[i] = diff[i + 1] = diff[i + 2] = Math.min(255, Math.round(delta * 255 * 4)); diff[i + 3] = 255;
  }
  const tiles: ParityTile[] = Array.from(counts, (pixels, n) => {
    const oldNoise = noise[n]! / pixels, mean = differences[n]! / pixels, threshold = Math.max(3 * oldNoise, .02);
    return { x: n % 16, y: Math.floor(n / 16), pixels, noise: oldNoise, mean, threshold, pass: mean <= threshold };
  });
  const passingTiles = tiles.filter(tile => tile.pass).length, passingFraction = passingTiles / tiles.length, globalMean = sum / (width * height);
  return { width, height, globalMean, noiseGlobalMean: noiseSum / (width * height), passingTiles, passingFraction,
    pass: passingFraction >= .97 && globalMean < .02, tiles, diff: { width, height, data: diff } };
}
