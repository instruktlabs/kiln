// The drive (TASK-FF-CAMPUS-1 item 5): data/driving.json keeps Golden Gate's driving values where the campus has no
// reason to differ; the sedan starts in its lane, stops before a road end and turns around there, holds the curb
// clearance, and offers Enter only stopped under the south-west canopy; the traffic is deterministic, keeps its gaps,
// fades only at the lane ends and stops for the car; the drive check's paths are the traffic's lanes; and the drive
// check over the whole route and every lane passes and equals evidence/drive/contact.json.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCampus } from '../../src/campus/data';
import { advanceCar, createCarWorld, footprintCentre, inEnterZone, placeCar, startCar, stepCar, turnAround } from '../../src/campus/drive/car';
import type { CarInput, CarState } from '../../src/campus/drive/car';
import { parseDriving, VEHICLE_TYPES } from '../../src/campus/drive/driving';
import { ringPath } from '../../src/campus/drive/route';
import { checkLaneFade, HARD_GAP, trafficClasses, TrafficSim } from '../../src/campus/drive/traffic-sim';
import { lanePoint, newLanePoint } from '../../src/campus/roads';
import { runDriveCheck, vehicleBodies } from '../../scripts/drive-check';

const PACKAGE = resolve(import.meta.dir, '../..'), SCENES = resolve(PACKAGE, '../..');
const campus = parseCampus(readFileSync(resolve(PACKAGE, 'data/campus.json'))), D = parseDriving(readFileSync(resolve(PACKAGE, 'data/driving.json')));
const bodies = vehicleBodies(), body = bodies[D.vehicle], world = createCarWorld(campus, D);
const S = campus.roads.split, LANE_V = S.lanes.firstCentre + S.lanes.width;
const IDLE: CarInput = { throttle: 0, reverse: 0, steer: 0, brake: 0, handbrake: false };
const deg = (d: number) => (d * Math.PI) / 180;
const run = (car: CarState, input: Partial<CarInput>, seconds: number, each?: (c: CarState) => void) => {
  const acc = { t: 0 };
  for (let t = 0; t < seconds; t += 1 / 60) { advanceCar(car, { ...IDLE, ...input }, body, world, [], 1 / 60, acc); each?.(car); }
  return car;
};
const newSim = (tier = campus.tiers.high) => new TrafficSim({
  lanes: campus.lanes, flow: D.flow, classes: trafficClasses(D.flow, [...VEHICLE_TYPES], type => bodies[type]),
  meanHeadway: tier.trafficHeadway, perLaneMax: tier.trafficPerLane, halfLane: S.lanes.width / 2,
});

