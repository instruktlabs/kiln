import { AnimationMixer, Group, LoopOnce, LoopRepeat, MathUtils } from 'three/webgpu';
import type { Mesh, Object3D, Skeleton, SkinnedMesh } from 'three/webgpu';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import type { FarmInstance, FarmLayout } from './types';

const cropAssets = new Set(['cabbage-stage-1', 'cabbage-stage-2', 'cabbage-stage-3', 'cabbage-stage-4', 'wheat', 'pumpkin-plant']);
export const soilPartName = (id: string): string | null => id.startsWith('cabbage-stage-') ? 'Mesh_SoilMound' : id === 'wheat' || id === 'pumpkin-plant' ? 'Mesh_Soil' : null;

/** The soil and plant are independent siblings in the sealed reusable models. */
export function applyPlanting(object: Object3D, id: string, withSoil: boolean | undefined): { soil: Object3D; plant: Object3D } | undefined {
  const name = soilPartName(id); if (!name) return;
  const soil = object.getObjectByName(name), plant = object.getObjectByName('Plant');
  if (!soil || !plant || soil === plant || soil.parent === plant) throw new Error('Missing independent soil/plant contract: ' + id);
  soil.visible = !!withSoil; return { soil, plant };
}
export function sceneClipTimeScale(assetId: string, clipName: string): number { return assetId === 'watermill' && clipName === 'Spin' ? -1 : 1; }

/** Exact pilot action policy, including rest pose, one-shot doors and reverse watermill. */
export function chooseClip(instance: FarmInstance, index: string): void {
  const clip = index === '' ? null : instance.clips[Number(index)];
  if (index !== '' && !clip) throw new Error(`Missing clip ${index} for ${instance.id}`);
  instance.mixer.stopAllAction(); instance.action = null; instance.clipIndex = index; instance.mixer.update(0);
  if (clip) {
    const action = instance.mixer.clipAction(clip).reset(); instance.action = action;
    action.timeScale = sceneClipTimeScale(instance.asset.id, clip.name);
    const oneShot = clip.name === 'Open' || clip.name === 'Close' || clip.name === 'DoorOpen';
    action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity); action.clampWhenFinished = oneShot; action.play();
  }
  instance.object.updateMatrixWorld(true);
}
export interface InitialClipState { id: string; instanceIndex: number; clipIndex: string; clip: string | null; time: number; timeScale: number }
/** Global expanded placement order supplies the .37-second offset, not species order. */
export function initializeClips(instances: readonly FarmInstance[]): InitialClipState[] {
  const states: InitialClipState[] = [];
  for (let n = 0; n < instances.length; n++) {
    const instance = instances[n]!, id = instance.asset.id;
    const preferred = id === 'windmill' || id === 'watermill' ? 'Spin' : id === 'cow' || id === 'sheep' || id === 'chicken' ? (instance.clips.some(c => c.name === 'Graze') ? 'Graze' : 'Idle') : null;
    const index = instance.clips.findIndex(c => c.name === preferred);
    if (index >= 0) { chooseClip(instance, String(index)); instance.action!.time = (n * .37) % instance.clips[index]!.duration; }
    states.push({ id: instance.id, instanceIndex: n, clipIndex: instance.clipIndex, clip: instance.action?.getClip().name ?? null, time: instance.action?.time ?? 0, timeScale: instance.action?.timeScale ?? 1 });
  }
  return states;
}
/** Called at M2b, after old batches are restored and before replacement batches are built. */
export function setCropShadows(instances: readonly FarmInstance[], enabled: boolean, receive?: boolean): number {
  let count = 0;
  for (const instance of instances) if (cropAssets.has(instance.asset.id)) instance.object.traverse(object => {
    const mesh = object as Mesh; if (mesh.isMesh) { mesh.castShadow = enabled; if (receive !== undefined) mesh.receiveShadow = receive; count++; }
  });
  return count;
}
export interface PlacementStats { placements: number; byAsset: Record<string, number>; omittedParts: number; hiddenSoil: number; mixers: number; readonly activeMixers: number }
export interface BuiltPlacements {
  root: Group;
  instances: FarmInstance[];
  initialClips: InitialClipState[];
  stats: PlacementStats;
  initializeClips(): InitialClipState[];
  /** Ambient clips; `except` (the farmer in play) is advanced by the play system instead. */
  updateMixers(dt: number, except?: FarmInstance): void;
  dispose(): void;
}

