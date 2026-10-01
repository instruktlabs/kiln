// Free-flowing traffic (owner 2026-09-29 12:58: regular patterns, highway-like speeds, natural
// spacing, mild speed variation, entering and leaving at the ends; no queues, bunching or jams).
// Pure and deterministic: one seeded generator, fixed sub-steps, no three.js. Six lanes, three each
// way; a lane is a 1-D road from s = 0 (entry) to s = length (exit), measured in route stations
// (../world/route): since fix round 2 it runs from one approach road's end over the deck to the other's,
// and the renderer maps (station, lane offset) to the road. Positions handed in and out (the player's
// car, SimBox) are route coordinates: x the lateral offset, z the station (scene X and Z on the deck).
// Each vehicle keeps a lane-wide
// cruising speed with a small personal offset and a slow zero-mean oscillation, so cars neither
// platoon nor spread apart over the crossing. The Intelligent Driver Model keeps spacing and makes
// traffic brake for the player (the only thing that ever slows it); nothing collides physically.
// Behaviour parameters come from data/traffic.json (D-21); BEHAVIOUR.md specifies the model.
import { TRAFFIC_DATA } from '../data';
import { mulberry32 } from '../world/detail-textures';

export interface VehicleClass { name: string; length: number; width: number; weight: number; radius: number; /** Allowed lanes within a direction (0 inner .. 2 outer). */ lanes: readonly number[] }
export interface PaintEntry { name: string; weight: number; srgb: readonly [number, number, number] }
export interface TrafficSimOptions {
  seed: number;
  laneLength: number;
  /** Cruising speed per lane within a direction (m/s), inner to outer. */
  laneSpeeds: readonly [number, number, number];
  /** Mean time between vehicles entering one lane (s) and the least time (s). */
  meanHeadway: number; minHeadway: number;
  perLaneMax: number;
  /** Fade length at both ends (m). */
  fade: number;
  classes: readonly VehicleClass[];
  palette: readonly PaintEntry[];
  /** Half a lane's width (m): the player's car blocks a lane when its footprint enters the lane's band. */
  halfLane?: number;
}
export interface SimVehicle {
  id: number; cls: number; lane: number; s: number; v: number; a: number;
  cruise: number; phase: number; period: number;
  paint: number; tint: [number, number, number];
  fade: number; brake: number; spin: number;
  /** Render state owned by the renderer (level of detail with hysteresis). */
  lod: number;
}
/** The player's car as the lanes see it, in route coordinates (x lateral offset, z station): position and lateral span. */
export interface SimObstacle { x: number; z: number; halfWidth: number; halfLength: number; speed: number; heading: 1 | -1 }
/** A vehicle's footprint for the player's car in route coordinates (x lateral offset, z station): axis-aligned, since traffic keeps to its lane centre. */
export interface SimBox { x: number; z: number; halfLength: number; halfWidth: number; speed: number; dir: 1 | -1 }
/** Backstop under the braking limit: no vehicle ever comes closer than this to the one ahead or to the player's car (m). */
export const HARD_GAP = .5;

/** IDM (Treiber) with highway values: comfortable acceleration and braking, 1.4 s headway, 3 m jam gap. */
export const IDM = TRAFFIC_DATA.idm;
const STEP = 1 / TRAFFIC_DATA.stepsPerSecond, SPEED = TRAFFIC_DATA.speed, PAINT = TRAFFIC_DATA.paint, BRAKE_LIGHTS = TRAFFIC_DATA.brakeLights;
export const LANES_PER_DIRECTION = 3;

export function srgbToLinear(c: number): number { const v = c / 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }

export class TrafficSim {
  readonly lanes: SimVehicle[][] = Array.from({ length: 2 * LANES_PER_DIRECTION }, () => []);
  readonly o: TrafficSimOptions;
  time = 0; spawned = 0; removed = 0;
  private rand: () => number;
  private nextId = 1;
  private nextEntry: number[];
  private meanHeadway: number;
  private readonly classTotal: number[][];
  private readonly paintTotal: number;

  constructor(o: TrafficSimOptions) {
    this.o = o; this.rand = mulberry32(o.seed); this.meanHeadway = o.meanHeadway;
    this.classTotal = [0, 1, 2].map(k => o.classes.map(c => c.lanes.includes(k) ? c.weight : 0));
    this.paintTotal = o.palette.reduce((sum, p) => sum + p.weight, 0);
    this.nextEntry = this.lanes.map(() => this.headway());
  }

  /** Mean entry headway (s); the density knob. Applies to future entries. */
  setMeanHeadway(seconds: number): void { this.meanHeadway = Math.max(this.o.minHeadway + .5, seconds); }
  get count(): number { return this.lanes.reduce((n, lane) => n + lane.length, 0); }
  /** Direction of a lane: +1 for 0-2 (northbound, s grows with +Z), -1 for 3-5. */
  static direction(lane: number): 1 | -1 { return lane < LANES_PER_DIRECTION ? 1 : -1; }

