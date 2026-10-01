// Farm hub run kit runner (SPEC 20.3): X-01 (frame interval and CPU time around renderer.render) and
// X-04 (time to the first stable frame, D-23) for the sealed pilot and the rewrite, on one machine, in one session, with one
// Chrome, and X-05 (the rewrite alone per tier, backend and workload). This collects timing only when a person runs it explicitly on an idle qualification machine.
// The one permitted local use is `smoke`, which checks the plumbing and discards every number.
// It runs under Node 22 (bundled by scripts/make-hub-kit.ts) and needs no network access.
import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { cpus, release, type as osType } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hitchVerdict } from './hitch-rule';
import { createHash } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

type Target = 'pilot' | 'rewrite';
type Backend = 'webgpu' | 'webgl2';
/** The sealed pilot's measurement workloads (X-01 compares these). The rewrite also runs `walk` (SPEC 20.1 X-05; M4), which has no sealed pilot session. */
const PILOT_WORKLOADS = ['living-orbit', 'living-route', 'tractor-drive'] as const;
const WORKLOADS = [...PILOT_WORKLOADS, 'walk'] as const;
const isPilotWorkload = (workload: string) => (PILOT_WORKLOADS as readonly string[]).includes(workload);
const READY_TIMEOUT = 120_000, WARMUP_MS = 5_000;
const argv = process.argv.slice(2), command = argv[0] ?? 'help';
const flag = (name: string) => argv.includes(name);
const option = (name: string, fallback?: string) => { const at = argv.indexOf(name); if (at < 0) return fallback; const value = argv[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
const many = (name: string) => argv.flatMap((value, at) => argv[at - 1] === name ? [value] : []);
const here = dirname(fileURLToPath(import.meta.url));
// In the kit the runner sits in <kit>/runner; in the scenes workspace pass --kit explicitly.
const kit = resolve(option('--kit', resolve(here, '..'))!), out = resolve(option('--out', resolve(kit, 'results'))!);
const width = Number(option('--width', '1920')), height = Number(option('--height', '1080'));
const [portLow, portHigh] = option('--ports', '4400-4499')!.split('-').map(Number) as [number, number];
const quietCpu = Number(option('--quiet-cpu', '20')), quietGpu = Number(option('--quiet-gpu', '10'));
const chrome = option('--chrome', process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
// SPEC 20.3 interface: --tier and --seconds apply to the rewrite (the sealed pilot has fixed quality and a fixed 30 s session);
// --url measures an already served rewrite test build instead of the kit's copy.
const tier = option('--tier', 'high')!, sampleSeconds = Number(option('--seconds', '30')), rewriteUrl = option('--url');
if (!['minimal', 'economy', 'balanced', 'high'].includes(tier)) throw new Error('--tier is minimal, economy, balanced or high');
if (!(sampleSeconds > 0)) throw new Error('--seconds must be positive');
const percentile = (values: readonly number[], q: number) => { const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]! : null; };
// The pilot's own summarize() (profiling/session.mjs), so both sides use one percentile rule.
const summarize = (values: readonly number[]) => ({ count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: percentile(values, 1) });
/** Every sampled interval, kept per run beside the summary so that hitches are not averaged away (owner, 2026-09-29 20:35). */
const series = (values: readonly number[]) => values.filter(Number.isFinite).map(value => Math.round(value * 1000) / 1000);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
/** One static server policy for both implementations (the sealed pilot server's no-store), so X-04 compares scenes, not servers. Binds only; never probes a listener. */
async function serve(root: string) {
  const base = await realpath(root);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname), file = resolve(base, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      const rel = relative(base, file);
      if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(file)).isFile()) throw new Error('not found');
      response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found'); }
  });
  for (let port = portLow; port <= portHigh; port++) {
    const bound = await new Promise<boolean>((accept, reject) => {
      const fail = (error: { code?: string }) => { if (error.code === 'EADDRINUSE') accept(false); else reject(error); };
      server.once('error', fail); server.listen(port, '127.0.0.1', () => { server.off('error', fail); accept(true); });
    });
    if (bound) return { url: `http://127.0.0.1:${port}`, port, close: () => new Promise<void>(done => { server.closeAllConnections?.(); server.close(() => done()); }) };
  }
  throw new Error(`No free port in ${portLow}-${portHigh}`);
}

