import { expect, test } from 'bun:test';
import { EYE_HEIGHT, ORBIT_VIEW, START, TOWN_COUNTS, lookDirection, placements, westWallCovers } from '../src/layout';
import manifest from '../ASSET-MANIFEST.json';

await import('three');
const { buildRouteCollision, colliderTriangles } = await import('../src/colliders');
const { driveCapsule, eyePosition, walkIntoTheNave, walkOutToTheStreet } = await import('../src/walk');
const { Vector3 } = await import('three/webgpu');

test('the film town is the live layout and the walk faces the west doors', () => {
  expect(EYE_HEIGHT).toBe(1.7);
  expect(TOWN_COUNTS).toEqual({ houses: 2532, props: 287, streets: 369, lanes: 79, blocks: 156 });
  expect(placements).toHaveLength(TOWN_COUNTS.houses + TOWN_COUNTS.props);
  expect(START.x).toBeGreaterThan(66.4);
  expect(START.z).toBe(0);
  const look = lookDirection(START.yaw);
  expect(look.x).toBeCloseTo(-1, 6);
  expect(look.z).toBeCloseTo(0, 6);
  expect(ORBIT_VIEW.position[0]).toBeGreaterThan(158);
  expect(ORBIT_VIEW.target[0] - ORBIT_VIEW.position[0]).toBeLessThan(0);
  expect(westWallCovers(0)).toBe(false);
  expect(westWallCovers(-13.5)).toBe(false);
  expect(westWallCovers(13.5)).toBe(false);
  expect(westWallCovers(8)).toBe(true);
  const placed = new Set(placements.map(place => place.key));
  expect(placed.has('young-man')).toBe(false);
  expect(placed.has('horse-cart')).toBe(false);
  const ids = new Set(manifest.assets.map(asset => asset.id));
  expect(ids.has('cathedral')).toBe(true);
  expect(ids.has('ground')).toBe(true);
  expect(ids.has('young-man')).toBe(false);
  expect(ids.has('horse-cart')).toBe(false);
  for (const key of placed) expect(ids.has(key)).toBe(true);
  expect(manifest.excluded).toContain('young man');
  expect(manifest.excluded).toContain('horse cart');
});

test('the capsule walks in from the parvis and out to the axial street', () => {
  const world = buildRouteCollision();
  try {
    const triangles = colliderTriangles(world);
    expect(world.colliders).toHaveLength(1);
    expect(triangles).toBeGreaterThan(30000);
    expect(triangles).toBeLessThan(40000);
    const into = walkIntoTheNave(world);
    expect(into.stuck).toBe(false);
    expect(into.fell).toBe(false);
    expect(into.sawDoor).toBe(true);
    expect(into.endX).toBeLessThan(30);
    expect(Math.abs(into.endZ)).toBeLessThan(1.2);
    expect(into.doorZ).not.toBeNull();
    expect(Math.abs(into.doorZ!)).toBeLessThan(1.2);
    const out = walkOutToTheStreet(world);
    expect(out.stuck).toBe(false);
    expect(out.fell).toBe(false);
    expect(out.sawDoor).toBe(true);
    expect(out.endX).toBeGreaterThanOrEqual(190);
    expect(Math.abs(out.endZ)).toBeLessThan(1.5);
    expect(Math.abs(out.eyeY - (out.endY + EYE_HEIGHT))).toBeLessThan(1e-6);
  } finally { world.dispose(); }
});

test('the side west doors pass and the wall between them does not', () => {
  const world = buildRouteCollision();
  try {
    const blocked = driveCapsule(world, { x: 40, z: 8 }, () => 8, 80, 1);
    expect(blocked.endX).toBeGreaterThan(55);
    expect(blocked.endX).toBeLessThan(61.4);
    expect(blocked.stuck).toBe(true);
    for (const z of [-13.5, 13.5]) {
      const door = driveCapsule(world, { x: 80, z }, () => z, 40, -1);
      expect(door.fell).toBe(false);
      expect(door.stuck).toBe(false);
      expect(door.endX).toBeLessThan(50);
      expect(Math.abs(door.endZ - z)).toBeLessThan(0.6);
    }
    const eye = eyePosition({ position: new Vector3(START.x, 0, START.z), velocityY: 0, yaw: START.yaw, speedXZ: 0, status: '' });
    expect(eye.y).toBe(EYE_HEIGHT);
  } finally { world.dispose(); }
});
