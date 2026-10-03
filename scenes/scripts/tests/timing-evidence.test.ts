import { expect, test } from 'bun:test';
import { acquireTimingResources, cleanupTimingResources, installTimingEvidence, sampleWithLoad, timingCollectionVerdict } from '../timing-evidence';
import { HUB_RULE, measureTimingRun, parseScreenLocker, PC_RULE, quietVerdict, TABLET_RULE } from '../timing-ab';

test('sampling failure still stops the load poller, and simultaneous cleanup failure is preserved', async () => {
  let stops = 0;
  const failed = new Error('page evaluation failed');
  await expect(sampleWithLoad(async () => { throw failed; }, async () => { stops++; return []; })).rejects.toBe(failed);
  expect(stops).toBe(1);
  try {
    await sampleWithLoad(async () => { throw failed; }, async () => { throw new Error('poller stop failed'); });
    throw new Error('Expected both failures');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map(e => e.message)).toEqual(['page evaluation failed', 'poller stop failed']);
  }
  expect(await sampleWithLoad(async () => 42, async () => ['sample'])).toEqual({ end: 42, loadDuring: ['sample'] });
});

test('the measurement keeps its original failure when its owned page also fails to close', async () => {
  let evaluations = 0;
  const page = { on() {}, async bringToFront() {}, async setViewport() {}, async evaluateOnNewDocument() {}, async goto() {}, async waitForFunction() {},
    async evaluate() { return evaluations++ === 0 ? [8.3, 8.3] : { error: 'scene start failed' }; }, async close() { throw new Error('page close failed'); } };
  const cleanup: Awaited<ReturnType<typeof cleanupTimingResources>> = [];
  try {
    await measureTimingRun({ newPage: async () => page } as any, { side: 'A', base: 'http://127.0.0.1:4400' } as any,
      { scene: 'farm', tier: 'high', name: 'hero' }, { device: 'local', seconds: 60, warmupMs: 0, width: 1920, height: 1080, backend: 'webgpu', extra: {}, adb: null, loadEveryMs: 5000, browserPid: null, cleanup });
    throw new Error('Expected both failures');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map(e => e.message)).toEqual(['Scene failed: "scene start failed"', 'STOP: Measurement page cleanup failed: page close failed']);
  }
  expect(cleanup).toEqual([{ name: 'measurement-page', ok: false, error: 'page close failed' }]);
});

test('cleanup records failures while continuing to release other owned resources', async () => {
  const order: string[] = [];
  const result = await cleanupTimingResources([
    { name: 'browser', async close() { order.push('browser'); throw new Error('browser close failed'); } },
    { name: 'profile', async close() { order.push('profile'); } },
    { name: 'server', async close() { order.push('server'); throw new Error('server close failed'); } },
  ]);
  expect(order).toEqual(['browser', 'profile', 'server']);
  expect(result).toEqual([{ name: 'browser', ok: false, error: 'browser close failed' }, { name: 'profile', ok: true }, { name: 'server', ok: false, error: 'server close failed' }]);
});

test('partial startup owns and cleans the first server when the second startup fails', async () => {
  const owned: { name: string; close(): Promise<void> }[] = [];
  let closed = false;
  try {
    await expect(acquireTimingResources(owned, [async () => ({ name: 'A', async close() { closed = true; } }),
      async () => { throw new Error('B cannot listen'); }])).rejects.toThrow('B cannot listen');
  } finally { await cleanupTimingResources(owned); }
  expect(closed).toBe(true);
});

test('a server cleanup timeout is a failure, not a successful close', async () => {
  const resource = { name: 'server', timeoutMs: 1, close: () => new Promise<void>(() => {}) };
  const closing = cleanupTimingResources([resource]);
  const outcome = await Promise.race([closing, new Promise(resolve => setTimeout(() => resolve('test watchdog'), 30))]);
  expect(outcome).toEqual([{ name: 'server', ok: false, error: 'Cleanup timed out after 1 ms' }]);
});

