import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import {
  CELLULAR_FEATURES,
  type CanonicalCellularLayer,
  type CellularField,
  cellularFieldBytes,
  cellularSearchRadius,
  cellularWorkPerTexel,
  prepareCellularField,
  sampleCellularFeature,
  searchCellular,
} from '../procedural-cellular';
import {
  type ProceduralLayer,
  ProceduralTextureError,
  canonicalProceduralTextureJsonV2,
  canonicalizeProceduralTextureSpecV2,
  compileProceduralTextureSpecV2,
  hashProceduralTextureSpecV2,
  proceduralTexture,
} from '../procedural-texture';
import { compileProceduralTextureSpecV3 } from '../procedural-texture-v3';
import { admitProceduralTextureSpecV3 } from '../procedural-texture-v3-contract';

type CellularInput = Extract<ProceduralLayer, { op: 'cellular' }>;

const cellular = (fields: Partial<CellularInput> = {}): CellularInput => ({
  op: 'cellular',
  colorA: 0x000000,
  colorB: 0xffffff,
  ...fields,
});

const spec = (layer: ProceduralLayer, size = 64) => ({
  schemaVersion: 2 as const,
  size,
  usage: 'albedo' as const,
  layers: [layer],
});

const canonicalLayer = (fields: Partial<CellularInput> = {}): CanonicalCellularLayer =>
  canonicalizeProceduralTextureSpecV2(spec(cellular(fields))).layers[0] as CanonicalCellularLayer;

const sha = (pixels: Uint8Array): string => createHash('sha256').update(pixels).digest('hex');

