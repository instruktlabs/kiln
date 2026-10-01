// SPDX-License-Identifier: MIT
// Campus traffic (FF-C1 item 5): Golden Gate's free-flowing lane model (packages/golden-gate/src/traffic/sim.ts: regular
// patterns, natural spacing, mild speed variation, entering and leaving at the ends, IDM car following, braking only
// for the viewer's car; nothing collides physically) on the campus's eight split-road lanes (data/campus.json lanes,
// four each way through the roundabout). Pure and deterministic: one seeded generator (Golden Gate's seed and
// mulberry32), fixed sub-steps, no three.js. A lane is a path from s = 0 (entry, a split-road end) to s = length (exit,
// the other end); on the fillets and the ring a vehicle's free speed is held to sqrt(lateralAccel x radius), planned
// ahead (../roads laneSpeedLimit). Vehicles fade in and out over `fade` metres at the lane ends, inside the road's
// dissolve stretch. The viewer's car is an obstacle on every lane its footprint overlaps, at its position projected
// on the lane (../roads projectOnLane). Each vehicle's plan position is cached after every step for drawing and for
// the car.
import type { CampusLane } from '../data';
import { lanePoint, laneSpeedLimit, newLanePoint, projectOnLane } from '../roads';
import type { LaneProjection } from '../roads';
import type { TrafficBox } from './car';
import type { FlowData, PaintEntry, VehicleType } from './driving';
import { mulberry32, srgbByteToLinear } from './driving';

export interface VehicleClass { name: string; length: number; width: number; weight: number; radius: number; /** Lane indices within a direction (0 next to the centre line). */ lanes: readonly number[] }
export interface SimVehicle {
  id: number; cls: number; lane: number; s: number; v: number; a: number;
  cruise: number; phase: number; period: number;
  paint: number; tint: [number, number, number];
  fade: number; brake: number; spin: number;
  /** Plan position of the footprint centre and heading (campus frame), after the last step. */
  pu: number; pv: number; heading: number;
  /** Render state owned by the renderer (level of detail with hysteresis). */
  lod: number;
}
/** The viewer's car as the lanes see it: its footprint centre, heading, half extents and signed speed. */
export interface CarObstacle { u: number; v: number; heading: number; halfLength: number; halfWidth: number; speed: number }
/** Backstop under the braking limit: no vehicle ever comes closer than this to the one ahead or to the viewer's car (m). */
export const HARD_GAP = .5;

export interface TrafficSimOptions {
  lanes: readonly CampusLane[];
  flow: FlowData;
  classes: readonly VehicleClass[];
  /** Mean time between vehicles entering one lane (s) and the most vehicles a lane holds (the tier's). */
  meanHeadway: number; perLaneMax: number;
  /** Half a lane's width (m): the car blocks a lane when its footprint enters the lane's band. */
  halfLane: number;
}

export class TrafficSim {
  readonly lanes: SimVehicle[][];
  readonly o: TrafficSimOptions;
  time = 0; spawned = 0; removed = 0;
  private readonly rand: () => number;
  private nextId = 1;
  private readonly nextEntry: number[];
  private meanHeadway: number;
  private readonly classWeights: number[][];
  private readonly paintTotal: number;
  private readonly longest: number;
  private readonly point = newLanePoint();
  private readonly projection: LaneProjection = { s: 0, distance: 0 };
  private readonly step1: number;

  constructor(o: TrafficSimOptions) {
    this.o = o; this.rand = mulberry32(o.flow.seed); this.meanHeadway = o.meanHeadway; this.step1 = 1 / o.flow.stepsPerSecond;
    this.lanes = o.lanes.map(() => []);
    const indices = [...new Set(o.lanes.map(l => l.index))];
    this.classWeights = Array.from({ length: Math.max(...indices) + 1 }, (_, k) => o.classes.map(c => c.lanes.includes(k) ? c.weight : 0));
    this.paintTotal = o.flow.palette.reduce((sum, p) => sum + p.weight, 0);
    this.longest = Math.max(...o.classes.map(c => c.length));
    this.nextEntry = this.lanes.map(() => this.headway());
  }

  /** Mean entry headway (s); the density knob. Applies to future entries. */
  setMeanHeadway(seconds: number): void { this.meanHeadway = Math.max(this.o.flow.minHeadway + .5, seconds); }
  get count(): number { return this.lanes.reduce((n, lane) => n + lane.length, 0); }

  /** Footprints of the vehicles within `range` metres of (u, v); reuses the objects of `out`. */
  boxes(u: number, v: number, range: number, out: TrafficBox[] = []): TrafficBox[] {
    let n = 0;
    for (const list of this.lanes) for (const car of list) {
      if (Math.abs(car.pu - u) > range || Math.abs(car.pv - v) > range) continue;
      const cls = this.o.classes[car.cls]!, box = out[n] ?? (out[n] = { u: 0, v: 0, heading: 0, halfLength: 0, halfWidth: 0, speed: 0 });
      box.u = car.pu; box.v = car.pv; box.heading = car.heading; box.halfLength = cls.length / 2; box.halfWidth = cls.width / 2; box.speed = car.v; n++;
    }
    out.length = n;
    return out;
  }

