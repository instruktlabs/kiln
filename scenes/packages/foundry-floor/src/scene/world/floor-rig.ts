// SPDX-License-Identifier: MIT
// Scene-owned transfer choreography sampled from the accepted arm/deck clips. It follows a production floor job;
// it cannot create a lot, complete a transfer, or change ownership. The stocker extension is a two-axis shuttle.
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { FabData, Vec3 } from '../../sim/data';
import { floorCarrierPose, floorStockerDock } from '../../sim/floor-transport';
import type { FloorActive } from '../../sim/floor-transport';
import type { AssetMap } from '../assets/asset-map';
import { bakeModel } from '../glb/bake';
import type { PoseInput } from '../glb/bake';
import { entityBake } from '../glb/options';

export interface FloorRigPose {
  carrier: { position: Vec3; yaw: number; input: PoseInput };
  arm: { stocker: boolean; index: number; position: Vec3; yaw: number; input: PoseInput } | null;
  foup: { position: Vec3; yaw: number };
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const mix = (a: Vec3, b: Vec3, f: number): Vec3 => a.map((v, i) => v + (b[i]! - v) * clamp(f, 0, 1)) as Vec3;
const up = new Vector3(0, 1, 0), unit = new Vector3(1, 1, 1);

export function floorRig(models: ReadonlyMap<string, GLTF>, map: AssetMap, data: FabData) {
  const arm = bakeModel('toolFrontRobotArm', models.get('toolFrontRobotArm')!, entityBake(map, 'toolFrontRobotArm', { anchors: ['gripCentre'], floorMoves: true }).options);
  const amr = bakeModel('amrFloorRobot', models.get('amrFloorRobot')!, entityBake(map, 'amrFloorRobot', { anchors: ['foup1'], floorMoves: true }).options);
  const armMatrices = new Float32Array(arm.anchors.length * 16), deckMatrices = new Float32Array(amr.anchors.length * 16);
  const matrix = new Matrix4(), local = new Matrix4(), v = new Vector3(), q = new Quaternion();
  const fingersOpen = ['gripperFingerL', 'gripperFingerR'].map(name => {
    const p = arm.trackValue('DeckToSeat', name, 'position', 8);
    return [name, p[0]!, p[1]!, p[2]!] as const;
  });
  const locator = (position: Vec3, yaw: number, matrices: Float32Array, index: number, dy = 0): Vec3 => {
    matrix.compose(v.set(...position), q.setFromAxisAngle(up, yaw), unit).multiply(local.fromArray(matrices, index * 16));
    v.set(0, dy, 0).applyMatrix4(matrix);
    return [v.x, v.y, v.z];
  };
  return {
    sample(active: FloorActive, t: number): FloorRigPose {
      const carrier = { ...floorCarrierPose(data, active, t), input: {} as PoseInput };
      const handoff = active.phase === 'PICK' || active.phase === 'DROP';
      const pick = active.phase === 'PICK';
      const seconds = clamp((t - active.t0) / 1000, 0, 24);
      const atStocker = pick === (active.direction === 'deliver');
      const dock = floorStockerDock(data, active.stocker), station = data.layout.floorRobots.stations[active.station]!;
      const armPosition: Vec3 = atStocker ? dock.arm : [...station.arm.position];
      const yaw = (atStocker ? dock.yaw : station.arm.yaw) * Math.PI / 180;
      let armInput: PoseInput = {};
      if (handoff) {
        if (pick) {
          armInput = seconds < 3 ? { clips: [['HomeToDeck', seconds]] }
            : seconds < 4 ? { clips: [['DeckToSeat', 0]] }
            : seconds < 12 ? { clips: [['DeckToSeat', seconds - 4]] }
            : seconds < 20 ? { clips: [['SeatToDeck', seconds - 12]] }
            : seconds < 23 ? { clips: [['HomeToDeck', 23 - seconds]] } : {};
          carrier.input = seconds < 16 ? {} : seconds < 18 ? { clips: [['DeckUp', seconds - 16]] }
            : seconds < 20 ? { clips: [['DeckUp', 2]] } : { clips: [['DeckDown', clamp(seconds - 20, 0, 2)]] };
        } else {
          armInput = seconds < 3 ? { clips: [['HomeToDeck', seconds]] }
            : seconds < 11 ? { clips: [['DeckToSeat', seconds - 3]] }
            : seconds < 15 ? { clips: [['SeatToHome', seconds - 11]] } : {};
          carrier.input = seconds < 2 ? { clips: [['DeckUp', seconds]] }
            : seconds < 5 ? { clips: [['DeckUp', 2]] } : { clips: [['DeckDown', clamp(seconds - 5, 0, 2)]] };
        }
      }
      // Empty approach/retreat must keep the jaws open; the carrying clip otherwise closes them in mid-swing.
      if (handoff && (pick ? seconds < 12 : seconds >= 10)) armInput = { ...armInput, translate: fingersOpen };
      amr.pose(carrier.input, deckMatrices);
      let position = locator(carrier.position, carrier.yaw, deckMatrices, amr.anchorIndex('foup1'));
      let foupYaw = carrier.yaw - Math.PI / 2;
      if (handoff) {
        const seat: Vec3 = atStocker ? dock.seat : [...station.handoff.seat];
        const manual: Vec3 = atStocker ? [...data.layout.stockers[active.stocker]!.manualPort.seat] : seat;
        if (pick && seconds < 13) {
          // A 0.9 m high shuttle extends out of the manual counter, then moves along its outboard track.
          const corner: Vec3 = [seat[0], seat[1], manual[2]];
          position = seconds < 2 ? mix(manual, corner, seconds / 2) : mix(corner, seat, (seconds - 2) / 2);
          foupYaw = yaw;
        } else if (!pick && seconds >= 10) {
          const corner: Vec3 = [seat[0], seat[1], manual[2]];
          position = seconds < 15 ? seat : seconds < 17 ? mix(seat, corner, (seconds - 15) / 2) : mix(corner, manual, (seconds - 17) / 2);
          foupYaw = yaw;
        } else if ((pick && seconds < 19) || (!pick && seconds >= 4)) {
          arm.pose(armInput, armMatrices);
          position = locator(armPosition, yaw, armMatrices, arm.anchorIndex('gripCentre'), -0.335);
          // The accepted gripper's 180 degree swing changes door orientation while the carrier uses its side load.
          foupYaw = Math.atan2(-matrix.elements[2]!, matrix.elements[0]!);
        }
      }
      return { carrier, arm: handoff ? { stocker: atStocker, index: atStocker ? active.stocker : active.station, position: armPosition, yaw, input: armInput } : null,
        foup: { position, yaw: foupYaw } };
    },
    dispose() { arm.dispose(); amr.dispose(); },
  };
}
