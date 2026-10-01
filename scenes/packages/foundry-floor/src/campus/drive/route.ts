// SPDX-License-Identifier: MIT
// The drive check (FF-C1 item 5): Golden Gate's route contact scan (packages/golden-gate/src/play/route-contact.ts, the
// method copied, not imported) on the campus roads. The car model drives its whole route: from the split road's south
// end stop north on lane nb-1 through the roundabout to the north end stop; turned around there, south into the
// roundabout and out west along the cross pass to the west stub's end stop; turned around, east straight through the
// roundabout to the east stub's end stop; turned around, west into the roundabout and out south along the split road to
// its south end stop. An autopilot (pure pursuit on the route's paths at planned speeds) gives the car its inputs, and
// the car model does the rest (its steering limits, curb, end stops and turn-around requests). Every fixed car step
// (1/120 s) samples its four wheels against the drawn ground (../roads groundLayers, the surface on top at each point
// in the exterior's draw order). Every traffic lane is sampled the same way from end to end with the traffic's own pose
// (the lane point is the footprint centre, heading along the lane) and the longest-wheelbase vehicle, from half its
// wheelbase past the lane's entry to half a wheelbase short of its exit.
// Reported per run (Golden Gate's): the largest vertical step of the body and of each wheel's surface between
// consecutive samples, the largest pitch change between consecutive samples, the largest wheel gap to the surface and
// every wheel whose surface on top is not road; for the car also its curb contacts, the least clearance of its
// footprint to the drivable edge, its largest offset from its path and the lowest part above it. Pure (no three.js):
// scripts/drive-check.ts runs it with the vehicles' measured dimensions.
import type { CampusData, CampusLane, CampusRoads, LaneSegment, V2 } from '../data';
import { groundLayers, lanePoint, newLanePoint } from '../roads';
import type { GroundLayer } from '../roads';
import { createCar, createCarWorld, footprintCentre, inEnterZone, stepCar, turnAround, wheelLimit, wrapAngle } from './car';
import type { CarBody, CarInput, CarState, CarWorld } from './car';
import type { DrivingData, VehicleType } from './driving';

export type Arm = 'north' | 'east' | 'south' | 'west';
const ARM_ANGLE: Record<Arm, number> = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
const TAU = Math.PI * 2;
const positiveAngle = (a: number) => ((a % TAU) + TAU) % TAU;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A path through the roundabout from one arm to another in ring lane k, right-hand traffic: the entry arm's inbound
 * line at its lane k offset, a right-turn fillet onto ring lane k, counter-clockwise on the map round the ring, a
 * right-turn fillet onto the exit arm and its outbound line to the arm's end. It is ../roads buildLanes's construction
 * (a northbound lane is the path from the south arm to the north arm) turned to each arm; the cross arms end at their
 * drivable stubs' ends.
 */
export function ringPath(roads: CampusRoads, entry: Arm, exit: Arm, k: number, speed = 0): CampusLane {
  const S = roads.split, C = roads.cross, R = roads.roundabout, rho = R.fillet, ring = R.lanes.inner + R.lanes.width * (k + .5);
  const arm = (a: Arm) => a === 'north' || a === 'south' ? { lanes: S.lanes, reach: S.u[1] } : { lanes: C.lanes, reach: C.stubEnd };
  const rot = (p: V2, t: number): V2 => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
  const joint = (lanes: { firstCentre: number; width: number }) => {
    const c = lanes.firstCentre + k * lanes.width, cv = c + rho, cu = -Math.sqrt((ring + rho) ** 2 - cv ** 2);
    const tangent = Math.atan2(-cv, -cu);
    return { c, cu, cv, tangent, ringAt: Math.atan2(cv, cu), sweep: tangent + Math.PI / 2 };
  };
  const e = joint(arm(entry).lanes), x = joint(arm(exit).lanes), te = ARM_ANGLE[entry] - Math.PI, tx = ARM_ANGLE[exit];
  const reachE = arm(entry).reach, reachX = arm(exit).reach, a0 = e.ringAt + te, a1 = Math.PI - x.ringAt + tx;
  const ringSweep = -positiveAngle(a0 - a1);
  const segments: LaneSegment[] = [
    { kind: 'line', from: rot([-reachE, e.c], te), to: rot([e.cu, e.c], te), length: reachE + e.cu },
    { kind: 'arc', centre: rot([e.cu, e.cv], te), radius: rho, start: -Math.PI / 2 + te, sweep: e.sweep, length: rho * Math.abs(e.sweep) },
    { kind: 'arc', centre: [0, 0], radius: ring, start: a0, sweep: ringSweep, length: ring * Math.abs(ringSweep) },
    { kind: 'arc', centre: rot([-x.cu, x.cv], tx), radius: rho, start: Math.PI - x.tangent + tx, sweep: x.sweep, length: rho * Math.abs(x.sweep) },
    { kind: 'line', from: rot([-x.cu, x.c], tx), to: rot([reachX, x.c], tx), length: reachX + x.cu },
  ];
  return { id: `${entry}-${exit}-${k}`, direction: entry === 'south' ? 'north' : 'south', index: k, speed, length: segments.reduce((sum, s) => sum + s.length, 0), segments };
}

