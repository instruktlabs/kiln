// SPDX-License-Identifier: MIT
// The campus ground from data (FF-C1 items 1, 3 and 5): the road surfaces, markings and ground layers as flat
// triangle meshes at grade, the traffic lanes as paths (lines and arcs), the car's drivable area, the parking stalls,
// the satellites and the light standards. Pure: no three, React or DOM, so scripts/build-campus.ts, the bun tests
// and the exterior scene build the same geometry from data/campus.json (D-21).
//
// Plan coordinates are (u, v) = (campus x, campus z); an angle is atan2(v, u) in radians (0 = north, +pi/2 = east).
// A heading in that measure turns into a three.js yaw (rotation.y) of -heading for a model whose forward is +X.
import type { CampusLane, CampusLights, CampusParking, CampusRoads, CampusSatellites, LaneSegment, ParkingLoop, V2 } from './data';

// ---------------------------------------------------------------- colour

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** A #rrggbb sRGB colour as linear RGB (vertex colours and instance colours are linear). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

// ---------------------------------------------------------------- meshes

/** A flat triangle mesh: positions (x, y, z) and linear vertex colours (r, g, b), CCW seen from above (normal +Y). */
/** A run of triangles [from, to) a builder drew under one tag (what the surface is: the drive check reads road from it). */
export interface MeshSpan { tag: string; from: number; to: number }
export interface MeshArrays { positions: Float32Array; colors: Float32Array; indices: Uint32Array; triangles: number; spans: MeshSpan[] }
export class MeshBuilder {
  readonly p: number[] = []; readonly c: number[] = []; readonly i: number[] = [];
  readonly spans: MeshSpan[] = [];
  constructor(readonly y = 0) {}
  /** Tags the triangles drawn from now on. */
  tag(tag: string): this {
    const at = this.i.length / 3, last = this.spans[this.spans.length - 1];
    if (last) last.to = at;
    if (last && last.from === at) this.spans.pop();
    this.spans.push({ tag, from: at, to: at });
    return this;
  }
  vertex(u: number, v: number, colour: readonly number[]): number {
    this.p.push(u, this.y, v); this.c.push(colour[0]!, colour[1]!, colour[2]!);
    return this.p.length / 3 - 1;
  }
  /** A quad a b c d given counter-clockwise in (u, v) seen with u up and v right (so the triangles face +Y). */
  quad(a: V2, b: V2, c: V2, d: V2, ca: readonly number[], cb: readonly number[] = ca, cc: readonly number[] = cb, cd: readonly number[] = ca): void {
    const ia = this.vertex(a[0], a[1], ca), ib = this.vertex(b[0], b[1], cb), ic = this.vertex(c[0], c[1], cc), id = this.vertex(d[0], d[1], cd);
    this.face(ia, ib, ic); this.face(ia, ic, id);
  }
  /** One triangle; the winding is fixed so its normal is +Y (three.js front face, counter-clockwise seen from +Y). */
  face(a: number, b: number, c: number): void {
    const P = this.p, ax = P[a * 3]!, az = P[a * 3 + 2]!, bx = P[b * 3]!, bz = P[b * 3 + 2]!, cx = P[c * 3]!, cz = P[c * 3 + 2]!;
    // Normal y of (b - a) x (c - a) is (bz - az)(cx - ax) - (bx - ax)(cz - az); positive faces +Y.
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny >= 0) this.i.push(a, b, c); else this.i.push(a, c, b);
  }
  /** A rectangle u0..u1 by v0..v1. */
  rect(u0: number, u1: number, v0: number, v1: number, colour: readonly number[]): void { this.quad([u0, v0], [u1, v0], [u1, v1], [u0, v1], colour); }
  /** A ribbon of `width` along a polyline. */
  ribbon(points: readonly V2[], width: number, colour: readonly number[]): void {
    for (let k = 0; k + 1 < points.length; k++) {
      const a = points[k]!, b = points[k + 1]!, du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv);
      if (l < 1e-9) continue;
      const nu = -dv / l * width / 2, nv = du / l * width / 2;
      this.quad([a[0] + nu, a[1] + nv], [a[0] - nu, a[1] - nv], [b[0] - nu, b[1] - nv], [b[0] + nu, b[1] + nv], colour);
    }
  }
  /** An annulus (or a disc when r0 = 0) from angle a0 sweeping `sweep`, in `segments` steps. */
  annulus(r0: number, r1: number, colour: readonly number[], segments = 128, a0 = 0, sweep = Math.PI * 2): void {
    for (let k = 0; k < segments; k++) {
      const t0 = a0 + sweep * k / segments, t1 = a0 + sweep * (k + 1) / segments;
      const p = (r: number, t: number): V2 => [r * Math.cos(t), r * Math.sin(t)];
      if (r0 <= 0) { const o = this.vertex(0, 0, colour), b = this.vertex(...p(r1, t0), colour), c = this.vertex(...p(r1, t1), colour); this.face(o, b, c); }
      else this.quad(p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1), colour);
    }
  }
  build(): MeshArrays {
    const triangles = this.i.length / 3, last = this.spans[this.spans.length - 1];
    if (last) last.to = triangles;
    return { positions: new Float32Array(this.p), colors: new Float32Array(this.c), indices: new Uint32Array(this.i), triangles, spans: this.spans.filter(sp => sp.to > sp.from).map(sp => ({ ...sp })) };
  }
}

