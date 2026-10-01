// Measurement workloads (SPEC 20; src/camera/workloads.ts): the hero orbit keeps well clear of the
// terrain on the staged collision grid, sees its target without obstruction, stays inside the orbit
// rig's limits, and covers exactly one revolution per 60 s sample.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAMERA } from '../../src/constants';
import { FLIGHT_NAMES } from '../../src/params';
import { decodePng } from '../../src/world/png16';
import { heightFieldFromU16, sightlineClearance, surfaceHeight } from '../../src/world/heightfield';
import { FLYOVER_ORDER, GG_WORKLOADS, HERO_ORBIT, heroOrbitPosition } from '../../src/camera/workloads';
import { stagedDir } from '../../scripts/release';

const STAGED = stagedDir();

describe('performance workloads', () => {
  test('names and flyover order', () => {
    expect([...GG_WORKLOADS]).toEqual(['orbit', 'flyover', 'drive']);
    expect([...FLYOVER_ORDER].sort()).toEqual([...FLIGHT_NAMES].sort());
  });

  test('the hero orbit clears the terrain and the rig limits all the way round', async () => {
    const scene = JSON.parse(readFileSync(resolve(STAGED, 'data/scene.json'), 'utf8')) as { terrain: { collision: { path: string; bounds: [number, number, number, number]; metresPerUnit: number } } };
    const spec = scene.terrain.collision, bytes = readFileSync(resolve(STAGED, spec.path));
    const png = await decodePng(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const field = heightFieldFromU16(png.data as Uint16Array, png.width, png.height, spec.bounds, spec.metresPerUnit);
    let minTerrain = Infinity, minSightline = Infinity, minDistance = Infinity, maxDistance = 0;
    for (let i = 0; i < 720; i++) {
      const p = heroOrbitPosition(i * HERO_ORBIT.seconds / 720), c = HERO_ORBIT.center;
      minTerrain = Math.min(minTerrain, p[1] - surfaceHeight(field, p[0], p[2]));
      minSightline = Math.min(minSightline, sightlineClearance(field, p, c, 5).clearance);
      const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); minDistance = Math.min(minDistance, d); maxDistance = Math.max(maxDistance, d);
    }
    expect(minTerrain).toBeGreaterThan(90);
    expect(minSightline).toBeGreaterThan(80);
    expect(minDistance).toBeGreaterThan(CAMERA.orbit.minDistance);
    expect(maxDistance).toBeLessThan(CAMERA.orbit.maxDistance);
    expect(Math.max(Math.abs(HERO_ORBIT.center[0]), Math.abs(HERO_ORBIT.center[2]))).toBeLessThanOrEqual(CAMERA.orbit.targetBounds);
  });

  test('one revolution per 60 s sample', () => {
    const a = heroOrbitPosition(5), b = heroOrbitPosition(5 + HERO_ORBIT.seconds);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-6);
    expect(HERO_ORBIT.seconds).toBe(60);
  });
});
