// SPDX-License-Identifier: MIT
// Highway alignment geometry for the approach roads (data/layout.json `approaches`, D-21): a horizontal
// alignment of tangents joined by circular curves at points of intersection (PIs), and a vertical profile
// of grades joined by parabolic vertical curves at points of vertical intersection (PVIs), both as
// functions of the station s (metres along the centreline from the bridge's road end). Pure and
// deterministic (no three.js): the runtime, scripts/layout.ts and the checks share it.
//
// Frame: scene metres, +X west, +Z north. A tangent (tx, tz) is the unit direction of increasing s.

/** Horizontal alignment as authored: start point and direction, PIs with curve radii, end point. */
export interface HorizontalInput { start: readonly [number, number]; direction: readonly [number, number]; pis: readonly (readonly [number, number])[]; radii: readonly number[]; end: readonly [number, number] }
export type HorizontalElement =
  | { kind: 'tangent'; s0: number; length: number; x0: number; z0: number; tx: number; tz: number }
  | { kind: 'arc'; s0: number; length: number; x0: number; z0: number; tx: number; tz: number; radius: number; /** +1 turning toward +left (counter-clockwise seen from above with +X west... see turn()), -1 the other way. */ turn: 1 | -1; cx: number; cz: number };
export interface Horizontal { elements: HorizontalElement[]; length: number }
export interface HorizontalPoint { x: number; z: number; tx: number; tz: number; /** Signed curvature (1/m), positive when the road turns toward the lateral +d side (see lateral()). */ curvature: number }

/**
 * The lateral unit vector of a tangent: +d. On the bridge (tangent +Z) it is +X, so the lateral offset d
 * is the deck's x. N = (tz, -tx).
 */
export function lateral(tx: number, tz: number): [number, number] { return [tz, -tx]; }

/** Builds the tangent and arc elements. Throws when a curve does not fit between its neighbours. */
export function buildHorizontal(input: HorizontalInput): Horizontal {
  const points = [input.start, ...input.pis, input.end];
  if (input.radii.length !== input.pis.length) throw new Error('alignment: one radius per PI');
  const dirs: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0], dz = points[i]![1] - points[i - 1]![1], n = Math.hypot(dx, dz);
    if (!(n > 1e-6)) throw new Error('alignment: coincident points');
    dirs.push([dx / n, dz / n]);
  }
  const [dx0, dz0] = input.direction;
  if (Math.abs(dirs[0]![0] * dz0 - dirs[0]![1] * dx0) > 1e-9 || dirs[0]![0] * dx0 + dirs[0]![1] * dz0 < 0) throw new Error('alignment: the first PI is not straight ahead of the start');
  // Tangent lengths T = R tan(delta / 2); the curve at PI i runs from PI - T u_in to PI + T u_out.
  const tangentLength = input.pis.map((_, i) => {
    const a = dirs[i]!, b = dirs[i + 1]!, cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])), delta = Math.acos(cos);
    return input.radii[i]! * Math.tan(delta / 2);
  });
  const elements: HorizontalElement[] = [];
  let s = 0, x = input.start[0], z = input.start[1];
  for (let i = 0; i <= input.pis.length; i++) {
    const u = dirs[i]!, target = points[i + 1]!, back = i < input.pis.length ? tangentLength[i]! : 0;
    const run = Math.hypot(target[0] - x, target[1] - z) - back;
    if (run < -1e-6) throw new Error(`alignment: curves at PIs ${i} and ${i + 1} overlap (${run.toFixed(2)} m)`);
    if (run > 1e-9) { elements.push({ kind: 'tangent', s0: s, length: run, x0: x, z0: z, tx: u[0], tz: u[1] }); s += run; x += u[0] * run; z += u[1] * run; }
    if (i === input.pis.length) break;
    const v = dirs[i + 1]!, cross = u[0] * v[1] - u[1] * v[0], delta = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))), radius = input.radii[i]!;
    if (delta < 1e-9) continue;
    // Centre on the inside of the turn: rotate u by +90 degrees in (x, z) when cross > 0.
    const turn: 1 | -1 = cross > 0 ? 1 : -1, nx = -u[1] * turn, nz = u[0] * turn, length = radius * delta;
    const cx = x + nx * radius, cz = z + nz * radius;
    elements.push({ kind: 'arc', s0: s, length, x0: x, z0: z, tx: u[0], tz: u[1], radius, turn, cx, cz });
    s += length;
    const end = arcPoint(elements[elements.length - 1] as Extract<HorizontalElement, { kind: 'arc' }>, length); x = end.x; z = end.z;
  }
  return { elements, length: s };
}

function arcPoint(e: Extract<HorizontalElement, { kind: 'arc' }>, ds: number): HorizontalPoint {
  // Rotate the start radius vector (start - centre) by turn * ds / R around the centre.
  const a = e.turn * ds / e.radius, c = Math.cos(a), sn = Math.sin(a), rx = e.x0 - e.cx, rz = e.z0 - e.cz;
  const x = e.cx + rx * c - rz * sn, z = e.cz + rx * sn + rz * c;
  const tx = e.tx * c - e.tz * sn, tz = e.tx * sn + e.tz * c;
  // Turning toward +cross ((x, z) counter-clockwise) turns away from N = (tz, -tx): curvature toward +d is -turn / R.
  return { x, z, tx, tz, curvature: -e.turn / e.radius };
}

