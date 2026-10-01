// SPDX-License-Identifier: MIT
// The campus data (FF-C1 item 1, D-21): the types of data/campus.json (`foundry-floor.campus/1`), written by
// scripts/build-campus.ts from the structures contract, the accepted blueprint (v7) and the measured structure
// exports, and read by the exterior scene as pack data `campus`. Pure: no three, React or DOM, so the build script,
// the bun tests and the scene share it.
//
// Campus frame (contract): x = u (north +), y up, z = v (east +), metres, right-handed, the roundabout centre at the
// origin. A placement puts a model's own frame at `position` turned by `yawDeg` about +Y (three.js rotation.y: a
// point (x, z) of the model lands at (x cos + z sin, -x sin + z cos) + position). Every placement yaw is 0 or 180
// degrees (no mirroring: the E hands are real mirrored builds).
export const CAMPUS_SCHEMA = 'foundry-floor.campus/1';
/** The pack data entry holding data/campus.json. */
export const CAMPUS_DATA_ID = 'campus';

export type V2 = [number, number];
export type V3 = [number, number, number];
export interface Box3Json { min: V3; max: V3 }
export type CampusTierName = 'minimal' | 'economy' | 'balanced' | 'high';
export const CAMPUS_TIER_NAMES: readonly CampusTierName[] = ['minimal', 'economy', 'balanced', 'high'];
export type CampusViewName = 'campus' | 'pair' | 'canopy' | 'split' | 'bridge' | 'roundabout';
export const CAMPUS_VIEW_NAMES: readonly CampusViewName[] = ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout'];

/** One structure export as the campus uses it (measured from the pinned GLB). */
export interface CampusModel {
  piece: 'S1' | 'S2' | 'S3' | 'S4' | 'S5'; kind: 'head' | 'hall' | 'link' | 'canopy' | 'bridge'; tier: 'full' | 'far';
  /** The far shell drawn beyond the swap distance, or null (S3 and S4 have one tier). */
  far: string | null;
  glb: string; revision: string; bytes: number; sha256: string;
  triangles: number; meshes: number; materials: string[]; bounds: Box3Json;
}
export interface CampusPlacement {
  id: string; piece: CampusModel['piece']; model: string; far: string | null;
  /** The building (SW, SE, NE, NW) of an S1 or S2, else null. */
  building: string | null;
  position: V3; yawDeg: number;
  /** Where the contract or blueprint puts it (the clause quoted). */
  rule: string;
  /** Measured on the placed full model (campus frame). */
  bounds: Box3Json;
  farBounds: Box3Json | null;
}
/** An axis-aligned solid in the campus frame (a placed model's top-level part): orbit floor and camera obstruction. */
export interface CampusSolid { placement: string; part: string; min: V3; max: V3 }

// ---------------------------------------------------------------- roads

export interface RoadPalette { grade: string; asphalt: string; apron: string; marking: string; centre: string; kerb: string; island: string; parking: string; plaza: string }
export interface DashPattern { dash: number; gap: number }
export interface CampusRoads {
  /** Every road surface lies at this height (grade). */
  gradeY: number;
  palette: RoadPalette;
  /** The grade plane: a disc of this radius around the origin, beyond which the sky meets it. */
  gradeRadius: number;
  split: {
    /** Paved from u[0] to u[1] (blueprint), |v| <= halfWidth. */
    u: V2; halfWidth: number;
    lanes: { perDirection: number; width: number; firstCentre: number };
    /** Lines (|v|): the dashed centre line at 0, dashed lane lines, the solid inner edge line and the outer edge line. */
    lineWidth: number; centreDash: DashPattern; laneDash: DashPattern; edgeLine: number; outerEdgeLine: number;
    /** Markings stop this far (|u|) from the roundabout centre. */
    markingsFrom: number;
    /** The dissolve stretch at each end: the surface blends into grade over this length (from |u| = u[1] - dissolve). */
    dissolve: number;
    /** The drivable road ends here (|u|); the car stops roadEnd.stopDistance before it. */
    carEnd: number;
  };
  cross: {
    /** Paved |u| <= halfWidth from the roundabout out to |v| = v (blueprint). */
    halfWidth: number; v: number;
    /** The drivable stubs end at |v| = stubEnd, short of the links' near faces (measured); the outer legs from |v| = outerFrom are drawn, not driven. */
    stubEnd: number; outerFrom: number;
    lanes: { perDirection: number; width: number; firstCentre: number };
    dissolve: number;
  };
  roundabout: {
    radius: number; island: number; kerb: number;
    /** A lighter apron from island + kerb to apronTo; circulating lanes from lanes.inner outward. */
    apronTo: number;
    lanes: { count: number; width: number; inner: number };
    /** Approach and exit fillet radius joining lane k of the split road to ring lane k. */
    fillet: number;
  };
  /** Drop-off bays under the canopies: paved and drivable, |v| from the road edge to the canopy kerb. */
  dropOff: { u: V2; v: V2 }[];
  /** Plazas (paved, not drivable) under each canopy. */
  plazas: { u: V2; v: V2 }[];
}

