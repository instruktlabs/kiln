import { expect, test } from 'bun:test';
import { compareParityImages } from '../parity-images';

function solid(value: number, width = 16, height = 9) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255; }
  return { width, height, data };
}
test('linear luminance metric uses sRGB decoding and exact 16 by 9 tiles', () => {
  const black = solid(0), gray = solid(128), result = compareParityImages(black, black, gray);
  expect(result.globalMean).toBeCloseTo(((128 / 255 + .055) / 1.055) ** 2.4, 12);
  expect(result.tiles).toHaveLength(144); expect(result.tiles.every(tile => tile.noise === 0 && tile.threshold === .02)).toBe(true);
  expect(result.passingTiles).toBe(0); expect(result.pass).toBe(false);
  const identical = compareParityImages(gray, gray, gray);
  expect(identical.globalMean).toBe(0); expect(identical.passingTiles).toBe(144); expect(identical.pass).toBe(true);
});
test('four failing tiles pass the 97 percent rule while five fail, without relaxing the global mean', () => {
  const black = solid(0), changed = solid(0);
  for (let p = 0; p < 4; p++) for (let channel = 0; channel < 3; channel++) changed.data[p * 4 + channel] = 46;
  const four = compareParityImages(black, black, changed);
  expect(four.passingTiles).toBe(140); expect(four.globalMean).toBeLessThan(.02); expect(four.pass).toBe(true);
  for (let channel = 0; channel < 3; channel++) changed.data[4 * 4 + channel] = 46;
  const five = compareParityImages(black, black, changed);
  expect(five.passingTiles).toBe(139); expect(five.pass).toBe(false);
  expect(compareParityImages(solid(0), solid(255), solid(46)).pass).toBe(false);
});
test('each noise floor is local and the diff image retains absolute luminance differences', () => {
  const a = solid(0), b = solid(0), rewrite = solid(0);
  for (let c = 0; c < 3; c++) { b.data[c] = 20; rewrite.data[c] = 39; rewrite.data[4 + c] = 39; }
  const result = compareParityImages(a, b, rewrite);
  expect(result.tiles[0]!.threshold).toBeCloseTo(result.tiles[0]!.noise * 3, 12);
  expect(result.tiles[0]!.pass).toBe(true); expect(result.tiles[1]!.pass).toBe(false);
  expect(result.diff.data[3]).toBe(255); expect(result.diff.data[0]).toBeGreaterThan(0);
  expect(result.diff.width).toBe(16); expect(result.diff.height).toBe(9);
});
test('invalid dimensions and non-opaque inputs fail rather than producing misleading scores', () => {
  const opaque = solid(0), transparent = solid(0); transparent.data[3] = 0;
  expect(() => compareParityImages(opaque, solid(0, 32, 9), opaque)).toThrow(/dimensions/);
  expect(() => compareParityImages(opaque, opaque, transparent)).toThrow(/opaque/);
  expect(() => compareParityImages(solid(0, 1, 1), solid(0, 1, 1), solid(0, 1, 1))).toThrow(/16.*9/);
});
