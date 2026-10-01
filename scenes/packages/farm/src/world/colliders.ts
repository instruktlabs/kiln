import { createCollisionWorld } from '@kiln-scenes/scene-kit/collision';
import type { Collider, CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import type { Mesh, Object3D } from 'three/webgpu';
import { findDoor } from '../play/doors';
import type { FarmDoor } from '../play/doors';
import type { FarmInstance } from './types';

/** Farm selection rules (INV 6.6, SPEC P-20) over the kit collision world. */
const walkThrough = new Set(['farmer', 'cow', 'sheep', 'chicken', 'wheat', 'pumpkin-plant']);
const rotor = /Joint_(WheelRotor|Rotor)$/, foliage = /crown|leaf|foliage/i;
export interface FarmColliderStats { colliders: number; dynamic: number; doorPivots: number; staticTriangles: number; dynamicTriangles: number; doors: number }
export interface FarmColliders {
  world: CollisionWorld;
  doors: FarmDoor[];
  /** The tractor's own collider, ignored by its probes and by the driving camera ray. */
  ignoreVehicle: ReadonlySet<Collider>;
  stats: FarmColliderStats;
  dispose(): void;
}
const under = (node: Object3D, roots: readonly Object3D[]) => { for (let n: Object3D | null = node; n; n = n.parent) if (roots.includes(n)) return true; return false; };
const triangles = (c: Collider) => c.geometry.getAttribute('position').count / 3;
/**
 * Pilot order: ground, bridge, then each placement in order. A door is found and closed
 * (`apply(0)`) before its pivots join as dynamic colliders; statics are then merged into
 * one "Static farm world" BVH ahead of the dynamic colliders. Must run before initial
 * clips and batching, exactly where the sealed viewer constructs its play controller.
 */
export function buildFarmColliders(o: { ground: Object3D; bridge: Object3D | null; instances: readonly FarmInstance[] }): FarmColliders {
  const world = createCollisionWorld(), doors: FarmDoor[] = [];
  try {
    world.add(o.ground); if (o.bridge) world.add(o.bridge);
    for (const instance of o.instances) {
      const id = instance.asset.id, door = findDoor(instance);
      if (door) { doors.push(door); door.apply(0); for (const pivot of door.pivots) world.add(pivot, { dynamic: true }); }
      if (walkThrough.has(id) || id.startsWith('cabbage-')) continue;
      const excluded: Object3D[] = door ? [...door.pivots] : [];
      instance.object.traverse(node => { if (rotor.test(node.name)) excluded.push(node); });
      world.add(instance.object, { dynamic: id === 'tractor' || id === 'trailer', filter: (mesh: Mesh) => !under(mesh, excluded) && !(id === 'faceted-tree' && foliage.test(mesh.name)) });
    }
    world.consolidateStatic('Static farm world');
    const tractor = o.instances.find(instance => instance.asset.id === 'tractor');
    const vehicle = world.colliders.find(c => c.root === tractor?.object);
    if (!tractor || !vehicle) throw new Error('Farm tractor collider is missing');
    const dynamic = world.colliders.filter(c => c.dynamic);
    const stats: FarmColliderStats = { colliders: world.colliders.length, dynamic: dynamic.length, doors: doors.length,
      doorPivots: doors.reduce((n, door) => n + door.pivots.length, 0),
      staticTriangles: world.colliders.filter(c => !c.dynamic).reduce((n, c) => n + triangles(c), 0),
      dynamicTriangles: dynamic.reduce((n, c) => n + triangles(c), 0) };
    return { world, doors, ignoreVehicle: new Set([vehicle]), stats, dispose: () => world.dispose() };
  } catch (error) { world.dispose(); throw error; }
}
