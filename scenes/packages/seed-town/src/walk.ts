import { Vector3 } from 'three/webgpu';
import { fixedStep, stepCapsule } from '@kiln-scenes/scene-kit/collision';
import type { CollisionWorld, MoverRules, MoverState } from '@kiln-scenes/scene-kit/collision';
import { EYE_HEIGHT, MEADOW } from './layout';
import type { TownFrame } from './layout';

/** A person on foot. The step height clears the kerb (0.12 to 0.16 m) with room to spare. */
const BASE_RULES = { radius: 0.28, height: 1.8, pace: 1.6, runPace: 4.6, gravity: 20, terminal: -30, stepUp: 0.35, stepProbe: 0.45 };

export function walkRules(frame: TownFrame): MoverRules {
  return { ...BASE_RULES, clampX: frame.halfX + MEADOW, clampZ: frame.halfZ + MEADOW };
}

export interface EyeSim { mover: MoverState; lookYaw: number; pitch: number; accumulator: { t: number } }

export function createEyeSim(): EyeSim {
  return { mover: { position: new Vector3(), velocityY: 0, yaw: 0, speedXZ: 0, status: '' }, lookYaw: 0, pitch: 0, accumulator: { t: 0 } };
}

/** Put the walker at the town's start, a little above the road so the first step settles onto it. */
export function resetEyeSim(sim: EyeSim, frame: TownFrame): void {
  sim.mover.position.set(frame.start.x, 0.2, frame.start.z);
  sim.mover.velocityY = 0;
  sim.mover.speedXZ = 0;
  sim.mover.yaw = frame.start.yaw;
  sim.lookYaw = frame.start.yaw;
  sim.pitch = 0;
  sim.accumulator.t = 0;
}

export function eyePosition(mover: MoverState): { x: number; y: number; z: number } {
  return { x: mover.position.x, y: mover.position.y + EYE_HEIGHT, z: mover.position.z };
}

/** Unit vector on the ground in the direction a yaw looks. Yaw 0 looks along -Z, a positive yaw turns left. */
export function lookDirection(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

const forward = new Vector3();

export function stepEyes(sim: EyeSim, input: { move: { x: number; y: number }; run: boolean; lookX: number; lookY: number }, dt: number, world: CollisionWorld, rules: MoverRules): void {
  sim.lookYaw += input.lookX;
  sim.pitch = Math.max(-1.15, Math.min(1.15, sim.pitch + input.lookY));
  fixedStep(sim.accumulator, dt, 1 / 60, 0.1, h => {
    const direction = lookDirection(sim.lookYaw);
    forward.set(direction.x, 0, direction.z);
    stepCapsule(sim.mover, input.move, input.run, forward, h, world, rules);
  });
}

export interface WalkResult { steps: number; stuck: boolean; fell: boolean; x: number; y: number; z: number }

/** Walk straight on a heading for a distance; used to check that a town can be walked. */
export function walkLine(world: CollisionWorld, rules: MoverRules, from: { x: number; z: number }, yaw: number, distance: number): WalkResult {
  const mover: MoverState = { position: new Vector3(from.x, 0.2, from.z), velocityY: 0, yaw, speedXZ: 0, status: '' };
  const direction = lookDirection(yaw), heading = new Vector3(direction.x, 0, direction.z);
  let steps = 0, still = 0;
  const gone = () => Math.hypot(mover.position.x - from.x, mover.position.z - from.z);
  while (steps < 20000 && gone() < distance) {
    const before = gone();
    stepCapsule(mover, { x: 0, y: 1 }, false, heading, 1 / 60, world, rules);
    still = gone() - before < 0.0015 ? still + 1 : 0;
    if (still > 90 || mover.position.y < -2) break;
    steps += 1;
  }
  return { steps, stuck: still > 90, fell: mover.position.y < -2, x: mover.position.x, y: mover.position.y, z: mover.position.z };
}
