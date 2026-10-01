// SPDX-License-Identifier: MIT
// The viewer's sedan on the campus roads (FF-C1 item 5): Golden Gate's arcade driving model (packages/golden-gate/
// src/play/car.ts: the same longitudinal model, reverse after a hold at rest, planned braking for traffic and the end
// stops, curb bumps, road-end turn-around by a held throttle or pull-back) on the campus's two-dimensional roads, pure
// and deterministic (no three.js), stepped at fixed 1/120 s sub-steps. Parameters are data (data/driving.json, D-21).
//
// Frame: the campus frame (u north, v east; a heading is atan2(dv, du), 0 north, pi/2 east; right-hand traffic). The
// state is the driven model's origin and heading; the model's +X is forward and +Z its right side, so a model point
// (x, z) stands at origin + x forward + z right, with forward (cos h, sin h) and right (-sin h, cos h). Golden Gate's
// car keeps within a heading offset of its lane; this one turns through a roundabout, so it steers a kinematic bicycle
// about its rear axle, the front wheel held so the lateral acceleration stays within steer.lateralAccel. It drives
// the drivable area (../roads drivableArea): the split road to its car ends, the drop-off bays, the ring outside the
// island and kerb, and the cross-pass stubs. Its road ends are the split road's car ends and the stubs' ends.
import type { CampusData, CampusLane, V2 } from '../data';
import { drivableArea, lanePoint, newLanePoint } from '../roads';
import type { Drivable } from '../roads';
import type { DrivingData } from './driving';

export const CAR_STEP = 1 / 120;
/** Share of the service brake the car plans with when it slows for traffic or an end stop (Golden Gate's). */
const PLANNED_BRAKE = .8;
/** Time constant (s) of the heading relaxing along an edge the car is held against (Golden Gate's). */
const EDGE_RELAX = .15;
/** Deceleration (m/s^2) the car assumes traffic behind can comfortably use when it chooses a free spot (Golden Gate's). */
const SPOT_DECEL = 4;
/** A car faces a road end when its heading is within about 75 degrees of the road's direction toward it. */
const FACING = .25;
const RAD = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU);

/** The driven model's measured dimensions in its own frame (+X forward, +Z right; ../exterior/vehicles or the drive check). */
export interface CarBody {
  length: number; width: number; height: number; wheelRadius: number; wheelbase: number;
  /** X of the rear axle, and the footprint's centre (x, z) in the model frame. */
  rearAxle: number; centre: V2;
  wheels: { name: string; offset: [number, number, number]; front: boolean }[];
}
/** Controls, each 0..1 except `steer` (-1 left .. +1 right). `reverse` brakes while rolling forward, then reverses. */
export interface CarInput { throttle: number; reverse: number; steer: number; brake: number; handbrake: boolean; boost?: boolean }
/** A traffic vehicle's footprint as the car sees it: centre, heading, half extents and speed along its heading. */
export interface TrafficBox { u: number; v: number; heading: number; halfLength: number; halfWidth: number; speed: number }
export type CarContact = 'curb' | 'traffic' | 'end' | null;
export type RoadEndId = 'split-south' | 'split-north' | 'cross-west' | 'cross-east';
/** A road end: along `axis` (0 = u, 1 = v) at sign x at; it governs the road within |other axis| <= halfWidth beyond |axis| >= from. */
export interface RoadEnd { id: RoadEndId; axis: 0 | 1; sign: 1 | -1; at: number; halfWidth: number; from: number }
export interface CarState {
  /** The model origin (campus frame) and heading. */
  u: number; v: number; heading: number;
  /** Signed speed along the heading (m/s); negative when reversing. */
  speed: number;
  /** Front wheel angle (rad, positive to the left) and wheel roll angle (rad, growing when driving forward). */
  wheel: number; spin: number;
  /** Brake lamp level 0..1. */
  brakeLight: number;
  /** Time held at rest with reverse pressed (s); reverse engages after reverse.afterStopSeconds. */
  held: number;
  curbCooldown: number;
  /** Curb bump pitch kick (rad), decaying. */
  bump: number;
  /** Time held against an end stop with the throttle, or at rest near a road end with reverse (s). */
  endHold: number;
  /** The road end the car faces within roadEnd.promptDistance (the turn-around prompt), else null, and its distance (m). */
  end: RoadEndId | null; toEnd: number;
  /** Set when the throttle has been held at an end stop, or reverse at rest near a road end; the caller clears it when it turns the car. */
  turnRequested: boolean;
  /** What limited the car in the last step (tests and HUD). */
  contact: CarContact;
}

