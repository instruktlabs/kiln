import { BoxGeometry, Group, Mesh } from 'three/webgpu';
import type { BufferGeometry, Object3D } from 'three/webgpu';
import { createCollisionWorld } from '@kiln-scenes/scene-kit/collision';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import { GROUND, WEST_WALLS, collisionFootprint, placements } from './layout';
import type { Aabb, Footprint, Placement } from './layout';
import { addInteriorCollision } from './interior-collision';

function addBox(parent: Group, name: string, box: Aabb, geometries: BufferGeometry[]): void {
  const geometry = new BoxGeometry(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
  geometries.push(geometry);
  const mesh = new Mesh(geometry);
  mesh.name = name;
  mesh.position.set((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
  parent.add(mesh);
}

function addFootprint(parent: Group, place: Placement, foot: Footprint, geometries: BufferGeometry[]): void {
  const geometry = new BoxGeometry(foot.maxX - foot.minX, foot.height, foot.maxZ - foot.minZ);
  geometries.push(geometry);
  const mesh = new Mesh(geometry);
  mesh.position.set((foot.minX + foot.maxX) / 2, foot.height / 2, (foot.minZ + foot.maxZ) / 2);
  const pivot = new Group();
  pivot.name = place.key;
  pivot.position.set(place.x, place.y ?? 0, place.z);
  pivot.rotation.y = place.rotation;
  pivot.scale.setScalar(place.scale ?? 1);
  pivot.add(mesh);
  parent.add(pivot);
}

/** Static scene-owned copies. Pass the unmerged cathedral and optional furnishing collision root. */
export function buildRouteCollision(cathedral?: Object3D, furnishings?: Object3D): CollisionWorld {
  const world = createCollisionWorld();
  const root = new Group();
  root.name = 'Cathedral square collision';
  const geometries: BufferGeometry[] = [];
  try {
    addBox(root, 'ground', GROUND, geometries);
    if (!cathedral) WEST_WALLS.forEach((box, i) => addBox(root, `west-wall-${i}`, box, geometries));
    for (const place of placements) addFootprint(root, place, collisionFootprint(place.key), geometries);
    world.add(root, { key: 'route' });
    if (cathedral) addInteriorCollision(world, cathedral);
    if (furnishings) world.addStatic('furnishings', furnishings);
    return world;
  } catch (error) { world.dispose(); throw error; }
  finally {
    for (const geometry of geometries) geometry.dispose();
    root.traverse(node => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    });
    root.clear();
  }
}

export function colliderTriangles(world: CollisionWorld): number {
  return world.colliders.reduce((sum, collider) => sum + collider.geometry.getAttribute('position').count / 3, 0);
}
