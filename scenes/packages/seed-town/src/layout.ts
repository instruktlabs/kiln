/**
 * What the page derives from a plan without any kit geometry: where the town sits in the scene,
 * where a visitor starts, the opening view, and the solid boxes of the buildings.
 */
import type { TownPlan, TownSide } from './plan/town-plan.js';

export const EYE_HEIGHT = 1.65;
/** Building depth behind the building line, metres: the planner's DEPTH. */
export const BUILDING_DEPTH = 8;
/** How far past the last building a visitor may walk, metres. */
export const MEADOW = 76;
/** How far outside the south end of the high street a walk begins, metres. */
export const START_OUT = 48;
/** How far the open ground is drawn: past the fog, so it has no visible edge. */
export const MEADOW_DRAWN = 900;

export interface Aabb { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export interface TownFrame {
  /** Added to plan coordinates so the town's middle stands on the scene origin. */
  offset: [number, number, number];
  /** Half extents of the built town about the origin. */
  halfX: number;
  halfZ: number;
  start: { x: number; z: number; yaw: number };
  orbit: { position: [number, number, number]; target: [number, number, number]; fov: number; minDistance: number; maxDistance: number };
  views: { id: string; label: string; position: [number, number, number]; target: [number, number, number]; fov: number }[];
}

const LABELS: Record<string, string> = {
  TOWN: 'Whole town', TOWN_BACK: 'From the north-east', PLAN: 'From above', STREET: 'Middle street', STREET_BACK: 'West street',
  LANE: 'Side lane', LANE_OVER: 'Over the lane', LANE_CORNER: 'Lane corner',
  SQUARE: 'Market square', SQUARE_OVER: 'Over the square', SQUARE_CORNER: 'Square corner',
};

export function townFrame(plan: TownPlan): TownFrame {
  const { x0, x1, length } = plan.town;
  const offset: [number, number, number] = [-(x0 + x1) / 2, 0, -length / 2];
  const move = (p: readonly [number, number, number]): [number, number, number] => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
  const street = plan.streets[Math.min(1, plan.streets.length - 1)]!;
  const views = Object.entries(plan.cameras).map(([id, shot]) => ({
    id, label: LABELS[id] ?? shot.name, position: move(shot.camera.position), target: move(shot.camera.target), fov: shot.camera.fovDeg,
  }));
  // One more view than the planner's: the town across its fields, from beside the south road.
  views.push({ id: 'ROAD_SOUTH', label: 'From the south road', position: [street.x + offset[0] - 46, 20, offset[2] - 128], target: [street.x + offset[0] + 6, 5, offset[2] + 10], fov: 48 });
  const overview = plan.cameras.TOWN;
  if (!overview) throw new Error('Seed town plan has no overview camera');
  const halfX = (x1 - x0) / 2, halfZ = length / 2, reach = Math.hypot(halfX, halfZ);
  return {
    offset, halfX, halfZ,
    // On the road south of the town, where it runs in between its trees, looking up the high street (+Z).
    start: { x: street.x + offset[0], z: -START_OUT + offset[2], yaw: Math.PI },
    orbit: { position: overviewPosition(move(overview.camera.position), reach), target: [0, 2, 0], fov: overview.camera.fovDeg, minDistance: 12, maxDistance: reach * 3.2 },
    views,
  };
}

/** The planner's overview direction, brought in until the town fills the opening frame. */
function overviewPosition(from: [number, number, number], reach: number): [number, number, number] {
  const length = Math.hypot(from[0], from[1] - 2, from[2]), distance = reach * 1.85;
  return [from[0] / length * distance, 2 + (from[1] - 2) / length * distance, from[2] / length * distance];
}

/** A point of a row's frame in plan coordinates. `lx` runs out from the building line, `lz` along the row. */
export function sidePoint(side: TownSide, lx: number, lz: number): [number, number] {
  const [ox, , oz] = side.frame.origin, yaw = side.frame.yaw;
  if (yaw === 0) return [ox + lx, oz + lz];
  if (yaw === 180) return [ox - lx, oz - lz];
  if (yaw === 90) return [ox + lz, oz - lx];
  if (yaw === 270) return [ox - lz, oz + lx];
  throw new Error(`Seed town row ${side.name} is turned ${yaw} degrees`);
}

/** One solid box per building, in plan coordinates. Flanks and backs dress a building that already has its box. */
export function buildingBoxes(plan: TownPlan): Aabb[] {
  const boxes: Aabb[] = [];
  for (const side of plan.sides) {
    for (const building of side.buildings) {
      if (building.type === 'flank') continue;
      const z0 = building.start / 10, z1 = (building.start + building.bays * building.bw) / 10;
      const a = sidePoint(side, -BUILDING_DEPTH, z0), b = sidePoint(side, 0, z1);
      boxes.push({
        minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]),
        minY: -1, maxY: (building.height + building.rise) / 10,
      });
    }
  }
  return boxes;
}
