/**
 * Periodic cellular (Worley) field behind the V2 `cellular` layer. Browser-safe, with no Three.js
 * state, and imported by the V3 contract for its cost, so it stays free of the pixel compiler.
 *
 * Coordinates are cell units: one cell is 1 x 1, whatever `cellsX` and `cellsY` make it in UV. A
 * cell's point sits in the box `0.5 +- jitter/2` on each axis. Distance is
 * `sqrt((metricX*dx)^2 + (metricY*dy)^2) + w`, where `w` is that cell's additive weight, drawn
 * from `[0, weight]`.
 *
 * Output bytes must match on every platform and forever, because a V2 recipe hash carries no
 * compiler id: only integer hashing and `sqrt` here, never `Math.pow`, `sin` or `random`.
 */
import type { CanonicalProceduralLayerV2 } from './procedural-material-v2';

export const CELLULAR_FEATURES = ['f1', 'f2', 'f2-f1', 'cell', 'border', 'facet'] as const;
export type CellularFeature = (typeof CELLULAR_FEATURES)[number];

export const MIN_CELLULAR_METRIC = 1;
export const MAX_CELLULAR_METRIC = 4;
export const MAX_CELLULAR_WEIGHT = 1;

export type CanonicalCellularLayer = Extract<CanonicalProceduralLayerV2, { op: 'cellular' }>;

const distanceOf = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/**
 * How many rings of neighbours keep the search exact, for any seed.
 *
 * A sample is somewhere in its own cell, so its own point is at most `(1 + jitter) / 2` away on an
 * axis. A neighbour on the nearer side of an axis is at most `1 + jitter / 2` away on that axis.
 * Those two cells bound F2 from above, taking the cheaper axis for the neighbour. An image `k`
 * rings out is at least `k - (1 + jitter) / 2` away, scaled by that axis' metric, and weights only
 * add, so once a ring's lower bound reaches F2's upper bound nothing beyond it can be nearest or
 * second nearest. Facets also read every cell within `facetBlend` of F1, so they extend the reach.
 */
export function cellularSearchRadius(layer: CanonicalCellularLayer): { x: number; y: number } {
  const { jitterX, jitterY, metricX, metricY, weight } = layer;
  const ownX = (1 + jitterX) / 2;
  const ownY = (1 + jitterY) / 2;
  const nearX = 1 + jitterX / 2;
  const nearY = 1 + jitterY / 2;
  const f1Bound = distanceOf(metricX * ownX, metricY * ownY) + weight;
  const f2Bound =
    Math.min(
      distanceOf(metricX * nearX, metricY * ownY),
      distanceOf(metricX * ownX, metricY * nearY),
    ) + weight;
  const reach = layer.feature === 'facet' ? Math.max(f2Bound, f1Bound + layer.facetBlend) : f2Bound;
  return {
    x: Math.max(1, Math.ceil(reach / metricX + ownX - 1)),
    y: Math.max(1, Math.ceil(reach / metricY + ownY - 1)),
  };
}

/**
 * V3 work units per texel, where one noise octave costs 16. Fitted to the real compile path against
 * noise; docs/procedural-surfaces-v3.md records the measurements. The search prunes, so it reads
 * about the same few cells whatever the window, and the window adds little. This charges what a
 * layer costs, not a worst case that no seed reaches, the same way noise and bricks are charged.
 */
export function cellularWorkPerTexel(layer: CanonicalCellularLayer): number {
  const { x, y } = cellularSearchRadius(layer);
  const search = 46 + Math.ceil(((2 * x + 1) * (2 * y + 1)) / 8) + (layer.weight > 0 ? 10 : 0);
  if (layer.feature === 'border') return search + 8;
  if (layer.feature === 'facet') return search + 32 + Math.ceil(layer.facetBlend * 30);
  return search;
}

/** One-time hashing of the cell table: at most three hashes per cell, on the same scale. */
export function cellularFieldWork(layer: CanonicalCellularLayer): number {
  return layer.cellsX * layer.cellsY * 12;
}

/** Conservative table allocation: six doubles per cell plus the small wrap and order tables. */
export function cellularFieldBytes(layer: CanonicalCellularLayer): number {
  return layer.cellsX * layer.cellsY * 48 + 4096;
}

