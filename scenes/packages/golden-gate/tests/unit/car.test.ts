// Driving the sedan (SCENE-TASK "Driving the sedan"; parameters in data/driving.json): believable
// acceleration and braking, a lane-bounded arcade heading with a soft curb bump, traffic that the car
// follows and never overlaps (and that brakes for it), the road-end stop and turn-around (on the approach
// roads since fix round 2), determinism.
import { describe, expect, test } from 'bun:test';
import { DRIVING_DATA, TIER_DATA } from '../../src/data';
import { LAYOUT } from '../../scripts/authored-layout';
import { CARRIAGEWAY, advanceCar, carExtents, createCar, endStop, nearRoadEnd, roadEnd, startCar, stepCar, turnAround } from '../../src/play/car';
import type { CarBody, CarInput, CarState, TrafficBox } from '../../src/play/car';
import { TrafficSim } from '../../src/traffic/sim';
import type { SimObstacle } from '../../src/traffic/sim';
import { DENSITY_HEADWAY, PALETTE, TRAFFIC_FLOW, trafficClasses } from '../../src/traffic/config';
import { VEHICLE_TYPES } from '../../src/traffic/vehicle-models';
import { laneX } from '../../src/constants';
import { DIMS } from './helpers/vehicle-dims';

const D = DRIVING_DATA, H = 1 / 120, RAD = Math.PI / 180;
const BODY: CarBody = { length: DIMS.sedan.length, width: DIMS.sedan.width, wheelRadius: DIMS.sedan.wheelRadius };
const NONE: CarInput = { throttle: 0, reverse: 0, steer: 0, brake: 0, handbrake: false };
const input = (o: Partial<CarInput>): CarInput => ({ ...NONE, ...o });
const lane = (id: string) => LAYOUT.lanes.find(l => l.id === id)!.x;
/** Runs `seconds` of fixed steps; `each` sees the state after every step. */
function run(s: CarState, i: CarInput, seconds: number, boxes: TrafficBox[] = [], each?: (s: CarState, t: number) => void): void {
  for (let k = 0, n = Math.round(seconds / H); k < n; k++) { stepCar(s, i, BODY, boxes); each?.(s, (k + 1) * H); }
}
/** The footprint of the car overlaps a vehicle's (no margins). */
function overlapping(s: CarState, b: TrafficBox): boolean {
  const { ex, ez } = carExtents(s, BODY);
  return Math.abs(s.x - b.x) < ex + b.halfWidth && Math.abs(s.z - b.z) < ez + b.halfLength;
}