/** The car's roads: the drivable area, the road ends, the lanes (the start and free spots) and the enter zone. */
export interface CarWorld {
  D: DrivingData; drivable: Drivable; ends: RoadEnd[]; lanes: CampusLane[];
  enterZone: CampusData['interior']['enterZone'];
}
export function createCarWorld(campus: Pick<CampusData, 'roads' | 'lanes' | 'interior'>, D: DrivingData): CarWorld {
  const S = campus.roads.split, C = campus.roads.cross, R = campus.roads.roundabout;
  const bays = Math.max(S.halfWidth, ...campus.roads.dropOff.map(b => Math.max(Math.abs(b.v[0]), Math.abs(b.v[1]))));
  const ends: RoadEnd[] = [
    { id: 'split-south', axis: 0, sign: -1, at: S.carEnd, halfWidth: bays, from: R.radius },
    { id: 'split-north', axis: 0, sign: 1, at: S.carEnd, halfWidth: bays, from: R.radius },
    { id: 'cross-west', axis: 1, sign: -1, at: C.stubEnd, halfWidth: C.halfWidth, from: R.radius },
    { id: 'cross-east', axis: 1, sign: 1, at: C.stubEnd, halfWidth: C.halfWidth, from: R.radius },
  ];
  if (!ends.every(e => e.at - D.roadEnd.stopDistance > e.from + 20)) throw new Error('driving data: roadEnd.stopDistance leaves no road before an end stop');
  return { D, drivable: drivableArea(campus.roads), ends, lanes: campus.lanes, enterZone: campus.interior.enterZone };
}

/** The footprint's centre (campus frame) of a car pose. */
export function footprintCentre(s: Pick<CarState, 'u' | 'v' | 'heading'>, body: CarBody, out: [number, number] = [0, 0]): [number, number] {
  const fu = Math.cos(s.heading), fv = Math.sin(s.heading);
  out[0] = s.u + body.centre[0] * fu - body.centre[1] * fv; out[1] = s.v + body.centre[0] * fv + body.centre[1] * fu;
  return out;
}
/** The footprint's corners and the middles of its long sides (campus frame), for the curb and the end stops. */
function footprintPoints(u: number, v: number, heading: number, body: CarBody, out: number[]): number[] {
  const fu = Math.cos(heading), fv = Math.sin(heading), hl = body.length / 2, hw = body.width / 2;
  const cu = u + body.centre[0] * fu - body.centre[1] * fv, cv = v + body.centre[0] * fv + body.centre[1] * fu;
  let k = 0;
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [0, 1], [0, -1]] as const) {
    out[k++] = cu + a * hl * fu - b * hw * fv; out[k++] = cv + a * hl * fv + b * hw * fu;
  }
  return out;
}

/** Relative speed the car may keep toward something `room` metres away: `gain` per metre near, the planned brake far out. */
function approach(D: DrivingData, room: number, gain: number): number {
  const d = Math.max(0, room);
  return Math.min(gain * d, Math.sqrt(2 * PLANNED_BRAKE * D.brake * d));
}

