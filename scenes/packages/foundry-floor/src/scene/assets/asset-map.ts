// SPDX-License-Identifier: MIT
// The asset map (data/assets.json, D-21) as the scene reads it: fetched from the pack as data entry `asset-map`, never
// bundled. It names every entity's GLB, measured nodes, clips, locators and scene rules; the scene wires models by it,
// so a new accepted asset is an entry here plus a placement, not a code change. Pure: no three, React or DOM.
export type V3 = [number, number, number];
export interface Box3Json { min: V3; max: V3; size?: V3 }
export type ClipPlay = 'productive-loop' | 'down-open' | 'down-close' | 'lot-start' | 'batch-start' | 'batch-end' | 'port-state' | 'handoff'
  | 'running-loop' | 'people' | 'floor-move' | 'driven' | 'not-played';
/** `closed`: every channel ends on its first key (measured). Whether the scene loops a clip is its `play` rule: the GLBs
 *  carry no loop flags, and a closed clip can be a one-shot (the humanoid Handoff). */
export interface AssetClip { name: string; seconds: number; closed: boolean; targets: string[]; play: ClipPlay; emitted: string; sweep?: Box3Json }
export interface LodClass { nearM: number; farM: number }
export interface AssetEntity {
  asset: string;
  status: 'accepted' | 'review-candidate' | 'wired' | 'pending';
  class: string;
  sim: string;
  glb: string | null;
  instances: { pilot: number; megafab: number; phone: number };
  hideByDefault?: string[];
  hideable?: string[];
  obstacles?: string[];
  variants?: Record<string, { show?: string[]; root?: string; materials?: Record<string, string>; note?: string }>;
  tint?: { material: string; by: string; colours: Record<string, string | null>; note?: string };
  clips?: AssetClip[];
  drive?: Record<string, string>;
  scale?: { value: number; why: string };
  people?: { walkSpeedMps: number; walkDesignSpeedMps: number; activities: { walk: string; idle: string; service: string } };
  proxy?: { parts: { name: string; min: V3; max: V3; colour: string }[]; note?: string };
  placements?: string;
  lod?: string | null;
  measured?: {
    root: string; bounds: Box3Json; lod1Bounds: Box3Json | null; subtrees?: Record<string, Box3Json>; nodeBounds?: Record<string, Box3Json>;
    poses?: Record<string, V3>; triangles: { detailed: number; lod1: number; hiddenByDefault: number }; materials: string[];
  };
  locators?: Record<string, V3>;
  /** Provenance, never read by the scene. The package map names the author workspace and its output file (staging reads
   *  them); the ff3 pack's copy names the author as the site does (model and harness) with the Kiln asset, the requested
   *  effort and the run stage, and `file` is the delivered file's name (scripts/pack-hygiene.ts). */
  source?: { author: string; file: string; revision: string; review: string; asset?: string; requestedEffort?: string; confirmedEffort?: string | null; stage?: string };
  pins?: { bytes: number; sha256: string };
}
export interface SwapMaterial { color: string; roughness: number; metalness: number; opacity?: number; emissive?: string }
export interface AssetMap {
  schema: string;
  lod: { classes: Record<string, LodClass | null> };
  palette: {
    family: Record<string, string>; shell: string; panel: string; graphite: string; amhs: string; floor: string; litho: string;
    foup: Record<string, string>; lamps: Record<string, string>; swaps: Record<string, SwapMaterial>;
  };
  entities: Record<string, AssetEntity>;
  /** FF-C1: the campus structure exports (scripts/structures.ts), keyed by pack model id. The interior never reads it. */
  structures?: Record<string, StructureEntry>;
}
export interface StructureEntry {
  piece: 'S1' | 'S2' | 'S3' | 'S4' | 'S5'; kind: 'head' | 'hall' | 'link' | 'canopy' | 'bridge'; hand: 'W' | 'E' | null; tier: 'full' | 'far'; pair: string | null;
  glb: string;
  /** Provenance as for AssetEntity.source (the pack's copy in the site's wording). */
  source: { author: string; file: string; asset: string; revision: string; parentRevision: string | null; createdAt: string; review: string; requestedEffort?: string; confirmedEffort?: string | null; stage?: string };
  pins: { bytes: number; sha256: string }; budget: number;
  measured: { root: string; nodes: number; meshes: number; primitives: number; triangles: number; bounds: Box3Json; parts: string[]; locators: Record<string, V3>; materials: { name: string }[] };
}

export const ASSET_MAP_ID = 'asset-map';
export const ASSET_MAP_SCHEMA = 'foundry-floor.asset-map/2';

/** Parses the pack's asset map and checks the parts the scene relies on. */
export function parseAssetMap(bytes: ArrayBuffer | string): AssetMap {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
  const map = JSON.parse(text) as AssetMap;
  if (map.schema !== ASSET_MAP_SCHEMA) throw new Error(`The asset map is ${String(map.schema)}, not ${ASSET_MAP_SCHEMA}`);
  for (const [id, e] of Object.entries(map.entities)) {
    if (e.glb && (!e.measured || !e.pins)) throw new Error(`Asset map entity ${id} names a GLB without measurements and pins`);
    if (!e.glb && !e.proxy && e.status !== 'accepted') continue;
  }
  return map;
}

/** The LOD distances of an entity's class, or null when it always draws detailed. */
export function lodRule(map: AssetMap, e: AssetEntity): LodClass | null {
  return e.lod ? (map.lod.classes[e.lod] ?? null) : null;
}

/** The clip with this play rule, if any (the first one). */
export function clipsBy(e: AssetEntity, play: ClipPlay): AssetClip[] {
  return (e.clips ?? []).filter(c => c.play === play);
}
