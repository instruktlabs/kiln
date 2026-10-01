export interface HudStore<T extends object> { set(patch: Partial<T>): void; getSnapshot(): T; subscribe(fn: () => void): () => void; dispose(): void }
interface StoreScheduler { now(): number; schedule(fn: () => void, ms: number): unknown; cancel(handle: unknown): void }
/** External HUD snapshots coalesce changed fields to at most ten notifications per second. */
export function createHudStore<T extends object = Record<string, unknown>>(initial?: T, scheduler?: StoreScheduler): HudStore<T> {
  let snapshot = { ...initial } as T, last = -Infinity, timer: unknown = null, disposed = false;
  const listeners = new Set<() => void>();
  const clock: StoreScheduler = scheduler ?? { now: () => performance.now(), schedule: (fn, ms) => setTimeout(fn, ms), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const notify = () => { timer = null; if (disposed) return; last = clock.now(); for (const fn of listeners) fn(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { if (disposed) return () => {}; listeners.add(fn); return () => { listeners.delete(fn); }; },
    set(patch) {
      if (disposed) return;
      let changed = false; for (const key in patch) if (!Object.is(snapshot[key], patch[key])) { changed = true; break; }
      if (!changed) return; snapshot = { ...snapshot, ...patch };
      if (timer !== null) return;
      const remaining = 100 - (clock.now() - last);
      if (remaining <= 0) notify(); else timer = clock.schedule(notify, remaining);
    },
    dispose() { if (disposed) return; disposed = true; if (timer !== null) clock.cancel(timer); timer = null; listeners.clear(); },
  };
}