/** Imperative placement assembly. Geometry, material and texture ownership stays with pack. */
export function buildPlacements(pack: LoadedPack, layout: FarmLayout): BuiltPlacements {
  const root = new Group(); root.name = 'Farm placements';
  const instances: FarmInstance[] = [], initialClips: InitialClipState[] = [], skeletons = new Set<Skeleton>();
  let disposed = false, clipsInitialized = false;
  const stats: PlacementStats = { placements: 0, byAsset: {}, omittedParts: 0, hiddenSoil: 0, mixers: 0,
    get activeMixers() { let count = 0; for (const instance of instances) if (instance.action) count++; return count; } };
  const alive = () => { if (disposed) throw new Error('Farm placements are disposed'); };
  const dispose = () => {
    if (disposed) return; disposed = true;
    const errors: unknown[] = [], attempt = (fn: () => void) => { try { fn(); } catch (error) { errors.push(error); } };
    for (const instance of instances) {
      attempt(() => instance.mixer.stopAllAction()); attempt(() => instance.mixer.uncacheRoot(instance.mixer.getRoot()));
      instance.action = null; attempt(() => instance.object.removeFromParent());
    }
    instances.length = 0; initialClips.length = 0;
    for (const skeleton of skeletons) attempt(() => skeleton.dispose()); skeletons.clear();
    attempt(() => root.clear()); attempt(() => root.removeFromParent());
    if (errors.length) throw new AggregateError(errors, 'Farm placement cleanup failed');
  };
  try {
    for (const placement of layout.placements) {
      const original = pack.models.get(placement.asset);
      if (!original) throw new Error('Missing placement model: ' + placement.asset);
      const asset = { id: placement.asset };
      for (let n = 0; n < (placement.repeat?.count ?? 1); n++) {
        const object = clone(original.scene), wrapper = new Group();
        object.traverse(node => { const mesh = node as SkinnedMesh; if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
        for (const path of placement.omittedPartPaths ?? []) {
          const names = path.split('/'); let part = object.getObjectByName(names[0]!);
          for (let i = 1; i < names.length; i++) part = part?.children.find(child => child.name === names[i]);
          if (!part || part === object) throw new Error('Missing removable assembly part ' + placement.id + ': ' + path);
          part.removeFromParent(); stats.omittedParts++;
        }
        wrapper.name = placement.id + '-' + n; wrapper.position.fromArray(placement.position);
        if (placement.repeat) { const step = placement.repeat.step; wrapper.position.x += step[0] * n; wrapper.position.y += step[1] * n; wrapper.position.z += step[2] * n; }
        wrapper.rotation.y = MathUtils.degToRad(placement.yaw); wrapper.add(object); root.add(wrapper);
        object.traverse(node => { const mesh = node as Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
        const soilVisible = soilPartName(asset.id) ? placement.soilMode !== 'terrain' : undefined;
        applyPlanting(object, asset.id, soilVisible); if (soilVisible === false) stats.hiddenSoil++;
        instances.push({ id: wrapper.name, asset, object: wrapper, soilVisible, mixer: new AnimationMixer(object), clips: original.animations, action: null, clipIndex: '' });
        stats.placements++; stats.mixers++; stats.byAsset[asset.id] = (stats.byAsset[asset.id] ?? 0) + 1;
      }
    }
  } catch (error) {
    try { dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Farm placement assembly and cleanup failed'); }
    throw error;
  }
  return { root, instances, initialClips, stats, initializeClips() {
    alive(); if (!clipsInitialized) { initialClips.push(...initializeClips(instances)); clipsInitialized = true; } return initialClips;
  }, updateMixers(dt, except) { alive(); const delta = Math.min(.1, dt); for (const instance of instances) if (instance.action && instance !== except) instance.mixer.update(delta); }, dispose };
}