  /** Footprints of one direction's vehicles within `range` metres of station `z`; `zAt` maps lane position to station. Reuses the objects of `out`. */
  boxes(dir: 1 | -1, z: number, range: number, laneX: (lane: number) => number, zAt: (lane: number, s: number) => number, out: SimBox[] = []): SimBox[] {
    let n = 0;
    for (let lane = 0; lane < this.lanes.length; lane++) {
      if (TrafficSim.direction(lane) !== dir) continue;
      for (const car of this.lanes[lane]!) {
        const cz = zAt(lane, car.s); if (Math.abs(cz - z) > range) continue;
        const cls = this.o.classes[car.cls]!, box = out[n] ?? (out[n] = { x: 0, z: 0, halfLength: 0, halfWidth: 0, speed: 0, dir });
        box.x = laneX(lane); box.z = cz; box.halfLength = cls.length / 2; box.halfWidth = cls.width / 2; box.speed = car.v; box.dir = dir; n++;
      }
    }
    out.length = n;
    return out;
  }

  /** Fills every lane at steady state (entry headways sampled backwards from the exit), then settles. */
  populate(settleSeconds = 20): void {
    for (let lane = 0; lane < this.lanes.length; lane++) {
      const speed = this.o.laneSpeeds[lane % LANES_PER_DIRECTION]!;
      let s = this.o.laneLength - this.o.fade - this.rand() * speed * this.meanHeadway;
      const list: SimVehicle[] = []; this.lanes[lane] = list; // ordered by descending s (leader first)
      while (s > this.o.fade && list.length < this.o.perLaneMax) {
        const v = this.create(lane, s); if (!v) break;
        v.fade = 1; list.push(v); s -= this.headway() * speed;
      }
      // The next sampled car sits at s (< fade): it enters now if s > 0, else after -s / speed.
      this.nextEntry[lane] = Math.max(0, -s / speed);
    }
    for (let t = 0; t < settleSeconds; t += STEP) this.step(STEP);
  }

  /** Advances the simulation (sub-stepped at 1 / stepsPerSecond s). */
  step(dt: number, obstacle?: SimObstacle | null, laneX?: (lane: number) => number, zAt?: (lane: number, s: number) => number): void {
    let remaining = Math.min(dt, .5);
    while (remaining > 1e-6) {
      const h = Math.min(remaining, STEP); remaining -= h; this.time += h;
      for (let lane = 0; lane < this.lanes.length; lane++) this.stepLane(lane, h, obstacle && laneX && zAt ? this.obstacleIn(lane, obstacle, laneX, zAt) : null);
    }
  }

  /** Position of the player's car along a lane when it overlaps the lane and drives with it. */
  private obstacleIn(lane: number, o: SimObstacle, laneX: (lane: number) => number, zAt: (lane: number, s: number) => number): { s: number; v: number; halfLength: number } | null {
    const dir = TrafficSim.direction(lane), halfLane = this.o.halfLane ?? 1.55;
    if (Math.abs(o.x - laneX(lane)) >= halfLane + o.halfWidth) return null;
    if (o.heading !== dir) return null;
    const z0 = zAt(lane, 0), s = (o.z - z0) * dir;
    return { s, v: Math.max(0, o.speed), halfLength: o.halfLength };
  }