export interface EndNear {
  end: RoadEnd;
  /** Cosine between the heading and the road's direction toward the end (positive: facing it). */
  facing: number;
  /** Distance from the footprint's centre to the road end, and from the footprint's leading extent to the end stop (m). */
  toEnd: number; room: number;
}
const scratch: number[] = new Array(12).fill(0);
/** The road end whose road the car is on (the split road beyond the ring, or a cross stub), if any. */
export function endNear(world: CarWorld, s: Pick<CarState, 'u' | 'v' | 'heading'>, body: CarBody): EndNear | null {
  const [cu, cv] = footprintCentre(s, body);
  for (const end of world.ends) {
    const along = end.axis === 0 ? cu : cv, across = end.axis === 0 ? cv : cu;
    if (Math.abs(across) > end.halfWidth || end.sign * along < end.from) continue;
    footprintPoints(s.u, s.v, s.heading, body, scratch);
    let lead = -Infinity;
    for (let k = 0; k < 6; k++) lead = Math.max(lead, end.sign * scratch[k * 2 + end.axis]!);
    const facing = end.sign * (end.axis === 0 ? Math.cos(s.heading) : Math.sin(s.heading));
    return { end, facing, toEnd: end.at - end.sign * along, room: end.at - world.D.roadEnd.stopDistance - lead };
  }
  return null;
}

export function createCar(u: number, v: number, heading: number, speed: number): CarState {
  return { u, v, heading: wrapAngle(heading), speed, wheel: 0, spin: 0, brakeLight: 0, held: 0, curbCooldown: 0, bump: 0, endHold: 0,
    end: null, toEnd: Infinity, turnRequested: false, contact: null };
}

/** Overlap of the car's footprint (grown by the traffic margins) with a traffic box: the push-out (campus frame), or null. */
function separation(cu: number, cv: number, heading: number, hl: number, hw: number, b: TrafficBox, out: [number, number]): [number, number] | null {
  const axes: [number, number][] = [[Math.cos(heading), Math.sin(heading)], [-Math.sin(heading), Math.cos(heading)], [Math.cos(b.heading), Math.sin(b.heading)], [-Math.sin(b.heading), Math.cos(b.heading)]];
  const du = b.u - cu, dv = b.v - cv;
  let least = Infinity, lu = 0, lv = 0;
  for (const [au, av] of axes) {
    const ra = hl * Math.abs(au * axes[0]![0] + av * axes[0]![1]) + hw * Math.abs(au * axes[1]![0] + av * axes[1]![1]);
    const rb = b.halfLength * Math.abs(au * axes[2]![0] + av * axes[2]![1]) + b.halfWidth * Math.abs(au * axes[3]![0] + av * axes[3]![1]);
    const d = du * au + dv * av, overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < least) { least = overlap; const sign = d > 0 ? -1 : 1; lu = au * sign; lv = av * sign; }
  }
  out[0] = lu * least; out[1] = lv * least;
  return out;
}

/** The front wheel's angle limit (rad) at a speed: Golden Gate's wheel angles narrowing with speed, and the angle at which the lateral acceleration reaches steer.lateralAccel. */
export function wheelLimit(D: DrivingData, wheelbase: number, speed: number): number {
  const v = Math.abs(speed), f = Math.min(1, v / D.topSpeed);
  const grip = v > .5 ? Math.atan(wheelbase * D.steer.lateralAccel / (v * v)) : Infinity;
  return Math.min(lerp(D.steer.wheelDeg[0], D.steer.wheelDeg[1], f) * RAD, grip);
}

