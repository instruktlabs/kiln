import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cathedralFixture } from './fixtures';
import type { Mesh, Object3D } from 'three/webgpu';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';

await import('three');
const { Box3, Group, Vector3, Raycaster } = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { buildRouteCollision } = await import('../src/colliders');
const { buildCrucifixPlacements, buildPewPlacements } = await import('../src/furnishings');
const { stepWalkCapsule, WALK_RULES } = await import('../src/walk');

async function loadAsset(id: string) {
  const source = cathedralFixture(id)!;
  const bytes = readFileSync(source);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'furnishings-image-free', loadTexture: () => Promise.resolve(null) }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

const available = ['cathedral', 'nave-pew', 'crucifix'].map(cathedralFixture).every(Boolean);
const [cathedral, pew, crucifix] = available ? await Promise.all([
  loadAsset('cathedral'),
  loadAsset('nave-pew'),
  loadAsset('crucifix'),
]) : [new Group(), new Group(), new Group()];
const pews = buildPewPlacements(pew);
const crosses = available ? buildCrucifixPlacements(crucifix, cathedral) : new Group();
const precision = 4;

function meshOf(root: Object3D, name: string): Mesh {
  const mesh = root.getObjectByName(name) as Mesh | undefined;
  if (!mesh?.isMesh) throw new Error(`Missing mesh ${name} under ${root.name}`);
  return mesh;
}

function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse(node => { if ((node as Mesh).isMesh) meshes.push(node as Mesh); });
  return meshes;
}

function expectUnchangedMesh(source: Mesh, placed: Mesh, sourceRoot: Object3D, placement: Object3D) {
  const expected = placement.matrixWorld.clone().multiply(sourceRoot.matrixWorld.clone().invert()).multiply(source.matrixWorld);
  expect(placed.geometry).toBe(source.geometry);
  expect(placed.material).toBe(source.material);
  for (const [i, value] of placed.matrixWorld.elements.entries()) expect(value).toBeCloseTo(expected.elements[i]!, precision);
}

const box = (root: Object3D) => new Box3().setFromObject(root, true);
const aisleBounds = (side: number) => pews.children
  .filter(p => Math.sign(p.position.z) === side)
  .map(p => box(p))
  .sort((a, b) => a.min.x - b.min.x);

test.skipIf(!available)('all 44 exported pew placements face the sanctuary and rest their three feet on nave paving', () => {
  expect(pews.children).toHaveLength(44);
  expect(pew.parent).toBeNull();
  pew.updateWorldMatrix(true, true);
  pews.updateWorldMatrix(true, true);
  const structure = buildRouteCollision(cathedral);
  try {
    const sourceMeshes = meshesOf(pew);
    for (const placed of pews.children) {
      const bounds = box(placed);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(3.6, precision);
      const look = new Vector3(1, 0, 0).transformDirection(placed.matrixWorld);
      expect(look.x).toBeCloseTo(-1, precision);
      expect(look.z).toBeCloseTo(0, precision);
      for (const original of sourceMeshes) expectUnchangedMesh(original, meshOf(placed, original.name), pew, placed);
      for (const suffix of ['L', 'C', 'R']) {
        const foot = box(meshOf(placed, `Pew_Foot_${suffix}`));
        const center = foot.getCenter(new Vector3());
        const floor = structure.floor(new Vector3(center.x, foot.min.y + .10, center.z), .15);
        expect(foot.min.y).toBeCloseTo(.06, precision);
        expect(floor).toBeCloseTo(foot.min.y, precision);
      }
    }
    const leftEdge = Math.max(...aisleBounds(-1).map(p => p.max.z));
    const rightEdge = Math.min(...aisleBounds(1).map(p => p.min.z));
    expect(rightEdge - leftEdge).toBeCloseTo(3, precision);
  } finally { structure.dispose(); }
});

