import { Vector3 } from 'three/webgpu';
import { fixedStep, stepCapsule } from '@kiln-scenes/scene-kit/collision';
import type { CollisionWorld, MoverRules, MoverState } from '@kiln-scenes/scene-kit/collision';
import { DOOR_SAMPLE_X, EYE_HEIGHT, START, routeLane } from './layout';

export const WALK_RULES: MoverRules = {
  radius: 0.28, height: 1.8, pace: 1.6, runPace: 4.5, gravity: 20, terminal: -30,
  stepUp: 0.35, stepProbe: 0.45, clampX: 470, clampZ: 470,
};

export interface EyeSim { mover: MoverState; lookYaw: number; pitch: number; accumulator: { t: number } }
export interface DriveMark { at: number; x: number; z: number; y: number }
export interface DriveResult {
  steps: number; stuck: boolean; fell: boolean; sawDoor: boolean; doorZ: number | null; doorAbs: number;
  endX: number; endZ: number; endY: number; eyeY: number; marks: DriveMark[];
}

export function createEyeSim(): EyeSim {
  return {
    mover: { position: new Vector3(START.x, 0, START.z), velocityY: 0, yaw: START.yaw, speedXZ: 0, status: '' },
    lookYaw: START.yaw, pitch: 0, accumulator: { t: 0 },
  };
}

export function resetEyeSim(sim: EyeSim): void {
  sim.mover.position.set(START.x, 0, START.z);
  sim.mover.velocityY = 0;
  sim.mover.speedXZ = 0;
  sim.lookYaw = START.yaw;
  sim.pitch = 0;
  sim.accumulator.t = 0;
}

export function eyePosition(mover: MoverState): { x: number; y: number; z: number } {
  return { x: mover.position.x, y: mover.position.y + EYE_HEIGHT, z: mover.position.z };
}

const lookForward = new Vector3();
const beforeStep = new Vector3(), stepDirection = new Vector3(), stepCandidate = new Vector3(), stepSupport = new Vector3();

/** A leading-foot support probe lets the grounded capsule mount the authored west threshold. */
export function stepWalkCapsule(mover: MoverState, move: { x: number; y: number }, run: boolean, forward: Vector3, dt: number, world: CollisionWorld): void {
  beforeStep.copy(mover.position);
  stepCapsule(mover, move, run, forward, dt, world, WALK_RULES);
  if (!(dt > 0) || (!move.x && !move.y)) return;
  const distance = (run ? WALK_RULES.runPace : WALK_RULES.pace) * dt;
  if (Math.hypot(mover.position.x - beforeStep.x, mover.position.z - beforeStep.z) >= distance * .6) return;
  const ground = world.floor(beforeStep, .08);
  if (!Number.isFinite(ground) || Math.abs(beforeStep.y - ground) > .08) return;
  stepDirection.set(forward.x, 0, forward.z).normalize();
  const fx = stepDirection.x, fz = stepDirection.z;
  stepDirection.set(fx * move.y - fz * move.x, 0, fz * move.y + fx * move.x).normalize();
  stepCandidate.copy(beforeStep).addScaledVector(stepDirection, distance);
  stepCandidate.y += WALK_RULES.stepUp;
  if (world.intersects(stepCandidate, WALK_RULES.radius, WALK_RULES.height)) return;
  stepSupport.copy(stepCandidate).addScaledVector(stepDirection, WALK_RULES.radius);
  const support = world.floor(stepSupport, WALK_RULES.stepProbe);
  if (!Number.isFinite(support) || support <= beforeStep.y + .01 || support > beforeStep.y + WALK_RULES.stepUp) return;
  stepCandidate.y = support + .00002;
  if (world.intersects(stepCandidate, WALK_RULES.radius, WALK_RULES.height)) return;
  mover.position.copy(stepCandidate);
  mover.velocityY = 0;
  mover.speedXZ = distance / dt;
}

export function stepEyes(sim: EyeSim, input: { move: { x: number; y: number }; run: boolean; lookX: number; lookY: number }, dt: number, world: CollisionWorld): void {
  sim.lookYaw += input.lookX;
  sim.pitch = Math.max(-1.15, Math.min(1.15, sim.pitch + input.lookY));
  fixedStep(sim.accumulator, dt, 1 / 60, 0.1, h => {
    lookForward.set(-Math.sin(sim.lookYaw), 0, -Math.cos(sim.lookYaw));
    stepWalkCapsule(sim.mover, input.move, input.run, lookForward, h, world);
  });
}

const STEP = 1 / 60;
const MARKS = [DOOR_SAMPLE_X, 110, 160, 190];

export function driveCapsule(world: CollisionWorld, start: { x: number; z: number }, holdZ: (x: number) => number, limitX: number, direction: 1 | -1 = 1): DriveResult {
  const mover: MoverState = { position: new Vector3(start.x, 0, start.z), velocityY: 0, yaw: 0, speedXZ: 0, status: '' };
  const forward = new Vector3(direction, 0, 0);
  const marks: DriveMark[] = [];
  let steps = 0, stuckSteps = 0, sawDoor = false, doorZ: number | null = null, doorAbs = 0;
  while (steps < 12000 && (mover.position.x - limitX) * direction < 0) {
    const before = mover.position.x;
    const strafe = direction * Math.max(-1, Math.min(1, (holdZ(mover.position.x) - mover.position.z) * 6));
    stepWalkCapsule(mover, { x: strafe, y: 1 }, false, forward, STEP, world);
    if (mover.position.x >= 61.2 && mover.position.x <= 66.4) {
      sawDoor = true;
      doorAbs = Math.max(doorAbs, Math.abs(mover.position.z));
      if (doorZ === null && (direction > 0 ? mover.position.x >= DOOR_SAMPLE_X : mover.position.x <= DOOR_SAMPLE_X)) doorZ = mover.position.z;
    }
    for (const at of MARKS) {
      if ((before - at) * direction < 0 && (mover.position.x - at) * direction >= 0 && !marks.some(mark => mark.at === at)) {
        marks.push({ at, x: mover.position.x, z: mover.position.z, y: mover.position.y });
      }
    }
    if ((mover.position.x - before) * direction < 0.0015) stuckSteps += 1; else stuckSteps = 0;
    if (stuckSteps > 90 || mover.position.y < -0.5) break;
    steps += 1;
  }
  const eye = eyePosition(mover);
  return {
    steps, stuck: stuckSteps > 90, fell: mover.position.y < -0.5, sawDoor, doorZ, doorAbs,
    endX: mover.position.x, endZ: mover.position.z, endY: mover.position.y, eyeY: eye.y, marks,
  };
}

/** From inside the nave, out the central door, across the parvis and onto the axial street. */
export function walkOutToTheStreet(world: CollisionWorld): DriveResult {
  return driveCapsule(world, { x: 30, z: 0 }, x => Math.max(centralDoorLane(x), routeLane(x)), 190, 1);
}

/** From the parvis spawn, through the central west door, into the nave. */
export function walkIntoTheNave(world: CollisionWorld): DriveResult {
  return driveCapsule(world, { x: START.x, z: START.z }, centralDoorLane, 24, -1);
}

/** The west portal has two real leaves separated by a stone trumeau. Pass its north opening. */
function centralDoorLane(x: number): number {
  if (x < 57 || x > 72) return 0;
  if (x < 60) return 1.1 * (x - 57) / 3;
  if (x > 69) return 1.1 * (72 - x) / 3;
  return 1.1;
}