/** Every image of every cell inside a generous box, with no pruning and no search radius. */
function oracle(field: CellularField, x: number, y: number): { f1: number; f2: number } {
  const { layer, px, py, weights } = field;
  const reach = Math.max(cellularSearchRadius(layer).x, cellularSearchRadius(layer).y) + 3;
  let f1 = Infinity;
  let f2 = Infinity;
  for (let j = Math.floor(y) - reach; j <= Math.floor(y) + reach; j++) {
    for (let i = Math.floor(x) - reach; i <= Math.floor(x) + reach; i++) {
      const wi = ((i % layer.cellsX) + layer.cellsX) % layer.cellsX;
      const wj = ((j % layer.cellsY) + layer.cellsY) % layer.cellsY;
      const k = wj * layer.cellsX + wi;
      const dx = (i + px[k]! - x) * layer.metricX;
      const dy = (j + py[k]! - y) * layer.metricY;
      const d = Math.sqrt(dx * dx + dy * dy) + weights[k]!;
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}

/** Largest search error over a grid of samples, against the unbounded oracle. */
function searchError(layer: CanonicalCellularLayer, field = prepareCellularField(layer)): number {
  let worst = 0;
  const steps = 12;
  for (let sy = 0; sy < steps; sy++) {
    for (let sx = 0; sx < steps; sx++) {
      // Include samples hard against a cell edge, where the worst case lives.
      const u = (sx + (sx % 2 === 0 ? 1e-6 : 0.5)) / steps;
      const v = (sy + (sy % 2 === 0 ? 1e-6 : 0.5)) / steps;
      const found = searchCellular(field, u, v);
      const truth = oracle(field, u * layer.cellsX, v * layer.cellsY);
      worst = Math.max(worst, Math.abs(found.f1 - truth.f1), Math.abs(found.f2 - truth.f2));
    }
  }
  return worst;
}

/** Plant every cell point at one extreme of its jitter box, the adversarial layout. */
function adversarial(layer: CanonicalCellularLayer, cornerX: number, cornerY: number) {
  const field = prepareCellularField(layer);
  const px = field.px as Float64Array;
  const py = field.py as Float64Array;
  const weights = field.weights as Float64Array;
  for (let k = 0; k < px.length; k++) {
    px[k] = 0.5 + (cornerX - 0.5) * layer.jitterX;
    py[k] = 0.5 + (cornerY - 0.5) * layer.jitterY;
    weights[k] = layer.weight;
  }
  return field;
}

describe('cellular layer contract', () => {
  test('canonicalization applies defaults and makes explicit defaults byte-identical', () => {
    const implicit = spec(cellular());
    const explicit = spec(
      cellular({
        cellsX: 8,
        cellsY: 8,
        seed: 0,
        jitterX: 1,
        jitterY: 1,
        metricX: 1,
        metricY: 1,
        weight: 0,
        feature: 'f1',
        range: 1,
        borderOpen: 0.5,
        borderWidth: 0.05,
        facetSlope: 0.5,
        facetBlend: 0.1,
      }),
    );
    expect(canonicalProceduralTextureJsonV2(implicit)).toBe(
      canonicalProceduralTextureJsonV2(explicit),
    );
    expect(hashProceduralTextureSpecV2(implicit)).toBe(hashProceduralTextureSpecV2(explicit));
    // A canonical spec is a fixed point, because hashing re-canonicalizes it.
    const canonical = canonicalizeProceduralTextureSpecV2(implicit);
    expect(canonicalizeProceduralTextureSpecV2(canonical)).toEqual(canonical);
  });

  const refusals: Array<[string, Partial<CellularInput> | Record<string, unknown>, RegExp]> = [
    ['cellsX below one', { cellsX: 0 }, /cellsX must be a whole number between 1 and 256/],
    ['cellsY above the cap', { cellsY: 257 }, /cellsY must be a whole number between 1 and 256/],
    ['fractional cells', { cellsX: 2.5 }, /cellsX must be a whole number/],
    ['jitter above one', { jitterX: 1.5 }, /jitterX must be a finite number between 0 and 1/],
    ['negative jitter', { jitterY: -0.1 }, /jitterY must be a finite number between 0 and 1/],
    ['metric below one', { metricX: 0.5 }, /metricX must be a finite number between 1 and 4/],
    ['metric above four', { metricY: 5 }, /metricY must be a finite number between 1 and 4/],
    ['weight above range', { weight: 1.5 }, /weight must be a finite number between 0 and 1/],
    ['unknown feature', { feature: 'f3' }, /feature "f3" is not one of f1, f2, f2-f1, cell/],
    ['non-finite range', { range: Number.NaN }, /range must be a finite number/],
    ['zero range', { range: 0 }, /range must be a finite number between 0.01 and 8/],
    ['seed out of range', { seed: 2 ** 31 }, /seed must be a whole number/],
    ['unknown field', { octaves: 3 }, /has unknown key "octaves"/],
    [
      'open fraction out of range',
      { feature: 'border', borderOpen: 1.5 },
      /borderOpen must be a finite number between 0 and 1/,
    ],
    [
      'zero border width',
      { feature: 'border', borderWidth: 0 },
      /borderWidth must be a finite number between 0.001 and 1/,
    ],
    [
      'slope out of range',
      { feature: 'facet', facetSlope: 1.5 },
      /facetSlope must be a finite number between 0 and 1/,
    ],
    [
      'zero blend',
      { feature: 'facet', facetBlend: 0 },
      /facetBlend must be a finite number between 0.001 and 1/,
    ],
    [
      'a field the feature ignores',
      { feature: 'f1', borderOpen: 0.25 },
      /borderOpen applies only to feature "border", not "f1"/,
    ],
    [
      'range on a feature with no ramp',
      { feature: 'border', range: 2 },
      /range applies only to features f1, f2, f2-f1, cell, not "border"/,
    ],
    [
      'facet control on a border',
      { feature: 'border', facetBlend: 0.5 },
      /facetBlend applies only to feature "facet", not "border"/,
    ],
  ];
  for (const [name, fields, message] of refusals) {
    test(`refuses ${name} with a message naming the rule`, () => {
      const compile = (): unknown =>
        compileProceduralTextureSpecV2(spec(cellular(fields as Partial<CellularInput>)));
      expect(compile).toThrow(ProceduralTextureError);
      expect(compile).toThrow(message);
    });
  }

  test('reaches the ordinary texture path and survives the strict V3 boundary', () => {
    const texture = proceduralTexture(spec(cellular({ feature: 'cell' }), 16));
    expect(texture.image.width).toBe(16);
    expect(() =>
      compileProceduralTextureSpecV3({
        schemaVersion: 3,
        width: 16,
        height: 16,
        usage: 'albedo',
        operations: [{ op: 'legacy-v2', spec: spec(cellular({ cellsX: 2 }), 16) }],
      }),
    ).not.toThrow();
  });
});

describe('exact neighbour search', () => {
  test('the search radius follows the stated bound', () => {
    // Full jitter, unit metric: a point can sit a whole cell from its own cell's far edge, so
    // F2 can reach sqrt(1.5^2 + 1^2) = 1.80 and a 3x3 window would miss a true neighbour.
    expect(cellularSearchRadius(canonicalLayer())).toEqual({ x: 2, y: 2 });
    // No jitter is a plain grid: F2 is at most sqrt(1 + .25), one ring is enough.
    expect(cellularSearchRadius(canonicalLayer({ jitterX: 0, jitterY: 0 }))).toEqual({
      x: 1,
      y: 1,
    });
    // A strong metric on one axis makes the other axis' neighbours relatively closer.
    expect(cellularSearchRadius(canonicalLayer({ metricY: 4 }))).toEqual({ x: 5, y: 2 });
    expect(cellularSearchRadius(canonicalLayer({ metricY: 4, weight: 1 }))).toEqual({
      x: 6,
      y: 2,
    });
  });

  const corners: Array<Partial<CellularInput>> = [];
  for (const jitterX of [0, 0.35, 1])
    for (const jitterY of [0, 1])
      for (const [metricX, metricY] of [
        [1, 1],
        [1, 4],
        [4, 1],
        [2.5, 1],
      ] as const)
        for (const weight of [0, 1]) corners.push({ jitterX, jitterY, metricX, metricY, weight });

  test('agrees with an unbounded search on seeded layouts at every parameter corner', () => {
    for (const corner of corners) {
      for (const [cellsX, cellsY] of [
        [1, 1],
        [2, 5],
        [7, 3],
      ] as const) {
        const layer = canonicalLayer({ ...corner, cellsX, cellsY, seed: cellsX * 31 + cellsY });
        expect(searchError(layer)).toBeLessThan(1e-9);
      }
    }
  });

  test('agrees with an unbounded search when every point is at an extreme of its box', () => {
    for (const corner of corners) {
      for (const [cornerX, cornerY] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const layer = canonicalLayer({ ...corner, cellsX: 6, cellsY: 6 });
        expect(searchError(layer, adversarial(layer, cornerX, cornerY))).toBeLessThan(1e-9);
      }
    }
  });

  test('negative control: one ring fewer than the bound misses the true nearest cell', () => {
    // Every point within one ring of the sample is at least 1.116 away, and the point two columns
    // along is 1.002 away. This proves the oracle can see a miss and the 5x5 default is not slack.
    const layer = canonicalLayer({ cellsX: 8, cellsY: 8 });
    const plant = (field: CellularField): CellularField => {
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          (field.px as Float64Array)[j * 8 + i] = i === 0 || i === 2 ? 0.001 : 0.999;
          (field.py as Float64Array)[j * 8 + i] = j === 4 ? 0.999 : 0.001;
        }
      }
      (field.py as Float64Array)[3 * 8 + 2] = 0.5;
      return field;
    };
    const u = 0.999 / 8;
    const v = 3.5 / 8;
    const full = plant(prepareCellularField(layer));
    expect(searchCellular(full, u, v).f1).toBeCloseTo(1.002, 9);
    expect(searchCellular(full, u, v).f1).toBeCloseTo(oracle(full, u * 8, v * 8).f1, 9);
    const narrow = plant(prepareCellularField(layer, { x: 1, y: 1 }));
    expect(searchCellular(narrow, u, v).f1).toBeGreaterThan(1.11);
  });

  test('ordinary seeded layouts stay exact while pruning most of the window', () => {
    const layer = canonicalLayer({ cellsX: 16, cellsY: 16, seed: 3 });
    const field = prepareCellularField(layer);
    let cells = 0;
    const steps = 128;
    for (let y = 0; y < steps; y++) {
      for (let x = 0; x < steps; x++) {
        cells += searchCellular(field, (x + 0.5) / steps, (y + 0.5) / steps).visited;
      }
    }
    expect(cells / (steps * steps)).toBeLessThan(10);
  });
});

