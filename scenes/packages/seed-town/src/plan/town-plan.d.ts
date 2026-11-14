/** Types for the seeded town planner in `town-plan.js`. Lengths in a plan are metres unless a field says tenths. */
export type PlanValue = string | number | boolean;

export interface TownPlacement {
  id: string;
  kit: string;
  values: Record<string, PlanValue>;
  pos: [number, number, number];
  /** Degrees about Y. */
  yaw: number;
}

export interface TownBuilding {
  type: 'shop' | 'house' | 'inn' | 'gate' | 'flank';
  bays: number;
  /** Bay width, tenths of a metre. */
  bw: number;
  /** Start along the row, tenths of a metre. */
  start: number;
  storeys: number;
  /** Eaves height, tenths of a metre. */
  height: number;
  /** Ridge height above the eaves, tenths of a metre. */
  rise: number;
  /** Index of the bay with a through passage, or -1. */
  passage: number;
  fronts: string[];
}

export interface TownSide {
  name: string;
  mode: 'street' | 'closing' | 'square' | 'bare';
  /** `lx` runs out from the building line, `lz` along the row. */
  frame: { origin: [number, number, number]; yaw: number; pavement: number; road: number };
  buildings: TownBuilding[];
}

export interface TownShot {
  name: string;
  camera: { position: [number, number, number]; target: [number, number, number]; fovDeg: number };
}

export interface TownPlan {
  seed: string;
  dusk: boolean;
  town: { length: number; x0: number; x1: number; kerbHeight: number; buildings: number };
  streets: { name: string; x: number; pavement: number; road: number; width: number }[];
  gaps: { column: number; type: 'lane' | 'square'; from: number; to: number; x0: number; x1: number; lanePavement: number; laneRoad: number }[];
  /** Each street's two ends: open where its road leaves the town, closed by a gatehouse row otherwise. `road` is the carriageway's half width. */
  ends: { street: string; end: 'N' | 'S'; open: boolean; x: number; z: number; road: number }[];
  sides: TownSide[];
  placements: TownPlacement[];
  cameras: Record<string, TownShot>;
}

export function planTown(
  seed: string | number,
  options?: { dusk?: boolean; streets?: number; buildings?: number; square?: boolean },
): TownPlan;