/** One fixed step. `boxes` are the traffic vehicles near the car. */
export function stepCar(s: CarState, input: CarInput, body: CarBody, world: CarWorld, boxes: readonly TrafficBox[], h = CAR_STEP): void {
  const D = world.D;
  const throttle = clamp(input.throttle, 0, 1), reverse = clamp(input.reverse, 0, 1), steer = clamp(input.steer, -1, 1), brakeIn = clamp(input.brake, 0, 1);
  const boosted=!!input.boost&&throttle>0&&reverse===0&&brakeIn===0&&!input.handbrake;
  const topSpeed=D.topSpeed*(boosted?(D.boost?.topSpeedMultiplier??1):1),accel=D.accel*(boosted?(D.boost?.accelMultiplier??1):1);
  s.contact = null;
  let v = s.speed, braking = false;
  const near = endNear(world, s, body), ahead = near && near.facing >= FACING ? near : null;
  // Longitudinal (Golden Gate's): throttle with a quadratic approach to top speed, coasting drag off the throttle,
  // service brake, handbrake, and reverse after a short hold at rest.
  const coast = (speed: number) => D.coast.constant + D.coast.quadratic * speed * speed;
  if (v > 0) {
    const drive = throttle > 0 ? accel * throttle * (1 - (v / topSpeed) ** 2) : -coast(v);
    const stop = Math.max(D.brake * brakeIn, D.brake * reverse, input.handbrake ? D.handbrake : 0);
    braking = stop > 0; v = Math.max(0, v + (drive - stop) * h); s.held = 0;
  } else if (v < 0) {
    const drive = reverse > 0 ? (-v < D.reverse.maxSpeed ? -D.reverse.accel * reverse : 0) : coast(v);
    const stop = Math.max(D.brake * brakeIn, D.brake * throttle, input.handbrake ? D.handbrake : 0);
    braking = stop > 0; v = Math.min(0, v + (drive + stop) * h); s.held = 0;
  } else {
    const free = brakeIn === 0 && !input.handbrake;
    // Facing a road end nearby, reverse held at rest turns the car around (below) rather than reversing (D-22).
    const endTurn = !!ahead && ahead.toEnd <= D.roadEnd.promptDistance;
    if (throttle > 0 && free) { v = accel * throttle * h; s.held = 0; }
    else if (reverse > 0 && free && !endTurn) {
      s.held += h; braking = s.held < D.reverse.afterStopSeconds;
      if (!braking) v = -D.reverse.accel * reverse * h;
    } else { s.held = 0; braking = !free || reverse > 0; }
  }
  // Steering: the front wheel follows the input at its rate toward a limit that narrows with speed (Golden Gate's
  // wheel angles) and with the lateral acceleration cap, and returns to straight when released.
  const limit = wheelLimit(D, body.wheelbase, v), rate = D.steer.rateDegPerSecond * RAD * h;
  s.wheel += clamp(-steer * limit - s.wheel, -rate, rate);
  s.wheel = clamp(s.wheel, -limit, limit);

  // Traffic in the car's path: never close faster than it can stop behind the one ahead (planned brake far out,
  // followGain near) so it settles minGap behind it; the same behind when reversing. Slowing for traffic or an end
  // stop overrides the throttle with the service brake.
  const fu = Math.cos(s.heading), fv = Math.sin(s.heading), ru = -fv, rv = fu, hl = body.length / 2, hw = body.width / 2;
  const [cu, cv] = footprintCentre(s, body);
  const slowed = (allowed: number) => Math.max(allowed, Math.min(v, s.speed - D.brake * h));
  const backed = (allowed: number) => -Math.max(allowed, Math.min(-v, -s.speed - D.brake * h));
  for (const b of boxes) {
    const du = b.u - cu, dv = b.v - cv, along = du * fu + dv * fv, across = du * ru + dv * rv;
    const rel = b.heading - s.heading, c = Math.abs(Math.cos(rel)), n = Math.abs(Math.sin(rel));
    if (Math.abs(across) >= hw + b.halfLength * n + b.halfWidth * c + D.traffic.lateralMargin) continue;
    const gap = Math.abs(along) - hl - (b.halfLength * c + b.halfWidth * n), carried = b.speed * Math.cos(rel);
    if (along > 0 && v > 0) {
      const allowed = Math.max(0, carried + approach(D, gap - D.traffic.minGap, D.traffic.followGain));
      if (v > allowed) { v = slowed(allowed); s.contact = 'traffic'; }
    } else if (along < 0 && v < 0) {
      const allowed = approach(D, gap - D.traffic.minGap, D.traffic.followGain);
      if (-v > allowed) { v = backed(allowed); s.contact = 'traffic'; }
    }
  }
  // The end stops: slow to rest stopDistance before a road end, whether driving or reversing toward it.
  if (near && Math.abs(near.facing) > .05 && v * near.facing > 0) {
    const allowed = approach(D, near.room, Infinity) / Math.abs(near.facing);
    if (v > 0 && v > allowed) { v = slowed(allowed); s.contact = 'end'; }
    else if (v < 0 && -v > allowed) v = backed(allowed);
  }
  // Brake lamps: the brake inputs, or slowing harder than engine braking (the traffic's rule).
  if ((Math.abs(s.speed) - Math.abs(v)) / h > D.flow.brakeLights.decel) braking = true;

  // Move: the rear axle runs along the heading, which turns by v tan(wheel) / wheelbase (left is positive wheel, a
  // falling heading angle).
  const turn = -v * Math.tan(s.wheel) / body.wheelbase * h, mid = s.heading + turn / 2, heading = s.heading + turn;
  const au = s.u + body.rearAxle * fu + v * Math.cos(mid) * h, av = s.v + body.rearAxle * fv + v * Math.sin(mid) * h;
  let u = au - body.rearAxle * Math.cos(heading), w = av - body.rearAxle * Math.sin(heading), yaw = heading;

  // The curb: hold the footprint curb.clearance inside the drivable area; bump, and relax the heading along the edge.
  let hitU = 0, hitV = 0, hit = false;
  for (let iteration = 0; iteration < 3; iteration++) {
    footprintPoints(u, w, yaw, body, scratch);
    let worst = 0, wu = 0, wv = 0;
    for (let k = 0; k < 6; k++) {
      const pu = scratch[k * 2]!, pv = scratch[k * 2 + 1]!, depth = world.drivable.sdf(pu, pv) + D.curb.clearance;
      if (depth > worst) { worst = depth; wu = pu; wv = pv; }
    }
    if (worst <= 1e-6) break;
    const [nu, nv] = world.drivable.normal(wu, wv);
    u -= nu * worst; w -= nv * worst; hitU += nu; hitV += nv; hit = true;
  }
  if (hit) {
    s.contact = 'curb';
    if (s.curbCooldown <= 0 && Math.abs(v) > .5) { v *= D.curb.speedKept; s.curbCooldown = D.curb.cooldown; s.bump = D.curb.bumpDeg * RAD; }
    const l = Math.hypot(hitU, hitV) || 1, nu = hitU / l, nv = hitV / l, mu = Math.sign(v) * Math.cos(yaw), mv = Math.sign(v) * Math.sin(yaw);
    if (mu * nu + mv * nv > 0) {
      let tu = -nv, tv = nu;
      if (tu * Math.cos(yaw) + tv * Math.sin(yaw) < 0) { tu = -tu; tv = -tv; }
      yaw += wrapAngle(Math.atan2(tv, tu) - yaw) * (1 - Math.exp(-h / EDGE_RELAX));
    }
  }
  // Never inside the margins of a traffic vehicle where it will be at the end of the step: push out, and keep no
  // speed toward it.
  const push: [number, number] = [0, 0], centre: [number, number] = [0, 0];
  for (const b of boxes) {
    footprintCentre({ u, v: w, heading: yaw }, body, centre);
    const moved: TrafficBox = { ...b, u: b.u + Math.cos(b.heading) * b.speed * h, v: b.v + Math.sin(b.heading) * b.speed * h };
    if (!separation(centre[0], centre[1], yaw, hl + D.traffic.minGap / 2, hw + D.traffic.lateralMargin, moved, push)) continue;
    u += push[0]; w += push[1]; s.contact = 'traffic';
    const toward = (moved.u - centre[0]) * Math.cos(yaw) + (moved.v - centre[1]) * Math.sin(yaw);
    if (toward > 0 && v > 0) v = Math.min(v, Math.max(0, b.speed * Math.cos(b.heading - yaw)));
    else if (toward < 0 && v < 0) v = 0;
  }
  // The end stops hold: no footprint point beyond the stop line.
  const after = endNear(world, { u, v: w, heading: yaw }, body);
  if (after && after.room < 0) {
    if (after.end.axis === 0) u -= after.end.sign * -after.room; else w -= after.end.sign * -after.room;
    if (v * after.facing > 0) v = 0;
  }
  s.u = u; s.v = w; s.heading = wrapAngle(yaw); s.speed = v;
  s.curbCooldown = Math.max(0, s.curbCooldown - h);
  s.bump *= Math.exp(-h / .12);
  s.spin = (s.spin + v * h / body.wheelRadius) % TAU;
  s.brakeLight += ((braking ? 1 : 0) - s.brakeLight) * Math.min(1, h * 12);
  // The road end the car faces, the prompt, and the held turn-around request.
  const end = endNear(world, s, body), facingEnd = end && end.facing >= FACING ? end : null;
  s.toEnd = facingEnd ? facingEnd.toEnd : Infinity;
  s.end = facingEnd && facingEnd.toEnd <= D.roadEnd.promptDistance ? facingEnd.end.id : null;
  const atStop = !!facingEnd && facingEnd.room < .05 && Math.abs(v) < .05;
  const pullBack = v === 0 && reverse > 0 && brakeIn === 0 && !input.handbrake && s.end !== null;
  s.endHold = (atStop && throttle > 0) || pullBack ? s.endHold + h : 0;
  if (s.endHold >= D.roadEnd.holdSeconds) { s.endHold = 0; s.turnRequested = true; }
}

