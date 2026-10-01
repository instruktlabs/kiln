// SPDX-License-Identifier: MIT
// Approach roads (fix round 2, D-21): the derived fields of data/layout.json `approaches` and their
// checks, used by ./layout.ts (--write derives, --check recomputes and verifies).
//  - start: the deck end's elevation and grade, read from the bridge GLB's `Roadway` mesh, so a new
//    deck profile re-derives the approaches;
//  - profile: PVIs [station, elevation, curve length]: from the deck end at its grade through a vertical
//    curve to one grade and a second curve that meets the at-grade profile at `join.station`; the
//    at-grade profile is a least-squares quadratic B-spline (PVIs every `ground.spacing` m, curves
//    touching) fitted to the canonical near terrain across the paved width, overpass spans excluded;
//  - segments (structures with bents and abutments, at-grade stretches in cut, on fill or at grade),
//    the centreline polyline (5 mm) and the deviation from the imagery's road centre points;
//  - lane stations, entry and exit over the whole route.
// Checks: grade to the join, terrain penetrations and ground contact every 5 m over the paved width (with the
// toll plaza's extra width, fix round 3) on the corridor-edited canonical terrain of both near sets, the terrain
// under the dressing's own pavement (Vista Point's lot and throat, every PAD_CHECK m), structure spans, skirts,
// and the road's end stretch out of sight of the deck and the driving cameras.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { horizontalAt, horizontalProject, lateral, profileAt, checkProfile } from '../src/world/alignment';
import type { Horizontal } from '../src/world/alignment';
import { approachHorizontal, createRoute, routePoint, APPROACH_SIGN } from '../src/world/route';
import type { Approach, Route } from '../src/world/route';
import { applyCorridors, approachCorridorPlans } from '../src/world/corridor';
import type { CorridorPlan, TileArrays } from '../src/world/corridor';
import { polygonDistance } from '../src/world/dressing';
import type { RoadGrid } from '../src/world/road';
import type { ApproachName, ApproachSegment, LayoutLane, SceneApproaches, SceneLayout, Vec3 } from '../src/data';
import { nodeMeshes } from './layout';
import { CANONICAL_DIR } from './terrain-canonical';

export const APPROACH_NAMES: ApproachName[] = ['south', 'north'];
/** Sampling step of the checks along each centreline (m), as the review asks. */
export const CHECK_STEP = 5;
/** Sampling grid under the dressing's pavement (m), and how far below that pavement the terrain must stay (m). */
export const PAD_CHECK = 1.5, PAD_CLEAR = .05;
/** Largest grade from the deck end to the join (the review's 4 %). */
export const MAX_STRUCTURE_GRADE = .04;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------------------------
// Deck end from the Roadway mesh.

export interface DeckEnd { elevation: number; grade: number; /** Height spread across the end row (m). */ spread: number; row: number; previous: number }
/** The Roadway's end rows: elevation at |z| = roadEndZ and the grade of its last segment, as dy per metre away from the bridge. */
export function deckEnds(bytes: Uint8Array, roadEndZ: number): Record<ApproachName, DeckEnd> {
  const group = nodeMeshes(bytes, 'Roadway'), rows = new Map<number, number[]>(), v = new Vector3();
  group.traverse(node => {
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
      const key = Math.round(v.z * 1000) / 1000; if (!rows.has(key)) rows.set(key, []); rows.get(key)!.push(v.y);
    }
  });
  const zs = [...rows.keys()].sort((a, b) => a - b), top = (z: number) => Math.max(...rows.get(z)!);
  const end = (sign: 1 | -1): DeckEnd => {
    const ordered = sign > 0 ? [...zs].reverse() : zs, z = ordered[0]!, previous = ordered.find(q => Math.abs(q - z) > .05)!;
    if (Math.abs(Math.abs(z) - roadEndZ) > .01) throw new Error(`Roadway ends at z ${z}, not at roadEndZ ${sign * roadEndZ}`);
    const ys = rows.get(z)!, elevation = top(z);
    return { elevation, grade: (elevation - top(previous)) / Math.abs(z - previous), spread: Math.max(...ys) - Math.min(...ys), row: z, previous };
  };
  return { south: end(-1), north: end(1) };
}

