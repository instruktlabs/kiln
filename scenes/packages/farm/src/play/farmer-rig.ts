import { LoopRepeat, Quaternion, Vector3 } from 'three/webgpu';
import type { Mesh, Object3D } from 'three/webgpu';
import { registerWarmPoseVariant } from '../world/prewarm';
import type { FarmInstance } from '../world/types';

/** Ports of the sealed `interaction-rig.mjs` poses. Authored GLBs stay byte-identical;
 * every pose update reuses captured or module scratch objects (SPEC 12.4 rule 2). */
const find = (root: Object3D, name: string): Object3D => {
  const node = root.getObjectByName(name); if (!node) throw new Error('Missing rig joint ' + name); return node;
};
export interface EmptyHandedPose { apply(): void; restore(): void; dispose(): void }
/** Scene-only relaxed right arm, borrowed from the saved left arm. The original tool
 * grip and asymmetric forearm remain intact for seating and overview/tool poses. */
export function createEmptyHandedPose(farmer: Object3D): EmptyHandedPose {
  const left = find(farmer, 'Joint_LeftShoulder'), right = find(farmer, 'Joint_RightShoulder');
  const leftElbow = find(farmer, 'Joint_LeftElbow'), elbow = find(farmer, 'Joint_RightElbow');
  const source = find(farmer, 'Mesh_Consolidated_Joint_LeftElbow_0') as Mesh;
  const original = find(farmer, 'Mesh_Consolidated_Joint_RightElbow_0') as Mesh;
  const attachment = find(farmer, 'Joint_RightHandToolAttachment');
  if (!source.isMesh || !original.isMesh) throw new Error('Missing farmer consolidated lower-arm geometry');
  // This whole saved mesh is only elbow, forearm, palm, fingers and thumb. Mirroring the
  // complete surface retains its wrist contact without guessing vertex splits or dimensions.
  // Mesh's negative determinant selects the renderer's mirrored front-face convention.
  const relaxed = source.clone(false); relaxed.name = 'Mesh_EmptyHandedRightArm';
  relaxed.position.z *= -1; relaxed.scale.z *= -1;
  relaxed.quaternion.set(-source.quaternion.x, -source.quaternion.y, source.quaternion.z, source.quaternion.w);
  relaxed.userData = { farmEmptyHanded: { source: source.name, borrowedGeometry: true }, farmPoseVisibility: true };
  relaxed.visible = false; elbow.add(relaxed);
  const unregisterWarm = registerWarmPoseVariant(relaxed);
  const leftRest = left.quaternion.clone(), rightRest = right.quaternion.clone(), elbowRest = elbow.quaternion.clone();
  const relaxedElbow = leftElbow.quaternion.clone(); relaxedElbow.set(-relaxedElbow.x, -relaxedElbow.y, relaxedElbow.z, relaxedElbow.w);
  const originalVisible = original.visible, attachmentVisible = attachment.visible;
  const originalAnchor = original.userData.farmPoseVisibility; original.userData.farmPoseVisibility = true;
  let disposed = false;
  function restore() {
    relaxed.visible = false; original.visible = originalVisible; attachment.visible = attachmentVisible;
    left.quaternion.copy(leftRest); right.quaternion.copy(rightRest); elbow.quaternion.copy(elbowRest);
  }
  return { apply() {
    if (disposed) return;
    // Keep the authored forward/back swing and the measured outward hip clearance.
    left.rotation.x = .28; right.rotation.set(-.28, 0, -left.rotation.z); elbow.quaternion.copy(relaxedElbow);
    original.visible = false; attachment.visible = false; relaxed.visible = true;
  }, restore, dispose() {
    if (disposed) return; disposed = true; restore(); unregisterWarm(); relaxed.removeFromParent();
    if (originalAnchor === undefined) delete original.userData.farmPoseVisibility; else original.userData.farmPoseVisibility = originalAnchor;
    // The saved geometry/material belong to the loaded pack; this derivative owns neither.
  } };
}
type PlayerClip = 'Idle' | 'Walk';
/** Only the player locomotion clips blend. Explicit seat/overview restores still stop
 * them immediately. Weights advance with the one rendered mixer update, not physics steps. */
