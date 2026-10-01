// The roadway height grid used by traffic, the player car, flights and the layout's lane polylines.
// Pure three.js math (no renderer, no kit), so Node scripts share it with the runtime.
import { Vector3 } from 'three/webgpu';
import type { Mesh, Object3D } from 'three/webgpu';
import { BRIDGE } from '../constants';

/** Roadway top surface sampled on a regular grid (metres). */
export interface RoadGrid { x0: number; z0: number; dx: number; dz: number; nx: number; nz: number; heights: Float32Array }
export const ROAD_GRID_SPACING = { dx: .5, dz: 1 } as const;

/** Rasterises the `Roadway` mesh (top surface, max Y) onto a grid covering the carriageway. */
export function rasterizeRoad(roadway: Object3D): RoadGrid {
  const half = BRIDGE.roadHalfWidth, x0 = -Math.ceil(half), z0 = -Math.ceil(BRIDGE.roadEndZ), { dx, dz } = ROAD_GRID_SPACING;
  const nx = Math.round(-2 * x0 / dx) + 1, nz = Math.round(-2 * z0 / dz) + 1, heights = new Float32Array(nx * nz).fill(Number.NaN);
  roadway.updateWorldMatrix(true, true);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  roadway.traverse(node => {
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, count = index ? index.count : position.count;
    const vertex = (i: number, out: Vector3) => out.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    for (let t = 0; t < count; t += 3) {
      vertex(t, a); vertex(t + 1, b); vertex(t + 2, c);
      const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z); if (Math.abs(area) < 1e-9) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - x0) / dx - 1e-6)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / dx + 1e-6));
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - z0) / dz - 1e-6)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / dz + 1e-6));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + i * dx, pz = z0 + j * dz;
        const w1 = ((b.x - px) * (c.z - pz) - (c.x - px) * (b.z - pz)) / area, w2 = ((c.x - px) * (a.z - pz) - (a.x - px) * (c.z - pz)) / area, w3 = 1 - w1 - w2;
        if (w1 < -1e-5 || w2 < -1e-5 || w3 < -1e-5) continue;
        const y = w1 * a.y + w2 * b.y + w3 * c.y, k = j * nx + i;
        if (!(heights[k]! >= y)) heights[k] = y;
      }
    }
  });
  // Fill any gap (a grid point exactly on an edge the rasteriser skipped) from its row neighbours.
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!Number.isNaN(heights[k]!)) continue;
    for (let r = 1; r < nx; r++) {
      const left = i - r >= 0 ? heights[k - r]! : Number.NaN, right = i + r < nx ? heights[k + r]! : Number.NaN;
      if (!Number.isNaN(left) || !Number.isNaN(right)) { heights[k] = Number.isNaN(left) ? right : Number.isNaN(right) ? left : (left + right) / 2; break; }
    }
  }
  // Rows past the road ends (|z| > roadEndZ) hold no roadway: they repeat the last covered row, so a
  // lookup at the very end of a lane stays finite.
  const covered = (j: number) => !Number.isNaN(heights[j * nx]!);
  for (let j = 0; j < nz; j++) {
    if (covered(j)) continue;
    let source = -1;
    for (let r = 1; r < nz && source < 0; r++) source = j - r >= 0 && covered(j - r) ? j - r : j + r < nz && covered(j + r) ? j + r : -1;
    if (source >= 0) heights.copyWithin(j * nx, source * nx, source * nx + nx);
  }
  return { x0, z0, dx, dz, nx, nz, heights };
}
export function roadHeight(grid: RoadGrid, x: number, z: number): number {
  const fx = Math.max(0, Math.min(grid.nx - 1, (x - grid.x0) / grid.dx)), fz = Math.max(0, Math.min(grid.nz - 1, (z - grid.z0) / grid.dz));
  const i0 = Math.min(grid.nx - 2, Math.floor(fx)), j0 = Math.min(grid.nz - 2, Math.floor(fz)), tx = fx - i0, tz = fz - j0, h = grid.heights, w = grid.nx;
  const a = h[j0 * w + i0]!, b = h[j0 * w + i0 + 1]!, c = h[(j0 + 1) * w + i0]!, d = h[(j0 + 1) * w + i0 + 1]!;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
/** Road pitch (rise over run along +Z) for orienting vehicles. */
export function roadSlope(grid: RoadGrid, x: number, z: number): number { return (roadHeight(grid, x, z + 2) - roadHeight(grid, x, z - 2)) / 4; }
