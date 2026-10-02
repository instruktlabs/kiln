import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import { createCollisionWorld, fixedStep, stepCapsule } from '../../src/collision/index';
import fixture from './pilot-boxes.json';
import { shadowStandIns } from '../../src/shadows/stand-ins';
import { passStandIn } from '../../src/shadows/pass';
import { mergeRigidByMaterial } from '../../src/instancing/rigid-merge';

function box(x: number, y: number, z: number, width = 2, height = 2, depth = 2) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(x, y, z); return mesh;
}
function setup() {
  const world = createCollisionWorld();
  world.add(box(0, -0.5, 0, 20, 1, 20));
  world.add(box(2, 1, 0));
  const dynamicRoot = box(-2, 1, 0);
  const dynamic = world.add(dynamicRoot, { dynamic: true })!;
  return { world, dynamic, dynamicRoot };
}
describe('U-09 collision', () => {
  test('matches frozen pilot capsule, ray and floor samples', () => {
    const { world, dynamic, dynamicRoot } = setup();
    for (const row of fixture.samples) {
      const p = new Vector3(...row.p as [number, number, number]);
      expect(world.intersects(p, .3, 1.9)).toBe(row.intersects);
      const hit = world.resolve(p, .3, 1.9);
      expect(hit).toBe(row.resolved);
      p.toArray().forEach((value, i) => expect(value).toBeCloseTo(row.after[i]!, 6));
      const f = world.floor(new Vector3(...row.p as [number, number, number]));
      expect(Number.isFinite(f) ? f : null).toEqual(row.floor);
    }
    expect(world.rayDistance(new Vector3(0, 1, 0), new Vector3(5, 1, 0))).toBeCloseTo(fixture.ray, 6);
    expect(world.intersects(new Vector3(-1.1, .01, 0), .3, 1.9)).toBe(true);
    expect(world.intersects(new Vector3(-1.1, .01, 0), .3, 1.9, new Set([dynamic]))).toBe(false);
    dynamicRoot.position.x = -5;
    expect(world.intersects(new Vector3(-1.1, .01, 0), .3, 1.9)).toBe(false);
    expect(world.intersects(new Vector3(-4.1, .01, 0), .3, 1.9)).toBe(true);
    world.dispose(); expect(world.colliders).toHaveLength(0);
    expect(world.intersects(new Vector3(), .3, 1.9)).toBe(false);
  });
  test('dynamic local BVH follows root rotation, ray/floor queries and enabled state', () => {
    const world = createCollisionWorld(), mesh = box(0, 1, 0, 4, 2, 1);
    const c = world.add(mesh, { dynamic: true })!;
    expect(world.rayDistance(new Vector3(0, 1, 3), new Vector3(0, 1, -3))).toBeCloseTo(2.5);
    mesh.rotation.y = Math.PI / 2; mesh.position.x = 4;
    expect(world.rayDistance(new Vector3(4, 1, 3), new Vector3(4, 1, -3))).toBeCloseTo(1);
    expect(world.floor(new Vector3(4, 2.1, 0))).toBeCloseTo(2);
    expect(world.rayDistance(new Vector3(4, 1, 3), new Vector3(4, 1, -3), new Set([c]))).toBe(6);
    c.enabled = false; expect(world.floor(new Vector3(4, 2.1, 0))).toBe(-Infinity);
    let disposed = 0; c.geometry.addEventListener('dispose', () => disposed++); world.dispose(); world.dispose(); expect(disposed).toBe(1);
  });
  test('streamed statics, detached proxies, filter, consolidation and terminal disposal', () => {
    const world = createCollisionWorld(); const root = new Group();
    root.position.x = 4; root.add(box(0, 1, 0)); root.add(box(10, 1, 0));
    const proxy = world.addStatic('proxy', root, m => m.position.x === 0)!;
    expect(world.intersects(new Vector3(4.9, .01, 0), .3, 1.9)).toBe(true);
    expect(world.intersects(new Vector3(14, .01, 0), .3, 1.9)).toBe(false);
    let disposed = 0; proxy.geometry.addEventListener('dispose', () => disposed++);
    world.removeStatic('proxy'); expect(disposed).toBe(1);
    world.addStatic('one', box(0, -.5, 0, 20, 1, 20)); world.addStatic('two', box(2, 1, 0));
    world.consolidateStatic('merged'); expect(world.colliders).toHaveLength(1);
    expect(world.colliders[0]!.key).toBe('merged');
    expect(world.rayDistance(new Vector3(0, 1, 0), new Vector3(5, 1, 0))).toBeCloseTo(1, 6);
    world.dispose(); world.dispose(); expect(world.add(box(0, 0, 0))).toBeNull();
  });
  test('shadow and pass stand-ins never become colliders', () => {
    const world = createCollisionWorld(), root = new Group(), wall = box(0, 1, 0); wall.castShadow = true; root.add(wall);
    const holder = new Group(); holder.position.x = 10; root.add(holder);
    const shadow = shadowStandIns(root, { layer: 29, isAnchor: () => false }), pass = passStandIn(wall, { layer: 28, parent: holder });
    expect(shadow.proxies).toHaveLength(1); expect(pass.stats.meshes).toBe(1);
    const c = world.add(root)!; expect(c.geometry.getAttribute('position').count).toBe(36);
    expect(world.rayDistance(new Vector3(10, 1, -5), new Vector3(10, 1, 5))).toBeCloseTo(10, 6);
    expect(world.rayDistance(new Vector3(0, 1, -5), new Vector3(0, 1, 5))).toBeCloseTo(4, 6);
    world.dispose(); shadow.restore(); pass.restore();
  });
  test('RF-6 a collider built after a rigid merge holds the hidden sources once, never the merged copy', () => {
    const world = createCollisionWorld(), root = new Group(), material = new MeshBasicMaterial();
    for (const x of [0, 4]) { const g = new BoxGeometry(2, 2, 2); g.clearGroups(); const m = new Mesh(g, material); m.position.x = x; root.add(m); }
    const merge = mergeRigidByMaterial(root, { isAnchor: () => false }); expect(merge.merged).toHaveLength(1);
    expect(world.add(root)!.geometry.getAttribute('position').count).toBe(72);
    world.dispose(); merge.restore();
  });
});
const rules = { radius: .3, height: 1.9, pace: 1.05, runPace: 1.8, gravity: 18, terminal: -10, stepUp: .22, stepProbe: .25, clampX: 34.8, clampZ: 34.8 };
const state = () => ({ position: new Vector3(0, 10, 0), velocityY: 0, yaw: 0, speedXZ: 0, status: '' });
describe('U-10 capsule mover', () => {
  test('pace, run, diagonal normalization, camera orientation, gravity, terminal, clamp and river status', () => {
    const world = createCollisionWorld(); const s = state();
    stepCapsule(s, { x: 0, y: 1 }, false, new Vector3(0, 0, -1), .1, world, rules);
    expect(s.position.z).toBeCloseTo(-.105); expect(s.velocityY).toBeCloseTo(-1.8); expect(s.yaw).toBeCloseTo(Math.PI / 2);
    stepCapsule(s, { x: 1, y: 1 }, true, new Vector3(0, 0, -1), .1, world, rules);
    expect(s.speedXZ).toBeCloseTo(1.8);
    for (let i = 0; i < 20; i++) stepCapsule(s, { x: 0, y: 0 }, false, new Vector3(0, 0, -1), .1, world, rules);
    expect(s.velocityY).toBe(-10);
    s.position.set(34.79, 2, 0); stepCapsule(s, { x: 1, y: 0 }, true, new Vector3(0, 0, -1), .1, world, rules);
    expect(s.position.x).toBe(34.8);
    s.position.set(0, 2, 0); stepCapsule(s, { x: 1, y: 0 }, false, new Vector3(0, 0, -1), .1, world, { ...rules, blocked: () => 'Cross at the bridge.' });
    expect(s.position.x).toBe(0); expect(s.status).toBe('Cross at the bridge.'); world.dispose();
  });
  test('low porch can be climbed while a wall cannot', () => {
    const world = createCollisionWorld(); world.add(box(0, -.5, 0, 20, 1, 20));
    world.add(box(1, .09, 0, 1, .18, 4));
    const s = state(); s.position.set(.15, .00002, 0);
    for (let i = 0; i < 120; i++) stepCapsule(s, { x: 1, y: 0 }, false, new Vector3(0, 0, -1), 1 / 120, world, rules);
    expect(s.position.x).toBeGreaterThan(.5); expect(s.position.y).toBeCloseTo(.18001, 4);
    world.add(box(2.5, 1, 0));
    for (let i = 0; i < 240; i++) stepCapsule(s, { x: 1, y: 0 }, false, new Vector3(0, 0, -1), 1 / 120, world, rules);
    expect(s.position.x).toBeLessThanOrEqual(1.21); world.dispose();
  });
  test('fixed-step cap and carried remainder', () => {
    const acc = { t: 0 }; let count = 0;
    fixedStep(acc, 2, 1 / 120, .1, () => count++); expect(count).toBe(12); expect(acc.t).toBeCloseTo(0);
    fixedStep(acc, .004, .01, .1, () => count++); fixedStep(acc, .008, .01, .1, () => count++);
    expect(count).toBe(13); expect(acc.t).toBeCloseTo(.002);
  });
});
