/**
 * Cathedral square, metres, +Y up. The saved church faces west: the west front is at +X,
 * the apse is toward -X, and north is +Z. The town is the film generator (town-layout.js):
 * the same seeded streets, blocks and houses. Houses are shells. The young man and the
 * horse cart are not in that plan and stay out until after 2026-11-11 23:00 America/New_York.
 *
 * Collision combines ground and town boxes with exported cathedral structure and
 * furnishings. WEST_WALLS remains the image-free fixture fallback only.
 */
import { townLayout } from './town-layout.js';
import type { TownLayout, TownPlacement } from './town-layout.js';

export const EYE_HEIGHT = 1.7;
/** On the parvis, just outside the central west doors, looking toward -X (into the church). */
export const START = { x: 84, z: 0, yaw: Math.PI / 2 };
export const DOOR_SAMPLE_X = 64;

/**
 * Opening orbit. The camera stands on the parvis side, south-west of the doors,
 * so the west front, the parvis and the near streets are in frame. Wheel zoom uses
 * the rig's distance limits.
 */
export const ORBIT_VIEW = {
  position: [220, 42, -90] as [number, number, number],
  target: [36, 16, 6] as [number, number, number],
  fov: 50,
  minDistance: 8,
  maxDistance: 1400,
};

export interface Aabb { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
export interface Placement { key: string; x: number; z: number; y?: number; rotation: number; scale?: number; variant?: number }
export interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number; height: number }

export const HIDDEN_PARTS = [
  'Mesh_Ground_Earth', 'Mesh_Ground_Flagstones',
  'Mesh_Portal_Central_Oak', 'Mesh_Portal_Central_Iron',
  'Mesh_Portal_North_Oak', 'Mesh_Portal_North_Iron',
  'Mesh_Portal_South_Oak', 'Mesh_Portal_South_Iron',
] as const;
export const HIDDEN_PREFIX = 'Mesh_StainedLight_';

const WALL_X0 = 61.15;
const WALL_X1 = 66.35;
const WALL_TOP = 4;
export const WEST_WALLS: Aabb[] = [
  { minX: WALL_X0, maxX: WALL_X1, minY: 0, maxY: WALL_TOP, minZ: -21.5, maxZ: -15.2 },
  { minX: WALL_X0, maxX: WALL_X1, minY: 0, maxY: WALL_TOP, minZ: -11.8, maxZ: -1.95 },
  { minX: WALL_X0, maxX: WALL_X1, minY: 0, maxY: WALL_TOP, minZ: 1.95, maxZ: 11.8 },
  { minX: WALL_X0, maxX: WALL_X1, minY: 0, maxY: WALL_TOP, minZ: 15.2, maxZ: 21.5 },
];

/** One slab under the nave, the parvis and every street. The door gaps are the missing west-wall boxes. */
export const GROUND: Aabb = { minX: -500, maxX: 500, minY: -1, maxY: 0, minZ: -500, maxZ: 500 };

export const FOOTPRINTS: Record<string, Footprint> = {
  'house-timber-gable-door': { minX: -11.35, maxX: 1.17, minZ: -3.46, maxZ: 3.46, height: 15.88 },
  'house-timber-gable-narrow': { minX: -12.35, maxX: 1.77, minZ: -3.06, maxZ: 3.06, height: 21.33 },
  'house-timber-gable-shop': { minX: -12.35, maxX: 1.47, minZ: -3.96, maxZ: 3.96, height: 19.57 },
  'house-stone-gable-shop': { minX: -13.35, maxX: 1.15, minZ: -4.46, maxZ: 4.46, height: 20.26 },
  'house-stone-gable-tall': { minX: -12.35, maxX: 0.57, minZ: -3.96, maxZ: 3.96, height: 22.57 },
  'house-stone-eaves-arcade': { minX: -13.4, maxX: 0.64, minZ: -5.08, maxZ: 5.08, height: 18.77 },
  'house-plaster-eaves-arcade': { minX: -13.4, maxX: 0.64, minZ: -4.58, maxZ: 4.58, height: 17.36 },
  'house-plaster-eaves-shop': { minX: -12.4, maxX: 1.15, minZ: -4.08, maxZ: 4.08, height: 21.21 },
  fountain: { minX: -3.79, maxX: 3.79, minZ: -3.79, maxZ: 3.79, height: 7.02 },
  'stall-red': { minX: -0.9, maxX: 1.05, minZ: -1.65, maxZ: 1.65, height: 2.67 },
  'stall-green': { minX: -0.9, maxX: 1.05, minZ: -1.65, maxZ: 1.65, height: 2.67 },
  bench: { minX: -0.26, maxX: 0.22, minZ: -1, maxZ: 1, height: 0.86 },
  lantern: { minX: -0.34, maxX: 0.34, minZ: -0.33, maxZ: 0.33, height: 4.3 },
  bollard: { minX: -0.16, maxX: 0.16, minZ: -0.16, maxZ: 0.16, height: 0.84 },
  'cafe-red': { minX: -1.25, maxX: 1.25, minZ: -1.25, maxZ: 1.25, height: 2.45 },
  'cafe-green': { minX: -1.25, maxX: 1.25, minZ: -1.25, maxZ: 1.25, height: 2.45 },
};

const TRUNK: Footprint = { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, height: 3 };

export function collisionFootprint(key: string): Footprint {
  if (key === 'tree-a' || key === 'tree-b') return TRUNK;
  const foot = FOOTPRINTS[key];
  if (!foot) throw new Error(`No collision footprint for ${key}`);
  return foot;
}

export function westWallCovers(z: number): boolean {
  return WEST_WALLS.some(box => z >= box.minZ && z <= box.maxZ);
}

export function worldBox(place: Placement, foot: Footprint): Aabb {
  const scale = place.scale ?? 1;
  const c = Math.cos(place.rotation), s = Math.sin(place.rotation), y = place.y ?? 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const lx of [foot.minX * scale, foot.maxX * scale]) for (const lz of [foot.minZ * scale, foot.maxZ * scale]) {
    const x = place.x + c * lx + s * lz;
    const z = place.z - s * lx + c * lz;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minY: y, maxY: y + foot.height * scale, minZ, maxZ };
}

/** Horizontal look for a yaw used by the walk camera. Yaw π/2 looks toward -X. */
export function lookDirection(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export const town: TownLayout = townLayout();

function asPlacement(place: TownPlacement): Placement {
  return { key: place.key, x: place.x, z: place.z, y: place.y, rotation: place.rotation, scale: place.scale, variant: place.variant };
}

export const placements: Placement[] = [...town.houses.map(asPlacement), ...town.props.map(asPlacement)];

export const TOWN_COUNTS = {
  houses: town.houses.length,
  props: town.props.length,
  streets: town.streets.length,
  lanes: town.streets.filter(street => street.lane).length,
  blocks: town.blocks.length,
};

const placementCounts = new Map<string, number>();
for (const place of placements) placementCounts.set(place.key, (placementCounts.get(place.key) ?? 0) + 1);
export const PLACEMENT_COUNTS: ReadonlyMap<string, number> = placementCounts;

/** Hold z = 0 through the central door, z = 1 between the parvis bollards, then the street centre. */
export function routeLane(x: number): number {
  if (x < 148) return 0;
  if (x < 176) return 1;
  return 0;
}
