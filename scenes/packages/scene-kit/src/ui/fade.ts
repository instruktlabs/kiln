export interface FadeController { to(alpha: number, ms: number): Promise<void>; step(dtMs: number): void; getSnapshot(): number; subscribe(fn: () => void): () => void; dispose(): void }
/** Root-owned clock service; subscribers write opacity directly, without per-frame React updates. */
export function createFadeController(reduced: () => boolean = () => false): FadeController {
  let alpha = 0, start = 0, target = 0, elapsed = 0, duration = 0, disposed = false, finish: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const fn of listeners) fn(); };
  const complete = () => { const done = finish; finish = null; done?.(); };
  return {
    getSnapshot: () => alpha,
    subscribe(fn) { if (disposed) return () => {}; listeners.add(fn); return () => { listeners.delete(fn); }; },
    to(next, ms) {
      if (disposed) return Promise.resolve(); complete(); start = alpha; target = Math.max(0, Math.min(1, next)); elapsed = 0; duration = reduced() ? 0 : Math.max(0, ms);
      if (!duration || target === alpha) { alpha = target; notify(); return Promise.resolve(); }
      return new Promise<void>(resolve => { finish = resolve; });
    },
    step(dtMs) {
      if (disposed || !finish) return;
      elapsed = reduced() ? duration : Math.min(duration, elapsed + Math.max(0, dtMs));
      alpha = start + (target - start) * (elapsed / duration); notify(); if (elapsed >= duration) complete();
    },
    dispose() { if (disposed) return; disposed = true; complete(); listeners.clear(); },
  };
}