test('unrecognized locker output remains unknown', () => {
  expect(parseScreenLocker('(true,)\n')).toBe(true);
  expect(parseScreenLocker('(false,)\n')).toBe(false);
  for (const value of [null, '', 'permission denied', '(not-a-boolean,)']) expect(parseScreenLocker(value)).toBeNull();
});

function pageFixture() {
  const handlers = new Map<string, (() => void)[]>();
  let at = 0, focused = true;
  const canvas = { width: 1920, height: 1080 };
  class Context {
    canvas = canvas;
    configured: unknown;
    configure(descriptor: { device: unknown }) { this.configured = descriptor.device; }
  }
  const nativeCalls: any[] = [];
  const gpu = {
    async requestAdapter(options?: { powerPreference?: string }) {
      nativeCalls.push({ operation: 'adapter', receiver: this, options });
      const info = { vendor: options?.powerPreference === 'high-performance' ? 'nvidia' : 'other', architecture: 'fixture', device: '', description: '' };
      return { info, async requestDevice(descriptor?: unknown) {
        nativeCalls.push({ operation: 'device', receiver: this, descriptor });
        return { adapterInfo: info };
      } };
    },
  };
  const listen = (name: string, handler: () => void) => handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  const scope: any = { document: { visibilityState: 'visible', hasFocus: () => focused, addEventListener: listen,
    querySelectorAll: () => [canvas] }, addEventListener: listen, performance: { now: () => ++at }, navigator: { gpu }, GPUCanvasContext: Context };
  return { scope, canvas, Context, nativeCalls, event(name: string, value: boolean | string) {
    if (name === 'visibilitychange') scope.document.visibilityState = value; else focused = value as boolean;
    for (const handler of handlers.get(name) ?? []) handler();
  } };
}

test('hidden and blur intervals invalidate the sample even after visibility and focus return', () => {
  const page = pageFixture(); installTimingEvidence(page.scope);
  const evidence = page.scope.__timingEvidence;
  page.event('visibilitychange', 'hidden'); page.event('blur', false);
  page.event('visibilitychange', 'visible'); page.event('focus', true);
  evidence.begin();
  expect(evidence.finish()).toMatchObject({ visibility: { hidden: false }, focus: { lost: false } });
  evidence.begin();
  page.event('visibilitychange', 'hidden'); page.event('blur', false);
  page.event('visibilitychange', 'visible'); page.event('focus', true);
  expect(evidence.finish()).toMatchObject({ visibility: { initial: 'visible', final: 'visible', hidden: true }, focus: { initial: true, final: true, lost: true } });
  expect(evidence.finish().visibility.changes.map((e: any) => e.state)).toEqual(['hidden', 'visible']);
  expect(evidence.finish().focus.changes.map((e: any) => e.focused)).toEqual([false, true]);
  evidence.begin();
  expect(evidence.finish()).toMatchObject({ visibility: { hidden: false }, focus: { lost: false } });
  page.event('visibilitychange', 'hidden'); page.event('blur', false); evidence.begin();
  page.event('visibilitychange', 'visible'); page.event('focus', true);
  expect(evidence.finish()).toMatchObject({ visibility: { initial: 'hidden', hidden: true }, focus: { initial: false, lost: true } });
});

test('GPU evidence follows the exact scene canvas device, not an unrelated default adapter probe', async () => {
  const page = pageFixture(); installTimingEvidence(page.scope);
  const gpu = page.scope.navigator.gpu;
  const rendererOptions = { powerPreference: 'high-performance', featureLevel: 'compatibility', xrCompatible: false };
  const rendererAdapter = await gpu.requestAdapter(rendererOptions);
  const descriptor = { requiredFeatures: ['timestamp-query'], requiredLimits: { maxBindGroups: 4 } };
  const rendererDevice = await rendererAdapter.requestDevice(descriptor);
  const context = new page.Context(); context.configure({ device: rendererDevice });
  const unrelated = await gpu.requestAdapter(); await unrelated.requestDevice();
  const observed = page.scope.__timingEvidence.gpu();
  expect(observed).toMatchObject({ status: 'bound', adapter: { vendor: 'nvidia' }, binding: 'scene-canvas.configure' });
  expect(observed.canvasBindings).toHaveLength(1);
  const device = observed.deviceRequests.find((d: any) => d.id === observed.canvasBindings[0].deviceId);
  expect(device.requestAdapterOptions).toEqual(rendererOptions);
  expect(device.requestDeviceOptions).toEqual(descriptor);
  expect(page.nativeCalls[0]).toEqual({ operation: 'adapter', receiver: gpu, options: rendererOptions });
  expect(page.nativeCalls[1]).toEqual({ operation: 'device', receiver: rendererAdapter, descriptor });
  expect(context.configured).toBe(rendererDevice);
});

