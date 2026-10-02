import type { RootState } from '@react-three/fiber';
import type { Object3D, Material, Texture } from 'three/webgpu';

type Disposable = { dispose(): unknown } | (() => unknown);
/** Offscreen scenes still need their first frame to finish the ready contract. */
export function shouldPauseScene(state: { outside: boolean; ready: boolean; documentHidden: boolean; pageHidden: boolean }): boolean {
  return state.documentHidden || state.pageHidden || (state.ready && state.outside);
}
export class DisposeRegistry {
  private entries = new Set<Disposable>(); private terminal = false; readonly errors: unknown[] = [];
  add(d: Disposable): void { if (this.terminal) this.release(d); else this.entries.add(d); }
  get size(): number { return this.entries.size; }
  private release(d: Disposable) { try { const result = typeof d === 'function' ? d() : d.dispose(); if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch(e => this.errors.push(e)); } catch (e) { this.errors.push(e); } }
  disposeAll(): void { if (this.terminal) return; this.terminal = true; const entries = [...this.entries]; this.entries.clear(); for (let i = entries.length - 1; i >= 0; i--) this.release(entries[i]!); }
}
export function disposeObject3D(root: Object3D, opts: { textures?: boolean; skipShared?: Set<object> } = {}): void {
  const seen = new Set<object>(opts.skipShared);
  const dispose = (resource: { dispose(): void } | undefined) => { if (resource && !seen.has(resource)) { seen.add(resource); resource.dispose(); } };
  root.traverse(object => {
    const mesh = object as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[]; skeleton?: { dispose(): void }; shadow?: { dispose(): void } };
    dispose(mesh.geometry);
    for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
      if (seen.has(material)) continue;
      if (opts.textures !== false) for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) dispose(value as Texture);
      dispose(material);
    }
    dispose(mesh.skeleton); dispose(mesh.shadow);
  });
}
export interface SceneClock { time: number; ambient: number; delta: number; timeScale: number; readonly frame: number }
export const SystemOrder = { input: 100, path: 200, herd: 300, mixers: 400, sim: 500, frameGraph: 600, camera: 700, shadows: 800, governor: 900 } as const;
export function createSceneClock(): SceneClock { return { time: 0, ambient: 0, delta: 0, timeScale: 1, frame: 0 }; }
export function advanceSceneClock(clock: SceneClock, dt: number, flags: { paused: boolean; reduced: boolean }): void {
  clock.delta = flags.paused ? 0 : Math.max(0, Math.min(.1, dt)) * clock.timeScale;
  if (flags.paused) return;
  clock.time += clock.delta; if (!flags.reduced) clock.ambient += clock.delta;
  (clock as { frame: number }).frame++;
}
export type SystemFn = (dt: number, elapsed: number, state: RootState) => void;
export function createSystemLoop(clock: SceneClock, onError: (error: unknown) => void) {
  const systems = new Map<string, { name: string; order: number; fn: SystemFn }>(); let sorted: { name: string; order: number; fn: SystemFn }[] = [], changed = true, stopped = false;
  return {
    add(name: string, order: number, fn: SystemFn) { const entry = { name, order, fn }; systems.set(name, entry); changed = true; return () => { if (systems.get(name) === entry) { systems.delete(name); changed = true; } }; },
    step(delta: number, state: RootState, paused: boolean, reduced: boolean) {
      if (stopped || paused) { clock.delta = 0; return; }
      const dt = Math.max(0, Math.min(.1, delta)); advanceSceneClock(clock, dt, { paused: false, reduced });
      if (changed) { sorted = [...systems.values()].sort((a,b) => a.order - b.order); changed = false; }
      try { for (let i = 0; i < sorted.length; i++) sorted[i]!.fn(dt, clock.time, state); } catch (e) { stopped = true; onError(e); }
    },
    clear() { stopped = true; systems.clear(); sorted = []; },
    get size() { return systems.size; },
  };
}
