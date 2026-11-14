import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { grassMottle, GROUND, groundGrit, meadowGeometry, roadGeometry } from '../src/ground';
import type { GroundMesh } from '../src/ground';
import { townLights } from '../src/glow';
import { DAY, DUSK } from '../src/light';
import { RAMP } from '../src/outskirts';
import type { Road, Threshold } from '../src/outskirts';
import { planTown } from '../src/plan/town-plan.js';
import { paintReflection, reflectionAt, skyAt, skyPaint, toLinear, toSrgb } from '../src/sky';
import type { Rgb } from '../src/sky';

const round = (values: readonly number[], places = 3) => values.map(value => Math.round(value * 10 ** places) / 10 ** places);

/** Every triangle's own normal agrees with the normal its corners state. */
function facesItsNormals(mesh: GroundMesh): void {
  for (let i = 0; i < mesh.index.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => mesh.index[i + k]! * 3) as [number, number, number];
    const u = [0, 1, 2].map(k => mesh.positions[b + k]! - mesh.positions[a + k]!), v = [0, 1, 2].map(k => mesh.positions[c + k]! - mesh.positions[a + k]!);
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    expect(n[0]! * mesh.normals[a]! + n[1]! * mesh.normals[a + 1]! + n[2]! * mesh.normals[a + 2]!).toBeGreaterThan(0);
  }
}

/** The height of the ground under a point, from the triangles that are not upright. */
function heightAt(mesh: GroundMesh, x: number, z: number): number | null {
  for (let i = 0; i < mesh.index.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => mesh.index[i + k]! * 3) as [number, number, number];
    const P = (o: number) => [mesh.positions[o]!, mesh.positions[o + 1]!, mesh.positions[o + 2]!] as const;
    const [pa, pb, pc] = [P(a), P(b), P(c)];
    const det = (pb[2] - pc[2]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[2] - pc[2]);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((pb[2] - pc[2]) * (x - pc[0]) + (pc[0] - pb[0]) * (z - pc[2])) / det, l2 = ((pc[2] - pa[2]) * (x - pc[0]) + (pa[0] - pc[0]) * (z - pc[2])) / det, l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * pa[1] + l2 * pb[1] + l3 * pc[1];
  }
  return null;
}

test('the meadow is flat grass up to the walls where no street leaves', () => {
  const mesh = meadowGeometry({ halfX: 40, halfZ: 60 }, [], 100);
  facesItsNormals(mesh);
  for (const [x, z] of [[0, -61], [0, 61], [-41, 0], [41, 0], [120, 150], [0, -159]] as const) expect(heightAt(mesh, x, z)).toBeCloseTo(GROUND.y);
  // Nothing is drawn under the town.
  expect(heightAt(mesh, 0, 0)).toBeNull();
  expect(heightAt(mesh, 39, -59)).toBeNull();
});

test('where a street leaves, the ground is left open for the road to climb through, with a stone face on each side', () => {
  const thresholds: Threshold[] = [{ x: 5, z: -60, dz: -1, half: 3, drop: 0.14 }, { x: -10, z: 60, dz: 1, half: 3.5, drop: 0.14 }];
  const mesh = meadowGeometry({ halfX: 40, halfZ: 60 }, thresholds, 100);
  facesItsNormals(mesh);
  // South: no ground across the street's width for the length of the climb, and grass either side.
  expect(heightAt(mesh, 5, -60.5)).toBeNull();
  expect(heightAt(mesh, 5, -60 - RAMP + 0.5)).toBeNull();
  expect(heightAt(mesh, 9, -61)).toBeCloseTo(GROUND.y);
  expect(heightAt(mesh, 1, -61)).toBeCloseTo(GROUND.y);
  expect(heightAt(mesh, 5, -60 - RAMP - 1)).toBeCloseTo(GROUND.y);
  // North is the mirror of it.
  expect(heightAt(mesh, -10, 60.5)).toBeNull();
  expect(heightAt(mesh, -10, 60 + RAMP + 1)).toBeCloseTo(GROUND.y);
  // Two faces a threshold: upright triangles from the carriageway's level to the grass.
  let banks = 0;
  for (let i = 0; i < mesh.index.length; i += 3) if (Math.abs(mesh.normals[mesh.index[i]! * 3]!) === 1) banks++;
  expect(banks).toBe(4);
});