export interface AutopilotOptions {
  /** Cruising speed on the straights (m/s), lateral acceleration held on the curves (m/s^2) and the planned deceleration. */
  cruise: number; lateral: number; decel: number;
  /** Pure-pursuit look-ahead: base (m), per m/s of speed, and the most. */
  lookahead: [number, number, number];
}
export const AUTOPILOT: AutopilotOptions = { cruise: 24, lateral: 4, decel: 2, lookahead: [5, .45, 20] };

/** Pure pursuit on a path from the car's rear axle, with speeds planned for the path's curves. */
export class Autopilot {
  private readonly u: Float64Array; private readonly v: Float64Array; private readonly allowed: Float64Array;
  private index = 0;
  readonly offset = { value: 0, at: 0 };
  constructor(readonly path: CampusLane, private readonly o: AutopilotOptions = AUTOPILOT, private readonly step = .5) {
    const n = Math.floor(path.length / step) + 1, p = newLanePoint();
    this.u = new Float64Array(n); this.v = new Float64Array(n); this.allowed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      lanePoint(path, i * step, p); this.u[i] = p.u; this.v[i] = p.v;
      this.allowed[i] = p.curvature !== 0 ? Math.min(o.cruise, Math.sqrt(o.lateral / Math.abs(p.curvature))) : o.cruise;
    }
    for (let i = n - 2; i >= 0; i--) this.allowed[i] = Math.min(this.allowed[i]!, Math.sqrt(this.allowed[i + 1]! ** 2 + 2 * o.decel * step));
  }
  /** The path sample nearest (u, v), searched near the last one, and the distance to it. */
  private locate(u: number, v: number): { index: number; distance: number } {
    let best = Infinity, index = this.index;
    for (let i = Math.max(0, this.index - 40); i < Math.min(this.u.length, this.index + 400); i++) {
      const d = Math.hypot(this.u[i]! - u, this.v[i]! - v);
      if (d < best) { best = d; index = i; }
    }
    this.index = index;
    return { index, distance: best };
  }
  /** Places the search at the sample nearest (u, v) over the whole path (a new leg). */
  reset(u: number, v: number): void {
    let best = Infinity;
    for (let i = 0; i < this.u.length; i++) { const d = Math.hypot(this.u[i]! - u, this.v[i]! - v); if (d < best) { best = d; this.index = i; } }
  }
  control(c: CarState, body: CarBody, D: DrivingData, odometer = 0): CarInput {
    const fu = Math.cos(c.heading), fv = Math.sin(c.heading), au = c.u + body.rearAxle * fu, av = c.v + body.rearAxle * fv;
    const near = this.locate(au, av), speed = Math.abs(c.speed);
    if (near.distance > this.offset.value) { this.offset.value = near.distance; this.offset.at = odometer; }
    const ahead = clamp(this.o.lookahead[0] + this.o.lookahead[1] * speed, this.o.lookahead[0], this.o.lookahead[2]);
    const last = this.u.length - 1, j = Math.min(last, near.index + Math.round(ahead / this.step));
    let tu = this.u[j]!, tv = this.v[j]!;
    // Past the path's end the target runs on along its last direction.
    const beyond = ahead - (j - near.index) * this.step;
    if (j === last && beyond > 0) {
      const du = this.u[last]! - this.u[last - 1]!, dv = this.v[last]! - this.v[last - 1]!, l = Math.hypot(du, dv) || 1;
      tu += du / l * beyond; tv += dv / l * beyond;
    }
    const du = tu - au, dv = tv - av, distance = Math.max(1e-6, Math.hypot(du, dv)), rel = wrapAngle(Math.atan2(dv, du) - c.heading);
    // Curvature toward the target (positive: the heading angle grows, a right turn); the car's wheel is positive to the left.
    const kappa = 2 * Math.sin(rel) / distance;
    const steer = clamp(Math.atan(kappa * body.wheelbase) / wheelLimit(D, body.wheelbase, c.speed), -1, 1);
    const target = this.allowed[near.index]!;
    const throttle = speed < target - .3 ? clamp((target - speed) / 2, .2, 1) : 0, brake = speed > target + .3 ? clamp((speed - target) / 2, 0, 1) : 0;
    return { throttle, reverse: 0, steer, brake, handbrake: false };
  }
}

