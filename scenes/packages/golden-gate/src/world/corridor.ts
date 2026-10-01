// SPDX-License-Identifier: MIT
// The approach roads' terrain corridor (fix round 2): the terrain tiles are edited along each approach
// so the road sits in a cut or on a fill where it runs at grade and clears the girders where it is a
// structure, with the imagery still draped (UVs stay linear in x and z). Pure typed-array geometry, no
// three.js: the runtime applies it to the near tiles as they load and scripts/layout.ts applies the
// same code to the canonical tiles for its checks.
//
// Envelope, at approach station s and lateral offset d (the approach's own N, see ./alignment), for a
// natural terrain height h:
//  - at grade, a bed `pavement` below the road for |d| <= bed (barrier outer edge plus bedMargin);
//    beyond it the terrain is clamped between a fill slope falling at `fill` and a cut slope rising at
//    `cut` per metre from the bed edge;
//  - under a structure (clear of its abutments), the terrain stays at least `clearance` below the
//    girders, with the same cut slope beyond the bed width;
//  - the effect fades out laterally between reach[0] and reach[1], at the start over START_FADE and
//    beyond the road's end over END_FADE; in the end's dissolve the bed rises to DISSOLVE_DEPTH.
// Where layout.json dressing widens the road on one side (the toll plaza, fix round 3), the bed, slopes and reach
// on that side move out with the paved edge, and so do the clip grid's columns on that side (row by row).
// Under the dressing's own pavement (Vista Point's lot and its throat, ./dressing terrain pads) the terrain then
// holds `depth` below that pavement around its outline and fades back to the envelope; there the clip grid gains
// rows and columns every PAD_STEP m (the pad columns lie on the base columns elsewhere, as cells of no width).
// Beside a benched cut (layout.json approaches.<name>.cuts, fix round 3: the Marin climb) the envelope gives way on
// the cut's side to the cut's own profile, faded in and out along the road: the bed, up across the toe wall's body
// to its top, then slope faces with a bench after every so many metres of rise, the natural terrain standing where
// it is lower. The clip grid gains a column at every edge of that profile (on the base columns elsewhere, as the pad
// columns are). Where a cut lowers the terrain, its vertices get a scrub weight with which the terrain material
// turns the imagery toward the cut's scrub colours.
// Outside the corridor the terrain is untouched. A terrain triangle that overlaps the corridor is
// clipped against a grid of cells (rows along s, columns along d, quads between the normals) so the
// bed and slope edges become terrain edges; every piece keeps the triangle's UV mapping. New vertices get
// the edited surface's own normal and a weight (how far the envelope moved them), with which the terrain
// material turns from the imagery's object-space normal map (the natural slope) to the edited slope.
import { horizontalAt, horizontalProject, lateral, profileAt } from './alignment';
import type { ProfilePoint } from './alignment';
import { dressingBreaks, dressingPads, padHeight, sideWidening } from './dressing';
import type { TerrainPad } from './dressing';
import { buildApproach } from './route';
import type { Approach } from './route';
import type { ApproachCrossSection, SceneApproaches, SceneDressing, StructureKind } from '../data';

export const START_FADE = 5, END_FADE = 30, DISSOLVE_DEPTH = .1;
/** Row spacing of the clip grid (m) and how far the grid extends beyond the corridor to cover every overlapping triangle. */
export const ROW_STEP = 5, EXTEND = 150, OUTER = 200;
/** Row and column spacing (m) of the clip grid over a terrain pad: with the 0.5 m that keeps columns apart, cell diagonals stay under ./dressing PAD_HOLD. */
export const PAD_STEP = 3;
/** Terrain levels that hold the approaches (both near sets); scripts/layout.ts checks the same levels. */
export const CORRIDOR_LEVELS = ['near', 'near_low'] as const;
/** Height change (m) at which a vertex takes the edited surface's normal fully. */
export const NORMAL_BLEND = .5;

export interface CorridorPlan {
  approach: Approach; cs: ApproachCrossSection;
  /** Structure interiors (clearance envelope) as station ranges. */
  clear: [number, number][];
  dissolve: [number, number];
  /** Station range where the envelope can differ from the terrain. */
  core: [number, number];
  bed: number;
  /** Extra width of the bed (and everything beyond it) at station s on side +1 or -1 (the approach's own N). */
  widen: (s: number, side: number) => number;
  /** Largest |d| the envelope can reach (reach plus the widest widening). */
  reach: number;
  /** Terrain pads under the dressing's pavement, applied in order after the envelope (./dressing). */
  pads: TerrainPad[];
  /** Benched cuts beside the road (fix round 3). */
  cuts: CutZone[];
  rows: Float64Array; cols: Float64Array;
  /** Each column's smallest and largest d over the rows (columns move with a widening). */
  colLo: Float64Array; colHi: Float64Array;
  /** Cell corners, (x, z) per row and column. */
  corners: Float64Array;
  /** Scene bounding box of the clip grid: xmin, zmin, xmax, zmax. */
  bbox: [number, number, number, number];
}