/**
 * Advances by `dt` in fixed steps, carrying the remainder in `acc` (at most half a second per call). `boxes` are the
 * traffic vehicles at the start of the call; they move on along their headings between steps.
 */
export function advanceCar(s: CarState, input: CarInput, body: CarBody, world: CarWorld, boxes: TrafficBox[], dt: number, acc: { t: number }): void {
  acc.t = Math.min(acc.t + Math.max(0, dt), .5);
  while (acc.t >= CAR_STEP) {
    acc.t -= CAR_STEP; stepCar(s, input, body, world, boxes);
    for (const b of boxes) { b.u += Math.cos(b.heading) * b.speed * CAR_STEP; b.v += Math.sin(b.heading) * b.speed * CAR_STEP; }
  }
}

/** True while the car is in the drop-off zone at the south-west canopy, slow enough to offer Enter. */
export function inEnterZone(world: CarWorld, s: CarState, body: CarBody): boolean {
  const [cu, cv] = footprintCentre(s, body), z = world.enterZone;
  return cu >= z.u[0] && cu <= z.u[1] && cv >= z.v[0] && cv <= z.v[1] && Math.abs(s.speed) <= z.maxSpeed;
}

/**
 * A free spot for a car heading `heading` at `speed`, from `candidates` (footprint centres) in order. Free means no
 * vehicle in the car's band within `clearAhead` metres ahead, or within `clearBehind` plus the distance a faster
 * vehicle behind needs to slow to the car's speed (Golden Gate's rule).
 */