function walkLane(world: CollisionWorld, startX: number, waypoints: readonly [number, number][]) {
  const mover = { position: new Vector3(startX, .06002, 0), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
  const from = new Vector3(startX, .06002, 0);
  for (const [x, z] of waypoints) {
    const goal = new Vector3(x, .06002, z);
    const direction = goal.clone().sub(from);
    const distance = direction.length();
    direction.normalize();
    const frames = Math.ceil(distance / (WALK_RULES.pace / 60));
    const dt = distance / frames / WALK_RULES.pace;
    for (let frame = 1; frame <= frames; frame++) {
      stepWalkCapsule(mover, { x: 0, y: 1 }, false, direction, dt, world);
      const expected = from.clone().lerp(goal, frame / frames);
      if (mover.position.distanceTo(expected) > .015
        || world.intersects(mover.position, WALK_RULES.radius, WALK_RULES.height)) {
        throw new Error(`Capsule hit, climbed or slid en route to (${x.toFixed(3)}, ${z}): ${mover.position.toArray()}`);
      }
    }
    from.copy(goal);
  }
}
test.skipIf(!available)('walking capsule enters each pew row and crosses to both side aisles', () => {
  pews.updateWorldMatrix(true, true);
  const world = buildRouteCollision(cathedral, pews);
  try {
    for (const side of [-1, 1]) {
      const bank = aisleBounds(side);
      expect(bank).toHaveLength(22);
      for (let row = 0; row < bank.length - 1; row++) {
        const after = bank[row]!.max.x;
        const before = bank[row + 1]!.min.x;
        expect(before - after).toBeGreaterThan(2 * WALK_RULES.radius);
        const x = (after + before) / 2;
        if (row % 2 === 0) {
          walkLane(world, x, [[x, side * 3.3]]);
        } else {
          // Leave the pew ends before turning west around the flared pier plinth.
          const lane = after + WALK_RULES.radius + .05;
          walkLane(world, lane, [[lane, side * 5.2], [after + .08, side * 5.52],
            [after - .28, side * 5.8], [after - .28, side * 9]]);
        }
      }
    }
  } finally { world.dispose(); }
});

test.skipIf(!available)('exported principal crucifix hangs above the retable from real vault contacts and wall crosses meet masonry', () => {
  crucifix.updateWorldMatrix(true, true);
  crosses.updateWorldMatrix(true, true);
  expect(crucifix.parent).toBeNull();
  const principal = crosses.children.find(node => node.name === 'PrincipalCrucifix')!;
  const originals = meshesOf(crucifix).filter(mesh => mesh.name !== 'Mesh_Cross_BaseMoulding');
  expect(meshesOf(principal)).toHaveLength(originals.length);
  expect(principal.getObjectByName('Mesh_Corpus_Torso')).toBeDefined();
  expect(principal.getObjectByName('Mesh_Cross_Suppedaneum')).toBeDefined();
  expect(principal.getObjectByName('Mesh_Cross_BaseMoulding')).toBeUndefined();
  expect(crucifix.getObjectByName('Mesh_Cross_BaseMoulding')).toBeDefined();
  for (const mesh of originals) {
    const placed = meshOf(principal, mesh.name);
    expectUnchangedMesh(mesh, placed, crucifix, principal);
    if (['Mesh_INRI_N_Diag', 'Mesh_INRI_R_Leg'].includes(mesh.name)) {
      // From the front (+X), screen-right is -Z. Both strokes descend toward the right.
      expect(new Vector3(0, 1, 0).applyQuaternion(placed.quaternion).z).toBeGreaterThan(0);
    }
  }
  const crossPost = box(meshOf(principal, 'Mesh_Cross_Post'));
  const retable = box(meshOf(cathedral, 'Mesh_Sanctuary_Stone'));
  expect(principal.position.x).toBeCloseTo(-56.4, precision);
  expect(principal.position.z).toBe(0);
  expect(crossPost.min.y - retable.max.y).toBeGreaterThan(.6);
  expect(crossPost.max.y - crossPost.min.y).toBeCloseTo(3.52, precision);
  expect(new Vector3(1, 0, 0).transformDirection(principal.matrixWorld).x).toBeCloseTo(1, precision);
  const supports = crosses.getObjectByName('CrucifixSuspension')!;
  const cables = supports.children.filter(node => node.name.endsWith('_Cable')) as Mesh[];
  expect(cables).toHaveLength(2);
  for (const cable of cables) {
    const lower = new Vector3(...cable.userData.suspension.lower);
    const upper = new Vector3(...cable.userData.suspension.upper);
    const up = new Vector3(0, 1, 0), down = new Vector3(0, -1, 0);
    const timberContact = new Raycaster(lower.clone().addScaledVector(up, .01), down, 0, .02)
      .intersectObject(meshOf(principal, 'Mesh_Cross_Beam'), false)[0];
    const vaultContact = new Raycaster(upper.clone().addScaledVector(down, .01), up, 0, .02)
      .intersectObject(meshOf(cathedral, cable.userData.suspension.upperPart), false)[0];
    expect(timberContact).toBeDefined(); expect(vaultContact).toBeDefined();
    expect(timberContact!.point.distanceTo(lower)).toBeLessThan(.00001);
    expect(vaultContact!.point.distanceTo(upper)).toBeLessThan(.00001);
    expect(upper.y).toBeGreaterThan(26);
    expect(upper.y).toBeLessThan(42);
    const height = (cable.geometry as import('three/webgpu').CylinderGeometry).parameters.height;
    expect(new Vector3(0, -height / 2, 0).applyMatrix4(cable.matrixWorld).distanceTo(lower)).toBeLessThan(.00001);
    expect(new Vector3(0, height / 2, 0).applyMatrix4(cable.matrixWorld).distanceTo(upper)).toBeLessThan(.00001);
    const prefix = cable.name.replace('_Cable', '');
    expect(box(meshOf(supports, `${prefix}_BeamFixing`)).containsPoint(lower)).toBe(true);
    expect(box(meshOf(supports, `${prefix}_VaultFixing`)).containsPoint(upper)).toBe(true);
  }
  const structure = buildRouteCollision(cathedral);
  try {
    for (const [name, side] of [['NorthWallCross', 1], ['SouthWallCross', -1]] as const) {
      const wall = crosses.children.find(node => node.name === name)!;
      const kept = meshesOf(wall).map(mesh => mesh.name).sort();
      expect(kept).toEqual(['Mesh_Cross_Beam', 'Mesh_Cross_Post']);
      const clonedRoot = wall.children[0]!;
      for (const mesh of kept) expectUnchangedMesh(meshOf(crucifix, mesh), meshOf(wall, mesh), crucifix, clonedRoot);
      const wallCross = box(wall);
      // Project to the wall's X axis so a recessed pane cannot make an overlap look clear.
      const windows: Object3D[] = [];
      const windowName = new RegExp(`^Mesh_NaveBay[0-9]+_${side > 0 ? 'N' : 'S'}_AisleWindow_Glass$`);
      cathedral.traverse(node => { if (windowName.test(node.name)) windows.push(node); });
      expect(windows.length).toBeGreaterThan(1);
      for (const mesh of windows) {
        const glazing = box(mesh);
        const horizontalGap = Math.max(glazing.min.x - wallCross.max.x, wallCross.min.x - glazing.max.x);
        expect(horizontalGap).toBeGreaterThan(.04);
      }
      // Keep the entire timber silhouette above the nave's lower blind arcade and niches.
      expect(wallCross.min.y).toBeGreaterThan(4.5);
      const post = box(meshOf(wall, 'Mesh_Cross_Post'));
      const center = post.getCenter(new Vector3());
      const interior = new Vector3(center.x, center.y, side * 12.8);
      const outside = new Vector3(center.x, center.y, side * 13.4);
      const wallContact = 12.8 + structure.rayDistance(interior, outside);
      const postBack = side > 0 ? post.max.z : -post.min.z;
      expect(wallContact).toBeCloseTo(13.1, 2);
      expect(postBack).toBeCloseTo(wallContact, 2);
    }
  } finally { structure.dispose(); }
});
