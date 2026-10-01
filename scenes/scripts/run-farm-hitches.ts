// M4 item 1 (TASK-M4.md, owner 2026-09-29 20:35): the WebGL2 hitches on the minimal tier. Three revolutions of the
// living orbit (35 s of scene time each) on a Farm test build, per case backend:tier, headless at 1920 x 1080, DPR 1,
// from a fresh browser profile, with the governor live (beginMeasurement), as a person orbiting would run it.
// Indicative only (TASK.md): this PC is shared, so every run records a load sample before and after and settles no
// budget. A plain run records the interval series; a traced run of the same case records a Chrome trace (V8 garbage
// collection, rendering and task categories, ANGLE and Dawn) from 30 s into the first revolution to the end, beside its
// own interval series, and every frame over 50 ms inside the trace is attributed. Raw traces (gzip) and full per-frame
// series stay in .tmp/hitches/<label>/ (git-ignored); summaries go to evidence/m4/hitches/<label>/.
//
// Per frame (between one rAF tick and the next) the page records into preallocated typed arrays: the rAF timestamp, the
// time spent in rAF callbacks (React Three Fiber's loop), the scene time, the kit's event count (tier and quality
// events), and counts, bytes and synchronous time of the WebGL2 and WebGPU entry points (buffer uploads, texture uploads
// and allocations, mipmaps, shader compile and program link, pipelines, draws, render-target allocations, synchronous
// reads). The JS heap is sampled over CDP twice a second (performance.memory does not update in this Chrome); the
// traced run's GC events give the heap before and after every collection, hence the allocation per frame.
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import puppeteer, { type Browser, type CDPSession, type Page } from 'puppeteer-core';

