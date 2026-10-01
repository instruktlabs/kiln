import { Box3, Camera, CatmullRomCurve3, Vector3 } from 'three/webgpu';
import type { Ref, RefObject } from 'react';
import type { Object3D } from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export type Vec3 = [number, number, number];
export interface Pose { position: Vec3; target: Vec3; fov?: number; roll?: number }
export interface RigHandle { readonly controls: OrbitControls; readonly pose: Pose; setView(v: { position: Vec3; target: Vec3; fov?: number; maxPolar?: number }): void; zoomBy(factor: number): void; panBy(dx: number, dz: number): void; reset(): void }
export interface OrbitOptions { target?: Vec3; minDistance?: number; maxDistance?: number; maxPolar?: number; damping?: false; pan?: boolean; floor?: (x: number, z: number) => number; clearance?: number; bounds?: Box3; onStart?: () => void; rigRef?: Ref<RigHandle>; active?: boolean }
export interface FollowOptions { subject: RefObject<Object3D | null>; targetHeight: number; offset: () => Vec3; fov: number; maxPolar: number; minDistance: number; maxDistance: number; obstruction?: { ray(from: Vector3, to: Vector3): number; pad: number; minDistance: number; hideSubjectBelow: number; onSubjectVisible(v: boolean): void } }
export interface ChaseOptions {
  subject: RefObject<Object3D | null>; yaw: () => number; speed?: () => number;
  distance: number; height: number; targetHeight: number; lookAhead: number; fov: number; fovAtTopSpeed?: number; topSpeed?: number;
  positionLag: number; yawLag: number;
  obstruction?: { ray(from: Vector3, to: Vector3): number; castRadius: number; pad: number; minDistance: number; relaxPerSecond: number; hideSubjectBelow?: number; onSubjectVisible?(v: boolean): void };
  orbitOffset?: boolean; active: boolean;
  /** GG-010 (D-22): pinch and wheel zoom owned by the rig. Scales `distance` and `height` within [min, max]; 1 on (re)entry. */
  zoom?: ChaseZoom;
}
export interface ChaseZoom { min: number; max: number; /** Scale change per unit of the kit input's `zoom`, as exp(rate x zoom). Default .5. */ rate?: number }
/** GG-010: the next chase zoom scale. The kit input's `zoom` is positive outward (pinch closing, wheel down). */
export function stepChaseZoom(scale: number, zoomInput: number, zoom: ChaseZoom): number {
  const next = scale * Math.exp((Number.isFinite(zoomInput) ? zoomInput : 0) * (zoom.rate ?? .5));
  return Math.max(zoom.min, Math.min(zoom.max, Number.isFinite(next) ? next : scale));
}
/**
 * GG-010: a one-pointer drag orbits the chase camera. A second pointer (a pinch) ends that drag, and no drag
 * starts again until every pointer has lifted, so the pinch never swings the camera and the remaining finger
 * of a pinch does not jump it.
 */