describe('driving the sedan', () => {
  test('accelerates to 100 km/h in about 11 s and tops out at 29 m/s', () => {
    const s = createCar(1, lane('nb-middle'), -990, 0);
    let to100 = NaN;
    run(s, input({ throttle: 1 }), 60, [], (c, t) => { if (Number.isNaN(to100) && c.speed >= 100 / 3.6) to100 = t; });
    console.log(JSON.stringify({ to100: +to100.toFixed(2), after60: +s.speed.toFixed(2) }));
    expect(to100).toBeGreaterThan(9); expect(to100).toBeLessThan(13);
    expect(s.speed).toBeLessThanOrEqual(D.topSpeed); expect(s.speed).toBeGreaterThan(D.topSpeed - .5);
    expect(s.brakeLight).toBeLessThan(.01);
  });

  test('brakes from 29 m/s in about 60 m with the brake lights on, and coasts gently', () => {
    const s = createCar(1, lane('nb-middle'), -900, 29), z0 = s.z;
    let lit = 0;
    run(s, input({ brake: 1 }), 6, [], c => { if (c.speed > 1) lit = Math.max(lit, c.brakeLight); });
    expect(s.speed).toBe(0); expect(s.z - z0).toBeGreaterThan(52); expect(s.z - z0).toBeLessThan(62); expect(lit).toBeGreaterThan(.9);
    const c = createCar(1, lane('nb-middle'), -900, 25);
    run(c, NONE, 10);
    expect(c.speed).toBeGreaterThan(16); expect(c.speed).toBeLessThan(21); expect(c.brakeLight).toBeLessThan(.01);
  });

  test('reverse brakes first, engages after half a second at rest, and is limited', () => {
    const s = createCar(1, lane('nb-middle'), 0, 10);
    const back = input({ reverse: 1 });
    run(s, back, 1.2);
    expect(s.speed).toBeGreaterThan(0); expect(s.brakeLight).toBeGreaterThan(.9);
    let stoppedAt = NaN, reversingAt = NaN, slowest = 0;
    run(s, back, 6, [], (c, t) => {
      if (Number.isNaN(stoppedAt) && c.speed === 0) stoppedAt = t;
      if (Number.isNaN(reversingAt) && c.speed < 0) reversingAt = t;
      slowest = Math.min(slowest, c.speed);
    });
    expect(reversingAt - stoppedAt).toBeGreaterThan(D.reverse.afterStopSeconds - .02);
    expect(reversingAt - stoppedAt).toBeLessThan(D.reverse.afterStopSeconds + .05);
    expect(slowest).toBeGreaterThanOrEqual(-D.reverse.maxSpeed - .05); expect(s.speed).toBeLessThan(-D.reverse.maxSpeed + .1);
    // The throttle brakes a reversing car, then drives forward.
    run(s, input({ throttle: 1 }), 3);
    expect(s.speed).toBeGreaterThan(0);
  });

  test('steers within a speed-dependent heading limit and straightens when released', () => {
    const still = createCar(1, lane('nb-middle'), 0, 0);
    run(still, input({ steer: 1 }), 1);
    expect(still.offset).toBe(0); expect(still.wheel).toBeCloseTo(-D.steer.wheelDeg[0] * RAD, 3);
    const s = createCar(1, lane('nb-middle'), 0, 25), x0 = s.x;
    // The limit narrows from standstill to top speed.
    const limit = (speed: number) => (D.steer.headingDeg[0] + (D.steer.headingDeg[1] - D.steer.headingDeg[0]) * Math.min(1, Math.abs(speed) / D.topSpeed)) * RAD;
    let over = 0;
    run(s, input({ steer: 1, throttle: .3 }), .5, [], c => { if (Math.abs(c.offset) > limit(c.speed) + 1e-9) over++; });
    // Right when heading north is east (-X).
    expect(s.offset).toBeLessThan(0); expect(s.x).toBeLessThan(x0); expect(over).toBe(0);
    expect(Math.abs(s.offset)).toBeGreaterThan(limit(s.speed) * .9);
    run(s, input({ throttle: .3 }), 3);
    expect(Math.abs(s.offset)).toBeLessThan(.1 * RAD);
    // Southbound mirrors it: right is west (+X).
    const south = createCar(-1, lane('sb-middle'), 0, 25), sx0 = south.x;
    run(south, input({ steer: 1, throttle: .3 }), .5);
    expect(south.x).toBeGreaterThan(sx0);
  });

  test('bumps softly along the curb and the median, never beyond them', () => {
    const s = createCar(1, lane('nb-outer'), -600, 25);
    let bumps = 0, beyond = 0, previous = s.speed, minKept = 1;
    run(s, input({ steer: 1, throttle: 1 }), 4, [], c => {
      const { ex } = carExtents(c, BODY);
      if (c.x - ex < -CARRIAGEWAY.curb - 1e-9 || c.x + ex > -CARRIAGEWAY.median + 1e-9) beyond++;
      if (c.contact === 'curb' && c.speed < previous - D.accel / 120 - 1e-6) { bumps++; minKept = Math.min(minKept, c.speed / previous); }
      previous = c.speed;
    });
    expect(beyond).toBe(0); expect(bumps).toBeGreaterThan(2); expect(bumps).toBeLessThanOrEqual(Math.ceil(4 / D.curb.cooldown) + 1);
    expect(minKept).toBeGreaterThanOrEqual(D.curb.speedKept - 1e-9);
    const m = createCar(1, lane('nb-inner'), -600, 25);
    let median = false;
    run(m, input({ steer: -1, throttle: 1 }), 3, [], c => { if (c.contact === 'median') median = true; const { ex } = carExtents(c, BODY); expect(c.x + ex).toBeLessThanOrEqual(-CARRIAGEWAY.median + 1e-9); });
    expect(median).toBe(true);
  });

  test('follows a slower vehicle without closing inside minGap or braking harder than the brake', () => {
    const s = createCar(1, lane('nb-middle'), -900, 29);
    const lead: TrafficBox = { x: lane('nb-middle'), z: -780, halfLength: DIMS['box-truck'].length / 2, halfWidth: DIMS['box-truck'].width / 2, speed: 12, dir: 1 };
    let minGap = Infinity, hardest = 0, previous = s.speed, braked = false;
    run(s, input({ throttle: 1 }), 30, [lead], c => {
      lead.z += lead.speed * H;
      minGap = Math.min(minGap, (lead.z - c.z) - carExtents(c, BODY).ez - lead.halfLength);
      hardest = Math.max(hardest, (previous - c.speed) / H); previous = c.speed;
      if (c.contact === 'traffic') braked = true;
    });
    console.log(JSON.stringify({ minGap: +minGap.toFixed(3), hardest: +hardest.toFixed(2), final: +s.speed.toFixed(2) }));
    expect(minGap).toBeGreaterThanOrEqual(D.traffic.minGap - 1e-6);
    expect(hardest).toBeLessThanOrEqual(D.brake + 1e-6);
    expect(Math.abs(s.speed - 12)).toBeLessThan(.3); expect(braked).toBe(true); expect(s.brakeLight).toBeLessThan(.5);
  });

  test('cannot move sideways into a vehicle alongside', () => {
    const s = createCar(1, lane('nb-middle'), 0, 20);
    const beside: TrafficBox = { x: lane('nb-inner'), z: 1, halfLength: DIMS.suv.length / 2, halfWidth: DIMS.suv.width / 2, speed: 20, dir: 1 };
    // Translation stops at the lateral margin; turning in place may take at most the rest of the margin.
    let blocked = false, closest = Infinity;
    run(s, input({ steer: -1 }), 3, [beside], c => {
      beside.z = c.z + 1; beside.speed = c.speed;
      const { ex } = carExtents(c, BODY);
      closest = Math.min(closest, beside.x - c.x - ex - beside.halfWidth);
      if (c.contact === 'traffic') blocked = true;
    });
    console.log(JSON.stringify({ closest: +closest.toFixed(3) }));
    expect(blocked).toBe(true); expect(closest).toBeGreaterThan(0);
  });

  test('its road ends on the approach roads, past the deck ends, where traffic drives on', () => {
    for (const [dir, name] of [[1, 'north'], [-1, 'south']] as const) {
      const a = LAYOUT.approaches[name];
      expect(roadEnd(dir)).toBeCloseTo(dir * (LAYOUT.bridge.roadEndZ + a.ends.car), 9);
      expect((roadEnd(dir) - endStop(dir)) * dir).toBeCloseTo(D.roadEnd.stopDistance, 9);
      // Short of the dissolve stretch, where the road fades into the terrain.
      expect(a.ends.car).toBeLessThan(a.ends.dissolve[0] - 300);
    }
  });

  test('stops before the road end, prompts, and turns around when the throttle is held', () => {
    const s = createCar(1, lane('nb-middle'), endStop(1) - 180, 29);
    let prompted = false, passed = 0;
    for (let k = 0; k < 20 * 120 && !s.turnRequested; k++) {
      stepCar(s, input({ throttle: 1 }), BODY, []);
      if (nearRoadEnd(s)) prompted = true;
      if (s.z > endStop(1) + 1e-9) passed++;
    }
    expect(prompted).toBe(true); expect(passed).toBe(0);
    expect(s.turnRequested).toBe(true); expect(s.z).toBeCloseTo(endStop(1), 6); expect(s.speed).toBe(0);
    expect(s.toEnd).toBeCloseTo(D.roadEnd.stopDistance, 6);
    turnAround(s, BODY, []);
    expect(s.dir).toBe(-1); expect(s.x).toBeCloseTo(lane('sb-middle'), 6); expect(s.z).toBeCloseTo(endStop(1), 6);
    expect(s.speed).toBe(0); expect(s.turnRequested).toBe(false); expect(nearRoadEnd(s)).toBe(false);
    run(s, input({ throttle: 1 }), 3);
    expect(s.z).toBeLessThan(endStop(1) - 5);
    // The south end the same way, driving south.
    const south = createCar(-1, lane('sb-middle'), endStop(-1) + 180, 29);
    for (let k = 0; k < 20 * 120 && !south.turnRequested; k++) stepCar(south, input({ throttle: 1 }), BODY, []);
    expect(south.turnRequested).toBe(true); expect(south.z).toBeCloseTo(endStop(-1), 6);
    turnAround(south, BODY, []); expect(south.dir).toBe(1); expect(south.x).toBeCloseTo(lane('nb-middle'), 6);
    // A busy mirror lane moves the car to a free one.
    const t = createCar(1, lane('nb-middle'), endStop(1), 0);
    const busy: TrafficBox = { x: lane('sb-middle'), z: endStop(1) + 20, halfLength: 2.5, halfWidth: 1, speed: 20, dir: -1 };
    turnAround(t, BODY, [busy]);
    expect(t.x).not.toBeCloseTo(lane('sb-middle'), 3); expect(t.dir).toBe(-1);
  });

  test('near the road end a held pull-back stops the car and turns it around rather than reversing (D-22)', () => {
    const s = createCar(1, lane('nb-middle'), endStop(1) - 40, 12);
    expect(nearRoadEnd(s)).toBe(true);
    let stoppedAt = NaN, turnedAt = NaN, reversed = false;
    for (let k = 0; k < 6 * 120 && !s.turnRequested; k++) {
      stepCar(s, input({ reverse: 1 }), BODY, []);
      if (Number.isNaN(stoppedAt) && s.speed === 0) stoppedAt = (k + 1) * H;
      if (s.speed < 0) reversed = true;
      if (s.turnRequested) turnedAt = (k + 1) * H;
    }
    expect(reversed).toBe(false); expect(s.brakeLight).toBeGreaterThan(.9);
    expect(turnedAt - stoppedAt).toBeCloseTo(D.roadEnd.holdSeconds, 1);
    // Released early, nothing happens; away from the road end the same hold reverses.
    const t = createCar(1, lane('nb-middle'), endStop(1) - 40, 0);
    run(t, input({ reverse: 1 }), D.roadEnd.holdSeconds * .8); run(t, NONE, .1); run(t, input({ reverse: 1 }), D.roadEnd.holdSeconds * .8);
    expect(t.turnRequested).toBe(false); expect(t.speed).toBe(0);
    const u = createCar(1, lane('nb-middle'), 0, 0); run(u, input({ reverse: 1 }), 1.5);
    expect(u.speed).toBeLessThan(0); expect(u.turnRequested).toBe(false);
  });

  test('is deterministic', () => {
    const script = (k: number): CarInput => input({ throttle: k % 900 < 600 ? 1 : 0, steer: Math.sin(k / 97), brake: k % 1300 > 1200 ? 1 : 0, reverse: k % 2000 > 1900 ? 1 : 0 });
    const drive = () => { const s = createCar(1, lane('nb-middle'), -900, 16); for (let k = 0; k < 6000; k++) stepCar(s, script(k), BODY, []); return JSON.stringify(s); };
    expect(drive()).toBe(drive());
  });

  // Measured: about 1.5 s for 240 simulated seconds on the development PC under load.
  test('with the traffic simulation: never overlaps a vehicle, traffic brakes for it, flows on', () => {
    const classes = trafficClasses(VEHICLE_TYPES, t => DIMS[t]);
    const sim = new TrafficSim({ seed: TRAFFIC_FLOW.seed, laneLength: TRAFFIC_FLOW.laneLength, laneSpeeds: TRAFFIC_FLOW.laneSpeeds, meanHeadway: DENSITY_HEADWAY.high,
      minHeadway: TRAFFIC_FLOW.minHeadway, perLaneMax: TIER_DATA.features.high.traffic.perLaneMax, fade: TRAFFIC_FLOW.fade, classes, palette: PALETTE, halfLane: 3.0988 / 2 });
    sim.populate();
    const zAt = (l: number, s: number) => TrafficSim.direction(l) * (s - TRAFFIC_FLOW.laneLength / 2);
    const boxes = (dir: 1 | -1, z: number, out: TrafficBox[]) => sim.boxes(dir, z, 200, laneX, zAt, out);
    const pool: TrafficBox[] = [], all: TrafficBox[] = [];
    const car = startCar(BODY, boxes(1, D.start.z, pool)), acc = { t: 0 };
    const obstacle = (): SimObstacle => { const { ex, ez } = carExtents(car, BODY); return { x: car.x, z: car.z, halfWidth: ex, halfLength: ez, speed: car.speed, heading: car.dir }; };
    let overlaps = 0, contacts = 0, turned = 0, trafficBraked = 0, frames = 0;
    for (let frame = 0; frame < 240 * 60; frame++) {
      const t = frame / 60, phase = t % 20;
      // Full throttle with lane changes every few seconds, a hard stop, a short reverse and a hand-brake turn.
      const i = input({ throttle: phase < 12 || phase > 16 ? 1 : 0, steer: phase % 5 < .7 ? (Math.floor(t / 5) % 2 ? 1 : -1) : 0,
        brake: phase >= 12 && phase < 13.5 ? 1 : 0, reverse: phase >= 13.5 && phase < 15.5 ? 1 : 0, handbrake: phase >= 15.5 && phase < 16 });
      advanceCar(car, i, BODY, boxes(car.dir, car.z, pool), 1 / 60, acc);
      if (car.turnRequested) { turnAround(car, BODY, boxes(-car.dir as 1 | -1, car.z, pool)); turned++; }
      if (car.contact === 'traffic') contacts++;
      sim.step(1 / 60, obstacle(), laneX, zAt);
      frames++;
      for (const dir of [1, -1] as const) for (const b of sim.boxes(dir, car.z, 30, laneX, zAt, all)) if (overlapping(car, b)) overlaps++;
      for (let l = 0; l < 6; l++) for (const v of sim.lanes[l]!) if (v.brake > .5 && Math.abs(zAt(l, v.s) - car.z) < 120) trafficBraked++;
    }
    console.log(JSON.stringify({ frames, overlaps, contacts, turned, trafficBraked, z: +car.z.toFixed(1), dir: car.dir, vehicles: sim.count }));
    expect(overlaps).toBe(0);
    expect(contacts).toBeGreaterThan(0); expect(trafficBraked).toBeGreaterThan(0); expect(turned).toBeGreaterThanOrEqual(1);
    // Other traffic keeps flowing: vehicles far from the car are at cruising speed.
    const far = sim.lanes.flatMap((list, l) => list.filter(v => Math.abs(zAt(l, v.s) - car.z) > 400));
    expect(far.length).toBeGreaterThan(20);
    expect(far.filter(v => v.v > 15).length / far.length).toBeGreaterThan(.9);
  }, 60_000);
});
