// The player's sedan (SCENE-TASK "Driving the sedan"): arcade driving on its own carriageway, pure
// and deterministic (no three.js), stepped at fixed 1/120 s sub-steps. Parameters are data
// (data/driving.json, D-21); data/BEHAVIOUR.md specifies the model for other engines.
//
// Frame: route coordinates (../world/route): z is the route station and x the lateral offset, which
// are the scene Z and X on the deck; on the approach roads the renderer maps them onto the road (the
// car drives a straightened road; on the approach curves a station metre is 1 - curvature x offset
// metres of lane, at most 2.6 % off). Northbound (dir +1) uses x < 0, southbound (dir -1) x > 0.
// Heading follows the kit's yaw convention (forward = (sin yaw, cos yaw)) in that frame; the car's yaw
// is its lane direction (0 north, pi south) plus a bounded heading offset, positive to the left.
// The car's road ends at each approach's `ends.car` station (layout.json), where it turns around;
// traffic drives on to the approach ends.
import { DRIVING_DATA, LAYOUT, TRAFFIC_DATA } from '../data';
import type { SimBox } from '../traffic/sim';

const D = DRIVING_DATA, BRIDGE = LAYOUT.bridge, RAD = Math.PI / 180;
export const CAR_STEP = 1 / 120;
/** Share of the service brake the car plans with when it slows for traffic or the end stop. */
const PLANNED_BRAKE = .8;
/** Time constant (s) of the heading offset relaxing while the car is held at an edge or beside traffic. */
const EDGE_RELAX = .15;
/** Deceleration (m/s^2) the car assumes traffic behind can comfortably use when it chooses a free spot. */
const SPOT_DECEL = 4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Footprint of the driven model (m). */
export interface CarBody { length: number; width: number; wheelRadius: number }
/** Controls, each 0..1 except `steer` (-1 left .. +1 right). `reverse` brakes while rolling forward, then reverses. */
export interface CarInput { throttle: number; reverse: number; steer: number; brake: number; handbrake: boolean; boost?: boolean }
/** A traffic vehicle as the car sees it (axis-aligned; traffic keeps to its lane centre). */
export type TrafficBox = SimBox;
export type CarContact = 'curb' | 'median' | 'traffic' | 'end' | null;
export interface CarState {
  dir: 1 | -1; x: number; z: number;
  /** Signed speed along the heading (m/s); negative when reversing. */
  speed: number;
  /** Heading offset from the lane direction (rad, positive to the left). */
  offset: number;
  /** Front wheel angle (rad, positive to the left) and wheel roll angle (rad, growing when driving forward). */
  wheel: number; spin: number;
  /** Brake lamp level 0..1. */
  brakeLight: number;
  /** Time held at rest with reverse pressed (s); reverse engages after reverse.afterStopSeconds. */
  held: number;
  curbCooldown: number;
  /** Curb bump pitch kick (rad), decaying. */
  bump: number;
  /** Time held against the end stop with the throttle, or at rest near the road end with reverse (s). */
  endHold: number;
  /** Distance from the car's centre to its road end ahead (m of station). */
  toEnd: number;
  /** Set when the throttle has been held at the end stop, or reverse at rest near the road end; the caller clears it when it turns the car. */
  turnRequested: boolean;
  /** What limited the car in the last step (tests and HUD). */
  contact: CarContact;
}

/** Yaw (kit convention) of the lane direction. */
export const baseYaw = (dir: 1 | -1) => dir > 0 ? 0 : Math.PI;
export function carYaw(s: Pick<CarState, 'dir' | 'offset'>): number { return baseYaw(s.dir) + s.offset; }
/** Half extents across (x) and along (z) the lane of the car turned by its heading offset. */
export function carExtents(s: Pick<CarState, 'offset'>, body: CarBody): { ex: number; ez: number } {
  const c = Math.abs(Math.cos(s.offset)), n = Math.abs(Math.sin(s.offset));
  return { ex: body.width / 2 * c + body.length / 2 * n, ez: body.length / 2 * c + body.width / 2 * n };
}
/** The carriageway of a direction: |x| of the car's footprint stays within [median, curb]. */
export const CARRIAGEWAY = { median: BRIDGE.medianHalfWidth + D.curb.clearance, curb: BRIDGE.roadHalfWidth - D.curb.clearance };
/** Station of the car's road end for a direction: the approach's `ends.car` beyond the deck end. */
export const roadEnd = (dir: 1 | -1) => dir * (BRIDGE.roadEndZ + LAYOUT.approaches[dir > 0 ? 'north' : 'south'].ends.car);
/** Station of the end stop ahead for a direction, stopDistance short of its road end. */
export const endStop = (dir: 1 | -1) => roadEnd(dir) - dir * D.roadEnd.stopDistance;
/** Relative speed the car may keep toward something `room` metres away: `gain` per metre near, the planned brake far out. */
function approach(room: number, gain: number): number {
  const d = Math.max(0, room);
  return Math.min(gain * d, Math.sqrt(2 * PLANNED_BRAKE * D.brake * d));
}