/** Index of the element containing station s (clamped to the alignment). */
function elementAt(h: Horizontal, s: number): number {
  let lo = 0, hi = h.elements.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (h.elements[mid]!.s0 <= s) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Point, tangent and curvature at station s; beyond either end the end tangents extend straight. */
export function horizontalAt(h: Horizontal, s: number, out?: HorizontalPoint): HorizontalPoint {
  const e = h.elements[elementAt(h, s)]!, ds = s - e.s0;
  const p = out ?? { x: 0, z: 0, tx: 0, tz: 1, curvature: 0 };
  if (e.kind === 'arc' && ds >= 0 && ds <= e.length) { Object.assign(p, arcPoint(e, ds)); return p; }
  if (e.kind === 'arc') {
    // Past the end of a final arc (or before a first one): continue along its end (start) tangent.
    const at = arcPoint(e, ds > 0 ? e.length : 0), extra = ds > 0 ? ds - e.length : ds;
    p.x = at.x + at.tx * extra; p.z = at.z + at.tz * extra; p.tx = at.tx; p.tz = at.tz; p.curvature = 0; return p;
  }
  p.x = e.x0 + e.tx * ds; p.z = e.z0 + e.tz * ds; p.tx = e.tx; p.tz = e.tz; p.curvature = 0; return p;
}

/**
 * Station and lateral offset (d along N = (tz, -tx)) of the closest centreline point to (x, z). Returns
 * null when the point is beyond either end by more than `beyond` metres.
 */
export function horizontalProject(h: Horizontal, x: number, z: number, beyond = 0): { s: number; d: number } | null {
  // Closest point per element, analytic; the best over all elements.
  let best = Infinity, bs = 0, bd = 0;
  for (const e of h.elements) {
    let s: number, px: number, pz: number, tx: number, tz: number;
    if (e.kind === 'tangent') {
      const t = Math.max(0, Math.min(e.length, (x - e.x0) * e.tx + (z - e.z0) * e.tz));
      s = e.s0 + t; px = e.x0 + e.tx * t; pz = e.z0 + e.tz * t; tx = e.tx; tz = e.tz;
    } else {
      // Angle of (x, z) around the centre relative to the start radius, in the turning sense.
      const rx = e.x0 - e.cx, rz = e.z0 - e.cz, qx = x - e.cx, qz = z - e.cz;
      const a = Math.atan2(rx * qz - rz * qx, rx * qx + rz * qz) * e.turn;
      const t = Math.max(0, Math.min(e.length, a * e.radius)), p = arcPoint(e, t);
      s = e.s0 + t; px = p.x; pz = p.z; tx = p.tx; tz = p.tz;
    }
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best - 1e-9) { best = dist; bs = s; const [nx, nz] = lateral(tx, tz); bd = (x - px) * nx + (z - pz) * nz; }
  }
  // Beyond the ends: extend the end tangents.
  const first = horizontalAt(h, 0), last = horizontalAt(h, h.length);
  const before = (x - first.x) * first.tx + (z - first.z) * first.tz, after = (x - last.x) * last.tx + (z - last.z) * last.tz;
  if (bs <= 1e-9 && before < 0) { if (-before > beyond) return null; const [nx, nz] = lateral(first.tx, first.tz); return { s: before, d: (x - first.x) * nx + (z - first.z) * nz }; }
  if (bs >= h.length - 1e-9 && after > 0) { if (after > beyond) return null; const [nx, nz] = lateral(last.tx, last.tz); return { s: h.length + after, d: (x - last.x) * nx + (z - last.z) * nz }; }
  return { s: bs, d: bd };
}

/** A vertical profile: PVIs (station, elevation) with curve lengths (0 at the two ends). */
export interface Profile { pvis: readonly (readonly [number, number, number])[] }
export interface ProfilePoint { y: number; grade: number }

/** Checks that the vertical curves do not overlap and lie within the profile. */
export function checkProfile(p: Profile): void {
  const v = p.pvis;
  if (v.length < 2) throw new Error('profile: at least two PVIs');
  for (let i = 1; i < v.length; i++) if (!(v[i]![0] > v[i - 1]![0])) throw new Error('profile: stations must increase');
  if (v[0]![2] !== 0 || v.at(-1)![2] !== 0) throw new Error('profile: no curves at the ends');
  for (let i = 1; i < v.length; i++) {
    const room = v[i]![0] - v[i - 1]![0] - (v[i]![2] + v[i - 1]![2]) / 2;
    if (room < -1e-6) throw new Error(`profile: vertical curves at PVIs ${i - 1} and ${i} overlap (${room.toFixed(2)} m)`);
  }
}

/** Elevation and grade at station s; beyond the ends the end grades continue. */
export function profileAt(p: Profile, s: number, out?: ProfilePoint): ProfilePoint {
  const v = p.pvis, r = out ?? { y: 0, grade: 0 };
  // The last PVI at or before s + half its curve decides.
  let i = 1;
  while (i < v.length - 1 && v[i]![0] + v[i]![2] / 2 <= s) i++;
  // Segment between PVI i-1 and i (grade g), unless s is inside the curve at i or at i-1.
  const grade = (k: number) => (v[k + 1]![1] - v[k]![1]) / (v[k + 1]![0] - v[k]![0]);
  const [si, yi, li] = v[i]!;
  if (li > 0 && s >= si - li / 2 && s <= si + li / 2) {
    const g1 = grade(i - 1), g2 = grade(i), sb = si - li / 2, yb = yi - g1 * li / 2, t = s - sb;
    r.y = yb + g1 * t + (g2 - g1) / (2 * li) * t * t; r.grade = g1 + (g2 - g1) * t / li; return r;
  }
  const k = s < si - li / 2 ? i - 1 : i;
  const kk = Math.min(k, v.length - 2), g = grade(kk), [sk, yk] = v[kk]!;
  r.y = yk + g * (s - sk); r.grade = g; return r;
}