describe('driving data (Golden Gate conventions)', () => {
  test('the car values, controls and curb are Golden Gate\'s; the start lies in the split road; the lane fade fits the dissolve', () => {
    const gg = JSON.parse(readFileSync(resolve(SCENES, 'packages/golden-gate/data/driving.json'), 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const key of ['vehicle', 'paint', 'topSpeed', 'accel', 'reverse', 'brake', 'handbrake', 'coast', 'curb', 'controls'] as const) expect({ key, value: D[key] }).toEqual({ key, value: gg[key] });
    expect(D.steer.wheelDeg).toEqual(gg.steer.wheelDeg);
    expect(D.start.speed).toBe(gg.start.speed);
    const { range: _range, ...traffic } = D.traffic;
    expect(traffic).toEqual(gg.traffic);
    // The stop under the arrival canopy is the one recorded difference in the road-end values (Golden Gate 30 m).
    expect({ ...D.roadEnd, stopDistance: gg.roadEnd.stopDistance }).toEqual(gg.roadEnd);
    const lane = campus.lanes.find(l => l.id === D.start.lane)!;
    expect(lane.direction).toBe('north');
    expect(D.start.window[0]).toBeGreaterThan(-S.carEnd + D.roadEnd.stopDistance);
    expect(D.start.window[1]).toBeLessThan(-campus.roads.roundabout.radius);
    expect(() => checkLaneFade(D.flow, S.dissolve)).not.toThrow();
  });
});

describe('the car', () => {
  test('starts in its lane inside the start window, rolling at the start speed, clear of the traffic', () => {
    const sim = newSim(); sim.populate();
    const [w0, w1] = D.start.window, boxes = sim.boxes((w0 + w1) / 2, 0, (w1 - w0) / 2 + D.traffic.range);
    const car = startCar(world, body, boxes), [cu, cv] = footprintCentre(car, body);
    expect(cu).toBeGreaterThanOrEqual(w0); expect(cu).toBeLessThanOrEqual(w1);
    expect(cv).toBeGreaterThan(0);
    expect(car.heading).toBeCloseTo(0, 9);
    expect(car.speed).toBeGreaterThan(0); expect(car.speed).toBeLessThanOrEqual(D.start.speed);
    for (const b of boxes) if (Math.abs(b.v - cv) < body.width / 2 + b.halfWidth) expect(Math.abs(b.u - cu)).toBeGreaterThan(body.length / 2 + b.halfLength);
  });

  test('stops stopDistance before the split road\'s north end, turns around when the throttle is held there, and faces back at rest', () => {
    const car = placeCar(S.carEnd - D.roadEnd.stopDistance - 60, LANE_V, 0, 12, body);
    let asked = false;
    run(car, { throttle: 1 }, 20, c => { if (c.turnRequested) asked = true; });
    expect(asked).toBe(true);
    const lead = footprintCentre(car, body)[0] + body.length / 2;
    expect(lead).toBeLessThanOrEqual(S.carEnd - D.roadEnd.stopDistance + 1e-6);
    expect(lead).toBeGreaterThan(S.carEnd - D.roadEnd.stopDistance - 0.1);
    expect(turnAround(car, body, world, [])).toBe(true);
    const [cu, cv] = footprintCentre(car, body);
    expect(Math.abs(car.heading)).toBeCloseTo(Math.PI, 9);
    expect(cv).toBeLessThan(0);
    expect(car.speed).toBe(0);
    expect(cu + body.length / 2).toBeLessThanOrEqual(S.carEnd - D.roadEnd.stopDistance + 1e-6);
  });

  test('reverse held at rest facing a road end asks to turn around instead of reversing (the touch rule)', () => {
    const car = placeCar(S.carEnd - D.roadEnd.stopDistance - 40, LANE_V, 0, 0, body);
    let asked = false;
    run(car, { reverse: 1 }, D.roadEnd.holdSeconds + 0.2, c => { if (c.turnRequested) asked = true; });
    expect(asked).toBe(true);
    expect(car.speed).toBe(0);
  });

  test('steered into the edge it holds the curb clearance inside the drivable area, bumps and follows the edge', () => {
    const car = placeCar(-3000, S.halfWidth - 3, 0, 20, body);
    let curb = 0, worst = -Infinity;
    const pts: [number, number][] = [];
    run(car, { throttle: 0.6, steer: 1 }, 6, c => {
      if (c.contact === 'curb') curb++;
      const fu = Math.cos(c.heading), fv = Math.sin(c.heading), [cu, cv] = footprintCentre(c, body), hl = body.length / 2, hw = body.width / 2;
      pts.length = 0;
      for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) pts.push([cu + a * hl * fu - b * hw * fv, cv + a * hl * fv + b * hw * fu]);
      for (const [u, v] of pts) worst = Math.max(worst, world.drivable.sdf(u, v));
    });
    expect(curb).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(-D.curb.clearance + 1e-6);
    expect(Math.abs(car.heading)).toBeLessThan(deg(20));
    expect(car.speed).toBeGreaterThan(5);
  });

  test('offers Enter only inside the drop-off zone at no more than its speed', () => {
    const z = campus.interior.enterZone, mid = (z.u[0] + z.u[1]) / 2;
    expect(inEnterZone(world, placeCar(mid, -LANE_V, Math.PI, 0, body), body)).toBe(true);
    expect(inEnterZone(world, placeCar(mid, -LANE_V, Math.PI, z.maxSpeed + 0.5, body), body)).toBe(false);
    expect(inEnterZone(world, placeCar(z.u[1] + 20, LANE_V, 0, 0, body), body)).toBe(false);
    // The footprint stopped at the south end stop is inside the zone (the car stops under the canopy).
    const stopped = placeCar(-S.carEnd + D.roadEnd.stopDistance + body.length / 2, -LANE_V, Math.PI, 0, body);
    expect(inEnterZone(world, stopped, body)).toBe(true);
  });

  test('the step is deterministic', () => {
    const drive = () => run(placeCar(-3000, LANE_V, 0, 10, body), { throttle: 1, steer: -0.3 }, 5);
    expect(drive()).toEqual(drive());
    const a = placeCar(-3000, LANE_V, 0, 10, body), b = placeCar(-3000, LANE_V, 0, 10, body);
    for (let i = 0; i < 600; i++) { stepCar(a, { ...IDLE, throttle: 1 }, body, world, []); stepCar(b, { ...IDLE, throttle: 1 }, body, world, []); }
    expect(a).toEqual(b);
  });
});