test('a road is the street carried on: cambered setts between kerbs, climbing out of the town, with no kerb across another road', () => {
  const main: Road = { id: 'road-bS', half: 3, main: true, from: [0, -6.5], drop: 0.14, points: [[0, -10], [0, -20], [2, -30], [6, -40]] };
  const side: Road = { id: 'road-aS', half: 2.5, mouth: 3.2, main: false, from: [-20, -6.5], drop: 0.14, points: [[-20, -10], [-18, -20], [-6, -28], [2, -30]] };
  const sett = [0.2, 0.19, 0.18], kerb = [0.5, 0.49, 0.47];
  const { carriage, edging } = roadGeometry([main, side], sett, kerb);
  facesItsNormals(carriage);
  facesItsNormals(edging);
  // Each road has a row at the town's edge and one at each of its points: five corners across the setts, four a side for the edging.
  expect(carriage.positions.length / 3).toBe(2 * 5 * 5);
  expect(edging.positions.length / 3).toBe(2 * 5 * 8);
  const setts = (road: number, row: number) => Array.from({ length: 5 }, (_, k) => {
    const v = road * 25 + row * 5 + k;
    return { x: carriage.positions[v * 3]!, y: carriage.positions[v * 3 + 1]!, z: carriage.positions[v * 3 + 2]!, u: carriage.uvs[v * 2]!, v: carriage.uvs[v * 2 + 1]!, red: carriage.colors[v * 3]! };
  });
  // The setts start a little inside the town, tucked just under the street's own, so no crack shows at the join;
  // there the gutters are a hair under the street's and the middle higher by the camber.
  const edge = setts(0, 0), low = -0.14 - GROUND.tuckDrop;
  expect(round(edge.map(p => p.x))).toEqual([-3, -1.5, 0, 1.5, 3]);
  expect(round(edge.map(p => p.y), 4)).toEqual(round([low, low + GROUND.camber * 0.75, low + GROUND.camber, low + GROUND.camber * 0.75, low], 4));
  expect(edge.every(p => Math.abs(p.z - (-6.5 + GROUND.tuck)) < 1e-6 && p.u === 0 && Math.abs(p.red - sett[0]!) < 1e-6)).toBe(true);
  // By its first point it has climbed to the ground; texture coordinates are metres along and across.
  const up = setts(0, 1);
  expect(round(up.map(p => p.y), 4)).toEqual(round([0, 0.75, 1, 0.75, 0].map(k => GROUND.roadLift + GROUND.camber * k), 4));
  expect(round(up.map(p => p.u))).toEqual(Array(5).fill(round([3.5 + GROUND.tuck])[0]));
  expect(round(up.map(p => p.v))).toEqual([-3, -1.5, 0, 1.5, 3]);
  // A side road leaves the gate as wide as its street, keeps that width up the climb, then narrows to its own.
  expect(round(setts(1, 0).map(p => p.x + 20))).toEqual([-3.2, -1.6, 0, 1.6, 3.2]);
  const across = (row: { x: number; z: number }[]) => Math.hypot(row[4]!.x - row[0]!.x, row[4]!.z - row[0]!.z);
  expect(across(setts(1, 1))).toBeCloseTo(6.4, 5);
  expect(across(setts(1, 2))).toBeCloseTo(5, 5);
  expect(across(setts(0, 2))).toBeCloseTo(6, 5);
  // A side road lies a hair lower than the high road it runs into.
  expect(setts(1, 4)[0]!.y).toBeLessThan(setts(0, 4)[0]!.y);
  const kerbs = (road: number, row: number) => Array.from({ length: 8 }, (_, k) => {
    const v = road * 40 + row * 8 + k;
    return { x: edging.positions[v * 3]!, y: edging.positions[v * 3 + 1]!, alpha: edging.colors[v * 4 + 3]! };
  });
  // A kerb each side, as wide as the town's, level with the pavement at the town's edge; then a shoulder that fades out.
  const first = kerbs(0, 0);
  expect(round(first.map(p => Math.abs(p.x)))).toEqual(round([3, 3 + GROUND.kerb, 3 + GROUND.kerb + 0.04, 3 + GROUND.kerb + GROUND.edge, 3, 3 + GROUND.kerb, 3 + GROUND.kerb + 0.04, 3 + GROUND.kerb + GROUND.edge]));
  expect(first.map(p => p.alpha)).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
  expect(first[0]!.y).toBe(0);
  expect(kerbs(0, 1)[0]!.y).toBeCloseTo(GROUND.roadLift + GROUND.kerbRise, 6);
  // Where the side road ends inside the high road, it has no kerb; out in the field it has.
  expect(kerbs(1, 4).slice(0, 3).every(p => p.alpha === 0)).toBe(true);
  expect(kerbs(1, 1).map(p => p.alpha)).toEqual([1, 1, 1, 0, 1, 1, 1, 0]);
});