export function createCar(dir: 1 | -1, x: number, z: number, speed: number): CarState {
  return { dir, x, z, speed, offset: 0, wheel: 0, spin: 0, brakeLight: 0, held: 0, curbCooldown: 0, bump: 0, endHold: 0,
    toEnd: (roadEnd(dir) - z) * dir, turnRequested: false, contact: null };
}

/** Longitudinal margin to a vehicle when moving sideways toward it: more for one closing on the car. */
function mergeMargin(s: CarState, b: TrafficBox): number {
  const behind = (b.z - s.z) * s.dir < 0, closing = behind ? Math.max(0, b.speed - s.speed) : Math.max(0, s.speed - b.speed);
  return D.traffic.longitudinalMargin + closing * 1;
}

/** One fixed step. `boxes` are the traffic vehicles of the car's carriageway. */
export function stepCar(s: CarState, input: CarInput, body: CarBody, boxes: readonly TrafficBox[], h = CAR_STEP): void {
  const throttle = clamp(input.throttle, 0, 1), reverse = clamp(input.reverse, 0, 1), steer = clamp(input.steer, -1, 1), brakeIn = clamp(input.brake, 0, 1);
  s.contact = null;
  let v = s.speed, braking = false;
  // Longitudinal: throttle with a quadratic approach to top speed, coasting drag off the throttle,
  // service brake, handbrake, and reverse after a short hold at rest.
  const coast = (speed: number) => D.coast.constant + D.coast.quadratic * speed * speed;
  const power = input.boost ? D.boost : D;
  if (v > 0) {
    const drive = throttle > 0 ? power.accel * throttle * (1 - (v / power.topSpeed) ** 2) : -coast(v);
    const stop = Math.max(D.brake * brakeIn, D.brake * reverse, input.handbrake ? D.handbrake : 0);
    braking = stop > 0; v = Math.max(0, v + (drive - stop) * h); s.held = 0;
  } else if (v < 0) {
    const drive = reverse > 0 ? (-v < D.reverse.maxSpeed ? -D.reverse.accel * reverse : 0) : coast(v);
    const stop = Math.max(D.brake * brakeIn, D.brake * throttle, input.handbrake ? D.handbrake : 0);
    braking = stop > 0; v = Math.min(0, v + (drive + stop) * h); s.held = 0;
  } else {
    const free = brakeIn === 0 && !input.handbrake;
    // Near the road end ahead, reverse held at rest turns the car around (below) rather than reversing (D-22).
    const endTurn = s.toEnd <= D.roadEnd.promptDistance;
    if (throttle > 0 && free) { v = power.accel * throttle * h; s.held = 0; }
    else if (reverse > 0 && free && !endTurn) {
      s.held += h; braking = s.held < D.reverse.afterStopSeconds;
      if (!braking) v = -D.reverse.accel * reverse * h;
    } else { s.held = 0; braking = !free || reverse > 0; }
  }
  // Steering: the heading offset follows the input at a rate that fades in over the first metres per
  // second, within a limit that narrows with speed, and returns to straight when released. Reversing
  // swings the nose the other way, as a real car does.
  const f = Math.min(1, Math.abs(v) / D.topSpeed), limit = lerp(D.steer.headingDeg[0], D.steer.headingDeg[1], f) * RAD;
  const rate = D.steer.rateDegPerSecond * RAD * Math.min(1, Math.abs(v) / D.steer.fullRateSpeed) * h;
  const target = (v < 0 ? steer : -steer) * limit;
  s.offset += clamp(target - s.offset, -rate, rate);
  if (Math.abs(s.offset) > limit) s.offset -= Math.sign(s.offset) * Math.min(Math.abs(s.offset) - limit, rate);
  const wheelTarget = -steer * lerp(D.steer.wheelDeg[0], D.steer.wheelDeg[1], f) * RAD;
  s.wheel += clamp(wheelTarget - s.wheel, -4 * h, 4 * h);

  // Traffic in the car's lateral span: never close faster than it can stop behind the one ahead (planned
  // brake far out, followGain near) so it settles minGap behind it. The same holds behind when reversing.
  // Slowing for traffic or the end stop overrides the throttle with the service brake.
  const { ex, ez } = carExtents(s, body), span = ex + D.traffic.lateralMargin;
  const slowed = (allowed: number) => Math.max(allowed, Math.min(v, s.speed - D.brake * h));
  const backed = (allowed: number) => -Math.max(allowed, Math.min(-v, -s.speed - D.brake * h));
  for (const b of boxes) {
    if (Math.abs(s.x - b.x) >= span + b.halfWidth) continue;
    const along = (b.z - s.z) * s.dir, gap = Math.abs(along) - ez - b.halfLength;
    if (along > 0 && v > 0) {
      const allowed = b.speed + approach(gap - D.traffic.minGap, D.traffic.followGain);
      if (v > allowed) { v = slowed(allowed); s.contact = 'traffic'; }
    } else if (along < 0 && v < 0) {
      const allowed = approach(gap - D.traffic.minGap, D.traffic.followGain);
      if (-v > allowed) { v = backed(allowed); s.contact = 'traffic'; }
    }
  }
  // The end stops: slow to rest stopDistance before either road end.
  const rear = endStop(-s.dir as 1 | -1), ahead = (endStop(s.dir) - s.z) * s.dir, behindStop = (s.z - rear) * s.dir;
  if (v > 0) { const allowed = approach(ahead, Infinity); if (v > allowed) { v = slowed(allowed); s.contact = 'end'; } }
  if (v < 0) { const allowed = approach(behindStop, Infinity); if (-v > allowed) v = backed(allowed); }
  // Brake lamps: the brake inputs, or slowing harder than engine braking (the traffic's rule).
  if ((Math.abs(s.speed) - Math.abs(v)) / h > TRAFFIC_DATA.brakeLights.decel) braking = true;

  // Move along the heading, then hold the footprint inside the carriageway and clear of traffic.
  const yaw = baseYaw(s.dir) + s.offset;
  let x = s.x + v * Math.sin(yaw) * h, z = s.z + v * Math.cos(yaw) * h;
  const inner = -s.dir * CARRIAGEWAY.median, outer = -s.dir * CARRIAGEWAY.curb;
  const lo = Math.min(inner, outer) + ex, hi = Math.max(inner, outer) - ex;
  if (x < lo || x > hi) {
    s.contact = (s.dir > 0 ? x < lo : x > hi) ? 'curb' : 'median';
    x = clamp(x, lo, hi);
    if (s.curbCooldown <= 0 && Math.abs(v) > .5) { v *= D.curb.speedKept; s.curbCooldown = D.curb.cooldown; s.bump = D.curb.bumpDeg * RAD; }
    s.offset *= Math.exp(-h / EDGE_RELAX);
  }
  // Sideways: no closer than lateralMargin to a vehicle alongside, and no entering a vehicle's column
  // within its merge margin (more for one closing on the car). Behind or ahead in the same column the
  // lengthways rules apply.
  for (const b of boxes) {
    const reach = ex + b.halfWidth + D.traffic.lateralMargin, before = Math.abs(s.x - b.x), after = Math.abs(x - b.x);
    if (after >= reach || after >= before) continue;
    const dz = Math.abs(s.z - b.z), alongside = dz < ez + b.halfLength, merging = before >= reach && dz < ez + b.halfLength + mergeMargin(s, b);
    if (!alongside && !merging) continue;
    x = before >= reach ? b.x + Math.sign(s.x - b.x) * reach : s.x;
    s.offset *= Math.exp(-h / EDGE_RELAX); s.contact = 'traffic';
  }
  // Never inside minGap of a vehicle in the column, where it will be at the end of the step.
  for (const b of boxes) {
    if (Math.abs(x - b.x) >= ex + b.halfWidth + D.traffic.lateralMargin) continue;
    const bz = b.z + b.dir * b.speed * h, along = (bz - z) * s.dir, least = ez + b.halfLength + D.traffic.minGap, wasAhead = (b.z - s.z) * s.dir >= 0;
    if (wasAhead && along < least) { z = bz - s.dir * least; v = Math.min(v, b.speed); s.contact = 'traffic'; }
    else if (!wasAhead && -along < least && v < 0) { z = bz + s.dir * least; v = 0; s.contact = 'traffic'; }
  }
  if ((z - endStop(s.dir)) * s.dir > 0) { z = endStop(s.dir); v = Math.min(v, 0); }
  if ((z - rear) * s.dir < 0) { z = rear; v = Math.max(v, 0); }
  s.x = x; s.z = z; s.speed = v;
  s.curbCooldown = Math.max(0, s.curbCooldown - h);
  s.bump *= Math.exp(-h / .12);
  s.spin = (s.spin + v * h / body.wheelRadius) % (2 * Math.PI);
  s.brakeLight += ((braking ? 1 : 0) - s.brakeLight) * Math.min(1, h * 12);
  s.toEnd = (roadEnd(s.dir) - s.z) * s.dir;
  // Holding the throttle at the end stop, or reverse at rest near the road end, asks to turn around.
  const atStop = Math.abs(s.z - endStop(s.dir)) < .05 && Math.abs(v) < .05;
  const pullBack = v === 0 && reverse > 0 && brakeIn === 0 && !input.handbrake && s.toEnd <= D.roadEnd.promptDistance;
  s.endHold = (atStop && throttle > 0) || pullBack ? s.endHold + h : 0;
  if (s.endHold >= D.roadEnd.holdSeconds) { s.endHold = 0; s.turnRequested = true; }
}

