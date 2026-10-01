// SPDX-License-Identifier: MIT
// The approaches' dressing (fix round 3, golden-gate-scene/SCENE-REVIEW-3.md items 1 to 4) from data/layout.json
// `dressing` (D-21), placed from our own terrain imagery: the toll plaza's paved fan, flat canopy, columns and
// toll islands on the south approach; Vista Point's lot, kerbs, overlook wall, stall lines, throat and parked
// cars on the north approach, with the terrain pads under them (./corridor) and the edge barrier's gap; the
// highway light standards on both approaches' edge barriers. The data
// gives lane offsets x (+ the southbound lanes' side); an approach's own N points the other way on the south
// approach, so its lateral d = sign x. Pure typed-array geometry appended to the approach meshes' per-material
// arrays (./approach-mesh), so it switches with the approaches' near and far representations.
import { frame } from './mesh-arrays';
import type { Arrays, V3 } from './mesh-arrays';
import { buildApproach } from './route';
import type { Approach } from './route';
import type { ApproachCrossSection, LightsData, PlazaData, SceneApproaches, SceneDressing, VistaData } from '../data';

const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/** The plaza's extra paved width at station s: metres beyond the approach's paved edge on the plaza's side. */
export function plazaWidening(p: PlazaData, pavedHalfWidth: number, s: number): number {
  const [a, b, c, d] = p.fan, w = p.pavedTo - pavedHalfWidth;
  return s <= a || s >= d ? 0 : s < b ? w * smooth((s - a) / (b - a)) : s <= c ? w : w * smooth((d - s) / (d - c));
}
/** Extra paved width at station s on the approach's `side` (+1 or -1 along its own N). */
export function sideWidening(a: Approach, dressing: SceneDressing | undefined, pavedHalfWidth: number, s: number, side: number): number {
  const p = dressing?.plaza;
  return p && p.approach === a.name && side === a.sign * p.side ? plazaWidening(p, pavedHalfWidth, s) : 0;
}
/** Stations where the dressing changes an approach's cross-section (mesh and corridor breaks). */
export function dressingBreaks(a: Approach, dressing: SceneDressing | undefined): number[] {
  const p = dressing?.plaza, out = p && p.approach === a.name ? [...p.fan, ...p.medianGap] : [];
  for (const g of barrierGaps(a, dressing)) out.push(...g.s);
  return out;
}
/** Gaps in an approach's edge barriers: the side (+1 or -1 along its own N) and the station range. */
export function barrierGaps(a: Approach, dressing: SceneDressing | undefined): { side: number; s: [number, number] }[] {
  const v = dressing?.vista; if (!v || v.approach !== a.name) return [];
  const [s0, x0] = v.outline[v.throat.edge]!, [s1] = v.outline[(v.throat.edge + 1) % v.outline.length]!;
  return [{ side: Math.sign(a.sign * x0), s: [Math.min(s0, s1), Math.max(s0, s1)] }];
}
/** Stations between which the approach has no median barrier (none: an empty range). */
export function medianGap(a: Approach, dressing: SceneDressing | undefined): [number, number] {
  return dressing?.plaza.approach === a.name ? dressing.plaza.medianGap : [Infinity, -Infinity];
}
/** The median's height factor at station s: 1 away from the gap, sloping to 0 over `ramp` metres into it. */
export function medianScale(gap: [number, number], ramp: number, s: number): number {
  return Math.min(1, Math.max(0, (gap[0] - s) / ramp, (s - gap[1]) / ramp));
}
/** Ascending lateral range along the approach's own N of lane offsets x0..x1. */
function span(a: Approach, x0: number, x1: number): [number, number] { const u = a.sign * x0, v = a.sign * x1; return u < v ? [u, v] : [v, u]; }
/** Stations strictly between a and b, about `step` apart. */
function between(a: number, b: number, step: number): number[] { const n = Math.max(1, Math.round((b - a) / step)), out: number[] = []; for (let i = 1; i < n; i++) out.push(a + (b - a) * i / n); return out; }

