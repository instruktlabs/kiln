import { Object3D, Vector3 } from 'three/webgpu';
import { fixedStep, stepCapsule } from '@kiln-scenes/scene-kit/collision';
import type { Collider, MoverRules, MoverState } from '@kiln-scenes/scene-kit/collision';
import { FARM_CAMERA, FARM_DOORS, FARM_WALK } from '../constants';
import { doorPrompt, FARM_STRINGS } from '../ui/strings';
import { chooseClip } from '../world/placements';
import { onBridge, riverCenter, riverWidth, terrainHeight } from '../world/site-layout';
import type { FarmColliders } from '../world/colliders';
import type { FarmInstance } from '../world/types';
import { doorCenter, stepDoors, toggleDoor } from './doors';
import type { DoorStepContext, FarmDoor } from './doors';
import { captureRest, createEmptyHandedPose, createFarmerClipBlend, createSeatRig } from './farmer-rig';
import { createTractorRig, driveTractor, findTractorExit, TRACTOR_EXITS, TRACTOR_PROBE } from './tractor';
import type { TractorState } from './tractor';
import { FARM_DESTINATIONS, isFarmDestination } from './destinations';
import type { FarmDestination } from './destinations';

/** Polled per frame from the kit `InputState` (keyboard and touch share it). */
export interface FarmSimInput { readonly move: { readonly x: number; readonly y: number }; readonly run: boolean }
/** What the follow rig reads. The subject alternates between two anchors so that each
 * pilot `resetCamera()` re-initialises the kit `FollowRig` even when the subject is unchanged. */
export interface FarmFollowTarget {
  readonly subject: { current: Object3D | null };
  readonly offset: [number, number, number];
  ignore: ReadonlySet<Collider> | undefined;
}
export const FARM_WALK_RULES: MoverRules = {
  radius: FARM_WALK.radius, height: FARM_WALK.height, pace: FARM_WALK.pace, runPace: FARM_WALK.runPace,
  gravity: FARM_WALK.gravity, terminal: FARM_WALK.terminal, stepUp: FARM_WALK.stepUp, stepProbe: FARM_WALK.stepProbe,
  clampX: FARM_WALK.bound, clampZ: FARM_WALK.bound,
  blocked: (x, z, radius) => !onBridge(x, z, FARM_WALK.bridgeInset) && Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + radius ? FARM_STRINGS.river : null,
};
const exitPoint = new Vector3(), center = new Vector3();

/**
 * Port of the sealed `play.mjs` controller (INV 6, SPEC 12.3 `sim`): one plain mutable
 * object that the Farm systems drive. Keys, DOM and camera maths live in the kit; the
 * behaviour, order and constants are the pilot's.
 */