type Backend = 'webgpu' | 'webgl2';
type Tier = 'minimal' | 'economy' | 'balanced' | 'high';
interface Case { backend: Backend; tier: Tier }
const argv = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = argv.indexOf(name); if (at < 0) return fallback; const value = argv[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
const workspace = resolve(import.meta.dir, '..');
const inside = (path: string) => { const full = resolve(workspace, path), rel = relative(workspace, full); if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${path} is outside the workspace`); return full; };
const label = option('--label', 'before');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('--label uses lowercase letters, numbers and hyphens');
const buildRoot = option('--build', 'packages/farm/dist/m3/test');
const cases: Case[] = option('--cases', 'webgl2:minimal,webgpu:minimal,webgl2:balanced').split(',').map(entry => {
  const [backend, tier] = entry.split(':') as [Backend, Tier];
  if (!['webgpu', 'webgl2'].includes(backend) || !['minimal', 'economy', 'balanced', 'high'].includes(tier)) throw new Error(`Bad case ${entry} (backend:tier)`);
  return { backend, tier };
});
const revolutions = Number(option('--revolutions', '3'));
if (!(revolutions > 0)) throw new Error('--revolutions must be positive');
const runs = option('--runs', 'plain,traced').split(',');
for (const r of runs) if (!['plain', 'traced'].includes(r)) throw new Error('--runs lists plain and/or traced');
const counters = !argv.includes('--no-counters'), cpuProfile = argv.includes('--profile'), programs = argv.includes('--programs');
const out = inside(option('--dest', `evidence/m4/hitches/${label}`)), scratch = inside(`.tmp/hitches/${label}`);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WIDTH = 1920, HEIGHT = 1080, REVOLUTION_S = 35, READY_TIMEOUT = 180_000, CAPACITY = 40_000;
/** The trace starts this far into the first revolution, so its own start-up falls outside the revolutions it attributes. */
const TRACE_FROM_S = Math.min(30, revolutions * REVOLUTION_S / 4);
/**
 * Chrome trace categories: tasks on every thread (toplevel), rendering and V8 GC (devtools.timeline with its MinorGC and
 * MajorGC events, v8, disabled-by-default-v8.gc), user timing marks, and the GPU process's shader work (gpu.angle,
 * gpu.dawn). The cc, viz, benchmark and gpu command-buffer categories are left out: at this PC's 144 Hz they produce
 * about 18 MB of trace per second and would overflow the trace buffer within a revolution (measured on the smoke run).
 */
const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'blink.user_timing', 'v8', 'disabled-by-default-v8.gc', 'gpu.angle', 'gpu.dawn',
  ...(cpuProfile ? ['disabled-by-default-v8.cpu_profiler', 'v8.execute'] : [])];
// Per-frame counter layout (the page and the analysis share it).
const COUNTERS = ['gl.bufferData', 'gl.bufferDataBytes', 'gl.bufferSubData', 'gl.bufferSubDataBytes', 'gl.textureAllocation', 'gl.textureUpload', 'gl.generateMipmap',
  'gl.compileShader', 'gl.linkProgram', 'gl.draw', 'gl.renderTargetAllocation', 'gl.syncRead', 'gl.bufferCreateDelete', 'gl.ms',
  'gpu.writeBuffer', 'gpu.writeBufferBytes', 'gpu.textureUpload', 'gpu.pipeline', 'gpu.shaderModule', 'gpu.bindGroup', 'gpu.resourceCreate', 'gpu.submit', 'gpu.ms'] as const;
type Counter = typeof COUNTERS[number];

const loadSample = () => new Promise<Record<string, unknown>>(done => execFile('pwsh', ['-NoProfile', '-File', resolve(workspace, 'scripts/load-sample.ps1')], { timeout: 30_000 }, (error, stdout) => {
  if (error) return done({ error: String(error) }); try { done(JSON.parse(stdout.trim())); } catch { done({ error: 'unparsed', stdout }); }
}));

/** Installed before any page script. Records into preallocated typed arrays; wrappers keep the caller's argument count. */
function instrument(o: { counters: boolean; programs: boolean; capacity: number; keys: readonly string[]; revolutionS: number }) {
  'use strict';
  const w = window as any, now = () => performance.now(), N = o.capacity, K = o.keys.length, key = (name: string) => o.keys.indexOf(name);
  const h: any = w.__hitch = {
    cur: -1, n: 0, recording: false, done: false, overflow: false, t0: 0, stopAt: Infinity, nextRevolution: 1, revolutionFrames: [] as number[],
    ts: new Float64Array(N), js: new Float64Array(N), scene: new Float64Array(N), events: new Float64Array(N), c: new Float64Array(N * K),
    longTasks: [] as number[][], tierChanges: [] as unknown[], syncMark: null as null | number,
  };
  const wrap = (proto: any, names: string[], counter: string, timer: string, bytes: null | ((a: any, b: any, c: any, d: any, e: any) => number)) => {
    const k = key(counter), kb = bytes ? key(counter + 'Bytes') : -1, kt = key(timer);
    for (const name of names) {
      const original = proto?.[name]; if (typeof original !== 'function') continue;
      proto[name] = function (this: unknown, a: any, b: any, c: any, d: any, e: any) {
        if (!h.recording) return original.apply(this, arguments);
        const s = now();
        try { return original.apply(this, arguments); }
        finally {
          const row = h.cur * K; h.c[row + k] += 1; h.c[row + kt] += now() - s;
          if (kb >= 0) h.c[row + kb] += bytes!(a, b, c, d, e);
        }
      };
    }
  };
  const viewBytes = (data: any, offset: any, length: any) => {
    if (typeof data === 'number') return data;
    if (!data || typeof data.byteLength !== 'number') return 0;
    const per = data.BYTES_PER_ELEMENT ?? 1;
    return typeof length === 'number' && length > 0 ? length * per : data.byteLength - (typeof offset === 'number' ? offset * per : 0);
  };
  if (o.counters) {
    const gl = w.WebGL2RenderingContext?.prototype;
    if (gl) {
      wrap(gl, ['bufferData'], 'gl.bufferData', 'gl.ms', (_t, data, _u, offset, length) => viewBytes(data, offset, length));
      wrap(gl, ['bufferSubData'], 'gl.bufferSubData', 'gl.ms', (_t, _o, data, offset, length) => viewBytes(data, offset, length));
      wrap(gl, ['texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D'], 'gl.textureAllocation', 'gl.ms', null);
      wrap(gl, ['texSubImage2D', 'texSubImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D', 'copyTexSubImage2D'], 'gl.textureUpload', 'gl.ms', null);
      wrap(gl, ['generateMipmap'], 'gl.generateMipmap', 'gl.ms', null);
      wrap(gl, ['compileShader'], 'gl.compileShader', 'gl.ms', null);
      wrap(gl, ['linkProgram'], 'gl.linkProgram', 'gl.ms', null);
      wrap(gl, ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'], 'gl.draw', 'gl.ms', null);
      wrap(gl, ['createFramebuffer', 'renderbufferStorage', 'renderbufferStorageMultisample'], 'gl.renderTargetAllocation', 'gl.ms', null);
      wrap(gl, ['getError', 'readPixels', 'getBufferSubData', 'clientWaitSync', 'getQueryParameter', 'getProgramParameter', 'getShaderParameter', 'getParameter', 'finish'], 'gl.syncRead', 'gl.ms', null);
      wrap(gl, ['createBuffer', 'deleteBuffer'], 'gl.bufferCreateDelete', 'gl.ms', null);
    }
    const queue = w.GPUQueue?.prototype, device = w.GPUDevice?.prototype;
    if (queue) {
      wrap(queue, ['writeBuffer'], 'gpu.writeBuffer', 'gpu.ms', (_b, _o, data, offset, size) => viewBytes(data, offset, size));
      wrap(queue, ['writeTexture', 'copyExternalImageToTexture'], 'gpu.textureUpload', 'gpu.ms', null);
      wrap(queue, ['submit'], 'gpu.submit', 'gpu.ms', null);
    }
    if (device) {
      wrap(device, ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync'], 'gpu.pipeline', 'gpu.ms', null);
      wrap(device, ['createShaderModule'], 'gpu.shaderModule', 'gpu.ms', null);
      wrap(device, ['createBindGroup'], 'gpu.bindGroup', 'gpu.ms', null);
      wrap(device, ['createBuffer', 'createTexture', 'createSampler'], 'gpu.resourceCreate', 'gpu.ms', null);
    }
  }
  // --programs (diagnostic): which program or pipeline each creation is. WebGPU pipeline labels carry three's material
  // name and id (renderPipeline_<name>_<id>); WebGL2 links carry hashes and attribute lists of their two shaders.
  if (o.programs) {
    const list: Record<string, unknown>[] = h.programs = [];
    const hash = (text: string) => { let x = 2166136261; for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(16); };
    const at = () => ({ frame: h.recording ? h.cur : -1, scene: h.recording && h.cur >= 0 ? Math.round((h.scene[h.cur] - h.t0) * 100) / 100 : null });
    const gl = w.WebGL2RenderingContext?.prototype;
    if (gl) {
      const sources = new WeakMap<object, string>(), attached = new WeakMap<object, object[]>();
      const shaderSource = gl.shaderSource, attachShader = gl.attachShader, linkProgram = gl.linkProgram;
      gl.shaderSource = function (this: unknown, shader: object, source: string) { sources.set(shader, source); return shaderSource.apply(this, arguments as never); };
      gl.attachShader = function (this: unknown, program: object, shader: object) { (attached.get(program) ?? attached.set(program, []).get(program)!).push(shader); return attachShader.apply(this, arguments as never); };
      gl.linkProgram = function (this: unknown, program: object) {
        const texts = (attached.get(program) ?? []).map(shader => sources.get(shader) ?? ''), vs = texts.find(t => t.includes('gl_Position')) ?? '', fs = texts.find(t => !t.includes('gl_Position')) ?? '';
        list.push({ ...at(), vs: hash(vs), fs: hash(fs), vsLength: vs.length, fsLength: fs.length, attributes: [...vs.matchAll(/\bin\s+\w+\s+(\w+)\s*;/g)].map(m => m[1]), samplers: (fs.match(/\bsampler\w*\s+\w+/g) ?? []).length, ...(h.recording ? { vsSource: vs, fsSource: fs } : {}) });
        return linkProgram.apply(this, arguments as never);
      };
    }
    const device = w.GPUDevice?.prototype;
    if (device) for (const name of ['createRenderPipeline', 'createRenderPipelineAsync']) {
      const original = device[name]; if (typeof original !== 'function') continue;
      device[name] = function (this: unknown, descriptor: { label?: string }) { list.push({ ...at(), call: name, label: String(descriptor?.label ?? '') }); return original.apply(this, arguments as never); };
    }
  }
  // rAF callbacks are timed through one cached wrapper per callback (React Three Fiber passes the same loop function every frame).
  const raf = w.requestAnimationFrame.bind(w), wrappers = new Map<Function, FrameRequestCallback>();
  w.requestAnimationFrame = function (callback: FrameRequestCallback) {
    let wrapped = wrappers.get(callback);
    if (!wrapped) {
      wrapped = function (t: number) { if (!h.recording) return callback(t); const s = now(), row = h.cur; try { return callback(t); } finally { h.js[row] += now() - s; } };
      if (wrappers.size < 256) wrappers.set(callback, wrapped);
    }
    return raf(wrapped);
  };
  try { new PerformanceObserver(list => { if (h.recording || h.done) for (const e of list.getEntries()) h.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask' }); } catch { /* unsupported */ }
  h.begin = (stopAtS: number) => {
    const api = w.__kilnScene; h.t0 = api.motionPolicy().time; h.stopAt = stopAtS; h.cur = -1; h.recording = true;
    h.syncMark = performance.mark('hitches:start').startTime;
  };
  h.elapsed = () => h.cur >= 0 ? h.scene[h.cur] - h.t0 : 0;
  const tick = (t: number) => {
    raf(tick);
    if (!h.recording) return;
    const i = h.cur + 1;
    if (i >= N) { h.recording = false; h.overflow = true; h.done = true; h.n = N; return; }
    h.cur = i; h.ts[i] = t;
    const api = w.__kilnScene, scene = api.motionPolicy().time, events = api.events.length;
    h.scene[i] = scene; h.events[i] = events;
    if (i > 0 && events !== h.events[i - 1]) h.tierChanges.push({ frame: i, events: api.events.slice(h.events[i - 1]), state: api.tierState() });
    const elapsed = scene - h.t0;
    if (elapsed >= h.nextRevolution * o.revolutionS) { h.revolutionFrames.push(i); performance.mark(`hitches:revolution${h.nextRevolution}`); h.nextRevolution++; }
    if (elapsed >= h.stopAt) { h.recording = false; h.done = true; h.n = i + 1; performance.mark('hitches:end'); }
  };
  raf(tick);
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
/** No-store static server bound on the first free port in 4400-4499 (try-bind; never probes a listener). */
async function serveOwned(root: string) {
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

const round = (value: number, places = 1) => { const f = 10 ** places; return Math.round(value * f) / f; };
const percentile = (values: readonly number[], q: number) => { const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]! : null; };

interface FrameSeries { n: number; ts: number[]; js: number[]; scene: number[]; events: number[]; c: number[]; revolutionFrames: number[]; longTasks: number[][]; tierChanges: unknown[]; syncMark: number; overflow: boolean; t0: number; programs?: Record<string, unknown>[] | null }
/** [ms since the recorder started (page clock, approximately), used heap bytes] from Runtime.getHeapUsage. */
type HeapSamples = [number, number][];
const counterOf = (series: FrameSeries, i: number, name: Counter) => series.c[i * COUNTERS.length + COUNTERS.indexOf(name)]!;
/** Interval i is ts[i + 1] - ts[i]: frame i's work (row i of the counters) and whatever delayed frame i + 1. */
function summarise(series: FrameSeries, heap: HeapSamples) {
  const intervals = series.ts.slice(1, series.n).map((t, i) => t - series.ts[i]!);
  const revolutionOf = (i: number) => Math.min(Math.floor((series.scene[i]! - series.t0) / REVOLUTION_S) + 1, Math.ceil(revolutions));
  const perRevolution = new Map<number, number[]>();
  intervals.forEach((_, i) => { const r = revolutionOf(i); (perRevolution.get(r) ?? perRevolution.set(r, []).get(r)!).push(i); });
  const revolutionsOut = [...perRevolution.entries()].sort((a, b) => a[0] - b[0]).map(([revolution, frames]) => {
    const d = frames.map(i => intervals[i]!), js = frames.map(i => series.js[i]!);
    const sum = (name: Counter) => frames.reduce((s, i) => s + counterOf(series, i, name), 0);
    // Heap samples inside this revolution (by page time since the recorder started): growth between samples is allocation, drops are collections.
    const from = series.ts[frames[0]!]! - series.ts[0]!, to = series.ts[frames.at(-1)! + 1]! - series.ts[0]!, within = heap.filter(([t]) => t >= from && t <= to);
    const deltas = within.slice(1).map(([, v], k) => v - within[k]![1]), seconds = within.length > 1 ? (within.at(-1)![0] - within[0]![0]) / 1000 : 0;
    const allocatedBytes = deltas.filter(g => g > 0).reduce((s, g) => s + g, 0), fps = frames.length / ((to - from) / 1000);
    return { revolution, frames: frames.length, framesOver50Ms: d.filter(v => v > 50).length, framesOver100Ms: d.filter(v => v > 100).length, maxMs: round(Math.max(...d)),
      intervalMs: { p50: round(percentile(d, .5)!), p95: round(percentile(d, .95)!), p99: round(percentile(d, .99)!) }, framesPerSecond: round(fps),
      rafCallbackMs: { p50: round(percentile(js, .5)!, 2), p95: round(percentile(js, .95)!, 2), max: round(Math.max(...js), 1) },
      heap: seconds > 0 ? { samples: within.length, allocatedMbPerSecondAtLeast: round(allocatedBytes / seconds / 2 ** 20, 2), allocatedKbPerFrameAtLeast: round(allocatedBytes / seconds / fps / 1024, 1), sampleDrops: deltas.filter(g => g < 0).length, usedMbAtEnd: round(within.at(-1)![1] / 2 ** 20, 1) } : null,
      perFrame: Object.fromEntries(COUNTERS.filter(name => !name.endsWith('.ms')).map(name => [name, round(sum(name) / frames.length, 2)]).filter(([, v]) => v !== 0)),
      glOrGpuCallMsPerFrame: round((sum('gl.ms') + sum('gpu.ms')) / frames.length, 3),
      programOrPipelineCreation: sum('gl.linkProgram') + sum('gpu.pipeline'), textureUploads: sum('gl.textureUpload') + sum('gl.textureAllocation') + sum('gl.generateMipmap') + sum('gpu.textureUpload'), renderTargetAllocations: sum('gl.renderTargetAllocation'),
      sceneTimeLostToStepClampMs: round(d.filter(v => v > 100).reduce((s, v) => s + v - 100, 0), 0) };
  });
  const after = revolutionsOut.filter(r => r.revolution > 1);
  const long = intervals.flatMap((d, i) => d > 50 ? [i] : []).map(i => ({
    frame: i, revolution: revolutionOf(i), atSceneS: round(series.scene[i]! - series.t0, 2), intervalMs: round(intervals[i]!), rafCallbackMs: round(series.js[i]!, 1),
    previousIntervalMs: i > 0 ? round(intervals[i - 1]!) : null, nextIntervalMs: i + 1 < intervals.length ? round(intervals[i + 1]!) : null,
    counters: Object.fromEntries(COUNTERS.map(name => [name, round(counterOf(series, i, name), 2)]).filter(([, v]) => v !== 0)),
    eventsChanged: series.events[i + 1] !== series.events[i] || (i > 0 && series.events[i] !== series.events[i - 1]),
  }));
  return { intervals, revolutions: revolutionsOut, long,
    afterFirstRevolution: { frames: after.reduce((s, r) => s + r.frames, 0), framesOver50Ms: after.reduce((s, r) => s + r.framesOver50Ms, 0), framesOver100Ms: after.reduce((s, r) => s + r.framesOver100Ms, 0), maxMs: after.length ? Math.max(...after.map(r => r.maxMs)) : null } };
}

async function startTrace(session: CDPSession) {
  await session.send('Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'gzip',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: TRACE_CATEGORIES } });
}
async function stopTrace(session: CDPSession, file: string) {
  const complete = new Promise<{ stream?: string; dataLossOccurred?: boolean }>(done => session.once('Tracing.tracingComplete', event => done(event as never)));
  await session.send('Tracing.end');
  const { stream, dataLossOccurred } = await complete;
  if (!stream) throw new Error('Tracing returned no stream');
  const sink = createWriteStream(file); let bytes = 0;
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream, size: 1 << 22 }), data = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
    bytes += data.length; if (!sink.write(data)) await new Promise(done => sink.once('drain', done));
    if (chunk.eof) break;
  }
  await session.send('IO.close', { handle: stream }); await new Promise<void>(done => sink.end(() => done()));
  return { dataLossOccurred: dataLossOccurred ?? null, gzipBytes: bytes };
}

async function measure(browser: Browser, base: string, c: Case, traced: boolean) {
  const page: Page = await browser.newPage(), messages: string[] = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  const name = `${c.backend}-${c.tier}${traced ? '-traced' : ''}`, traceFile = resolve(scratch, `${name}.trace.json.gz`);
  let heapTimer: ReturnType<typeof setInterval> | undefined;
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(instrument, { counters, programs, capacity: CAPACITY, keys: COUNTERS, revolutionS: REVOLUTION_S });
    const url = `${base}/?tier=${c.tier}${c.backend === 'webgl2' ? '&backend=webgl2' : ''}`;
    await page.goto(url, { waitUntil: 'load', timeout: READY_TIMEOUT });
    await page.waitForFunction(() => { const s = (window as any).__kilnHarness?.snapshot(); return s && (s.readyCount > 0 || s.errors.length > 0); }, { timeout: READY_TIMEOUT, polling: 250 });
    const setup = await page.evaluate(() => {
      const api = (window as any).__kilnScene, s = (window as any).__kilnHarness.snapshot(), canvas = document.querySelector('canvas');
      return { errors: s.errors, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, tier: api.tierState(), stats: api.stats(), canvas: canvas ? [canvas.width, canvas.height] : null };
    });
    if (setup.errors.length) throw new Error(`Scene failed: ${JSON.stringify(setup.errors[0])}`);
    if (setup.backend !== c.backend) throw new Error(`Scene runs ${setup.backend}, not ${c.backend}`);
    if (setup.tier?.tier !== c.tier) throw new Error(`Scene tier is ${setup.tier?.tier}, not ${c.tier}`);
    const session = await page.createCDPSession();
    await session.send('Performance.enable');
    const heapBefore = await session.send('Runtime.getHeapUsage'), metricsBefore = await session.send('Performance.getMetrics');
    // The governor is live (as for a person orbiting); the workload starts on the next frame and the recorder with it.
    await page.evaluate(stopAt => { const api = (window as any).__kilnScene; api.beginMeasurement(); api.runWorkload('living-orbit'); (window as any).__hitch.begin(stopAt); }, revolutions * REVOLUTION_S);
    const started = performance.now(), heap: HeapSamples = [];
    heapTimer = setInterval(() => { const at = performance.now() - started; session.send('Runtime.getHeapUsage').then(u => heap.push([round(at, 0), u.usedSize])).catch(() => undefined); }, 500);
    let trace: { dataLossOccurred: boolean | null; gzipBytes: number; fromSceneS: number } | null = null;
    if (traced) {
      await page.waitForFunction(from => (window as any).__hitch.elapsed() >= from || (window as any).__hitch.done, { timeout: READY_TIMEOUT, polling: 200 }, TRACE_FROM_S);
      await startTrace(session);
      trace = { dataLossOccurred: null, gzipBytes: 0, fromSceneS: round(await page.evaluate(() => (window as any).__hitch.elapsed()), 2) };
    }
    await page.waitForFunction(() => (window as any).__hitch.done, { timeout: (revolutions * REVOLUTION_S + 240) * 1000, polling: 2000 });
    clearInterval(heapTimer); heapTimer = undefined;
    if (trace) Object.assign(trace, await stopTrace(session, traceFile));
    const heapAfter = await session.send('Runtime.getHeapUsage'), metricsAfter = await session.send('Performance.getMetrics');
    const series: FrameSeries = await page.evaluate(() => {
      const h = (window as any).__hitch, n = h.n, K = h.c.length / h.ts.length;
      return { n, ts: Array.from(h.ts.subarray(0, n)), js: Array.from(h.js.subarray(0, n)), scene: Array.from(h.scene.subarray(0, n)), events: Array.from(h.events.subarray(0, n)),
        c: Array.from(h.c.subarray(0, n * K)), revolutionFrames: h.revolutionFrames, longTasks: h.longTasks, tierChanges: h.tierChanges, syncMark: h.syncMark, overflow: h.overflow, t0: h.t0, programs: h.programs ?? null };
    });
    const end = await page.evaluate(() => { const api = (window as any).__kilnScene; api.recordFrames(false); return { tier: api.tierState(), stats: api.stats(), events: api.events.slice(-20) }; });
    await session.detach();
    const metric = (list: { name: string; value: number }[], key: string) => list.find(m => m.name === key)?.value ?? null;
    const delta = (key: string) => { const a = metric(metricsBefore.metrics, key), b = metric(metricsAfter.metrics, key); return a === null || b === null ? null : round((b - a) * (key.endsWith('Duration') ? 1000 : 1), 1); };
    return { name, series, heap, trace, traceFile: traced ? traceFile : null, page: { url, setup, end, messages, heapBefore, heapAfter,
      cdpMetricsDelta: { taskMs: delta('TaskDuration'), scriptMs: delta('ScriptDuration'), layoutMs: delta('LayoutDuration'), recalcStyleMs: delta('RecalcStyleDuration'), jsHeapUsedBytes: delta('JSHeapUsedSize') } } };
  } finally { if (heapTimer) clearInterval(heapTimer); await page.close(); }
}

// ---- Trace analysis. The trace is streamed event by event (gzip JSON; it can be hundreds of megabytes). ----
interface TraceEvent { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any; id?: string }
/** Calls visit for every object directly inside the trace's event array ({"traceEvents": [...]} or a bare array). */
async function forEachTraceEvent(file: string, visit: (event: TraceEvent) => void) {
  const OPEN_OBJECT = 0x7b, CLOSE_OBJECT = 0x7d, OPEN_ARRAY = 0x5b, CLOSE_ARRAY = 0x5d, QUOTE = 0x22, BACKSLASH = 0x5c;
  const stack: number[] = [];
  const atEventLevel = () => (stack.length === 2 && stack[0] === OPEN_OBJECT && stack[1] === OPEN_ARRAY) || (stack.length === 1 && stack[0] === OPEN_ARRAY);
  let inString = false, escaped = false, inEvent = false, pieces: Buffer[] = [];
  const source = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip({ chunkSize: 1 << 20 })) : createReadStream(file, { highWaterMark: 1 << 22 });
  for await (const chunk of source as AsyncIterable<Buffer>) {
    let segment = inEvent ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]!;
      if (inString) { if (escaped) escaped = false; else if (b === BACKSLASH) escaped = true; else if (b === QUOTE) inString = false; continue; }
      if (b === QUOTE) { inString = true; continue; }
      if (b === OPEN_OBJECT || b === OPEN_ARRAY) { if (b === OPEN_OBJECT && !inEvent && atEventLevel()) { inEvent = true; segment = i; pieces = []; } stack.push(b); continue; }
      if (b === CLOSE_OBJECT || b === CLOSE_ARRAY) {
        stack.pop();
        if (inEvent && b === CLOSE_OBJECT && atEventLevel()) {
          const piece = chunk.subarray(segment, i + 1), text = (pieces.length ? Buffer.concat([...pieces, piece]) : piece).toString('utf8');
          try { visit(JSON.parse(text)); } catch { /* a malformed event is skipped */ }
          inEvent = false; segment = -1; pieces = [];
        }
      }
    }
    if (inEvent) pieces.push(Buffer.from(chunk.subarray(segment)));
  }
}

const GC = /^(MinorGC|MajorGC|V8\.GC|BlinkGC|CppGC)/;
/** ANGLE's and Dawn's shader work in the GPU process (compile, link, executables built lazily at draw time, pipelines). */
const GPU_COMPILE = /Executable|Link|link|Compile|compile|HLSL|Shader|Program|Pipeline|DXC|FXC/;
interface Thread { key: string; name: string; starts: number[]; ends: number[]; names: number[]; cats: number[]; maxDur: number }
/** Loads the slices of the renderer (main and compositor threads) and of every GPU-process thread, then attributes each long frame inside the trace. */
async function analyseTrace(file: string, series: FrameSeries, summary: ReturnType<typeof summarise>, c: Case) {
  const threadNames = new Map<string, string>(), processNames = new Map<number, string>(), marks: TraceEvent[] = [];
  await forEachTraceEvent(file, e => {
    if (e.ph === 'M') { if (e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name); else if (e.name === 'process_name') processNames.set(e.pid, e.args?.name); }
    else if (typeof e.name === 'string' && e.name.startsWith('hitches:')) marks.push(e);
  });
  // The start mark precedes the trace; any later mark (revolution or end) is on the same renderer main thread, and its frame is known.
  const anchor = marks.find(m => /^hitches:revolution\d+$/.test(m.name)) ?? marks.find(m => m.name === 'hitches:end');
  if (!anchor) return { error: 'no hitches mark inside the trace' };
  const renderer = anchor.pid, main = `${anchor.pid}:${anchor.tid}`, gpu = [...processNames.entries()].find(([, name]) => name === 'GPU Process')?.[0] ?? null;
  const anchorFrame = anchor.name === 'hitches:end' ? series.n - 1 : series.revolutionFrames[Number(anchor.name.slice('hitches:revolution'.length)) - 1]!;
  // The mark is taken inside the tick of anchorFrame, a fraction of a millisecond after that frame's rAF timestamp.
  const offsetUs = anchor.ts - series.ts[anchorFrame]! * 1000, toTrace = (ms: number) => ms * 1000 + offsetUs;
  const wanted = (pid: number, tid: number) => pid === gpu || (pid === renderer && (`${pid}:${tid}` === main || threadNames.get(`${pid}:${tid}`) === 'Compositor'));
  const strings: string[] = [], index = new Map<string, number>(), intern = (s: string) => { let i = index.get(s); if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); } return i; };
  const threads = new Map<string, Thread>(), open = new Map<string, TraceEvent[]>();
  const thread = (pid: number, tid: number) => { const k = `${pid}:${tid}`; let t = threads.get(k); if (!t) { t = { key: k, name: `${pid === gpu ? 'gpu' : 'renderer'}:${threadNames.get(k) ?? tid}`, starts: [], ends: [], names: [], cats: [], maxDur: 0 }; threads.set(k, t); } return t; };
  const nameOf = (e: TraceEvent) => e.name === 'ThreadControllerImpl::RunTask' && e.args?.src_func ? `RunTask ${String(e.args.src_file ?? '').split('/').pop()}:${e.args.src_func}` : e.name;
  const add = (e: TraceEvent, begin: number, end: number) => { const t = thread(e.pid, e.tid); t.starts.push(begin); t.ends.push(end); t.names.push(intern(nameOf(e))); t.cats.push(intern(e.cat ?? '')); t.maxDur = Math.max(t.maxDur, end - begin); };
  const collections: { ts: number; dur: number; name: string; before: number; after: number }[] = [];
  let firstTs = Infinity, lastTs = -Infinity;
  await forEachTraceEvent(file, e => {
    if (typeof e.ts === 'number' && e.ph !== 'M') { if (e.ts < firstTs) firstTs = e.ts; if (e.ts > lastTs) lastTs = e.ts; }
    if (!wanted(e.pid, e.tid)) return;
    if (e.ph === 'X' && typeof e.dur === 'number') {
      add(e, e.ts, e.ts + e.dur);
      if ((e.name === 'MinorGC' || e.name === 'MajorGC') && `${e.pid}:${e.tid}` === main) collections.push({ ts: e.ts, dur: e.dur, name: e.name, before: e.args?.usedHeapSizeBefore ?? NaN, after: e.args?.usedHeapSizeAfter ?? NaN });
    }
    else if (e.ph === 'B') { const k = `${e.pid}:${e.tid}`; (open.get(k) ?? open.set(k, []).get(k)!).push(e); }
    else if (e.ph === 'E') { const begin = open.get(`${e.pid}:${e.tid}`)?.pop(); if (begin) add(begin, begin.ts, e.ts); }
  });
  for (const t of threads.values()) {
    const order = t.starts.map((_, i) => i).sort((a, b) => t.starts[a]! - t.starts[b]!);
    t.starts = order.map(i => t.starts[i]!); t.ends = order.map(i => t.ends[i]!); t.names = order.map(i => t.names[i]!); t.cats = order.map(i => t.cats[i]!);
  }
  const mainThread = threads.get(main);
  /** Union of the slices of one thread overlapping [a, b] (optionally filtered), clipped, in ms; also the largest overlaps. */
  const span = (t: Thread | undefined, a: number, b: number, filter?: (name: string, cat: string) => boolean) => {
    if (!t) return { ms: 0, top: [] as [string, number, number][] };
    let lo = 0, hi = t.starts.length; const from = a - t.maxDur;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (t.starts[mid]! < from) lo = mid + 1; else hi = mid; }
    const spans: [number, number][] = [], top: [string, number, number][] = [];
    for (let i = lo; i < t.starts.length && t.starts[i]! < b; i++) {
      const s = Math.max(a, t.starts[i]!), e = Math.min(b, t.ends[i]!); if (e <= s) continue;
      const name = strings[t.names[i]!]!, cat = strings[t.cats[i]!]!; if (filter && !filter(name, cat)) continue;
      spans.push([s, e]); if (e - s >= 2000) top.push([name, round((e - s) / 1000), round((t.ends[i]! - t.starts[i]!) / 1000)]);
    }
    spans.sort((x, y) => x[0] - y[0]); let total = 0, cs = -Infinity, ce = -Infinity;
    for (const [s, e] of spans) { if (s > ce) { if (ce > cs) total += ce - cs; cs = s; ce = e; } else if (e > ce) ce = e; }
    if (ce > cs) total += ce - cs;
    return { ms: round(total / 1000), top: top.sort((x, y) => y[1] - x[1]).slice(0, 8) };
  };
  const gpuThreads = [...threads.values()].filter(t => t.name.startsWith('gpu:'));
  const gpuMain = gpuThreads.find(t => t.name === 'gpu:CrGpuMain'), viz = gpuThreads.find(t => t.name === 'gpu:VizCompositorThread');
  const compositor = [...threads.values()].find(t => t.name === 'renderer:Compositor');
  const facts = (i: number) => {
    const a = toTrace(series.ts[i]!), b = toTrace(series.ts[i + 1]!);
    const mainBusy = span(mainThread, a, b), mainGc = span(mainThread, a, b, name => GC.test(name)), raf = span(mainThread, a, b, name => name === 'FireAnimationFrame');
    const gpuBusy = span(gpuMain, a, b);
    const compile = gpuThreads.map(t => span(t, a, b, (name, cat) => /angle|dawn/.test(cat) && GPU_COMPILE.test(name)));
    return { mainBusyMs: mainBusy.ms, mainTop: mainBusy.top, mainGcMs: mainGc.ms, mainGcSlices: mainGc.top, rafMs: raf.ms,
      gpuMainBusyMs: gpuBusy.ms, gpuMainTop: gpuBusy.top, gpuCompileMs: round(compile.reduce((s, x) => s + x.ms, 0)), gpuCompileTop: compile.flatMap(x => x.top).sort((x, y) => y[1] - x[1]).slice(0, 4),
      vizBusyMs: span(viz, a, b).ms, compositorBusyMs: span(compositor, a, b).ms };
  };
  const levelFrames = (series.tierChanges as { frame: number }[]).map(t => t.frame);
  const attribute = (i: number, d: number, f: ReturnType<typeof facts>): [string, string] => {
    const excess = Math.max(1, d - 1000 / 60), count = (name: Counter) => counterOf(series, i, name);
    if (count('gl.linkProgram') + count('gl.compileShader') + count('gpu.pipeline') + count('gpu.shaderModule') > 0) return ['program or pipeline creation', 'the page created a WebGL program or a WebGPU pipeline or shader module in this frame'];
    if (f.gpuCompileMs >= 5) return [c.backend === 'webgl2' ? 'ANGLE state-change recompile' : 'Dawn pipeline compile', `the GPU process spent ${f.gpuCompileMs} ms in shader work with no program link or pipeline creation from the page`];
    if (count('gl.textureUpload') + count('gl.textureAllocation') + count('gl.generateMipmap') + count('gpu.textureUpload') > 0) return ['texture or mipmap upload', 'texture uploads, allocations or mipmap generation in this frame'];
    if (count('gl.renderTargetAllocation') > 0) return ['render-target reallocation', 'framebuffer or renderbuffer allocation in this frame'];
    if (levelFrames.some(frame => frame === i || frame === i + 1)) return ['governor level change', 'a tier or quality event in this frame'];
    if (f.mainGcMs >= 10 && f.mainGcMs >= .3 * excess) return ['garbage collection', `${f.mainGcMs} ms of main-thread GC pauses in the interval`];
    if (count('gl.ms') >= .3 * d) return ['renderer waiting on the GPU process', `${round(count('gl.ms'))} ms inside WebGL calls`];
    if (series.js[i]! >= .5 * d) return ['main-thread frame work', `rAF callbacks took ${round(series.js[i]!)} ms`];
    if (f.gpuMainBusyMs >= .5 * d) return ['GPU process busy', `GPU main thread busy ${f.gpuMainBusyMs} ms of ${round(d)} ms`];
    if (f.mainBusyMs >= .5 * d) return ['main-thread tasks outside the frame callback', `main thread busy ${f.mainBusyMs} ms, rAF callbacks ${round(series.js[i]!)} ms`];
    return ['no recorded thread busy (frame scheduling or other processes)', `main ${f.mainBusyMs} ms, GPU main ${f.gpuMainBusyMs} ms, viz ${f.vizBusyMs} ms busy of ${round(d)} ms`];
  };
  const covered = (i: number) => toTrace(series.ts[i]!) >= firstTs && toTrace(series.ts[i + 1]!) <= lastTs;
  const long = summary.long.map(entry => {
    if (!covered(entry.frame)) return { ...entry, cause: 'outside the trace', why: 'the frame precedes the trace start', trace: null };
    const f = facts(entry.frame), [cause, why] = attribute(entry.frame, entry.intervalMs, f); return { ...entry, cause, why, trace: f };
  });
  // Reference: the same facts for ordinary frames (every 25th traced frame at or under 20 ms), to show what a normal frame costs.
  const ordinary = summary.intervals.flatMap((d, i) => d <= 20 && i % 25 === 0 && covered(i) ? [i] : []).map(facts);
  const med = (key: 'mainBusyMs' | 'gpuMainBusyMs' | 'vizBusyMs' | 'rafMs' | 'mainGcMs') => percentile(ordinary.map(f => f[key]), .5);
  const tracedFrames = summary.intervals.flatMap((_, i) => covered(i) ? [i] : []);
  // Allocation between collections: the heap after one collection grows to the heap before the next.
  const inTrace = collections.sort((x, y) => x.ts - y.ts), allocated = inTrace.slice(1).reduce((s, g, k) => s + Math.max(0, g.before - inTrace[k]!.after), 0);
  const allocationFrames = inTrace.length > 1 ? tracedFrames.filter(i => { const t = toTrace(series.ts[i]!); return t >= inTrace[0]!.ts && t < inTrace.at(-1)!.ts; }).length : 0;
  const gcStats = (name: string) => { const list = inTrace.filter(g => g.name === name); return { n: list.length, totalMs: round(list.reduce((s, g) => s + g.dur, 0) / 1000), maxMs: round(Math.max(0, ...list.map(g => g.dur)) / 1000), meanFreedMb: list.length ? round(list.reduce((s, g) => s + g.before - g.after, 0) / list.length / 2 ** 20, 1) : null }; };
  const causes = (list: typeof long) => Object.fromEntries([...new Set(list.map(l => l.cause))].map(cause => [cause, { over50: list.filter(l => l.cause === cause).length, over100: list.filter(l => l.cause === cause && l.intervalMs > 100).length }]));
  return { file: relative(workspace, file).replace(/\\/g, '/'), categories: TRACE_CATEGORIES, rendererPid: renderer, gpuPid: gpu, threads: [...threads.values()].map(t => [t.name, t.starts.length]),
    tracedFrames: tracedFrames.length, firstTracedFrame: tracedFrames[0] ?? null,
    gc: { minor: gcStats('MinorGC'), major: gcStats('MajorGC'), allocatedKbPerFrame: allocationFrames ? round(allocated / allocationFrames / 1024, 1) : null, allocatedMb: round(allocated / 2 ** 20, 1), framesBetweenFirstAndLastCollection: allocationFrames },
    ordinaryFrameMedians: { frames: ordinary.length, mainBusyMs: med('mainBusyMs'), rafMs: med('rafMs'), gpuMainBusyMs: med('gpuMainBusyMs'), vizBusyMs: med('vizBusyMs'), mainGcMs: med('mainGcMs') },
    causesAfterFirstRevolution: causes(long.filter(l => l.revolution > 1)), causesFirstRevolution: causes(long.filter(l => l.revolution === 1)), long };
}

async function removeChromeTemp() {
  for (const name of await readdir(scratch).catch(() => [] as string[])) if (/^(chrome_|scoped_dir|\.org\.chromium)/.test(name)) await rm(resolve(scratch, name), { recursive: true, force: true }).catch(() => undefined);
}

// Offline re-analysis of a saved run: --analyse <case name> (reads .tmp/hitches/<label>/<name>.frames.json and .trace.json.gz).
if (argv.includes('--analyse')) {
  const name = option('--analyse', ''), saved = JSON.parse(await readFile(resolve(scratch, `${name}.frames.json`), 'utf8')) as { case: Case; series: FrameSeries; heap: HeapSamples };
  const analysis = await analyseTrace(resolve(scratch, `${name}.trace.json.gz`), saved.series, summarise(saved.series, saved.heap), saved.case);
  await mkdir(out, { recursive: true }); await writeFile(resolve(out, `${name}.trace-analysis.json`), JSON.stringify(analysis, null, 1) + '\n');
  console.log(JSON.stringify({ name, causesAfterFirstRevolution: (analysis as any).causesAfterFirstRevolution, causesFirstRevolution: (analysis as any).causesFirstRevolution, gc: (analysis as any).gc }));
  process.exit(0);
}

await mkdir(out, { recursive: true }); await mkdir(scratch, { recursive: true });
const ledger: Record<string, unknown>[] = [];
const hosted = await serveOwned(inside(buildRoot));
console.log(`serving ${buildRoot} on ${hosted.url}`);
try {
  for (const c of cases) for (const kind of runs) {
    const traced = kind === 'traced', loadBefore = await loadSample(), profile = await mkdtemp(resolve(scratch, 'profile-'));
    let browser: Browser | undefined;
    const entry: Record<string, unknown> = { case: `${c.backend}:${c.tier}`, traced, profile: relative(workspace, profile).replace(/\\/g, '/'), launchedAt: new Date().toISOString() };
    ledger.push(entry);
    try {
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, userDataDir: profile, defaultViewport: null,
        args: ['--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', `--window-size=${WIDTH},${HEIGHT}`],
        env: { ...process.env, TEMP: scratch, TMP: scratch } });
      entry.browserPid = browser.process()?.pid ?? null;
      const result = await measure(browser, hosted.url, c, traced);
      const version = await browser.version();
      await browser.close(); browser = undefined; entry.closedAt = new Date().toISOString();
      const loadAfter = await loadSample();
      const summary = summarise(result.series, result.heap);
      await writeFile(resolve(scratch, `${result.name}.frames.json`), JSON.stringify({ case: c, series: result.series, heap: result.heap }) + '\n');
      const analysis = result.traceFile ? await analyseTrace(result.traceFile, result.series, summary, c) : null;
      const traceSummary = analysis === null ? null : 'error' in analysis ? analysis : (({ long: _long, ...rest }) => ({ ...rest, ...result.trace }))(analysis);
      const record = {
        schema: 'kiln.farm-hitches/1', label, build: buildRoot, case: c, run: kind, url: result.page.url, window: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, headless: true }, browser: version,
        workload: `living-orbit, ${revolutions} revolutions of ${REVOLUTION_S} s scene time, governor live (beginMeasurement), counters ${counters ? 'on' : 'off'}`,
        loadBefore, loadAfter, setup: result.page.setup, end: result.page.end, cdpMetricsDelta: result.page.cdpMetricsDelta, heapBefore: result.page.heapBefore, heapAfter: result.page.heapAfter,
        overflow: result.series.overflow, frames: result.series.n, revolutionFrames: result.series.revolutionFrames, tierChanges: result.series.tierChanges,
        longTasks: { count: result.series.longTasks.length, over100Ms: result.series.longTasks.filter(t => t[1]! > 100).length, largestMs: round(Math.max(0, ...result.series.longTasks.map(t => t[1]!))) },
        revolutions: summary.revolutions, afterFirstRevolution: summary.afterFirstRevolution,
        long: analysis && !('error' in analysis) ? analysis.long : summary.long,
        trace: traceSummary,
        programs: result.series.programs ? { beforeMeasurement: result.series.programs.filter(p => p.frame === -1).length,
          duringMeasurement: result.series.programs.filter(p => p.frame !== -1).map(({ vsSource: _vs, fsSource: _fs, ...p }) => p) } : null,
        messages: result.page.messages,
        intervalsMs: summary.intervals.map(v => round(v)),
        note: 'Indicative only: timing on this shared PC settles no budget (TASK.md). Load samples are taken just before the browser starts and just after it closes. Raw traces and full per-frame series stay in .tmp/hitches.',
      };
      await writeFile(resolve(out, `${result.name}.json`), JSON.stringify(record, null, 1) + '\n');
      const a = summary.afterFirstRevolution;
      console.log(`${result.name}: frames ${result.series.n}, after revolution 1: over 50 ms ${a.framesOver50Ms}, over 100 ms ${a.framesOver100Ms}, max ${a.maxMs} ms; per revolution (over50/over100/max) ${summary.revolutions.map(r => `${r.framesOver50Ms}/${r.framesOver100Ms}/${r.maxMs}`).join(' ')}; load before ${loadBefore.cpuTotalPercent}% CPU ${loadBefore.gpu3dPercent}% GPU, after ${loadAfter.cpuTotalPercent}% / ${loadAfter.gpu3dPercent}%`);
      if (analysis && !('error' in analysis)) console.log(`  trace ${JSON.stringify(result.trace)}; causes after revolution 1: ${JSON.stringify(analysis.causesAfterFirstRevolution)}; GC ${JSON.stringify(analysis.gc)}`);
      else if (analysis) console.log(`  trace analysis: ${JSON.stringify(analysis)}`);
    } finally {
      if (browser) { await browser.close().catch(() => undefined); entry.closedAt = new Date().toISOString(); }
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
      await removeChromeTemp();
    }
  }
} finally {
  await hosted.close();
  await writeFile(resolve(scratch, `ledger-${Date.now()}.json`), JSON.stringify({ server: { port: hosted.port, closed: true }, browsers: ledger }, null, 1) + '\n');
}