export interface DressingTargets { road: Arrays; marks: Arrays; concrete: Arrays; paint: Arrays; glass: Arrays }
/** Approach `a`'s dressing for one representation (`near`: every part; far: the large masses), appended to the per-material arrays. */
export function dressingArrays(a: Approach, dressing: SceneDressing, near: boolean, out: DressingTargets, cs: ApproachCrossSection): void {
  if (dressing.plaza.approach === a.name) plazaArrays(a, dressing.plaza, near, out);
  for (const st of lightStandards(a, dressing, cs, near)) standardArrays(a, dressing.lights, cs, st, near, out);
  // Vista Point: near only (from afar the terrain's imagery shows the lot, and the far terrain is not padded).
  if (near && dressing.vista.approach === a.name) vistaArrays(a, dressing.vista, cs, out);
}

/** A light standard's place: station, side (+1 or -1 along the approach's own N) and the pole's lateral d. */
export interface LightStandard { s: number; side: number; d: number }
/**
 * An approach's light standards (item 4): in pairs every `spacing` m from `start` up to `clear` m short of where the
 * barriers begin to taper before the dissolve, the pole on the edge barrier (out with the plaza's widening); none
 * within `clear` m of a barrier opening on its side or of the plaza canopy. The far representation (near false)
 * carries those up to station `far`.
 */
export function lightStandards(a: Approach, dressing: SceneDressing, cs: ApproachCrossSection, near: boolean): LightStandard[] {
  const l = dressing.lights, end = a.data.ends.dissolve[0] - cs.joint.taper - l.clear, last = near ? end : Math.min(end, l.far);
  const gaps = barrierGaps(a, dressing), canopy = dressing.plaza.approach === a.name ? dressing.plaza.canopy.s : null, out: LightStandard[] = [];
  for (let k = 0; l.start + k * l.spacing <= last + 1e-9; k++) {
    const s = +(l.start + k * l.spacing).toFixed(6);
    if (canopy && s > canopy[0] - l.clear && s < canopy[1] + l.clear) continue;
    for (const side of [-1, 1]) {
      if (gaps.some(g => g.side === side && s > g.s[0] - l.clear && s < g.s[1] + l.clear)) continue;
      out.push({ s, side, d: side * (l.x + sideWidening(a, dressing, cs.pavedHalfWidth, s, side)) });
    }
  }
  return out;
}
/**
 * One light standard: a painted-steel pole (8 faces near, 4 far) from the barrier's top, a square arm reaching inward
 * over the shoulder and a cobra head tapering toward the road, its underside the lens (LampGlass).
 */