/**
 * Advances by `dt` in fixed steps, carrying the remainder in `acc` (at most half a second per call).
 * `boxes` are the vehicles at the start of the call; they move on at their speed between steps.
 */
export function advanceCar(s: CarState, input: CarInput, body: CarBody, boxes: TrafficBox[], dt: number, acc: { t: number }): void {
  acc.t = Math.min(acc.t + Math.max(0, dt), .5);
  while (acc.t >= CAR_STEP) {
    acc.t -= CAR_STEP; stepCar(s, input, body, boxes);
    for (const b of boxes) b.z += b.dir * b.speed * CAR_STEP;
  }
}

/** True when the turn-around prompt shows: near the road end ahead. */
export function nearRoadEnd(s: CarState): boolean { return s.toEnd <= D.roadEnd.promptDistance; }

/**
 * A free spot for the car driving `dir` at `speed`: lanes nearest `preferX` first, then the positions
 * `zs`. Free means no vehicle in the lane within `clearAhead` metres ahead, or within `clearBehind`
 * plus the distance a faster vehicle behind needs to slow to the car's speed.
 */
export function freeSpot(dir: 1 | -1, preferX: number, zs: readonly number[], speed: number, body: CarBody, boxes: readonly TrafficBox[], clearAhead = 12, clearBehind = 10): { x: number; z: number } | null {
  const lanes = LAYOUT.lanes.filter(l => (l.direction === 'north' ? 1 : -1) === dir).map(l => l.x).sort((a, b) => Math.abs(a - preferX) - Math.abs(b - preferX));
  for (const x of lanes) for (const z of zs) {
    const free = boxes.every(b => {
      if (Math.abs(b.x - x) >= body.width / 2 + b.halfWidth + D.traffic.lateralMargin) return true;
      const along = (b.z - z) * dir, room = Math.abs(along) - body.length / 2 - b.halfLength;
      return along >= 0 ? room >= clearAhead : room >= clearBehind + Math.max(0, b.speed - speed) ** 2 / (2 * SPOT_DECEL);
    });
    if (free) return { x, z };
  }
  return null;
}