export function freeSpot(candidates: readonly V2[], heading: number, speed: number, body: CarBody, boxes: readonly TrafficBox[], margin: number, clearAhead = 12, clearBehind = 10): V2 | null {
  const fu = Math.cos(heading), fv = Math.sin(heading);
  for (const [u, v] of candidates) {
    const free = boxes.every(b => {
      const du = b.u - u, dv = b.v - v, along = du * fu + dv * fv, across = -du * fv + dv * fu;
      if (Math.abs(across) >= body.width / 2 + b.halfWidth + margin) return true;
      const room = Math.abs(along) - body.length / 2 - b.halfLength;
      return along >= 0 ? room >= clearAhead : room >= clearBehind + Math.max(0, b.speed - speed) ** 2 / (2 * SPOT_DECEL);
    });
    if (free) return [u, v];
  }
  return null;
}

/** The origin of a car whose footprint centre is (cu, cv) at `heading`. */
function originFor(cu: number, cv: number, heading: number, body: CarBody): V2 {
  const fu = Math.cos(heading), fv = Math.sin(heading);
  return [cu - body.centre[0] * fu + body.centre[1] * fv, cv - body.centre[0] * fv - body.centre[1] * fu];
}

/** Where the car starts: its data lane at the data u, or the nearest free position inside the start window, rolling. */
export function startCar(world: CarWorld, body: CarBody, boxes: readonly TrafficBox[]): CarState {
  const D = world.D, lane = world.lanes.find(l => l.id === D.start.lane);
  if (!lane) throw new Error(`data/driving.json start lane ${D.start.lane} is not a lane of data/campus.json`);
  const entry = lanePoint(lane, 0, newLanePoint()), heading = entry.heading;
  const us: number[] = [D.start.u];
  for (let d = 6; D.start.u - d >= D.start.window[0] || D.start.u + d <= D.start.window[1]; d += 6) {
    if (D.start.u + d <= D.start.window[1]) us.push(D.start.u + d);
    if (D.start.u - d >= D.start.window[0]) us.push(D.start.u - d);
  }
  // The lanes of the start lane's direction, nearest it first (their straight parts run at a fixed v).
  const vs = world.lanes.filter(l => l.direction === lane.direction).map(l => lanePoint(l, 0, newLanePoint()).v).sort((a, b) => Math.abs(a - entry.v) - Math.abs(b - entry.v));
  const candidates = vs.flatMap(v => us.map(u => [u, v] as V2));
  const spot = freeSpot(candidates, heading, D.start.speed, body, boxes, D.traffic.lateralMargin) ?? [D.start.u, entry.v];
  // A rolling start, no faster than the vehicle ahead in the car's band.
  const fu = Math.cos(heading), fv = Math.sin(heading);
  let speed = D.start.speed;
  for (const b of boxes) {
    const du = b.u - spot[0], dv = b.v - spot[1];
    if (Math.abs(-du * fv + dv * fu) < body.width / 2 + b.halfWidth && du * fu + dv * fv > 0) speed = Math.min(speed, b.speed);
  }
  const [u, v] = originFor(spot[0], spot[1], heading, body);
  return createCar(u, v, heading, speed);
}