describe('the traffic', () => {
  test('is deterministic, keeps each type in its lanes, never closes below the hard gap and fades only at the lane ends', () => {
    const a = newSim(), b = newSim();
    a.populate(); b.populate();
    const lanesOf = new Map(VEHICLE_TYPES.map(type => [type, D.flow.vehicles[type]!.lanes]));
    const classes = a.o.classes;
    let fading = 0;
    for (let i = 0; i < 30 * 60; i++) {
      a.step(1 / 30); b.step(1 / 30);
      if (i % 30) continue;
      a.lanes.forEach((list, li) => {
        const lane = campus.lanes[li]!;
        list.forEach((car, k) => {
          expect(lanesOf.get(classes[car.cls]!.name)).toContain(lane.index);
          if (k > 0) { const lead = list[k - 1]!; expect(lead.s - classes[lead.cls]!.length / 2 - (car.s + classes[car.cls]!.length / 2)).toBeGreaterThanOrEqual(HARD_GAP - 1e-9); }
          if (car.fade < 1) { fading++; expect(car.s < D.flow.fade + 1e-6 || car.s > lane.length - D.flow.fade - 1e-6).toBe(true); }
        });
      });
    }
    expect(fading).toBeGreaterThan(0);
    expect(a.lanes.map(l => l.map(c => [c.id, c.s, c.v]))).toEqual(b.lanes.map(l => l.map(c => [c.id, c.s, c.v])));
  });

  test('stops behind the viewer\'s car standing in its lane', () => {
    const sim = newSim(); sim.populate();
    const li = campus.lanes.findIndex(l => l.id === D.start.lane), lane = campus.lanes[li]!;
    const at = lanePoint(lane, 3000, newLanePoint());
    const obstacle = { u: at.u, v: at.v, heading: at.heading, halfLength: body.length / 2, halfWidth: body.width / 2, speed: 0 };
    for (let t = 0; t < 240; t += 1 / 30) sim.step(1 / 30, obstacle);
    const behind = sim.lanes[li]!.filter(c => c.s < 3000);
    expect(behind.length).toBeGreaterThan(0);
    const next = behind[0]!, cls = sim.o.classes[next.cls]!;
    expect(3000 - body.length / 2 - (next.s + cls.length / 2)).toBeGreaterThanOrEqual(HARD_GAP - 1e-9);
    expect(next.v).toBeLessThan(0.5);
  });
});

describe('the drive check', () => {
  test('its south-to-north path through the roundabout is the traffic lane of the same lane index', () => {
    for (let k = 0; k < S.lanes.perDirection; k++) {
      const path = ringPath(campus.roads, 'south', 'north', k), lane = campus.lanes.find(l => l.id === `nb-${k}`)!;
      // data/campus.json stores lane geometry in millimetres.
      expect(Math.abs(path.length - lane.length)).toBeLessThan(1e-3);
      const p = newLanePoint(), q = newLanePoint();
      for (let s = 0; s <= lane.length; s += 97) {
        lanePoint(path, s, p); lanePoint(lane, s, q);
        expect(Math.hypot(p.u - q.u, p.v - q.v)).toBeLessThan(2e-3);
      }
    }
  });

  // Measured 2026-09-30: the whole route in two lanes and the eight lanes at 0.25 m, within the 4 s this file takes on
  // this PC; the budget leaves room for a slower runner.
  test('passes over the whole route and every lane, and equals evidence/drive/contact.json', () => {
    const report = runDriveCheck();
    expect(report.ok).toBe(true);
    for (const route of report.car.routes) {
      expect(route.completed).toBe(true);
      expect(route.steps.missing).toBe(0);
      expect(route.curbSteps).toBe(0);
    }
    expect(report.traffic.steps.missing).toBe(0);
    expect(JSON.parse(JSON.stringify(report))).toEqual(JSON.parse(readFileSync(resolve(PACKAGE, 'evidence/drive/contact.json'), 'utf8')));
  }, 60_000);
});
