// Water data maps from the terrain pipeline, decoded at full 16-bit precision (png16.ts) and
// uploaded as filterable RG16F textures: R = water depth (m, bathymetry), G = signed shoreline
// distance (m, positive over water). The land mask is the sign of G (shore < 0 is land). The
// pipeline ships no flow texture, so a channel-aligned ebb field is derived here from the
// shoreline distance and depth (WATER-SPEC "Flow", fallback path); the tide scales it.
import { ClampToEdgeWrapping, DataTexture, HalfFloatType, LinearFilter, RGFormat } from 'three/webgpu';
import { decodePng, halfFloatLut, toHalf } from './png16';
import { WATER_DATA } from '../data';

export type Bounds = [number, number, number, number]; // xmin, zmin, xmax, zmax; row 0 at zmax
export interface WaterMapEntry { level: string; bounds: Bounds; size: [number, number]; depth: { path: string; scale: number; offset: number }; shore: { path: string; scale: number; offset: number }; mask: string }
export interface WaterMapLevel { level: string; bounds: Bounds; size: [number, number]; texture: DataTexture }
/** CPU copy of one level in metres, for flow derivation and queries. */
export interface WaterGrid { bounds: Bounds; width: number; height: number; depth: Float32Array; shore: Float32Array }

const luts = new Map<string, Uint16Array>();
function lut(scale: number, offset: number): Uint16Array {
  const key = `${scale}:${offset}`; let table = luts.get(key);
  if (!table) { table = halfFloatLut(code => code * scale + offset); luts.set(key, table); }
  return table;
}

export async function decodeWaterLevel(entry: WaterMapEntry, depthBytes: ArrayBuffer, shoreBytes: ArrayBuffer): Promise<{ level: WaterMapLevel; grid: WaterGrid }> {
  const [depth, shore] = await Promise.all([decodePng(depthBytes), decodePng(shoreBytes)]);
  const [width, height] = entry.size;
  for (const [name, image] of [['depth', depth], ['shore', shore]] as const)
    if (image.width !== width || image.height !== height || image.bitDepth !== 16 || image.channels !== 1) throw new Error(`Water ${name} map ${entry.level} is not a ${width}x${height} 16-bit grey PNG`);
  const depthLut = lut(entry.depth.scale, entry.depth.offset), shoreLut = lut(entry.shore.scale, entry.shore.offset);
  const texels = new Uint16Array(width * height * 2), dm = new Float32Array(width * height), sm = new Float32Array(width * height);
  const dv = depth.data as Uint16Array, sv = shore.data as Uint16Array;
  for (let i = 0; i < width * height; i++) {
    const d = dv[i]!, s = sv[i]!;
    texels[i * 2] = depthLut[d]!; texels[i * 2 + 1] = shoreLut[s]!;
    dm[i] = d * entry.depth.scale + entry.depth.offset; sm[i] = s * entry.shore.scale + entry.shore.offset;
  }
  const texture = new DataTexture(texels, width, height, RGFormat, HalfFloatType);
  texture.name = `water-${entry.level}`; texture.minFilter = texture.magFilter = LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping; texture.flipY = false; texture.needsUpdate = true;
  return { level: { level: entry.level, bounds: entry.bounds, size: entry.size, texture }, grid: { bounds: entry.bounds, width, height, depth: dm, shore: sm } };
}

/** Bilinear sample of a grid channel at world (x, z), clamped to the edge. */
export function sampleGrid(grid: WaterGrid, channel: Float32Array, x: number, z: number): number {
  const [x0, z0, x1, z1] = grid.bounds;
  const fx = Math.max(0, Math.min(grid.width - 1, (x - x0) / (x1 - x0) * grid.width - .5));
  const fy = Math.max(0, Math.min(grid.height - 1, (z1 - z) / (z1 - z0) * grid.height - .5));
  const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(grid.width - 1, i0 + 1), j1 = Math.min(grid.height - 1, j0 + 1), tx = fx - i0, ty = fy - j0, w = grid.width;
  return (channel[j0 * w + i0]! * (1 - tx) + channel[j0 * w + i1]! * tx) * (1 - ty) + (channel[j1 * w + i0]! * (1 - tx) + channel[j1 * w + i1]! * tx) * ty;
}
export function isInside(grid: WaterGrid, x: number, z: number): boolean { const [x0, z0, x1, z1] = grid.bounds; return x >= x0 && x <= x1 && z >= z0 && z <= z1; }

export interface FlowOptions { size: number; peakSpeed: number; gateWidth: number }
/** data/water.json `flow` (D-21). */
export const FLOW_DEFAULTS: FlowOptions = { size: WATER_DATA.flow.size, peakSpeed: WATER_DATA.flow.peakSpeed, gateWidth: WATER_DATA.flow.gateWidth };
/**
 * Ebb field (m/s, +X is seaward). Direction follows the channel: perpendicular to the shoreline-distance
 * gradient, oriented seaward, relaxing to due west where the gradient is ill-defined (channel axis,
 * open ocean). Speed rises with depth, falls toward the shore and peaks at the Gate constriction.
 */
export function deriveFlowField(grid: WaterGrid, options: FlowOptions = FLOW_DEFAULTS): Float32Array {
  const n = options.size, [x0, z0, x1, z1] = grid.bounds, cell = (x1 - x0) / n, out = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + .5) * cell, z = z1 - (j + .5) * (z1 - z0) / n, k = (j * n + i) * 2;
    const s = sampleGrid(grid, grid.shore, x, z); if (s <= 0) continue;
    const gx = (sampleGrid(grid, grid.shore, x + cell, z) - sampleGrid(grid, grid.shore, x - cell, z)) / (2 * cell);
    const gz = (sampleGrid(grid, grid.shore, x, z + cell) - sampleGrid(grid, grid.shore, x, z - cell)) / (2 * cell);
    let tx = gz, tz = -gx; if (tx < 0) { tx = -tx; tz = -tz; }
    const g = Math.hypot(gx, gz), w = Math.min(1, Math.max(0, (g - .25) / .6)), l = Math.hypot(tx, tz) || 1;
    let dx = (tx / l) * w + (1 - w), dz = (tz / l) * w; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const depth = sampleGrid(grid, grid.depth, x, z), deep = Math.sqrt(Math.min(1, Math.max(0, depth / 30)));
    const gate = .42 + .58 * Math.exp(-((x / options.gateWidth) ** 2)), shoreFade = Math.min(1, s / 140);
    const speed = options.peakSpeed * deep * gate * shoreFade;
    out[k] = dx * speed; out[k + 1] = dz * speed;
  }
  // Two box-blur passes remove direction kinks along the channel axis.
  const tmp = new Float32Array(out.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let sx = 0, sz = 0, c = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const k = (b * n + a) * 2; sx += out[k]!; sz += out[k + 1]!; c++;
      }
      const k = (j * n + i) * 2, water = sampleGrid(grid, grid.shore, x0 + (i + .5) * cell, z1 - (j + .5) * (z1 - z0) / n) > 0;
      tmp[k] = water ? sx / c : 0; tmp[k + 1] = water ? sz / c : 0;
    }
    out.set(tmp);
  }
  return out;
}
export function flowTexture(field: Float32Array, size: number): DataTexture {
  const data = new Uint16Array(field.length); for (let i = 0; i < field.length; i++) data[i] = toHalf(field[i]!);
  const texture = new DataTexture(data, size, size, RGFormat, HalfFloatType);
  texture.name = 'water-flow'; texture.minFilter = texture.magFilter = LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping; texture.flipY = false; texture.needsUpdate = true;
  return texture;
}