/**
 * A benched cut (layout.json approaches.<name>.cuts) in the plan's terms: its side in d (the data's side, given in
 * lane offsets x, times the approach's sign) and every lateral distance as |d|.
 */
export interface CutZone {
  side: 1 | -1; s: [number, number]; fade: number;
  /** The toe wall's front and back |d| and its top above the road; the profile rises across the wall's body wherever the wall stands or not. */
  wall: [number, number]; height: number;
  face: number; bench: [number, number]; reach: [number, number];
  /** |d| of the profile's edges: the wall's front and back, each face's top and bench's end short of reach[0], then the reach. */
  edges: number[];
  scrub: { dark: [number, number, number]; light: [number, number, number] };
}
/** An approach's benched cuts from its data, checked against the bed's half width. */
export function cutZones(approach: Approach, bed: number): CutZone[] {
  return (approach.data.cuts ?? []).map(c => {
    const [front, back] = c.toe.x, [width, rise] = c.bench;
    if (front < bed - 1e-9 || !(back > front) || !(c.face > 0) || !(rise > 0) || !(width >= 0) || !(c.reach[0] > back) || !(c.reach[1] > c.reach[0]) || !(c.fade > 0) || c.s[1] - c.s[0] < 2 * c.fade) {
      throw new Error(`cutZones: the ${approach.name} approach's cut over ${c.s.join(' to ')} is malformed`);
    }
    const edges = [front, back];
    for (let d = back, k = 0; ; k++) { d += k % 2 ? width : rise / c.face; if (d >= c.reach[0] - 1e-9) break; edges.push(+d.toFixed(6)); }
    return { side: (approach.sign * c.side) as 1 | -1, s: c.s, fade: c.fade, wall: [front, back], height: c.toe.height, face: c.face, bench: c.bench, reach: c.reach, edges: [...edges, ...c.reach], scrub: { dark: c.scrub.dark, light: c.scrub.light } };
  });
}