  private stepLane(lane: number, h: number, obstacle: { s: number; v: number; halfLength: number } | null): void {
    const list = this.lanes[lane]!, o = this.o;
    for (let i = 0; i < list.length; i++) {
      const car = list[i]!, cls = o.classes[car.cls]!;
      // Leader: the car ahead in the lane, or the player when it is ahead and closer.
      let gap = Infinity, leadV = car.v;
      if (i > 0) { const lead = list[i - 1]!; gap = lead.s - o.classes[lead.cls]!.length / 2 - (car.s + cls.length / 2); leadV = lead.v; }
      // The player's car leads only a vehicle behind it; one already alongside keeps going (the car's own
      // rules keep it clear sideways).
      const behindCar = obstacle !== null && obstacle.s > car.s && obstacle.s - obstacle.halfLength - (car.s + cls.length / 2) > 0;
      if (behindCar) {
        const g = obstacle.s - obstacle.halfLength - (car.s + cls.length / 2);
        if (g < gap) { gap = g; leadV = obstacle.v; }
      }
      const wobble = 1 + SPEED.oscillation * Math.sin(2 * Math.PI * this.time / car.period + car.phase);
      const v0 = car.cruise * wobble;
      const free = 1 - Math.pow(car.v / v0, 4);
      let a = IDM.accel * free;
      if (gap < Infinity) {
        const want = IDM.gap + Math.max(0, car.v * IDM.headway + car.v * (car.v - leadV) / (2 * Math.sqrt(IDM.accel * IDM.brake)));
        a -= IDM.accel * Math.pow(want / Math.max(gap, .5), 2);
      }
      a = Math.max(-IDM.emergency, Math.min(IDM.accel, a));
      car.a = a;
      car.v = Math.max(0, car.v + a * h);
      let limit = Infinity;
      if (i > 0) { const lead = list[i - 1]!; limit = lead.s - o.classes[lead.cls]!.length / 2 - cls.length / 2 - HARD_GAP; }
      if (behindCar) limit = Math.min(limit, obstacle.s - obstacle.halfLength - cls.length / 2 - HARD_GAP);
      const next = Math.min(car.s + car.v * h, Math.max(car.s, limit));
      if (next < car.s + car.v * h) car.v = (next - car.s) / h;
      car.s = next;
      car.spin = (car.spin + car.v * h / cls.radius) % (2 * Math.PI);
      // Brake lights are incidental: a car easing off harder than engine braking.
      car.brake += ((a < -BRAKE_LIGHTS.decel ? 1 : 0) - car.brake) * Math.min(1, h * BRAKE_LIGHTS.rate);
      car.fade = Math.min(1, Math.min(car.s / o.fade, (o.laneLength - car.s) / o.fade));
    }
    // Recycle: vehicles past the exit leave; entries follow each lane's sampled headway.
    while (list.length && list[0]!.s >= o.laneLength) { list.shift(); this.removed++; }
    this.nextEntry[lane]! -= h;
    if (this.nextEntry[lane]! <= 0 && list.length < o.perLaneMax) {
      const last = list[list.length - 1], longest = Math.max(...o.classes.map(c => c.length));
      const clear = !last || last.s - o.classes[last.cls]!.length / 2 > IDM.gap + longest + last.v * IDM.headway;
      const blocked = obstacle && obstacle.s < o.fade + 20 && obstacle.s > -20;
      if (clear && !blocked) {
        const car = this.create(lane, 0);
        if (car) { if (last) car.v = Math.min(car.v, last.v); list.push(car); this.spawned++; }
        this.nextEntry[lane] = this.headway();
      }
    }
  }

  private headway(): number {
    // Sum of two exponentials (gamma, shape 2) above a floor: natural gaps without platoons.
    const spread = this.meanHeadway - this.o.minHeadway;
    return this.o.minHeadway + spread * (-Math.log(1 - this.rand()) - Math.log(1 - this.rand())) / 2;
  }

  private create(lane: number, s: number): SimVehicle | null {
    const k = lane % LANES_PER_DIRECTION, weights = this.classTotal[k]!, total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let pick = this.rand() * total, cls = 0;
    for (; cls < weights.length - 1; cls++) { pick -= weights[cls]!; if (pick < 0) break; }
    const cruise = this.o.laneSpeeds[k]! * (1 + (this.rand() - .5) * SPEED.personal);
    const paint = this.pickPaint(lane, s);
    const [r, g, b] = this.o.palette[paint]!.srgb, jitter = 1 + (this.rand() - .5) * PAINT.brightnessJitter;
    return {
      id: this.nextId++, cls, lane, s, v: cruise, a: 0, cruise, phase: this.rand() * Math.PI * 2, period: SPEED.oscillationPeriod[0] + this.rand() * (SPEED.oscillationPeriod[1] - SPEED.oscillationPeriod[0]),
      paint, tint: [srgbToLinear(r) * jitter, srgbToLinear(g) * jitter, srgbToLinear(b) * jitter],
      fade: 0, brake: 0, spin: this.rand() * Math.PI * 2, lod: 2,
    };
  }

  /**
   * Weighted palette draw that never repeats the colour of the car directly ahead in the lane and
   * avoids the colours of cars within 40 m in this direction's other lanes; after eight draws it
   * takes the most common colour still free.
   */
  private pickPaint(lane: number, s: number): number {
    const first = lane < LANES_PER_DIRECTION ? 0 : LANES_PER_DIRECTION, near = new Set<number>(), ahead = this.lanes[lane]!.at(-1);
    if (ahead) near.add(ahead.paint);
    for (let l = first; l < first + LANES_PER_DIRECTION; l++) for (const car of this.lanes[l]!) if (Math.abs(car.s - s) < PAINT.avoidRadius) near.add(car.paint);
    for (let attempt = 0; attempt < PAINT.attempts; attempt++) {
      let pick = this.rand() * this.paintTotal, paint = 0;
      for (; paint < this.o.palette.length - 1; paint++) { pick -= this.o.palette[paint]!.weight; if (pick < 0) break; }
      if (!near.has(paint)) return paint;
    }
    let best = -1;
    this.o.palette.forEach((p, i) => { if (!near.has(i) && (best < 0 || p.weight > this.o.palette[best]!.weight)) best = i; });
    return best < 0 ? 0 : best;
  }
}