/** A dashed or solid line along a straight segment (width across). */
function line(m: MeshBuilder, a: V2, b: V2, width: number, colour: readonly number[], dash?: { dash: number; gap: number }): void {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!dash) { m.ribbon([a, b], width, colour); return; }
  const period = dash.dash + dash.gap, du = (b[0] - a[0]) / length, dv = (b[1] - a[1]) / length;
  // Dashes centred in the length, so both ends of a run look alike.
  const count = Math.max(1, Math.floor((length + dash.gap) / period)), start = (length - (count * period - dash.gap)) / 2;
  for (let k = 0; k < count; k++) {
    const s0 = start + k * period, s1 = s0 + dash.dash;
    m.ribbon([[a[0] + du * s0, a[1] + dv * s0], [a[0] + du * s1, a[1] + dv * s1]], width, colour);
  }
}
/** A dashed or solid arc of radius r about the origin from angle a0 sweeping `sweep`. */
function arcLine(m: MeshBuilder, r: number, a0: number, sweep: number, width: number, colour: readonly number[], dash?: { dash: number; gap: number }): void {
  const length = Math.abs(sweep) * r, step = 2 / r; // a chord every 2 m
  const run = (s0: number, s1: number) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / (step * r))), pts: V2[] = [];
    for (let k = 0; k <= n; k++) { const t = a0 + Math.sign(sweep) * (s0 + (s1 - s0) * k / n) / r; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    m.ribbon(pts, width, colour);
  };
  if (!dash) { run(0, length); return; }
  const period = dash.dash + dash.gap, count = Math.max(1, Math.floor((length + dash.gap) / period)), start = (length - (count * period - dash.gap)) / 2;
  for (let k = 0; k < count; k++) run(start + k * period, start + k * period + dash.dash);
}

export interface GroundLayer {
  name: 'grade' | 'paved' | 'ring' | 'markings';
  /** Draw order: every ground layer draws before the scene, without depth test or write, in this order. */
  order: number;
  mesh: MeshArrays;
}

/** The ring's road mouths: angle intervals (centre, half width) where the split road and the cross pass meet it. */
export function ringMouths(roads: CampusRoads, r: number): { centre: number; half: number }[] {
  const split = Math.asin(Math.min(1, roads.split.halfWidth / r)), cross = Math.asin(Math.min(1, roads.cross.halfWidth / r));
  return [{ centre: 0, half: split }, { centre: Math.PI / 2, half: cross }, { centre: Math.PI, half: split }, { centre: -Math.PI / 2, half: cross }];
}

/** The ground: grade, paved surfaces (roads, bays, plazas, parking aisles), the ring's inner apron, kerb and island,
 *  and the markings. All at the roads' grade Y. */
