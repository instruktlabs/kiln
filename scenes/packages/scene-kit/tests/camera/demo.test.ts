import { expect, test } from 'bun:test';
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import { createCollisionWorld } from '../../src/collision';
import { DEMO_CAR_COLLIDER } from '../../demo/rig-constants';

test('B-15 demo car capsule can advance along its floor while remaining blocked by a wall', () => {
  const world = createCollisionWorld();
  const ground = new Mesh(new BoxGeometry(40, .4, 40), new MeshBasicMaterial()); ground.position.y = -.2;
  const wall = new Mesh(new BoxGeometry(1, 3, 1), new MeshBasicMaterial()); wall.position.set(8, 1.5, 5);
  world.addStatic('floor', ground); world.addStatic('wall', wall);
  try {
    expect(DEMO_CAR_COLLIDER.height).toBeGreaterThanOrEqual(2 * DEMO_CAR_COLLIDER.radius);
    expect(world.intersects(new Vector3(8, 0, 3.1), DEMO_CAR_COLLIDER.radius, DEMO_CAR_COLLIDER.height)).toBe(false);
    expect(world.intersects(new Vector3(8, 0, 5), DEMO_CAR_COLLIDER.radius, DEMO_CAR_COLLIDER.height)).toBe(true);
  } finally { world.dispose(); ground.geometry.dispose(); ground.material.dispose(); wall.geometry.dispose(); wall.material.dispose(); }
});
