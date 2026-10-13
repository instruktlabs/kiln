import { describe, expect, test } from 'bun:test';
import {
  admitProceduralTextureSpecV3,
  canonicalizeProceduralTextureSpecV3,
  canonicalProceduralTextureJsonV3,
  hashProceduralTextureSpecV3,
  type ProceduralOperationV3,
} from '../procedural-texture-v3-contract';
import * as publishedCompiler from '../procedural-texture-v3';
import * as publishedTextures from '../procedural-texture';
import * as publishedPrimitives from '../primitives';

const base = { schemaVersion: 3, width: 4, height: 4, operations: [] };
const rectangle = { kind: 'rectangle' as const, x: 0, y: 0, width: 4, height: 4 };
const legacy = {
  schemaVersion: 2 as const,
  size: 4,
  layers: [{ op: 'solid' as const, color: 0x123456 }],
};

describe('internal V3 admission accounting', () => {
  test('reports exact existing background, paint, mask and polygon work without pixels', () => {
    const fixtures: Array<{ operations: ProceduralOperationV3[]; expectedWork: number }> = [
      { operations: [], expectedWork: 16 },
      { operations: [{ op: 'paint', shape: rectangle, rgba: [1, 2, 3, 255] }], expectedWork: 48 },
      { operations: [{ op: 'mask', shape: rectangle }], expectedWork: 48 },
      {
        operations: [
          {
            op: 'paint',
            shape: {
              kind: 'polygon',
              points: [
                [0, 0],
                [4, 0],
                [0, 4],
              ],
            },
            rgba: [1, 2, 3, 255],
          },
        ],
        expectedWork: 96,
      },
    ];
    for (const fixture of fixtures) {
      const admitted = admitProceduralTextureSpecV3({ ...base, operations: fixture.operations });
      expect(admitted.estimatedWorkUnits).toBe(fixture.expectedWork);
      expect(admitted.conservativePixelAllocationBytes).toBe(64);
      expect(Object.keys(admitted).sort()).toEqual([
        'canonicalJson',
        'conservativePixelAllocationBytes',
        'estimatedWorkUnits',
        'spec',
      ]);
    }
    const clipped = admitProceduralTextureSpecV3({
      ...base,
      operations: [
        { op: 'paint', shape: { ...rectangle, x: -2 }, rgba: [1, 2, 3, 255] },
        { op: 'mask', shape: { ...rectangle, x: 20 } },
      ],
    });
    // Eight clipped paint samples plus a full mask scan, even for an off-image mask.
    expect(clipped.estimatedWorkUnits).toBe(48);
  });
  test('keeps palette, periodic copies and noise octaves in the same work admission', () => {
    const palette = admitProceduralTextureSpecV3({
      ...base,
      palette: { colors: [0, 0xffffff], dither: 'bayer4' },
    });
    expect(palette.estimatedWorkUnits).toBe(64);
    const stamp = {
      op: 'stamps',
      shape: { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
      rgba: [1, 2, 3, 255],
      count: 2,
      seed: 1,
      area: { x: 0, y: 0, width: 4, height: 4 },
    };
    expect(admitProceduralTextureSpecV3({ ...base, operations: [stamp] }).estimatedWorkUnits).toBe(
      32,
    );
    expect(
      admitProceduralTextureSpecV3({ ...base, operations: [{ ...stamp, periodic: true }] })
        .estimatedWorkUnits,
    ).toBe(160);
    const noise = admitProceduralTextureSpecV3({
      ...base,
      operations: [
        {
          op: 'legacy-v2',
          spec: { ...legacy, layers: [{ op: 'noise', colorA: 0, colorB: 0xffffff, octaves: 2 }] },
        },
      ],
    });
    expect(noise.estimatedWorkUnits).toBe(544);
    expect(noise.conservativePixelAllocationBytes).toBe(128);
  });
  test('counts every historical legacy output allocation rather than a live-peak maximum', () => {
    const twice = admitProceduralTextureSpecV3({
      ...base,
      operations: [
        { op: 'legacy-v2', spec: legacy },
        { op: 'legacy-v2', spec: legacy },
      ],
    });
    expect(twice.conservativePixelAllocationBytes).toBe(192);
    expect(twice.estimatedWorkUnits).toBe(176);
    const largeLegacy = { ...legacy, size: 1024 };
    const operations = Array.from({ length: 12 }, () => ({ op: 'legacy-v2', spec: largeLegacy }));
    const admitted = admitProceduralTextureSpecV3({
      ...base,
      width: 1024,
      height: 1024,
      operations,
    });
    expect(admitted.estimatedWorkUnits).toBe(63_963_136);
    expect(admitted.conservativePixelAllocationBytes).toBe(54_525_952);
    expect(() =>
      admitProceduralTextureSpecV3({
        ...base,
        width: 1024,
        height: 1024,
        operations: [...operations, operations[0]],
      }),
    ).toThrow(/work budget/);
  });
  test('returns the same canonical spec, JSON, compiler identity and frozen recipe hash', () => {
    const recipe = { ...base, height: 8 };
    const admitted = admitProceduralTextureSpecV3(recipe);
    expect(admitted.spec).toEqual(canonicalizeProceduralTextureSpecV3(recipe));
    expect(admitted.canonicalJson).toBe(canonicalProceduralTextureJsonV3(recipe));
    expect(admitted.canonicalJson).toBe(
      '{"schemaVersion":3,"width":4,"height":8,"usage":"albedo","background":[0,0,0,0],"operations":[]}',
    );
    expect(hashProceduralTextureSpecV3(admitted.spec)).toBe(
      'sha256:e225132964d0c77bbcae5f05d85cfb70ef0b18b9eaa58fb38d1352f75f310ad5',
    );
    expect(
      admitProceduralTextureSpecV3({
        operations: [],
        height: 8,
        width: 4,
        schemaVersion: 3,
        background: [0, 0, 0, 0],
        usage: 'albedo',
      }),
    ).toEqual(admitted);
    expect(recipe).toEqual({ schemaVersion: 3, width: 4, height: 8, operations: [] });
  });
  test('admission rejects nested getters and oversized work before any typed pixel allocation', () => {
    let getterReads = 0;
    const rgba = [1, 2, 3, 255];
    Object.defineProperty(rgba, '0', {
      enumerable: true,
      get: () => {
        getterReads++;
        return 1;
      },
    });
    const original = globalThis.Uint8Array;
    let allocations = 0;
    globalThis.Uint8Array = new Proxy(original, {
      construct(target, args) {
        allocations++;
        return Reflect.construct(target, args);
      },
    });
    try {
      expect(() =>
        admitProceduralTextureSpecV3({
          ...base,
          operations: [{ op: 'paint', shape: rectangle, rgba }],
        }),
      ).toThrow();
      expect(() =>
        admitProceduralTextureSpecV3({
          ...base,
          width: 1024,
          height: 1024,
          operations: Array.from({ length: 31 }, () => ({
            op: 'paint',
            shape: { ...rectangle, width: 1024, height: 1024 },
            rgba: [1, 2, 3, 255],
          })),
        }),
      ).toThrow(/work budget/);
      expect(admitProceduralTextureSpecV3(base).conservativePixelAllocationBytes).toBe(64);
      expect(getterReads).toBe(0);
      expect(allocations).toBe(0);
    } finally {
      globalThis.Uint8Array = original;
    }
  });
  test('internal admission is absent from all stable texture and primitives exports', () => {
    for (const surface of [publishedCompiler, publishedTextures, publishedPrimitives])
      expect('admitProceduralTextureSpecV3' in surface).toBe(false);
  });
});
