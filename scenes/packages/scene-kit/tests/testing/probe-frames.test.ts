import { afterAll, beforeAll, expect, test } from 'bun:test';
import { installTestHooks } from '../../src/testing';
import { probeFixture } from './probe-fixture';

// `__kilnScene.probeFrames` (testing/index.ts) installs only in test and dev builds; under Bun `import.meta.env` reads
// process.env, and the page global is a plain object for these tests.
const saved = { env: process.env.KILN_TEST, window: Object.getOwnPropertyDescriptor(globalThis, 'window') };
beforeAll(() => { process.env.KILN_TEST = '1'; Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {} }); });
afterAll(() => {
  if (saved.env === undefined) delete process.env.KILN_TEST; else process.env.KILN_TEST = saved.env;
  if (saved.window) Object.defineProperty(globalThis, 'window', saved.window); else delete (globalThis as { window?: unknown }).window;
});
const page = () => (globalThis as unknown as { window: { __kilnScene?: any } }).window.__kilnScene!;
const settled = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise.then(value => ({ value }), (error: Error) => ({ error })), Bun.sleep(ms).then(() => ({ running: true }))]);

test('probeFrames times out in the page: the probe is cancelled, its what-if restored and the probe freed', async () => {
  const f = probeFixture(), dispose = installTestHooks(f.runtime);
  const outcome = await settled(page().probeFrames({ whatIf: { hide: ['heroes'] }, timeoutMs: 10 }), 300) as { error?: Error };
  expect(String(outcome.error)).toContain('probeFrames timed out after 10 ms');
  expect([f.heroes.visible, f.renderer.render === f.original.render, f.renderer.backend.draw === f.original.draw, f.systems.length]).toEqual([true, true, true, 0]);
  const next = page().probeFrames({ frames: 4, timeoutMs: 50 });
  for (let i = 0; i < 20; i++) f.tick();
  expect((await next).stable).toBe(true);
  dispose();
});

test('a probe that settles first is unaffected by its timeout', async () => {
  const f = probeFixture(), dispose = installTestHooks(f.runtime);
  const first = page().probeFrames({ frames: 4, timeoutMs: 20 });
  for (let i = 0; i < 20; i++) f.tick();
  expect((await first).totals.draws).toBe(6);
  const second = page().probeFrames({ whatIf: { hide: ['heroes'] } });
  await Bun.sleep(40);
  expect(f.heroes.visible).toBe(false);
  for (let i = 0; i < 20; i++) f.tick();
  expect((await second).totals.draws).toBe(2);
  dispose();
});

test('disposing the scene rejects a running probe and restores the renderer and the hidden system', async () => {
  const f = probeFixture(), dispose = installTestHooks(f.runtime), running = page().probeFrames({ whatIf: { hide: ['heroes'] } }).catch((error: Error) => error);
  f.tick();
  expect(f.heroes.visible).toBe(false);
  dispose();
  expect(String(await running)).toContain('Scene disposed');
  expect([f.heroes.visible, f.renderer.render === f.original.render, f.systems.length, page()]).toEqual([true, true, 0, undefined]);
});