  /** Fills every lane at steady state (entry headways sampled backwards from the exit), then settles. */
  populate(settleSeconds = 20): void {
    for (let li = 0; li < this.lanes.length; li++) {
      const lane = this.o.lanes[li]!, speed = lane.speed;
      let s = lane.length - this.o.flow.fade - this.rand() * speed * this.meanHeadway;
      const list: SimVehicle[] = []; this.lanes[li] = list; // ordered by descending s (leader first)
      while (s > this.o.flow.fade && list.length < this.o.perLaneMax) {
        const v = this.create(li, s); if (!v) break;
        v.fade = 1; v.v = Math.min(v.v, this.freeSpeed(li, v)); list.push(v); s -= this.headway() * speed;
      }
      // The next sampled car sits at s (< fade): it enters now if s > 0, else after -s / speed.
      this.nextEntry[li] = Math.max(0, -s / speed);
    }
    for (let t = 0; t < settleSeconds; t += this.step1) this.step(this.step1);
    this.updatePoses();
  }

  /** Advances the simulation (sub-stepped at 1 / stepsPerSecond s) and refreshes the cached positions. */
  step(dt: number, obstacle?: CarObstacle | null): void {
    let remaining = Math.min(dt, .5);
    while (remaining > 1e-6) {
      const h = Math.min(remaining, this.step1); remaining -= h; this.time += h;
      for (let li = 0; li < this.lanes.length; li++) this.stepLane(li, h, obstacle ? this.obstacleIn(li, obstacle) : null);
    }
    this.updatePoses();
  }

  /** Position of the car along a lane when its footprint overlaps the lane's band. */
  private obstacleIn(li: number, o: CarObstacle): { s: number; v: number; halfLength: number } | null {
    const lane = this.o.lanes[li]!, p = projectOnLane(lane, o.u, o.v, this.projection);
    const at = lanePoint(lane, p.s, this.point), rel = o.heading - at.heading, c = Math.abs(Math.cos(rel)), n = Math.abs(Math.sin(rel));
    if (p.distance >= this.o.halfLane + o.halfLength * n + o.halfWidth * c) return null;
    return { s: p.s, v: Math.max(0, o.speed * Math.cos(rel)), halfLength: o.halfLength * c + o.halfWidth * n };
  }

  /** The vehicle's free speed at its position: its cruise with the slow wobble, held on the curves. */
  private freeSpeed(li: number, car: SimVehicle): number {
    const lane = this.o.lanes[li]!, wobble = 1 + this.o.flow.speed.oscillation * Math.sin(2 * Math.PI * this.time / car.period + car.phase);
    const curve = laneSpeedLimit(lane, car.s, this.o.flow.lateralAccel, this.o.flow.planDecel);
    return curve < lane.speed ? Math.min(car.cruise * wobble, curve) : car.cruise * wobble;
  }

  private stepLane(li: number, h: number, obstacle: { s: number; v: number; halfLength: number } | null): void {
    const list = this.lanes[li]!, o = this.o, lane = o.lanes[li]!, IDM = o.flow.idm;
    for (let i = 0; i < list.length; i++) {
      const car = list[i]!, cls = o.classes[car.cls]!;
      // Leader: the car ahead in the lane, or the viewer's car when it is ahead and closer.
      let gap = Infinity, leadV = car.v;
      if (i > 0) { const lead = list[i - 1]!; gap = lead.s - o.classes[lead.cls]!.length / 2 - (car.s + cls.length / 2); leadV = lead.v; }
      // The viewer's car leads only a vehicle behind it; one already alongside keeps going (the car's own rules keep
      // it clear sideways).
      const behindCar = obstacle !== null && obstacle.s > car.s && obstacle.s - obstacle.halfLength - (car.s + cls.length / 2) > 0;
      if (behindCar) {
        const g = obstacle.s - obstacle.halfLength - (car.s + cls.length / 2);
        if (g < gap) { gap = g; leadV = obstacle.v; }
      }
      const v0 = this.freeSpeed(li, car);
      let a = IDM.accel * (1 - Math.pow(car.v / v0, 4));
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
      car.brake += ((a < -o.flow.brakeLights.decel ? 1 : 0) - car.brake) * Math.min(1, h * o.flow.brakeLights.rate);
      car.fade = Math.min(1, Math.min(car.s / o.flow.fade, (lane.length - car.s) / o.flow.fade));
    }
    // Recycle: vehicles past the exit leave; entries follow each lane's sampled headway.
    while (list.length && list[0]!.s >= lane.length) { list.shift(); this.removed++; }
    this.nextEntry[li]! -= h;
    if (this.nextEntry[li]! <= 0 && list.length < o.perLaneMax) {
      const last = list[list.length - 1];
      const clear = !last || last.s - o.classes[last.cls]!.length / 2 > IDM.gap + this.longest + last.v * IDM.headway;
      const blocked = obstacle && obstacle.s < o.flow.fade + 20 && obstacle.s > -20;
      if (clear && !blocked) {
        const car = this.create(li, 0);
        if (car) { if (last) car.v = Math.min(car.v, last.v); list.push(car); this.spawned++; }
        this.nextEntry[li] = this.headway();
      }
    }
  }