// ---------------------------------------------------------------- the drawn ground

/** Surfaces a wheel may stand on (the split road, the cross pass, the roundabout and its apron, the drop-off bays, and the markings on them). */
export const ROAD_TAGS: ReadonlySet<string> = new Set(['split', 'split-dissolve', 'cross', 'cross-dissolve', 'roundabout', 'apron', 'bay', 'markings']);

/** The ground's triangles in draw order, bucketed on a square grid in (u, v): the last drawn under a point is the surface seen there. */
export class GroundSurfaces {
  private readonly cells = new Map<number, number[]>();
  private readonly tri: number[] = [];
  private readonly tags: string[] = [];
  private readonly grade: { radius: number; y: number };
  constructor(layers: readonly GroundLayer[], gradeRadius: number, private readonly cell = 8) {
    let gradeY = 0;
    for (const layer of [...layers].sort((a, b) => a.order - b.order)) {
      const m = layer.mesh, P = m.positions, I = m.indices;
      for (const span of m.spans) {
        for (let t = span.from; t < span.to; t++) {
          const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
          // The grade plane lies under everything out to its radius: it is the answer where nothing else is drawn.
          if (span.tag === 'grade') { gradeY = P[a + 1]!; continue; }
          const k = this.tags.length;
          this.tri.push(P[a]!, P[a + 1]!, P[a + 2]!, P[b]!, P[b + 1]!, P[b + 2]!, P[c]!, P[c + 1]!, P[c + 2]!); this.tags.push(span.tag);
          const u0 = Math.floor(Math.min(P[a]!, P[b]!, P[c]!) / cell), u1 = Math.floor(Math.max(P[a]!, P[b]!, P[c]!) / cell);
          const v0 = Math.floor(Math.min(P[a + 2]!, P[b + 2]!, P[c + 2]!) / cell), v1 = Math.floor(Math.max(P[a + 2]!, P[b + 2]!, P[c + 2]!) / cell);
          for (let i = u0; i <= u1; i++) for (let j = v0; j <= v1; j++) {
            const key = this.key(i, j), list = this.cells.get(key);
            if (list) list.push(k); else this.cells.set(key, [k]);
          }
        }
      }
    }
    this.grade = { radius: gradeRadius, y: gradeY };
  }
  get triangles(): number { return this.tags.length; }
  private key(i: number, j: number): number { return (i + 32768) * 65536 + (j + 32768); }
  /** The surface on top at (u, v): its tag and height, or null outside the grade plane. */
  top(u: number, v: number): { tag: string; y: number } | null {
    const list = this.cells.get(this.key(Math.floor(u / this.cell), Math.floor(v / this.cell)));
    let best = -1, y = 0;
    if (list) for (const t of list) {
      if (t <= best) continue;
      const p = t * 9, T = this.tri;
      const au = T[p]!, ay = T[p + 1]!, av = T[p + 2]!, bu = T[p + 3]!, by = T[p + 4]!, bv = T[p + 5]!, cu = T[p + 6]!, cy = T[p + 7]!, cv = T[p + 8]!;
      const det = (bv - cv) * (au - cu) + (cu - bu) * (av - cv); if (Math.abs(det) < 1e-12) continue;
      const w1 = ((bv - cv) * (u - cu) + (cu - bu) * (v - cv)) / det, w2 = ((cv - av) * (u - cu) + (au - cu) * (v - cv)) / det, w3 = 1 - w1 - w2;
      if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
      best = t; y = w1 * ay + w2 * by + w3 * cy;
    }
    if (best >= 0) return { tag: this.tags[best]!, y };
    return Math.hypot(u, v) <= this.grade.radius ? { tag: 'grade', y: this.grade.y } : null;
  }
}

