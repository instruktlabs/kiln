// Golden Gate hub run kit runner (SPEC 20.3; PERFORMANCE.md): the deferred timing checks X-04 (time to
// ready), X-05 (desktop tiers), X-06 (the tier the kit selects and its frame rate) and X-09/X-10 (soak and
// governor), on one machine with one Chrome. It collects timing only when a person runs it explicitly on
// an idle qualification machine; every timing command first runs the load gate below. The one permitted
// use on the dev PC is `smoke`, which checks the plumbing and discards every number.
// Runs under Node 22 (bundled by tests/tools/make-hub-kit.ts) or Bun; no network access is needed.
// Every result file also records its page's browser console and the WebGL renderer string (environment.webgl);
// a run that throws leaves results/failures/<run>-<time>.json with the error, console and environment (fix round 1).
import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import * as os from 'node:os';
import { cpus, release, type as osType } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { captureConsole, consoleOf, measureFrames, measureReady, pageEnvironment, percentile, prepare, sceneUrl, specRecord, summarize, waitReady, inPageWait, PRESETS, SIXTY_FPS_MS, TIERS, WARMUP_MS, WORKLOADS } from './perf-core';
import type { Backend, Tier, Workload } from './perf-core';

const argv = process.argv.slice(2), command = argv[0] ?? 'help';
const flag = (name: string) => argv.includes(name);
const option = (name: string, fallback?: string) => {
  const inline = argv.find(a => a.startsWith(name + '=')); if (inline) return inline.slice(name.length + 1);
  const at = argv.indexOf(name); if (at < 0) return fallback; const value = argv[at + 1];
  if (value === undefined || (value.startsWith('--') && name !== '--chrome-arg')) throw new Error(`${name} needs a value`); return value;
};
/** Repeatable; both `--chrome-arg <flag>` and `--chrome-arg=<flag>` are accepted. */
const many = (name: string) => argv.flatMap((value, at) => value.startsWith(name + '=') ? [value.slice(name.length + 1)] : argv[at - 1] === name ? [value] : []);
const here = dirname(fileURLToPath(import.meta.url));
// In the kit the runner sits in <kit>/runner; elsewhere pass --kit (a directory holding test/) or --url.
const kit = resolve(option('--kit', resolve(here, '..'))!), out = resolve(option('--out', option('--results', resolve(kit, 'results')))!);
const width = Number(option('--width', '1920')), height = Number(option('--height', '1080'));
const [portLow, portHigh] = option('--ports', '4600-4649')!.split('-').map(Number) as [number, number];
const chrome = option('--chrome', process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const headless = flag('--headless'), servedUrl = option('--url'), preset = option('--preset', 'day')!;
const sampleSeconds = Number(option('--seconds', '60'));
// The load gate (the sealed pilot's hub preflight): 8 samples of 2 s, CPU mean < 5 %, CPU max < 12 %, GPU <= 3 %.
const gate = { cpuMean: Number(option('--quiet-cpu-mean', '5')), cpuMax: Number(option('--quiet-cpu-max', '12')), gpuMax: Number(option('--quiet-gpu', '3')), waitMinutes: Number(option('--wait-quiet', '15')) };
if (!(PRESETS as readonly string[]).includes(preset)) throw new Error(`--preset is ${PRESETS.join(', ')}`);
if (!(sampleSeconds > 0)) throw new Error('--seconds must be positive');

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
/** A no-store static server for the kit's test build. Binds 127.0.0.1 only, trying each port in the range; never probes a listener. */
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
const host = async () => servedUrl ? { url: servedUrl, port: null, close: async () => {} } : serve(resolve(kit, 'test'));

async function launch(profile: string): Promise<Browser> {
  if (!chrome || !existsSync(chrome)) throw new Error('Pass --chrome <path to the installed Chrome>');
  // A headed window is pinned to the primary display's origin, so it never spans two displays.
  return puppeteer.launch({ executablePath: chrome, headless, pipe: true, userDataDir: profile, defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', `--window-size=${width},${height}`, ...(headless ? ['--hide-scrollbars'] : ['--window-position=0,0']), ...many('--chrome-arg')] });
}
async function newPage(browser: Browser, measureFromStart: boolean): Promise<Page> {
  const page = await browser.newPage(); captureConsole(page); await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await prepare(page, measureFromStart); return page;
}

/** Host CPU (all cores, from os.cpus) and, where present, NVIDIA GPU utilisation over one interval. */
async function loadSample(ms: number) {
  const cpuTimes = () => cpus().reduce((sum, cpu) => { const t = cpu.times; return { idle: sum.idle + t.idle, total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq }; }, { idle: 0, total: 0 });
  const a = cpuTimes(); await new Promise(done => setTimeout(done, ms)); const b = cpuTimes();
  const gpu = await new Promise<string | null>(done => execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,temperature.gpu', '--format=csv,noheader,nounits'], { timeout: 5000 }, (error, stdout) => done(error ? null : stdout.trim().split('\n')[0]!)));
  const parts = gpu?.split(',').map(s => s.trim());
  return { at: new Date().toISOString(), cpuPercent: b.total > a.total ? 100 * (1 - (b.idle - a.idle) / (b.total - a.total)) : null, gpu: parts ? { name: parts[0], utilizationPercent: Number(parts[1]), memoryUsedMiB: Number(parts[2]), temperatureC: Number(parts[3]) } : null };
}
/** The load gate before a command group: 8 samples of 2 s, repeated every 30 s until quiet or --wait-quiet minutes pass. */
async function preflight(name: string) {
  const deadline = Date.now() + gate.waitMinutes * 60_000;
  for (let attempt = 1; ; attempt++) {
    const samples = []; for (let i = 0; i < 8; i++) samples.push(await loadSample(2000));
    const cpu = samples.map(s => s.cpuPercent ?? 100), gpuMax = Math.max(...samples.map(s => s.gpu?.utilizationPercent ?? 0));
    const cpuMean = cpu.reduce((s, v) => s + v, 0) / cpu.length, cpuMax = Math.max(...cpu);
    const quiet = cpuMean < gate.cpuMean && cpuMax < gate.cpuMax && gpuMax <= gate.gpuMax;
    const record = { schema: 'kiln.golden-gate-preflight/1', group: name, attempt, quiet, cpuMean, cpuMax, gpuMax, rule: `CPU mean < ${gate.cpuMean} %, CPU max < ${gate.cpuMax} %, NVIDIA GPU <= ${gate.gpuMax} % over 8 samples of 2 s`, host: hostname(), samples };
    await save(`preflight/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, record);
    console.log(JSON.stringify({ event: 'preflight', group: name, attempt, quiet, cpuMean: +cpuMean.toFixed(2), cpuMax: +cpuMax.toFixed(2), gpuMax }));
    if (quiet) return record;
    if (Date.now() + 30_000 > deadline) throw new Error(`The machine stayed busy for ${gate.waitMinutes} minutes; nothing was timed`);
    await new Promise(done => setTimeout(done, 30_000));
  }
}
async function environment(browser: Browser, page: Page) {
  const gpu = (await loadSample(10)).gpu;
  return { browser: await browser.version(), platform: `${osType()} ${release()}`, host: hostname(), cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length, gpu: gpu?.name ?? null, node: process.version,
    window: { width, height, deviceScaleFactor: 1, headless, position: headless ? null : '0,0', chromeArgs: many('--chrome-arg') }, ...(await pageEnvironment(page)) };
}
const deviceName = (env: Awaited<ReturnType<typeof environment>>) => `${env.platform}, ${env.cpu ?? 'unknown CPU'}${env.gpu ? `, ${env.gpu}` : ''}`;
async function save(name: string, value: unknown) { const file = resolve(out, name); await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); console.log(`wrote ${relative(process.cwd(), file)}`); return file; }
/**
 * A run that throws (the scene failed to start, or ran another backend or tier) leaves results/failures/<run>-<time>.json
 * with the error, the page's console and the environment, including the WebGL renderer string; the error then ends
 * the command exactly as before. The summary reads only the x0* files at the top of results/, so no gate sees these.
 */
async function recordFailure(name: string, browser: Browser, page: Page, error: unknown, context: Record<string, unknown>) {
  const env = await environment(browser, page).catch(e => ({ error: String(e) }));
  await save(`failures/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, { schema: 'kiln.golden-gate-perf-failure/1', ...context, error: String((error as Error)?.message ?? error), environment: env, console: consoleOf(page) })
    .catch(e => console.log(JSON.stringify({ event: 'failure-record-not-written', name, error: String(e) })));
}
const settle = () => new Promise(done => setTimeout(done, 3000));
// The repository's Node type stubs (types/node-runtime.d.ts) omit these; both exist in Node 22 and Bun.
const hostname = () => (os as unknown as { hostname(): string }).hostname();
const rmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 };
const profileRoot = () => resolve(kit, 'tmp');
async function withBrowser<T>(label: string, fn: (browser: Browser) => Promise<T>): Promise<T> {
  await mkdir(profileRoot(), { recursive: true }); const profile = await mkdtemp(resolve(profileRoot(), `${label}-`)); let browser: Browser | undefined;
  try { browser = await launch(profile); return await fn(browser); } finally { await browser?.close(); await rm(profile, rmOptions); }
}

function backendOption(): Backend { const value = option('--backend', 'webgpu'); if (value !== 'webgpu' && value !== 'webgl2') throw new Error('--backend is webgpu or webgl2'); return value; }
function workloadOption(): Workload { const value = option('--workload', 'orbit') as Workload; if (!WORKLOADS.includes(value)) throw new Error(`--workload is ${WORKLOADS.join(', ')}`); return value; }
function tierOption(): Tier { const value = option('--tier', 'high') as Tier; if (!TIERS.includes(value)) throw new Error(`--tier is ${TIERS.join(', ')}`); return value; }

/** X-05 (a fixed tier, governor held at level 0) or X-06 (the kit's automatic tier, governor live). */
async function frames(tier: Tier | 'auto', backend: Backend, workload: Workload, runs: number) {
  const id = tier === 'auto' ? 'X-06' : 'X-05', gateRecord = flag('--no-preflight') ? null : await preflight(`${id}-${tier}-${backend}-${workload}`);
  const hosted = await host();
  try {
    await withBrowser(`frames-${tier}`, async browser => {
      for (let run = 1; run <= runs; run++) {
        await settle(); const load = await loadSample(1000), page = await newPage(browser, tier === 'auto');
        try {
          const result = await measureFrames(page, { base: hosted.url, backend, tier, workload, warmupMs: WARMUP_MS, sampleMs: sampleSeconds * 1000, preset, requireBackend: true });
          const env = await environment(browser, page), selected = result.tierAtStart?.tier ?? null;
          await save(`${id.toLowerCase().replace('-', '')}-${tier}-${backend}-${workload}-run${run}.json`, { schema: 'kiln.golden-gate-perf/1', id, measure: 'frames', tier, selectedTier: selected, workload, requestedBackend: backend, preset, run,
            seconds: sampleSeconds, preflight: gateRecord && { quiet: gateRecord.quiet, cpuMean: gateRecord.cpuMean, cpuMax: gateRecord.cpuMax, gpuMax: gateRecord.gpuMax }, hostLoadBefore: load, environment: env, console: consoleOf(page),
            spec: specRecord(deviceName(env), env.browser, result.backend, env.adapter, selected, workload, { frames: result.frameIntervalMs.count, medianMs: result.frameIntervalMs.p50, p95Ms: result.frameIntervalMs.p95, p99Ms: result.frameIntervalMs.p99,
              cpuRenderMedianMs: result.cpuRenderMs.p50, drawCalls: result.drawCalls.median, triangles: result.triangles.median, longTasks: result.longTasks, governorChanges: result.governorChanges, readyMs: result.readyMs }), ...result });
        } catch (error) {
          await recordFailure(`${id.toLowerCase().replace('-', '')}-${tier}-${backend}-${workload}-run${run}`, browser, page, error, { id, measure: 'frames', tier, workload, requestedBackend: backend, preset, run, hostLoadBefore: load });
          throw error;
        } finally { await page.close(); }
      }
    });
  } finally { await hosted.close(); }
}
/** X-04: cold (a new profile per run) or warm (one profile after one discarded load), the kit's automatic tier. */
async function ready(backend: Backend, cache: 'cold' | 'warm', runs: number) {
  const gateRecord = flag('--no-preflight') ? null : await preflight(`X-04-${cache}-${backend}`), hosted = await host();
  const measure = async (browser: Browser, run: number) => {
    await settle(); const load = await loadSample(1000), page = await newPage(browser, true);
    try {
      const result = await measureReady(page, { base: hosted.url, backend, tier: 'auto', preset, requireBackend: true }), env = await environment(browser, page);
      await save(`x04-${cache}-${backend}-run${run}.json`, { schema: 'kiln.golden-gate-perf/1', id: 'X-04', measure: 'ready', cache, requestedBackend: backend, preset, run, preflight: gateRecord && { quiet: gateRecord.quiet, cpuMean: gateRecord.cpuMean, cpuMax: gateRecord.cpuMax, gpuMax: gateRecord.gpuMax },
        hostLoadBefore: load, environment: env, console: consoleOf(page), spec: specRecord(deviceName(env), env.browser, result.backend, env.adapter, result.tier?.tier ?? null, null, { frames: null, medianMs: null, p95Ms: null, p99Ms: null, cpuRenderMedianMs: null, drawCalls: null, triangles: null, longTasks: null, governorChanges: null, readyMs: result.readyMs }), ...result });
    } catch (error) {
      await recordFailure(`x04-${cache}-${backend}-run${run}`, browser, page, error, { id: 'X-04', measure: 'ready', cache, requestedBackend: backend, preset, run, hostLoadBefore: load });
      throw error;
    } finally { await page.close(); }
  };
  try {
    if (cache === 'cold') for (let run = 1; run <= runs; run++) await withBrowser('ready-cold', browser => measure(browser, run));
    else await withBrowser('ready-warm', async browser => {
      const warm = await newPage(browser, true); await warm.goto(sceneUrl(hosted.url, { tier: 'auto', backend, preset }), { waitUntil: 'load' }); await waitReady(warm); await warm.close();
      for (let run = 1; run <= runs; run++) await measure(browser, run);
    });
  } finally { await hosted.close(); }
}
/**
 * X-09 and X-10: one session at the automatic tier with the governor live, the orbit and the drive
 * alternating every five minutes. Each minute records the frame intervals, long tasks, the governor's
 * level changes and the heap (CDP Runtime.getHeapUsage); a forced collection before and after gives the growth.
 */
async function soak(backend: Backend, minutes: number) {
  const gateRecord = flag('--no-preflight') ? null : await preflight(`X-09-soak-${backend}`), hosted = await host();
  try {
    await withBrowser('soak', async browser => {
      const page = await newPage(browser, true), client = await page.createCDPSession();
      const heap = async (collect: boolean) => { if (collect) await client.send('HeapProfiler.collectGarbage'); return (await client.send('Runtime.getHeapUsage')).usedSize; };
      try {
        await page.goto(sceneUrl(hosted.url, { tier: 'auto', backend, preset }), { waitUntil: 'load' }); const readyMs = await waitReady(page);
        const backendNow = await page.evaluate(() => document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'));
        if (backendNow !== backend) throw new Error(`The scene runs ${backendNow}, not ${backend}`);
        const minuteRecords: unknown[] = []; let heapStart: number | null = null;
        await page.evaluate(() => { const api = (window as any).__kilnScene, rec = (window as any).__ggPerf; api.beginMeasurement(); rec.intervals = []; rec.last = null; rec.recording = true; });
        for (let minute = 0; minute < minutes; minute++) {
          const workload = Math.floor(minute / 5) % 2 === 0 ? 'orbit' : 'drive';
          if (minute % 5 === 0) await page.evaluate(name => (window as any).__kilnScene.runWorkload(name), workload);
          if (minute === 5) heapStart = await heap(true);
          await inPageWait(page, 60_000);
          const m = await page.evaluate(() => {
            const api = (window as any).__kilnScene, rec = (window as any).__ggPerf, host = (window as any).__kilnHarness.snapshot(), intervals = rec.intervals.slice(); rec.intervals = [];
            return { intervals, longTasks: api.stats().longTasks, tier: api.tierState(), changes: host.tiers.filter((t: any) => t.kind === 'live').length, errors: host.errors.length, visibility: document.visibilityState };
          });
          const used = await heap(false);
          minuteRecords.push({ minute: minute + 1, workload, frameIntervalMs: summarize(m.intervals), averageFps: m.intervals.length / (m.intervals.reduce((s: number, v: number) => s + v, 0) / 1000), longTasksSinceStart: m.longTasks,
            tier: m.tier && { tier: m.tier.tier, level: m.tier.level }, governorChangesSinceStart: m.changes, errors: m.errors, visibility: m.visibility, heapUsedBytes: used });
          console.log(JSON.stringify({ event: 'soak-minute', minute: minute + 1, workload, tier: m.tier?.tier, level: m.tier?.level, changes: m.changes }));
        }
        const heapEnd = await heap(true), env = await environment(browser, page);
        const perMinute = (minuteRecords as { governorChangesSinceStart: number }[]).map((r, i, all) => r.governorChangesSinceStart - (i ? all[i - 1]!.governorChangesSinceStart : 0));
        const finalLongTasks = (minuteRecords.at(-1) as { longTasksSinceStart: number | null }).longTasksSinceStart;
        await save(`x09-soak-${backend}.json`, { schema: 'kiln.golden-gate-perf/1', id: 'X-09/X-10', measure: 'soak', backend, preset, minutes, readyMs, preflight: gateRecord && { quiet: gateRecord.quiet, cpuMean: gateRecord.cpuMean, cpuMax: gateRecord.cpuMax, gpuMax: gateRecord.gpuMax },
          environment: env, console: consoleOf(page), heap: { afterMinute5Bytes: heapStart, endBytes: heapEnd, growthBytes: heapStart === null ? null : heapEnd - heapStart, method: 'CDP HeapProfiler.collectGarbage then Runtime.getHeapUsage' },
          governor: { changesPerMinuteMax: Math.max(0, ...perMinute), total: perMinute.reduce((s, v) => s + v, 0), perMinute }, longTasksAfterReady: finalLongTasks, minuteRecords });
      } catch (error) {
        await recordFailure(`x09-soak-${backend}`, browser, page, error, { id: 'X-09/X-10', measure: 'soak', requestedBackend: backend, preset, minutes });
        throw error;
      } finally { await client.detach().catch(() => undefined); await page.close(); }
    });
  } finally { await hosted.close(); }
}

async function readResults() {
  const files = existsSync(out) ? (await readdir(out)).filter(name => /^x0[4569].*\.json$/.test(name)) : [];
  return Promise.all(files.map(async name => ({ name, ...JSON.parse(await readFile(resolve(out, name), 'utf8')) })));
}
/** results/summary.json: the SPEC 20.1 rules this scene can apply (it has no pilot, so the checks are absolute; 20.2 hub target 60 FPS). */
async function summary() {
  const records = await readResults(), median = (values: (number | null)[]) => percentile(values.filter((v): v is number => v !== null), .5);
  const frameCase = (list: any[]) => ({ runs: list.length, valid: list.every(r => r.valid), quiet: list.every(r => !r.preflight || r.preflight.quiet),
    medianMs: median(list.map(r => r.frameIntervalMs.p50)), p95Ms: median(list.map(r => r.frameIntervalMs.p95)), averageFps: median(list.map(r => r.averageFps)),
    cpuRenderMedianMs: median(list.map(r => r.cpuRenderMs.p50)), drawCalls: median(list.map(r => r.drawCalls.median)), triangles: median(list.map(r => r.triangles.median)),
    governorChanges: list.reduce((s, r) => s + (r.governorChanges ?? 0), 0), longTasks: list.reduce((s, r) => s + (r.longTasks ?? 0), 0),
    selectedTiers: [...new Set(list.map(r => r.selectedTier))], files: list.map(r => r.name) });
  const x05: unknown[] = [], x06: unknown[] = [], x04: unknown[] = [];
  for (const tier of TIERS) for (const backend of ['webgpu', 'webgl2'] as const) for (const workload of WORKLOADS) {
    const list = records.filter(r => r.id === 'X-05' && r.tier === tier && r.backend === backend && r.workload === workload); if (!list.length) continue;
    const c = frameCase(list); x05.push({ tier, backend, workload, ...c, reaches60Fps: c.medianMs !== null && c.medianMs <= SIXTY_FPS_MS && (c.averageFps ?? 0) >= 60 });
  }
  for (const backend of ['webgpu', 'webgl2'] as const) for (const workload of WORKLOADS) {
    const list = records.filter(r => r.id === 'X-06' && r.backend === backend && r.workload === workload); if (!list.length) continue;
    const c = frameCase(list), reaches = c.medianMs !== null && c.medianMs <= SIXTY_FPS_MS && (c.averageFps ?? 0) >= 60;
    x06.push({ backend, workload, ...c, reaches60Fps: reaches, pass: c.valid && c.quiet && reaches });
  }
  for (const backend of ['webgpu', 'webgl2'] as const) for (const cache of ['cold', 'warm'] as const) {
    const list = records.filter(r => r.id === 'X-04' && r.backend === backend && r.cache === cache); if (!list.length) continue;
    const worst = Math.max(...list.map(r => r.readyMs)), quiet = list.every(r => !r.preflight || r.preflight.quiet);
    x04.push({ backend, cache, runs: list.length, medianMs: median(list.map(r => r.readyMs)), worstMs: worst, quiet, webgl2HardLimit45s: backend === 'webgl2' ? worst <= 45_000 : null, pass: quiet && (backend !== 'webgl2' || worst <= 45_000), files: list.map(r => r.name) });
  }
  const soaks = records.filter(r => r.id === 'X-09/X-10').map(r => ({ backend: r.backend, minutes: r.minutes, heapGrowthBytes: r.heap.growthBytes, governor: { changesPerMinuteMax: r.governor.changesPerMinuteMax, total: r.governor.total }, longTasksAfterReady: r.longTasksAfterReady,
    x09Pass: (r.preflight?.quiet ?? true) && r.heap.growthBytes !== null && r.heap.growthBytes < 2 * 1048576 && r.longTasksAfterReady === 0, x10Pass: r.governor.changesPerMinuteMax <= 4, file: r.name }));
  const result = { schema: 'kiln.golden-gate-perf-summary/1', rules: {
    'X-04': 'Median and worst over runs per backend and cache state; WebGL2 worst at most 45 s (SPEC 20.1; Golden Gate has no pilot, so the relative rule does not apply)',
    'X-05': `Per tier, backend and workload: medians over runs; reaches60Fps when the median frame interval is at most ${SIXTY_FPS_MS} ms and the average rate at least 60 FPS (recorded, no pass rule: 20.2's desktop target is relative to a pilot)`,
    'X-06': 'At the tier the kit selects (automatic quality, governor live): reaches60Fps on every workload, every run valid and quiet (20.2 hub target)',
    'X-09/X-10': 'Soak: heap growth under 2 MB between minute 5 and the end after forced collections, no long task after ready; governor at most 4 level changes in any minute' },
    x04, x05, x06, soak: soaks };
  await save('summary.json', result); return result;
}

/** Plumbing only (SPEC 20.3): every workload engages at tier high on WebGPU, the automatic tier resolves, readiness is observed. Every number is discarded. */
async function smoke() {
  const checks: { name: string; ok: boolean; detail: unknown }[] = [], hosted = await host();
  try {
    await withBrowser('smoke', async browser => {
      for (const workload of WORKLOADS) {
        const page = await newPage(browser, false);
        try {
          // The real runs' 5 s warm-up, then the one 5 s sample (orbit); the other workloads only prove they engage.
          const r = await measureFrames(page, { base: hosted.url, backend: 'webgpu', tier: 'high', workload, warmupMs: WARMUP_MS, sampleMs: workload === 'orbit' ? 5_000 : 3_000, preset, requireBackend: true });
          checks.push({ name: `frames high webgpu ${workload}`, ok: r.valid, detail: { ...r.checks, framesRecorded: r.frameIntervalMs.count > 0, cpuSamplesRecorded: r.cpuRenderMs.count > 0, rendererSamples: r.drawCalls.samples > 0, canvas: r.page.canvas, numbers: 'discarded', console: consoleOf(page) } });
        } finally { await page.close(); }
      }
      const page = await newPage(browser, true);
      try {
        const r = await measureFrames(page, { base: hosted.url, backend: 'webgpu', tier: 'auto', workload: 'orbit', warmupMs: 2_000, sampleMs: 2_000, preset, requireBackend: true });
        checks.push({ name: 'automatic tier resolves with the governor live', ok: r.valid && !!r.tierAtStart?.tier, detail: { ...r.checks, selectedTier: r.tierAtStart?.tier, device: r.tierAtStart?.device, numbers: 'discarded' } });
      } finally { await page.close(); }
      const ready = await newPage(browser, true);
      try {
        const r = await measureReady(ready, { base: hosted.url, backend: 'webgl2', tier: 'auto', preset, requireBackend: true }), webgl = (await pageEnvironment(ready)).webgl;
        checks.push({ name: 'readiness observed (forced WebGL2)', ok: Number.isFinite(r.readyMs) && r.backend === 'webgl2', detail: { backend: r.backend, tier: r.tier?.tier, value: 'discarded', webgl, console: consoleOf(ready) } });
      }
      finally { await ready.close(); }
    });
  } finally { await hosted.close(); }
  return { schema: 'kiln.golden-gate-smoke/1', note: 'Plumbing check only. Timing values are discarded and never cited (SPEC 20.3).', headless, window: { width, height }, pass: checks.every(c => c.ok), checks };
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

const runs = (fallback: string) => { const n = Number(option('--runs', fallback)); if (!Number.isInteger(n) || n < 1) throw new Error('--runs must be a positive integer'); return n; };
if (command === 'frames') await frames(tierOption(), backendOption(), workloadOption(), runs('5'));
else if (command === 'auto') await frames('auto', backendOption(), workloadOption(), runs('3'));
else if (command === 'ready') { const cache = option('--cache', 'cold'); if (cache !== 'cold' && cache !== 'warm') throw new Error('--cache is cold or warm'); await ready(backendOption(), cache, runs('5')); }
else if (command === 'soak') { const minutes = Number(option('--minutes', '30')); if (!Number.isInteger(minutes) || minutes < 1) throw new Error('--minutes must be a positive integer'); await soak(backendOption(), minutes); }
else if (command === 'preflight') { const r = await preflight('manual'); if (!r.quiet) process.exitCode = 1; }
else if (command === 'summary') console.log(JSON.stringify(await summary(), null, 1).slice(0, 4000));
else if (command === 'smoke') { const r = await smoke(); console.log(JSON.stringify(r, null, 2)); if (option('--smoke-out')) { await mkdir(dirname(resolve(option('--smoke-out')!)), { recursive: true }); await writeFile(resolve(option('--smoke-out')!), JSON.stringify(r, null, 2) + '\n'); } if (!r.pass) process.exitCode = 1; }
else if (command === 'verify') { const r = await verifyKit(); console.log(JSON.stringify(r)); if (r.problems.length) process.exitCode = 1; }
else console.log(`Usage: node runner/perf-gg.mjs <verify|preflight|smoke|frames|auto|ready|soak|summary> [options]
  frames  --tier high|balanced|economy|minimal --backend webgpu|webgl2 --workload orbit|flyover|drive [--runs 5] [--seconds 60]   X-05, governor held at the tier's level 0
  auto    --backend webgpu|webgl2 --workload orbit|flyover|drive [--runs 3] [--seconds 60]   X-06, the kit's automatic tier, governor live
  ready   --backend webgpu|webgl2 --cache cold|warm [--runs 5]   X-04
  soak    --backend webgpu|webgl2 [--minutes 30]   X-09 and X-10
Options: --chrome <path> --chrome-arg <flag> (repeatable) --headless --width 1920 --height 1080 --ports 4600-4649 --out <dir> (alias --results) --kit <dir> --url <served test build>
  --preset day|golden|fog --no-preflight --wait-quiet <minutes> --quiet-cpu-mean 5 --quiet-cpu-max 12 --quiet-gpu 3`);