describe('features', () => {
  test('every feature is deterministic and changes with the seed', () => {
    for (const feature of CELLULAR_FEATURES) {
      const one = compileProceduralTextureSpecV2(spec(cellular({ feature, seed: 11 })));
      const again = compileProceduralTextureSpecV2(spec(cellular({ feature, seed: 11 })));
      const other = compileProceduralTextureSpecV2(spec(cellular({ feature, seed: 12 })));
      expect(sha(again.pixels)).toBe(sha(one.pixels));
      expect(again.recipeHash).toBe(one.recipeHash);
      expect(sha(other.pixels)).not.toBe(sha(one.pixels));
      expect(other.recipeHash).not.toBe(one.recipeHash);
    }
  });

  test('pixels are pinned, because the recipe hash carries no compiler id', () => {
    // These hashes are the algorithm's identity. A change here moves pixels under an unchanged
    // recipe hash, so it needs a new op or field rather than a re-pin.
    const golden = Object.fromEntries(
      CELLULAR_FEATURES.map((feature) => [
        feature,
        sha(
          compileProceduralTextureSpecV2(
            spec(
              cellular({
                feature,
                seed: 1234,
                cellsX: 7,
                cellsY: 11,
                jitterX: 0.8,
                jitterY: 0.4,
                metricY: 2,
                weight: 0.25,
                colorA: 0x102030,
                colorB: 0xe0d0c0,
              }),
              128,
            ),
          ).pixels,
        ),
      ]),
    );
    expect(golden).toEqual(GOLDEN_PIXELS);
  });

  test('cell gives one flat tone per cell', () => {
    const layer = canonicalLayer({ feature: 'cell', cellsX: 5, cellsY: 5, seed: 8 });
    const field = prepareCellularField(layer);
    const tone = new Map<number, number>();
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const u = (x + 0.5) / 96;
        const v = (y + 0.5) / 96;
        const id = searchCellular(field, u, v).id1;
        const value = sampleCellularFeature(field, u, v);
        expect(tone.get(id) ?? value).toBe(value);
        tone.set(id, value);
      }
    }
    expect(new Set(tone.values()).size).toBeGreaterThan(15);
  });

  test('range on cell picks out a sparse population of flat tones', () => {
    // A linear ramp alone cannot make a few dark crystals among many pale ones. Saturating the
    // tone can: about a fifth of the cells keep a tone and the rest reach colorB exactly.
    const pixels = compileProceduralTextureSpecV2(
      spec(cellular({ feature: 'cell', range: 0.2, cellsX: 32, cellsY: 32, seed: 4 }), 256),
    ).pixels;
    let saturated = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 255) saturated++;
    const fraction = saturated / (256 * 256);
    expect(fraction).toBeGreaterThan(0.7);
    expect(fraction).toBeLessThan(0.9);
  });

  test('a border is opened by a hash that does not depend on which side you stand', () => {
    // Walk across a whole tile and check that every observed pair gets one state, in either order.
    const layer = canonicalLayer({ feature: 'border', cellsX: 9, cellsY: 9, seed: 21 });
    const field = prepareCellularField(layer);
    const state = new Map<string, number>();
    let swapped = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const u = (x + 0.5) / 256;
        const v = (y + 0.5) / 256;
        const { id1, id2, f1, f2 } = searchCellular(field, u, v);
        const key = `${Math.min(id1, id2)}:${Math.max(id1, id2)}`;
        const value = sampleCellularFeature(field, u, v);
        if (f2 - f1 < layer.borderWidth * 0.25) {
          const open = value > 0 ? 1 : 0;
          if (state.has(key) && id1 > id2) swapped++;
          expect(state.get(key) ?? open).toBe(open);
          state.set(key, open);
        }
      }
    }
    expect(swapped).toBeGreaterThan(0);
    const open = [...state.values()].filter(Boolean).length;
    expect(open / state.size).toBeGreaterThan(0.3);
    expect(open / state.size).toBeLessThan(0.7);
  });

  test('borderOpen 0 closes every border and 1 opens every border', () => {
    const closed = compileProceduralTextureSpecV2(
      spec(cellular({ feature: 'border', borderOpen: 0, seed: 2 })),
    );
    expect(Math.max(...closed.pixels.filter((_, i) => i % 4 === 0))).toBe(0);
    const layer = canonicalLayer({ feature: 'border', borderOpen: 1, seed: 2 });
    const field = prepareCellularField(layer);
    let checked = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const u = (x + 0.5) / 128;
        const v = (y + 0.5) / 128;
        const { f1, f2 } = searchCellular(field, u, v);
        if (f2 - f1 < layer.borderWidth * 0.25) {
          expect(sampleCellularFeature(field, u, v)).toBeGreaterThan(0.5);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('an open border can end at a closed one, which is what stops crazy paving', () => {
    const layer = canonicalLayer({ feature: 'border', cellsX: 12, cellsY: 12, seed: 5 });
    const field = prepareCellularField(layer);
    // A cell with both an open and a closed border has a crack that stops at its corner.
    const open = new Map<number, Set<number>>();
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const u = (x + 0.5) / 256;
        const v = (y + 0.5) / 256;
        const { id1, f1, f2 } = searchCellular(field, u, v);
        if (f2 - f1 < layer.borderWidth * 0.25) {
          const states = open.get(id1) ?? new Set<number>();
          states.add(sampleCellularFeature(field, u, v) > 0 ? 1 : 0);
          open.set(id1, states);
        }
      }
    }
    const mixed = [...open.values()].filter((states) => states.size === 2).length;
    expect(mixed / open.size).toBeGreaterThan(0.5);
  });

  test('facets are continuous everywhere, including where a second neighbour changes', () => {
    // A plane pair blended only across F1/F2 jumps on the line where F2 and F3 swap, near each
    // corner. The largest step between adjacent samples must shrink with the sample spacing.
    const layer = canonicalLayer({
      feature: 'facet',
      cellsX: 6,
      cellsY: 6,
      seed: 17,
      facetSlope: 1,
      facetBlend: 0.15,
    });
    const field = prepareCellularField(layer);
    const largestStep = (steps: number): number => {
      let largest = 0;
      let previousRow: number[] = [];
      for (let y = 0; y < steps; y++) {
        const row: number[] = [];
        for (let x = 0; x < steps; x++) {
          const value = sampleCellularFeature(field, (x + 0.5) / steps, (y + 0.5) / steps);
          row.push(value);
          if (x > 0) largest = Math.max(largest, Math.abs(value - row[x - 1]!));
          if (y > 0) largest = Math.max(largest, Math.abs(value - previousRow[x]!));
        }
        previousRow = row;
      }
      return largest;
    };
    const coarse = largestStep(256);
    const fine = largestStep(1024);
    expect(fine).toBeLessThan(coarse * 0.45);
  });

  test('a narrow facet blend keeps a flat plane inside each cell', () => {
    const layer = canonicalLayer({
      feature: 'facet',
      cellsX: 4,
      cellsY: 4,
      seed: 3,
      facetSlope: 0.5,
      facetBlend: 0.05,
    });
    const field = prepareCellularField(layer);
    // Far from any border, a second difference along a line is zero: the surface is a plane.
    let measured = 0;
    for (let y = 8; y < 248; y += 8) {
      for (let x = 8; x < 248; x += 8) {
        const u = x / 256;
        const v = y / 256;
        const e = 1 / 2048;
        const near = [u - e, u, u + e].map((p) => searchCellular(field, p, v));
        if (near.some(({ f1, f2 }) => f2 - f1 < layer.facetBlend + 0.01)) continue;
        if (near[0]!.id1 !== near[2]!.id1) continue;
        const [a, b, c] = [u - e, u, u + e].map((p) => sampleCellularFeature(field, p, v));
        expect(Math.abs(a! - 2 * b! + c!)).toBeLessThan(1e-9);
        measured++;
      }
    }
    expect(measured).toBeGreaterThan(50);
  });
});

