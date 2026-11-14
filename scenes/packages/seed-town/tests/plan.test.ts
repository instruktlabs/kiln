import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { planTown } from '../src/plan/town-plan.js';
import { buildingBoxes, sidePoint, START_OUT, townFrame } from '../src/layout';
import { cleanSeed, createSession, DEFAULT_SEED, freshSeed, MAX_SEED_LENGTH } from '../src/session';
import { blendHours, DAY, DUSK } from '../src/light';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// The planner here is a copy of the one the kits were built and checked with. These are the plans
// that planner gives for the seeds whose baked towns were measured, so a drifted copy fails here.
const KNOWN: [string, boolean, number, number, string][] = [
  ['2026', false, 1632, 58, 'a065fa45db726201'],
  ['2026', true, 1632, 58, '76f86cf62244ae0f'],
  ['7', false, 1596, 58, 'e2bb88d7ae6d07a3'],
  ['1', false, 1716, 58, 'c2f03e8f595c88ab'],
  ['amberbridge', true, 1604, 56, '44379e8362440137'],
];

test('the planner gives the measured towns for their seeds', () => {
  for (const [seed, dusk, placements, buildings, hash] of KNOWN) {
    const plan = planTown(seed, { dusk });
    expect([seed, plan.placements.length, plan.town.buildings, digest(plan.placements)]).toEqual([seed, placements, buildings, hash]);
  }
});

test('a seed is a string or a number, and the same seed is the same town', () => {
  expect(digest(planTown(2026).placements)).toBe(digest(planTown('2026').placements));
  expect(digest(planTown('2026').placements)).not.toBe(digest(planTown('2027').placements));
});

test('dusk lights windows and lamps and moves nothing', () => {
  const day = planTown('7'), dusk = planTown('7', { dusk: true });
  expect(dusk.placements.length).toBe(day.placements.length);
  let lit = 0;
  day.placements.forEach((place, i) => {
    const other = dusk.placements[i]!;
    expect([other.id, other.kit, other.pos, other.yaw]).toEqual([place.id, place.kit, place.pos, place.yaw]);
    for (const [name, value] of Object.entries(place.values)) {
      if (name === 'lit') { if (other.values.lit === true) lit += 1; expect(value).toBe(false); } else expect(other.values[name]).toBe(value);
    }
  });
  expect(lit).toBeGreaterThan(300);
});

test('any text a visitor types plans a town', () => {
  const seeds = ['', ' ', '0', 'Ünïcödé 城', '<script>', 'a'.repeat(MAX_SEED_LENGTH), ...Array.from({ length: 150 }, (_, i) => `seed-${i}`)];
  for (const raw of seeds) {
    const plan = planTown(cleanSeed(raw));
    expect(plan.placements.length).toBeGreaterThan(1200);
    expect(plan.town.buildings).toBeGreaterThan(40);
    // One check a plan, not one a coordinate: two million checks ran past the budget on a busy machine.
    expect(plan.placements.filter(place => !place.pos.every(Number.isFinite)).map(place => place.id)).toEqual([]);
  }
});

test('the town stands centred on the scene origin and a visitor starts on the road into the high street', () => {
  const plan = planTown('2026'), frame = townFrame(plan);
  expect(frame.offset[0]).toBeCloseTo(-(plan.town.x0 + plan.town.x1) / 2, 9);
  expect(frame.offset[2]).toBeCloseTo(-plan.town.length / 2, 9);
  expect(frame.halfX * 2).toBeCloseTo(plan.town.x1 - plan.town.x0, 9);
  const street = plan.streets[1]!;
  expect(frame.start.x).toBeCloseTo(street.x + frame.offset[0], 9);
  // Outside the south end, which is open: the high street runs through the town.
  expect(plan.ends.find(end => end.street === street.name && end.end === 'S')!.open).toBe(true);
  expect(frame.start.z).toBeCloseTo(-frame.halfZ - START_OUT, 9);
  expect(frame.views.map(view => view.id)).toContain('SQUARE');
  expect(frame.views.every(view => view.label.length > 0)).toBe(true);
});

