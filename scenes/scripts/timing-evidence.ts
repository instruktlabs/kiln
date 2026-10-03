/** Sampling and teardown policies shared by the timing runner and its offline regression tests. */
export async function sampleWithLoad<T>(sample: () => Promise<T>, stopLoad: () => Promise<unknown[]>) {
  const result = { end: undefined as T, loadDuring: [] as unknown[] };
  let failure: { error: unknown } | undefined;
  try { result.end = await sample(); return result; }
  catch (error) { failure = { error }; throw error; }
  finally {
    try { result.loadDuring = await stopLoad(); }
    catch (error) {
      if (failure) throw new AggregateError([failure.error, error], 'Timing sample and load-poller cleanup both failed');
      throw error;
    }
  }
}

export function timingError(error: unknown): string {
  return error instanceof AggregateError ? `${error.message}: ${error.errors.map(timingError).join('; ')}` : error instanceof Error ? error.message : String(error);
}

export async function acquireTimingResources<T>(owned: T[], starts: (() => Promise<T>)[]) {
  const added: T[] = [];
  for (const start of starts) { const resource = await start(); owned.push(resource); added.push(resource); }
  return added;
}

export async function cleanupTimingResources(resources: { name: string; close(): Promise<void>; timeoutMs?: number }[]) {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const resource of resources) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (resource.timeoutMs !== undefined) await Promise.race([resource.close(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Cleanup timed out after ${resource.timeoutMs} ms`)), resource.timeoutMs);
      })]);
      else await resource.close();
      results.push({ name: resource.name, ok: true });
    }
    catch (error) { results.push({ name: resource.name, ok: false, error: timingError(error) }); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  return results;
}

/** Collection validity only; D41, D16 and campaign acceptance remain separate evidence. */
export function timingCollectionVerdict(o: { expected: readonly string[]; runs: { label: string; valid?: boolean; error?: unknown }[]; expectedPrimes: number; primes: { ok?: boolean }[]; cleanup: { ok: boolean }[]; stopped: unknown }) {
  const counts = new Map<string, number>(); for (const run of o.runs) counts.set(run.label, (counts.get(run.label) ?? 0) + 1);
  const missing = o.expected.filter(label => !counts.has(label));
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([label]) => label);
  const unexpected = [...counts.keys()].filter(label => !o.expected.includes(label));
  const validRuns = o.runs.filter(run => run.valid === true && run.error === undefined).length;
  const primesOk = o.primes.length === o.expectedPrimes && o.primes.every(prime => prime.ok === true), cleanupOk = o.cleanup.every(row => row.ok === true);
  const pass = !o.stopped && missing.length === 0 && duplicates.length === 0 && unexpected.length === 0 && o.runs.length === o.expected.length && validRuns === o.expected.length && primesOk && cleanupOk;
  return { pass, expectedRuns: o.expected.length, recordedRuns: o.runs.length, validRuns, missing, duplicates, unexpected, primesOk, cleanupOk,
    scope: 'Collection validity only; inspect D41, D16, display rate and campaign acceptance separately.' };
}

/** Self-contained: Puppeteer serializes this function into the page before scene scripts execute. */
export function installTimingEvidence(scope: any = globalThis) {
  if (scope.__timingEvidence) return;
  let active = false, started = 0;
  const visibility = { initial: '', final: '', hidden: false, changes: [] as { state: string; atMs: number }[], omitted: 0 };
  const focus = { initial: false, final: false, lost: false, changes: [] as { focused: boolean; atMs: number }[], omitted: 0 };
  const errors: string[] = [], adapterRequests: any[] = [], deviceRequests: any[] = [];
  const adapters = new WeakMap<object, any>(), devices = new WeakMap<object, any>(), bindings = new Map<object, number | null>();
  const info = (value: any) => value ? { vendor: value.vendor ?? '', architecture: value.architecture ?? '', device: value.device ?? '', description: value.description ?? '' } : null;
  const copy = (value: any) => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const failed = (error: unknown) => { if (errors.length < 16) errors.push(String(error)); };
  scope.document.addEventListener('visibilitychange', () => {
    if (!active) return;
    const state = scope.document.visibilityState; visibility.hidden ||= state !== 'visible';
    if (visibility.changes.length < 64) visibility.changes.push({ state, atMs: scope.performance.now() - started }); else visibility.omitted++;
  });
  for (const name of ['blur', 'focus']) scope.addEventListener(name, () => {
    if (!active) return;
    const focused = scope.document.hasFocus(); focus.lost ||= !focused;
    if (focus.changes.length < 64) focus.changes.push({ focused, atMs: scope.performance.now() - started }); else focus.omitted++;
  });
  // Observe the native call chain without requesting any extra adapter/device or changing its options.
  try {
    const gpu = scope.navigator.gpu;
    if (!gpu) throw new Error('WebGPU is unavailable');
    const requestAdapter = gpu.requestAdapter;
    Object.defineProperty(gpu, 'requestAdapter', { configurable: true, writable: true, value: async function(this: any, ...args: any[]) {
      const adapter = await requestAdapter.apply(this, args);
      if (!adapter) return adapter;
      try {
        if (adapterRequests.length >= 16) throw new Error('Adapter observation limit exceeded');
        const row = { id: adapterRequests.length + 1, options: copy(args[0]), info: info(adapter.info) };
        adapterRequests.push(row);
        const seen = adapters.has(adapter); adapters.set(adapter, row);
        if (!seen) {
          const requestDevice = adapter.requestDevice;
          Object.defineProperty(adapter, 'requestDevice', { configurable: true, writable: true, value: async function(this: any, ...deviceArgs: any[]) {
            const device = await requestDevice.apply(this, deviceArgs);
            try {
              if (deviceRequests.length >= 16) throw new Error('Device observation limit exceeded');
              const origin = adapters.get(this);
              const observed = { id: deviceRequests.length + 1, adapterId: origin?.id ?? null,
                requestAdapterOptions: origin?.options ?? null, requestDeviceOptions: copy(deviceArgs[0]),
                adapterInfo: origin?.info ?? null, deviceAdapterInfo: info(device.adapterInfo) };
              deviceRequests.push(observed); devices.set(device, observed);
            } catch (error) { failed(error); }
            return device;
          } });
        }
      } catch (error) { failed(error); }
      return adapter;
    } });
    const prototype = scope.GPUCanvasContext?.prototype, configure = prototype?.configure;
    if (typeof configure !== 'function') throw new Error('GPUCanvasContext.configure is unavailable');
    Object.defineProperty(prototype, 'configure', { ...Object.getOwnPropertyDescriptor(prototype, 'configure'), value: function(this: any, ...args: any[]) {
      const result = configure.apply(this, args);
      try {
        if (!bindings.has(this.canvas) && bindings.size >= 16) throw new Error('Canvas observation limit exceeded');
        bindings.set(this.canvas, devices.get(args[0]?.device)?.id ?? null);
      } catch (error) { failed(error); }
      return result;
    } });
  } catch (error) { failed(error); }
  scope.__timingEvidence = {
    begin() {
      started = scope.performance.now(); active = true;
      Object.assign(visibility, { initial: scope.document.visibilityState, final: scope.document.visibilityState, hidden: scope.document.visibilityState !== 'visible', changes: [], omitted: 0 });
      const focused = scope.document.hasFocus();
      Object.assign(focus, { initial: focused, final: focused, lost: !focused, changes: [], omitted: 0 });
      return { visibility, focus };
    },
    finish() {
      if (active) {
        visibility.final = scope.document.visibilityState; visibility.hidden ||= visibility.final !== 'visible';
        focus.final = scope.document.hasFocus(); focus.lost ||= !focus.final; active = false;
      }
      return { visibility, focus };
    },
    gpu() {
      const canvasBindings = Array.from(scope.document.querySelectorAll('.ks-root canvas') as Iterable<any>, (canvas, index) => ({ canvas: index, deviceId: bindings.get(canvas) ?? null }));
      const ids = new Set(canvasBindings.map(row => row.deviceId));
      const bound = errors.length === 0 && canvasBindings.length > 0 && ids.size === 1 && !ids.has(null);
      const device = bound ? deviceRequests.find(row => row.id === canvasBindings[0]!.deviceId) : null;
      return { status: bound ? 'bound' : 'unbound', binding: 'scene-canvas.configure', adapter: device?.deviceAdapterInfo ?? device?.adapterInfo ?? null,
        adapterRequests, deviceRequests, canvasBindings, errors };
    },
  };
}
