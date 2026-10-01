// Geometry for the clearance tests (sim-spec 12 test 3): static triangles clipped to a band of heights and indexed in
// plan (XZ); prisms (a convex plan polygon over a height range) measured against them. The distance a prism reports is
// sqrt(plan distance^2 + height gap^2), which never exceeds the true 3D distance (so it can only err on the strict side).
import type { WorldTriangles } from './fab-geometry';

/** A static triangle clipped to the band: its plan polygon (x0, z0, x1, z1, ...; convex, possibly a segment) and heights. */
export interface Piece { poly: Float64Array; yMin: number; yMax: number; owner: number; minX: number; maxX: number; minZ: number; maxZ: number }

function clip(poly: number[][], f: (p: number[]) => number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]);
    }
  }
  return out;
}

/** The triangles' parts inside heights [lo, hi], as plan pieces. */
export function slabPieces(t: WorldTriangles, lo: number, hi: number, keep: (owner: number) => boolean = () => true): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < t.count; i++) {
    if (!keep(t.owner[i]!)) continue;
    const o = i * 9, tr = t.tris;
    let poly = [[tr[o]!, tr[o + 1]!, tr[o + 2]!], [tr[o + 3]!, tr[o + 4]!, tr[o + 5]!], [tr[o + 6]!, tr[o + 7]!, tr[o + 8]!]];
    poly = clip(clip(poly, p => p[1]! - lo), p => hi - p[1]!);
    if (!poly.length) continue;
    const xz = new Float64Array(poly.length * 2);
    let yMin = Infinity, yMax = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    poly.forEach((p, k) => {
      xz[k * 2] = p[0]!; xz[k * 2 + 1] = p[2]!;
      yMin = Math.min(yMin, p[1]!); yMax = Math.max(yMax, p[1]!);
      minX = Math.min(minX, p[0]!); maxX = Math.max(maxX, p[0]!); minZ = Math.min(minZ, p[2]!); maxZ = Math.max(maxZ, p[2]!);
    });
    out.push({ poly: xz, yMin, yMax, owner: t.owner[i]!, minX, maxX, minZ, maxZ });
  }
  return out;
}

/** A uniform plan grid over pieces. */
export class PlanGrid {
  private readonly cells = new Map<number, number[]>();
  private stamp: Int32Array;
  private tick = 0;
  constructor(readonly pieces: readonly Piece[], readonly cell = 0.5) {
    pieces.forEach((p, i) => {
      for (let x = Math.floor(p.minX / cell); x <= Math.floor(p.maxX / cell); x++)
        for (let z = Math.floor(p.minZ / cell); z <= Math.floor(p.maxZ / cell); z++) {
          const k = (x + 10000) * 20000 + (z + 10000);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(i);
        }
    });
    this.stamp = new Int32Array(pieces.length);
  }
  /** Pieces whose plan boxes may lie within the box [minX, maxX] x [minZ, maxZ]. */
  near(minX: number, maxX: number, minZ: number, maxZ: number, visit: (piece: Piece, index: number) => void): void {
    this.tick++;
    const c = this.cell;
    for (let x = Math.floor(minX / c); x <= Math.floor(maxX / c); x++)
      for (let z = Math.floor(minZ / c); z <= Math.floor(maxZ / c); z++) {
        for (const i of this.cells.get((x + 10000) * 20000 + (z + 10000)) ?? []) {
          if (this.stamp[i] === this.tick) continue;
          this.stamp[i] = this.tick;
          const p = this.pieces[i]!;
          if (p.maxX < minX || p.minX > maxX || p.maxZ < minZ || p.minZ > maxZ) continue;
          visit(p, i);
        }
      }
  }
}

function pointSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function cross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number { return (bx - ax) * (cz - az) - (bz - az) * (cx - ax); }
function segmentsCross(a: Float64Array, i: number, j: number, b: Float64Array, k: number, l: number): boolean {
  const d1 = cross(b[k]!, b[k + 1]!, b[l]!, b[l + 1]!, a[i]!, a[i + 1]!), d2 = cross(b[k]!, b[k + 1]!, b[l]!, b[l + 1]!, a[j]!, a[j + 1]!);
  const d3 = cross(a[i]!, a[i + 1]!, a[j]!, a[j + 1]!, b[k]!, b[k + 1]!), d4 = cross(a[i]!, a[i + 1]!, a[j]!, a[j + 1]!, b[l]!, b[l + 1]!);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Whether (px, pz) lies inside the convex polygon (either winding; a polygon without area contains nothing). */
function inside(px: number, pz: number, p: Float64Array): boolean {
  const n = p.length / 2;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, c = cross(p[i * 2]!, p[i * 2 + 1]!, p[j * 2]!, p[j * 2 + 1]!, px, pz);
    if (Math.abs(c) < 1e-12) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Plan distance between two convex polygons (flat x, z arrays; segments and points allowed); 0 when they overlap. */
export function planDistance(a: Float64Array, b: Float64Array): number {
  const na = a.length / 2, nb = b.length / 2;
  let d = Infinity;
  for (let i = 0; i < na; i++) {
    const px = a[i * 2]!, pz = a[i * 2 + 1]!;
    for (let k = 0; k < nb; k++) { const l = (k + 1) % nb; d = Math.min(d, pointSegment(px, pz, b[k * 2]!, b[k * 2 + 1]!, b[l * 2]!, b[l * 2 + 1]!)); }
  }
  for (let k = 0; k < nb; k++) {
    const px = b[k * 2]!, pz = b[k * 2 + 1]!;
    for (let i = 0; i < na; i++) { const j = (i + 1) % na; d = Math.min(d, pointSegment(px, pz, a[i * 2]!, a[i * 2 + 1]!, a[j * 2]!, a[j * 2 + 1]!)); }
  }
  if (d === 0) return 0;
  if (inside(a[0]!, a[1]!, b) || inside(b[0]!, b[1]!, a)) return 0;
  for (let i = 0; i < na; i++) for (let k = 0; k < nb; k++) if (segmentsCross(a, i * 2, ((i + 1) % na) * 2, b, k * 2, ((k + 1) % nb) * 2)) return 0;
  return d;
}

/** The plan rectangle of a box centred at (cx, cz) with its length along (tx, tz): half-length hl, half-width hw. */
export function rectangle(cx: number, cz: number, tx: number, tz: number, hl: number, hw: number): Float64Array {
  const nx = -tz, nz = tx;
  return Float64Array.from([
    cx + tx * hl + nx * hw, cz + tz * hl + nz * hw, cx - tx * hl + nx * hw, cz - tz * hl + nz * hw,
    cx - tx * hl - nx * hw, cz - tz * hl - nz * hw, cx + tx * hl - nx * hw, cz + tz * hl - nz * hw,
  ]);
}

export interface Nearest { distance: number; piece: number }
/** The nearest piece to a prism (plan polygon over heights [y0, y1]) within `reach`, among the pieces `keep` accepts. */
export function nearestPiece(grid: PlanGrid, poly: Float64Array, y0: number, y1: number, reach: number, keep: (piece: Piece) => boolean = () => true): Nearest {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < poly.length; i += 2) { minX = Math.min(minX, poly[i]!); maxX = Math.max(maxX, poly[i]!); minZ = Math.min(minZ, poly[i + 1]!); maxZ = Math.max(maxZ, poly[i + 1]!); }
  const best: Nearest = { distance: Infinity, piece: -1 };
  grid.near(minX - reach, maxX + reach, minZ - reach, maxZ + reach, (p, i) => {
    if (!keep(p)) return;
    const dy = Math.max(0, y0 - p.yMax, p.yMin - y1);
    if (dy >= reach || dy >= best.distance) return;
    const d = Math.hypot(planDistance(poly, p.poly), dy);
    if (d < best.distance) { best.distance = d; best.piece = i; }
  });
  return best;
}

// ---- Exact 3D distance between triangle soups (FF3, D-42: the subfab kit against the section module) ---------------

/** Squared distance from point p (at offset op of pa) to the triangle at offset ot of t (Ericson, closest point). */
function pointTriangle2(pa: Float64Array, op: number, t: Float64Array, ot: number): number {
  const px = pa[op]!, py = pa[op + 1]!, pz = pa[op + 2]!;
  const ax = t[ot]!, ay = t[ot + 1]!, az = t[ot + 2]!, bx = t[ot + 3]!, by = t[ot + 4]!, bz = t[ot + 5]!, cx = t[ot + 6]!, cy = t[ot + 7]!, cz = t[ot + 8]!;
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return at(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(ax + abx * v, ay + aby * v, az + abz * v); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(ax + acx * w, ay + acy * w, az + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w); }
  const den = va + vb + vc;
  if (den <= 0) return Math.min(at(ax, ay, az), at(bx, by, bz), at(cx, cy, cz));
  const v = vb / den, w = vc / den;
  return at(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/** Squared distance between segments p1q1 (offsets in s) and p2q2 (offsets in u) (Ericson, closest points). */
function segmentSegment2(s: Float64Array, o1: number, e1: number, u: Float64Array, o2: number, e2: number): number {
  const d1x = s[e1]! - s[o1]!, d1y = s[e1 + 1]! - s[o1 + 1]!, d1z = s[e1 + 2]! - s[o1 + 2]!;
  const d2x = u[e2]! - u[o2]!, d2y = u[e2 + 1]! - u[o2 + 1]!, d2z = u[e2 + 2]! - u[o2 + 2]!;
  const rx = s[o1]! - u[o2]!, ry = s[o1 + 1]! - u[o2 + 1]!, rz = s[o1 + 2]! - u[o2 + 2]!;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let sc = 0, tc = 0;
  if (a <= 1e-18 && e <= 1e-18) return rx * rx + ry * ry + rz * rz;
  if (a <= 1e-18) tc = clamp(f / e);
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-18) sc = clamp(-c / a);
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      sc = den > 0 ? clamp((b * f - c * e) / den) : 0;
      tc = (b * sc + f) / e;
      if (tc < 0) { tc = 0; sc = clamp(-c / a); } else if (tc > 1) { tc = 1; sc = clamp((b - c) / a); }
    }
  }
  const x = rx + d1x * sc - d2x * tc, y = ry + d1y * sc - d2y * tc, z = rz + d1z * sc - d2z * tc;
  return x * x + y * y + z * z;
}