export function groundLayers(roads: CampusRoads, parking: CampusParking): GroundLayer[] {
  const P = roads.palette, y = roads.gradeY;
  const grade = hexToLinear(P.grade), asphalt = hexToLinear(P.asphalt), apron = hexToLinear(P.apron), white = hexToLinear(P.marking), centre = hexToLinear(P.centre);
  const kerb = hexToLinear(P.kerb), island = hexToLinear(P.island), parkingColour = hexToLinear(P.parking), plaza = hexToLinear(P.plaza);

  const g = new MeshBuilder(y).tag('grade');
  g.annulus(0, roads.gradeRadius, grade, 96);

  // Paved: the split road with its dissolve stretches (the surface blends into grade toward the ends), the cross pass
  // with its own, the roundabout disc, the drop-off bays, the canopy plazas and the parking aisles with their stalls.
  const p = new MeshBuilder(y).tag('split-dissolve'), S = roads.split, C = roads.cross;
  const [u0, u1] = S.u, inner0 = u0 + S.dissolve, inner1 = u1 - S.dissolve, steps = 12;
  const mix = (a: readonly number[], b: readonly number[], t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    // South end: grade at u0 to asphalt at inner0; north end mirrored.
    p.quad([u0 + (inner0 - u0) * t0, -S.halfWidth], [u0 + (inner0 - u0) * t0, S.halfWidth], [u0 + (inner0 - u0) * t1, S.halfWidth], [u0 + (inner0 - u0) * t1, -S.halfWidth],
      mix(grade, asphalt, t0), mix(grade, asphalt, t0), mix(grade, asphalt, t1), mix(grade, asphalt, t1));
    p.quad([inner1 + (u1 - inner1) * t0, -S.halfWidth], [inner1 + (u1 - inner1) * t0, S.halfWidth], [inner1 + (u1 - inner1) * t1, S.halfWidth], [inner1 + (u1 - inner1) * t1, -S.halfWidth],
      mix(asphalt, grade, t0), mix(asphalt, grade, t0), mix(asphalt, grade, t1), mix(asphalt, grade, t1));
  }
  p.tag('split').rect(inner0, inner1, -S.halfWidth, S.halfWidth, asphalt);
  const cInner = C.v - C.dissolve;
  for (const sign of [-1, 1]) {
    p.tag('cross').rect(-C.halfWidth, C.halfWidth, sign > 0 ? 0 : -cInner, sign > 0 ? cInner : 0, asphalt);
    p.tag('cross-dissolve');
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps, a = sign * (cInner + C.dissolve * t0), b = sign * (cInner + C.dissolve * t1);
      p.quad([-C.halfWidth, a], [C.halfWidth, a], [C.halfWidth, b], [-C.halfWidth, b], mix(asphalt, grade, t0), mix(asphalt, grade, t0), mix(asphalt, grade, t1), mix(asphalt, grade, t1));
    }
  }
  p.tag('roundabout').annulus(0, roads.roundabout.radius, asphalt, 128);
  // Within one layer later triangles draw over earlier ones: the plazas first, then the bays cut into them.
  p.tag('plaza');
  for (const pz of roads.plazas) p.rect(pz.u[0], pz.u[1], pz.v[0], pz.v[1], plaza);
  p.tag('bay');
  for (const bay of roads.dropOff) p.rect(bay.u[0], bay.u[1], bay.v[0], bay.v[1], asphalt);
  p.tag('parking');
  for (const loop of parking.loops) {
    const pts = loopPolyline(loop, 4);
    p.ribbon(pts, loop.aisle + 2 * loop.depth, parkingColour);
  }

  // The ring's inside: the apron, the kerb and the planted island.
  const R = roads.roundabout, ring = new MeshBuilder(y);
  ring.tag('apron').annulus(R.island + R.kerb, R.apronTo, apron, 128);
  ring.tag('kerb').annulus(R.island, R.island + R.kerb, kerb, 128);
  ring.tag('island').annulus(0, R.island, island, 96);

  // Markings: the split road's dashed centre line, dashed lane lines, solid inner and outer edge lines (the outer
  // broken at the drop-off bays); the cross pass the same across u; the ring's lane lines (dashed), its inner edge and
  // its outer edge broken at the four mouths.
  const m = new MeshBuilder(y).tag('markings'), w = S.lineWidth, runs: [number, number][] = [[-S.carEnd, -S.markingsFrom], [S.markingsFrom, S.carEnd]];
  const laneLines = (lanes: { perDirection: number; width: number; firstCentre: number }) => {
    const out: number[] = [];
    for (let k = 1; k < lanes.perDirection; k++) out.push(lanes.firstCentre - lanes.width / 2 + k * lanes.width);
    return out;
  };
  const bays = roads.dropOff;
  for (const [a, b] of runs) {
    line(m, [a, 0], [b, 0], w, centre, S.centreDash);
    for (const sign of [-1, 1]) {
      for (const at of laneLines(S.lanes)) line(m, [a, sign * at], [b, sign * at], w, white, S.laneDash);
      line(m, [a, sign * S.edgeLine], [b, sign * S.edgeLine], w, white);
      // The outer edge line, broken where a drop-off bay opens on this side.
      let from = a;
      for (const bay of [...bays].filter(bb => Math.sign(bb.v[0] + bb.v[1]) === sign && bb.u[1] > a && bb.u[0] < b).sort((x, y2) => x.u[0] - y2.u[0])) {
        if (bay.u[0] > from) line(m, [from, sign * S.outerEdgeLine], [bay.u[0], sign * S.outerEdgeLine], w, white);
        from = Math.max(from, bay.u[1]);
      }
      if (from < b) line(m, [from, sign * S.outerEdgeLine], [b, sign * S.outerEdgeLine], w, white);
    }
  }
  const crossRuns: [number, number][] = [[R.radius + 5, C.stubEnd], [C.outerFrom, C.v - C.dissolve]];
  for (const sign of [-1, 1]) for (const [a, b] of crossRuns) {
    const va = sign * a, vb = sign * b;
    line(m, [0, va], [0, vb], w, centre, S.centreDash);
    for (const side of [-1, 1]) {
      for (const at of laneLines(C.lanes)) line(m, [side * at, va], [side * at, vb], w, white, S.laneDash);
      line(m, [side * (C.lanes.firstCentre - C.lanes.width / 2 + C.lanes.perDirection * C.lanes.width), va], [side * (C.lanes.firstCentre - C.lanes.width / 2 + C.lanes.perDirection * C.lanes.width), vb], w, white);
      line(m, [side * (C.halfWidth - 0.5), va], [side * (C.halfWidth - 0.5), vb], w, white);
    }
  }
  const ringInner = R.lanes.inner, ringOuter = R.lanes.inner + R.lanes.count * R.lanes.width;
  arcLine(m, ringInner, 0, Math.PI * 2, w, white);
  for (let k = 1; k < R.lanes.count; k++) arcLine(m, ringInner + k * R.lanes.width, 0, Math.PI * 2, w, white, { dash: 3, gap: 3 });
  const mouths = ringMouths(roads, ringOuter).map(mo => [mo.centre - mo.half, mo.centre + mo.half] as V2).sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < mouths.length; k++) {
    const from = mouths[k]![1], to = k + 1 < mouths.length ? mouths[k + 1]![0] : mouths[0]![0] + Math.PI * 2;
    if (to > from) arcLine(m, ringOuter, from, to - from, w, white);
  }

  return [
    { name: 'grade', order: -40, mesh: g.build() },
    { name: 'paved', order: -30, mesh: p.build() },
    { name: 'ring', order: -25, mesh: ring.build() },
    { name: 'markings', order: -10, mesh: m.build() },
  ];
}