export function corridorPlan(approach: Approach, cs: ApproachCrossSection, structures: readonly { kind: StructureKind; from: number; to: number }[], dissolve: [number, number], dressing?: SceneDressing): CorridorPlan {
  const L = approach.length, A = cs.supports.abutment;
  const clear = structures.map(({ from, to }) => [from > 0 ? from + A : from, to < L ? to - A : to] as [number, number]).filter(([a, b]) => b > a);
  const core: [number, number] = [0, L + END_FADE];
  const bed = cs.barrier[1] + cs.envelope.bedMargin, [r1, r0] = cs.envelope.reach;
  const breaks = new Set<number>();
  for (let s = core[0] - EXTEND; s <= core[1] + EXTEND + 1e-9; s += ROW_STEP) breaks.add(+s.toFixed(6));
  for (const [a, b] of clear) { breaks.add(a); breaks.add(b); }
  for (const s of [...dissolve, L, core[0] + START_FADE, ...dressingBreaks(approach, dressing)]) breaks.add(s);
  const pads = dressingPads(approach, dressing, cs);
  for (const p of pads) for (let s = p.range[0]; s <= p.range[1] + 1e-9; s += PAD_STEP) breaks.add(+s.toFixed(6));
  const cuts = cutZones(approach, bed);
  for (const c of cuts) for (const s of [c.s[0], c.s[0] + c.fade, c.s[1] - c.fade, c.s[1]]) breaks.add(s);
  const widen = (s: number, side: number) => sideWidening(approach, dressing, cs.pavedHalfWidth, s, side);
  const rows = Float64Array.from([...breaks].sort((a, b) => a - b).filter((s, i, all) => i === 0 || s - all[i - 1]! > .25));
  const slope = [3, 7, 12].map(k => bed + k).filter(d => d < r1 - 1);
  const half = [bed, ...slope, r1, r0, OUTER];
  const base = [...half.map(d => -d).reverse(), ...half];
  // Pad columns: each pad's own, then every PAD_STEP m or less across the pads' merged lateral ranges beyond the
  // paved edge, each more than 0.5 m from every other column. Outside the pads' rows each lies on the nearest base
  // column toward the road (inside the bed, on the bed's edge), so the outermost cells stay the outermost.
  const padCols: number[] = [], cutCols: number[] = [], taken = (d: number) => [...base, ...padCols, ...cutCols].some(c => Math.abs(c - d) <= .5);
  for (const d of pads.flatMap(p => p.cols)) if (Math.abs(d) < OUTER && !taken(d)) padCols.push(d);
  for (const [lo, hi] of mergeRanges(pads.map(p => [p.range[2], p.range[3]]))) {
    const n = Math.max(1, Math.ceil((hi - lo) / PAD_STEP - 1e-9));
    for (let k = 0; k <= n; k++) { const d = lo + (hi - lo) * k / n; if (Math.abs(d) >= cs.pavedHalfWidth && Math.abs(d) < OUTER && !taken(d)) padCols.push(d); }
  }
  // Cut columns: every edge of each cut's profile on its side, placed like the pad columns outside the cuts' rows.
  for (const c of cuts) for (const e of c.edges) { const d = c.side * e; if (Math.abs(d) < OUTER && !taken(d)) cutCols.push(d); }
  const cols = Float64Array.from([...base, ...padCols, ...cutCols].sort((a, b) => a - b));
  const kinds = Uint8Array.from(cols, c => padCols.includes(c) ? 1 : cutCols.includes(c) ? 2 : 0);
  const anchor = Float64Array.from(cols, (c, j) => {
    if (!kinds[j]) return c;
    const inward = base.filter(b => Math.sign(b) === Math.sign(c) && Math.abs(b) <= Math.abs(c));
    return inward.length ? inward.reduce((p, q) => Math.abs(q) > Math.abs(p) ? q : p) : Math.sign(c) * bed;
  });
  const padRow = (s: number) => pads.some(p => s >= p.range[0] - 1e-6 && s <= p.range[1] + 1e-6);
  const cutRows = (s: number) => cuts.filter(c => s >= c.s[0] - 1e-6 && s <= c.s[1] + 1e-6);
  const corners = new Float64Array(rows.length * cols.length * 2), h = { x: 0, z: 0, tx: 0, tz: 1, curvature: 0 };
  const colLo = Float64Array.from(anchor), colHi = Float64Array.from(anchor);
  let xmin = Infinity, zmin = Infinity, xmax = -Infinity, zmax = -Infinity, reach = r0;
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]!, spread = padRow(s), cutting = cutRows(s);
    horizontalAt(approach.horizontal, s, h); const [nx, nz] = lateral(h.tx, h.tz);
    if (spread && (widen(s, -1) || widen(s, 1))) throw new Error(`corridorPlan: a terrain pad and a widening share station ${s} of the ${approach.name} approach`);
    if (cutting.some(c => spread || widen(s, c.side))) throw new Error(`corridorPlan: a cut shares station ${s} of the ${approach.name} approach with a terrain pad or a widening`);
    for (let j = 0; j < cols.length; j++) {
      const kind = kinds[j]!, c = !kind || (kind === 1 && spread) || (kind === 2 && cutting.length > 0) ? cols[j]! : anchor[j]!, side = Math.sign(c), e = Math.abs(c) < OUTER ? widen(s, side) : 0, d = c + side * e;
      colLo[j] = Math.min(colLo[j]!, d); colHi[j] = Math.max(colHi[j]!, d); reach = Math.max(reach, r0 + e);
      const x = h.x + nx * d, z = h.z + nz * d, k = (i * cols.length + j) * 2;
      corners[k] = x; corners[k + 1] = z;
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
    }
  }
  for (const c of cuts) reach = Math.max(reach, c.reach[1]);
  return { approach, cs, clear, dissolve, core, bed, widen, reach, pads, cuts, rows, cols, colLo, colHi, corners, bbox: [xmin, zmin, xmax, zmax] };
}
function mergeRanges(list: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lo, hi] of [...list].sort((p, q) => p[0] - q[0])) { const last = out[out.length - 1]; if (last && lo <= last[1]) last[1] = Math.max(last[1], hi); else out.push([lo, hi]); }
  return out;
}

/** Both approaches' corridor plans from data/layout.json `approaches` and `dressing`. */
export function approachCorridorPlans(approaches: SceneApproaches, roadEndZ: number, dressing?: SceneDressing): CorridorPlan[] {
  return (['south', 'north'] as const).map(name => {
    const data = approaches[name];
    return corridorPlan(buildApproach(name, data, roadEndZ), approaches.crossSection, data.structures, data.ends.dissolve, dressing);
  });
}

const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const scratch: ProfilePoint = { y: 0, grade: 0 };
/** True when station s is inside a structure's clearance zone. */
export function inClear(plan: CorridorPlan, s: number): boolean { for (const [a, b] of plan.clear) if (s >= a && s <= b) return true; return false; }
/** Depth of the at-grade bed below the road surface at station s. */
export function bedDepth(plan: CorridorPlan, s: number): number {
  const [a, b] = plan.dissolve, p = plan.cs.pavement;
  return s <= a ? p : s >= b ? DISSOLVE_DEPTH : p + (DISSOLVE_DEPTH - p) * (s - a) / (b - a);
}
/** The benched cut on side `side` (in d) at station s, if any. */
function cutAt(plan: CorridorPlan, s: number, side: number): CutZone | undefined {
  for (const c of plan.cuts) if (c.side === side && s > c.s[0] && s < c.s[1]) return c;
  return undefined;
}
/** A cut's weight along the road: in over `fade` m from its start, out over `fade` m to its end. */
export function cutWeight(cut: CutZone, s: number): number {
  return smooth((s - cut.s[0]) / cut.fade) * (1 - smooth((s - cut.s[1] + cut.fade) / cut.fade));
}
/**
 * A benched cut's surface at |d| = ad for the bed and road heights at its station: the bed to the wall's front, up
 * across the wall's body to its top, then faces rising `face` m per m with a bench bench[0] m wide after every
 * bench[1] m of rise.
 */