/** Wheel contact points (campus u, y, v) of a vehicle whose model origin stands at (u, v) at grade, heading and nose-up pitch. */
function wheelContacts(body: CarBody, u: number, v: number, y0: number, heading: number, pitch: number): [number, number, number][] {
  const fu = Math.cos(heading), fv = Math.sin(heading), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return body.wheels.map(w => {
    const lx = w.offset[0], ly = w.offset[1] - body.wheelRadius, lz = w.offset[2];
    const px = lx * cp - ly * sp, py = lx * sp + ly * cp;
    return [u + px * fu - lz * fv, y0 + py, v + px * fv + lz * fu];
  });
}

export interface ContactLimits { step: number; pitchDeg: number; gap: number }
/** Golden Gate's limits. */
export const CONTACT_LIMITS: ContactLimits = { step: .03, pitchDeg: 1, gap: .05 };

interface Sample { at: number; y: number; pitch: number; wheels: [number, number, number][] }
/** Running maxima over one sequence of samples (consecutive samples are compared); Golden Gate's tally. */
class Tally {
  samples = 0; missing = 0;
  bodyStep = { value: 0, at: 0 }; surfaceStep = { value: 0, at: 0, wheel: '', surfaces: '' }; pitchStep = { deg: 0, at: 0 }; gap = { value: 0, at: 0, wheel: '', surface: '' };
  firstMissing: { at: number; wheel: string; surface: string; u: number; v: number }[] = [];
  surfaces: Record<string, number> = {};
  range: [number, number] = [Infinity, -Infinity];
  private previous: { y: number; pitch: number; surface: ({ y: number; tag: string } | null)[] } | null = null;
  constructor(private readonly ground: GroundSurfaces, private readonly body: CarBody) {}
  break(): void { this.previous = null; }
  add(s: Sample): void {
    this.samples++; this.range[0] = Math.min(this.range[0], s.at); this.range[1] = Math.max(this.range[1], s.at);
    const surface = s.wheels.map(([u, y, v], k) => {
      const hit = this.ground.top(u, v), wheel = this.body.wheels[k]!.name;
      if (hit) this.surfaces[hit.tag] = (this.surfaces[hit.tag] ?? 0) + 1;
      if (!hit || !ROAD_TAGS.has(hit.tag)) {
        this.missing++;
        if (this.firstMissing.length < 8) this.firstMissing.push({ at: +s.at.toFixed(2), wheel, surface: hit?.tag ?? 'none', u: +u.toFixed(2), v: +v.toFixed(2) });
        return null;
      }
      const gap = Math.abs(y - hit.y);
      if (gap > this.gap.value) this.gap = { value: gap, at: s.at, wheel, surface: hit.tag };
      return hit;
    });
    const p = this.previous;
    if (p) {
      const body = Math.abs(s.y - p.y); if (body > this.bodyStep.value) this.bodyStep = { value: body, at: s.at };
      const pitch = Math.abs(s.pitch - p.pitch) * 180 / Math.PI; if (pitch > this.pitchStep.deg) this.pitchStep = { deg: pitch, at: s.at };
      surface.forEach((hit, k) => {
        const before = p.surface[k]; if (!hit || !before) return;
        const step = Math.abs(hit.y - before.y);
        if (step > this.surfaceStep.value) this.surfaceStep = { value: step, at: s.at, wheel: this.body.wheels[k]!.name, surfaces: `${before.tag} > ${hit.tag}` };
      });
    }
    this.previous = { y: s.y, pitch: s.pitch, surface };
  }
  report(limits: ContactLimits) {
    const r = (v: number, d = 4) => +v.toFixed(d);
    const ok = this.samples > 0 && this.missing === 0 && this.bodyStep.value <= limits.step && this.surfaceStep.value <= limits.step && this.pitchStep.deg <= limits.pitchDeg && this.gap.value <= limits.gap;
    return {
      ok, samples: this.samples, missing: this.missing, firstMissing: this.firstMissing, range: [r(this.range[0], 2), r(this.range[1], 2)],
      bodyStep: { m: r(this.bodyStep.value), at: r(this.bodyStep.at, 2) },
      surfaceStep: { m: r(this.surfaceStep.value), at: r(this.surfaceStep.at, 2), wheel: this.surfaceStep.wheel, surfaces: this.surfaceStep.surfaces },
      pitchStep: { deg: r(this.pitchStep.deg), at: r(this.pitchStep.at, 2) },
      gap: { m: r(this.gap.value), at: r(this.gap.at, 2), wheel: this.gap.wheel, surface: this.gap.surface },
      surfaces: this.surfaces,
    };
  }
}