describe('tiling', () => {
  // A wrap difference must be inside what the interior already does, on every channel.
  const wrapWithinInterior = (pixels: Uint8Array, size: number): void => {
    const at = (x: number, y: number): number => pixels[(y * size + x) * 4]!;
    let interior = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x + 1 < size; x++) {
        interior = Math.max(interior, Math.abs(at(x, y) - at(x + 1, y)));
      }
    for (let y = 0; y + 1 < size; y++)
      for (let x = 0; x < size; x++) {
        interior = Math.max(interior, Math.abs(at(x, y) - at(x, y + 1)));
      }
    for (let i = 0; i < size; i++) {
      expect(Math.abs(at(size - 1, i) - at(0, i))).toBeLessThanOrEqual(interior);
      expect(Math.abs(at(i, size - 1) - at(i, 0))).toBeLessThanOrEqual(interior);
    }
  };

  for (const feature of CELLULAR_FEATURES) {
    test(`${feature} is one period: a shifted lattice gives the same pixels`, () => {
      for (const [cellsX, cellsY] of [
        [1, 1],
        [3, 5],
        [8, 8],
      ] as const) {
        const layer = canonicalLayer({ feature, cellsX, cellsY, seed: 9, weight: 0.5 });
        const field = prepareCellularField(layer);
        for (let i = 0; i < 40; i++) {
          // Sample just inside and just outside each wrap edge. Outside the tile, the wrapped
          // lattice index must see the same cells, so the value is continuous through the edge.
          const v = (i + 0.5) / 40;
          const seam = Math.abs(
            sampleCellularFeature(field, 1e-9, v) - sampleCellularFeature(field, 1 - 1e-9, v),
          );
          const across = Math.abs(
            sampleCellularFeature(field, v, 1e-9) - sampleCellularFeature(field, v, 1 - 1e-9),
          );
          const ceiling = feature === 'cell' || feature === 'border' ? 1 : 1e-6;
          expect(seam).toBeLessThanOrEqual(ceiling);
          expect(across).toBeLessThanOrEqual(ceiling);
        }
        wrapWithinInterior(
          compileProceduralTextureSpecV2(spec(cellular({ feature, cellsX, cellsY, seed: 9 }), 128))
            .pixels,
          128,
        );
      }
    });
  }

  test('a one-cell tile still has a border, between a cell and its own image', () => {
    const layer = canonicalLayer({ feature: 'f2-f1', cellsX: 1, cellsY: 1, seed: 6 });
    const field = prepareCellularField(layer);
    const found = searchCellular(field, 0.5, 0.5);
    expect(found.id1).toBe(0);
    expect(found.id2).toBe(0);
    expect(found.f2).toBeGreaterThan(found.f1);
  });
});