test('a device request without a scene-canvas binding stays unqualified', async () => {
  const page = pageFixture(); installTimingEvidence(page.scope);
  await (await page.scope.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })).requestDevice();
  expect(page.scope.__timingEvidence.gpu()).toMatchObject({ status: 'unbound', adapter: null });
  new page.Context().configure({ device: {} });
  expect(page.scope.__timingEvidence.gpu()).toMatchObject({ status: 'unbound', adapter: null });
});

test('host quiet cannot certify an unknown screen-lock probe; tablet sampling does not invent a host probe', () => {
  const calm = { cpu: Array(8).fill(1), gpu: Array(8).fill(0) };
  for (const rule of [HUB_RULE, PC_RULE]) {
    expect(quietVerdict({ ...calm, screenLocked: null }, rule).quiet).toBe(false);
    expect(quietVerdict(calm, rule).quiet).toBe(false);
    expect(quietVerdict({ ...calm, screenLocked: false }, rule).quiet).toBe(true);
  }
  expect(quietVerdict(calm, TABLET_RULE).quiet).toBe(true);
});

test('collection verdict rejects missing, duplicate, invalid, failed, unprimed or unclean runs', () => {
  const complete = { expected: ['A', 'B'], runs: [{ label: 'A', valid: true }, { label: 'B', valid: true }], expectedPrimes: 2,
    primes: [{ ok: true }, { ok: true }], cleanup: [{ ok: true }], stopped: null };
  expect(timingCollectionVerdict(complete).pass).toBe(true);
  for (const override of [{ runs: complete.runs.slice(1) }, { runs: [complete.runs[0]!, complete.runs[0]!] },
    { runs: [...complete.runs, { label: 'C', valid: true }] }, { runs: [complete.runs[0]!, { label: 'B', valid: false }] },
    { runs: [complete.runs[0]!, { label: 'B', valid: true, error: 'failed to save' }] }, { primes: [{ ok: true }] },
    { primes: [{ ok: true }, { ok: false }] }, { cleanup: [{ ok: false }] }, { stopped: 'not quiet' }]) {
    expect(timingCollectionVerdict({ ...complete, ...override }).pass).toBe(false);
  }
});

test('serialized installer works without module closures and reports blocked instrumentation without altering native calls', async () => {
  const page = pageFixture();
  const native = page.scope.navigator.gpu.requestAdapter;
  Object.defineProperty(page.scope.navigator.gpu, 'requestAdapter', { value: native, writable: false, configurable: false });
  new Function('scope', `(${installTimingEvidence.toString()})(scope)`)(page.scope);
  const adapter = await page.scope.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  expect(adapter.info.vendor).toBe('nvidia');
  expect(page.nativeCalls).toHaveLength(1);
  const evidence = page.scope.__timingEvidence.gpu();
  expect(evidence.status).toBe('unbound');
  expect(evidence.errors.length).toBeGreaterThan(0);
});

test('native device rejection is preserved and cannot produce bound hardware evidence', async () => {
  const page = pageFixture(), failure = new Error('device rejected');
  page.scope.navigator.gpu.requestAdapter = async () => ({ info: { vendor: 'nvidia' }, requestDevice: async () => { throw failure; } });
  installTimingEvidence(page.scope);
  const adapter = await page.scope.navigator.gpu.requestAdapter();
  await expect(adapter.requestDevice()).rejects.toBe(failure);
  expect(page.scope.__timingEvidence.gpu()).toMatchObject({ status: 'unbound', adapter: null, deviceRequests: [] });
});