/** The route's legs: the arms each path runs between and where it ends. */
export const ROUTE: { from: string; to: string; entry: Arm; exit: Arm }[] = [
  { from: 'split road south end stop', to: 'split road north end stop', entry: 'south', exit: 'north' },
  { from: 'split road north end stop', to: 'cross pass west stub end stop', entry: 'north', exit: 'west' },
  { from: 'cross pass west stub end stop', to: 'cross pass east stub end stop', entry: 'west', exit: 'east' },
  { from: 'cross pass east stub end stop', to: 'split road south end stop', entry: 'east', exit: 'south' },
];

export interface DriveCheckOptions {
  /** Lanes the car's route is driven in (lane offsets on every arm and ring lanes: the start lane and the outer lane by default). */
  lanes?: number[];
  /** Lane-sampling step (m), the limits and the autopilot. */
  laneStep?: number; limits?: ContactLimits; autopilot?: AutopilotOptions;
  /** Longest simulated time per leg (s). */
  maxLegSeconds?: number;
}

interface CheckContext { campus: CampusData; D: DrivingData; body: CarBody; ground: GroundSurfaces; world: CarWorld; limits: ContactLimits; autopilot: AutopilotOptions; maxSteps: number }
const r = (v: number, d = 3) => +v.toFixed(d);

/** The car's whole route in lane k, from the south end stop at rest (see the header). */
function driveRoute(x: CheckContext, k: number) {
  const { campus, D, body, ground, world } = x, y0 = campus.roads.gradeY, drivable = world.drivable;
  const overheadSolids = campus.solids.filter(s => s.min[1] > .5);
  // The footprint's back 0.5 m inside the south end's stop line, heading north in lane k.
  const lanes = campus.roads.split.lanes, c0 = lanes.firstCentre + k * lanes.width, stop = campus.roads.split.carEnd - D.roadEnd.stopDistance;
  const car: CarState = createCar(-stop + body.length / 2 + .5 - body.centre[0], c0 - body.centre[1], 0, 0);
  const steps = new Tally(ground, body), legs: { from: string; to: string; path: string; seconds: number; metres: number; turned: boolean; topSpeed: number; offset: number }[] = [];
  let odometer = 0, curbSteps = 0, endStops = 0, clearance = { m: Infinity, at: 0 }, overhead = { m: Infinity, at: 0, part: '' };
  const enterZone = { atStart: inEnterZone(world, car, body), atFinish: false };
  const pts: number[] = new Array(12).fill(0);
  const sample = (c: CarState) => steps.add({ at: odometer, y: y0, pitch: c.bump, wheels: wheelContacts(body, c.u, c.v, y0, c.heading, c.bump) });
  for (const leg of ROUTE) {
    const path = ringPath(campus.roads, leg.entry, leg.exit, k), pilot = new Autopilot(path, x.autopilot);
    pilot.reset(car.u, car.v);
    let n = 0, metres = 0, top = 0;
    steps.break(); sample(car);
    while (!car.turnRequested && n < x.maxSteps) {
      const input = pilot.control(car, body, D, odometer), u = car.u, v = car.v;
      stepCar(car, input, body, world, []); n++;
      const moved = Math.hypot(car.u - u, car.v - v); odometer += moved; metres += moved; top = Math.max(top, Math.abs(car.speed));
      if (car.contact === 'curb') curbSteps++;
      if (car.contact === 'end') endStops++;
      // The footprint's clearance to the drivable edge (corners and long-side middles).
      const fu = Math.cos(car.heading), fv = Math.sin(car.heading), [cu, cv] = footprintCentre(car, body), hl = body.length / 2, hw = body.width / 2;
      let q = 0;
      for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [0, 1], [0, -1]] as const) { pts[q++] = cu + a * hl * fu - b * hw * fv; pts[q++] = cv + a * hl * fv + b * hw * fu; }
      for (let p = 0; p < 6; p++) { const d = -drivable.sdf(pts[p * 2]!, pts[p * 2 + 1]!); if (d < clearance.m) clearance = { m: d, at: odometer }; }
      // The lowest part above the footprint (parts standing from grade near the road are the campus road-envelope check's).
      const umin = Math.min(pts[0]!, pts[2]!, pts[4]!, pts[6]!), umax = Math.max(pts[0]!, pts[2]!, pts[4]!, pts[6]!), vmin = Math.min(pts[1]!, pts[3]!, pts[5]!, pts[7]!), vmax = Math.max(pts[1]!, pts[3]!, pts[5]!, pts[7]!);
      for (const s of overheadSolids) if (s.min[0] <= umax && s.max[0] >= umin && s.min[2] <= vmax && s.max[2] >= vmin && s.min[1] < overhead.m) overhead = { m: s.min[1], at: odometer, part: `${s.placement} ${s.part}` };
      sample(car);
    }
    legs.push({ from: leg.from, to: leg.to, path: path.id, seconds: r(n / 120, 2), metres: r(metres, 1), turned: car.turnRequested, topSpeed: r(top, 2), offset: r(pilot.offset.value) });
    if (!car.turnRequested) break;
    car.turnRequested = false;
    if (leg === ROUTE[ROUTE.length - 1]) { enterZone.atFinish = inEnterZone(world, car, body); break; }
    turnAround(car, body, world, []);
  }
  const completed = legs.length === ROUTE.length && legs.every(l => l.turned), report = steps.report(x.limits);
  const ok = report.ok && completed && curbSteps === 0 && clearance.m >= D.curb.clearance - 1e-6 && enterZone.atStart && enterZone.atFinish && overhead.m > body.height;
  return { ok, lane: k, completed, legs, metres: r(odometer, 1), curbSteps, endStopSteps: endStops, clearance: { m: r(clearance.m), at: r(clearance.at, 1) },
    overhead: { m: r(overhead.m), at: r(overhead.at, 1), part: overhead.part }, enterZone, steps: report };
}

