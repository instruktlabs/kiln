import { expect, test } from 'bun:test';
import { compareLuminanceImages, compareParityImages } from '../parity-images';

function solid(value: number, width = 16, height = 9) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255; }
  return { width, height, data };
}
test('linear luminance metric uses sRGB decoding and exact 16 by 9 tiles', () => {
  const black = solid(0), gray = solid(128), result = compareLuminanceImages(black, black, gray);
  expect(result.globalMean).toBeCloseTo(((128 / 255 + .055) / 1.055) ** 2.4, 12);
  expect(result.tiles).toHaveLength(144); expect(result.tiles.every(tile => tile.noise === 0 && tile.threshold === .02)).toBe(true);
  expect(result.passingTiles).toBe(0); expect(result.pass).toBe(false);
  const identical = compareLuminanceImages(gray, gray, gray);
  expect(identical.globalMean).toBe(0); expect(identical.passingTiles).toBe(144); expect(identical.pass).toBe(true);
});
test('four failing tiles pass the 97 percent rule while five fail, without relaxing the global mean', () => {
  const black = solid(0), changed = solid(0);
  for (let p = 0; p < 4; p++) for (let channel = 0; channel < 3; channel++) changed.data[p * 4 + channel] = 46;
  const four = compareLuminanceImages(black, black, changed);
  expect(four.passingTiles).toBe(140); expect(four.globalMean).toBeLessThan(.02); expect(four.pass).toBe(true);
  for (let channel = 0; channel < 3; channel++) changed.data[4 * 4 + channel] = 46;
  const five = compareLuminanceImages(black, black, changed);
  expect(five.passingTiles).toBe(139); expect(five.pass).toBe(false);
  expect(compareLuminanceImages(solid(0), solid(255), solid(46)).pass).toBe(false);
});
test('each noise floor is local and the diff image retains absolute luminance differences', () => {
  const a = solid(0), b = solid(0), rewrite = solid(0);
  for (let c = 0; c < 3; c++) { b.data[c] = 20; rewrite.data[c] = 39; rewrite.data[4 + c] = 39; }
  const result = compareLuminanceImages(a, b, rewrite);
  expect(result.tiles[0]!.threshold).toBeCloseTo(result.tiles[0]!.noise * 3, 12);
  expect(result.tiles[0]!.pass).toBe(true); expect(result.tiles[1]!.pass).toBe(false);
  expect(result.diff.data[3]).toBe(255); expect(result.diff.data[0]).toBeGreaterThan(0);
  expect(result.diff.width).toBe(16); expect(result.diff.height).toBe(9);
});
test('invalid dimensions and non-opaque inputs fail rather than producing misleading scores', () => {
  const opaque = solid(0), transparent = solid(0); transparent.data[3] = 0;
  expect(() => compareLuminanceImages(opaque, solid(0, 32, 9), opaque)).toThrow(/dimensions/);
  expect(() => compareLuminanceImages(opaque, opaque, transparent)).toThrow(/opaque/);
  expect(() => compareLuminanceImages(solid(0, 1, 1), solid(0, 1, 1), solid(0, 1, 1))).toThrow(/16.*9/);
});

test('D18 catches thin changes hidden by tile means and allows exactly 100 pixels beyond repeat noise', () => {
  const original = solid(0, 1280, 720), repeat = solid(0, 1280, 720), changed = solid(0, 1280, 720);
  // Spread changes through one row; their tile means stay well below the luminance limit.
  for (let p = 0; p < 121; p++) changed.data[p * 4] = 33;
  for (let p = 0; p < 20; p++) repeat.data[p * 4 + 2] = 33;
  const over = compareParityImages(original, repeat, changed);
  expect(over.luminancePass).toBe(true);
  expect(over.lines).toEqual({ over32: 121, noise: 20, budget: 100, pass: false });
  expect(over.pass).toBe(false);
  changed.data[120 * 4] = 32;
  const boundary = compareParityImages(original, repeat, changed);
  expect(boundary.lines.over32).toBe(120);
  expect(boundary.pass).toBe(true);
});

test('D18 configurable budget is an explicit finite nonnegative integer, and never replaces the luminance gate', () => {
  const original = solid(0), changed = solid(0);
  changed.data[0] = 33;
  expect(compareParityImages(original, original, changed, { over32Budget: 0 }).pass).toBe(false);
  expect(compareParityImages(original, original, changed, { over32Budget: 1 }).pass).toBe(true);
  expect(compareParityImages(original, solid(255), solid(46), { over32Budget: 1000 }).pass).toBe(false);
  for (const over32Budget of [-1, .5, NaN, Infinity]) {
    expect(() => compareParityImages(original, original, original, { over32Budget })).toThrow(/budget/i);
  }
});

test('a crop cannot silently inherit the adopted full-view thin-line budget', () => {
  const crop = solid(0, 640, 252);
  expect(() => { compareParityImages(crop, crop, crop); }).toThrow(/explicit.*budget|full.*view/i);
  expect(compareParityImages(crop, crop, crop, { over32Budget: 5 })).toMatchObject({ scope: 'custom-budget', lines: { budget: 5 }, pass: true });
  const full = solid(0, 1280, 720);
  expect(compareParityImages(full, full, full)).toMatchObject({ scope: 'b06-d18', lines: { budget: 100 }, pass: true });
});

test('luminance-only crop diagnostics retain their historical tile gate without claiming D18', async () => {
  const { compareLuminanceImages } = await import('../parity-images');
  const crop = solid(0, 640, 252), changed = solid(0, 640, 252);
  for (let p = 0; p < 101; p++) changed.data[p * 4] = 33;
  const result = compareLuminanceImages(crop, crop, changed);
  expect(result).toMatchObject({ scope: 'luminance-only', pass: true, luminancePass: true });
  expect('lines' in result).toBe(false);
  expect(compareParityImages(crop, crop, changed, { over32Budget: 100 }).pass).toBe(false);
});