/** True when segment pq (offsets op, oq in s) meets the triangle at offset ot of t (touching included; a segment lying
 *  in the triangle's plane is left to the edge distances). */
function segmentMeetsTriangle(s: Float64Array, op: number, oq: number, t: Float64Array, ot: number): boolean {
  const ax = t[ot]!, ay = t[ot + 1]!, az = t[ot + 2]!;
  const e1x = t[ot + 3]! - ax, e1y = t[ot + 4]! - ay, e1z = t[ot + 5]! - az, e2x = t[ot + 6]! - ax, e2y = t[ot + 7]! - ay, e2z = t[ot + 8]! - az;
  const dx = s[oq]! - s[op]!, dy = s[oq + 1]! - s[op + 1]!, dz = s[oq + 2]! - s[op + 2]!;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det, wx = s[op]! - ax, wy = s[op + 1]! - ay, wz = s[op + 2]! - az, bu = (wx * hx + wy * hy + wz * hz) * inv;
  if (bu < 0 || bu > 1) return false;
  const qx = wy * e1z - wz * e1y, qy = wz * e1x - wx * e1z, qz = wx * e1y - wy * e1x, bv = (dx * qx + dy * qy + dz * qz) * inv;
  if (bv < 0 || bu + bv > 1) return false;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return tt >= 0 && tt <= 1;
}

/** The exact distance between the triangles at offsets oa of a and ob of b: 0 where they touch or cross, otherwise the
 *  least vertex-to-triangle or edge-to-edge distance (exact for disjoint triangles). */
export function triangleDistance(a: Float64Array, oa: number, b: Float64Array, ob: number): number {
  for (let s = 0; s < 3; s++) {
    const i = oa + s * 3, j = oa + ((s + 1) % 3) * 3, k = ob + s * 3, l = ob + ((s + 1) % 3) * 3;
    if (segmentMeetsTriangle(a, i, j, b, ob) || segmentMeetsTriangle(b, k, l, a, oa)) return 0;
  }
  let d2 = Infinity;
  for (let s = 0; s < 3; s++) {
    d2 = Math.min(d2, pointTriangle2(a, oa + s * 3, b, ob), pointTriangle2(b, ob + s * 3, a, oa));
    for (let t = 0; t < 3; t++) d2 = Math.min(d2, segmentSegment2(a, oa + s * 3, oa + ((s + 1) % 3) * 3, b, ob + t * 3, ob + ((t + 1) % 3) * 3));
  }
  return Math.sqrt(d2);
}