// ---------------------------------------------------------------------------------------------------
// Canonical terrain: tiles and a height sampler.

export function loadTileArrays(level: 'near' | 'near_low'): TileArrays[] {
  return ['00', '01', '10', '11'].map(q => {
    const group = nodeMeshes(readFileSync(resolve(CANONICAL_DIR, `${level}_${q}.glb`)), 'world'), meshes: Mesh[] = [];
    group.traverse(node => { if ((node as Mesh).isMesh) meshes.push(node as Mesh); });
    if (meshes.length !== 1) throw new Error(`${level}_${q}: expected one mesh`);
    const mesh = meshes[0]!, source = mesh.geometry.getAttribute('position'), index = mesh.geometry.index!, v = new Vector3();
    const position = new Float32Array(source.count * 3);
    for (let i = 0; i < source.count; i++) { v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrix); position[i * 3] = v.x; position[i * 3 + 1] = v.y; position[i * 3 + 2] = v.z; }
    return { position, normal: new Float32Array(source.count * 3), uv: new Float32Array(source.count * 2), index: Uint32Array.from(index.array as ArrayLike<number>) };
  });
}

/** Height of a set of terrain tiles (the highest surface at a point; skirts ignored). */
export class Tin {
  private readonly p: Float64Array; private readonly t: Int32Array;
  private readonly cell = 16; private readonly x0: number; private readonly z0: number; private readonly nx: number; private readonly nz: number;
  private readonly start: Int32Array; private readonly items: Int32Array;
  constructor(tiles: readonly TileArrays[]) {
    const vertices = tiles.reduce((n, t) => n + t.position.length / 3, 0), tris: number[] = [];
    this.p = new Float64Array(vertices * 3);
    let base = 0;
    for (const tile of tiles) {
      this.p.set(tile.position, base * 3);
      for (let k = 0; k < tile.index.length; k += 3) {
        const a = tile.index[k]! + base, b = tile.index[k + 1]! + base, c = tile.index[k + 2]! + base;
        const area = (this.p[b * 3]! - this.p[a * 3]!) * (this.p[c * 3 + 2]! - this.p[a * 3 + 2]!) - (this.p[c * 3]! - this.p[a * 3]!) * (this.p[b * 3 + 2]! - this.p[a * 3 + 2]!);
        if (Math.abs(area) > 1e-6) tris.push(a, b, c);
      }
      base += tile.position.length / 3;
    }
    this.t = Int32Array.from(tris);
    let xmin = Infinity, zmin = Infinity, xmax = -Infinity, zmax = -Infinity;
    for (let i = 0; i < vertices; i++) { xmin = Math.min(xmin, this.p[i * 3]!); xmax = Math.max(xmax, this.p[i * 3]!); zmin = Math.min(zmin, this.p[i * 3 + 2]!); zmax = Math.max(zmax, this.p[i * 3 + 2]!); }
    this.x0 = xmin; this.z0 = zmin; this.nx = Math.ceil((xmax - xmin) / this.cell) + 1; this.nz = Math.ceil((zmax - zmin) / this.cell) + 1;
    const count = new Int32Array(this.nx * this.nz + 1), cells = (k: number, visit: (c: number) => void) => {
      const a = this.t[k]!, b = this.t[k + 1]!, c = this.t[k + 2]!;
      const i0 = Math.floor((Math.min(this.p[a * 3]!, this.p[b * 3]!, this.p[c * 3]!) - this.x0) / this.cell), i1 = Math.floor((Math.max(this.p[a * 3]!, this.p[b * 3]!, this.p[c * 3]!) - this.x0) / this.cell);
      const j0 = Math.floor((Math.min(this.p[a * 3 + 2]!, this.p[b * 3 + 2]!, this.p[c * 3 + 2]!) - this.z0) / this.cell), j1 = Math.floor((Math.max(this.p[a * 3 + 2]!, this.p[b * 3 + 2]!, this.p[c * 3 + 2]!) - this.z0) / this.cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) visit(j * this.nx + i);
    };
    for (let k = 0; k < this.t.length; k += 3) cells(k, c => count[c + 1]!++);
    for (let c = 0; c < this.nx * this.nz; c++) count[c + 1]! += count[c]!;
    this.start = count.slice(); this.items = new Int32Array(count[this.nx * this.nz]!);
    const fill = count.slice();
    for (let k = 0; k < this.t.length; k += 3) cells(k, c => { this.items[fill[c]!++] = k; });
  }
  /** Terrain height at (x, z); NaN where no tile covers the point. */
  height(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return Number.NaN;
    const c = j * this.nx + i, p = this.p, t = this.t;
    let best = Number.NaN;
    for (let n = this.start[c]!; n < this.start[c + 1]!; n++) {
      const k = this.items[n]!, a = t[k]! * 3, b = t[k + 1]! * 3, cc = t[k + 2]! * 3;
      const area = (p[b]! - p[a]!) * (p[cc + 2]! - p[a + 2]!) - (p[cc]! - p[a]!) * (p[b + 2]! - p[a + 2]!);
      const w1 = ((p[b]! - x) * (p[cc + 2]! - z) - (p[cc]! - x) * (p[b + 2]! - z)) / area, w2 = ((p[cc]! - x) * (p[a + 2]! - z) - (p[a]! - x) * (p[cc + 2]! - z)) / area, w3 = 1 - w1 - w2;
      if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
      const y = w1 * p[a + 1]! + w2 * p[b + 1]! + w3 * p[cc + 1]!;
      if (!(best >= y)) best = y;
    }
    return best;
  }
  /** True when the straight segment from a to b stays above the terrain (sampled every `step` metres; the last `skipEnd` metres are not tested). */
  clear(a: readonly number[], b: readonly number[], step = 2, skipEnd = 1): boolean {
    const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!, length = Math.hypot(dx, dy, dz), n = Math.max(2, Math.ceil(length / step));
    for (let i = 1; i < n; i++) {
      const t = i / n; if (t * length > length - skipEnd) break;
      const y = a[1]! + dy * t, h = this.height(a[0]! + dx * t, a[2]! + dz * t);
      if (h > y) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------
// Derivation.

/** Terrain across the paved width at station s: mean and highest of the samples. */
function across(tin: Tin, h: Horizontal, s: number, half: number): { mean: number; max: number; min: number } {
  const p = horizontalAt(h, s), [nx, nz] = lateral(p.tx, p.tz);
  let sum = 0, n = 0, max = -Infinity, min = Infinity;
  for (let d = -half; d <= half + 1e-9; d += half / 4) { const y = tin.height(p.x + nx * d, p.z + nz * d); if (Number.isFinite(y)) { sum += y; n++; max = Math.max(max, y); min = Math.min(min, y); } }
  return { mean: n ? sum / n : Number.NaN, max, min };
}
/** Solves A x = b (dense, partial pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) { const f = M[r]![c]! / M[c]![c]!; for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r]![n]!; for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!; x[r] = s / M[r]![r]!; }
  return x;
}
/** Smoothing weight of the at-grade fit (second differences of the control elevations). */
export const FIT_SMOOTHING = 2;
/**
 * Least-squares quadratic B-spline over [from, to]: control elevations c_-1 .. c_n at stations
 * from + (k + 1/2) spacing, so each control is a PVI whose vertical curve spans one spacing.
 */
export function fitGround(tin: Tin, h: Horizontal, from: number, to: number, spacing: number, exclude: readonly [number, number][], half: number): number[] {
  const n = Math.ceil((to - from) / spacing), m = n + 2, AtA = Array.from({ length: m }, () => new Array<number>(m).fill(0)), Atb = new Array<number>(m).fill(0);
  for (let s = from; s <= from + n * spacing + 1e-9; s += CHECK_STEP) {
    if (exclude.some(([a, b]) => s >= a && s <= b)) continue;
    const y = across(tin, h, s, half).mean; if (!Number.isFinite(y)) continue;
    const k = Math.min(n - 1, Math.floor((s - from) / spacing)), t = (s - from) / spacing - k, basis = [(1 - t) * (1 - t) / 2, (-2 * t * t + 2 * t + 1) / 2, t * t / 2];
    for (let a = 0; a < 3; a++) { Atb[k + a]! += basis[a]! * y; for (let b = 0; b < 3; b++) AtA[k + a]![k + b]! += basis[a]! * basis[b]!; }
  }
  for (let k = 1; k < m - 1; k++) { const row = [k - 1, k, k + 1], w = [1, -2, 1]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) AtA[row[a]!]![row[b]!]! += FIT_SMOOTHING * w[a]! * w[b]!; }
  return solve(AtA, Atb);
}

/** Ramer-Douglas-Peucker in 3-D: indices of the points to keep. */
function simplify3(points: readonly Vec3[], tolerance: number): number[] {
  const keep = new Set<number>([0, points.length - 1]), stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!, A = points[a]!, B = points[b]!, ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const P = points[i]!, ap = [P[0] - A[0], P[1] - A[1], P[2] - A[2]], t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / l2));
      const d = Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) { keep.add(at); stack.push([a, at], [at, b]); }
  }
  return [...keep].sort((x, y) => x - y);
}
export const CENTRELINE_TOLERANCE = .005;

