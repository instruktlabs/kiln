import { Quaternion, Vector3 } from 'three/webgpu';
import type { FarmInstance } from '../world/types';
import { chooseClip as defaultChooseClip } from '../world/placements';
import { FARM_HERD } from '../constants';

interface Routine { period: number; walk: number; radius: number; speed: number }
const routines: Readonly<Record<string, Routine>> = FARM_HERD;
const scope = 'bounded deterministic sheep flock, cattle grazing and chicken walking/pecking with original clips; not a full navigation AI';
/** Analytic integral of the sealed one-second acceleration/deceleration ramp. */
function progress(t: number, r: Routine): number {
  const cycle = Math.floor(t / r.period), p = t - cycle * r.period, w = r.walk;
  const s = p < 1 ? p * p / 2 : p < w - 1 ? p - .5 : p < w ? w - 1 - (w - p) ** 2 / 2 : w - 1;
  return cycle * (w - 1) + s;
}
export interface HerdReport { animals: number; elapsedSeconds: number; distanceMeters: number; walkFrames: number; restFrames: number; scope: string }
export interface HerdMotion { start(): void; update(dt: number): void; stop(): void; readonly active: boolean; report(): HerdReport; dispose(): void }
interface ActorState {
  i: FarmInstance; r: Routine; flock: boolean; p: Vector3; q: Quaternion; yaw: number;
  index: string; time: number; paused: boolean; scale: number; phase: number; offset: number;
  walkKey: string; restKey: string; last: string | null;
}

/** Port of sealed herd-motion.mjs; all actor scratch, clip keys and actions are built once. */
export function createHerdMotion(options: { instances: readonly FarmInstance[]; chooseClip?: (instance: FarmInstance, index: string) => void }): HerdMotion {
  const chooseClip = options.chooseClip ?? defaultChooseClip, states: ActorState[] = [];
  for (const instance of options.instances) {
    const routine = routines[instance.asset.id]; if (!routine) continue;
    const flock = instance.asset.id === 'sheep', phase = flock ? 0 : states.length * 1.17;
    const key = (name: string) => { const index = instance.clips.findIndex(c => c.name === name); return String(index < 0 ? instance.clips.findIndex(c => c.name === 'Idle') : index); };
    const walkKey = key('Walk'), restKey = key(instance.asset.id === 'chicken' ? 'Peck' : 'Graze');
    // clipAction caches are owned and uncached by placement disposal. Prewarming avoids transition allocations in update().
    for (const index of [walkKey, restKey]) { const clip = instance.clips[Number(index)]; if (clip) instance.mixer.clipAction(clip); }
    states.push({ i: instance, r: routine, flock, p: new Vector3(), q: new Quaternion(), yaw: 0, index: '', time: 0, paused: false, scale: 1,
      phase, offset: progress(phase, routine), walkKey, restKey, last: null });
  }
  let active = false, disposed = false, elapsed = 0, distance = 0, walkFrames = 0, restFrames = 0;
  function alive() { if (disposed) throw new Error('Farm herd is disposed'); }
  function start() {
    alive(); if (active) return; active = true; elapsed = 0; distance = 0; walkFrames = 0; restFrames = 0;
    for (const s of states) {
      s.p.copy(s.i.object.position); s.q.copy(s.i.object.quaternion); s.yaw = s.i.object.rotation.y;
      s.index = s.i.clipIndex; s.time = s.i.action?.time ?? 0; s.paused = s.i.action?.paused ?? false; s.scale = s.i.action?.timeScale ?? 1; s.last = null;
    }
  }
  function update(dt: number) {
    alive(); if (!active) return; elapsed += Math.min(.1, dt);
    for (const s of states) {
      const t = elapsed + s.phase, p = t % s.r.period, walking = p < s.r.walk;
      const angle = (progress(t, s.r) - s.offset) * s.r.speed / s.r.radius, baseYaw = s.flock ? 0 : s.yaw, heading = angle - baseYaw;
      const position = s.i.object.position, oldX = position.x, oldZ = position.z;
      position.set(s.p.x + s.r.radius * (Math.sin(heading) + Math.sin(baseYaw)), s.p.y, s.p.z + s.r.radius * (-Math.cos(heading) + Math.cos(baseYaw)));
      const settling = Math.max(0, 1 - elapsed / 2);
      s.i.object.rotation.y = baseYaw - angle + (s.flock ? Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw)) * settling * settling : 0);
      distance += Math.hypot(position.x - oldX, position.z - oldZ);
      const key = walking ? s.walkKey : s.restKey;
      if (s.last !== key) { chooseClip(s.i, key); s.last = key; }
      if (s.i.action) s.i.action.timeScale = walking ? s.r.speed / .35 * Math.min(1, p, s.r.walk - p) : 1;
      if (walking) walkFrames++; else restFrames++;
    }
  }
  function stop() {
    if (!active) return; active = false;
    const errors: unknown[] = [];
    for (const s of states) {
      s.i.object.position.copy(s.p); s.i.object.quaternion.copy(s.q);
      try {
        chooseClip(s.i, s.index);
        if (s.i.action) { s.i.action.time = s.time; s.i.action.paused = s.paused; s.i.action.timeScale = s.scale; s.i.mixer.update(0); }
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Farm herd restoration failed');
  }
  return { start, update, stop, get active() { return active; },
    report: () => ({ animals: states.length, elapsedSeconds: elapsed, distanceMeters: distance, walkFrames, restFrames, scope }),
    dispose() { if (disposed) return; try { stop(); } finally { disposed = true; states.length = 0; } },
  };
}
