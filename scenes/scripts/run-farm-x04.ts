// X-04 bounded attempt (TASK-M3.md item 7): where the time to onReady goes, rewrite against the sealed pilot, on
// both backends. Indicative only (TASK.md): this PC is shared, so every number is recorded beside its load sample and
// settles no budget; the hub re-run with the hub kit is the coordinator's. Page policy follows the hub kit's ready
// step: 1920 x 1080 window and viewport at DPR 1, tier (pilot: quality) high, readiness observed on the first
// animation frame that shows it, a fresh browser profile for every cold run (warm: one browser, one discarded load
// first), and the hub kit's no-store static server policy for both scenes. Beside that next-frame observation it records
// the moment each scene declares readiness: the rewrite's onReady (its harness clears the status line inside the
// callback) and the pilot's ready line with its play button enabled, both timestamped by a MutationObserver.
// M4 (D-23, owner decision 2026-09-29 22:05): X-04 is the time to the first stable frame, measured as the hub runner
// (packages/farm/scripts/perf.ts) measures it: from the ready frame on, the first frame that creates no shader, program or
// pipeline, ends with no asynchronous creation in flight (WebGPU *Async pipelines, WebGL2 programs whose parallel-compile
// status has read false) and lasts at most 50 ms.
//
// Per run it records: the status-text timeline (both scenes show the same phase texts), the rAF timeline, long
// tasks, call counts and synchronous main-thread time of the WebGPU and WebGL2 entry points (pipeline, shader,
// texture and buffer creation, uploads, submits, program links), resource timing and the load sample. With --trace
// one extra run per target and backend records a Chrome trace; the analysis attributes main-thread CPU samples
// (V8 sampling profiler) and GPU-process work between navigation start and readiness. Raw traces stay in .tmp.
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome, workspacePath } from '../packages/scene-kit/src/testing/node';

