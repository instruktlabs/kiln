import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compileProceduralTextureSpecV3 } from '../procedural-texture-v3';
import type { ProceduralShapeV3 } from '../procedural-texture-v3';

const base = { schemaVersion: 3, width: 4, height: 4, operations: [] };
const grid = (data: Uint8Array, channel: number) =>
  Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => data[(y * 4 + x) * 4 + channel]!).join(','),
  );
describe('V3 deliberate palette and seeded periodic controls', () => {
  test('nearest palette mapping preserves alpha, transparent black and first-index ties', () => {
    const { pixels } = compileProceduralTextureSpecV3({
      ...base,
      background: [10, 0, 0, 128],
      palette: { colors: [0, 0x140000] },
    });
    expect(Array.from(pixels.slice(0, 4))).toEqual([0, 0, 0, 128]);
    expect(
      Array.from(
        compileProceduralTextureSpecV3({
          ...base,
          background: [10, 0, 0, 0],
          palette: { colors: [0xffffff] },
        }).pixels.slice(0, 4),
      ),
    ).toEqual([0, 0, 0, 0]);
  });
  test('fixed Bayer4 matrix gives an exact repeating membership fixture', () => {
    const { pixels } = compileProceduralTextureSpecV3({
      ...base,
      background: [128, 128, 128, 128],
      palette: { colors: [0, 0xffffff], dither: 'bayer4' },
    });
    expect(grid(pixels, 0)).toEqual(['0,255,0,255', '255,0,255,0', '0,255,0,255', '255,0,255,0']);
    expect(new Set(grid(pixels, 3))).toEqual(new Set(['128,128,128,128']));
    const repeated = compileProceduralTextureSpecV3({
      ...base,
      width: 8,
      background: [128, 128, 128, 128],
      palette: { colors: [0, 0xffffff], dither: 'bayer4' },
    }).pixels;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expect(repeated[(y * 8 + x) * 4]).toBe(repeated[(y * 8 + x + 4) * 4]);
  });
  test('explicit periodic stamps cross both tile edges exactly once', () => {
    const stamp = {
      op: 'stamps',
      shape: { kind: 'rectangle', x: 0, y: 0, width: 2, height: 2 },
      rgba: [255, 0, 0, 128],
      count: 1,
      seed: 10,
      area: { x: 3, y: 3, width: 1, height: 1 },
    };
    const periodic = compileProceduralTextureSpecV3({
      ...base,
      operations: [{ ...stamp, periodic: true }],
    });
    expect(grid(periodic.pixels, 3)).toEqual(['128,0,0,128', '0,0,0,0', '0,0,0,0', '128,0,0,128']);
    expect(
      grid(compileProceduralTextureSpecV3({ ...base, operations: [stamp] }).pixels, 3),
    ).toEqual(['0,0,0,0', '0,0,0,0', '0,0,0,0', '0,0,0,128']);
    // Same placement shifted by whole periods produces identical pixels.
    expect(
      compileProceduralTextureSpecV3({
        ...base,
        operations: [{ ...stamp, periodic: true, area: { x: -5, y: 11, width: 1, height: 1 } }],
      }).pixels,
    ).toEqual(periodic.pixels);
  });
  test('seeded placement is repeatable, seed changes bytes and order remains explicit', () => {
    const recipe = {
      ...base,
      operations: [
        {
          op: 'stamps',
          shape: { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
          rgba: [10, 20, 30, 255],
          count: 5,
          seed: 123,
          area: { x: 0, y: 0, width: 4, height: 4 },
        },
      ],
    };
    const a = compileProceduralTextureSpecV3(recipe);
    const b = compileProceduralTextureSpecV3(recipe);
    expect(b.pixels).toEqual(a.pixels);
    expect(b.recipeHash).toBe(a.recipeHash);
    expect(
      compileProceduralTextureSpecV3({
        ...recipe,
        operations: [{ ...recipe.operations[0], seed: 124 }],
      }).pixels,
    ).not.toEqual(a.pixels);
    // Independently calculated Xorshift32 placements: (1,0),(0,0),(1,1),(3,2),(1,0).
    expect(createHash('sha256').update(a.pixels).digest('hex')).toBe(
      'd4a1fd40d6c8b008b783fb81c813dfc64f1cbc6657b59159ca85c8048222cee3',
    );
  });
  test('periodic ellipse, polygon and line copies match a toroidal reference at every pixel', () => {
    const shapes: ProceduralShapeV3[] = [
      { kind: 'ellipse', x: 0, y: 0, width: 3, height: 3 },
      {
        kind: 'polygon',
        points: [
          [0, 0],
          [3, 0],
          [0, 3],
        ],
      },
      { kind: 'line', from: [0, 0], to: [2, 2], width: 1 },
    ];
    for (const shape of shapes) {
      // Rasterize one stamp in a large clipped domain, independently fold covered pixels.
      const expanded = compileProceduralTextureSpecV3({
        ...base,
        width: 12,
        height: 12,
        operations: [
          {
            op: 'stamps',
            shape,
            rgba: [1, 2, 3, 128],
            count: 1,
            seed: 1,
            area: { x: 7, y: 7, width: 1, height: 1 },
          },
        ],
      });
      const expected = new Uint8Array(64);
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 12; x++) {
          if (expanded.pixels[(y * 12 + x) * 4 + 3])
            expected.set([1, 2, 3, 128], ((y % 4) * 4 + (x % 4)) * 4);
        }
      const periodic = compileProceduralTextureSpecV3({
        ...base,
        operations: [
          {
            op: 'stamps',
            shape,
            rgba: [1, 2, 3, 128],
            count: 1,
            seed: 1,
            area: { x: 3, y: 3, width: 1, height: 1 },
            periodic: true,
          },
        ],
      });
      expect(periodic.pixels).toEqual(expected);
    }
  });
  test('the salted-zero seed uses an explicit nonzero fallback stream', () => {
    const { pixels } = compileProceduralTextureSpecV3({
      ...base,
      operations: [
        {
          op: 'stamps',
          shape: { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
          rgba: [1, 2, 3, 255],
          count: 5,
          seed: 0xa3c59ac3,
          area: { x: 0, y: 0, width: 4, height: 4 },
        },
      ],
    });
    // Independent placements: (3,1),(0,1),(0,3),(0,3),(2,2).
    expect(grid(pixels, 3)).toEqual(['0,0,0,0', '255,0,0,255', '0,0,255,0', '255,0,0,0']);
  });
});