export function createFarmerClipBlend(player: FarmInstance, indices: Record<PlayerClip, string>) {
  const actions = { Idle: player.mixer.clipAction(player.clips[Number(indices.Idle)]!), Walk: player.mixer.clipAction(player.clips[Number(indices.Walk)]!) };
  const duration = .15;
  let target: PlayerClip | null = null, walkWeight = 0, fromWeight = 0, elapsed = duration;
  function reset() {
    player.mixer.stopAllAction();
    for (const action of Object.values(actions)) action.setEffectiveWeight(0);
    target = null; walkWeight = fromWeight = 0; elapsed = duration;
    player.action = null; player.clipIndex = '';
  }
  return {
    select(name: PlayerClip, timeScale = 1) {
      const action = actions[name];
      if (!target) {
        reset(); walkWeight = name === 'Walk' ? 1 : 0; fromWeight = walkWeight;
        action.reset().setLoop(LoopRepeat, Infinity).setEffectiveWeight(1).play();
      } else if (target !== name) {
        // A reversed fade starts at the currently rendered weights and keeps active clip
        // time. Reset only a retired action; never restart one still contributing a pose.
        if (!action.isScheduled()) action.reset().setLoop(LoopRepeat, Infinity).setEffectiveWeight(name === 'Walk' ? walkWeight : 1 - walkWeight).play();
        fromWeight = walkWeight; elapsed = 0;
      }
      target = name; action.timeScale = timeScale;
      player.action = action; player.clipIndex = indices[name];
    },
    update(dt: number) {
      if (!target) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, dt));
      walkWeight = fromWeight + ((target === 'Walk' ? 1 : 0) - fromWeight) * (elapsed / duration);
      actions.Walk.setEffectiveWeight(walkWeight); actions.Idle.setEffectiveWeight(1 - walkWeight);
      if (elapsed === duration) {
        const outgoing = actions[target === 'Walk' ? 'Idle' : 'Walk'];
        if (outgoing.isScheduled()) outgoing.stop();
      }
      player.mixer.update(dt);
    },
    reset,
  };
}
/** Rest transforms captured once at construction, restored like the pilot's restoreRig. */
export interface RigRest { restore(): void }
export function captureRest(root: Object3D): RigRest {
  const nodes: Object3D[] = [], positions: Vector3[] = [], rotations: Quaternion[] = [];
  root.traverse(node => { if (node === root) return; nodes.push(node); positions.push(node.position.clone()); rotations.push(node.quaternion.clone()); });
  return { restore() { for (let i = 0; i < nodes.length; i++) { nodes[i]!.position.copy(positions[i]!); nodes[i]!.quaternion.copy(rotations[i]!); } } };
}
interface Limb { hip: Object3D; knee: Object3D; ankle: Object3D; direction: Vector3 }
interface Arm { shoulder: Object3D; elbow: Object3D; lower: Vector3; lowerUnit: Vector3; target: Vector3 }
export interface SeatRig { apply(): void }
const up = new Vector3(0, -1, 0), seatAt = new Vector3(), offset = new Vector3(), upper = new Vector3(), target = new Vector3(), axis = new Vector3();
const bend = new Vector3(), desiredElbow = new Vector3(), elbowUnit = new Vector3(), desiredLower = new Vector3(), inverse = new Quaternion();
/** Two-bone seat IK with the measured asymmetric forearms (pilot `seatFarmer`). */
export function createSeatRig(farmer: Object3D, tractor: Object3D): SeatRig {
  const pelvis = find(farmer, 'Joint_Pelvis'), seat = find(tractor, 'Joint_SeatAttach'), chest = find(farmer, 'Joint_Chest');
  const legs: Limb[] = (['Left', 'Right'] as const).map(side => ({ hip: find(farmer, `Joint_${side}Hip`), knee: find(farmer, `Joint_${side}Knee`), ankle: find(farmer, `Joint_${side}Ankle`),
    direction: new Vector3(Math.sqrt(.382 ** 2 - .15 ** 2 - .16 ** 2), .15, side === 'Left' ? -.16 : .16).normalize() }));
  const arms: Arm[] = (['Left', 'Right'] as const).map(side => {
    const right = side === 'Right', lower = right ? new Vector3(.15, -.035, .113) : new Vector3(.005, -.242, 0);
    return { shoulder: find(farmer, `Joint_${side}Shoulder`), elbow: find(farmer, `Joint_${side}Elbow`), lower, lowerUnit: lower.clone().normalize(), target: new Vector3(-.20, 1.68, right ? .235 : -.235) };
  });
  return { apply() {
    tractor.updateWorldMatrix(true, true); seat.getWorldPosition(seatAt);
    farmer.position.copy(seatAt).add(offset.set(.09, .133 - pelvis.position.y, 0).applyQuaternion(tractor.quaternion)); farmer.quaternion.copy(tractor.quaternion);
    for (const leg of legs) { leg.hip.quaternion.setFromUnitVectors(up, leg.direction); leg.knee.quaternion.copy(leg.hip.quaternion).invert(); leg.ankle.quaternion.identity(); }
    chest.rotation.set(0, 0, -.05); farmer.updateWorldMatrix(true, true);
    // Aim the existing rigid hands at the near rim; no guessed scale or replacement body geometry.
    for (const arm of arms) {
      arm.shoulder.quaternion.identity(); arm.elbow.quaternion.identity(); farmer.updateWorldMatrix(true, true);
      upper.copy(arm.elbow.position); const a = upper.length(), b = arm.lower.length();
      target.copy(arm.target); tractor.localToWorld(target); arm.shoulder.parent!.worldToLocal(target); target.sub(arm.shoulder.position);
      const d = Math.min(a + b - .001, Math.max(Math.abs(a - b) + .001, target.length()));
      axis.copy(target).normalize(); bend.copy(up).addScaledVector(axis, axis.y).normalize();
      const along = (a * a + d * d - b * b) / (2 * d);
      desiredElbow.copy(axis).multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
      arm.shoulder.quaternion.setFromUnitVectors(upper.normalize(), elbowUnit.copy(desiredElbow).normalize());
      desiredLower.copy(axis).multiplyScalar(d).sub(desiredElbow).applyQuaternion(inverse.copy(arm.shoulder.quaternion).invert()).normalize();
      arm.elbow.quaternion.setFromUnitVectors(arm.lowerUnit, desiredLower);
    }
    farmer.updateWorldMatrix(true, true);
  } };
}