/**
 * Drives the car over its whole route and samples every traffic lane (see the header). `bodies` are the measured
 * dimensions of every vehicle (the driven one is driving.vehicle; the lanes are sampled with the longest wheelbase).
 */
export function checkDrive(campus: CampusData, D: DrivingData, bodies: Readonly<Record<VehicleType, CarBody>>, o: DriveCheckOptions = {}) {
  const limits = o.limits ?? CONTACT_LIMITS, laneStep = o.laneStep ?? .25, body = bodies[D.vehicle];
  const ground = new GroundSurfaces(groundLayers(campus.roads, campus.parking), campus.roads.gradeRadius), y0 = campus.roads.gradeY;
  const x: CheckContext = { campus, D, body, ground, world: createCarWorld(campus, D), limits, autopilot: o.autopilot ?? AUTOPILOT, maxSteps: Math.round((o.maxLegSeconds ?? 900) * 120) };
  const startLane = campus.lanes.find(l => l.id === D.start.lane)?.index ?? 1, outer = campus.roads.split.lanes.perDirection - 1;
  const cars = (o.lanes ?? [...new Set([startLane, outer])]).map(k => driveRoute(x, k));

  // Traffic: each lane from its entry to its exit with the lane pose and the longest vehicle's wheels, less the
  // distance from the footprint centre (the lane point) to the farther axle at each end: there the vehicle has faded
  // out in the dissolve stretch and that axle would stand past the drawn road's end (Golden Gate's rule).
  const longest = (Object.entries(bodies) as [VehicleType, CarBody][]).sort((a, b) => b[1].wheelbase - a[1].wheelbase)[0]!, lb = longest[1];
  const margin = Math.max(...lb.wheels.map(w => Math.abs(w.offset[0] - lb.centre[0])));
  const lanes = new Tally(ground, lb), point = newLanePoint();
  for (const lane of campus.lanes) {
    lanes.break();
    for (let s = margin; s <= lane.length - margin + 1e-9; s += laneStep) {
      const p = lanePoint(lane, Math.min(s, lane.length - margin), point), fu = Math.cos(p.heading), fv = Math.sin(p.heading), [bx, bz] = lb.centre;
      lanes.add({ at: s, y: y0, pitch: 0, wheels: wheelContacts(lb, p.u - bx * fu + bz * fv, p.v - bx * fv - bz * fu, y0, p.heading, 0) });
    }
  }
  const laneReport = lanes.report(limits);
  return {
    ok: cars.every(c => c.ok) && laneReport.ok, limits, surfaceTriangles: ground.triangles, roadTags: [...ROAD_TAGS],
    car: { model: D.vehicle, body: { length: r(body.length), width: r(body.width), height: r(body.height), wheelbase: r(body.wheelbase), wheelRadius: r(body.wheelRadius) }, routes: cars },
    traffic: { ok: laneReport.ok, model: longest[0], wheelbase: r(lb.wheelbase), lanes: campus.lanes.length, laneStep, endMargin: r(margin), steps: laneReport },
  };
}
