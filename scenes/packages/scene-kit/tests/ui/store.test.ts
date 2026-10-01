import { describe, expect, test } from 'bun:test';
import { createHudStore } from '../../src/ui/store';
import { createFadeController } from '../../src/ui/fade';

describe('U-18 HUD store', () => {
  test('change-only notifications coalesced to 100 ms, unsubscribe and dispose', () => {
    let now = 0, due = 0, callback: (() => void) | null = null, count = 0;
    const store = createHudStore({ status: '', speed: 0 }, { now: () => now, schedule: (fn, ms) => { due = now + ms; callback = fn; return 1; }, cancel: () => { callback = null; } });
    const off = store.subscribe(() => count++);
    store.set({ status: 'Ready' }); expect(count).toBe(1);
    store.set({ status: 'Ready' }); expect(count).toBe(1);
    now = 10; store.set({ speed: 1 }); now = 30; store.set({ speed: 2 }); expect(count).toBe(1); expect(due).toBe(100);
    now = 100; callback!(); callback = null; expect(count).toBe(2); expect(store.getSnapshot()).toEqual({ status: 'Ready', speed: 2 });
    off(); now = 200; store.set({ speed: 3 }); expect(count).toBe(2);
    store.subscribe(() => count++); now = 210; store.set({ speed: 4 }); store.dispose(); expect(callback).toBeNull();
    now = 1000; store.set({ speed: 5 }); expect(count).toBe(2);
  });
  test('fade advances on supplied simulation steps, completes, snaps for reduced motion, and settles on disposal', async () => {
    let reduced = false; const fade = createFadeController(() => reduced); let done = false;
    const pending = fade.to(1, 100).then(() => { done = true; }); fade.step(50); expect(fade.getSnapshot()).toBeCloseTo(.5); expect(done).toBe(false);
    fade.step(50); await pending; expect(done).toBe(true);
    reduced = true; await fade.to(0, 100); expect(fade.getSnapshot()).toBe(0);
    reduced = false; const cancelled = fade.to(1, 1000); fade.dispose(); await cancelled; fade.step(2000); expect(fade.getSnapshot()).toBe(0);
  });
});