describe('V3 work and allocation budgets', () => {
  const legacy = (layer: ProceduralLayer, size: number) => ({
    schemaVersion: 3 as const,
    width: size,
    height: size,
    usage: 'albedo' as const,
    operations: [{ op: 'legacy-v2', spec: spec(layer, size) }],
  });

  test('a cellular layer is charged its own cost, not the flat pattern cost', () => {
    const layer = canonicalLayer({ cellsX: 8, cellsY: 8 });
    const admitted = admitProceduralTextureSpecV3(legacy(cellular({ cellsX: 8, cellsY: 8 }), 64));
    const texels = 64 * 64;
    expect(admitted.estimatedWorkUnits).toBe(
      texels + texels * (1 + cellularWorkPerTexel(layer)) + 8 * 8 * 12,
    );
    expect(cellularWorkPerTexel(layer)).toBeGreaterThan(4);
    expect(admitted.conservativePixelAllocationBytes).toBe(texels * 8 + cellularFieldBytes(layer));
  });

  test('cost grows with the window, and the widest window costs the most', () => {
    const narrow = cellularWorkPerTexel(canonicalLayer({ jitterX: 0, jitterY: 0 }));
    const wide = cellularWorkPerTexel(canonicalLayer({ metricY: 4, weight: 1 }));
    const facet = cellularWorkPerTexel(
      canonicalLayer({ metricY: 4, weight: 1, feature: 'facet', facetBlend: 1 }),
    );
    const tone = cellularWorkPerTexel(canonicalLayer({ feature: 'cell' }));
    expect(narrow).toBeLessThan(wide);
    expect(wide).toBeLessThan(facet);
    expect(tone).toBeLessThanOrEqual(cellularWorkPerTexel(canonicalLayer()));
  });

  test('a default layer fits at 1024, and a stack that does not is refused by the budget rule', () => {
    expect(() => admitProceduralTextureSpecV3(legacy(cellular(), 1024))).not.toThrow();
    const layers = Array.from({ length: 4 }, () => cellular({ blend: 'multiply', opacity: 0.5 }));
    expect(() =>
      admitProceduralTextureSpecV3({
        schemaVersion: 3,
        width: 1024,
        height: 1024,
        usage: 'albedo',
        operations: [
          {
            op: 'legacy-v2',
            spec: { schemaVersion: 2, size: 1024, usage: 'albedo', layers },
          },
        ],
      }),
    ).toThrow(/estimated work budget \d+ exceeds 64000000/);
    // The same stack is admitted at a size that fits.
    expect(() =>
      admitProceduralTextureSpecV3({
        schemaVersion: 3,
        width: 256,
        height: 256,
        usage: 'albedo',
        operations: [
          { op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'albedo', layers } },
        ],
      }),
    ).not.toThrow();
  });

  test('through V3 the pixels are the V2 pixels', () => {
    const layer = cellular({ cellsX: 5, cellsY: 3, feature: 'facet', seed: 4 });
    const v2 = compileProceduralTextureSpecV2(spec(layer, 32));
    const v3 = compileProceduralTextureSpecV3({
      schemaVersion: 3,
      width: 32,
      height: 32,
      usage: 'albedo',
      background: [0, 0, 0, 255],
      operations: [{ op: 'legacy-v2', spec: spec(layer, 32) }],
    });
    expect(sha(v3.pixels)).toBe(sha(v2.pixels));
  });

  test('V2 itself keeps its size and layer limits and no work budget', () => {
    const layers = Array.from({ length: 8 }, () => cellular({ cellsX: 4, cellsY: 4 }));
    expect(() =>
      canonicalizeProceduralTextureSpecV2({ schemaVersion: 2, size: 1024, layers }),
    ).not.toThrow();
    expect(() =>
      canonicalizeProceduralTextureSpecV2({
        schemaVersion: 2,
        size: 1024,
        layers: [...layers, cellular()],
      }),
    ).toThrow(/exceeds the maximum of 8/);
  });
});

const GOLDEN_PIXELS: Record<string, string> = {
  f1: '668e8eea5f94eedee007eccf72378edf48ef90c08f4e0a59060e98554151c54a',
  f2: 'a454aea66bd942924e153e56489d519893245845cf62a595c393258b7a851042',
  'f2-f1': 'bb9f582fd0ff490004d2f38cc0aa43205843410a8a7f2009a1b0f0dcd3ff534b',
  cell: '7daaa6f9fac8fc9d02aa9c38a7e2cb3a118d6a38ede17fa84fae0e59b34795c5',
  border: '11b3e399c4964e358951dd106eb32fb0650305c2b18a2637039c39e988b98a54',
  facet: '08b32693f2bac4657cfe73323a18399a58d4f49e45fdd612bcd805ab6abae84d',
};