/** A traffic lane as a path: straight lines and circular arcs in the (u, v) plane. Angles are atan2(v, u) in radians. */
export type LaneSegment =
  | { kind: 'line'; from: V2; to: V2; length: number }
  | { kind: 'arc'; centre: V2; radius: number; start: number; sweep: number; length: number };
export interface CampusLane {
  id: string; direction: 'north' | 'south';
  /** Index across the carriageway, 0 next to the centre line. */
  index: number;
  speed: number; length: number;
  segments: LaneSegment[];
}

export interface ParkingLoop {
  id: string; corner: string;
  /** A quadratic Bezier (blueprint) in (u, v), clipped where it would enter a building face. */
  curve: [V2, V2, V2];
  /** Parameter range kept (0..1). */
  t: V2;
  /** Aisle width, stall pitch along the aisle, stall depth each side. */
  aisle: number; pitch: number; depth: number;
}
export interface CampusParking {
  loops: ParkingLoop[];
  /** A parked car's simple volume: body and cabin boxes (length, width, height; cabin offset back from the centre). */
  car: { body: V3; cabin: V3; cabinBack: number; lift: number };
  /** Share of stalls occupied (per tier scaled), and the seed of the occupancy and colour hash. */
  occupancy: number; seed: number;
  /** Linear-free sRGB paints of parked cars (plain palette, no brands). */
  paints: string[];
}
export interface CampusSatellites {
  /** One block: length along u, depth along v, height; a roof unit on top. */
  size: V3; roofUnit: V3;
  /** Block centres (campus frame). */
  centres: V2[];
  colour: string; roofColour: string;
}
export interface CampusLights {
  pole: { height: number; radius: number; arm: number; head: V3 };
  /** Pole positions (u, v) and the direction the arm points, as a heading atan2(v, u) in degrees (0 = north, 90 = east). */
  poles: { at: V2; headingDeg: number }[];
  colour: string; headColour: string; lampColour: string;
}
export interface CampusInterior {
  /** The twin's frame origin (FF2 walking surface Y 0) in the south-west head's building frame and in the campus frame. */
  building: string; placement: string;
  buildingFrame: V3; campus: V3; yawDeg: number;
  level: 1; walkingSurfaceY: number;
  /** FF2's plan extents (its own frame) and where they land (campus frame). */
  twinExtents: { x: V2; z: V2 }; campusExtents: { u: V2; v: V2 };
  entrance: V3; canopyDropOff: V3;
  /** The zone (campus frame) where Enter is offered to the car, and the orbit distance from the drop-off within which the orbit offers it. */
  enterZone: { u: V2; v: V2; maxSpeed: number }; orbitEnterDistance: number;
  note: string;
}
export interface CampusTier {
  /** Full models within this camera distance of a placement's bounds (m), far shells beyond (hysteresis 5 %). */
  fullWithin: number;
  /** Parked cars drawn (share of the occupied stalls); traffic density (headway, s) and cap per lane. */
  parking: number; trafficHeadway: number; trafficPerLane: number;
  /** Traffic LOD1 and LOD2 distances and the far limit (m, at a 50 degree field of view). */
  trafficLod: V3;
  /** Camera far plane outside (m). */
  far: number;
}
export interface CampusView { position: V3; target: V3; fov: number; label: string }
/** An exterior look: sky, fog, lights and emissive levels (the file's emissive is the base: a scale of 1 is as exported). */
export interface CampusLook {
  zenith: string; horizon: string; ground: string;
  fog: { colour: string; near: number; far: number };
  sun: { colour: string; intensity: number; azimuthDeg: number; elevationDeg: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  environmentIntensity: number; exposure: number;
  /** Emissive scale per exported material name (1 = as exported). */
  emissive: Record<string, number>;
  /** Street lamps' emissive level. */
  lamps: number;
}
export interface CampusCheck { name: string; pass: boolean; measured: Record<string, unknown>; rule: string }
export interface CampusDiscrepancy { id: string; source: string; says: string; built: string; resolution: string }

export interface CampusData {
  schema: typeof CAMPUS_SCHEMA;
  generatedBy: string;
  frame: { axes: string; origin: string; units: string; yaw: string; contract: string; blueprint: string };
  models: Record<string, CampusModel>;
  placements: CampusPlacement[];
  solids: CampusSolid[];
  roads: CampusRoads;
  lanes: CampusLane[];
  parking: CampusParking;
  satellites: CampusSatellites;
  lights: CampusLights;
  interior: CampusInterior;
  tiers: Record<CampusTierName, CampusTier>;
  views: Record<CampusViewName, CampusView>;
  looks: { day: CampusLook };
  orbit: { minDistance: number; maxDistance: number; maxPolar: number; clearance: number; bounds: Box3Json };
  counts: Record<string, number>;
  checks: CampusCheck[];
  discrepancies: CampusDiscrepancy[];
}

export function parseCampus(input: ArrayBuffer | Uint8Array | string): CampusData {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const data = JSON.parse(text) as CampusData;
  if (data.schema !== CAMPUS_SCHEMA) throw new Error(`campus data: schema ${String(data.schema)}, expected ${CAMPUS_SCHEMA}`);
  if (!Array.isArray(data.placements) || !data.placements.length) throw new Error('campus data: no placements');
  for (const p of data.placements) if (!data.models[p.model] || (p.far && !data.models[p.far])) throw new Error(`campus data: placement ${p.id} names an unknown model`);
  return data;
}

// ---------------------------------------------------------------- frame helpers

export const DEG = Math.PI / 180;
/** A point of a placed model's own frame in the campus frame. */
export function placePoint(position: readonly number[], yawDeg: number, x: number, y: number, z: number): V3 {
  const c = Math.cos(yawDeg * DEG), s = Math.sin(yawDeg * DEG);
  return [position[0]! + x * c + z * s, position[1]! + y, position[2]! - x * s + z * c];
}
/** A campus point in a placed model's own frame (the inverse of placePoint). */
export function unplacePoint(position: readonly number[], yawDeg: number, u: number, y: number, v: number): V3 {
  const c = Math.cos(yawDeg * DEG), s = Math.sin(yawDeg * DEG), du = u - position[0]!, dv = v - position[2]!;
  return [du * c - dv * s, y - position[1]!, du * s + dv * c];
}
/** Column-major 4x4 of a placement (three.js Matrix4.fromArray order). */
export function placementMatrix(position: readonly number[], yawDeg: number): number[] {
  const c = Math.cos(yawDeg * DEG), s = Math.sin(yawDeg * DEG);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, position[0]!, position[1]!, position[2]!, 1];
}
/** Distance from a point to an axis-aligned box (0 inside). */
export function boxDistance(b: Box3Json, x: number, y: number, z: number): number {
  const dx = Math.max(b.min[0] - x, 0, x - b.max[0]), dy = Math.max(b.min[1] - y, 0, y - b.max[1]), dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
  return Math.hypot(dx, dy, dz);
}