/** Where the car starts: its data lane at the data z, or the nearest free position inside the start window. */
export function startCar(body: CarBody, boxes: readonly TrafficBox[]): CarState {
  const lane = LAYOUT.lanes.find(l => l.id === D.start.lane);
  if (!lane) throw new Error(`data/driving.json start lane ${D.start.lane} is not a lane of data/layout.json`);
  const dir = lane.direction === 'north' ? 1 : -1, zs: number[] = [D.start.z];
  for (let d = 6; D.start.z - d >= D.start.window[0] || D.start.z + d <= D.start.window[1]; d += 6) {
    if (D.start.z + d <= D.start.window[1]) zs.push(D.start.z + d);
    if (D.start.z - d >= D.start.window[0]) zs.push(D.start.z - d);
  }
  const spot = freeSpot(dir, lane.x, zs, D.start.speed, body, boxes) ?? { x: lane.x, z: D.start.z };
  // A rolling start, no faster than the vehicle ahead in the lane.
  const lead = boxes.filter(b => Math.abs(b.x - spot.x) < 1 && (b.z - spot.z) * dir > 0).sort((a, b) => (a.z - b.z) * dir)[0];
  return createCar(dir, spot.x, spot.z, Math.min(D.start.speed, lead ? lead.speed : D.start.speed));
}

/** Turns the car around at a road end: the mirror position on the other carriageway (the same station, the opposite lateral offset, or the nearest free spot), facing the other way, at rest. */
export function turnAround(s: CarState, body: CarBody, oppositeBoxes: readonly TrafficBox[]): void {
  const dir = -s.dir as 1 | -1, zs = [0, 10, 20, 30, 40].map(d => s.z + dir * d);
  const spot = freeSpot(dir, -s.x, zs, 0, body, oppositeBoxes) ?? { x: -s.x, z: s.z };
  Object.assign(s, createCar(dir, spot.x, spot.z, 0));
}
