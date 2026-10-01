import { Quaternion, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';

/** Ports of the sealed `interaction-rig.mjs` poses. Authored GLBs stay byte-identical;
 * every per-step call reuses module scratch objects (SPEC 12.4 rule 2). */
const find = (root: Object3D, name: string): Object3D => {
  const node = root.getObjectByName(name); if (!node) throw new Error('Missing rig joint ' + name); return node;
};
export interface EmptyHandedPose { apply(): void }
/** The source right forearm is authored across the body to hold a tool. */
export function createEmptyHandedPose(farmer: Object3D): EmptyHandedPose {
  const left = farmer.getObjectByName('Joint_LeftShoulder'), right = farmer.getObjectByName('Joint_RightShoulder'), elbow = farmer.getObjectByName('Joint_RightElbow');
  if (!left || !right || !elbow) throw new Error('Missing farmer arm rig');
  const relaxed = new Quaternion().setFromUnitVectors(new Vector3(.15, -.035, .113).normalize(), new Vector3(.02, -1, .06).normalize());
  // A small outward shoulder angle keeps the relaxed hands outside the hips through the full
  // authored stride, including chest yaw. Preserve the clip's forward/back shoulder swing.
  return { apply() { left.rotation.x = .28; right.rotation.set(-.28, 0, -left.rotation.z); elbow.quaternion.copy(relaxed); } };
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