export function cutProfile(cut: CutZone, ad: number, bed: number, road: number): number {
  const [front, back] = cut.wall, top = road + cut.height;
  if (ad <= front) return bed;
  if (ad < back) return bed + (top - bed) * (ad - front) / (back - front);
  const [width, rise] = cut.bench, period = rise / cut.face + width, t = ad - back, k = Math.floor(t / period);
  return top + k * rise + Math.min((t - k * period) * cut.face, rise);
}
/**
 * The envelope's terrain height at (s, d) for the natural height h (h itself outside the corridor). Beside a benched
 * cut, on its side, it gives way by the cut's weight along the road to the cut's profile (the natural terrain where
 * lower, the envelope's fill where below the bed), which fades out laterally over the cut's own reach.
 */
function envelopeHeight(plan: CorridorPlan, s: number, d: number, h: number): number {
  const { cs, core } = plan, [r1, r0] = cs.envelope.reach, side = d < 0 ? -1 : 1, ad = Math.abs(d) - plan.widen(s, side);
  if (s <= core[0] || s >= core[1]) return h;
  const cut = plan.cuts.length ? cutAt(plan, s, side) : undefined, ws = cut ? cutWeight(cut, s) : 0;
  if (ad >= (cut && ws > 0 ? Math.max(r0, cut.reach[1]) : r0)) return h;
  const road = profileAt(plan.approach.profile, s, scratch).y, out = Math.max(0, ad - plan.bed), clear = inClear(plan, s);
  let target: number;
  if (clear) target = Math.min(h, road - cs.deck.girder - cs.clearance + cs.envelope.cut * out);
  else { const bed = road - bedDepth(plan, s); target = Math.min(bed + cs.envelope.cut * out, Math.max(bed - cs.envelope.fill * out, h)); }
  const L = plan.approach.length, along = (w: number) => w * smooth((s - core[0]) / START_FADE) * (1 - smooth((s - L) / (core[1] - L)));
  const w = along(ad <= r1 ? 1 : Math.max(0, (r0 - ad) / (r0 - r1)));
  if (!cut || !(ws > 0) || clear) return h + (target - h) * w;
  const bed = road - bedDepth(plan, s), y = Math.min(Math.max(bed - cs.envelope.fill * out, h), cutProfile(cut, ad, bed, road));
  const wc = along(ad <= cut.reach[0] ? 1 : (cut.reach[1] - ad) / (cut.reach[1] - cut.reach[0]));
  return h + (target - h) * w * (1 - ws) + (y - h) * wc * ws;
}
/**
 * Where a benched cut applies at (s, d): the cut and its weight there (along the road, in across the wall's body
 * from its front, out over the cut's reach, and with the corridor's start and end fades); null elsewhere.
 */
export function cutScrub(plan: CorridorPlan, s: number, d: number): { cut: CutZone; weight: number } | null {
  const { core } = plan, side = d < 0 ? -1 : 1;
  if (!plan.cuts.length || s <= core[0] || s >= core[1] || inClear(plan, s)) return null;
  const cut = cutAt(plan, s, side);
  if (!cut) return null;
  const ad = Math.abs(d) - plan.widen(s, side), [front, back] = cut.wall;
  if (ad <= front || ad >= cut.reach[1]) return null;
  const L = plan.approach.length, across = Math.min(1, (ad - front) / (back - front), (cut.reach[1] - ad) / (cut.reach[1] - cut.reach[0]));
  const weight = cutWeight(cut, s) * across * smooth((s - core[0]) / START_FADE) * (1 - smooth((s - L) / (core[1] - L)));
  return weight > 0 ? { cut, weight } : null;
}
const padFrame = { x: 0, z: 0, tx: 0, tz: 1, curvature: 0 };
/**
 * The corridor's terrain height at (s, d) for the natural height h (h itself outside the corridor): the envelope,
 * then the terrain pads. Scene x and z of the point, when known, save recomputing them for the pads.
 */