export interface Derived { approaches: SceneApproaches; lanes: LayoutLane[] }
/** The approaches' derived fields and the lanes' route ends, from the authored fields, the bridge GLB and the canonical near terrain. */
export function deriveApproaches(layout: SceneLayout, bytes: Uint8Array, grid: RoadGrid, tin: Tin): Derived {
  const roadEndZ = layout.bridge.roadEndZ, cs = layout.approaches.crossSection, ends = deckEnds(bytes, roadEndZ);
  const out: SceneApproaches = { ...layout.approaches };
  for (const name of APPROACH_NAMES) {
    const data = layout.approaches[name], h = approachHorizontal(name, data.alignment, roadEndZ), end = ends[name];
    const { station: sc, curves: [L1, L2] } = data.join, sp = data.ground.spacing;
    const overpasses = data.structures.filter(s => s.kind === 'overpass').map(s => [s.from, s.to] as [number, number]);
    const c = fitGround(tin, h, sc, data.length + 40, sp, overpasses, cs.pavedHalfWidth);
    const yc = (c[0]! + c[1]!) / 2, gc = (c[1]! - c[0]!) / sp;
    const pvis: [number, number, number][] = [[0, end.elevation, 0], [L1 / 2, end.elevation + end.grade * L1 / 2, L1], [sc - L2 / 2, yc - gc * L2 / 2, L2]];
    for (let k = 1; k < c.length; k++) pvis.push([sc + (k - .5) * sp, c[k]!, k === c.length - 1 ? 0 : sp]);
    const profile = pvis.map(([s, y, l]) => [r3(s), r3(y), r3(l)] as [number, number, number]);
    checkProfile({ pvis: profile });
    const approach: Approach = { name, sign: APPROACH_SIGN[name], horizontal: h, profile: { pvis: profile }, length: data.length, data };
    // Segments: structures from the data; at-grade stretches by the terrain against the bed.
    const segments: ApproachSegment[] = [], A = cs.supports.abutment;
    const structureAt = (s: number) => data.structures.find(st => s >= st.from && s <= st.to);
    const raw: { kind: ApproachSegment['kind']; from: number; to: number }[] = [];
    for (let s = 0; s < data.length - 1e-9; s += CHECK_STEP) {
      const st = structureAt(s + CHECK_STEP / 2);
      let kind: ApproachSegment['kind'];
      if (st) kind = st.kind;
      else { const road = profileAt(approach.profile, s + CHECK_STEP / 2).y, t = across(tin, h, s + CHECK_STEP / 2, cs.pavedHalfWidth).mean, diff = t - (road - cs.pavement); kind = diff > .3 ? 'cut' : diff < -.3 ? 'fill' : 'grade'; }
      const to = Math.min(data.length, s + CHECK_STEP), last = raw.at(-1);
      if (last && last.kind === kind) last.to = to; else raw.push({ kind, from: s, to });
    }
    // Structures keep their authored ends; short at-grade runs merge into their neighbours.
    for (const st of data.structures) for (const r of raw) { if (r.kind === st.kind && r.from <= st.from + CHECK_STEP && r.to >= st.from) { r.from = st.from; } if (r.kind === st.kind && r.to >= st.to - CHECK_STEP && r.from <= st.to) r.to = st.to; }
    const merged: typeof raw = [];
    for (const r of raw) {
      const last = merged.at(-1), structure = r.kind === 'viaduct' || r.kind === 'overpass';
      if (last && !structure && last.kind !== 'viaduct' && last.kind !== 'overpass' && (r.to - r.from < 20 || last.kind === r.kind)) { last.to = r.to; continue; }
      if (last) r.from = last.to;
      merged.push({ ...r });
    }
    for (const r of merged) {
      const segment: ApproachSegment = { kind: r.kind, from: r3(r.from), to: r3(r.to) };
      if (r.kind === 'viaduct' || r.kind === 'overpass') {
        const a = r.from > 0 ? r.from + A : r.from, b = r.to < data.length ? r.to - A : r.to, spans = Math.max(1, Math.round((b - a) / cs.supports.spacing));
        segment.supports = Array.from({ length: spans - 1 }, (_, k) => r2(a + (b - a) * (k + 1) / spans));
        segment.abutments = [...(r.from > 0 ? [r.from + A / 2] : []), ...(r.to < data.length ? [r.to - A / 2] : [])].map(r2);
      }
      segments.push(segment);
    }
    // Centreline every metre, simplified to 5 mm.
    const samples: Vec3[] = [];
    for (let s = 0; s < data.length; s += 1) { const p = horizontalAt(h, s); samples.push([p.x, profileAt(approach.profile, s).y, p.z]); }
    { const p = horizontalAt(h, data.length); samples.push([p.x, profileAt(approach.profile, data.length).y, p.z]); }
    const centreline = simplify3(samples, CENTRELINE_TOLERANCE).map(i => samples[i]!.map(r3) as Vec3);
    // Imagery deviation: at grade raw; on structures corrected for relief displacement (-X by k per metre above the ground).
    let atGrade = 0, elevated = 0, elevatedRaw = 0;
    for (const [x, z] of data.imagery.reference) {
      const p = horizontalProject(h, x, z, 50); if (!p) continue;
      if (structureAt(p.s)) {
        const c0 = horizontalAt(h, p.s), above = Math.max(0, profileAt(approach.profile, p.s).y - tin.height(c0.x, c0.z));
        const q = horizontalProject(h, x + data.imagery.displacement * above, z, 50)!; elevated = Math.max(elevated, Math.abs(q.d)); elevatedRaw = Math.max(elevatedRaw, Math.abs(p.d));
      } else atGrade = Math.max(atGrade, Math.abs(p.d));
    }
    out[name] = { ...data, start: { elevation: r3(end.elevation), grade: +end.grade.toFixed(5) }, profile, segments, centreline, deviation: { atGrade: r2(atGrade), elevated: r2(elevated), elevatedRaw: r2(elevatedRaw), references: data.imagery.reference.length } };
  }
  const route = createRoute(grid, out, roadEndZ);
  const lanes = layout.lanes.map(lane => {
    const sign = lane.direction === 'north' ? 1 : -1, stations: [number, number] = sign > 0 ? [route.min, route.max] : [route.max, route.min];
    const at = (sigma: number): Vec3 => { const p = routePoint(route, sigma, lane.x); return [r3(p.x), r3(p.y), r3(p.z)]; };
    return { ...lane, entry: at(stations[0]), exit: at(stations[1]), stations: stations.map(r3) as [number, number] };
  });
  return { approaches: out, lanes };
}

