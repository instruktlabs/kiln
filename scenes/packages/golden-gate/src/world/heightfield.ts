// Terrain collision grid (terrain/out collision_mid_512_u16.png): a conservative 7x7-max height
// field over +/-6000 m, u16 x 0.05 m. Row 0 is +Z (north), column 0 is -X; values sit at pixel
// centres. Used for the orbit floor, flyover clearance checks and the recorded postcard pose.
export interface HeightField {
  width: number; height: number; bounds: [number, number, number, number]; // xmin, zmin, xmax, zmax
  data: Float32Array; // metres above MSL, row-major from +Z
}

export function heightFieldFromU16(values: Uint16Array, width: number, height: number, bounds: [number, number, number, number], metresPerUnit: number): HeightField {
  if (values.length !== width * height) throw new Error('Collision grid size mismatch');
  const data = new Float32Array(values.length); for (let i = 0; i < values.length; i++) data[i] = values[i]! * metresPerUnit;
  return { width, height, bounds, data };
}

/** Bilinear terrain height at (x, z); outside the grid returns 0 (open water beyond the mid ring is sea level or lower). */
export function sampleHeight(field: HeightField, x: number, z: number): number {
  const [x0, z0, x1, z1] = field.bounds;
  const fx = (x - x0) / (x1 - x0) * field.width - .5, fy = (z1 - z) / (z1 - z0) * field.height - .5;
  if (fx < -.5 || fy < -.5 || fx > field.width - .5 || fy > field.height - .5) return 0;
  const cx = Math.max(0, Math.min(field.width - 1, fx)), cy = Math.max(0, Math.min(field.height - 1, fy));
  const i0 = Math.floor(cx), j0 = Math.floor(cy), i1 = Math.min(field.width - 1, i0 + 1), j1 = Math.min(field.height - 1, j0 + 1);
  const tx = cx - i0, ty = cy - j0, d = field.data, w = field.width;
  const a = d[j0 * w + i0]!, b = d[j0 * w + i1]!, c = d[j1 * w + i0]!, e = d[j1 * w + i1]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}
/** Conservative height: the maximum of the four surrounding samples. */
export function maxHeightNear(field: HeightField, x: number, z: number): number {
  const [x0, z0, x1, z1] = field.bounds;
  const fx = (x - x0) / (x1 - x0) * field.width - .5, fy = (z1 - z) / (z1 - z0) * field.height - .5;
  if (fx < -1 || fy < -1 || fx > field.width || fy > field.height) return 0;
  const i0 = Math.max(0, Math.min(field.width - 1, Math.floor(fx))), j0 = Math.max(0, Math.min(field.height - 1, Math.floor(fy)));
  const i1 = Math.min(field.width - 1, i0 + 1), j1 = Math.min(field.height - 1, j0 + 1), d = field.data, w = field.width;
  return Math.max(d[j0 * w + i0]!, d[j0 * w + i1]!, d[j1 * w + i0]!, d[j1 * w + i1]!);
}
/** Floor for cameras: terrain or water, whichever is higher. */
export function surfaceHeight(field: HeightField, x: number, z: number): number { return Math.max(0, sampleHeight(field, x, z)); }

/** Minimum clearance of a straight sight line above the surface (terrain or water), sampled every `step` metres. */
export function sightlineClearance(field: HeightField, from: readonly number[], to: readonly number[], step = 5, skipEnd = 0): { clearance: number; at: [number, number, number] } {
  const dx = to[0]! - from[0]!, dy = to[1]! - from[1]!, dz = to[2]! - from[2]!, length = Math.hypot(dx, dy, dz), n = Math.max(2, Math.ceil(length / step));
  let clearance = Infinity, at: [number, number, number] = [from[0]!, from[1]!, from[2]!];
  for (let i = 0; i <= n; i++) {
    const t = i / n; if (t * length > length - skipEnd) break;
    const x = from[0]! + dx * t, y = from[1]! + dy * t, z = from[2]! + dz * t, c = y - Math.max(0, maxHeightNear(field, x, z));
    if (c < clearance) { clearance = c; at = [x, y, z]; }
  }
  return { clearance, at };
}
