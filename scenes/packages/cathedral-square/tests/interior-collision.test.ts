import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
await import('three');
const { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { buildRouteCollision, colliderTriangles } = await import('../src/colliders');
const { driveCapsule, stepWalkCapsule, walkIntoTheNave, walkOutToTheStreet } = await import('../src/walk');

test('the capsule mounts a threshold taller than its radius without climbing tall furniture', () => {
  const root = new Group();
  const threshold = new Mesh(new BoxGeometry(3, .31, 8));
  threshold.position.set(5, .155, 0); root.add(threshold);
  const furniture = new Mesh(new BoxGeometry(1, 1.1, 8));
  furniture.position.set(10, .55, 0); root.add(furniture);
  const world = buildRouteCollision(new Group(), root);
  try {
    const result = driveCapsule(world, { x: 1, z: 0 }, () => 0, 12);
    expect(result.endX).toBeGreaterThan(8);
    expect(result.endX).toBeLessThan(9.5);
    expect(result.stuck).toBe(true);
  } finally { world.dispose(); threshold.geometry.dispose(); furniture.geometry.dispose(); }
});

async function loadCathedral() {
  const bytes = readFileSync(process.env.CATHEDRAL_COLLISION_ASSET ?? new URL('../standalone/public/assets/models/cathedral.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'collision-image-free', loadTexture: () => Promise.resolve(new Texture()) }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const cathedral = await loadCathedral();

test.skipIf(!cathedral.getObjectByName('Mesh_WestEntrancePassage_Paving'))('repaired side vestibules connect both open portal leaves to the side aisles', () => {
  const world = buildRouteCollision(cathedral);
  try {
    for (const side of [-1, 1]) {
      const lane = (x: number) => side * (x >= 60 ? 14.4 : x > 57 ? 10 + (x - 57) * 4.4 / 3 : 10);
      const entry = driveCapsule(world, { x: 80, z: side * 14.4 }, lane, 45, -1);
      expect(entry.stuck).toBe(false);
      expect(entry.fell).toBe(false);
      expect(entry.endX).toBeLessThanOrEqual(45);
      expect(Math.abs(entry.endZ - side * 10)).toBeLessThan(.1);
      const exit = driveCapsule(world, { x: 45, z: side * 10 }, lane, 80);
      expect(exit.stuck).toBe(false);
      expect(exit.fell).toBe(false);
      expect(exit.endX).toBeGreaterThanOrEqual(80);
    }
  } finally { world.dispose(); }
});

test('diagonal contact slides along furniture and releases its corner', () => {
  const root = new Group();
  const wall = new Mesh(new BoxGeometry(1, 3, 8)); wall.position.set(10, 1.5, 0); root.add(wall);
  const world = buildRouteCollision(new Group(), root);
  const mover = { position: new Vector3(8, 0, -3), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
  try {
    for (let i = 0; i < 600; i++) stepWalkCapsule(mover, { x: 0, y: 1 }, false, new Vector3(1, 0, 1), 1 / 60, world);
    expect(mover.position.x).toBeGreaterThan(12);
    expect(mover.position.z).toBeGreaterThan(6);
    expect(mover.position.y).toBeLessThan(.01);
  } finally { world.dispose(); wall.geometry.dispose(); }
});

test('the inward route corrects lateral error toward its requested lane', () => {
  const world = buildRouteCollision();
  try {
    const result = driveCapsule(world, { x: 35, z: .5 }, () => 0, 30, -1);
    expect(Math.abs(result.endZ)).toBeLessThan(.05);
  } finally { world.dispose(); }
});

test('exported cathedral walls, piers and altar are solid and the central entrance remains open', () => {
  const world = buildRouteCollision(cathedral);
  try {
    expect(world.intersects(new Vector3(30, .06, 13), .28, 1.8)).toBe(true);
    expect(world.intersects(new Vector3(47, .06, 6.5), .28, 1.8)).toBe(true);
    expect(world.intersects(new Vector3(30, .06, 0), .28, 1.8)).toBe(false);
    const into = walkIntoTheNave(world);
    expect(into.stuck).toBe(false);
    expect(into.endX).toBeLessThanOrEqual(24);
    const out = walkOutToTheStreet(world);
    expect(out.stuck).toBe(false);
    expect(out.endX).toBeGreaterThanOrEqual(190);
    const altar = driveCapsule(world, { x: -45, z: 0 }, () => 0, -60, -1);
    expect(altar.stuck).toBe(true);
    expect(altar.endX).toBeLessThan(-52);
    expect(altar.endX).toBeGreaterThan(-57);
    expect(altar.endY).toBeGreaterThan(.35);
    expect(colliderTriangles(world)).toBeLessThan(175000);
  } finally { world.dispose(); }
});

test('static cathedral collision preserves transforms and owns only copied geometry', () => {
  const root = new Group(); root.position.set(10, 0, 20); root.rotation.y = Math.PI / 2;
  const mesh = new Mesh(new BoxGeometry(4, 3, .5), new MeshStandardMaterial());
  mesh.name = 'Mesh_Test_Wall_Stone'; mesh.position.set(2, 1.5, 0); root.add(mesh);
  const glass = new Mesh(new BoxGeometry(1, 3, 1), new MeshStandardMaterial({ transparent: true }));
  glass.name = 'Mesh_Window_Stone'; glass.position.set(-2, 1.5, 0); root.add(glass);
  let disposed = 0; mesh.geometry.addEventListener('dispose', () => disposed++);
  const world = buildRouteCollision(root);
  expect(world.intersects(new Vector3(10, .01, 18), .28, 1.8)).toBe(true);
  expect(world.intersects(new Vector3(10, .01, 22), .28, 1.8)).toBe(false);
  root.position.x = 100;
  expect(world.intersects(new Vector3(10, .01, 18), .28, 1.8)).toBe(true);
  world.dispose(); world.dispose(); expect(disposed).toBe(0);
  mesh.geometry.dispose(); glass.geometry.dispose();
});