export function corridorHeight(plan: CorridorPlan, s: number, d: number, h: number, x?: number, z?: number): number {
  const y = envelopeHeight(plan, s, d, h);
  if (!plan.pads.length) return y;
  if (x === undefined || z === undefined) { horizontalAt(plan.approach.horizontal, s, padFrame); const [nx, nz] = lateral(padFrame.tx, padFrame.tz); x = padFrame.x + nx * d; z = padFrame.z + nz * d; }
  return padHeight(plan.pads, s, d, x, z, y);
}

/** Terrain tile arrays (scene space): positions xyz, normals xyz, uvs, triangle indices. */
export interface TileArrays { position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint32Array | Uint16Array }
export interface CorridorResult extends TileArrays {
  /** Per vertex: 0 for the tile's own vertices, else min(1, |height change| / NORMAL_BLEND). */
  weight: Float32Array;
  /**
   * Where a benched cut lowered the terrain: per vertex, the cut's weight (cutScrub) times min(1, depth of the cut /
   * NORMAL_BLEND), 0 elsewhere, with the cut's scrub colours (one pair per tile); null when no vertex has any.
   */
  scrub: { weight: Float32Array; dark: [number, number, number]; light: [number, number, number] } | null;
  /** Triangles replaced by clipped pieces, pieces emitted, vertices added, skirt triangles the corridor moves (cut and re-heighted with the surface beside them), overlapping triangles the clip grid did not cover (0 expected). */
  stats: { clipped: number; pieces: number; added: number; skirts: number; uncovered: number };
}

type Poly = number[]; // x, z pairs
function clipHalf(poly: Poly, ax: number, az: number, bx: number, bz: number, sign: number): Poly {
  // Keeps the part of poly on the left of a->b (sign 1) or right (sign -1), line points included.
  const out: Poly = [], n = poly.length / 2;
  if (!n) return out;
  const side = (x: number, z: number) => sign * ((bx - ax) * (z - az) - (bz - az) * (x - ax));
  let px = poly[(n - 1) * 2]!, pz = poly[(n - 1) * 2 + 1]!, ps = side(px, pz);
  for (let k = 0; k < n; k++) {
    const x = poly[k * 2]!, z = poly[k * 2 + 1]!, s = side(x, z);
    if (s >= 0) {
      if (ps < 0) { const t = ps / (ps - s); out.push(px + (x - px) * t, pz + (z - pz) * t); }
      out.push(x, z);
    } else if (ps >= 0) { const t = ps / (ps - s); out.push(px + (x - px) * t, pz + (z - pz) * t); }
    px = x; pz = z; ps = s;
  }
  return out;
}
/** The part of a polygon in (s, y) with sign (s - t) >= 0 (a skirt's plane: s along its line). */
function clipU(poly: Poly, t: number, sign: number): Poly {
  const out: Poly = [], n = poly.length / 2;
  for (let k = 0; k < n; k++) {
    const j = (k + n - 1) % n, pu = poly[j * 2]!, py = poly[j * 2 + 1]!, cu = poly[k * 2]!, cy = poly[k * 2 + 1]!, ps = sign * (pu - t), cs = sign * (cu - t);
    if (cs >= 0) { if (ps < 0) { const r = ps / (ps - cs); out.push(pu + (cu - pu) * r, py + (cy - py) * r); } out.push(cu, cy); }
    else if (ps >= 0) { const r = ps / (ps - cs); out.push(pu + (cu - pu) * r, py + (cy - py) * r); }
  }
  return out;
}
/** Clip-grid cells (rows i0..i1, columns j0..j1) that may overlap a piece of terrain spanning stations smin..smax and offsets dmin..dmax. */
function candidates(plan: CorridorPlan, smin: number, smax: number, dmin: number, dmax: number, margin: number): [number, number, number, number] {
  const { rows, colLo, colHi } = plan, nc = colLo.length;
  let i0 = 0; while (i0 < rows.length - 2 && rows[i0 + 1]! < smin - margin) i0++;
  let i1 = rows.length - 2; while (i1 > 0 && rows[i1]! > smax + margin) i1--;
  let j0 = 0; while (j0 < nc - 2 && colHi[j0 + 1]! < dmin - margin) j0++;
  let j1 = nc - 2; while (j1 > 0 && colLo[j1]! > dmax + margin) j1--;
  return [i0, i1, j0, j1];
}
/** Parameters in (0, 1), ascending, where the segment o + t e crosses the edges of the given clip-grid cells. */
function gridCuts(plan: CorridorPlan, ox: number, oz: number, ex: number, ez: number, [i0, i1, j0, j1]: [number, number, number, number]): number[] {
  const { corners } = plan, nc = plan.cols.length, out: number[] = [];
  const cut = (k: number, m: number) => {
    const cx = corners[k]!, cz = corners[k + 1]!, fx = corners[m]! - cx, fz = corners[m + 1]! - cz, den = ex * fz - ez * fx;
    if (Math.abs(den) < 1e-12) return;
    const t = ((cx - ox) * fz - (cz - oz) * fx) / den, r = ((cx - ox) * ez - (cz - oz) * ex) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && r >= -1e-9 && r <= 1 + 1e-9) out.push(t);
  };
  for (let i = i0; i <= i1 + 1; i++) for (let j = j0; j <= j1; j++) cut((i * nc + j) * 2, (i * nc + j + 1) * 2);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1 + 1; j++) cut((i * nc + j) * 2, ((i + 1) * nc + j) * 2);
  return out.sort((p, q) => p - q).filter((t, k, all) => k === 0 || t - all[k - 1]! > 1e-9);
}
function polyArea(poly: Poly): number {
  let a = 0; const n = poly.length / 2;
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += poly[k * 2]! * poly[j * 2 + 1]! - poly[j * 2]! * poly[k * 2 + 1]!; }
  return a / 2;
}