// ---------------------------------------------------------------- lanes

const segLength = (s: LaneSegment) => s.length;
/** The split road's traffic lanes (both directions, lanes.perDirection each) through the roundabout. A northbound
 *  lane k runs at v = firstCentre + k width from the south end to the north end: straight to its approach fillet (a
 *  right turn of radius `fillet`, tangent to the lane line and to ring lane k), counter-clockwise round the east half
 *  of the ring, out by the mirrored fillet and straight on. A southbound lane is the northbound lane turned 180
 *  degrees about the origin (the west half of the ring). Right-hand traffic; the two flows never cross. */
export function buildLanes(roads: CampusRoads, speeds: readonly number[]): CampusLane[] {
  const S = roads.split, R = roads.roundabout, rho = R.fillet, lanes: CampusLane[] = [];
  for (let k = 0; k < S.lanes.perDirection; k++) {
    const c = S.lanes.firstCentre + k * S.lanes.width, ring = R.lanes.inner + R.lanes.width * (k + 0.5);
    const cu = -Math.sqrt((ring + rho) ** 2 - (c + rho) ** 2), cv = c + rho; // the approach fillet's centre
    const tangentAngle = Math.atan2(-cv, -cu); // from the fillet centre toward the ring joint (toward the origin)
    const ringStart = Math.atan2(cv, cu), ringEnd = Math.PI - ringStart; // joint angles on the ring (south, north)
    const filletSweep = tangentAngle - (-Math.PI / 2);
    const north: LaneSegment[] = [
      { kind: 'line', from: [S.u[0], c], to: [cu, c], length: cu - S.u[0] },
      { kind: 'arc', centre: [cu, cv], radius: rho, start: -Math.PI / 2, sweep: filletSweep, length: rho * Math.abs(filletSweep) },
      { kind: 'arc', centre: [0, 0], radius: ring, start: ringStart, sweep: ringEnd - ringStart, length: ring * Math.abs(ringEnd - ringStart) },
      { kind: 'arc', centre: [-cu, cv], radius: rho, start: Math.PI - tangentAngle, sweep: filletSweep, length: rho * Math.abs(filletSweep) },
      { kind: 'line', from: [-cu, c], to: [S.u[1], c], length: S.u[1] + cu },
    ];
    // Turned 180 degrees about the origin: points (u, v) -> (-u, -v), angles + pi.
    const south: LaneSegment[] = north.map(s => s.kind === 'line'
      ? { kind: 'line', from: [-s.from[0], -s.from[1]], to: [-s.to[0], -s.to[1]], length: s.length }
      : { kind: 'arc', centre: [-s.centre[0], -s.centre[1]], radius: s.radius, start: s.start + Math.PI, sweep: s.sweep, length: s.length });
    const length = north.reduce((sum, s) => sum + segLength(s), 0), speed = speeds[k] ?? speeds[speeds.length - 1]!;
    lanes.push({ id: `nb-${k}`, direction: 'north', index: k, speed, length, segments: north });
    lanes.push({ id: `sb-${k}`, direction: 'south', index: k, speed, length, segments: south });
  }
  return lanes;
}