type Target = 'rewrite' | 'pilot';
type Backend = 'webgpu' | 'webgl2';
const argv = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = argv.indexOf(name); if (at < 0) return fallback; const value = argv[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
const workspace = resolve(import.meta.dir, '..');
const roots: Record<Target, string> = { rewrite: option('--rewrite', 'packages/farm/dist/m4/test'), pilot: option('--pilot', 'packages/farm/dist/hub-kit/pilot/scene') };
const targets = option('--targets', 'rewrite,pilot').split(',') as Target[];
const backends = option('--backends', 'webgpu,webgl2').split(',') as Backend[];
const runs = Number(option('--runs', '3')), label = option('--label', 'phases'), traceOnly = argv.includes('--trace-only'), trace = traceOnly || argv.includes('--trace');
const rewriteParams = option('--rewrite-params', ''), cache = option('--cache', 'cold');
if (!['cold', 'warm'].includes(cache)) throw new Error('--cache is cold or warm');
const out = workspacePath(workspace, option('--dest', `evidence/m4/x04/${label}`));
const traceDir = workspacePath(workspace, `.tmp/x04/traces/${label}`);
const WIDTH = 1920, HEIGHT = 1080, READY_TIMEOUT = 180_000;
for (const t of targets) if (!['rewrite', 'pilot'].includes(t)) throw new Error(`Unknown target ${t}`);
for (const b of backends) if (!['webgpu', 'webgl2'].includes(b)) throw new Error(`Unknown backend ${b}`);

const loadSample = () => new Promise<unknown>(done => execFile('pwsh', ['-NoProfile', '-File', resolve(workspace, 'scripts/load-sample.ps1')], { timeout: 30_000 }, (error, stdout) => {
  if (error) return done({ error: String(error) }); try { done(JSON.parse(stdout.trim())); } catch { done({ error: 'unparsed', stdout }); }
}));

/** Installed before any page script; identical for both scenes. */
function instrument(kind: Target) {
  const w = window as any, now = () => performance.now();
  const x: any = w.__x04 = { status: [], readyAt: null, declaredAt: null, stableAt: null, error: null, frames: [], calls: {}, longTasks: [], pipelineCalls: [],
    created: 0, pending: 0, frame: null, afterReady: [] };
  // D-23: creations counted per frame and asynchronous creations in flight, as the hub runner counts them.
  const creates = new Set(['gl.compileShader', 'gl.linkProgram', 'gpu.createShaderModule', 'gpu.createRenderPipeline', 'gpu.createComputePipeline', 'gpu.createRenderPipelineAsync', 'gpu.createComputePipelineAsync']);
  const linking = new WeakSet<object>();
  const wrap = (proto: any, name: string, key: string) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]) {
      const t = now();
      try {
        const result = original.apply(this, a);
        if (creates.has(key)) { x.created++; if (key.endsWith('Async') && result && typeof result.then === 'function') { x.pending++; result.then(() => { x.pending--; }, () => { x.pending--; }); } }
        if (key === 'gl.getProgramParameter') {
          const program = a[0] as object, pname = a[1] as number;
          if (pname === 0x91B1 /* COMPLETION_STATUS_KHR */) { if (!result && !linking.has(program)) { linking.add(program); x.pending++; } else if (result && linking.delete(program)) x.pending--; }
          else if (pname === 0x8B82 /* LINK_STATUS */ && linking.delete(program)) x.pending--;
        }
        return result;
      }
      finally {
        const c = x.calls[key] ??= { n: 0, ms: 0, first: t, last: t, max: 0 }, d = now() - t;
        c.n++; c.ms += d; c.last = t; if (d > c.max) c.max = d;
        if (key === 'gpu.createRenderPipeline' || key === 'gpu.createRenderPipelineAsync' || key === 'gl.linkProgram') x.pipelineCalls.push(Math.round(t));
      }
    };
  };
  if (w.GPUDevice) for (const m of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync', 'createShaderModule', 'createTexture', 'createBuffer', 'createBindGroup', 'createSampler']) wrap(w.GPUDevice.prototype, m, 'gpu.' + m);
  if (w.GPUQueue) for (const m of ['submit', 'writeTexture', 'writeBuffer', 'copyExternalImageToTexture', 'onSubmittedWorkDone']) wrap(w.GPUQueue.prototype, m, 'gpu.' + m);
  if (w.WebGL2RenderingContext) for (const m of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'texImage3D', 'bufferData', 'bufferSubData', 'generateMipmap', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'readPixels', 'clientWaitSync', 'getError']) wrap(w.WebGL2RenderingContext.prototype, m, 'gl.' + m);
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) x.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  const statusId = kind === 'pilot' ? 'load' : 'page-status';
  const read = () => {
    const text = document.getElementById(statusId)?.textContent ?? null, last = x.status[x.status.length - 1];
    if (text !== null && (!last || last.text !== text)) { x.status.push({ t: Math.round(now()), text }); try { performance.mark(`x04:status:${text.slice(0, 40)}`); } catch { /* marks are optional */ } }
    if (x.declaredAt === null) { try { if (ready()) x.declaredAt = now(); } catch { /* still booting */ } }
  };
  document.addEventListener('DOMContentLoaded', () => { read(); const element = document.getElementById(statusId); if (element) new MutationObserver(read).observe(element, { childList: true, characterData: true, subtree: true }); });
  const ready = kind === 'pilot'
    ? () => /^589 pack placements \+ 843 woodland trees/.test(document.querySelector('#load')?.textContent ?? '') && !(document.querySelector('#play-farm') as HTMLButtonElement | null)?.disabled
    : () => { const s = w.__kilnHarness?.snapshot(); if (s?.errors?.length) x.error = s.errors[0]; return (s?.readyCount ?? 0) > 0; };
  const tick = (t: number) => {
    if (x.frames.length < 4000) x.frames.push(Math.round(t * 10) / 10);
    if (x.readyAt === null && !x.error) { try { if (ready()) { x.readyAt = t; performance.mark('x04:ready'); } } catch { /* still booting */ } }
    if (x.readyAt !== null && x.stableAt === null) {
      if (x.frame) {
        const interval = t - x.frame.start, made = x.created - x.frame.created;
        if (x.afterReady.length < 20_000) x.afterReady.push([Math.round(interval * 1000) / 1000, made, x.pending]);
        if (made === 0 && x.pending === 0 && interval <= 50) { x.stableAt = t; performance.mark('x04:stable'); }
      }
      x.frame = { start: t, created: x.created };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const url = (base: string, target: Target, backend: Backend) => `${base.replace(/[/]+$/, '')}/?${target === 'pilot' ? 'quality=high' : `tier=high${rewriteParams ? '&' + rewriteParams : ''}`}${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'loading', 'toplevel', 'gpu', 'gpu.dawn', 'disabled-by-default-gpu.dawn', 'gpu.service'];

async function measure(browser: Browser, base: string, target: Target, backend: Backend, run: number, tracing: boolean) {
  const loadBefore = await loadSample();
  const page: Page = await browser.newPage(), messages: string[] = [];
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(instrument, target);
    const traceFile = resolve(traceDir, `${target}-${backend}-run${run}.json`);
    if (tracing) { await mkdir(traceDir, { recursive: true }); await page.tracing.start({ path: traceFile, categories: TRACE_CATEGORIES }); }
    await page.goto(url(base, target, backend), { waitUntil: 'load', timeout: READY_TIMEOUT });
    await page.waitForFunction(() => (window as any).__x04.readyAt !== null || (window as any).__x04.error, { timeout: READY_TIMEOUT, polling: 100 });
    await page.waitForFunction(() => (window as any).__x04.stableAt !== null || (window as any).__x04.error, { timeout: READY_TIMEOUT, polling: 100 }).catch(() => undefined);
    // One more second shows whether frames keep flowing after readiness (pipeline compilation still pending).
    await page.evaluate(() => new Promise(done => setTimeout(done, 1500)));
    if (tracing) await page.tracing.stop();
    const record = await page.evaluate(() => {
      const x = (window as any).__x04, nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(r => ({ name: new URL(r.name).pathname, start: r.startTime, end: r.responseEnd, bytes: r.encodedBodySize }));
      const glb = resources.filter(r => r.name.endsWith('.glb'));
      const scripts = resources.filter(r => /\.(m?js)$/.test(r.name));
      return {
        readyMs: x.readyAt, declaredMs: x.declaredAt, stableMs: x.stableAt, afterReady: x.afterReady as number[][], error: x.error, status: x.status, calls: x.calls, pipelineCalls: x.pipelineCalls,
        frames: x.frames as number[], longTasks: x.longTasks as [number, number][],
        backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? (document.querySelector('#renderer')?.textContent ?? '').split(' · ')[0],
        navigation: { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd },
        resources: { count: resources.length, glb: { count: glb.length, firstStart: Math.min(...glb.map(r => r.start)), lastEnd: Math.max(...glb.map(r => r.end)), bytes: glb.reduce((s, r) => s + r.bytes, 0) },
          scripts: { count: scripts.length, lastEnd: Math.max(0, ...scripts.map(r => r.end)), bytes: scripts.reduce((s, r) => s + r.bytes, 0) } },
      };
    });
    const loadAfter = await loadSample();
    const ready = record.readyMs ?? Infinity;
    const before = record.frames.filter(t => t <= ready), after = record.frames.filter(t => t > ready);
    const gaps = (list: number[]) => list.slice(1).map((t, i) => Math.round((t - list[i]!) * 10) / 10);
    const longBefore = record.longTasks.filter(([s]) => s <= ready);
    const summary = {
      schema: 'kiln.farm-x04-attempt/1', label, target, backend, run, tracing, url: url(base, target, backend), window: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, headless: true },
      stableMs: record.stableMs === null ? null : Math.round(record.stableMs), readyMs: record.readyMs === null ? null : Math.round(record.readyMs), declaredReadyMs: record.declaredMs === null ? null : Math.round(record.declaredMs), cache,
      stable: { framesFromReady: record.afterReady.length, creationsAfterReady: record.afterReady.reduce((n, f) => n + f[1]!, 0), inFlightAtReadyFrameEnd: record.afterReady[0]?.[2] ?? null,
        longestIntervalMs: record.afterReady.length ? Math.max(...record.afterReady.map(f => f[0]!)) : null, frames: record.afterReady.slice(0, 40) }, error: record.error, reportedBackend: record.backend, messages,
      status: record.status, navigation: record.navigation, resources: record.resources,
      calls: Object.fromEntries(Object.entries(record.calls as Record<string, { n: number; ms: number; first: number; last: number; max: number }>).map(([k, c]) => [k, { n: c.n, ms: Math.round(c.ms * 10) / 10, first: Math.round(c.first), last: Math.round(c.last), maxMs: Math.round(c.max * 10) / 10 }])),
      pipelineCallsBeforeReady: record.pipelineCalls.filter(t => t <= ready).length, pipelineCallsAfterReady: record.pipelineCalls.filter(t => t > ready).length,
      firstPipelineCallMs: record.pipelineCalls[0] ?? null, lastPipelineCallMs: record.pipelineCalls.at(-1) ?? null,
      frames: { beforeReady: before.length, firstFrameMs: before[0] ?? null, largestGapsBeforeReady: gaps(before).sort((a, b) => b - a).slice(0, 5), afterReady1500ms: after.length, largestGapAfterReady: Math.max(0, ...gaps([before.at(-1) ?? ready, ...after])), aroundReady: [...before.slice(-8), ...after.slice(0, 6)] },
      longTasksBeforeReady: { count: longBefore.length, totalMs: longBefore.reduce((s, [, d]) => s + d, 0), largest: longBefore.slice().sort((a, b) => b[1] - a[1]).slice(0, 6) },
      loadBefore, loadAfter,
      note: 'Indicative only: timing on this shared PC settles no budget (TASK.md). The load samples are taken just before and after the run.',
    };
    return { summary, traceFile: tracing ? traceFile : null };
  } finally { await page.close(); }
}

// ---- Trace analysis: main-thread CPU samples and GPU-process slices between navigation start and readiness ----
interface ProfileNode { id: number; parent?: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number } }
async function analyseTrace(file: string, target: Target) {
  const parsed = JSON.parse(await readFile(file, 'utf8')), events: any[] = Array.isArray(parsed) ? parsed : parsed.traceEvents;
  const threads = new Map<string, string>(), processes = new Map<number, string>();
  for (const e of events) if (e.ph === 'M') { if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name); if (e.name === 'process_name') processes.set(e.pid, e.args?.name); }
  const readyMark = events.filter(e => e.name === 'x04:ready').at(-1);
  if (!readyMark) return { error: 'no x04:ready mark in the trace' };
  const rendererPid = readyMark.pid;
  const navStart = events.filter(e => e.name === 'navigationStart' && e.pid === rendererPid).map(e => e.ts).sort((a, b) => a - b).at(-1)
    ?? events.filter(e => e.pid === rendererPid && e.name === 'markAsMainFrame').map(e => e.ts)[0];
  const t0 = navStart ?? readyMark.ts, t1 = readyMark.ts;
  const marks = events.filter(e => e.pid === rendererPid && typeof e.name === 'string' && e.name.startsWith('x04:status:')).map(e => ({ ms: Math.round((e.ts - t0) / 1000), text: e.name.slice(11) }));
  // CPU profile of the renderer main thread.
  const profiles = new Map<string, { pid: number; tid: number; start: number; nodes: Map<number, ProfileNode>; samples: number[]; deltas: number[] }>();
  for (const e of events) {
    if (e.name === 'Profile') profiles.set(`${e.pid}:${e.id}`, { pid: e.pid, tid: e.tid, start: e.args.data.startTime, nodes: new Map(), samples: [], deltas: [] });
    else if (e.name === 'ProfileChunk') {
      const p = profiles.get(`${e.pid}:${e.id}`); if (!p) continue;
      const data = e.args.data; for (const node of data.cpuProfile?.nodes ?? []) p.nodes.set(node.id, node);
      for (const s of data.cpuProfile?.samples ?? []) p.samples.push(s); for (const d of data.timeDeltas ?? []) p.deltas.push(d);
    }
  }
  const candidates = [...profiles.values()].filter(p => p.pid === rendererPid && threads.get(`${p.pid}:${p.tid}`) === 'CrRendererMain');
  const profile = candidates.sort((a, b) => b.samples.length - a.samples.length)[0];
  const self = new Map<string, number>(), inclusive = new Map<string, number>(), buckets = new Map<string, number>();
  let sampledMs = 0, idleMs = 0;
  if (profile) {
    let t = profile.start;
    const key = (n: ProfileNode) => `${n.callFrame.functionName || '(anonymous)'} ${(n.callFrame.url ?? '').split('/').pop()}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`;
    for (let i = 0; i < profile.samples.length; i++) {
      t += profile.deltas[i] ?? 0; const weight = (profile.deltas[i + 1] ?? 0) / 1000;
      if (t < t0 || t > t1) continue;
      const leaf = profile.nodes.get(profile.samples[i]!); if (!leaf) continue;
      const name = leaf.callFrame.functionName ?? '';
      if (name === '(idle)' || name === '(program)') { idleMs += name === '(idle)' ? weight : 0; if (name === '(idle)') continue; }
      sampledMs += weight;
      self.set(key(leaf), (self.get(key(leaf)) ?? 0) + weight);
      const seen = new Set<string>(), stack: ProfileNode[] = [];
      for (let n: ProfileNode | undefined = leaf; n; n = n.parent === undefined ? undefined : profile.nodes.get(n.parent)) { stack.push(n); const k = key(n); if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) ?? 0) + weight); } }
      const bucket = classify(stack, target); buckets.set(bucket, (buckets.get(bucket) ?? 0) + weight);
    }
  }
  // GPU process: complete slices by name between t0 and t1 (Dawn pipeline and shader work lands here).
  const gpuPid = [...processes.entries()].find(([, name]) => name === 'GPU Process')?.[0];
  const gpuSlices = new Map<string, { n: number; ms: number }>();
  for (const e of events) if (e.pid === gpuPid && e.ph === 'X' && e.ts >= t0 && e.ts <= t1 && typeof e.dur === 'number') {
    const s = gpuSlices.get(e.name) ?? { n: 0, ms: 0 }; s.n++; s.ms += e.dur / 1000; gpuSlices.set(e.name, s);
  }
  const top = (map: Map<string, number>, n: number) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
  return {
    file: file.replace(/\\/g, '/').replace(workspace.replace(/\\/g, '/') + '/', ''), readyMsFromNavigationStart: Math.round((t1 - t0) / 1000), statusMarks: marks,
    cpu: { sampledBusyMs: Math.round(sampledMs), idleMs: Math.round(idleMs), buckets: top(buckets, 30), topSelf: top(self, 40), topInclusive: top(inclusive, 60) },
    gpuProcess: { slices: [...gpuSlices.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 30).map(([k, v]) => [k, v.n, Math.round(v.ms)]) },
  };
}
/** Attribution by the nearest recognisable frame, leaf upwards. Names come from three 0.186, React 19 and the two scenes. */
function classify(stack: ProfileNode[], target: Target): string {
  for (const n of stack) {
    const f = n.callFrame.functionName ?? '', file = n.callFrame.url ?? '';
    if (f === '(garbage collector)') return 'garbage collection';
    if (/^(compileShader|linkProgram|getProgramParameter|getShaderParameter)$/.test(f)) return 'WebGL program compile and link (driver)';
    if (/^(createRenderPipeline|createRenderPipelineAsync|createShaderModule)$/.test(f)) return 'render pipeline creation (WebGPU: returns at once and the GPU process compiles; WebGL2: waits for the program compile and link)';
    if (/^(texImage2D|texSubImage2D|texStorage2D|copyExternalImageToTexture|writeTexture|generateMipmap)$/.test(f)) return 'texture upload calls';
    if (/NodeBuilder|^(build|buildCode|buildStage|flowNode|flowStagesNode|getCodeFromNode|setup|analyze|generate|getNodeProperties|getFlowData|flowChildNode|getUniformFromNode|getVarFromNode|getAttributeFromNode)$/.test(f) && /three|index-/.test(file)) return 'three node build (TSL to WGSL/GLSL)';
    if (/^(parseAsync|parse|loadMesh|loadNode|loadMaterial|loadTexture|loadTextureImage|loadBufferView|loadAccessor|loadGeometries|loadScene|getDependency|_invokeAll|_invokeOne|createImageBitmap|decode|sha256Hex|embeddedImageHashes)$/.test(f)) return 'GLB decode, textures and hashing';
    if (/^(performWorkOnRoot|performWorkUntilDeadline|workLoopSync|workLoopConcurrent|workLoopConcurrentByScheduler|renderRootSync|renderRootConcurrent|commitRoot|commitRootImpl|flushPassiveEffects|commitPassiveMountOnFiber|commitMutationEffectsOnFiber|commitLayoutEffectOnFiber|beginWork|completeWork|updateFunctionComponent|renderWithHooks|reconcileChildren)$/.test(f)) {
      // React work is reported by the component it runs, when there is one below it (already handled leaf-first).
      return 'React render and commit (outside scene code)';
    }
    if (/^(buildFarmWorld|prepareFarmData|buildWoodland|buildGrass|buildTerrain|buildLandscape|buildMeadow|optimizeFarm|buildStream|buildBridge|packWoodland|addPresentation|rebuildBatches|createFarmPlay|createFarmActivity|createHerdMotion|poolTextures|poolIdenticalTextures)$/.test(f)) return `scene build (${f})`;
    if (/^(render|_renderScene|_renderObjects|renderObjects|_renderObjectDirect|renderObject|draw|_createRenderObject|getRenderObject|updateForRender|getForRender|_getRenderObject)$/.test(f) && /three|index-/.test(file)) return 'three render submission (excluding node build)';
    if (/^(init|_initRenderer|requestAdapter|requestDevice)$/.test(f) && /three|index-/.test(file)) return 'renderer init';
  }
  const leaf = stack[0]?.callFrame;
  if (leaf && !leaf.url) return `native or engine (${leaf.functionName || 'anonymous'})`;
  return target === 'pilot' ? 'other script (pilot)' : 'other script (rewrite)';
}

// Offline re-analysis of a saved trace: --analyse <trace.json> --target rewrite|pilot (writes nothing unless --dest is given).
if (argv.includes('--analyse')) {
  const analysis = await analyseTrace(workspacePath(workspace, option('--analyse', '')), option('--target', 'rewrite') as Target);
  const text = JSON.stringify(analysis, null, 2) + '\n';
  if (argv.includes('--dest')) { await mkdir(out, { recursive: true }); await writeFile(resolve(out, option('--name', 'trace-analysis.json')), text); } else console.log(text);
  process.exit(0);
}
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
/** The hub kit's server policy (no-store for both scenes, so neither side is helped by HTTP caching). Binds only on 4400-4499; never probes a listener. */
async function serveNoStore(root: string) {
  const base = await realpath(root);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname), file = resolve(base, '.' + (path.endsWith('/') ? path + 'index.html' : path)), rel = relative(base, file);
      if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(file)).isFile()) throw new Error('not found');
      response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found'); }
  });
  for (let port = 4400; port <= 4499; port++) {
    const bound = await new Promise<boolean>((accept, reject) => {
      const fail = (error: { code?: string }) => { if (error.code === 'EADDRINUSE') accept(false); else reject(error); };
      server.once('error', fail); server.listen(port, '127.0.0.1', () => { server.off('error', fail); accept(true); });
    });
    if (bound) return { url: `http://127.0.0.1:${port}`, port, close: () => new Promise<void>(done => { server.closeAllConnections?.(); server.close(() => done()); }) };
  }
  throw new Error('No free port in 4400-4499');
}