  private updatePoses(): void {
    for (let li = 0; li < this.lanes.length; li++) {
      const lane = this.o.lanes[li]!;
      for (const car of this.lanes[li]!) { const p = lanePoint(lane, car.s, this.point); car.pu = p.u; car.pv = p.v; car.heading = p.heading; }
    }
  }

  private headway(): number {
    // Sum of two exponentials (gamma, shape 2) above a floor: natural gaps without platoons.
    const spread = this.meanHeadway - this.o.flow.minHeadway;
    return this.o.flow.minHeadway + spread * (-Math.log(1 - this.rand()) - Math.log(1 - this.rand())) / 2;
  }

  private create(li: number, s: number): SimVehicle | null {
    const lane = this.o.lanes[li]!, weights = this.classWeights[lane.index]!, total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let pick = this.rand() * total, cls = 0;
    for (; cls < weights.length - 1; cls++) { pick -= weights[cls]!; if (pick < 0) break; }
    const SPEED = this.o.flow.speed, PAINT = this.o.flow.paint;
    const cruise = lane.speed * (1 + (this.rand() - .5) * SPEED.personal);
    const paint = this.pickPaint(li, s);
    const [r, g, b] = this.o.flow.palette[paint]!.srgb, jitter = 1 + (this.rand() - .5) * PAINT.brightnessJitter;
    return {
      id: this.nextId++, cls, lane: li, s, v: cruise, a: 0, cruise, phase: this.rand() * Math.PI * 2,
      period: SPEED.oscillationPeriod[0] + this.rand() * (SPEED.oscillationPeriod[1] - SPEED.oscillationPeriod[0]),
      paint, tint: [srgbByteToLinear(r) * jitter, srgbByteToLinear(g) * jitter, srgbByteToLinear(b) * jitter],
      fade: 0, brake: 0, spin: this.rand() * Math.PI * 2, pu: 0, pv: 0, heading: 0, lod: 2,
    };
  }

  /**
   * Weighted palette draw that never repeats the colour of the car directly ahead in the lane and avoids the colours
   * of cars within avoidRadius in this direction's other lanes; after `attempts` draws it takes the most common colour
   * still free (Golden Gate's rule).
   */
  private pickPaint(li: number, s: number): number {
    const palette: readonly PaintEntry[] = this.o.flow.palette, PAINT = this.o.flow.paint, near = new Set<number>(), ahead = this.lanes[li]!.at(-1);
    const direction = this.o.lanes[li]!.direction;
    if (ahead) near.add(ahead.paint);
    for (let l = 0; l < this.lanes.length; l++) {
      if (this.o.lanes[l]!.direction !== direction) continue;
      for (const car of this.lanes[l]!) if (Math.abs(car.s - s) < PAINT.avoidRadius) near.add(car.paint);
    }
    for (let attempt = 0; attempt < PAINT.attempts; attempt++) {
      let pick = this.rand() * this.paintTotal, paint = 0;
      for (; paint < palette.length - 1; paint++) { pick -= palette[paint]!.weight; if (pick < 0) break; }
      if (!near.has(paint)) return paint;
    }
    let best = -1;
    palette.forEach((p, i) => { if (!near.has(i) && (best < 0 || p.weight > palette[best]!.weight)) best = i; });
    return best < 0 ? 0 : best;
  }
}

/** The vehicle classes of the flow from the loaded (or measured) model dimensions. */
export function trafficClasses(flow: FlowData, types: readonly VehicleType[], dims: (type: VehicleType) => { length: number; width: number; wheelRadius: number }): VehicleClass[] {
  return types.map(type => {
    const row = flow.vehicles[type];
    if (!row) throw new Error(`data/driving.json flow has no vehicle ${type}`);
    const d = dims(type);
    return { name: type, length: d.length, width: d.width, radius: d.wheelRadius, weight: row.weight, lanes: row.lanes };
  });
}

/** The lane fade must fit inside the split road's dissolve stretch, where the road fades into grade (Golden Gate's rule). */
export function checkLaneFade(flow: FlowData, dissolve: number): void {
  if (!(flow.fade > 0 && flow.fade <= dissolve + 1e-9)) throw new Error(`data/driving.json flow.fade ${flow.fade} m must fit the split road's dissolve stretch (${dissolve} m)`);
}
