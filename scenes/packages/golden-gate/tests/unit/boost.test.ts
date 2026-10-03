import { expect, test } from 'bun:test';
import { DRIVING_DATA } from '../../src/data';
import { LAYOUT } from '../../scripts/authored-layout';
import { createCar, stepCar, type CarInput } from '../../src/play/car';
import { DIMS } from './helpers/vehicle-dims';

const body = DIMS.sedan;
const lane = LAYOUT.lanes.find(value => value.id === 'nb-middle')!.x;
const input = (boost: boolean): CarInput => ({ throttle: 1, reverse: 0, steer: 0, brake: 0, handbrake: false, boost } as CarInput);
test('holding boost increases forward acceleration and speed without changing normal driving', () => {
  const normal = createCar(1, lane, -900, 0), boosted = createCar(1, lane, -900, 0);
  for (let i = 0; i < 5 * 120; i++) { stepCar(normal, input(false), body, []); stepCar(boosted, input(true), body, []); }
  expect(boosted.speed).toBeGreaterThan(normal.speed + 3);
  expect(normal.speed).toBeLessThan(DRIVING_DATA.topSpeed);
  for (let i = 0; i < 25 * 120; i++) stepCar(boosted, input(true), body, []);
  expect(boosted.speed).toBeGreaterThan(DRIVING_DATA.topSpeed + 5);
});
test('boost still respects service brakes and traffic stopping clearance', () => {
  const car = createCar(1, lane, -900, 35);
  const obstacle = { x: lane, z: -700, halfWidth: 1, halfLength: 3, speed: 0, heading: 1 as const };
  for (let i = 0; i < 20 * 120; i++) stepCar(car, input(true), body, [obstacle]);
  expect(car.z + body.length / 2).toBeLessThanOrEqual(obstacle.z - obstacle.halfLength - DRIVING_DATA.traffic.minGap + 1e-6);
  const stopped = createCar(1, lane, -900, 35);
  for (let i = 0; i < 10 * 120; i++) stepCar(stopped, { ...input(true), throttle: 0, brake: 1 }, body, []);
  expect(stopped.speed).toBe(0);
});