test('the ground mottling is the same bytes every time and repeats without a seam', () => {
  const size = 64, a = grassMottle(size), b = grassMottle(size);
  expect(createHash('sha256').update(a).digest('hex')).toBe(createHash('sha256').update(b).digest('hex'));
  let seam = 0, inside = 0;
  for (let j = 0; j < size; j++) {
    seam = Math.max(seam, Math.abs(a[(j * size) * 4 + 1]! - a[(j * size + size - 1) * 4 + 1]!));
    inside = Math.max(inside, Math.abs(a[(j * size + 20) * 4 + 1]! - a[(j * size + 21) * 4 + 1]!));
  }
  expect(seam).toBeLessThanOrEqual(inside + 16);
  const greens = [...a].filter((_, i) => i % 4 === 1);
  expect(Math.max(...greens) - Math.min(...greens)).toBeGreaterThan(90);
});

test('the grit underfoot is sharp from texel to texel, even on average and the same bytes every time', () => {
  const size = 64, a = groundGrit(size), b = groundGrit(size);
  expect(createHash('sha256').update(a).digest('hex')).toBe(createHash('sha256').update(b).digest('hex'));
  let sum = 0, step = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const value = a[(j * size + i) * 4 + 1]!;
      sum += value;
      step += Math.abs(value - a[(j * size + (i + 1) % size) * 4 + 1]!);
    }
  }
  // Far away it averages to no change at all; near to, neighbours differ visibly.
  expect(Math.abs(sum / (size * size) - 127.5)).toBeLessThan(6);
  expect(step / (size * size)).toBeGreaterThan(24);
});

test('the sky is the horizon colour low down and bluer overhead, and glass shows the street at eye level', () => {
  const paint = skyPaint(DAY), out: Rgb = [0, 0, 0];
  const away: [number, number, number] = [-DAY.sun[0], 0, -DAY.sun[2]], length = Math.hypot(away[0], away[2]);
  expect(round(skyAt(paint, away[0] / length, 0, away[2] / length, out))).toEqual(round(DAY.horizon.map(toLinear)));
  expect(round(skyAt(paint, away[0] / length * 0.9, -0.43, away[2] / length * 0.9, out))).toEqual(round(DAY.horizon.map(toLinear)));
  const up = [...skyAt(paint, 0, 1, 0, out)];
  expect(up[2]! / up[0]!).toBeGreaterThan(toLinear(DAY.horizon[2]) / toLinear(DAY.horizon[0]) * 2);
  expect(round(reflectionAt(paint, 1, 0, 0, out))).toEqual(round(DAY.street.map(toLinear)));
  expect(round(reflectionAt(paint, 0, 1, 0, out))).toEqual(round(up));
  expect(toSrgb(toLinear(0.5))).toBeCloseTo(0.5, 6);
});

test('the reflection picture has the street along its lower half and the hour in its sky', () => {
  const width = 32, height = 16, day = paintReflection(DAY, width, height, new Uint8Array(width * height * 4));
  const dusk = paintReflection(DUSK, width, height, new Uint8Array(width * height * 4));
  const texel = (bytes: Uint8Array, i: number, j: number) => [...bytes.subarray((j * width + i) * 4, (j * width + i) * 4 + 4)];
  expect(texel(day, 3, 2)).toEqual([...DAY.street.map(v => Math.round(v * 255)), 255]);
  // Straight up is bluer by day than at dusk.
  expect(texel(day, 3, height - 1)[2]!).toBeGreaterThan(texel(dusk, 3, height - 1)[2]! + 40);
});

test('no pool of light is laid outside the town', () => {
  for (const seed of ['2026', 'amberbridge', '7']) {
    const plan = planTown(seed, { dusk: true }), { x0, x1, length } = plan.town;
    for (const pool of townLights(plan).pools) {
      expect(pool.x > x0 && pool.x < x1 && pool.z > 0 && pool.z < length).toBe(true);
    }
  }
});