export function createFarmSim(o: { instances: readonly FarmInstance[]; colliders: FarmColliders }) {
  const { world, doors, ignoreVehicle } = o.colliders;
  const player = o.instances.find(instance => instance.id === 'farmer-yard-0'), tractor = o.instances.find(instance => instance.asset.id === 'tractor');
  if (!player || !tractor) throw new Error('Farm play requires the farmer and the tractor');
  const fork = player.object.getObjectByName('Joint_Pitchfork');
  if (!fork) throw new Error('Missing farmer pitchfork joint');
  const clipIndex = (name: string) => { const index = player.clips.findIndex(clip => clip.name === name); if (index < 0) throw new Error('Missing farmer clip ' + name); return String(index); };
  const clips = { Idle: clipIndex('Idle'), Walk: clipIndex('Walk') };
  const home = player.object.position.clone(), rest = captureRest(player.object), animation = createFarmerClipBlend(player, clips);
  const emptyHands = createEmptyHandedPose(player.object), seat = createSeatRig(player.object, tractor.object), rig = createTractorRig(tractor.object);
  const prompts = new Map(doors.map(door => [door, { open: doorPrompt(door.label, false), close: doorPrompt(door.label, true) }]));
  const mover: MoverState = { position: player.object.position, velocityY: 0, yaw: player.object.rotation.y, speedXZ: 0, status: '' };
  const drive: TractorState = { speed: 0, steer: 0, travel: 0 }, accumulator = { t: 0 };
  const anchors = [new Object3D(), new Object3D()];
  const follow: FarmFollowTarget = { subject: { current: null }, offset: [0, 0, 0], ignore: undefined };
  let active = false, driving = false, currentClip = '', nearestDoor: FarmDoor | null = null, nearestTractor = false, anchor = 0;
  let drivenMeters = 0, blockedSteps = 0, touch = false, disposed = false;
  const doorContext: DoorStepContext = { status: '', snap: false, blocked: () => active && !driving && world.intersects(player.object.position, FARM_WALK.radius - FARM_WALK.doorClearance, FARM_WALK.height) };
  const exitFree = (point: Vector3) => !world.intersects(point, FARM_WALK.radius, FARM_WALK.height);
  const probeBlocked = (point: Vector3) => world.intersects(point, TRACTOR_PROBE.radius, TRACTOR_PROBE.height, ignoreVehicle);

  const sim = {
    player, tractor, doors, world, home, follow, drive, tractorRig: rig,
    /** Public status text (strings table only); '' clears the status line. */
    status: '',
    get active() { return active; }, get driving() { return driving; },
    get nearestDoor() { return nearestDoor; }, get nearestTractor() { return nearestTractor; },
    get currentClip() { return currentClip; }, get velocityY() { return mover.velocityY; },
    get drivenMeters() { return drivenMeters; }, get blockedSteps() { return blockedSteps; },
    /** Text of the interact control, without the keyboard "(E)" hint (kit `InteractPrompt` adds it). */
    get prompt(): string {
      if (driving) return FARM_STRINGS.leaveTractor;
      if (nearestTractor) return FARM_STRINGS.drive;
      if (nearestDoor) { const text = prompts.get(nearestDoor)!; return nearestDoor.target > .5 ? text.close : text.open; }
      return FARM_STRINGS.approach;
    },
    get canInteract() { return active && (driving || nearestTractor || !!nearestDoor); },
    start, stop, interact, exitVehicle, visit, reset, update, updateAnimation, resetCamera,
    /** The last interaction input kind decides the tractor help string (SPEC 13.1). */
    setTouch(value: boolean) { touch = value; },
    dispose() { disposed = true; active = false; follow.subject.current = null; animation.reset(); emptyHands.dispose(); },
  };

  function updateAnimation(dt: number) { if (!disposed && active && !driving) animation.update(dt); }
  function restoreRig() { animation.reset(); emptyHands.restore(); rest.restore(); currentClip = ''; }
  function clip(name: 'Idle' | 'Walk', scale = 1) {
    animation.select(name, scale); currentClip = name;
  }
  function subject() { return driving ? tractor!.object : player!.object; }
  /** Keeps the rig target on the pilot's `target()`: subject position plus 1.9 m walking or 1.6 m driving. */
  function syncFollow() {
    const node = follow.subject.current; if (!node) return;
    node.position.copy(subject().position); node.position.y += driving ? FARM_CAMERA.drivingTargetHeight : FARM_CAMERA.walkingTargetHeight;
    node.updateMatrixWorld(); follow.ignore = driving ? ignoreVehicle : undefined;
  }
  function resetCamera() {
    const yaw = subject().rotation.y;
    follow.offset[0] = -Math.cos(yaw) * FARM_CAMERA.playOffsetLength; follow.offset[1] = driving ? FARM_CAMERA.drivingHeight : FARM_CAMERA.walkingHeight;
    follow.offset[2] = Math.sin(yaw) * FARM_CAMERA.playOffsetLength;
    anchor = 1 - anchor; follow.subject.current = anchors[anchor]!; syncFollow();
  }
  function start() {
    if (active || disposed) return;
    sim.status = ''; active = true; fork!.visible = false; mover.velocityY = 0;
    // SPEC 12.5 (2): every door instance returns to rest; the watermill restarts its Spin clip.
    for (const door of doors) { const spin = door.instance.clips.findIndex(c => c.name === 'Spin'); chooseClip(door.instance, spin < 0 ? '' : String(spin)); door.apply(door.amount); }
    chooseClip(tractor!, ''); clip('Idle'); resetCamera();
  }
  function exitVehicle(): boolean {
    if (!findTractorExit(tractor!.object, exitFree, exitPoint)) { sim.status = FARM_STRINGS.exitBlocked; return false; }
    leaveSeat(exitPoint); return true;
  }
  function leaveSeat(point: Vector3) {
    driving = false; drive.speed = 0; sim.status = ''; restoreRig();
    player!.object.position.copy(point); player!.object.rotation.copy(tractor!.object.rotation); clip('Idle'); resetCamera();
  }
  /**
   * Returns false when the pilot would stay in play (driving with every exit blocked).
   * `force` serves a stop the page already made (external `setPlaying(false)`): Rowan is
   * placed at the first exit option and pushed out of geometry instead of staying seated.
   */
  function stop(force = false): boolean {
    if (!active) return true;
    if (driving && !exitVehicle()) {
      if (!force) return false;
      const [x, y, z] = TRACTOR_EXITS[0]; exitPoint.set(x, y, z); tractor!.object.localToWorld(exitPoint);
      exitPoint.y = terrainHeight(exitPoint.x, exitPoint.z) + .01; leaveSeat(exitPoint); world.resolve(player!.object.position, FARM_WALK.radius, FARM_WALK.height);
    }
    active = false; restoreRig(); fork!.visible = true; player!.object.visible = true;
    nearestDoor = null; nearestTractor = false; return true;
  }
  function mount() {
    chooseClip(tractor!, ''); restoreRig(); driving = true; drive.speed = 0; seat.apply(); resetCamera();
    sim.status = touch ? FARM_STRINGS.tractorTouch : FARM_STRINGS.tractorKeyboard;
  }
  function interact() {
    if (!active) return;
    if (driving) { exitVehicle(); return; }
    if (nearestTractor) { mount(); return; }
    if (nearestDoor) sim.status = toggleDoor(nearestDoor);
  }
  /** Pilot `visit`; also the start of a play session when not yet active. */
  function visit(name: FarmDestination): boolean {
    if (!isFarmDestination(name)) return false;
    if (driving && !exitVehicle()) return false;
    const destination = FARM_DESTINATIONS[name];
    sim.status = ''; restoreRig(); player!.object.position.fromArray(destination.position); player!.object.rotation.y = destination.yaw;
    mover.velocityY = 0; world.resolve(player!.object.position, FARM_WALK.radius, FARM_WALK.height);
    if (!active) start(); else resetCamera(); return true;
  }
  /** Pilot "reset farmer": back to the placement position. */
  function reset(): boolean {
    if (driving && !exitVehicle()) return false;
    sim.status = ''; restoreRig(); player!.object.position.copy(home); mover.velocityY = 0;
    if (!active) start(); else resetCamera(); return true;
  }
  function walk(step: number, input: FarmSimInput, cameraForward: Vector3) {
    mover.status = '';
    stepCapsule(mover, input.move, input.run, cameraForward, step, world, FARM_WALK_RULES);
    if (mover.status) sim.status = mover.status;
    if (mover.speedXZ > FARM_WALK.clipSpeedFloor) { player!.object.rotation.y = mover.yaw; clip('Walk', Math.min(FARM_WALK.walkClipMax, mover.speedXZ / FARM_WALK.walkClipPace)); }
    else clip('Idle');
  }
  function driveStep(step: number, input: FarmSimInput) {
    const before = drive.travel;
    // Keyboard W/S and the joystick's y are gas; left is positive turn (pilot A/D, joystick -x).
    if (driveTractor(rig, drive, input.move.y, -input.move.x, step, probeBlocked)) { blockedSteps++; sim.status = FARM_STRINGS.obstacle; }
    else drivenMeters += Math.abs(drive.travel - before);
    seat.apply();
  }
  function nearestInteraction() {
    nearestDoor = null; nearestTractor = false; let distance: number = FARM_DOORS.radius; const p = player!.object.position;
    for (const door of doors) {
      doorCenter(door, center); const d = Math.hypot(p.x - center.x, p.z - center.z);
      if (d < distance) { distance = d; nearestDoor = door; }
    }
    const t = tractor!.object.position, d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < FARM_DOORS.tractorRadius && d < distance) { nearestDoor = null; nearestTractor = true; }
  }
  /**
   * The pilot's `update(dt)`: fixed 1/120 s steps with the .1 s cap; doors first (always, so a
   * door keeps closing after play ends), then walking or driving while active.
   */
  function update(dt: number, input: FarmSimInput, cameraForward: Vector3, reduced = false) {
    if (disposed) return;
    doorContext.snap = reduced;
    fixedStep(accumulator, dt, FARM_WALK.step, FARM_WALK.accumulatorCap, step => {
      doorContext.status = sim.status; stepDoors(doors, step, doorContext); sim.status = doorContext.status;
      if (!active) return;
      if (driving) driveStep(step, input);
      else walk(step, input, cameraForward);
    });
    // The mixer runs on every rendered frame, including frames without a fixed step.
    // Reapply the procedural pose after it before matrices and the follow camera consume it.
    if (active && !driving) emptyHands.apply();
    if (active) { syncFollow(); nearestInteraction(); }
  }
  return sim;
}
export type FarmSim = ReturnType<typeof createFarmSim>;
