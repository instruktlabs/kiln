import { describe, expect, test } from 'bun:test';
import { TrafficSim } from '../../src/traffic/sim';
import type { SimObstacle, TrafficSimOptions } from '../../src/traffic/sim';
import { DENSITY_HEADWAY, PALETTE, TRAFFIC_FLOW, trafficClasses } from '../../src/traffic/config';
import { VEHICLE_TYPES } from '../../src/traffic/vehicle-models';
import { laneX } from '../../src/constants';
import { TIER_DATA } from '../../src/data';
import { DIMS } from './helpers/vehicle-dims';

const classes = trafficClasses(VEHICLE_TYPES, t => DIMS[t]), PER_LANE_MAX = TIER_DATA.features.high.traffic.perLaneMax;
/** Steady vehicle count at a density: every lane's length over its spacing (cruising speed x mean headway). */
const steadyCount = (density: keyof typeof DENSITY_HEADWAY) => 2 * TRAFFIC_FLOW.laneSpeeds.reduce((n, v) => n + TRAFFIC_FLOW.laneLength / (v * DENSITY_HEADWAY[density]), 0);
function options(density: keyof typeof DENSITY_HEADWAY = 'high', seed: number = TRAFFIC_FLOW.seed): TrafficSimOptions {
  return { seed, laneLength: TRAFFIC_FLOW.laneLength, laneSpeeds: TRAFFIC_FLOW.laneSpeeds, meanHeadway: DENSITY_HEADWAY[density], minHeadway: TRAFFIC_FLOW.minHeadway,
    perLaneMax: PER_LANE_MAX, fade: TRAFFIC_FLOW.fade, classes, palette: PALETTE };
}
const zAt = (lane: number, s: number) => TrafficSim.direction(lane) * (s - TRAFFIC_FLOW.laneLength / 2);
/** Bumper-to-bumper gaps between consecutive vehicles in every lane. */
function gaps(sim: TrafficSim): number[] {
  const out: number[] = [];
  for (const lane of sim.lanes) for (let i = 1; i < lane.length; i++) {
    const lead = lane[i - 1]!, car = lane[i]!;
    out.push(lead.s - classes[lead.cls]!.length / 2 - (car.s + classes[car.cls]!.length / 2));
  }
  return out;
}

describe('traffic simulation (lanes over the whole route)', () => {
  test('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number) => { const sim = new TrafficSim(options('high', seed)); sim.populate(); for (let i = 0; i < 600; i++) sim.step(1 / 60); return JSON.stringify(sim.lanes); };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  test('flows freely: natural spacing, highway speeds, no queues, recycling at the ends', () => {
    const sim = new TrafficSim(options('high')); sim.populate();
    let minGap = Infinity, minRatio = Infinity, maxRatio = 0, braking = 0, samples = 0, minCount = Infinity, maxCount = 0;
    for (let second = 0; second < 600; second++) {
      for (let i = 0; i < 30; i++) sim.step(1 / 30);
      minGap = Math.min(minGap, ...gaps(sim));
      minCount = Math.min(minCount, sim.count); maxCount = Math.max(maxCount, sim.count);
      for (const lane of sim.lanes) for (const car of lane) {
        const ratio = car.v / TRAFFIC_FLOW.laneSpeeds[car.lane % 3]!; samples++;
        minRatio = Math.min(minRatio, ratio); maxRatio = Math.max(maxRatio, ratio); if (car.brake > .5) braking++;
        expect(car.s).toBeGreaterThanOrEqual(0); expect(car.s).toBeLessThan(TRAFFIC_FLOW.laneLength);
      }
    }
    console.log(JSON.stringify({ minGap: +minGap.toFixed(1), minRatio: +minRatio.toFixed(3), maxRatio: +maxRatio.toFixed(3), braking, samples, spawned: sim.spawned, removed: sim.removed, minCount, maxCount, steady: +steadyCount('high').toFixed(1) }));
    expect(minGap).toBeGreaterThan(18);
    expect(minRatio).toBeGreaterThan(.88);
    expect(maxRatio).toBeLessThan(1.05);
    expect(braking).toBe(0); // brake lights are incidental: free flow never shows them
    expect(sim.spawned).toBeGreaterThan(400); expect(sim.removed).toBeGreaterThan(400);
    // Fix round 2 doubled the lanes (approach end to approach end) and the per-lane cap with them: the
    // count stays near the steady count and no lane reaches its cap.
    expect(minCount).toBeGreaterThan(.7 * steadyCount('high')); expect(maxCount).toBeLessThan(6 * PER_LANE_MAX);
  });

  test('density is a knob: fewer vehicles at medium and low', () => {
    const count = (density: keyof typeof DENSITY_HEADWAY) => { const sim = new TrafficSim(options(density)); sim.populate(); let n = 0; for (let s = 0; s < 200; s++) { sim.step(1); n += sim.count; } return n / 200; };
    const high = count('high'), medium = count('medium'), low = count('low');
    console.log(JSON.stringify({ high, medium, low }));
    expect(medium).toBeLessThan(high * .8); expect(low).toBeLessThan(medium * .75); expect(low).toBeGreaterThan(.7 * steadyCount('low'));
  });

  test('never repeats the colour of the car ahead, and keeps trucks and buses out of the inner lanes', () => {
    const sim = new TrafficSim(options('high')); sim.populate();
    const used = new Set<number>();
    for (let second = 0; second < 300; second++) {
      sim.step(1);
      for (const lane of sim.lanes) for (let i = 0; i < lane.length; i++) {
        const car = lane[i]!; used.add(car.paint);
        if (i > 0) expect(car.paint).not.toBe(lane[i - 1]!.paint);
        if (car.lane % 3 === 0) expect(['box-truck', 'transit-bus']).not.toContain(classes[car.cls]!.name);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(9);
  });

  test('brakes for the player car without passing through it, then flows again', () => {
    const sim = new TrafficSim(options('high')); sim.populate();
    const lane = 1, player: SimObstacle = { x: laneX(lane), z: 0, halfWidth: .95, halfLength: 2.45, speed: 0, heading: 1 };
    const playerS = player.z + TRAFFIC_FLOW.laneLength / 2;
    const behind = () => sim.lanes[lane]!.filter(car => car.s < playerS);
    let brakeSeen = false;
    for (let t = 0; t < 90 * 30; t++) {
      sim.step(1 / 30, player, laneX, zAt);
      for (const car of behind()) {
        expect(car.s + classes[car.cls]!.length / 2).toBeLessThan(playerS - player.halfLength);
        if (car.brake > .5) brakeSeen = true;
      }
    }
    const nearest = behind()[0]!;
    expect(nearest.v).toBeLessThan(.2);
    expect(playerS - player.halfLength - (nearest.s + classes[nearest.cls]!.length / 2)).toBeGreaterThan(2);
    expect(brakeSeen).toBe(true);
    // Other lanes keep flowing past.
    for (const other of [0, 2]) for (const car of sim.lanes[other]!) expect(car.v).toBeGreaterThan(15);
    // The player drives away: the queue clears.
    for (let t = 0; t < 120 * 30; t++) sim.step(1 / 30, null);
    for (const car of sim.lanes[lane]!) expect(car.v).toBeGreaterThan(15);
  });
});
