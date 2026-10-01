// SPDX-License-Identifier: MIT
// Typed-array mesh building along an approach (fix round 2's approach roads, fix round 3's dressing): frames at
// approach stations, points at a lateral offset along the approach's own N, and planar quads, boxes and prisms
// with outward normals and metre UVs. Pure: no three.js.
import { horizontalAt, lateral, profileAt } from './alignment';
import type { Approach } from './route';

export interface MeshArrays { position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint32Array | Uint16Array }
export type V3 = [number, number, number];
export interface Frame { x: number; z: number; tx: number; tz: number; nx: number; nz: number; y: number }
export function frame(a: Approach, s: number): Frame {
  const h = horizontalAt(a.horizontal, s), [nx, nz] = lateral(h.tx, h.tz);
  return { x: h.x, z: h.z, tx: h.tx, tz: h.tz, nx, nz, y: profileAt(a.profile, s).y };
}
/** Scene point at lateral offset d (along the approach's own N) and height dy above the road (or at absolute y when `abs`). */
export const at = (f: Frame, d: number, dy: number, abs = false): V3 => [f.x + f.nx * d, abs ? dy : f.y + dy, f.z + f.nz * d];

export class Arrays {
  p: number[] = []; n: number[] = []; t: number[] = []; i: number[] = [];
  /**
   * A planar quad a-b-c-d (in order around it) whose normal agrees with `out`. UVs are given per corner, or
   * box-projected from the positions in metres (plan faces x/z, walls along their larger horizontal axis and y).
   */
  quad(a: V3, b: V3, c: V3, d: V3, out: V3, uv?: [number, number][]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
    // Sum of both triangles' normals: robust when one of them is degenerate (a tapered end).
    let nx = (uy * vz - uz * vy) + (vy * wz - vz * wy), ny = (uz * vx - ux * vz) + (vz * wx - vx * wz), nz = (ux * vy - uy * vx) + (vx * wy - vy * wx);
    const len = Math.hypot(nx, ny, nz); if (len < 1e-9) return;
    let corners: V3[] = [a, b, c, d], uvs = uv;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { corners = [a, d, c, b]; nx = -nx; ny = -ny; nz = -nz; if (uvs) uvs = [uvs[0]!, uvs[3]!, uvs[2]!, uvs[1]!]; }
    nx /= len; ny /= len; nz /= len;
    const base = this.p.length / 3, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    corners.forEach((q, k) => {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz);
      if (uvs) this.t.push(uvs[k]![0], uvs[k]![1]);
      else if (ay >= ax && ay >= az) this.t.push(q[0], q[2]);
      else if (ax >= az) this.t.push(q[2], q[1]);
      else this.t.push(q[0], q[1]);
    });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** A triangle whose normal agrees with `out`, UVs box-projected from the positions in metres (as quad). */
  tri(a: V3, b: V3, c: V3, out: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz); if (len < 1e-9) return;
    let corners: V3[] = [a, b, c];
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { corners = [a, c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const base = this.p.length / 3, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (const q of corners) {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx / len, ny / len, nz / len);
      if (ay >= ax && ay >= az) this.t.push(q[0], q[2]); else if (ax >= az) this.t.push(q[2], q[1]); else this.t.push(q[0], q[1]);
    }
    this.i.push(base, base + 1, base + 2);
  }
  /** A box between two frames (s-ends), lateral range [d0, d1] and absolute heights: the listed faces. */
  box(f0: Frame, f1: Frame, d0: number, d1: number, y0: [number, number], y1: [number, number], faces: { start?: boolean; end?: boolean; sides?: boolean; top?: boolean; bottom?: boolean }): void {
    this.prism(f0, f1, [d0, d1], [d0, d1], y0, y1, faces);
  }
  /**
   * A prism between two frames whose lateral range (d0 < d1, along the approach's N) may differ at each end, from
   * absolute [bottom, top] heights at each end: the listed faces (sides unless `sides` is false).
   */
  prism(f0: Frame, f1: Frame, r0: [number, number], r1: [number, number], y0: [number, number], y1: [number, number], faces: { start?: boolean; end?: boolean; sides?: boolean; top?: boolean; bottom?: boolean }): void {
    const p = (f: Frame, d: number, y: number) => at(f, d, y, true), T: V3 = [f0.tx, 0, f0.tz], N: V3 = [f0.nx, 0, f0.nz];
    const [b0, t0] = y0, [b1, t1] = y1;
    if (faces.sides !== false) {
      this.quad(p(f0, r0[0], b0), p(f1, r1[0], b1), p(f1, r1[0], t1), p(f0, r0[0], t0), [-N[0], 0, -N[2]]);
      this.quad(p(f0, r0[1], b0), p(f1, r1[1], b1), p(f1, r1[1], t1), p(f0, r0[1], t0), N);
    }
    if (faces.top) this.quad(p(f0, r0[0], t0), p(f1, r1[0], t1), p(f1, r1[1], t1), p(f0, r0[1], t0), [0, 1, 0]);
    if (faces.bottom) this.quad(p(f0, r0[0], b0), p(f1, r1[0], b1), p(f1, r1[1], b1), p(f0, r0[1], b0), [0, -1, 0]);
    if (faces.start) this.quad(p(f0, r0[0], b0), p(f0, r0[1], b0), p(f0, r0[1], t0), p(f0, r0[0], t0), [-T[0], 0, -T[2]]);
    if (faces.end) this.quad(p(f1, r1[0], b1), p(f1, r1[1], b1), p(f1, r1[1], t1), p(f1, r1[0], t1), T);
  }
  get empty(): boolean { return this.i.length === 0; }
  arrays(): MeshArrays {
    const count = this.p.length / 3;
    return { position: Float32Array.from(this.p), normal: Float32Array.from(this.n), uv: Float32Array.from(this.t), index: count > 65535 ? Uint32Array.from(this.i) : Uint16Array.from(this.i) };
  }
}
