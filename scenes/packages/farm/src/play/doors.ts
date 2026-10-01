import { Box3, MathUtils, Vector3 } from 'three/webgpu';
import type { Interpolant, KeyframeTrack, Object3D } from 'three/webgpu';
import { FARM_DOORS } from '../constants';
import { DOOR_LABELS, doorStatus, FARM_STRINGS } from '../ui/strings';
import type { FarmInstance } from '../world/types';

/** One door mechanism (INV 6.3). `amount` is the applied pose; `target` is 0 or 1. */
export interface FarmDoor {
  readonly instance: FarmInstance;
  readonly pivots: readonly Object3D[];
  readonly label: string;
  amount: number;
  target: number;
  apply(value: number): void;
}
const bounds = new Box3();

/** Port of the sealed `interaction-rig.mjs` findDoor. Returns null for other assets. */
export function findDoor(instance: FarmInstance): FarmDoor | null {
  const root = instance.object, id = instance.asset.id;
  if (id === 'barn' || id === 'fence-gate') {
    const clip = instance.clips.find(c => c.name === 'Open'); if (!clip) return null;
    const pivots = clip.tracks.map(track => root.getObjectByName(track.name.split('.')[0]!));
    if (pivots.some(pivot => !pivot)) throw new Error('Missing door pivot ' + id);
    // `createInterpolant` is assigned per track by three's setInterpolation (untyped in @types/three).
    const tracks: Interpolant[] = clip.tracks.map(track => (track as KeyframeTrack & { createInterpolant(): Interpolant }).createInterpolant());
    const nodes = pivots as Object3D[];
    return { instance, pivots: nodes, label: DOOR_LABELS[id], amount: 0, target: 0,
      apply(value) {
        for (let i = 0; i < tracks.length; i++) nodes[i]!.quaternion.fromArray(tracks[i]!.evaluate(value * clip.duration));
        // The frame graph stops automatic world updates; this keeps door colliders current.
        root.updateWorldMatrix(true, true);
      } };
  }
  let pivot: Object3D | undefined, closed: number, opened: number, label: string;
  if (id === 'farmhouse') { pivot = root.getObjectByName('Joint_FrontDoor'); closed = 0; opened = Math.PI * .53; label = DOOR_LABELS.farmhouse; }
  else if (id === 'watermill') { pivot = root.getObjectByName('DoorPivot'); closed = 0; opened = -Math.PI * 95 / 180; label = DOOR_LABELS.watermill; }
  else return null;
  if (!pivot) throw new Error('Missing door pivot ' + id);
  const node = pivot;
  return { instance, pivots: [node], label, amount: 0, target: 0,
    apply(value) { node.rotation.y = closed + (opened - closed) * value; root.updateWorldMatrix(true, true); } };
}
/** World-space pivot-bounds centre used for the nearest-interaction test. */
export function doorCenter(door: FarmDoor, out: Vector3): Vector3 {
  bounds.makeEmpty(); for (const pivot of door.pivots) bounds.expandByObject(pivot);
  return bounds.getCenter(out);
}
export interface DoorStepContext {
  /** True when the player's capsule overlaps the world after a door pose change. */
  blocked(): boolean;
  status: string;
  /** Reduced motion snaps doors to their target instead of easing (SPEC 13.4). */
  snap?: boolean;
}
/** One fixed 1/120 s step for every door, in the pilot's order and with its status rules. */
export function stepDoors(doors: readonly FarmDoor[], step: number, context: DoorStepContext): void {
  for (const door of doors) {
    const old = door.amount, next = context.snap ? door.target : MathUtils.damp(old, door.target, FARM_DOORS.damp, step);
    if (Math.abs(next - old) < 1e-5) continue;
    door.apply(next);
    if (context.blocked()) { door.apply(old); door.target = old; context.status = FARM_STRINGS.doorBlocked; }
    else door.amount = next;
    if (Math.abs(door.amount - door.target) < .001 && (context.status === doorStatus(door.label, true) || context.status === doorStatus(door.label, false))) context.status = '';
  }
}
/** Toggle the chosen door and return the status text the pilot shows. */
export function toggleDoor(door: FarmDoor): string {
  door.target = door.target > .5 ? 0 : 1;
  return doorStatus(door.label, door.target === 1);
}