// ---------------------------------------------------------------------------------------------------
// Checks.

export interface ApproachCheck {
  name: ApproachName; length: number; start: { elevation: number; grade: number };
  maxGradeToJoin: number; maxGradeAtGrade: number; segments: string[]; bents: number; abutments: number; longestSpan: number;
  deviation: { atGrade: number; elevated: number; references: number; tolerance: number };
  /**
   * Per near set: stations sampled, penetrations of the road (terrain above the road surface, or above the slab
   * soffit under a structure), stations without ground contact or support, skirt triangles the corridor re-heights
   * (a terrain pad across a tile edge), skirt corners above the edited surface (0 expected), uncovered triangles,
   * and the terrain under the dressing's pavement.
   */
  terrain: Record<'near' | 'near_low', { stations: number; samples: number; penetrations: number; worst: number; unsupported: number; skirts: number; skirtsAbove: number; uncovered: number; clipped: number; pieces: number; pads: PadCheck }>;
  /**
   * Sight lines from the deck, the review's drive pose and the driving cameras to the end stretch (where the
   * road dissolves and vehicles fade) that terrain does not block: counts, and per viewpoint kind the
   * nearest such sight line (m; null when none is clear) with an example.
   */
  visibility: { viewpoints: number; targets: number; visible: number; nearest: Record<SightKind, EndSight> };
}
/** The terrain under the dressing's pavement: grid samples inside the pads' outlines, those less than PAD_CLEAR below the pavement, and the highest terrain relative to it (m; null without samples). */
export interface PadCheck { samples: number; penetrations: number; worst: number | null }
export type SightKind = 'deck' | 'review' | 'drive';
export interface EndSight { visible: number; nearest: number | null; example: string }
/** Nearest distance (m) at which a viewpoint may see the end stretch: the fade happens at least this far away. */
export const MIN_END_SIGHT = 300;