function standardArrays(a: Approach, l: LightsData, cs: ApproachCrossSection, st: LightStandard, near: boolean, out: DressingTargets): void {
  const f = frame(a, st.s), inward = -st.side, [L, W, H] = l.head, lens = f.y + l.mount, top = lens + H;
  const P = (d: number, along: number, y: number): V3 => [f.x + f.nx * d + f.tx * along, y, f.z + f.nz * d + f.tz * along];
  const dir = (d: number, along: number): V3 => [f.nx * d + f.tx * along, 0, f.nz * d + f.tz * along];
  // Pole: from the barrier's top to the arm's top.
  const sides = near ? 8 : 4, r0 = l.pole[0] / 2, r1 = l.pole[1] / 2, foot = f.y + cs.barrier[2];
  for (let k = 0; k < sides; k++) {
    const a0 = (k + .5) / sides * 2 * Math.PI, a1 = (k + 1.5) / sides * 2 * Math.PI, am = (a0 + a1) / 2;
    const q = (t: number, r: number, y: number) => P(st.d + Math.cos(t) * r, Math.sin(t) * r, y);
    out.paint.quad(q(a0, r0, foot), q(a1, r0, foot), q(a1, r1, top), q(a0, r1, top), dir(Math.cos(am), Math.sin(am)));
  }
  // Arm: from the pole's axis to the head's back, its top level with the head's back.
  const centre = st.d + inward * l.reach, back = centre - inward * L / 2, front = centre + inward * L / 2, h = l.arm / 2;
  out.paint.quad(P(st.d, -h, top), P(back, -h, top), P(back, h, top), P(st.d, h, top), [0, 1, 0]);
  out.paint.quad(P(st.d, -h, top - l.arm), P(back, -h, top - l.arm), P(back, h, top - l.arm), P(st.d, h, top - l.arm), [0, -1, 0]);
  for (const t of [-1, 1]) out.paint.quad(P(st.d, t * h, top - l.arm), P(back, t * h, top - l.arm), P(back, t * h, top), P(st.d, t * h, top), dir(0, t));
  // Cobra head: full width and depth at its back, narrower and lower toward the road; the lens underneath.
  const wb = W / 2, wf = W * .4, hf = lens + H * .55;
  const B = [P(back, -wb, lens), P(back, wb, lens), P(back, wb, top), P(back, -wb, top)], F = [P(front, -wf, lens), P(front, wf, lens), P(front, wf, hf), P(front, -wf, hf)];
  out.paint.quad(B[0]!, B[1]!, B[2]!, B[3]!, dir(-inward, 0));
  out.paint.quad(F[0]!, F[1]!, F[2]!, F[3]!, dir(inward, 0));
  out.paint.quad(B[3]!, B[2]!, F[2]!, F[3]!, [0, 1, 0]);
  out.paint.quad(B[0]!, B[3]!, F[3]!, F[0]!, dir(0, -1));
  out.paint.quad(B[1]!, B[2]!, F[2]!, F[1]!, dir(0, 1));
  out.glass.quad(B[0]!, B[1]!, F[1]!, F[0]!, [0, -1, 0]);
}

function plazaArrays(a: Approach, p: PlazaData, near: boolean, out: DressingTargets): void {
  const { canopy, columns, islands } = p, top = frame(a, (canopy.s[0] + canopy.s[1]) / 2).y + canopy.top, under = top - canopy.depth;
  // The canopy: a level slab (underside and fascia seen from the road), the same box in both representations.
  const [c0, c1] = span(a, canopy.x[0], canopy.x[1]);
  out.paint.box(frame(a, canopy.s[0]), frame(a, canopy.s[1]), c0, c1, [under, top], [under, top], { top: true, bottom: true, start: true, end: true });
  if (!near) return;
  // Toll islands (concrete kerbs pointed at both ends) and on each a column per row up to the canopy's underside.
  islands.x.forEach((x, k) => {
    const hw = islands.halfWidth[k]!, [s0, s1] = islands.s, n = islands.nose, cuts = [s0, s0 + n, ...between(s0 + n, s1 - n, 4), s1 - n, s1];
    const half = (s: number) => hw * (.25 + .75 * Math.min(1, (s - s0) / n, (s1 - s) / n));
    for (let i = 0; i + 1 < cuts.length; i++) {
      const f0 = frame(a, cuts[i]!), f1 = frame(a, cuts[i + 1]!), h0 = half(cuts[i]!), h1 = half(cuts[i + 1]!);
      out.concrete.prism(f0, f1, span(a, x - h0, x + h0), span(a, x - h1, x + h1), [f0.y - .05, f0.y + islands.height], [f1.y - .05, f1.y + islands.height], { top: true, start: i === 0, end: i + 2 === cuts.length });
    }
    for (const s of columns.s) {
      const c = columns.size / 2, f0 = frame(a, s - c), f1 = frame(a, s + c), [d0, d1] = span(a, x - c, x + c);
      out.paint.box(f0, f1, d0, d1, [f0.y + islands.height - .02, under + .02], [f1.y + islands.height - .02, under + .02], { start: true, end: true });
    }
  });
}

