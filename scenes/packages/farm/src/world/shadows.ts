import { DirectionalLight, PropertyBinding } from 'three/webgpu';
import type { InstancedMesh, Object3D } from 'three/webgpu';
import type { CachedSunShadow, TrackedCasters } from '@kiln-scenes/scene-kit/shadows';
import { FARM_LOOK, FARM_SHADOW } from '../constants';
import type { FarmInstance } from './types';

/** `liveMapSize` unset keeps the live map at the tier's map size (the same texel as the static map). */
export interface FarmShadowOptions { cache: boolean; standIns: boolean; minCasterTexels: number; settleFrames: number; liveMapSize?: number }
/**
 * FARM_SHADOW with the test and dev A/B switches ?shadowCache, ?standIns, ?casterTexels (0 = no threshold) and ?liveMapSize,
 * the OD-9 "small live map" option for the owner (review RF-5: a full-size live map is a second full-size render target).
 */
export function farmShadowOptions(p: { shadowCache?: boolean; standIns?: boolean; casterTexels?: number; liveMapSize?: number }): FarmShadowOptions {
  return { cache: p.shadowCache ?? FARM_SHADOW.cache, standIns: p.standIns ?? FARM_SHADOW.standIns, minCasterTexels: Math.max(0, p.casterTexels ?? FARM_SHADOW.minCasterTexels), settleFrames: FARM_SHADOW.settleFrames,
    ...(p.liveMapSize && p.liveMapSize > 0 ? { liveMapSize: p.liveMapSize } : {}) };
}
/**
 * The layers the sun's shadow camera draws: layer 0, plus the stand-in layer when stand-ins are on (three r186 keeps a shadow
 * camera's own mask once it has a bit above 0). Lighting sets it, and the stand-ins bake only sources it draws.
 */
export function farmShadowMask(standIns: boolean): number { return 1 | (standIns ? 1 << FARM_SHADOW.standInLayer : 0); }
/** INV 4.1 sun at the tier's map size; the shadow projection is updated after every bound is assigned. */
export function createFarmSun(mapSize: number): DirectionalLight {
  const sun = new DirectionalLight(FARM_LOOK.sunColor, FARM_LOOK.sunIntensity), e = FARM_LOOK.shadowExtent;
  sun.position.fromArray(FARM_LOOK.sunPosition); sun.shadow.mapSize.setScalar(mapSize);
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: FARM_LOOK.shadowNear, far: FARM_LOOK.shadowFar });
  sun.shadow.normalBias = FARM_LOOK.shadowNormalBias; sun.shadow.camera.updateProjectionMatrix();
  return sun;
}
/**
 * farm.md section 4: what a hero keeps through the anchor merge and where its stand-ins cut. The placement wrapper, the GLB
 * clone root (the mixer root), every clip track target (mixer bindings were cached before optimization) and every node the
 * play code finds by name in a clone (Joint_*, DoorPivot), plus independently toggled
 * empty-hand arm meshes so their shadow stand-ins inherit the same visibility. Crop soil and plant names belong to fixed owners, never merged;
 * Mesh_Building_Wood is read from the pack's original scene.
 */
export function farmHeroAnchors(instance: FarmInstance): Set<Object3D> {
  const root = instance.mixer.getRoot() as Object3D, keep = new Set<Object3D>([instance.object, root]);
  for (const clip of instance.clips) for (const track of clip.tracks) { const node = PropertyBinding.findNode(root, PropertyBinding.parseTrackName(track.name).nodeName) as Object3D | undefined; if (node) keep.add(node); }
  root.traverse(n => { if (n.name.startsWith('Joint_') || n.name === 'DoorPivot' || n.userData.farmPoseVisibility === true) keep.add(n); });
  return keep;
}
export interface FarmShadowWorld {
  root: Object3D; placements: { instances: readonly FarmInstance[] }; sim: { doors: readonly { pivots: readonly Object3D[] }[] };
  optimization: { heroes: readonly FarmInstance[]; batches: { batches: readonly { mesh: InstancedMesh; dynamic: boolean }[] } } | null;
}
/**
 * What the cached shadow watches (shadow-internals.check: classify per node by observed motion). Whole hero subtrees (rotors,
 * doors and gates, the tractor, both farmers, also the trailer should anything move it), the herd's dynamic batches and door
 * pivots; a watched caster goes live only when its own matrix, visibility or casting changes, so still hero parts stay in the
 * static map. Without optimization (?staticBaseline) the animated, driven and walked owners themselves.
 */
export function farmShadowMovers(world: FarmShadowWorld): Set<Object3D> {
  const o = world.optimization, movers = new Set<Object3D>(o ? o.heroes.map(h => h.object) : world.placements.instances.filter(i => i.action || i.asset.id === 'tractor' || i.asset.id === 'farmer').map(i => i.object));
  for (const b of o?.batches.batches ?? []) if (b.dynamic) movers.add(b.mesh);
  for (const door of world.sim.doors) for (const pivot of door.pivots) movers.add(pivot);
  return movers;
}
/**
 * Binds a world to the session's cached sun shadow. It tracks the world once its root is shown (a first world tracked while
 * hidden would go live wholesale at reveal), and again for a new cache (lights rebuilt), then updates it each frame after all
 * motion and visibility (SystemOrder.shadows). `prime` belongs to the warm pass's drawing frame, the reveal. `dispose` (the
 * world leaving) untracks it, so a cache that outlives its world never keeps that world's casters (review RF-7).
 */
export function bindFarmShadow(world: FarmShadowWorld, cache: () => CachedSunShadow | null) {
  let bound: CachedSunShadow | null = null, movers: Set<Object3D> | null = null, tracked: TrackedCasters | null = null, disposed = false;
  return {
    update() {
      const s = disposed ? null : cache(); if (!s) return;
      if (s !== bound) { if (!world.root.visible) return; const m = movers ??= farmShadowMovers(world); tracked = s.track(world.root, { movable: n => m.has(n) }); s.invalidate('track'); bound = s; }
      s.update();
    },
    prime() { if (!disposed) cache()?.prime(); },
    dispose() { disposed = true; tracked?.untrack(); tracked = bound = null; },
  };
}
