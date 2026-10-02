// Golden Gate scene frame (bridge REPORT.md, terrain frame.json): metres, +Y up, water at Y = 0,
// +X west (Pacific), +Z north (Marin), south tower at Z = -640.08. Right-handed.
// Scene values come from data/layout.json (D-21); this module only gives them convenient shapes.
import { LAYOUT } from './data';
import type { CameraPose, Vec3 } from './data';

export type { Vec3 } from './data';

export const SCENE_ID = 'golden-gate';

/** Bridge dimensions measured from the review-2 runtime GLB nodes (layout.json `bridge`). */
export const BRIDGE = LAYOUT.bridge;

/** Six lanes (three each way) between the 0.3048 m median and the curbs. Northbound (+Z) drives at X < 0. */
export const LANES = LAYOUT.lanes;
export const LANE_WIDTH = (BRIDGE.roadHalfWidth - BRIDGE.medianHalfWidth) / 3; // 3.0988 m
export const LANE_CENTERS = [0, 1, 2].map(i => Math.abs(LANES[i]!.x)); // 1.7018, 4.8006, 7.8994
/** Lane index 0..5: 0-2 northbound (X < 0, inner to outer), 3-5 southbound (X > 0, inner to outer). */
export function laneX(lane: number): number { return LANES[lane]!.x; }
export function laneDirection(lane: number): 1 | -1 { return LANES[lane]!.direction === 'north' ? 1 : -1; }

const cameras = LAYOUT.cameras;
export const CAMERA = {
  near: cameras.clip.near, far: cameras.clip.far,
  orbit: { ...cameras.orbit, maxPolar: cameras.orbit.maxPolarDeg * Math.PI / 180 },
  chase: cameras.chase,
} as const;

export interface NamedCamera { position: Vec3; target: Vec3; fov: number; note: string }
const named = (pose: CameraPose): NamedCamera => ({ position: pose.position, target: pose.target, fov: pose.fov, note: pose.notes ?? '' });
/** WATER-SPEC named cameras (`?cam=`), plus review views used by the capture script. */
export const NAMED_CAMERAS: Record<string, NamedCamera> = Object.fromEntries(Object.entries(cameras.named).map(([name, pose]) => [name, named(pose)]));
/** The terrain pipeline's recommended postcard pose (validation.json); WATER-SPEC's [350,125,1100] sat 0.39 m below ground. */
export const POSTCARD = { position: NAMED_CAMERAS.postcard!.position, target: NAMED_CAMERAS.postcard!.target, fov: NAMED_CAMERAS.postcard!.fov };
export const WATER_CAMERAS = cameras.waterReview;

/** International Orange as authored (#C0362C), as sRGB bytes. */
export const INTERNATIONAL_ORANGE = [1, 3, 5].map(i => parseInt(LAYOUT.referenceColours.internationalOrange!.slice(i, i + 2), 16)) as [number, number, number];

/** Credits shown in the scene (full text lives in the staged licences and credits.json). */
export const TRADEMARK_NOTE = 'The Golden Gate Bridge name and likeness are trademarks of the Golden Gate Bridge, Highway and Transportation District. The CC0 dedication covers copyright in this model only and grants no trademark rights.';

/**
 * Render layers: 0 reflected world, 1 water, 2 dynamic objects kept out of reflections (traffic, player car, fog banks).
 * Draw optimisation (High): 3 shadow depth stand-ins (the sun's shadow camera only), 4 drawn by the main and shadow cameras
 * but not the reflection (the near approaches), 5 drawn only in the reflection (the far approaches standing in for them).
 */
export const LAYERS = { world: 0, water: 1, dynamic: 2, shadowStandIn: 3, mainOnly: 4, reflectionOnly: 5 } as const;