// Vista Point ------------------------------------------------------------------------------------------------
type P2 = [number, number];
/** A point of the data's outlines: approach station s and lane offset x. */
type SX = [number, number];
/** Outline edges are split every EDGE_STEP m or less so they follow the approach's frames; the throat every THROAT_STEP m (the near road's stations) and THROAT_ACROSS times across. */
const EDGE_STEP = 4, THROAT_STEP = 2, THROAT_ACROSS = 4;
/** How far the kerbs' and the wall's outer faces reach below the pavement's underside (into the padded terrain). */
const SKIRT = .3;
/**
 * Terrain pads (./corridor): the target holds PAD_HOLD m beyond a pad's outline, more than the diagonal of the
 * corridor's pad cells (./corridor PAD_STEP), so no terrain piece that reaches under the pavement rises above
 * it; beyond that it fades out over PAD_BLEND m.
 */
export const PAD_HOLD = 5, PAD_BLEND = 6;
const W = (a: Approach, s: number, x: number, y: number): V3 => { const f = frame(a, s), d = a.sign * x; return [f.x + f.nx * d, y, f.z + f.nz * d]; };
/** Twice the signed area of a closed polygon in scene (x, z): positive when its interior is left of travel, (-dz, dx). */
function area2(p: readonly P2[]): number { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j]![0] * p[i]![1] - p[i]![0] * p[j]![1]; return s; }
const plan = (pts: readonly V3[]): P2[] => pts.map(p => [p[0], p[2]]);
/** Signed distance from (x, z) to a closed polygon in scene (x, z), negative inside. */
export function polygonDistance(poly: readonly P2[], x: number, z: number): number {
  let best = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j]!, [bx, bz] = poly[i]!, ex = bx - ax, ez = bz - az;
    if ((bz > z) !== (az > z) && x < ax + ex * (z - az) / ez) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return inside ? -best : best;
}
/** Edge k of a closed [s, x] polygon split every `step` m or less, its end excluded. */
function edgePoints(poly: readonly SX[], k: number, step = EDGE_STEP): SX[] {
  const [s0, x0] = poly[k]!, [s1, x1] = poly[(k + 1) % poly.length]!, n = Math.max(1, Math.ceil(Math.hypot(s1 - s0, x1 - x0) / step - 1e-9));
  return Array.from({ length: n }, (_, i): SX => [s0 + (s1 - s0) * i / n, x0 + (x1 - x0) * i / n]);
}
const ring = (poly: readonly SX[]): SX[] => poly.flatMap((_, k) => edgePoints(poly, k));
/** The outline from vertex `from` forward (wrapping) to vertex `to`, split like the ring. */
function polyline(poly: readonly SX[], from: number, to: number): SX[] {
  const out: SX[] = []; let k = from;
  do { out.push(...edgePoints(poly, k)); k = (k + 1) % poly.length; } while (k !== to);
  return [...out, poly[to]!];
}
/** Scene points of [s, x] points at height y (or per point). */
const scene = (a: Approach, pts: readonly SX[], y: number | ((p: SX) => number)): V3[] => pts.map(p => W(a, p[0], p[1], typeof y === 'number' ? y : y(p)));
/** Unit normal in (x, z) of segment i of a polyline (wrapping) toward `side` (+1: left of travel). */
function normalOf(pts: readonly V3[], i: number, side: number): P2 {
  const p = pts[i % pts.length]!, q = pts[(i + 1) % pts.length]!, dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
  return [-dz / l * side, dx / l * side];
}
/** Mitred offsets, `w` toward `side`, of every point of a polyline (a ring when `closed`). */
function offsets(pts: readonly V3[], side: number, w: number, closed: boolean): P2[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = normalOf(pts, closed || i > 0 ? (i + n - 1) % n : 0, side), b = normalOf(pts, closed || i < n - 1 ? i : n - 2, side);
    let mx = a[0] + b[0], mz = a[1] + b[1]; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    const k = w / Math.max(.3, mx * b[0] + mz * b[1]); return [mx * k, mz * k];
  });
}
/**
 * A kerb or wall along a polyline of scene points on the pavement: its top `h` above them, `w` wide toward
 * `side` (its face there), its back face `skirt` below them; a ring wraps, a polyline gets end faces.
 */