export function corridorPlans(layout: Pick<SceneLayout, 'approaches' | 'bridge' | 'dressing'>): CorridorPlan[] { return approachCorridorPlans(layout.approaches, layout.bridge.roadEndZ, layout.dressing); }

export function checkApproaches(layout: SceneLayout, grid: RoadGrid, tiles: Record<'near' | 'near_low', TileArrays[]>, visibility = true): ApproachCheck[] {
  const cs = layout.approaches.crossSection, plans = corridorPlans(layout), route: Route = createRoute(grid, layout.approaches, layout.bridge.roadEndZ);
  const edited = {} as Record<'near' | 'near_low', { tin: Tin; stats: { clipped: number; pieces: number; skirts: number; skirtsAbove: number; uncovered: number } }>;
  for (const level of ['near', 'near_low'] as const) {
    const stats = { clipped: 0, pieces: 0, skirts: 0, uncovered: 0 }, result = tiles[level].map(tile => { const r = applyCorridors(tile, plans); for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] += r.stats[k]; return r; });
    // Skirt corners (vertical triangles) more than 1 mm above the edited surface: none may stand out of it.
    const tin = new Tin(result); let skirtsAbove = 0;
    for (const r of result) for (let k = 0; k < r.index.length; k += 3) {
      const P = r.position, a = r.index[k]! * 3, b = r.index[k + 1]! * 3, c = r.index[k + 2]! * 3;
      if (Math.abs((P[b]! - P[a]!) * (P[c + 2]! - P[a + 2]!) - (P[c]! - P[a]!) * (P[b + 2]! - P[a + 2]!)) >= 1e-6) continue;
      for (const v of [a, b, c]) if (P[v + 1]! > tin.height(P[v]!, P[v + 2]!) + 1e-3) skirtsAbove++;
    }
    edited[level] = { tin, stats: { ...stats, skirtsAbove } };
  }
  return plans.map(plan => {
    const a = plan.approach, data = a.data, h = a.horizontal, report = {} as ApproachCheck['terrain'];
    // Under a structure's span (clear of its abutments) the terrain must stay below the slab; elsewhere below the road with ground contact.
    const clearAt = (s: number) => plan.clear.some(([from, to]) => s >= from && s <= to);
    let maxGradeToJoin = 0, maxGradeAtGrade = 0;
    for (let s = 0; s <= data.length; s += 1) { const g = Math.abs(profileAt(a.profile, s).grade); if (s <= data.join.station) maxGradeToJoin = Math.max(maxGradeToJoin, g); else maxGradeAtGrade = Math.max(maxGradeAtGrade, g); }
    for (const level of ['near', 'near_low'] as const) {
      const tin = edited[level].tin; let stations = 0, samples = 0, penetrations = 0, worst = -Infinity, unsupported = 0;
      for (let s = 0; s <= data.length + 1e-9; s += CHECK_STEP) {
        stations++;
        const c = horizontalAt(h, s), [nx, nz] = lateral(c.tx, c.tz), road = profileAt(a.profile, s).y, st = clearAt(s);
        const limit = st ? road - cs.deck.slab : road;
        let contact = false;
        // Across both barriers, and on a side the dressing widens (the toll plaza) out to its moved barrier.
        const wLo = plan.widen(s, -1), wHi = plan.widen(s, 1);
        for (let d = -cs.barrier[1] - wLo; d <= cs.barrier[1] + wHi + 1e-9; d += .5) {
          const y = tin.height(c.x + nx * d, c.z + nz * d); if (!Number.isFinite(y)) continue;
          samples++; worst = Math.max(worst, y - limit);
          if (y > limit + 1e-3) penetrations++;
          if (Math.abs(d) <= cs.pavedHalfWidth + (d < 0 ? wLo : wHi) && y >= road - cs.pavement - .05) contact = true;
        }
        if (!st && !contact) unsupported++;
      }
      // Under the dressing's pavement (Vista Point's lot and throat).
      let padSamples = 0, padPenetrations = 0, padWorst = -Infinity;
      for (const pad of plan.pads) for (let s = pad.range[0]; s <= pad.range[1] + 1e-9; s += PAD_CHECK) {
        const c = horizontalAt(h, s), [nx, nz] = lateral(c.tx, c.tz);
        for (let d = pad.range[2]; d <= pad.range[3] + 1e-9; d += PAD_CHECK) {
          const x = c.x + nx * d, z = c.z + nz * d; if (polygonDistance(pad.outline, x, z) > 0) continue;
          const y = tin.height(x, z); if (!Number.isFinite(y)) continue;
          const over = y - pad.surface(s, d); padSamples++; padWorst = Math.max(padWorst, over);
          if (over > -PAD_CLEAR) padPenetrations++;
        }
      }
      const pads: PadCheck = { samples: padSamples, penetrations: padPenetrations, worst: padSamples ? r3(padWorst) : null };
      report[level] = { stations, samples, penetrations, worst: r3(worst), unsupported, ...edited[level].stats, pads };
    }
    const bents = data.segments.reduce((n, s) => n + (s.supports?.length ?? 0), 0), abutments = data.segments.reduce((n, s) => n + (s.abutments?.length ?? 0), 0);
    let longestSpan = 0;
    for (const s of data.segments) if (s.kind === 'viaduct' || s.kind === 'overpass') {
      const A = cs.supports.abutment, stops = [s.from > 0 ? s.from + A : s.from, ...(s.supports ?? []), s.to < data.length ? s.to - A : s.to];
      for (let k = 1; k < stops.length; k++) longestSpan = Math.max(longestSpan, stops[k]! - stops[k - 1]!);
    }
    const none = (): EndSight => ({ visible: 0, nearest: null, example: '' });
    const vis = visibility ? endVisibility(route, a, edited.near.tin, layout) : { viewpoints: 0, targets: 0, visible: 0, nearest: { deck: none(), review: none(), drive: none() } };
    return {
      name: a.name, length: data.length, start: data.start, maxGradeToJoin: +maxGradeToJoin.toFixed(4), maxGradeAtGrade: +maxGradeAtGrade.toFixed(4),
      segments: data.segments.map(s => `${s.kind} ${s.from}-${s.to}`), bents, abutments, longestSpan: r2(longestSpan),
      deviation: { ...data.deviation, tolerance: data.imagery.tolerance }, terrain: report, visibility: vis,
    };
  });
}