/**
 * Applies the corridors to one tile. Triangles that do not overlap a corridor keep their vertices;
 * overlapping ones are replaced by their clipped pieces with corridor heights. Skirt triangles
 * (vertical, zero area in plan) pass through unless the corridor moves them (a terrain pad across a tile
 * edge); then they are cut where the clip grid crosses them and re-heighted, so their tops follow the
 * edited edge (`stats.skirts` counts them).
 */
export function applyCorridors(tile: TileArrays, plans: readonly CorridorPlan[]): CorridorResult {
  const { position: P, normal: N, uv: U, index: I } = tile;
  const added: number[] = [], addedW: number[] = [], addedS: number[] = [], addedU: number[] = [], keep: number[] = [], pieces: number[] = [];
  let tone: CutZone['scrub'] | null = null;
  const weld = new Map<string, number>(), base = P.length / 3;
  const stats = { clipped: 0, pieces: 0, added: 0, skirts: 0, uncovered: 0 };
  const tri = I.length / 3;
  const skirtWeld = new Map<string, number>(), skirtNormals = new Map<number, number[]>(), skirtPieces: number[] = [];
  /** A skirt triangle cut where the clip grid crosses its line and re-heighted by the corridor, in its source winding. */
  const skirt = (plan: CorridorPlan, a: number, b: number, c: number, cells: [number, number, number, number]): void => {
    const v = [a, b, c], X = v.map(i => P[i * 3]!), Y = v.map(i => P[i * 3 + 1]!), Z = v.map(i => P[i * 3 + 2]!);
    let p0 = 0, p1 = 1, far = -1;
    for (const [i, j] of [[0, 1], [1, 2], [0, 2]] as const) { const l = Math.hypot(X[j]! - X[i]!, Z[j]! - Z[i]!); if (l > far) { far = l; p0 = i; p1 = j; } }
    const ox = X[p0]!, oz = Z[p0]!, ex = X[p1]! - ox, ez = Z[p1]! - oz, len2 = ex * ex + ez * ez;
    const u = v.map((_, k) => len2 > 1e-12 ? ((X[k]! - ox) * ex + (Z[k]! - oz) * ez) / len2 : 0);
    const det = (u[1]! - u[0]!) * (Y[2]! - Y[0]!) - (u[2]! - u[0]!) * (Y[1]! - Y[0]!);
    if (Math.abs(det) < 1e-12) return; // no area in its own plane either
    const h = plan.approach.horizontal, cuts = [0, ...gridCuts(plan, ox, oz, ex, ez, cells), 1];
    const vertex = (s: number, y: number): number => {
      const x = ox + ex * s, z = oz + ez * s, key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)},${Math.round(y * 1e4)}`, known = skirtWeld.get(key);
      if (known !== undefined) return known;
      // Barycentric weights in the triangle's own plane (s along its line, y up).
      const w1 = ((u[1]! - s) * (Y[2]! - y) - (u[2]! - s) * (Y[1]! - y)) / det, w2 = ((u[2]! - s) * (Y[0]! - y) - (u[0]! - s) * (Y[2]! - y)) / det, w3 = 1 - w1 - w2;
      const q = horizontalProject(h, x, z, 1e6)!;
      added.push(x, corridorHeight(plan, q.s, q.d, y, x, z), z); addedW.push(0); addedS.push(0);
      for (let k = 0; k < 2; k++) addedU.push(w1 * U[a * 2 + k]! + w2 * U[b * 2 + k]! + w3 * U[c * 2 + k]!);
      const index = base + added.length / 3 - 1;
      skirtWeld.set(key, index); skirtNormals.set(index, [0, 1, 2].map(k => w1 * N[a * 3 + k]! + w2 * N[b * 3 + k]! + w3 * N[c * 3 + k]!)); return index;
    };
    const source: Poly = [u[0]!, Y[0]!, u[1]!, Y[1]!, u[2]!, Y[2]!];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const poly = clipU(clipU(source, cuts[k]!, 1), cuts[k + 1]!, -1), n = poly.length / 2, ids: number[] = [];
      if (n < 3) continue;
      for (let m = 0; m < n; m++) ids.push(vertex(poly[m * 2]!, poly[m * 2 + 1]!));
      for (let m = 1; m < n - 1; m++) if (ids[0] !== ids[m] && ids[m] !== ids[m + 1] && ids[0] !== ids[m + 1]) skirtPieces.push(ids[0]!, ids[m]!, ids[m + 1]!);
    }
  };
  for (let t = 0; t < tri; t++) {
    const a = I[t * 3]!, b = I[t * 3 + 1]!, c = I[t * 3 + 2]!;
    const ax = P[a * 3]!, az = P[a * 3 + 2]!, bx = P[b * 3]!, bz = P[b * 3 + 2]!, cx = P[c * 3]!, cz = P[c * 3 + 2]!;
    const area2 = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    const plan = plans.find(p => Math.max(ax, bx, cx) >= p.bbox[0] && Math.min(ax, bx, cx) <= p.bbox[2] && Math.max(az, bz, cz) >= p.bbox[1] && Math.min(az, bz, cz) <= p.bbox[3]);
    if (!plan) { keep.push(a, b, c); continue; }
    const h = plan.approach.horizontal, r0 = plan.reach;
    const pa = horizontalProject(h, ax, az, 1e6)!, pb = horizontalProject(h, bx, bz, 1e6)!, pc = horizontalProject(h, cx, cz, 1e6)!;
    const smin = Math.min(pa.s, pb.s, pc.s), smax = Math.max(pa.s, pb.s, pc.s), dmin = Math.min(pa.d, pb.d, pc.d), dmax = Math.max(pa.d, pb.d, pc.d);
    const margin = 20 + (smax - smin + dmax - dmin) * .15;
    if (Math.abs(area2) < 1e-6) {
      // Skirts pass through unless the corridor moves them: then cut where the clip grid crosses them, as the
      // surface beside them is, and re-heighted. The corridor's height never falls as the natural height rises,
      // so their bottoms stay below their tops.
      const moved = ([[a, pa], [b, pb], [c, pc]] as const).some(([v, p]) => Math.abs(corridorHeight(plan, p.s, p.d, P[v * 3 + 1]!, P[v * 3]!, P[v * 3 + 2]!) - P[v * 3 + 1]!) > 1e-4);
      if (!moved) { keep.push(a, b, c); continue; }
      stats.skirts++; skirt(plan, a, b, c, candidates(plan, smin, smax, dmin, dmax, margin));
      continue;
    }
    const nearPad = plan.pads.some(q => smax >= q.range[0] - margin && smin <= q.range[1] + margin && dmax >= q.range[2] - margin && dmin <= q.range[3] + margin);
    if (!nearPad && (dmin > r0 + margin || dmax < -r0 - margin || smax < plan.core[0] - margin || smin > plan.core[1] + margin)) { keep.push(a, b, c); continue; }
    const { rows, corners } = plan, nc = plan.cols.length, [i0, i1, j0, j1] = candidates(plan, smin, smax, dmin, dmax, margin);
    const tpoly: Poly = area2 > 0 ? [ax, az, bx, bz, cx, cz] : [ax, az, cx, cz, bx, bz];
    const found: { poly: Poly; core: boolean }[] = [];
    let covered = 0, inCore = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k00 = (i * nc + j) * 2, k10 = ((i + 1) * nc + j) * 2, k11 = ((i + 1) * nc + j + 1) * 2, k01 = (i * nc + j + 1) * 2;
      const q = [corners[k00]!, corners[k00 + 1]!, corners[k10]!, corners[k10 + 1]!, corners[k11]!, corners[k11 + 1]!, corners[k01]!, corners[k01 + 1]!];
      // A pad column lying on its neighbour outside the pad's rows: a cell of no width.
      if (q[0] === q[6] && q[1] === q[7] && q[2] === q[4] && q[3] === q[5]) continue;
      const orient = polyArea(q) > 0 ? 1 : -1;
      let poly = tpoly;
      for (let e = 0; e < 4 && poly.length; e++) poly = clipHalf(poly, q[e * 2]!, q[e * 2 + 1]!, q[((e + 1) % 4) * 2]!, q[((e + 1) % 4) * 2 + 1]!, orient);
      if (poly.length < 6) continue;
      const pa2 = Math.abs(polyArea(poly)); if (pa2 < 1e-9) continue;
      covered += pa2;
      // Inside the reach: every cell but the outermost on each side (between the reach and OUTER).
      const core = rows[i + 1]! > plan.core[0] && rows[i]! < plan.core[1] && j > 0 && j < nc - 2;
      if (core) inCore = true;
      found.push({ poly, core });
    }
    const whole = Math.abs(area2) / 2;
    if (!inCore) { keep.push(a, b, c); continue; }
    if (Math.abs(covered - whole) > whole * 1e-6 + 1e-6) { stats.uncovered++; keep.push(a, b, c); continue; }
    stats.clipped++;
    // Barycentric interpolation within the source triangle for height, normal and uv.
    const ay = P[a * 3 + 1]!, by = P[b * 3 + 1]!, cy = P[c * 3 + 1]!;
    const vertex = (x: number, z: number): number => {
      const key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`, known = weld.get(key);
      if (known !== undefined) return known;
      const w1 = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area2, w2 = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area2, w3 = 1 - w1 - w2;
      const natural = w1 * ay + w2 * by + w3 * cy, p = horizontalProject(h, x, z, 1e6)!, y = corridorHeight(plan, p.s, p.d, natural, x, z);
      added.push(x, y, z); addedW.push(Math.min(1, Math.abs(y - natural) / NORMAL_BLEND));
      const scrub = cutScrub(plan, p.s, p.d), depth = scrub ? scrub.weight * Math.min(1, Math.max(0, natural - y) / NORMAL_BLEND) : 0;
      addedS.push(depth);
      if (depth > 0) {
        if (tone && tone !== scrub!.cut.scrub && String(tone.dark) + tone.light !== String(scrub!.cut.scrub.dark) + scrub!.cut.scrub.light) throw new Error('applyCorridors: two cuts with different scrub colours in one tile');
        tone = scrub!.cut.scrub;
      }
      for (let k = 0; k < 2; k++) addedU.push(w1 * U[a * 2 + k]! + w2 * U[b * 2 + k]! + w3 * U[c * 2 + k]!);
      const index = base + added.length / 3 - 1; weld.set(key, index); return index;
    };
    for (const { poly } of found) {
      const n = poly.length / 2, ids: number[] = [];
      for (let k = 0; k < n; k++) ids.push(vertex(poly[k * 2]!, poly[k * 2 + 1]!));
      for (let k = 1; k < n - 1; k++) {
        if (ids[0] === ids[k] || ids[k] === ids[k + 1] || ids[0] === ids[k + 1]) continue;
        // Keep the source winding: tpoly was made counter-clockwise in (x, z); flip back when the source was not.
        if (area2 > 0) pieces.push(ids[0]!, ids[k]!, ids[k + 1]!); else pieces.push(ids[0]!, ids[k + 1]!, ids[k]!);
        stats.pieces++;
      }
    }
  }
  stats.added = added.length / 3;
  const count = base + stats.added;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2), weight = new Float32Array(count);
  position.set(P); position.set(added, P.length); normal.set(N); uv.set(U); uv.set(addedU, U.length); weight.set(addedW, base);
  // New vertices take the edited surface's normal: the area-weighted, upward face normals of their pieces.
  for (let k = 0; k < pieces.length; k += 3) {
    const i0 = pieces[k]!, i1 = pieces[k + 1]!, i2 = pieces[k + 2]!;
    const ax = position[i0 * 3]!, ay = position[i0 * 3 + 1]!, az = position[i0 * 3 + 2]!;
    const ux = position[i1 * 3]! - ax, uy = position[i1 * 3 + 1]! - ay, uz = position[i1 * 3 + 2]! - az, vx = position[i2 * 3]! - ax, vy = position[i2 * 3 + 1]! - ay, vz = position[i2 * 3 + 2]! - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (const i of [i0, i1, i2]) { normal[i * 3] = normal[i * 3]! + nx; normal[i * 3 + 1] = normal[i * 3 + 1]! + ny; normal[i * 3 + 2] = normal[i * 3 + 2]! + nz; }
  }
  // Skirt vertices keep their source's (interpolated) normals.
  for (const [v, n] of skirtNormals) normal.set(n, v * 3);
  for (let v = base; v < count; v++) { const x = normal[v * 3]!, y = normal[v * 3 + 1]!, z = normal[v * 3 + 2]!, l = Math.hypot(x, y, z) || 1; normal[v * 3] = x / l; normal[v * 3 + 1] = y / l; normal[v * 3 + 2] = z / l; }
  const total = keep.length + pieces.length + skirtPieces.length, index = count > 65535 ? new Uint32Array(total) : new Uint16Array(total);
  index.set(keep); index.set(pieces, keep.length); index.set(skirtPieces, keep.length + pieces.length);
  let scrub: CorridorResult['scrub'] = null;
  const found = tone as CutZone['scrub'] | null; // assigned in vertex()
  if (found) { const w = new Float32Array(count); w.set(addedS, base); scrub = { weight: w, dark: found.dark, light: found.light }; }
  return { position, normal, uv, index, weight, scrub, stats };
}