export interface ChaseDrag { readonly pointer: number | null; readonly pointers: number; down(id: number, x: number): boolean; move(id: number, x: number): number; up(id: number): void }
export function createChaseDrag(): ChaseDrag {
  const down = new Set<number>(); let pointer: number | null = null, x = 0, pinched = false;
  return {
    get pointer() { return pointer; }, get pointers() { return down.size; },
    down(id, clientX) {
      down.add(id);
      if (down.size > 1) { pointer = null; pinched = true; return false; }
      if (pinched) return false;
      pointer = id; x = clientX; return true;
    },
    move(id, clientX) { if (pointer !== id) return 0; const dx = clientX - x; x = clientX; return dx; },
    up(id) { down.delete(id); if (pointer === id) pointer = null; if (!down.size) pinched = false; },
  };
}
export interface ChaseState { position: Vec3; smoothedYaw: number; appliedDistance: number; orbitAngle: number; orbitHoldS: number; subjectVisible: boolean }
export interface PathKey { position: Vec3; target: Vec3; roll?: number; fov?: number; seconds?: number }
export interface PathDef { name: string; keys: readonly PathKey[]; seconds: number; interpolation?: 'linear' | 'catmull-rom'; easing?: 'linear' | 'smoothstep' | 'ease-in-out'; loop?: boolean }
export interface PathHandle { play(name: string, o?: { from?: number }): void; stop(): void; seek(u: number): void; readonly playing: string | null; readonly u: number; readonly pose: Pose }
export function clampOrbitZoom(distance: number, factor: number, minDistance: number, maxDistance: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return distance;
  return Math.max(minDistance, Math.min(maxDistance, distance * factor));
}
export function applyOrbitClamps(camera: Camera, target: Vector3, options: Pick<OrbitOptions, 'floor' | 'clearance' | 'bounds'>): void {
  if (options.bounds) target.clamp(options.bounds.min, options.bounds.max);
  if (options.floor) camera.position.y = Math.max(camera.position.y, options.floor(camera.position.x, camera.position.z) + (options.clearance ?? .25));
}
interface PathCache { position: CatmullRomCurve3; target: CatmullRomCurve3; ends: number[]; scratch: Vector3 }
const paths = new WeakMap<PathDef, PathCache>();
function pathCache(def: PathDef): PathCache {
  let cache = paths.get(def); if (cache) return cache;
  if (def.keys.length < 2 || !Number.isFinite(def.seconds) || def.seconds <= 0) throw new Error(`Path ${def.name} requires at least two keys and a positive duration`);
  let specified = 0, unspecified = 0;
  for (let i = 1; i < def.keys.length; i++) { const seconds = def.keys[i].seconds; if (seconds === undefined) unspecified++; else { if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Path key duration must be positive'); specified += seconds; } }
  if (unspecified && specified >= def.seconds) throw new Error('Specified path key durations leave no time for remaining keys');
  const each = unspecified ? (def.seconds - specified) / unspecified : 0, total = unspecified ? def.seconds : specified;
  const ends: number[] = [0]; let t = 0;
  for (let i = 1; i < def.keys.length; i++) { t += (def.keys[i].seconds ?? each) / total; ends.push(t); }
  ends[ends.length - 1] = 1;
  cache = { position: new CatmullRomCurve3(def.keys.map(k => new Vector3(...k.position)), false, 'centripetal'), target: new CatmullRomCurve3(def.keys.map(k => new Vector3(...k.target)), false, 'centripetal'), ends, scratch: new Vector3() };
  paths.set(def, cache); return cache;
}
export function samplePath(def: PathDef, u: number, out: Pose): Pose {
  const cache = pathCache(def); u = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  if (def.easing === 'smoothstep') u = u * u * (3 - 2 * u);
  else if (def.easing === 'ease-in-out') u = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  let i = 0; while (i < def.keys.length - 2 && u > cache.ends[i + 1]) i++;
  const a = def.keys[i], b = def.keys[i + 1], v = (u - cache.ends[i]) / (cache.ends[i + 1] - cache.ends[i]);
  if (def.interpolation === 'catmull-rom') {
    const parameter = (i + v) / (def.keys.length - 1);
    cache.position.getPoint(parameter, cache.scratch).toArray(out.position);
    cache.target.getPoint(parameter, cache.scratch).toArray(out.target);
  } else for (let axis = 0; axis < 3; axis++) { out.position[axis] = a.position[axis] + (b.position[axis] - a.position[axis]) * v; out.target[axis] = a.target[axis] + (b.target[axis] - a.target[axis]) * v; }
  out.fov = (a.fov ?? 40) + ((b.fov ?? 40) - (a.fov ?? 40)) * v;
  out.roll = (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * v;
  return out;
}
export interface PathController extends PathHandle { readonly interrupted: boolean; update(): void; interrupt(): void }
export function createPathController(defs: readonly PathDef[], options: { time(): number; reduced?: () => boolean; onInterrupt?: (pose: Pose) => void; onDone?: (name: string) => void }): PathController {
  if (!defs.length || new Set(defs.map(def => def.name)).size !== defs.length) throw new Error('Paths require nonempty unique names');
  defs.forEach(pathCache);
  let selected = defs[0], playing: string | null = null, u = 0, start = options.time(), interrupted = false;
  const pose: Pose = { position: [0, 0, 0], target: [0, 0, 0] }; samplePath(selected, 0, pose);
  const controller: PathController = {
    get playing() { return playing; }, get u() { return u; }, get interrupted() { return interrupted; }, pose,
    play(name, o = {}) {
      const def = defs.find(d => d.name === name); if (!def) throw new Error(`Unknown path: ${name}`);
      selected = def; u = Math.max(0, Math.min(1, o.from ?? 0)); start = options.time() - u * def.seconds; playing = name; interrupted = false;
      samplePath(selected, u, pose); if (options.reduced?.()) { u = 1; samplePath(selected, 1, pose); playing = null; options.onDone?.(name); }
    },
    stop() { playing = null; },
    seek(value) { u = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); start = options.time() - u * selected.seconds; samplePath(selected, u, pose); },
    interrupt() { if (playing === null) return; playing = null; interrupted = true; options.onInterrupt?.(pose); },
    update() {
      if (playing === null) return;
      const raw = (options.time() - start) / selected.seconds;
      u = options.reduced?.() ? 1 : selected.loop ? ((raw % 1) + 1) % 1 : Math.min(1, Math.max(0, raw)); samplePath(selected, u, pose);
      if (u === 1 && (!selected.loop || options.reduced?.())) { const name = playing; playing = null; options.onDone?.(name); }
    },
  };
  return controller;
}
interface ChaseScratch { velocity: Vec3; yawVelocity: number; orbitVelocity: number; target: Vector3; desired: Vector3; delta: Vector3; right: Vector3; up: Vector3; from: Vector3; to: Vector3 }
const chases = new WeakMap<ChaseState, ChaseScratch>();
const worldUp = new Vector3(0, 1, 0);
function scratchFor(state: ChaseState): ChaseScratch {
  let s = chases.get(state); if (!s) { s = { velocity: [0, 0, 0], yawVelocity: 0, orbitVelocity: 0, target: new Vector3(), desired: new Vector3(), delta: new Vector3(), right: new Vector3(), up: new Vector3(), from: new Vector3(), to: new Vector3() }; chases.set(state, s); } return s;
}
/** Exact critically damped spring for a constant target over this step. */
function springPosition(value: number, target: number, velocity: number, lag: number, dt: number): number {
  if (lag <= 0) return target;
  const w = 2 / lag, error = value - target, b = velocity + w * error; return target + (error + b * dt) * Math.exp(-w * dt);
}
function springVelocity(value: number, target: number, velocity: number, lag: number, dt: number): number {
  if (lag <= 0) return 0;
  const w = 2 / lag, b = velocity + w * (value - target); return (velocity - w * b * dt) * Math.exp(-w * dt);
}
export function stepChase(s: ChaseState, o: Omit<ChaseOptions, 'subject' | 'active'>, subject: { position: Vec3; yaw: number; speed: number }, dt: number, out: Pose, reducedMotion = false): void {
  const a = scratchFor(s); dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const yaw = s.smoothedYaw + Math.atan2(Math.sin(subject.yaw - s.smoothedYaw), Math.cos(subject.yaw - s.smoothedYaw));
  const yawLag = reducedMotion ? 0 : o.yawLag, positionLag = reducedMotion ? 0 : o.positionLag;
  const midpointYaw = springPosition(s.smoothedYaw, yaw, a.yawVelocity, yawLag, dt * .5);
  const nextYaw = springPosition(s.smoothedYaw, yaw, a.yawVelocity, yawLag, dt);
  a.yawVelocity = springVelocity(s.smoothedYaw, yaw, a.yawVelocity, yawLag, dt); s.smoothedYaw = nextYaw;
  const remaining = Math.max(0, dt - s.orbitHoldS); s.orbitHoldS = Math.max(0, s.orbitHoldS - dt);
  if (o.orbitOffset && remaining > 0) { const lag = reducedMotion ? 0 : .45; const angle = springPosition(s.orbitAngle, 0, a.orbitVelocity, lag, remaining); a.orbitVelocity = springVelocity(s.orbitAngle, 0, a.orbitVelocity, lag, remaining); s.orbitAngle = angle; }
  // Sampling the changing yaw target at the midpoint gives second-order coupled
  // spring integration; final look-at still uses the exact end-of-step yaw.
  const heading = (positionLag > 0 ? midpointYaw : s.smoothedYaw) + (o.orbitOffset ? s.orbitAngle : 0), px = subject.position[0], py = subject.position[1], pz = subject.position[2];
  a.target.set(px + Math.sin(s.smoothedYaw) * o.lookAhead, py + o.targetHeight, pz + Math.cos(s.smoothedYaw) * o.lookAhead);
  a.desired.set(px - Math.sin(heading) * o.distance, py + o.height, pz - Math.cos(heading) * o.distance);
  for (let axis = 0; axis < 3; axis++) {
    const desired = a.desired.getComponent(axis), value = s.position[axis];
    s.position[axis] = springPosition(value, desired, a.velocity[axis], positionLag, dt);
    a.velocity[axis] = springVelocity(value, desired, a.velocity[axis], positionLag, dt);
  }
  a.desired.fromArray(s.position); a.delta.subVectors(a.desired, a.target);
  const distance = a.delta.length(); a.delta.normalize(); let allowed = distance;
  if (o.obstruction) {
    const obstruction = o.obstruction;
    a.right.crossVectors(a.delta, worldUp).normalize(); if (a.right.lengthSq() < 1e-10) a.right.set(1, 0, 0);
    a.up.crossVectors(a.right, a.delta).normalize();
    let nearest = Infinity;
    for (let ray = 0; ray < 5; ray++) {
      a.from.copy(a.target); a.to.copy(a.desired);
      if (ray > 0) { const vector = ray <= 2 ? a.right : a.up, sign = ray === 1 || ray === 3 ? 1 : -1; a.from.addScaledVector(vector, obstruction.castRadius * sign); a.to.addScaledVector(vector, obstruction.castRadius * sign); }
      nearest = Math.min(nearest, obstruction.ray(a.from, a.to));
    }
    allowed = Math.min(distance, Math.max(obstruction.minDistance, nearest - obstruction.pad));
    s.appliedDistance = allowed < s.appliedDistance ? allowed : Math.min(allowed, s.appliedDistance + obstruction.relaxPerSecond * dt);
    const visible = s.appliedDistance >= (obstruction.hideSubjectBelow ?? 0);
    if (visible !== s.subjectVisible) { s.subjectVisible = visible; obstruction.onSubjectVisible?.(visible); }
  } else { s.appliedDistance = distance; if (!s.subjectVisible) s.subjectVisible = true; }
  if (o.obstruction) a.desired.copy(a.target).addScaledVector(a.delta, s.appliedDistance).toArray(out.position);
  else for (let axis = 0; axis < 3; axis++) out.position[axis] = s.position[axis];
  a.target.toArray(out.target);
  out.fov = o.fov + ((o.fovAtTopSpeed ?? o.fov) - o.fov) * Math.min(1, Math.abs(subject.speed) / Math.max(.0001, o.topSpeed ?? 1)); out.roll = 0;
}