function triangleBoxes(t: Float64Array): Float64Array {
  const n = t.length / 9, out = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const o = i * 9 + k;
    out[i * 6 + k] = Math.min(t[o]!, t[o + 3]!, t[o + 6]!);
    out[i * 6 + 3 + k] = Math.max(t[o]!, t[o + 3]!, t[o + 6]!);
  }
  return out;
}
const boxGap = (p: Float64Array, i: number, q: Float64Array, j: number) =>
  Math.hypot(Math.max(0, p[i]! - q[j + 3]!, q[j]! - p[i + 3]!), Math.max(0, p[i + 1]! - q[j + 4]!, q[j + 1]! - p[i + 4]!), Math.max(0, p[i + 2]! - q[j + 5]!, q[j + 2]! - p[i + 5]!));

export interface SoupNearest { distance: number; a: number; b: number }
/** The exact least distance between two triangle soups (9 numbers per triangle) and the nearest pair's triangle indices,
 *  when it is under `reach` (otherwise distance Infinity and indices -1). */
export function soupDistance(a: Float64Array, b: Float64Array, reach: number): SoupNearest {
  const best: SoupNearest = { distance: Infinity, a: -1, b: -1 };
  if (!a.length || !b.length) return best;
  const ba = soupBounds(a), boxA = triangleBoxes(a), boxB = triangleBoxes(b), whole = Float64Array.from([...ba.min, ...ba.max]);
  const near: number[] = [];
  for (let j = 0; j < boxB.length; j += 6) if (boxGap(whole, 0, boxB, j) < reach) near.push(j);
  let bound = reach;
  for (let i = 0; i < boxA.length; i += 6) {
    for (const j of near) {
      if (boxGap(boxA, i, boxB, j) >= bound) continue;
      const d = triangleDistance(a, (i / 6) * 9, b, (j / 6) * 9);
      if (d < bound) { bound = d; best.distance = d; best.a = i / 6; best.b = j / 6; if (d === 0) return best; }
    }
  }
  return best;
}

/** Bounds of a triangle soup (9 numbers per triangle). */
export function soupBounds(t: Float64Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, t[i + k]!); max[k] = Math.max(max[k]!, t[i + k]!); }
  return { min, max };
}

export interface Crossing { count: number; depth: number; at: [number, number, number] | null }
/**
 * Interpenetration of two triangle soups (9 numbers per triangle): an edge of one crosses a triangle of the other with
 * both ends at least `eps` off the triangle's plane on opposite sides and the crossing point at least `eps` inside all
 * three of its edges. Touching, grazing and coplanar contact do not count, so parts that seat against each other pass.
 * `depth` is the largest min(end distances) over the crossings, a measure of how deep the worst one goes.
 */
export function crossings(a: Float64Array, b: Float64Array, eps = 1e-4): Crossing {
  const out: Crossing = { count: 0, depth: 0, at: null };
  const ba = soupBounds(a), bb = soupBounds(b), lo = [0, 0, 0], hi = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    lo[k] = Math.max(ba.min[k]!, bb.min[k]!) - eps; hi[k] = Math.min(ba.max[k]!, bb.max[k]!) + eps;
    if (lo[k]! > hi[k]!) return out;
  }
  // Only triangles reaching into the overlap of the two bounds can take part.
  const near = (t: Float64Array) => {
    const keep: number[] = [];
    for (let i = 0; i < t.length; i += 9) {
      let inBox = true;
      for (let k = 0; k < 3 && inBox; k++) inBox = Math.max(t[i + k]!, t[i + 3 + k]!, t[i + 6 + k]!) >= lo[k]! && Math.min(t[i + k]!, t[i + 3 + k]!, t[i + 6 + k]!) <= hi[k]!;
      if (inBox) for (let j = 0; j < 9; j++) keep.push(t[i + j]!);
    }
    return Float64Array.from(keep);
  };
  const na = near(a), nb = near(b);
  edgesAgainst(na, nb, eps, out);
  edgesAgainst(nb, na, eps, out);
  return out;
}