const hosted = new Map<Target, Awaited<ReturnType<typeof serveNoStore>>>();
const results: any[] = [];
await mkdir(out, { recursive: true });
const record = async (browser: Browser, target: Target, backend: Backend, run: number, tracing: boolean) => {
  const { summary, traceFile } = await measure(browser, hosted.get(target)!.url, target, backend, run, tracing);
  results.push(summary); await writeFile(resolve(out, `ready-${cache}-${target}-${backend}-run${run}${tracing ? '-traced' : ''}.json`), JSON.stringify(summary, null, 2) + '\n');
  console.log(`${cache} ${target} ${backend} run ${run}${tracing ? ' (traced)' : ''}: first stable frame ${summary.stableMs} ms (${summary.stable.framesFromReady} frames, ${summary.stable.creationsAfterReady} creations after ready), next-frame ready ${summary.readyMs} ms, declared ${summary.declaredReadyMs} ms, backend ${summary.reportedBackend}, pipelines ${summary.pipelineCallsBeforeReady}/${summary.pipelineCallsAfterReady}, load ${(summary.loadBefore as any)?.cpuTotalPercent}% CPU ${(summary.loadBefore as any)?.gpu3dPercent}% GPU`);
  if (traceFile) await writeFile(resolve(out, `trace-analysis-${cache}-${target}-${backend}.json`), JSON.stringify({ target, backend, run, cache, ...(await analyseTrace(traceFile, target)) }, null, 2) + '\n');
};
try {
  for (const target of targets) hosted.set(target, await serveNoStore(workspacePath(workspace, roots[target])));
  for (const backend of backends) for (const target of targets) {
    const plan = [...(traceOnly ? [] : Array.from({ length: runs }, (_, i) => ({ run: i + 1, tracing: false }))), ...(trace ? [{ run: traceOnly ? 1 : runs + 1, tracing: true }] : [])];
    if (cache === 'cold') {
      // A fresh profile and browser per run, as the hub kit's cold ready step.
      for (const { run, tracing } of plan) {
        const browser = await launchChrome({ workspace, name: `x04-${target}`, windowSize: [WIDTH, HEIGHT] });
        try { await record(browser, target, backend, run, tracing); } finally { await browser.close(); }
      }
    } else {
      // Warm: one browser; one discarded load first, then every run in a new page of the same browser (the hub kit's warm step).
      const browser = await launchChrome({ workspace, name: `x04-warm-${target}`, windowSize: [WIDTH, HEIGHT] });
      try {
        const warmUp = await browser.newPage(); await warmUp.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
        await warmUp.evaluateOnNewDocument(instrument, target);
        await warmUp.goto(url(hosted.get(target)!.url, target, backend), { waitUntil: 'load', timeout: READY_TIMEOUT });
        await warmUp.waitForFunction(() => (window as any).__x04.readyAt !== null || (window as any).__x04.error, { timeout: READY_TIMEOUT, polling: 100 });
        await warmUp.evaluate(() => new Promise(done => setTimeout(done, 3000))); await warmUp.close();
        for (const { run, tracing } of plan) await record(browser, target, backend, run, tracing);
      } finally { await browser.close(); }
    }
  }
} finally { for (const server of hosted.values()) await server.close(); }
const median = (values: number[]) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)]! : null; };
const rows = backends.map(backend => {
  const side = (target: Target) => results.filter(r => r.target === target && r.backend === backend && !r.tracing);
  const p = side('pilot'), n = side('rewrite');
  const m = (list: any[], key: 'stableMs' | 'readyMs' | 'declaredReadyMs') => median(list.map(r => r[key]));
  const ratio = (key: 'stableMs' | 'readyMs' | 'declaredReadyMs') => { const a = m(n, key), b = m(p, key); return a !== null && b ? Math.round(a / b * 1000) / 1000 : null; };
  return { backend, cache, runs: { pilot: p.length, rewrite: n.length },
    stable: { pilotMedianMs: m(p, 'stableMs'), rewriteMedianMs: m(n, 'stableMs'), ratio: ratio('stableMs'), rewriteWorstMs: n.length ? Math.max(...n.map(r => r.stableMs ?? Infinity)) : null, runsWithoutStableFrame: [...p, ...n].filter(r => r.stableMs === null).length },
    nextFrame: { pilotMedianMs: m(p, 'readyMs'), rewriteMedianMs: m(n, 'readyMs'), ratio: ratio('readyMs') },
    declared: { pilotMedianMs: m(p, 'declaredReadyMs'), rewriteMedianMs: m(n, 'declaredReadyMs'), ratio: ratio('declaredReadyMs') },
    loadBefore: results.filter(r => r.backend === backend).map(r => ({ target: r.target, run: r.run, cpu: r.loadBefore?.cpuTotalPercent, gpu3d: r.loadBefore?.gpu3dPercent })) };
});
await writeFile(resolve(out, `summary-${cache}.json`), JSON.stringify({ schema: 'kiln.farm-x04-attempt-summary/1', label, cache, roots, rewriteParams, runs,
  rule: 'Median over runs (the hub kit\'s percentile rule). stable: X-04 since D-23 (owner decision 2026-09-29 22:05), the first stable frame after ready as the hub runner measures it (1.20 limit, WebGL2 worst run 45 s). nextFrame: first animation frame at which readiness is visible (the hub kit\'s X-04 measure); declared: the moment the scene declares readiness (rewrite onReady, pilot ready line and play button). Indicative only on this PC.',
  rows, results: results.map(r => ({ target: r.target, backend: r.backend, run: r.run, tracing: r.tracing, stableMs: r.stableMs, creationsAfterReady: r.stable.creationsAfterReady, readyMs: r.readyMs, declaredReadyMs: r.declaredReadyMs, cpuBefore: r.loadBefore?.cpuTotalPercent, gpuBefore: r.loadBefore?.gpu3dPercent })) }, null, 2) + '\n');
console.log(JSON.stringify(rows.map(({ loadBefore, ...row }) => row)));