export interface LanePoint { u: number; v: number; heading: number; curvature: number; segment: number }
export const newLanePoint = (): LanePoint => ({ u: 0, v: 0, heading: 0, curvature: 0, segment: 0 });
/** The point `s` metres along a lane (clamped to its ends): position, heading (atan2 measure) and signed curvature. */
export function lanePoint(lane: CampusLane, s: number, out: LanePoint = newLanePoint()): LanePoint {
  let rest = Math.max(0, Math.min(lane.length, s));
  for (let i = 0; i < lane.segments.length; i++) {
    const seg = lane.segments[i]!;
    if (rest > seg.length && i + 1 < lane.segments.length) { rest -= seg.length; continue; }
    const t = seg.length > 0 ? Math.min(1, rest / seg.length) : 0;
    out.segment = i;
    if (seg.kind === 'line') {
      out.u = seg.from[0] + (seg.to[0] - seg.from[0]) * t; out.v = seg.from[1] + (seg.to[1] - seg.from[1]) * t;
      out.heading = Math.atan2(seg.to[1] - seg.from[1], seg.to[0] - seg.from[0]); out.curvature = 0;
    } else {
      const a = seg.start + seg.sweep * t, dir = Math.sign(seg.sweep);
      out.u = seg.centre[0] + seg.radius * Math.cos(a); out.v = seg.centre[1] + seg.radius * Math.sin(a);
      // Moving with increasing angle the direction is (-sin a, cos a); with decreasing angle its opposite.
      out.heading = Math.atan2(dir * Math.cos(a), -dir * Math.sin(a)); out.curvature = dir / seg.radius;
    }
    return out;
  }
  return out;
}
const TAU = Math.PI * 2;
const positiveAngle = (a: number) => ((a % TAU) + TAU) % TAU;
export interface LaneProjection { s: number; distance: number }
/** The station of the lane point nearest (u, v) and the distance to it (the traffic sees the viewer's car with it). */
export function projectOnLane(lane: CampusLane, u: number, v: number, out: LaneProjection = { s: 0, distance: 0 }): LaneProjection {
  let start = 0, best = Infinity, bestS = 0;
  for (const seg of lane.segments) {
    let d: number, along: number;
    if (seg.kind === 'line') {
      const du = seg.to[0] - seg.from[0], dv = seg.to[1] - seg.from[1], l2 = du * du + dv * dv;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - seg.from[0]) * du + (v - seg.from[1]) * dv) / l2)) : 0;
      d = Math.hypot(u - seg.from[0] - du * t, v - seg.from[1] - dv * t); along = t * seg.length;
    } else {
      const a = Math.atan2(v - seg.centre[1], u - seg.centre[0]), sweep = Math.abs(seg.sweep);
      const phi = seg.sweep >= 0 ? positiveAngle(a - seg.start) : positiveAngle(seg.start - a);
      if (phi <= sweep) { d = Math.abs(Math.hypot(u - seg.centre[0], v - seg.centre[1]) - seg.radius); along = phi * seg.radius; }
      else {
        // Outside the arc's span: the nearer end.
        const end = seg.start + seg.sweep;
        const d0 = Math.hypot(u - seg.centre[0] - seg.radius * Math.cos(seg.start), v - seg.centre[1] - seg.radius * Math.sin(seg.start));
        const d1 = Math.hypot(u - seg.centre[0] - seg.radius * Math.cos(end), v - seg.centre[1] - seg.radius * Math.sin(end));
        if (d0 <= d1) { d = d0; along = 0; } else { d = d1; along = seg.length; }
      }
    }
    if (d < best) { best = d; bestS = start + along; }
    start += seg.length;
  }
  out.s = bestS; out.distance = best;
  return out;
}
/** The largest speed allowed at `s` by the lane's curves: sqrt(lateral x radius) on an arc, planned ahead at `decel`. */
export function laneSpeedLimit(lane: CampusLane, s: number, lateral: number, decel: number): number {
  let limit = lane.speed, start = 0;
  for (const seg of lane.segments) {
    const end = start + seg.length;
    if (seg.kind === 'arc') {
      const v = Math.min(lane.speed, Math.sqrt(lateral * seg.radius));
      if (s >= start && s <= end) limit = Math.min(limit, v);
      else if (s < start) limit = Math.min(limit, Math.sqrt(v * v + 2 * decel * (start - s)));
    }
    start = end;
  }
  return limit;
}