/**
 * Turns the car around at the road end it is on: the mirror position across the road's centre line (the nearest
 * free spot there, stepping back from the end), facing back along the road, at rest. False when not on an end's road.
 */
export function turnAround(s: CarState, body: CarBody, world: CarWorld, boxes: readonly TrafficBox[]): boolean {
  const near = endNear(world, s, body); if (!near) return false;
  const e = near.end, [cu, cv] = footprintCentre(s, body);
  // Facing back along the road: away from the end.
  const heading = e.axis === 0 ? (e.sign > 0 ? Math.PI : 0) : (e.sign > 0 ? -Math.PI / 2 : Math.PI / 2);
  const mirror: V2 = e.axis === 0 ? [cu, -cv] : [-cu, cv];
  const lanes = e.axis === 0 ? world.lanes.filter(l => (l.direction === 'north') === (heading === 0)).map(l => lanePoint(l, 0, newLanePoint()).v).sort((a, b) => Math.abs(a - mirror[1]) - Math.abs(b - mirror[1])) : [];
  const steps = [0, 10, 20, 30, 40].map(d => -e.sign * d);
  const candidates: V2[] = [];
  for (const across of [e.axis === 0 ? mirror[1] : mirror[0], ...lanes]) for (const d of steps)
    candidates.push(e.axis === 0 ? [mirror[0] + d, across] : [across, mirror[1] + d]);
  const spot = freeSpot(candidates, heading, 0, body, boxes, world.D.traffic.lateralMargin) ?? mirror;
  const [u, v] = originFor(spot[0], spot[1], heading, body);
  Object.assign(s, createCar(u, v, heading, 0));
  // A turned car whose back stood at the stop line may reach past it by the footprint's offset: step it in.
  const after = endNear(world, s, body);
  if (after && after.room < 0) { if (e.axis === 0) s.u -= e.sign * -after.room; else s.v -= e.sign * -after.room; }
  return true;
}

/** Places a car at rest (or rolling) with its footprint centre at (cu, cv) and `heading` (the drive's restore and test hooks). */
export function placeCar(cu: number, cv: number, heading: number, speed: number, body: CarBody): CarState {
  const [u, v] = originFor(cu, cv, heading, body);
  return createCar(u, v, heading, speed);
}