async function launch(profile: string, headless: boolean): Promise<Browser> {
  if (!chrome || !existsSync(chrome)) throw new Error('Pass --chrome <path to the installed Chrome> (Linux WebGPU flags are unverified; add them with --chrome-arg)');
  // A headed window is pinned to the primary display's origin, so it never spans two displays (owner rule, 2026-09-29).
  return puppeteer.launch({ executablePath: chrome, headless, pipe: true, userDataDir: profile, defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', `--window-size=${width},${height}`, ...(headless ? [] : ['--window-position=0,0']), ...many('--chrome-arg')] });
}
async function newPage(browser: Browser, target: Target): Promise<Page> {
  const page = await browser.newPage(); await page.setViewport({ width, height, deviceScaleFactor: 1 });
  // Identical in both pages: readiness observed on the first animation frame that shows it, the first stable frame after it
  // (D-23), and a requestAnimationFrame interval recorder (timestamps are the frame's rAF time, as the pilot uses).
  await page.evaluateOnNewDocument((kind: Target) => {
    const hub: any = (window as any).__hub = { readyAt: null, declaredAt: null, stableAt: null, error: null, recording: false, intervals: [] as number[], last: null as number | null,
      created: 0, pending: 0, frame: null as null | { start: number; created: number }, afterReady: [] as number[][] };
    const ready = kind === 'pilot'
      ? () => /^589 pack placements \+ 843 woodland trees/.test(document.querySelector('#load')?.textContent ?? '') && !(document.querySelector('#play-farm') as HTMLButtonElement | null)?.disabled
      : () => { const snapshot = (window as any).__kilnHarness?.snapshot(); if (snapshot?.errors?.length) hub.error = snapshot.errors[0]; return (snapshot?.readyCount ?? 0) > 0; };
    // D-23 (owner decision 2026-09-29 22:05): shader, program and pipeline creation is counted per frame, and asynchronous
    // creations still in flight are tracked (WebGPU's *Async pipelines until their promise settles; a WebGL2 program whose
    // KHR_parallel_shader_compile completion status reads false until it reads true or its link status is read).
    const created = (proto: any, names: string[], promised: boolean) => {
      for (const name of names) {
        const original = proto?.[name]; if (typeof original !== 'function') continue;
        proto[name] = function (this: unknown) {
          hub.created++;
          const result = original.apply(this, arguments);
          if (promised && result && typeof result.then === 'function') { hub.pending++; result.then(() => { hub.pending--; }, () => { hub.pending--; }); }
          return result;
        };
      }
    };
    const gl = (window as any).WebGL2RenderingContext?.prototype, device = (window as any).GPUDevice?.prototype;
    created(gl, ['compileShader', 'linkProgram'], false);
    created(device, ['createShaderModule', 'createRenderPipeline', 'createComputePipeline'], false);
    created(device, ['createRenderPipelineAsync', 'createComputePipelineAsync'], true);
    if (gl && typeof gl.getProgramParameter === 'function') {
      const get = gl.getProgramParameter, linking = new WeakSet<object>();
      gl.getProgramParameter = function (this: unknown, program: object, name: number) {
        const value = get.apply(this, arguments);
        if (name === 0x91B1 /* COMPLETION_STATUS_KHR */) { if (!value && !linking.has(program)) { linking.add(program); hub.pending++; } else if (value && linking.delete(program)) hub.pending--; }
        else if (name === 0x8B82 /* LINK_STATUS */ && linking.delete(program)) hub.pending--;
        return value;
      };
    }
    const tick = (now: number) => {
      if (hub.readyAt === null && !hub.error) { try { if (ready()) hub.readyAt = now; } catch { /* page still booting */ } }
      // The first stable frame: from the ready frame on, a frame's work is everything between its tick and the next one (this
      // callback runs first in every frame: it was requested first and re-requests itself first). The first frame that creates
      // no shader, program or pipeline, ends with none in flight and lasts at most 50 ms is stable; stableAt is the tick that ends it.
      if (hub.readyAt !== null && hub.stableAt === null) {
        if (hub.frame) {
          const interval = now - hub.frame.start, made = hub.created - hub.frame.created;
          if (hub.afterReady.length < 20_000) hub.afterReady.push([Math.round(interval * 1000) / 1000, made, hub.pending]);
          if (made === 0 && hub.pending === 0 && interval <= 50) hub.stableAt = now;
        }
        hub.frame = { start: now, created: hub.created };
      }
      if (hub.recording) { if (hub.last !== null) hub.intervals.push(now - hub.last); hub.last = now; } else hub.last = null;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // M3 X-04 attempt: the moment each scene declares readiness (the rewrite's harness clears its status line inside onReady;
    // the pilot writes its ready line and enables its controls in the same frame callback), beside the next-frame observation above.
    document.addEventListener('DOMContentLoaded', () => {
      const element = document.getElementById(kind === 'pilot' ? 'load' : 'page-status'); if (!element) return;
      const observer = new MutationObserver(() => { if (hub.declaredAt !== null || hub.error) return; try { if (ready()) { hub.declaredAt = performance.now(); observer.disconnect(); } } catch { /* page still booting */ } });
      observer.observe(element, { childList: true, characterData: true, subtree: true });
    });
  }, target);
  return page;
}
const waitReady = (page: Page) => page.waitForFunction(() => (window as any).__hub.readyAt !== null || (window as any).__hub.error, { timeout: READY_TIMEOUT, polling: 100 })
  .then(() => page.evaluate(() => { const hub = (window as any).__hub; if (hub.error) throw new Error(`Scene failed: ${hub.error.code}: ${hub.error.message}`); return hub.readyAt as number; }));
/** D-23: the first stable frame after readiness (null if none came within the readiness timeout), with the frames that preceded it. */
const waitStable = (page: Page) => page.waitForFunction(() => (window as any).__hub.stableAt !== null || (window as any).__hub.error, { timeout: READY_TIMEOUT, polling: 100 }).then(() => true, () => false)
  .then(found => page.evaluate(found => {
    const hub = (window as any).__hub; if (hub.error) throw new Error(`Scene failed: ${hub.error.code}: ${hub.error.message}`);
    const frames = hub.afterReady as number[][];
    return { stableMs: found ? hub.stableAt as number : null, framesFromReady: frames.length, createdAfterReady: frames.reduce((n, f) => n + f[1]!, 0),
      inFlightAfterReadyFrame: frames[0]?.[2] ?? null,longestIntervalMs: frames.length ? Math.max(...frames.map(f => f[0]!)) : null, frames: frames.slice(0, 40) };
  }, found));
const inPageWait = (page: Page, ms: number) => page.evaluate(duration => new Promise<void>(done => setTimeout(done, duration)), ms);
const url = (base: string, target: Target, backend: Backend, extra = '') => `${base.replace(/[/]+$/, '')}/?${target === 'pilot' ? 'quality=high' : `tier=${tier}`}${backend === 'webgl2' ? '&backend=webgl2' : ''}${extra}`;

/** Host load just before a run: CPU utilisation over one second (all cores) and, where present, nvidia-smi. */
async function hostLoad() {
  const sample = () => cpus().reduce((sum, cpu) => { const t = cpu.times; return { idle: sum.idle + t.idle, total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq }; }, { idle: 0, total: 0 });
  const a = sample(); await new Promise(done => setTimeout(done, 1000)); const b = sample();
  const cpuPercent = b.total > a.total ? 100 * (1 - (b.idle - a.idle) / (b.total - a.total)) : null;
  const gpu = await new Promise<string | null>(done => execFile('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { timeout: 5000 }, (error, stdout) => done(error ? null : stdout.trim())));
  const gpuPercent = gpu ? Number(gpu.split(',')[0]) : null;
  return { cpuPercent, gpu, gpuPercent, quiet: cpuPercent !== null && cpuPercent < quietCpu && (gpuPercent === null || gpuPercent < quietGpu), rule: `CPU < ${quietCpu}% and GPU < ${quietGpu}% before the run` };
}
async function environment(browser: Browser, page: Page) {
  return { browser: await browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), platform: process.platform, node: process.version,
    window: { width, height, deviceScaleFactor: 1, headless: flag('--headless'), position: flag('--headless') ? null : '0,0' },
    adapter: await page.evaluate(async () => { const adapter = await (navigator as any).gpu?.requestAdapter?.(); const info = adapter?.info; return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null; }) };
}
async function save(name: string, value: unknown) { await mkdir(out, { recursive: true }); const file = resolve(out, name); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); console.log(`wrote ${file}`); return file; }
const profileRoot = () => resolve(kit, 'tmp');
/** Served roots inside the kit: the sealed pilot's extracted scene directory and the rewrite's r34 test build. */
const siteRoot = (target: Target) => resolve(kit, target === 'pilot' ? 'pilot/scene' : 'rewrite');
/** The kit's own no-store server, or, for the rewrite only, an already served test build passed with --url. */
const host = async (target: Target) => target === 'rewrite' && rewriteUrl ? { url: rewriteUrl, port: null, close: async () => {} } : serve(siteRoot(target));
/** SPEC 20.3's flat output record, alongside the detailed fields. */
const specRecord = (env: Awaited<ReturnType<typeof environment>>, backend: Backend, workload: string | null, values: Record<string, number | null>) =>
  ({ device: `${osType()} ${release()}, ${cpus()[0]?.model ?? 'unknown CPU'}`, browser: env.browser, backend, adapter: env.adapter, tier, workload, ...values });

/** Rewrite: its test build, remounted at exactly width by height, governor held at the requested tier's level 0 (the pilot has fixed quality), then the workload. */
async function rewriteFrames(page: Page, base: string, backend: Backend, workload: string, warmupMs: number, sampleMs: number) {
  await page.goto(url(base, 'rewrite', backend), { waitUntil: 'load', timeout: READY_TIMEOUT }); await waitReady(page);
  await page.evaluate(({ w, h, t, forced }) => (window as any).__kilnHarness.mount({ width: w, height: h, quality: t, backend: forced ? 'webgl2' : 'auto' }), { w: width, h: height, t: tier, forced: backend === 'webgl2' });
  await page.waitForFunction(() => { const s = (window as any).__kilnHarness.snapshot(); return s.readyCount > 0 || s.errors.length > 0; }, { timeout: READY_TIMEOUT, polling: 100 });
  const setup = await page.evaluate(() => { const api = (window as any).__kilnScene, host = (window as any).__kilnHarness.snapshot(); api.feedFrameTimes([]); return { errors: host.errors, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'), tier: api.tierState(), pose: api.simState?.()?.camera ?? null }; });
  if (setup.errors.length) throw new Error(`Rewrite failed: ${JSON.stringify(setup.errors[0])}`);
  if (setup.backend !== backend) throw new Error(`Rewrite runs ${setup.backend}, not ${backend}`);
  if (setup.tier?.tier !== tier || setup.tier.level !== 0) throw new Error(`Rewrite tier is ${setup.tier?.tier} level ${setup.tier?.level}, not ${tier} level 0`);
  const startedAt = await page.evaluate(name => { const api = (window as any).__kilnScene; api.runWorkload(name); return api.motionPolicy().time as number; }, workload);
  if (warmupMs) await inPageWait(page, warmupMs);
  // After a (re)mount the GPU can still be compiling pipelines for seconds after onReady, and no frame is produced
  // meanwhile. The sample is valid only if the workload was already running when sampling began: the scene clock had
  // advanced and, for tractor-drive, Rowan was driving (for walk, playing on foot).
  const engaged = await page.evaluate(({ name, t0 }) => {
    const api = (window as any).__kilnScene, hub = (window as any).__hub, sim = api.simState?.() ?? null;
    const running = api.motionPolicy().time > t0 && (name !== 'tractor-drive' || sim?.driving === true) && (name !== 'walk' || (sim?.active === true && sim.driving === false));
    api.beginMeasurement(); hub.intervals = []; hub.last = null; hub.recording = true; return running;
  }, { name: workload, t0: startedAt });
  await inPageWait(page, sampleMs);
  const run = await page.evaluate(() => {
    const api = (window as any).__kilnScene, hub = (window as any).__hub; hub.recording = false; api.recordFrames(false);
    const sim = api.simState?.() ?? null;
    return { intervals: hub.intervals as number[], cpu: api.cpuRenderTimes() as number[], stats: api.stats(), tier: api.tierState(), pose: sim?.camera ?? null, sim };
  });
  // The Farm's simState() reports the rendered camera (test and dev builds only).
  const moved = !!run.pose && !!setup.pose && JSON.stringify(run.pose) !== JSON.stringify(setup.pose), drove = workload !== 'tractor-drive' || (run.sim?.driving === true && run.sim.drivenMeters > 1);
  const walked = workload !== 'walk' || (run.sim?.active === true && run.sim.driving === false);
  const valid = run.tier.tier === tier && run.tier.level === 0 && engaged && moved && drove && walked && run.intervals.length > 0 && run.cpu.length > 0;
  const sampledMs = run.intervals.reduce((sum, value) => sum + value, 0);
  return { valid, checks: { tierHeldAtLevel0: run.tier.tier === tier && run.tier.level === 0, workloadRunningAtSamplingStart: engaged, cameraMoved: moved, tractorDriven: drove, walkingOnFoot: walked, backend: setup.backend },
    sampledMs, fps: sampledMs > 0 ? 1000 * run.intervals.length / sampledMs : null, frameIntervalMs: summarize(run.intervals), cpuRenderMs: summarize(run.cpu), framesOver50Ms: run.intervals.filter(v => v > 50).length, framesOver100Ms: run.intervals.filter(v => v > 100).length,
    drawCalls: run.stats.render?.drawCalls ?? null, triangles: run.stats.render?.triangles ?? null, longTasks: run.stats.longTasks ?? null, governorChanges: 0,
    workloadState: workload === 'tractor-drive' ? { driving: run.sim?.driving, drivenMeters: run.sim?.drivenMeters, blockedSteps: run.sim?.blockedSteps }
      : workload === 'walk' ? { active: run.sim?.active, driving: run.sim?.driving, player: run.sim?.player ?? null } : null,
    method: `rAF timestamp intervals and the kit's CPU time around renderer.render; ${warmupMs / 1000} s warm-up then ${sampleMs / 1000} s sampling, as the sealed pilot's session. frameIntervalsMs keeps every sampled interval in order (M3)`,
    frameIntervalsMs: series(run.intervals) };
}
/** Pilot: its own sealed ?profile=1 harness (5 s warm-up, 30 s sampling, 1920 x 1080 at DPR 1, full grass). */
async function pilotFrames(page: Page, base: string, backend: Backend, workload: string, diagnostic = false) {
  await page.goto(url(base, 'pilot', backend, diagnostic ? '&profile=diagnostic' : '&profile=1'), { waitUntil: 'load', timeout: READY_TIMEOUT }); await waitReady(page);
  await page.evaluate(({ name, probe }) => {
    const set = (id: string, value: string) => { const element = document.getElementById(id) as HTMLSelectElement; element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); };
    set('resolution', '1080p'); set('grass-quality', '1');
    if (!probe) { const quiet = document.getElementById('quiet-window') as HTMLInputElement; quiet.checked = true; quiet.dispatchEvent(new Event('change', { bubbles: true })); }
    set('sample-case', name);
    if (document.getElementById('sample-case') && (document.getElementById('sample-case') as HTMLSelectElement).value !== name) throw new Error(`Pilot has no workload ${name}`);
  }, { name: workload, probe: diagnostic });
  // A DOM click (the panel may be scrolled); the pilot's input guard exempts #sample itself.
  await page.$eval('#sample', button => (button as HTMLButtonElement).click());
  await page.waitForFunction(() => { const element = document.getElementById('measurement'); return !!element && !element.hidden && element.textContent!.trim().startsWith('{'); }, { timeout: READY_TIMEOUT, polling: 250 });
  const report = JSON.parse(await page.$eval('#measurement', element => element.textContent!));
  if (diagnostic) return { valid: report.kind === 'instrumentation-check-only' && report.phase === 'complete' && report.frameSamples > 0 && report.backend === backend && !report.errors?.length,
    report: { kind: report.kind, phase: report.phase, reason: report.reason, backend: report.backend, frameSamplesPresent: report.frameSamples > 0, errors: report.errors?.length ?? null } };
  const summary = report.summary;
  return { valid: report.phase === 'complete' && report.backend === backend, checks: { phase: report.phase, reason: report.reason, backend: report.backend },
    frameIntervalMs: summary.rafDeltaMs, cpuRenderMs: summary.renderSubmitCpuMs, frameCpuMs: summary.frameCpuMs, framesOver50Ms: summary.framesOver50Ms, framesOver100Ms: null,
    drawCalls: null, triangles: null, longTasks: null, governorChanges: 0, runId: report.runId, gpu: report.gpu,
    method: "The sealed pilot's own ?profile=1 session: rafDeltaMs (rAF timestamps) and renderSubmitCpuMs (CPU time around renderer.render). Its page shows only the summary; the per-frame records are in its own JSON download, which the runner does not take, so framesOver100Ms and frameIntervalsMs are null",
    frameIntervalsMs: null };
}

async function frames(target: Target, backend: Backend, workload: string, runs: number, headless: boolean) {
  if (!WORKLOADS.includes(workload as typeof WORKLOADS[number])) throw new Error(`Workload must be one of ${WORKLOADS.join(', ')}`);
  if (target === 'pilot' && !isPilotWorkload(workload)) throw new Error(`The sealed pilot has no ${workload} session; it runs ${PILOT_WORKLOADS.join(', ')}`);
  if (target === 'pilot' && (tier !== 'high' || sampleSeconds !== 30 || rewriteUrl)) throw new Error('The sealed pilot runs only at quality high with its own 30 s session from the kit copy');
  const hosted = await host(target); await mkdir(profileRoot(), { recursive: true });
  const profile = await mkdtemp(resolve(profileRoot(), `frames-${target}-`)); let browser: Browser | undefined;
  try {
    browser = await launch(profile, headless);
    for (let run = 1; run <= runs; run++) {
      const load = await hostLoad(), page = await newPage(browser, target);
      try {
        const result: any = target === 'pilot' ? await pilotFrames(page, hosted.url, backend, workload) : await rewriteFrames(page, hosted.url, backend, workload, WARMUP_MS, sampleSeconds * 1000);
        const env = await environment(browser, page);
        // X-01 compares the pilot with the rewrite at tier high over the pilot's 30 s session; other rewrite runs are X-05's (results/x05).
        const id = target === 'pilot' || (tier === 'high' && sampleSeconds === 30 && isPilotWorkload(workload)) ? 'X-01' : 'X-05';
        await save(`frames-${target}-${workload}-${backend}${tier === 'high' ? '' : '-' + tier}-run${run}.json`, { schema: 'kiln.farm-hub-perf/1', id, measure: 'frames', target, workload, backend, tier, run, sampleSeconds: target === 'pilot' ? 30 : sampleSeconds, hostLoadBefore: load, environment: env,
          spec: specRecord(env, backend, workload, { frames: result.frameIntervalMs?.count ?? null, medianMs: result.frameIntervalMs?.p50 ?? null, p95Ms: result.frameIntervalMs?.p95 ?? null, p99Ms: result.frameIntervalMs?.p99 ?? null,
            cpuRenderMedianMs: result.cpuRenderMs?.p50 ?? null, drawCalls: result.drawCalls, triangles: result.triangles, longTasks: result.longTasks, governorChanges: result.governorChanges, readyMs: null }), ...result });
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await hosted.close(); await rm(profile, { recursive: true, force: true }); }
}
async function ready(target: Target, backend: Backend, cache: 'cold' | 'warm', runs: number, headless: boolean) {
  if (target === 'pilot' && (tier !== 'high' || rewriteUrl)) throw new Error('The sealed pilot runs only at quality high from the kit copy');
  const hosted = await host(target); await mkdir(profileRoot(), { recursive: true });
  const measure = async (browser: Browser, run: number, load: unknown) => {
    const page = await newPage(browser, target);
    try {
      await page.goto(url(hosted.url, target, backend), { waitUntil: 'load', timeout: READY_TIMEOUT });
      const readyMs = await waitReady(page), declaredReadyMs = await page.evaluate(() => (window as any).__hub.declaredAt as number | null), navigation = await page.evaluate(() => { const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { responseEnd: entry.responseEnd, domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd }; });
      const { stableMs, ...stable } = await waitStable(page);
      const reportedBackend = target === 'rewrite' ? await page.evaluate(() => document.querySelector('.ks-root')?.getAttribute('data-kiln-backend')) : `${backend} (URL parameter; the sealed pilot does not expose its backend before a measurement)`;
      if (target === 'rewrite' && reportedBackend !== backend) throw new Error(`Rewrite runs ${reportedBackend}, not ${backend}`);
      const env = await environment(browser, page);
      return save(`ready-${target}-${cache}-${backend}${tier === 'high' ? '' : '-' + tier}-run${run}.json`, { schema: 'kiln.farm-hub-perf/1', id: 'X-04', measure: 'ready', target, cache, backend, tier, run, stableMs, readyMs, declaredReadyMs, stable, navigation, reportedBackend, hostLoadBefore: load, environment: env,
        spec: specRecord(env, backend, null, { frames: null, medianMs: null, p95Ms: null, p99Ms: null, cpuRenderMedianMs: null, drawCalls: null, triangles: null, longTasks: null, governorChanges: null, readyMs: stableMs }),
        method: 'stableMs (X-04 since D-23, owner decision 2026-09-29 22:05; spec.readyMs carries it): milliseconds from navigation start to the end of the first stable frame, the first frame from the ready frame on that creates no shader, program or pipeline, ends with no asynchronous creation in flight and lasts at most 50 ms (stable.frames lists [interval ms, creations, in flight] per frame from the ready frame). readyMs: to the first animation frame at which the scene is ready (rewrite: onReady in its test harness; pilot: its load line and enabled play button; the M2 and M3 measure). declaredReadyMs (M3): the moment the scene declares readiness, from a MutationObserver on its status line (rewrite: inside onReady; pilot: when its ready line appears with the play button enabled)' });
    } finally { await page.close(); }
  };
  try {
    if (cache === 'cold') {
      for (let run = 1; run <= runs; run++) {
        const load = await hostLoad(), profile = await mkdtemp(resolve(profileRoot(), `ready-cold-${target}-`)); let browser: Browser | undefined;
        try { browser = await launch(profile, headless); await measure(browser, run, load); } finally { await browser?.close(); await rm(profile, { recursive: true, force: true }); }
      }
    } else {
      const profile = await mkdtemp(resolve(profileRoot(), `ready-warm-${target}-`)); let browser: Browser | undefined;
      try {
        browser = await launch(profile, headless);
        const warm = await newPage(browser, target); await warm.goto(url(hosted.url, target, backend), { waitUntil: 'load', timeout: READY_TIMEOUT }); await waitReady(warm); await warm.close();
        for (let run = 1; run <= runs; run++) await measure(browser, run, await hostLoad());
      } finally { await browser?.close(); await rm(profile, { recursive: true, force: true }); }
    }
  } finally { await hosted.close(); }
}

/**
 * The X-05 hitch rule (./hitch-rule.ts) was the M4 proposal: hitch limits per tier for each 60 s rewrite run, from the M4
 * hitch measurements (evidence/m4/hitches/README.md). Since the warm pass (SPEC 6.4, D-23) no pipeline is compiled after
 * ready, so the same limits hold from the first frame sampled: no frame over 100 ms, no frame over 50 ms (the hub's M3
 * minimal-tier hitches were 58.5 to 216.6 ms, every other hub run stayed at or under 33.4 ms), and so a longest frame of
 * at most 50 ms. The same for every tier on the hub, where each tier runs at the display's rate. It became a gate on
 * 2026-09-30 (D-28) after the hub's X-05 runs of that day held it on all 160 runs: `compare` now fails on any miss.
 */
const readRecords = async (dir: string) => existsSync(dir) ? Promise.all((await readdir(dir)).filter(name => /^(frames|ready)-.*-run\d+\.json$/.test(name))
  .map(async name => ({ name, ...JSON.parse(await readFile(resolve(dir, name), 'utf8')) }))) : [];
async function compare() {
  const records = await readRecords(out), tierRecords = await readRecords(resolve(out, 'x05'));
  const median = (values: number[]) => percentile(values, .5);
  const x01: unknown[] = [], x04: unknown[] = [], x04Ready: unknown[] = [], x04Declared: unknown[] = [], x05: unknown[] = [];
  for (const workload of PILOT_WORKLOADS) for (const backend of ['webgpu', 'webgl2'] as const) {
    const side = (target: Target) => records.filter(r => r.measure === 'frames' && r.tier === 'high' && r.target === target && r.workload === workload && r.backend === backend);
    const pilot = side('pilot'), rewrite = side('rewrite'); if (!pilot.length || !rewrite.length) continue;
    const metric = (list: any[], key: 'frameIntervalMs' | 'cpuRenderMs', q: 'p50' | 'p95') => median(list.map(r => r[key][q]));
    const rows = (['frameIntervalMs', 'cpuRenderMs'] as const).flatMap(key => (['p50', 'p95'] as const).map(q => { const p = metric(pilot, key, q)!, n = metric(rewrite, key, q)!; return { metric: `${key}.${q}`, pilot: p, rewrite: n, ratio: n / p, pass: n <= p * 1.1 }; }));
    const valid = [...pilot, ...rewrite].every(r => r.valid && r.hostLoadBefore?.quiet);
    x01.push({ workload, backend, runs: { pilot: pilot.length, rewrite: rewrite.length }, rows, allRunsValidAndQuiet: valid, pass: valid && rows.every(row => row.pass) });
  }
  for (const cache of ['cold', 'warm'] as const) for (const backend of ['webgpu', 'webgl2'] as const) {
    const side = (target: Target) => records.filter(r => r.measure === 'ready' && (r.tier ?? 'high') === 'high' && r.target === target && r.cache === cache && r.backend === backend).map(r => r as any);
    const pilot = side('pilot'), rewrite = side('rewrite'); if (!pilot.length || !rewrite.length) continue;
    const quiet = [...pilot, ...rewrite].every(r => r.hostLoadBefore?.quiet), runs = { pilot: pilot.length, rewrite: rewrite.length };
    // One rule for each moment: median over runs, the rewrite within 120% of the pilot, every WebGL2 rewrite run at most 45 s.
    const rule = (key: 'stableMs' | 'readyMs' | 'declaredReadyMs') => {
      const all = [...pilot, ...rewrite], older = all.filter(r => !(key in r)).length, missing = all.filter(r => key in r && typeof r[key] !== 'number').length;
      if (older) return { cache, backend, runs, pass: false, reason: `${older} result files predate ${key}; re-run them with this runner` };
      if (missing) return { cache, backend, runs, pass: false, reason: `${missing} runs reached no ${key} within ${READY_TIMEOUT / 1000} s` };
      const p = median(pilot.map(r => r[key]))!, n = median(rewrite.map(r => r[key]))!, worst = Math.max(...rewrite.map(r => r[key]));
      const hard = backend === 'webgl2' ? worst <= 45_000 : true;
      return { cache, backend, runs, pilotMedianMs: p, rewriteMedianMs: n, ratio: n / p, rewriteWorstMs: worst, webgl2HardLimit45s: hard, allRunsQuiet: quiet, pass: quiet && n <= p * 1.2 && hard };
    };
    x04.push(rule('stableMs')); x04Ready.push(rule('readyMs')); x04Declared.push(rule('declaredReadyMs'));
  }
  // X-05: the rewrite alone, per tier, backend and workload, from results/x05 (60 s runs).
  for (const t of ['high', 'balanced', 'economy', 'minimal']) for (const backend of ['webgpu', 'webgl2'] as const) for (const workload of WORKLOADS) {
    const runs = tierRecords.filter(r => r.measure === 'frames' && r.target === 'rewrite' && r.tier === t && r.backend === backend && r.workload === workload);
    if (!runs.length) continue;
    const perRun = runs.map(r => {
      const sampled: number | null = r.sampledMs ?? (r.frameIntervalsMs as number[] | null)?.reduce((sum: number, value: number) => sum + value, 0) ?? null;
      return { run: r.run as number, valid: r.valid === true, quiet: r.hostLoadBefore?.quiet === true, seconds: (r.sampleSeconds ?? null) as number | null,
        p50: r.frameIntervalMs.p50 as number | null, p95: r.frameIntervalMs.p95 as number | null, fps: (r.fps ?? (sampled ? 1000 * r.frameIntervalMs.count / sampled : null)) as number | null,
        over50: r.framesOver50Ms as number | null, over100: r.framesOver100Ms as number | null, maxMs: r.frameIntervalMs.max as number | null,
        over50PerMinute: sampled && typeof r.framesOver50Ms === 'number' ? r.framesOver50Ms / (sampled / 60_000) : null };
    });
    const range = (key: 'p50' | 'p95' | 'fps' | 'over50' | 'over100' | 'maxMs' | 'over50PerMinute') => {
      const values = perRun.map(run => run[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      return values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values) } : null;
    };
    const fps = range('fps'), allValidQuiet = perRun.every(run => run.valid && run.quiet);
    // The gate (D-28): every run valid, quiet and within the tier's hitch limits.
    const hitchRule = hitchVerdict(perRun, t);
    x05.push({ tier: t, backend, workload, runs: perRun.length, seconds: [...new Set(perRun.map(run => run.seconds))], allRunsValidAndQuiet: allValidQuiet,
      frameIntervalP50Ms: range('p50'), frameIntervalP95Ms: range('p95'), fps, framesOver50Ms: range('over50'), framesOver50PerMinute: range('over50PerMinute'), framesOver100Ms: range('over100'), maxFrameMs: range('maxMs'),
      sixtyFpsOrBetter: fps ? fps.median! >= 60 : null,
      hitchRule, pass: hitchRule.pass, perRun });
  }
  const gates = { 'X-01': x01.every(cell => (cell as { pass: boolean }).pass), 'X-04': x04.every(cell => (cell as { pass: boolean }).pass), 'X-05': x05.every(cell => (cell as { pass: boolean }).pass) };
  const summary = { schema: 'kiln.farm-hub-comparison/3', pass: Object.values(gates).every(Boolean), gates, rules: {
    'X-01': 'Median over runs of each per-run value; rewrite frame-interval and CPU-render p50 and p95 each within 110% of the pilot',
    'X-04': 'Owner decision 2026-09-29 22:05 (D-23): time to the first stable frame (stableMs), the first frame from the ready frame on that creates no shader, program or pipeline, ends with no asynchronous creation in flight and lasts at most 50 ms, measured the same way for both. Median over runs; rewrite within 120% of the pilot; WebGL2 worst rewrite run at most 45 s',
    'X-04 ready (extra column)': 'The same rule on readyMs, the first animation frame at which each scene is ready (the M2 and M3 measure)',
    'X-04 declared (extra column)': 'The same rule on declaredReadyMs, the moment each scene declares readiness (rewrite onReady; pilot ready line with its play button enabled)',
    'X-05': "The rewrite alone from results/x05 (SPEC 20.1: tiers high, balanced and economy, both backends, workloads living-orbit, living-route, walk and tractor-drive, 60 s, 5 runs): median and range over runs of each run's p50 and p95 frame interval, FPS, frames over 50 and 100 ms and the longest frame. Targets are SPEC 20.2 (the hub GPU row: 60 FPS or better at the tier the kit selects, X-06); sixtyFpsOrBetter reports that for every tier. hitchRule is the gate adopted 2026-09-30 (D-28; scripts/hitch-rule.ts): per run, no frame over 100 ms, none over 50 ms and a longest frame of at most 50 ms, every run valid and quiet; a cell passes only when all its runs do",
  }, x01, x04, x04Ready, x04Declared, x05 };
  await save('comparison.json', summary);
  return summary;
}

/** Local plumbing proof (SPEC 20.3): one 5 s rewrite sample, the pilot's own no-timing probe per workload, one readiness per side. Every number is discarded. */
async function smoke(headless: boolean) {
  const checks: { name: string; ok: boolean; detail: unknown }[] = [];
  for (const target of ['rewrite', 'pilot'] as const) {
    const hosted = await host(target); await mkdir(profileRoot(), { recursive: true });
    const profile = await mkdtemp(resolve(profileRoot(), `smoke-${target}-`)); let browser: Browser | undefined;
    try {
      browser = await launch(profile, headless);
      for (const workload of target === 'pilot' ? PILOT_WORKLOADS : WORKLOADS) {
        const page = await newPage(browser, target);
        try {
          if (target === 'pilot') { const probe = await pilotFrames(page, hosted.url, 'webgpu', workload, true); checks.push({ name: `pilot ${workload}: sealed instrumentation probe (no timing retained)`, ok: probe.valid, detail: probe.report }); }
          else {
            // The real runs' 5 s warm-up, then the one 5 s sample (living-orbit); the other workloads only prove they move the camera or drive.
            const result = await rewriteFrames(page, hosted.url, 'webgpu', workload, WARMUP_MS, workload === 'living-orbit' ? 5_000 : 4_000);
            const seriesKept = result.frameIntervalsMs.length === result.frameIntervalMs.count && Number.isInteger(result.framesOver100Ms);
            checks.push({ name: `rewrite ${workload}`, ok: result.valid && seriesKept, detail: { ...result.checks, framesRecorded: result.frameIntervalMs.count > 0, cpuSamplesRecorded: result.cpuRenderMs.count > 0, intervalSeriesAndOver100Kept: seriesKept, numbers: 'discarded' } });
          }
        } finally { await page.close(); }
      }
      const page = await newPage(browser, target);
      try { await page.goto(url(hosted.url, target, 'webgpu'), { waitUntil: 'load', timeout: READY_TIMEOUT }); checks.push({ name: `${target} readiness observed from navigation start`, ok: Number.isFinite(await waitReady(page)), detail: 'value discarded' });
        checks.push({ name: `${target} declared readiness recorded (M3)`, ok: await page.evaluate(() => Number.isFinite((window as any).__hub.declaredAt)), detail: 'value discarded' });
        const stable = await waitStable(page);
        checks.push({ name: `${target} first stable frame recorded (D-23)`, ok: Number.isFinite(stable.stableMs), detail: { framesFromReady: stable.framesFromReady, creationsAfterReady: stable.createdAfterReady, timing: 'discarded' } }); }
      finally { await page.close(); }
    } finally { await browser?.close(); await hosted.close(); await rm(profile, { recursive: true, force: true }); }
  }
  return { schema: 'kiln.farm-hub-smoke/1', note: 'Plumbing check only. Timing values are discarded and never cited (SPEC 20.3).', pass: checks.every(check => check.ok), checks };
}

async function verifyKit() {
  const manifest = JSON.parse(await readFile(resolve(kit, 'MANIFEST.json'), 'utf8')) as { files: { path: string; bytes: number; sha256: string }[] };
  const problems: string[] = [];
  for (const entry of manifest.files) {
    const file = resolve(kit, entry.path);
    if (!existsSync(file)) { problems.push(`missing ${entry.path}`); continue; }
    const data = await readFile(file); if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) problems.push(`changed ${entry.path}`);
  }
  return { files: manifest.files.length, problems };
}

const backendOption = () => { const value = option('--backend', 'webgpu'); if (value !== 'webgpu' && value !== 'webgl2') throw new Error('--backend is webgpu or webgl2'); return value as Backend; };
const targetOption = () => { const value = option('--target'); if (value !== 'pilot' && value !== 'rewrite') throw new Error('--target is pilot or rewrite'); return value as Target; };
const headless = flag('--headless');
if (command === 'frames') await frames(targetOption(), backendOption(), option('--workload', 'living-orbit')!, Number(option('--runs', '3')), headless);
else if (command === 'ready') { const cache = option('--cache', 'cold'); if (cache !== 'cold' && cache !== 'warm') throw new Error('--cache is cold or warm'); await ready(targetOption(), backendOption(), cache, Number(option('--runs', '5')), headless); }
else if (command === 'compare') { const result = await compare(); console.log(JSON.stringify({ pass: result.pass, gates: result.gates, cells: { 'X-01': result.x01.length, 'X-04': result.x04.length, 'X-05': result.x05.length } })); if (!result.pass) process.exitCode = 1; }
else if (command === 'smoke') { const result = await smoke(headless); console.log(JSON.stringify(result, null, 2)); if (option('--smoke-out')) await writeFile(resolve(option('--smoke-out')!), JSON.stringify(result, null, 2) + '\n'); if (!result.pass) process.exitCode = 1; }
else if (command === 'verify') { const result = await verifyKit(); console.log(JSON.stringify(result)); if (result.problems.length) process.exitCode = 1; }
else console.log('Usage: node runner/perf-farm.mjs <frames|ready|compare|smoke|verify> [--target pilot|rewrite] [--backend webgpu|webgl2] [--workload living-orbit|living-route|tractor-drive|walk (walk: rewrite only)] [--cache cold|warm] [--runs n] [--tier high|balanced|economy|minimal (rewrite)] [--seconds n (rewrite)] [--url served rewrite test build] [--chrome path] [--chrome-arg flag]... [--headless] [--out dir] [--kit dir]');