function edgesAgainst(edgesOf: Float64Array, tris: Float64Array, eps: number, out: Crossing): void {
  const nt = tris.length / 9, box = new Float64Array(nt * 6), nrm = new Float64Array(nt * 4);
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      box[t * 6 + k] = Math.min(tris[o + k]!, tris[o + 3 + k]!, tris[o + 6 + k]!);
      box[t * 6 + 3 + k] = Math.max(tris[o + k]!, tris[o + 3 + k]!, tris[o + 6 + k]!);
    }
    const ux = tris[o + 3]! - tris[o]!, uy = tris[o + 4]! - tris[o + 1]!, uz = tris[o + 5]! - tris[o + 2]!;
    const vx = tris[o + 6]! - tris[o]!, vy = tris[o + 7]! - tris[o + 1]!, vz = tris[o + 8]! - tris[o + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) { nrm[t * 4 + 3] = 0; continue; }
    nx /= l; ny /= l; nz /= l;
    nrm[t * 4] = nx; nrm[t * 4 + 1] = ny; nrm[t * 4 + 2] = nz; nrm[t * 4 + 3] = 1;
  }
  const ne = edgesOf.length / 9;
  for (let e = 0; e < ne; e++) {
    for (let s = 0; s < 3; s++) {
      const i = e * 9 + s * 3, j = e * 9 + ((s + 1) % 3) * 3;
      const px = edgesOf[i]!, py = edgesOf[i + 1]!, pz = edgesOf[i + 2]!, qx = edgesOf[j]!, qy = edgesOf[j + 1]!, qz = edgesOf[j + 2]!;
      const lx = Math.min(px, qx), hx = Math.max(px, qx), ly = Math.min(py, qy), hy = Math.max(py, qy), lz = Math.min(pz, qz), hz = Math.max(pz, qz);
      for (let t = 0; t < nt; t++) {
        const b6 = t * 6;
        if (hx < box[b6]! || lx > box[b6 + 3]! || hy < box[b6 + 1]! || ly > box[b6 + 4]! || hz < box[b6 + 2]! || lz > box[b6 + 5]!) continue;
        if (nrm[t * 4 + 3] === 0) continue;
        const o = t * 9, nx = nrm[t * 4]!, ny = nrm[t * 4 + 1]!, nz = nrm[t * 4 + 2]!;
        const ax = tris[o]!, ay = tris[o + 1]!, az = tris[o + 2]!;
        const dp = nx * (px - ax) + ny * (py - ay) + nz * (pz - az), dq = nx * (qx - ax) + ny * (qy - ay) + nz * (qz - az);
        if (!((dp > eps && dq < -eps) || (dp < -eps && dq > eps))) continue;
        const f = dp / (dp - dq), xx = px + (qx - px) * f, xy = py + (qy - py) * f, xz = pz + (qz - pz) * f;
        let inside = true;
        for (let k = 0; k < 3 && inside; k++) {
          const c = o + k * 3, d = o + ((k + 1) % 3) * 3;
          const ex = tris[d]! - tris[c]!, ey = tris[d + 1]! - tris[c + 1]!, ez = tris[d + 2]! - tris[c + 2]!;
          const wx = xx - tris[c]!, wy = xy - tris[c + 1]!, wz = xz - tris[c + 2]!;
          // (e x w) . n / |e|: the in-plane distance of the point inside this edge (positive inside for CCW about n)
          const cx = ey * wz - ez * wy, cy = ez * wx - ex * wz, cz = ex * wy - ey * wx;
          inside = (cx * nx + cy * ny + cz * nz) / Math.hypot(ex, ey, ez) > eps;
        }
        if (!inside) continue;
        out.count++;
        const depth = Math.min(Math.abs(dp), Math.abs(dq));
        if (depth > out.depth) { out.depth = depth; out.at = [xx, xy, xz]; }
      }
    }
  }
}