// A strong finalizer, not `hash2`: cells draw several values from one id, so neighbouring ids and
// neighbouring streams must not correlate. It is never compared with noise.
function mix(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const TO_UNIT = 1 / 4294967296;
const lattice = (x: number, y: number, seed: number): number =>
  (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
const stream = (root: number, index: number): number =>
  mix(root + Math.imul(index + 1, 0x9e3779b9)) * TO_UNIT;

/** Nearest cells first, so F2 tightens early and the rest of the window prunes. */
function centreOut(radius: number): Int32Array {
  const order = new Int32Array(2 * radius + 1);
  for (let k = 1; k <= radius; k++) {
    order[2 * k - 1] = -k;
    order[2 * k] = k;
  }
  return order;
}

function wrapTable(cells: number, radius: number): Int32Array {
  const table = new Int32Array(cells + 2 * radius + 1);
  for (let i = 0; i < table.length; i++) {
    // Wrapping the cell index, not the sample point, is what makes the field tile.
    table[i] = (((i - radius) % cells) + cells) % cells;
  }
  return table;
}

export interface CellularField {
  readonly layer: CanonicalCellularLayer;
  readonly radius: { readonly x: number; readonly y: number };
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly weights: Float64Array;
  readonly tones: Float64Array;
  readonly slopeX: Float64Array;
  readonly slopeY: Float64Array;
  readonly wrapX: Int32Array;
  readonly wrapY: Int32Array;
  readonly orderX: Int32Array;
  readonly orderY: Int32Array;
  /** F1, F2 of the latest scan, squared. Typed arrays keep the hot writes unboxed. */
  readonly squared: Float64Array;
  /** Nearest id, second nearest id and cells read by the latest scan. */
  readonly found: Int32Array;
}

/** Draw every cell's values once. `radius` is only for proving the bound matters in tests. */
export function prepareCellularField(
  layer: CanonicalCellularLayer,
  radius: { x: number; y: number } = cellularSearchRadius(layer),
): CellularField {
  const { cellsX, cellsY, seed, jitterX, jitterY, weight, feature } = layer;
  const count = cellsX * cellsY;
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  const weights = new Float64Array(count);
  const tones = new Float64Array(feature === 'cell' ? count : 0);
  const slopeX = new Float64Array(feature === 'facet' ? count : 0);
  const slopeY = new Float64Array(feature === 'facet' ? count : 0);
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const id = j * cellsX + i;
      const root = lattice(i, j, seed);
      px[id] = 0.5 + (stream(root, 0) - 0.5) * jitterX;
      py[id] = 0.5 + (stream(root, 1) - 0.5) * jitterY;
      weights[id] = stream(root, 2) * weight;
      if (feature === 'cell') tones[id] = stream(root, 3);
      if (feature === 'facet') {
        slopeX[id] = stream(root, 4) - 0.5;
        slopeY[id] = stream(root, 5) - 0.5;
      }
    }
  }
  return {
    layer,
    radius,
    px,
    py,
    weights,
    tones,
    slopeX,
    slopeY,
    wrapX: wrapTable(cellsX, radius.x),
    wrapY: wrapTable(cellsY, radius.y),
    orderX: centreOut(radius.x),
    orderY: centreOut(radius.y),
    squared: new Float64Array(2),
    found: new Int32Array(3),
  };
}

/**
 * Find the nearest and second nearest images around a sample. Rows and columns whose closest
 * possible point is already past F2 are skipped; weights only add, so the unweighted lower bound
 * is safe. `sqrt` is taken only for a weighted candidate that survives.
 */
function scan(field: CellularField, x: number, y: number): void {
  const { layer, px, py, weights, wrapX, wrapY, orderX, orderY } = field;
  const { metricX, metricY, jitterX, jitterY, cellsX } = layer;
  const radiusX = field.radius.x;
  const radiusY = field.radius.y;
  const weighted = layer.weight > 0;
  const lowX = (1 - jitterX) / 2;
  const highX = (1 + jitterX) / 2;
  const lowY = (1 - jitterY) / 2;
  const highY = (1 + jitterY) / 2;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  let f1 = Infinity;
  let f2 = Infinity;
  let id1 = -1;
  let id2 = -1;
  let visited = 0;
  for (let n = 0; n < orderY.length; n++) {
    const dj = orderY[n]!;
    const gapY = dj > 0 ? (dj + lowY - yf) * metricY : dj < 0 ? (yf - dj - highY) * metricY : 0;
    const floorY = gapY * gapY;
    if (floorY >= f2) continue;
    const row = wrapY[yi + dj + radiusY]! * cellsX;
    for (let m = 0; m < orderX.length; m++) {
      const di = orderX[m]!;
      const gapX = di > 0 ? (di + lowX - xf) * metricX : di < 0 ? (xf - di - highX) * metricX : 0;
      if (gapX * gapX + floorY >= f2) continue;
      const id = row + wrapX[xi + di + radiusX]!;
      visited++;
      const dx = (di + px[id]! - xf) * metricX;
      const dy = (dj + py[id]! - yf) * metricY;
      let d = dx * dx + dy * dy;
      if (d >= f2) continue;
      if (weighted) {
        const total = Math.sqrt(d) + weights[id]!;
        d = total * total;
        if (d >= f2) continue;
      }
      if (d < f1) {
        f2 = f1;
        id2 = id1;
        f1 = d;
        id1 = id;
      } else {
        f2 = d;
        id2 = id;
      }
    }
  }
  field.squared[0] = f1;
  field.squared[1] = f2;
  field.found[0] = id1;
  field.found[1] = id2;
  field.found[2] = visited;
}

