// Camera-centred geometry clipmap for the water (WATER-SPEC "Mesh"): level 0 is a full square of
// tiles, every coarser level a square ring of tiles twice the size, out to the horizon (about
// 130 km). Each tile is one instance of a shared G x G unit grid; the per-instance `patch` attribute
// is (x0, z0, size, level).
//
// Geomorph. Level l has tile size T and vertex spacing s = T / G. Its square (half-extent E = 4 T)
// is centred on the camera snapped to 2 T, so every level boundary lies on the next level's grid.
// Odd vertices slide onto their even neighbours (the next level's grid) as the Chebyshev distance
// from the unsnapped camera goes from a = 2.5 T to b = 3 T:
//  - a level's outer boundary is at least E - T = 3 T from the camera, so it is fully morphed there;
//  - the next level's inner boundary is at most E + T = 5 T = 2.5 T' from the camera, where it is
//    not yet morphed (T' = 2 T);
//  - when a centre snaps, the strips that change hands are fully morphed on the fine side and
//    unmorphed on the coarse side, so they are identical geometry: no seams and no popping.
// Every coordinate is a multiple of a power of two, so shared vertices are bit-identical.
// `tests/unit/water-mesh.test.ts` proves the edges match for many camera positions.
import { BufferAttribute, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedBufferGeometry, Box3, Vector3 } from 'three/webgpu';

export interface ClipmapOptions {
  grid: number;       // quads per tile edge (even)
  tile0: number;      // level-0 tile size in metres
  levels: number;     // number of levels, including level 0
  halfTiles: number;  // tiles from the centre to a level's edge (4)
}
export const CLIPMAP_DEFAULTS: ClipmapOptions = { grid: 8, tile0: 8, levels: 13, halfTiles: 4 };
export const MORPH_START = 2.5, MORPH_END = 3, MORPH_EPSILON = 1e-3;

export function maxTiles(o: ClipmapOptions): number { const n = 2 * o.halfTiles; return n * n + (o.levels - 1) * (n * n - (n / 2) * (n / 2)); }
export function levelExtent(o: ClipmapOptions, level: number): number { return o.halfTiles * o.tile0 * 2 ** level; }
export function vertexCount(o: ClipmapOptions): number { return maxTiles(o) * (o.grid + 1) ** 2; }

/** Unit grid on [0,1]^2 in XZ (y = 0) with a consistent diagonal, so a fully morphed tile equals the next level's grid. */
export function createTileGeometry(o: ClipmapOptions): InstancedBufferGeometry {
  const g = o.grid, positions = new Float32Array((g + 1) * (g + 1) * 3), index: number[] = [];
  for (let j = 0; j <= g; j++) for (let i = 0; i <= g; i++) { const v = (j * (g + 1) + i) * 3; positions[v] = i / g; positions[v + 2] = j / g; }
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const a = j * (g + 1) + i, b = a + 1, c = a + g + 1, d = c + 1;
    index.push(a, c, d, a, d, b); // counter-clockwise seen from +Y
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const patch = new InstancedBufferAttribute(new Float32Array(maxTiles(o) * 4), 4);
  patch.setUsage(DynamicDrawUsage);
  geometry.setAttribute('tilePatch', patch);
  geometry.instanceCount = 0;
  return geometry;
}

const box = new Box3(), lo = new Vector3(), hi = new Vector3();
/**
 * Writes the visible tiles for a camera at (cx, cz) into `out` and returns their count.
 * `amplitude` pads the tile boxes vertically for displacement; `frustum` is optional (tests omit it).
 */
export function selectTiles(o: ClipmapOptions, cx: number, cz: number, out: Float32Array, frustum?: Frustum, amplitude = 2): number {
  let count = 0, innerX0 = 0, innerZ0 = 0, innerX1 = 0, innerZ1 = 0;
  const k = o.halfTiles;
  for (let level = 0; level < o.levels; level++) {
    const t = o.tile0 * 2 ** level, snap = 2 * t;
    const ox = Math.round(cx / snap) * snap, oz = Math.round(cz / snap) * snap;
    for (let j = -k; j < k; j++) for (let i = -k; i < k; i++) {
      const x0 = ox + i * t, z0 = oz + j * t;
      if (level > 0 && x0 >= innerX0 && x0 + t <= innerX1 && z0 >= innerZ0 && z0 + t <= innerZ1) continue;
      if (frustum) { box.set(lo.set(x0, -amplitude, z0), hi.set(x0 + t, amplitude, z0 + t)); if (!frustum.intersectsBox(box)) continue; }
      out[count * 4] = x0; out[count * 4 + 1] = z0; out[count * 4 + 2] = t; out[count * 4 + 3] = level; count++;
    }
    innerX0 = ox - k * t; innerX1 = ox + k * t; innerZ0 = oz - k * t; innerZ1 = oz + k * t;
  }
  return count;
}

/** CPU mirror of the vertex shader's morph: grid vertex (i, j) of a tile, camera at (cx, cz). */
export function morphVertex(o: ClipmapOptions, patch: ArrayLike<number>, i: number, j: number, cx: number, cz: number): [number, number] {
  const x0 = patch[0]!, z0 = patch[1]!, t = patch[2]!, s = t / o.grid;
  const x = x0 + (i / o.grid) * t, z = z0 + (j / o.grid) * t;
  const cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz)), a = t * (MORPH_START + MORPH_EPSILON), b = t * (MORPH_END - MORPH_EPSILON);
  const m = Math.min(1, Math.max(0, (cheb - a) / (b - a)));
  return [x - (i % 2) * s * m, z - (j % 2) * s * m];
}