// ---------------------------------------------------------------- drivable area

export interface Drivable {
  rects: { u: V2; v: V2 }[];
  ring: { inner: number; outer: number };
  /** Signed distance to the drivable boundary: negative inside. */
  sdf(u: number, v: number): number;
  contains(u: number, v: number, margin?: number): boolean;
  /** The outward normal of the boundary nearest (u, v) (the sdf gradient). */
  normal(u: number, v: number): V2;
}
/** Where the car may drive: the split road to its car ends, the drop-off bays, the roundabout outside its island and
 *  kerb, and the cross-pass stubs to their ends. */
export function drivableArea(roads: CampusRoads): Drivable {
  const S = roads.split, C = roads.cross, R = roads.roundabout;
  const rects: { u: V2; v: V2 }[] = [
    { u: [-S.carEnd, S.carEnd], v: [-S.halfWidth, S.halfWidth] },
    { u: [-C.halfWidth, C.halfWidth], v: [-C.stubEnd, C.stubEnd] },
    ...roads.dropOff.map(b => ({ u: b.u, v: b.v })),
  ];
  const ring = { inner: R.island + R.kerb, outer: R.radius };
  const rectSdf = (r: { u: V2; v: V2 }, u: number, v: number) => {
    const cu = (r.u[0] + r.u[1]) / 2, cv = (r.v[0] + r.v[1]) / 2, hu = (r.u[1] - r.u[0]) / 2, hv = (r.v[1] - r.v[0]) / 2;
    const du = Math.abs(u - cu) - hu, dv = Math.abs(v - cv) - hv;
    return Math.hypot(Math.max(du, 0), Math.max(dv, 0)) + Math.min(Math.max(du, dv), 0);
  };
  const sdf = (u: number, v: number) => {
    let d = Math.hypot(u, v) - ring.outer;
    for (const r of rects) d = Math.min(d, rectSdf(r, u, v));
    // Minus the island and its kerb.
    return Math.max(d, ring.inner - Math.hypot(u, v));
  };
  return {
    rects, ring, sdf,
    contains: (u, v, margin = 0) => sdf(u, v) <= -margin,
    normal(u, v) {
      const e = 0.05, gu = sdf(u + e, v) - sdf(u - e, v), gv = sdf(u, v + e) - sdf(u, v - e), l = Math.hypot(gu, gv) || 1;
      return [gu / l, gv / l];
    },
  };
}