function rim(out: Arrays, pts: readonly V3[], side: number, h: number, w: number, skirt: number, closed: boolean): void {
  const n = pts.length, off = offsets(pts, side, w, closed);
  const top = (i: number): V3 => [pts[i]![0], pts[i]![1] + h, pts[i]![2]], foot = (i: number): V3 => [pts[i]![0], pts[i]![1] - skirt, pts[i]![2]];
  const face = (i: number, dy: number): V3 => [pts[i]![0] + off[i]![0], pts[i]![1] + dy, pts[i]![2] + off[i]![1]];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n, [nx, nz] = normalOf(pts, i, side);
    out.quad(top(i), top(j), face(j, h), face(i, h), [0, 1, 0]);
    out.quad(face(i, 0), face(j, 0), face(j, h), face(i, h), [nx, 0, nz]);
    out.quad(foot(i), foot(j), top(j), top(i), [-nx, 0, -nz]);
  }
  if (!closed) for (const [i, k] of [[0, 1], [n - 1, n - 2]] as const) out.quad(foot(i), face(i, 0), face(i, h), top(i), [pts[i]![0] - pts[k]![0], 0, pts[i]![2] - pts[k]![2]]);
}
/** Triangles (index triples) of a simple polygon whose interior is left of travel, by ear clipping; coincident points (a hole's bridge) never block an ear. */
export function earClip(pts: readonly P2[]): number[] {
  const idx = pts.map((_, i) => i), out: number[] = [];
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const same = (a: P2, b: P2) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-9;
  while (idx.length > 3) {
    const m = idx.length; let k = 0;
    for (; k < m; k++) {
      const a = pts[idx[(k + m - 1) % m]!]!, b = pts[idx[k]!]!, c = pts[idx[(k + 1) % m]!]!;
      if (cross(a, b, c) <= 1e-12) continue;
      if (!idx.some(j => { const q = pts[j]!; return !same(q, a) && !same(q, b) && !same(q, c) && cross(a, b, q) > 0 && cross(b, c, q) > 0 && cross(c, a, q) > 0; })) break;
    }
    if (k === m) break; // no ear (a degenerate outline): the unit tests compare the triangulated area
    out.push(idx[(k + m - 1) % m]!, idx[k]!, idx[(k + 1) % m]!); idx.splice(k, 1);
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!);
  return out;
}
/** One polygon from an outer ring and a hole, both with their interiors left of travel, joined by the shortest bridge that crosses no edge. */
export function bridged(outer: readonly P2[], hole: readonly P2[]): P2[] {
  const h = [...hole].reverse(), edges = [...outer.map((p, i) => [p, outer[(i + 1) % outer.length]!]), ...h.map((p, i) => [p, h[(i + 1) % h.length]!])] as [P2, P2][];
  const orient = (a: P2, b: P2, c: P2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const crosses = (a: P2, b: P2) => edges.some(([p, q]) => p !== a && q !== a && p !== b && q !== b && orient(a, b, p) * orient(a, b, q) < 0 && orient(p, q, a) * orient(p, q, b) < 0);
  const pairs = outer.flatMap((a, i) => h.map((b, j) => ({ i, j, d: Math.hypot(a[0] - b[0], a[1] - b[1]) }))).sort((p, q) => p.d - q.d);
  const { i, j } = pairs.find(({ i, j }) => !crosses(outer[i]!, h[j]!)) ?? pairs[0]!;
  return [...outer.slice(0, i + 1), ...h.slice(j), ...h.slice(0, j + 1), ...outer.slice(i)];
}
/** Which side of travel the lot lies on along the outline, and along the planted island (outside it). */
function lotSides(a: Approach, v: VistaData): { outline: number; planter: number } {
  return { outline: Math.sign(area2(plan(scene(a, ring(v.outline), 0)))), planter: -Math.sign(area2(plan(scene(a, ring(v.planter), 0)))) };
}
/** The lot's surface in scene (x, z): the outline less the planted island, as one bridged polygon with its interior left of travel. */
export function vistaLot(a: Approach, v: VistaData): P2[] {
  const sides = lotSides(a, v), o = plan(scene(a, ring(v.outline), 0)), p = plan(scene(a, ring(v.planter), 0));
  return bridged(sides.outline > 0 ? o : [...o].reverse(), sides.planter < 0 ? p : [...p].reverse());
}
/** The throat's surface at station s: from the road at its paved edge (u = 0) up to the lot (u = 1). */
function throatHeight(a: Approach, v: VistaData, s: number, u: number): number { const road = frame(a, s).y; return road + (v.level - road) * u; }
/** The throat's lot edge (the outline's throat edge) and the lane offset of the road's paved edge beside it. */
function throatEnds(v: VistaData, pavedHalfWidth: number): { e0: SX; e1: SX; edgeX: number } {
  const k = v.throat.edge, e0 = v.outline[k]!, e1 = v.outline[(k + 1) % v.outline.length]!;
  return { e0, e1, edgeX: Math.sign(e0[1]) * pavedHalfWidth };
}
/** Whether the outline run from vertex `from` forward to `to` lies along the overlook wall's run. */
function alongWall(v: VistaData, from: number, to: number): boolean {
  const n = v.outline.length, at = (k: number) => (k - v.wall.from + n) % n;
  return at(from) <= at(to) && at(to) <= at(v.wall.to);
}
/**
 * Stall rows along the kerbs' (or the wall's) faces: each line's foot with the directions into the lot (n) and along
 * the row (t), and each stall's centre. The stalls are laid out `width` apart along the row's centre line, half the
 * stall depth off the face (mitred), so they keep their width where the kerb bends toward them and their lines fan
 * out from the centre line to the face and to the far end.
 */
export function vistaRows(a: Approach, v: VistaData): { lines: { p: V3; n: P2; t: P2 }[]; stalls: { p: V3; n: P2 }[] }[] {
  const sides = lotSides(a, v), { width, depth } = v.stalls;
  return v.stalls.rows.map(r => {
    const side = sides[r.edge], kerb = scene(a, polyline(r.edge === 'outline' ? v.outline : v.planter, r.from, r.to), v.level);
    const face = r.edge === 'outline' && alongWall(v, r.from, r.to) ? v.wall.width : v.kerb.width;
    const h = depth / 2, off = offsets(kerb, side, face + h, false), line = kerb.map((p, i): V3 => [p[0] + off[i]![0], p[1], p[2] + off[i]![1]]);
    const lengths = line.slice(1).map((q, i) => Math.hypot(q[0] - line[i]![0], q[2] - line[i]![2])), total = lengths.reduce((t, l) => t + l, 0);
    const walk = (t: number) => {
      let i = 0; while (i < lengths.length - 1 && t > lengths[i]!) t -= lengths[i++]!;
      const p = line[i]!, q = line[i + 1]!, l = lengths[i]! || 1, u = Math.min(1, t / l), tx = (q[0] - p[0]) / l, tz = (q[2] - p[2]) / l;
      return { p: [p[0] + (q[0] - p[0]) * u, p[1], p[2] + (q[2] - p[2]) * u] as V3, n: [-tz * side, tx * side] as P2, t: [tx, tz] as P2 };
    };
    const count = Math.floor(total / width + 1e-6);
    return {
      lines: Array.from({ length: count + 1 }, (_, k) => { const w = walk(k * width); return { ...w, p: [w.p[0] - w.n[0] * h, w.p[1], w.p[2] - w.n[1] * h] as V3 }; }),
      stalls: Array.from({ length: count }, (_, k) => { const w = walk((k + .5) * width); return { p: w.p, n: w.n }; }),
    };
  });
}
function vistaArrays(a: Approach, v: VistaData, cs: ApproachCrossSection, out: DressingTargets): void {
  const L = v.level, { height: kh, width: kw } = v.kerb, up: V3 = [0, 1, 0], sides = lotSides(a, v), n = v.outline.length, t = v.throat.edge;
  // The lot: the outline less the planted island, triangulated in the scene's plan (asphalt UVs x, z as the road).
  const lot = vistaLot(a, v), tris = earClip(lot), y = (p: P2): V3 => [p[0], L, p[1]];
  for (let i = 0; i < tris.length; i += 3) out.road.tri(y(lot[tris[i]!]!), y(lot[tris[i + 1]!]!), y(lot[tris[i + 2]!]!), up);
  // Kerbs along every outline edge but the throat's, the overlook wall instead of the kerb along the outline's
  // `wall` run, and the island's kerb ring; their back faces reach down into the padded terrain.
  const { from, to, height: wh, width: ww } = v.wall, skirt = cs.pavement + SKIRT;
  rim(out.concrete, scene(a, polyline(v.outline, from, to), L), sides.outline, wh, ww, skirt, false);
  rim(out.concrete, scene(a, polyline(v.outline, to, t), L), sides.outline, kh, kw, skirt, false);
  rim(out.concrete, scene(a, polyline(v.outline, (t + 1) % n, from), L), sides.outline, kh, kw, skirt, false);
  rim(out.concrete, scene(a, ring(v.planter), L), sides.planter, kh, kw, skirt, true);
  // Stall lines in the road's marking paint, from the kerb's face into the lot.
  const { line: lw, depth } = v.stalls, lift = cs.markings.lift;
  for (const row of vistaRows(a, v)) for (const { p, n: [nx, nz], t: [tx, tz] } of row.lines) {
    const c = (u: number, k: number): V3 => [p[0] + nx * u + tx * k, p[1] + lift, p[2] + nz * u + tz * k];
    out.marks.quad(c(0, -lw / 2), c(0, lw / 2), c(depth, lw / 2), c(depth, -lw / 2), up, [[0, 0], [1, 0], [1, depth / 3], [0, depth / 3]]);
  }
  // The throat: from the road's paved edge up to the lot across the outline's throat edge, a kerb on each side.
  const { edgeX } = throatEnds(v, cs.pavedHalfWidth), lotEnd = [...edgePoints(v.outline, t, THROAT_STEP), v.outline[(t + 1) % n]!];
  const grid = lotEnd.map(([s, x]) => Array.from({ length: THROAT_ACROSS + 1 }, (_, j) => { const u = j / THROAT_ACROSS; return W(a, s, edgeX + (x - edgeX) * u, throatHeight(a, v, s, u)); }));
  for (let i = 0; i + 1 < grid.length; i++) for (let j = 0; j < THROAT_ACROSS; j++) out.road.quad(grid[i]![j]!, grid[i + 1]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!, up);
  for (const [edge, other] of [[grid[0]!, grid[grid.length - 1]!], [grid[grid.length - 1]!, grid[0]!]] as const) {
    // Each kerb's face looks across the throat at the other.
    const [dx, dz] = normalOf(edge, 0, 1), side = Math.sign(dx * (other[0]![0] - edge[0]![0]) + dz * (other[0]![2] - edge[0]![2])) || 1;
    rim(out.concrete, edge, side, kh, kw, skirt, false);
  }
}

/** A terrain pad under dressing pavement (./corridor): the pavement's surface less `depth`, held `hold` m around the outline and faded over `blend` m. */
export interface TerrainPad {
  /** Closed outline in scene (x, z). */
  outline: P2[];
  /** Scene box of the pad with its hold and fade: xmin, zmin, xmax, zmax. */
  box: [number, number, number, number];
  /** The pad with its hold and fade in approach stations and lateral offsets d: s0, s1, d0, d1 (the corridor's clip grid). */
  range: [number, number, number, number];
  /** Extra clip-grid columns (lateral offsets d) the pad needs, such as the road's paved edge beside a ramp. */
  cols: number[];
  /** The pavement's surface at station s and lateral offset d. */
  surface(s: number, d: number): number;
  depth: number; hold: number; blend: number;
}
/** Approach `a`'s terrain pads: Vista Point's lot, then its throat. */
export function dressingPads(a: Approach, dressing: SceneDressing | undefined, cs: ApproachCrossSection): TerrainPad[] {
  const v = dressing?.vista; if (!v || v.approach !== a.name) return [];
  const m = PAD_HOLD + PAD_BLEND;
  const pad = (poly: readonly SX[], cols: number[], surface: TerrainPad['surface']): TerrainPad => {
    const pts = ring(poly), outline = plan(scene(a, pts, 0)), xs = outline.map(p => p[0]), zs = outline.map(p => p[1]), ss = pts.map(p => p[0]), ds = pts.map(p => a.sign * p[1]);
    return {
      outline, cols, surface, depth: cs.pavement, hold: PAD_HOLD, blend: PAD_BLEND,
      box: [Math.min(...xs) - m, Math.min(...zs) - m, Math.max(...xs) + m, Math.max(...zs) + m],
      range: [Math.min(...ss) - m, Math.max(...ss) + m, Math.min(...ds) - m, Math.max(...ds) + m],
    };
  };
  const { e0, e1, edgeX } = throatEnds(v, cs.pavedHalfWidth);
  return [pad(v.outline, [], () => v.level), pad([e0, [e0[0], edgeX], [e1[0], edgeX], e1], [a.sign * edgeX], (s, d) => {
    const k = Math.min(1, Math.max(0, (s - e0[0]) / (e1[0] - e0[0]))), xl = e0[1] + (e1[1] - e0[1]) * k;
    return throatHeight(a, v, s, Math.min(1, Math.max(0, (a.sign * d - edgeX) / (xl - edgeX))));
  })];
}
/** The terrain height `y` at station s, lateral offset d (scene x, z) after the pads, in order. */
export function padHeight(pads: readonly TerrainPad[], s: number, d: number, x: number, z: number, y: number): number {
  for (const p of pads) {
    if (x < p.box[0] || x > p.box[2] || z < p.box[1] || z > p.box[3]) continue;
    const dist = polygonDistance(p.outline, x, z); if (dist >= p.hold + p.blend) continue;
    const w = dist <= p.hold ? 1 : 1 - smooth((dist - p.hold) / p.blend);
    y += (p.surface(s, d) - p.depth - y) * w;
  }
  return y;
}

/** Vista Point's parked cars (static, from the traffic set): the body's centre over its stall, nose to the kerb. */
export interface ParkedVehicle { type: string; paint: string; x: number; y: number; z: number; yaw: number }
export function parkedVehicles(approaches: SceneApproaches, roadEndZ: number, dressing: SceneDressing): ParkedVehicle[] {
  const v = dressing.vista, rows = vistaRows(buildApproach(v.approach, approaches[v.approach], roadEndZ), v);
  return v.cars.map(c => {
    const stall = rows[c.row]?.stalls[c.stall]; if (!stall) throw new Error(`layout.json dressing.vista.cars: no stall ${c.stall} in row ${c.row}`);
    // A vehicle's forward is (cos yaw, -sin yaw) in scene (x, z); here -n, toward the kerb.
    return { type: c.type, paint: c.paint, x: stall.p[0], y: stall.p[1], z: stall.p[2], yaw: Math.atan2(stall.n[1], -stall.n[0]) };
  });
}
