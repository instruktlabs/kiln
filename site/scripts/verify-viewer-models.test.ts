import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { drawnFraction } from './verify-viewer-models.mjs';

const BACKDROP = { r: 0xaa, g: 0xb1, b: 0xbc };
const flat = (colour: { r: number; g: number; b: number }, width = 40, height = 20) => sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();

describe('the viewer models gate', () => {
  test('a canvas that shows only the backdrop has drawn nothing', async () => {
    expect(await drawnFraction(await flat(BACKDROP))).toBe(0);
  });

  test('a few levels of difference is not a drawing, a clear difference is', async () => {
    expect(await drawnFraction(await flat({ r: 0xaa + 6, g: 0xb1 - 6, b: 0xbc }))).toBe(0);
    expect(await drawnFraction(await flat({ r: 0xaa + 7, g: 0xb1, b: 0xbc }))).toBe(1);
  });

  test('counts the share of pixels that are solid drawing', async () => {
    const half = await sharp({ create: { width: 40, height: 20, channels: 3, background: BACKDROP } })
      .composite([{ input: await flat({ r: 20, g: 30, b: 40 }, 20, 20), left: 0, top: 0 }])
      .png()
      .toBuffer();
    // 20 of 40 columns differ; the last of them has a neighbour that does not, so 19 columns of 20 rows are solid.
    expect(await drawnFraction(half)).toBeCloseTo((19 * 20) / (40 * 20), 5);
  });

  test('a grid line one or two pixels wide is not a drawing, a shape three pixels wide is', async () => {
    const bar = async (barWidth: number) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background: BACKDROP } })
        .composite([{ input: await flat({ r: 90, g: 96, b: 104 }, barWidth, 20), left: 10, top: 0 }])
        .png()
        .toBuffer();
    expect(await drawnFraction(await bar(1))).toBe(0);
    expect(await drawnFraction(await bar(2))).toBe(0);
    // Only the centre column of a three pixel bar has all its neighbours differing.
    expect(await drawnFraction(await bar(3))).toBeCloseTo(20 / (40 * 20), 5);
  });

  test('the plan it walks holds the 30 reviewed models, each with a byte count and a hash', () => {
    const plan = JSON.parse(readFileSync(new URL('../src/data/commons-build.json', import.meta.url), 'utf8'));
    expect(plan.models.length).toBeGreaterThanOrEqual(30);
    for (const model of plan.models) {
      expect(model.output).toMatch(/^models\/(?:farm|vehicles|standalone)\/[a-z0-9-]+\.glb$/);
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(model.bytes) && model.bytes > 0).toBe(true);
    }
  });
});