/** Lateral offsets of the lane centres used as viewpoints and targets. */
const LANES_D = [-7.8994, -4.8006, -1.7018, 1.7018, 4.8006, 7.8994];
/**
 * Sight lines to the approach's end stretch (the last `fade` + 5 m of the lanes, at vehicle-roof height)
 * from the deck (eye height every 50 m in every lane) and from the driving cameras (the driver's eye and
 * the chase camera, every 10 m from the deck end to the car's turnaround station, both directions).
 */
export function endVisibility(route: Route, a: Approach, tin: Tin, layout: SceneLayout): ApproachCheck['visibility'] {
  const chase = layout.cameras.chase, fade = a.length - a.data.ends.dissolve[0] + 10, targets: number[][] = [];
  const viewpoints: { kind: SightKind; label: string; at: number[]; fx?: number; fz?: number }[] = [];
  for (let s = a.length - fade; s <= a.length + 1e-9; s += 5) for (const d of [-9.4, -4.8, 0, 4.8, 9.4]) { const p = routePoint(route, a.sign * (route.roadEndZ + s), d); targets.push([p.x, p.y + 1.5, p.z]); }
  for (let z = -route.roadEndZ; z <= route.roadEndZ + 1e-9; z += 50) for (const d of LANES_D) for (const up of [1.2, chase.height]) { const p = routePoint(route, z, d); viewpoints.push({ kind: 'deck', label: `deck z ${z.toFixed(0)} d ${d} +${up}`, at: [p.x, p.y + up, p.z] }); }
  // The review's drive pose above this deck end.
  viewpoints.push({ kind: 'review', label: 'review drive pose', at: [0, 78.5, a.sign * 960] });
  // Driving outward to the turnaround: the driver's eye and the chase camera behind the car, both looking
  // along the travel direction (they see a target only within 60 degrees of it).
  for (let s = 0; s <= a.data.ends.car + 1e-9; s += 10) for (const d of LANES_D) {
    const sigma = a.sign * (route.roadEndZ + s), p = routePoint(route, sigma, d), back = routePoint(route, sigma - a.sign * chase.distance, d), fx = a.sign * p.fx, fz = a.sign * p.fz;
    viewpoints.push({ kind: 'drive', label: `driver s ${s} d ${d}`, at: [p.x, p.y + 1.2, p.z], fx, fz }, { kind: 'drive', label: `chase s ${s} d ${d}`, at: [back.x, back.y + chase.height, back.z], fx, fz });
  }
  const nearest: Record<SightKind, EndSight> = { deck: { visible: 0, nearest: null, example: '' }, review: { visible: 0, nearest: null, example: '' }, drive: { visible: 0, nearest: null, example: '' } };
  let visible = 0;
  for (const v of viewpoints) for (const t of targets) {
    const dx = t[0]! - v.at[0]!, dy = t[1]! - v.at[1]!, dz = t[2]! - v.at[2]!, flat = Math.hypot(dx, dz);
    if (v.fx !== undefined && (dx * v.fx + dz * v.fz!) / flat <= .5) continue;
    if (!tin.clear(v.at, t)) continue;
    const e = nearest[v.kind], distance = r2(Math.hypot(flat, dy));
    visible++; e.visible++;
    if (e.nearest === null || distance < e.nearest) { e.nearest = distance; e.example = `${v.label} (${v.at.map(n => n.toFixed(0)).join(', ')}) -> (${t.map(n => n.toFixed(0)).join(', ')})`; }
  }
  return { viewpoints: viewpoints.length, targets: targets.length, visible, nearest };
}