export interface CellularNearest {
  f1: number;
  f2: number;
  id1: number;
  id2: number;
  visited: number;
}

/** F1, F2 and the two nearest cell ids at a UV sample. */
export function searchCellular(field: CellularField, u: number, v: number): CellularNearest {
  scan(field, u * field.layer.cellsX, v * field.layer.cellsY);
  return {
    f1: Math.sqrt(field.squared[0]!),
    f2: Math.sqrt(field.squared[1]!),
    id1: field.found[0]!,
    id2: field.found[1]!,
    visited: field.found[2]!,
  };
}

/**
 * A tilted plane per cell, weighted across every cell within `facetBlend` of F1. Each weight falls
 * to zero at that limit, so no cell enters or leaves with a step. Blending only F1 and F2 would
 * jump on the line near a corner where F2 and F3 swap.
 */
function facetHeight(field: CellularField, x: number, y: number, f1: number): number {
  const { layer, px, py, weights, slopeX, slopeY, wrapX, wrapY, orderX, orderY } = field;
  const { metricX, metricY, jitterX, jitterY, cellsX, facetBlend, facetSlope } = layer;
  const radiusX = field.radius.x;
  const radiusY = field.radius.y;
  const limit = f1 + facetBlend;
  const limitSquared = limit * limit;
  const lowX = (1 - jitterX) / 2;
  const highX = (1 + jitterX) / 2;
  const lowY = (1 - jitterY) / 2;
  const highY = (1 + jitterY) / 2;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  let sum = 0;
  let total = 0;
  for (let n = 0; n < orderY.length; n++) {
    const dj = orderY[n]!;
    const gapY = dj > 0 ? (dj + lowY - yf) * metricY : dj < 0 ? (yf - dj - highY) * metricY : 0;
    const floorY = gapY * gapY;
    if (floorY >= limitSquared) continue;
    const row = wrapY[yi + dj + radiusY]! * cellsX;
    for (let m = 0; m < orderX.length; m++) {
      const di = orderX[m]!;
      const gapX = di > 0 ? (di + lowX - xf) * metricX : di < 0 ? (xf - di - highX) * metricX : 0;
      if (gapX * gapX + floorY >= limitSquared) continue;
      const id = row + wrapX[xi + di + radiusX]!;
      const dx = (di + px[id]! - xf) * metricX;
      const dy = (dj + py[id]! - yf) * metricY;
      const d = Math.sqrt(dx * dx + dy * dy) + weights[id]!;
      if (d >= limit) continue;
      const falloff = 1 - (d - f1) / facetBlend;
      const blend = falloff * falloff;
      sum += blend * (slopeX[id]! * dx + slopeY[id]! * dy);
      total += blend;
    }
  }
  return Math.max(0, Math.min(1, 0.5 + (facetSlope * sum) / total));
}

/** The selected feature at a UV sample, in 0..1, mapped by the caller onto colorA..colorB. */
export function sampleCellularFeature(field: CellularField, u: number, v: number): number {
  const { layer } = field;
  const x = u * layer.cellsX;
  const y = v * layer.cellsY;
  scan(field, x, y);
  const f1 = Math.sqrt(field.squared[0]!);
  switch (layer.feature) {
    case 'f1':
      return Math.min(1, f1 / layer.range);
    case 'f2':
      return Math.min(1, Math.sqrt(field.squared[1]!) / layer.range);
    case 'f2-f1':
      return Math.min(1, (Math.sqrt(field.squared[1]!) - f1) / layer.range);
    case 'cell':
      return Math.min(1, field.tones[field.found[0]!]! / layer.range);
    case 'border': {
      const gap = (Math.sqrt(field.squared[1]!) - f1) / layer.borderWidth;
      if (gap >= 1) return 0;
      const id1 = field.found[0]!;
      const id2 = field.found[1]!;
      // Order-independent, so both sides of a border agree on whether it is open.
      const pair = lattice(Math.min(id1, id2), Math.max(id1, id2), layer.seed);
      if (mix(pair + 0x2f0b4a87) * TO_UNIT >= layer.borderOpen) return 0;
      return 1 - gap * gap * (3 - 2 * gap);
    }
    case 'facet':
      return facetHeight(field, x, y, f1);
  }
}
