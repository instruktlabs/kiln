// Golden Gate performance measurement core (SPEC 20; PERFORMANCE.md): the per-run procedure shared by
// the hub runner (scripts/perf.ts, bundled into the hub run kit) and the tablet tool
// (tests/tools/tablet.ts). It measures only when a person runs one of those tools; the tools decide
// whether the machine is quiet enough. Node built-ins and puppeteer-core only (the runner runs under Node 22).
import type { Page } from 'puppeteer-core';

export type Backend = 'webgpu' | 'webgl2';
export type Tier = 'minimal' | 'economy' | 'balanced' | 'high';
export const TIERS: readonly Tier[] = ['minimal', 'economy', 'balanced', 'high'];
/** The scene's measurement workloads (src/camera/workloads.ts and src/play/Driving.tsx). */
export const WORKLOADS = ['orbit', 'flyover', 'drive'] as const;
export type Workload = typeof WORKLOADS[number];
export const PRESETS = ['day', 'golden', 'fog'] as const;
export const READY_TIMEOUT = 180_000, WARMUP_MS = 5_000;
/** A frame interval at or under this counts as 60 FPS or better (one 60 Hz period plus timer jitter). */
export const SIXTY_FPS_MS = 17;

/** The Farm runner's percentile rule (the sealed pilot's summarize()), so every scene reports alike. */
export const percentile = (values: readonly number[], q: number) => { const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]! : null; };
export const summarize = (values: readonly number[]) => ({ count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: percentile(values, 1) });

/**
 * The scene page: the test build with its page chrome hidden (`capture=1`, test builds only) so the
 * canvas fills the viewport, a preset, and the tier and backend when they are forced. Without `tier`
 * the kit selects one from the device, as for a visitor.
 */
export function sceneUrl(base: string, o: { tier: Tier | 'auto'; backend: Backend | 'auto'; preset?: string }): string {
  const query = new URLSearchParams({ capture: '1', preset: o.preset ?? 'day' });
  if (o.tier !== 'auto') query.set('tier', o.tier);
  if (o.backend === 'webgl2') query.set('backend', 'webgl2');
  return `${base.replace(/[/]+$/, '')}/?${query}`;
}

/**
 * Installs, before any page script, a requestAnimationFrame recorder (frame timestamps, as the Farm
 * runner and the sealed pilot use), readiness observed on the first animation frame that shows the
 * harness's onReady, and a renderer.info sample every 30 recorded frames. `measureFromStart` sets the
 * kit's `__kilnMeasureRequested`, which in a test build runs the quality governor from the start as a
 * public build does (the automatic-tier runs); otherwise the governor stays at level 0 until a run holds it.
 */
