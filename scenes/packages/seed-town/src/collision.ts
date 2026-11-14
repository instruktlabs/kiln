import { Box3, BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, Vector3 } from 'three/webgpu';
import { createCollisionWorld } from '@kiln-scenes/scene-kit/collision';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import { buildingBoxes, MEADOW } from './layout';
import type { Aabb, TownFrame } from './layout';
import type { TownPlacement, TownPlan } from './plan/town-plan.js';
import { bakeKits, placementBox } from './town';
import type { Kit } from './town';

/** The kits a visitor walks on, and the ones that stand in the way. */
const GROUND_KITS = ['paving', 'junction'] as const;
const OBSTACLE_KITS = ['street-lamp', 'street-furniture'] as const;
/** Half the side of the box a tree trunk stands in, metres. */
const TRUNK = 0.34;
/** A shrub is in the way as far as this share of its spread from its middle, up to its own height. */
const SHRUB = 0.3;

function addBox(parent: Group, name: string, box: Aabb, geometries: BufferGeometry[]): void {
  const geometry = new BoxGeometry(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
  geometries.push(geometry);
  const mesh = new Mesh(geometry);
  mesh.name = name;
  mesh.position.set((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
  parent.add(mesh);
}

/** The four strips of open ground round the town, in scene coordinates, with their tops at pavement level. */
export function meadowBoxes(frame: TownFrame, far = MEADOW + 40): Aabb[] {
  const x = frame.halfX, z = frame.halfZ, y = { minY: -1, maxY: 0 };
  return [
    { minX: -x - far, maxX: x + far, minZ: -z - far, maxZ: -z, ...y },
    { minX: -x - far, maxX: x + far, minZ: z, maxZ: z + far, ...y },
    { minX: -x - far, maxX: -x, minZ: -z, maxZ: z, ...y },
    { minX: x, maxX: x + far, minZ: -z, maxZ: z, ...y },
  ];
}

/**
 * What a walker meets: the paving as it is built (so kerbs, gutters and the cambered road are real
 * steps and slopes), a box per building, a box per lamp and piece of street furniture, and the
 * meadow outside. Everything is in scene coordinates.
 */
export function buildTownCollision(kits: ReadonlyMap<string, Kit>, plan: TownPlan, frame: TownFrame, trees: readonly TownPlacement[] = []): CollisionWorld {
  const world = createCollisionWorld();
  const root = new Group();
  root.name = 'Seed town collision';
  const geometries: BufferGeometry[] = [];
  const offset = new Vector3(...frame.offset);
  try {
    const ground = new BufferGeometry();
    geometries.push(ground);
    ground.setAttribute('position', new BufferAttribute(bakeKits(kits, plan, GROUND_KITS, offset), 3));
    const paving = new Mesh(ground);
    paving.name = 'paving';
    root.add(paving);
    buildingBoxes(plan).forEach((box, i) => addBox(root, `building-${i}`, {
      minX: box.minX + offset.x, maxX: box.maxX + offset.x, minY: box.minY, maxY: box.maxY, minZ: box.minZ + offset.z, maxZ: box.maxZ + offset.z,
    }, geometries));
    const bounds = new Box3();
    for (const place of plan.placements) {
      if (!(OBSTACLE_KITS as readonly string[]).includes(place.kit)) continue;
      placementBox(kits, place, bounds, offset);
      if (bounds.isEmpty()) continue;
      addBox(root, place.id, { minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z }, geometries);
    }
    // A trunk is in the way; a crown is overhead. Only trees a walker can reach need one.
    const reach = MEADOW + 44;
    for (const tree of trees) {
      const x = tree.pos[0] + offset.x, z = tree.pos[2] + offset.z;
      if (Math.abs(x) > frame.halfX + reach || Math.abs(z) > frame.halfZ + reach) continue;
      const shrub = tree.values.form === 'shrub', half = shrub ? Number(tree.values.spread) * SHRUB : TRUNK;
      addBox(root, tree.id, { minX: x - half, maxX: x + half, minY: -1, maxY: shrub ? Number(tree.values.height) : 3, minZ: z - half, maxZ: z + half }, geometries);
    }
    meadowBoxes(frame).forEach((box, i) => addBox(root, `meadow-${i}`, box, geometries));
    world.add(root, { key: 'town' });
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