test('each building has one box, inside the town, and no two boxes overlap', () => {
  for (const seed of ['2026', '7', '1']) {
    const plan = planTown(seed), boxes = buildingBoxes(plan);
    expect(boxes.length).toBe(plan.town.buildings);
    for (const box of boxes) {
      expect(box.minX).toBeGreaterThanOrEqual(plan.town.x0 - 1e-9);
      expect(box.maxX).toBeLessThanOrEqual(plan.town.x1 + 1e-9);
      expect(box.minZ).toBeGreaterThanOrEqual(-8 - 1e-9);
      expect(box.maxZ).toBeLessThanOrEqual(plan.town.length + 8 + 1e-9);
      expect(box.maxY).toBeGreaterThan(5);
    }
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const overlapX = Math.min(boxes[a]!.maxX, boxes[b]!.maxX) - Math.max(boxes[a]!.minX, boxes[b]!.minX);
      const overlapZ = Math.min(boxes[a]!.maxZ, boxes[b]!.maxZ) - Math.max(boxes[a]!.minZ, boxes[b]!.minZ);
      expect(overlapX > 1e-6 && overlapZ > 1e-6).toBe(false);
    }
  }
});

test('a row frame turns local coordinates the way the planner does', () => {
  const side = (yaw: number) => ({ name: 'r', mode: 'street' as const, frame: { origin: [10, 0, 20] as [number, number, number], yaw, pavement: 2.4, road: 3 }, buildings: [] });
  expect(sidePoint(side(0), 1, 2)).toEqual([11, 22]);
  expect(sidePoint(side(180), 1, 2)).toEqual([9, 18]);
  expect(sidePoint(side(90), 1, 2)).toEqual([12, 19]);
  expect(sidePoint(side(270), 1, 2)).toEqual([8, 21]);
  expect(() => sidePoint(side(45), 1, 2)).toThrow('45 degrees');
});

test('a seed is cleaned once, and the session tells its listeners only of a change', () => {
  expect(cleanSeed('  old   town \n')).toBe('old town');
  expect(cleanSeed('   ')).toBe(DEFAULT_SEED);
  expect(cleanSeed('x'.repeat(90)).length).toBe(MAX_SEED_LENGTH);
  const session = createSession({ seed: ' 7 ' });
  let calls = 0;
  const stop = session.subscribe(() => { calls += 1; });
  expect(session.getState()).toEqual({ seed: '7', dusk: false });
  session.set({ seed: '7' });
  expect(calls).toBe(0);
  session.set({ dusk: true });
  session.set({ seed: 'market row' });
  expect(calls).toBe(2);
  expect(session.getState()).toEqual({ seed: 'market row', dusk: true });
  stop();
  session.set({ dusk: false });
  expect(calls).toBe(2);
});

test('a fresh seed is a readable name and never the one that stands', () => {
  let n = 0;
  const steps = [0.01, 0.01, 0.5, 0.5];
  const seed = freshSeed(() => steps[n++ % steps.length]!, 'amberbridge');
  expect(seed).not.toBe('amberbridge');
  expect(seed).toMatch(/^[a-z]+$/);
  expect(freshSeed(() => 0.999999)).toMatch(/^[a-z]+$/);
  expect(freshSeed(() => 0, 'amberbridge')).toBe('amberbridge-2');
});

test('the light turns from day to dusk through unit sun directions', () => {
  expect(blendHours(DAY, DUSK, 0)).toEqual(DAY);
  expect(blendHours(DAY, DUSK, 1)).toEqual(DUSK);
  for (const t of [0.1, 0.5, 0.9]) {
    const now = blendHours(DAY, DUSK, t);
    expect(Math.hypot(...now.sun)).toBeCloseTo(1, 9);
    expect(now.sun[1]).toBeGreaterThan(0);
    expect(now.sunIntensity).toBeLessThan(DAY.sunIntensity);
    expect(now.sunIntensity).toBeGreaterThan(DUSK.sunIntensity);
  }
});