export async function prepare(page: Page, measureFromStart: boolean): Promise<void> {
  await page.evaluateOnNewDocument((measure: boolean) => {
    const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (measure) w.__kilnMeasureRequested = true;
    const rec = w.__ggPerf = { readyAt: null as number | null, error: null as unknown, recording: false, intervals: [] as number[], last: null as number | null, draws: [] as number[], triangles: [] as number[] };
    const tick = (now: number) => {
      if (rec.readyAt === null && !rec.error) {
        try { const s = w.__kilnHarness?.snapshot(); if (s?.errors?.length) rec.error = s.errors[0]; else if ((s?.readyCount ?? 0) > 0) rec.readyAt = now; } catch { /* page still booting */ }
      }
      if (rec.recording) {
        if (rec.last !== null) rec.intervals.push(now - rec.last);
        rec.last = now;
        if (rec.intervals.length % 30 === 0) { const r = w.__kilnScene?.stats()?.render; if (r) { rec.draws.push(r.drawCalls); rec.triangles.push(r.triangles); } }
      } else rec.last = null;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, measureFromStart);
}

export const inPageWait = (page: Page, ms: number) => page.evaluate(duration => new Promise<void>(done => setTimeout(done, duration)), ms);

/** Milliseconds from navigation start to the first animation frame at which the scene reported ready. */
export async function waitReady(page: Page, timeout = READY_TIMEOUT): Promise<number> {
  await page.waitForFunction(() => { const r = (window as any).__ggPerf; return r.readyAt !== null || r.error; }, { timeout, polling: 100 });
  return page.evaluate(() => { const r = (window as any).__ggPerf; if (r.error) throw new Error(`Scene failed: ${r.error.code}: ${r.error.message}${r.error.cause ? ` (cause: ${r.error.cause})` : ''}`); return r.readyAt as number; });
}

/**
 * The browser console of one page, recorded from its creation (fix round 1: a forced-WebGL2 hub load failed
 * with `renderer-init` and the runner kept nothing to explain it). Console messages, uncaught page errors and
 * failed requests, in order, each with its time since the page opened; at most CONSOLE_LIMIT entries of at
 * most CONSOLE_TEXT_LIMIT characters, the rest counted as dropped. Recording only: no gate reads it.
 */
export interface ConsoleEntry { atMs: number; kind: 'console' | 'pageerror' | 'requestfailed'; type?: string; text: string; url?: string }
export interface ConsoleLog { entries: ConsoleEntry[]; dropped: number }
export const CONSOLE_LIMIT = 400, CONSOLE_TEXT_LIMIT = 2000;
const consoleLogs = new WeakMap<Page, { opened: number; log: ConsoleLog }>();
export function captureConsole(page: Page): void {
  const record = { opened: Date.now(), log: { entries: [] as ConsoleEntry[], dropped: 0 } };
  const push = (entry: Omit<ConsoleEntry, 'atMs'>) => {
    if (record.log.entries.length >= CONSOLE_LIMIT) { record.log.dropped++; return; }
    record.log.entries.push({ atMs: Date.now() - record.opened, ...entry, text: entry.text.slice(0, CONSOLE_TEXT_LIMIT) });
  };
  page.on('console', message => { const url = message.location()?.url; push({ kind: 'console', type: message.type(), text: message.text(), ...(url ? { url } : {}) }); });
  page.on('pageerror', error => push({ kind: 'pageerror', text: String((error as Error)?.stack ?? error) }));
  page.on('requestfailed', request => push({ kind: 'requestfailed', text: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}` }));
  consoleLogs.set(page, record);
}
/** The page's console so far (null when captureConsole was not installed). */
export const consoleOf = (page: Page): ConsoleLog | null => { const record = consoleLogs.get(page); return record ? { entries: record.log.entries.slice(), dropped: record.log.dropped } : null; };

/** Browser, adapter and page facts for a result file. */
export async function pageEnvironment(page: Page) {
  return page.evaluate(async () => {
    const adapter = await (navigator as any).gpu?.requestAdapter?.().catch(() => null), info = adapter?.info;
    const canvas = document.querySelector('.ks-root canvas') as HTMLCanvasElement | null;
    // The WebGL renderer string beside the WebGPU adapter: the scene's own context when it runs WebGL2 (a canvas
    // holding a WebGPU context returns null), otherwise a 1 x 1 probe context that is released at once.
    const webgl = (() => {
      try {
        let source = 'scene', probe = false, gl = (canvas?.getContext('webgl2') ?? null) as WebGL2RenderingContext | null;
        if (!gl) { source = 'probe'; probe = true; const c = document.createElement('canvas'); c.width = c.height = 1; gl = c.getContext('webgl2'); }
        if (!gl) return { source, error: 'no WebGL2 context' };
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const facts = { source, version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
          unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, contextLost: gl.isContextLost() };
        if (probe) gl.getExtension('WEBGL_lose_context')?.loseContext();
        return facts;
      } catch (error) { return { source: 'probe', error: String(error) }; }
    })();
    return { userAgent: navigator.userAgent, devicePixelRatio, inner: [innerWidth, innerHeight], screen: [screen.width, screen.height],
      adapter: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null, webgl,
      canvas: canvas ? { buffer: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight] } : null };
  });
}

export interface FramesOptions {
  base: string; backend: Backend | 'auto'; tier: Tier | 'auto'; workload: Workload; warmupMs: number; sampleMs: number; preset?: string;
  /** Hub runs refuse a silent fallback: the backend must be the one requested. */
  requireBackend: boolean;
}
/**
 * One frames run on a fresh page load: ready, then (for a fixed tier) the governor held at that tier's
 * level 0, the workload started, the warm-up, and the sample. After a load the GPU can still be
 * compiling pipelines for seconds, producing no frames; a sample counts only if the workload was
 * already running when sampling began.
 */
export async function measureFrames(page: Page, o: FramesOptions) {
  await page.goto(sceneUrl(o.base, o), { waitUntil: 'load', timeout: READY_TIMEOUT });
  const readyMs = await waitReady(page);
  const setup = await page.evaluate((hold: boolean) => {
    const api = (window as any).__kilnScene, host = (window as any).__kilnHarness.snapshot();
    if (hold) api.feedFrameTimes([]);
    return { errors: host.errors, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, tier: api.tierState(), initial: host.tiers.find((t: any) => t.kind === 'initial') ?? null };
  }, o.tier !== 'auto');
  if (setup.errors.length) throw new Error(`Scene failed: ${JSON.stringify(setup.errors[0])}`);
  if (o.requireBackend && o.backend !== 'auto' && setup.backend !== o.backend) throw new Error(`The scene runs ${setup.backend}, not ${o.backend}`);
  if (o.tier !== 'auto' && (setup.tier?.tier !== o.tier || setup.tier.level !== 0)) throw new Error(`The scene tier is ${setup.tier?.tier} level ${setup.tier?.level}, not ${o.tier} level 0`);
  const startedAt = await page.evaluate(name => { const api = (window as any).__kilnScene; api.runWorkload(name); return api.motionPolicy().time as number; }, o.workload);
  if (o.warmupMs) await inPageWait(page, o.warmupMs);
  const start = await page.evaluate(({ name, t0 }) => {
    const api = (window as any).__kilnScene, rec = (window as any).__ggPerf, gg = api.invoke('ggStats'), drive = api.invoke('driveState');
    const mode = gg?.camera?.mode ?? null;
    const running = api.motionPolicy().time > t0 && (name === 'orbit' ? mode === 'orbit' : name === 'flyover' ? mode === 'flight' : !!drive && Math.abs(drive.speed) > 1);
    const live = (window as any).__kilnHarness.snapshot().tiers.filter((t: any) => t.kind === 'live').length;
    api.beginMeasurement(); rec.intervals = []; rec.draws = []; rec.triangles = []; rec.last = null; rec.recording = true;
    return { running, mode, position: gg?.camera?.position ?? null, drive: drive ? { z: drive.z, speed: drive.speed } : null, live, tier: api.tierState() };
  }, { name: o.workload, t0: startedAt });
  await inPageWait(page, o.sampleMs);
  const end = await page.evaluate(() => {
    const api = (window as any).__kilnScene, rec = (window as any).__ggPerf, host = (window as any).__kilnHarness.snapshot();
    rec.recording = false; api.recordFrames(false);
    const gg = api.invoke('ggStats'), drive = api.invoke('driveState');
    return { intervals: rec.intervals as number[], draws: rec.draws as number[], triangles: rec.triangles as number[], cpu: api.cpuRenderTimes() as number[], stats: api.stats(), tier: api.tierState(),
      mode: gg?.camera?.mode ?? null, position: gg?.camera?.position ?? null, drive: drive ? { z: drive.z, speed: drive.speed } : null, errors: host.errors,
      changes: host.tiers.filter((t: any) => t.kind === 'live').map((t: any) => ({ tier: t.tier, level: t.level, direction: t.direction })), visibility: document.visibilityState };
  });
  const env = await pageEnvironment(page);
  const moved = JSON.stringify(start.position) !== JSON.stringify(end.position);
  const drove = o.workload !== 'drive' || (!!start.drive && !!end.drive && Math.abs(end.drive.z - start.drive.z) > 1);
  const held = o.tier === 'auto' || (end.tier?.tier === o.tier && end.tier.level === 0);
  const governorChanges = end.changes.length - start.live;
  const checks = { workloadRunningAtSamplingStart: start.running, cameraMoved: moved, carDriven: drove, tierHeldAtLevel0: o.tier === 'auto' ? null : held,
    noErrors: end.errors.length === 0, pageVisible: end.visibility === 'visible', backend: setup.backend };
  const valid = start.running && moved && drove && held && end.errors.length === 0 && end.visibility === 'visible' && end.intervals.length > 0 && end.cpu.length > 0;
  const frameIntervalMs = summarize(end.intervals), sampledSeconds = end.intervals.reduce((s, v) => s + v, 0) / 1000;
  return {
    valid, checks, readyMs, backend: setup.backend,
    tierAtStart: start.tier ? { tier: start.tier.tier, level: start.tier.level, device: start.tier.device } : null,
    tierAtEnd: end.tier ? { tier: end.tier.tier, level: end.tier.level, live: end.tier.live } : null,
    initialTier: setup.initial,
    frameIntervalMs, averageFps: sampledSeconds > 0 ? end.intervals.length / sampledSeconds : null, medianFps: frameIntervalMs.p50 ? 1000 / frameIntervalMs.p50 : null,
    cpuRenderMs: summarize(end.cpu), framesOver50Ms: end.intervals.filter(v => v > 50).length,
    drawCalls: { median: percentile(end.draws, .5), max: percentile(end.draws, 1), samples: end.draws.length },
    triangles: { median: percentile(end.triangles, .5), max: percentile(end.triangles, 1), samples: end.triangles.length },
    memory: end.stats.memory ?? null, pipelines: end.stats.pipelines ?? null, programs: end.stats.programs ?? null,
    longTasks: end.stats.longTasks ?? null, governorChanges, governorLevelChanges: end.changes.slice(start.live),
    page: env, workloadState: o.workload === 'drive' ? { start: start.drive, end: end.drive } : { startMode: start.mode, endMode: end.mode },
    method: `rAF timestamp intervals and the kit's CPU time around renderer.render; ${o.warmupMs / 1000} s warm-up after onReady and the workload start, then ${o.sampleMs / 1000} s of sampling; renderer.info sampled every 30 frames`,
  };
}

/** One readiness measurement on a fresh page load: navigation start to the first frame after onReady. */
export async function measureReady(page: Page, o: { base: string; backend: Backend | 'auto'; tier: Tier | 'auto'; preset?: string; requireBackend: boolean }) {
  await page.goto(sceneUrl(o.base, o), { waitUntil: 'load', timeout: READY_TIMEOUT });
  const readyMs = await waitReady(page);
  const state = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming, api = (window as any).__kilnScene, host = (window as any).__kilnHarness.snapshot();
    const fetched = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((s, r) => s + (r.transferSize || 0), 0);
    return { navigation: { responseEnd: entry.responseEnd, domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd },
      backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, tier: api.tierState(),
      progress: host.progress.map((p: any) => ({ phase: p.phase, at: Math.round(p.at) })).filter((p: any, i: number, all: any[]) => i === 0 || all[i - 1].phase !== p.phase), resourceTransferBytes: fetched };
  });
  if (o.requireBackend && o.backend !== 'auto' && state.backend !== o.backend) throw new Error(`The scene runs ${state.backend}, not ${o.backend}`);
  return { readyMs, ...state, tier: state.tier ? { tier: state.tier.tier, level: state.tier.level, device: state.tier.device } : null, page: await pageEnvironment(page),
    method: 'Milliseconds from navigation start to the first animation frame at which the test harness had seen onReady' };
}

/** SPEC 20.3's flat output record. */
export function specRecord(device: string, browser: string, backend: string | null, adapter: unknown, tier: string | null, workload: string | null, values: {
  frames: number | null; medianMs: number | null; p95Ms: number | null; p99Ms: number | null; cpuRenderMedianMs: number | null; drawCalls: number | null; triangles: number | null; longTasks: number | null; governorChanges: number | null; readyMs: number | null;
}) {
  return { device, browser, backend, adapter, tier, workload, ...values };
}
