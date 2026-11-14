import { expect, test } from 'bun:test';
import { nearestLanterns, placePoint, townLights } from '../src/glow';
import type { Lantern } from '../src/glow';
import type { TownPlacement, TownPlan } from '../src/plan/town-plan.js';
import { planTown } from '../src/plan/town-plan.js';

const place = (kit: string, values: TownPlacement['values'], pos: [number, number, number], yaw = 0): TownPlacement => ({ id: `${kit}-${pos.join('-')}`, kit, values, pos, yaw });
const plan = (placements: TownPlacement[]): TownPlan => ({ placements, town: { x0: -50, x1: 50, length: 100 } } as TownPlan);
const round = (values: number[]) => values.map(value => Math.round(value * 1000) / 1000);

test('a placement frame turns with its yaw the way the rows are laid', () => {
  expect(round(placePoint(place('ground-bay', {}, [10, 0, 20], 0), 1, 2))).toEqual([11, 22]);
  expect(round(placePoint(place('ground-bay', {}, [10, 0, 20], 90), 1, 2))).toEqual([12, 19]);
  expect(round(placePoint(place('ground-bay', {}, [10, 0, 20], 180), 1, 2))).toEqual([9, 18]);
  expect(round(placePoint(place('ground-bay', {}, [10, 0, 20], 270), 1, 2))).toEqual([8, 21]);
});

test('only lit lamps and lit fronts give light, each where it stands', () => {
  const lights = townLights(plan([
    place('street-lamp', { lit: true, arms: 'post', height: 4 }, [5, 0, 7]),
    place('street-lamp', { lit: false, arms: 'post', height: 4 }, [5, 0, 18]),
    place('street-lamp', { lit: true, arms: 'twin', height: 4.4 }, [9, 0, 7], 180),
    place('ground-bay', { lit: true, front: 'shopWindow', bayWidth: 2 }, [0, 0, 10], 0),
    place('ground-bay', { lit: true, front: 'passage', bayWidth: 2 }, [0, 0, 12], 0),
    place('ground-bay', { lit: false, front: 'shopWindow', bayWidth: 2 }, [0, 0, 14], 0),
    place('facade-bay', { lit: true }, [0, 3.4, 10], 0),
  ]));
  expect(lights.lanterns.map(l => round([l.x, l.y, l.z]))).toEqual([[5, 4.26, 7], [9, 4.76, 7]]);
  expect(lights.pools.map(p => [p.tint, ...round([p.x, p.z, p.out, p.along])])).toEqual([
    ['lamp', 5, 7, 5.4, 5.4],
    ['lamp', 9, 7, 6.4, 6.4],
    // In front of the window, half the bay along the row.
    ['window', 1.5, 11, 2.3, 1.44],
  ]);
});

test('a dusk town has light on every street and none by day', () => {
  const dusk = townLights(planTown('2026', { dusk: true })), day = townLights(planTown('2026', { dusk: false }));
  expect([day.pools.length, day.lanterns.length]).toEqual([0, 0]);
  expect(dusk.lanterns.length).toBeGreaterThan(20);
  expect(dusk.pools.length).toBeGreaterThan(dusk.lanterns.length + 40);
});

test('the nearest lanterns get the lights, and a slot only changes lantern while dark', () => {
  const row: Lantern[] = Array.from({ length: 8 }, (_, i) => ({ x: 0, y: 4, z: i * 11 }));
  const slots = new Int32Array(3).fill(-1), strength = new Float32Array(3);
  let previous = [...slots];
  for (let z = -10; z <= 90; z += 0.25) {
    nearestLanterns(row, [2, 1.65, z], slots, strength);
    slots.forEach((lantern, s) => {
      // A slot that moved to another lantern was dark on the frame it moved; the first frame fills them all.
      if (previous[s] !== -1 && previous[s] !== lantern) expect(strength[s]!).toBeLessThan(0.08);
    });
    expect(new Set(slots).size).toBe(3);
    expect(Math.max(...strength)).toBeGreaterThan(0.6);
    previous = [...slots];
  }
});

test('far from every lantern nothing is lit', () => {
  const slots = new Int32Array(2).fill(-1), strength = new Float32Array(2);
  nearestLanterns([{ x: 0, y: 4, z: 0 }, { x: 0, y: 4, z: 11 }, { x: 0, y: 4, z: 22 }], [0, 80, -120], slots, strength);
  expect([...strength]).toEqual([0, 0]);
});
