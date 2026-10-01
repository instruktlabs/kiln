import { MathUtils, Quaternion, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import { FARM_TRACTOR } from '../constants';
import { drivingHeight, onBridge, riverCenter, riverWidth, terrainHeight } from '../world/site-layout';

/** Kinematic tractor from the sealed `play.mjs` (INV 6.4). Not physical; the trailer is never coupled. */
export interface TractorState { speed: number; steer: number; travel: number }
export interface TractorRig {
  readonly object: Object3D;
  readonly steerJoints: readonly Object3D[];
  readonly frontWheels: readonly Object3D[];
  readonly rearWheels: readonly Object3D[];
  readonly steeringWheel: Object3D;
  readonly steeringRest: Quaternion;
}
const find = (root: Object3D, name: string): Object3D => {
  const node = root.getObjectByName(name); if (!node) throw new Error('Missing tractor joint ' + name); return node;
};
export function createTractorRig(object: Object3D): TractorRig {
  const steeringWheel = find(object, 'Joint_SteeringWheelMount');
  return { object, steeringWheel, steeringRest: steeringWheel.quaternion.clone(),
    steerJoints: ['L', 'R'].map(side => find(object, 'Joint_Steer_F' + side)),
    frontWheels: ['L', 'R'].map(side => find(object, 'Joint_Wheel_F' + side)),
    rearWheels: ['L', 'R'].map(side => find(object, 'Joint_Wheel_R' + side)) };
}
const yAxis = new Vector3(0, 1, 0), turnQuaternion = new Quaternion(), old = new Vector3(), forward = new Vector3(), probe = new Vector3();
/** Wheel spin from travel, steer joints and the steering wheel mount about its local Y. */
export function applyTractorPose(rig: TractorRig, s: TractorState): void {
  for (let i = 0; i < 2; i++) {
    rig.steerJoints[i]!.rotation.y = s.steer; rig.frontWheels[i]!.rotation.z = -s.travel / .4; rig.rearWheels[i]!.rotation.z = -s.travel / .72;
  }
  rig.steeringWheel.quaternion.copy(rig.steeringRest).multiply(turnQuaternion.setFromAxisAngle(yAxis, -s.steer * 1.7));
}
/** Ground-plan limits: the +-33 m bound and the river margin outside the bridge deck. */
export function tractorAreaBlocked(x: number, z: number): boolean {
  return Math.abs(x) > FARM_TRACTOR.bound || Math.abs(z) > FARM_TRACTOR.bound
    || (!onBridge(x, z, FARM_TRACTOR.bridgeInset) && Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + FARM_TRACTOR.riverMargin);
}
export const TRACTOR_PROBES = [-FARM_TRACTOR.probeX, FARM_TRACTOR.probeX] as const;
export const TRACTOR_PROBE = { y: .23, radius: .90, height: 2.08 } as const;
/**
 * One fixed step. `gas` is W/S (forward positive); `turn` is positive to the left.
 * `probeBlocked` tests one world-space probe against the collision world with the tractor ignored.
 * Returns true when the step was rejected and the prior pose restored.
 */
export function driveTractor(rig: TractorRig, s: TractorState, gas: number, turn: number, dt: number, probeBlocked: (point: Vector3) => boolean): boolean {
  const object = rig.object;
  s.speed = MathUtils.damp(s.speed, gas * (gas > 0 ? FARM_TRACTOR.topSpeed : FARM_TRACTOR.reverseSpeed), gas ? 2.5 : 5, dt);
  s.steer = MathUtils.damp(s.steer, turn * FARM_TRACTOR.steerMax, 6, dt);
  old.copy(object.position); const oldYaw = object.rotation.y;
  object.rotation.y += s.speed * Math.tan(s.steer) / FARM_TRACTOR.wheelbase * dt;
  forward.set(Math.cos(object.rotation.y), 0, -Math.sin(object.rotation.y)); object.position.addScaledVector(forward, s.speed * dt);
  const p = object.position; p.y = drivingHeight(p.x, p.z); object.updateMatrixWorld(true);
  let blocked = tractorAreaBlocked(p.x, p.z);
  for (const x of TRACTOR_PROBES) { if (blocked) break; probe.set(x, TRACTOR_PROBE.y, 0); object.localToWorld(probe); if (probeBlocked(probe)) blocked = true; }
  if (blocked) { object.position.copy(old); object.rotation.y = oldYaw; s.speed = 0; }
  else s.travel += s.speed * dt;
  applyTractorPose(rig, s);
  return blocked;
}
/** Dismount options in tractor-local space; the first free one wins (INV 6.4). */
export const TRACTOR_EXITS = [[-.4, 0, 1.5], [-.4, 0, -1.5], [2.2, 0, 0]] as const;
export function findTractorExit(object: Object3D, free: (point: Vector3) => boolean, out: Vector3): boolean {
  object.updateMatrixWorld(true);
  for (const exit of TRACTOR_EXITS) {
    out.set(exit[0], exit[1], exit[2]); object.localToWorld(out); out.y = terrainHeight(out.x, out.z) + .01;
    if (free(out)) return true;
  }
  return false;
}