// ---------------------------------------------------------------- parking, satellites, lights

export function quadBezier(c: readonly V2[], t: number): V2 {
  const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
  return [a * c[0]![0] + b * c[1]![0] + d * c[2]![0], a * c[0]![1] + b * c[1]![1] + d * c[2]![1]];
}
/** The loop's kept curve as a polyline, one point per `step` metres or closer. */
export function loopPolyline(loop: ParkingLoop, step = 2): V2[] {
  const n = 400, pts: V2[] = [];
  let length = 0, prev = quadBezier(loop.curve, loop.t[0]);
  for (let k = 1; k <= n; k++) { const q = quadBezier(loop.curve, loop.t[0] + (loop.t[1] - loop.t[0]) * k / n); length += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const count = Math.max(2, Math.ceil(length / step));
  for (let k = 0; k <= count; k++) pts.push(quadBezier(loop.curve, loop.t[0] + (loop.t[1] - loop.t[0]) * k / count));
  return pts;
}
/** A small deterministic hash in [0, 1) (no Math.random: the stalls are the same on every load). */
export function hash01(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) { h ^= Math.floor(v) & 0xffffffff; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 1000003) / 1000003;
}
export interface Stall { u: number; v: number; heading: number; paint: number; loop: number; occupied: boolean }
/** Every stall along both sides of every loop, `pitch` apart, facing the aisle; `occupied` by the data's seeded share. */
export function parkingStalls(parking: CampusParking): Stall[] {
  const out: Stall[] = [];
  parking.loops.forEach((loop, li) => {
    const pts = loopPolyline(loop, 0.5), cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
    const total = cum[cum.length - 1]!, count = Math.floor(total / loop.pitch);
    let j = 0;
    for (let n = 0; n < count; n++) {
      const s = (n + 0.5) * loop.pitch + (total - count * loop.pitch) / 2;
      while (j + 1 < cum.length - 1 && cum[j + 1]! < s) j++;
      const a = pts[j]!, b = pts[j + 1]!, t = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
      const u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t, tu = b[0] - a[0], tv = b[1] - a[1], l = Math.hypot(tu, tv) || 1;
      const nu = -tv / l, nv = tu / l, off = loop.aisle / 2 + loop.depth / 2;
      for (const side of [1, -1]) {
        const su = u + side * nu * off, sv = v + side * nv * off;
        // Nose toward the aisle: the heading points from the stall to the aisle.
        const heading = Math.atan2(-side * nv, -side * nu);
        const h = hash01(parking.seed, li, n, side + 2);
        out.push({ u: su, v: sv, heading, paint: Math.floor(hash01(parking.seed + 7, li, n, side + 5) * parking.paints.length), loop: li, occupied: h < parking.occupancy });
      }
    }
  });
  return out;
}
/** Satellite blocks and roof units as boxes: centre (u, y, v) and size (along u, height, along v). */
export function satelliteBoxes(s: CampusSatellites): { body: { centre: [number, number, number]; size: [number, number, number] }[]; roof: { centre: [number, number, number]; size: [number, number, number] }[] } {
  const body = s.centres.map(c => ({ centre: [c[0], s.size[2] / 2, c[1]] as [number, number, number], size: [s.size[0], s.size[2], s.size[1]] as [number, number, number] }));
  const roof = s.centres.map(c => ({ centre: [c[0], s.size[2] + s.roofUnit[2] / 2, c[1]] as [number, number, number], size: [s.roofUnit[0], s.roofUnit[2], s.roofUnit[1]] as [number, number, number] }));
  return { body, roof };
}
/** The number of light standards and where their lamp heads are (campus frame). */
export function lampHeads(l: CampusLights): { u: number; y: number; v: number }[] {
  return l.poles.map(p => {
    const a = p.headingDeg * Math.PI / 180;
    return { u: p.at[0] + Math.cos(a) * l.pole.arm, y: l.pole.height, v: p.at[1] + Math.sin(a) * l.pole.arm };
  });
}
