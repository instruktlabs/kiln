// Look exploration runs (TASK-M3.md item 6, PLAN.md 1.1): the Farm dev build's look presets, switched at runtime through
// the `setLook` hook, captured at fixed B-06 views and timed per tier. Nothing here changes a default (D-18 stands).
//
// Targets:
//   pc      this PC: headless Chrome with an explicit --window-size; frame pacing uncapped (--disable-gpu-vsync
//           --disable-frame-rate-limit) so the numbers show cost rather than the 60 Hz timer. INDICATIVE ONLY (TASK.md):
//           every tier block carries a load sample before and after, and nothing settles a budget or a look.
//   tablet  the owner's Galaxy Tab S9 FE through the device kit (adb reverse for this run's server, adb forward to Chrome's
//           DevTools socket, both on 4400-4499). Its frame time is the tablet's own, vsync-bound at the panel rate, valid with
//           the device state recorded before and after every tier block. A thermal status other than none stops the run.
// Frame time: requestAnimationFrame intervals in the page during the `living-orbit` workload, governor held with an empty
// synthetic trace, after each preset's pipeline is built and warmed. Captures: frozen clock at time 0, ambient off, 1280 x 720
// at DPR 1 (the tablet renders through a device-metrics override for comparable framing), JPEG or PNG.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { FARM_LOOK_PRESETS, formatFarmLook, parseFarmLook, resolveFarmLook } from '../packages/farm/src/look/options';
import { closeExtraStartupPages } from './browser-startup';
import { adbFor, connectDevtools, deviceState, forwardDevtools, listMappings, pcLoadSample, removeForward, removeReverse, requireNominal, reversePort, wakeAndOpenChrome } from './device-kit';

export const LOOK_TIERS = ['high', 'balanced', 'economy', 'minimal'] as const;
export const SHEET_VIEWS = ['hero', 'fences', 'house-porch', 'watermill-wheel'] as const;
type Tier = typeof LOOK_TIERS[number];
const TIMEOUT = 120_000, WIDTH = 1280, HEIGHT = 720;

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); if (at < 0) return fallback; const value = args[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
// `none` is an empty list (for example `--frame-tiers none` for a capture-only run).
const list = (value: string) => value === 'none' ? [] : value.split(',').map(entry => entry.trim()).filter(Boolean);
// In the scenes workspace this file is scripts/run-farm-look.ts; in the hub kit it is bundled as runner/look-farm.mjs, so the
// parent folder is the workspace or the kit (Node has no import.meta.dir).
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = option('--target', 'pc') as 'pc' | 'tablet' | 'hub';
const many = (name: string) => args.flatMap((value, at) => args[at - 1] === name ? [value] : []);
// The hub (the laptop) launches its own Chrome: --chrome <path> overrides shared discovery, --chrome-arg <flag> (repeatable) and
// --headless as in runner/perf-farm.mjs; a headed window opens at 0,0. This PC always runs headless (owner rule 11:40).
const chrome = option('--chrome', ''), headless = target !== 'hub' || args.includes('--headless');
const root = option('--root', 'packages/farm/dist/m3/dev'), backend = option('--backend', 'webgpu') as 'webgpu' | 'webgl2';
const presets = option('--presets', 'all') === 'all' ? Object.keys(FARM_LOOK_PRESETS) : list(option('--presets', ''));
const frameTiers = list(option('--frame-tiers', target === 'pc' ? 'high,balanced,economy,minimal' : 'economy,minimal,balanced,high')) as Tier[];
const captureTiers = list(option('--capture-tiers', target === 'pc' ? 'high,economy' : 'economy')) as Tier[];
const views = option('--views', 'sheet') === 'sheet' ? [...SHEET_VIEWS] : option('--views', 'sheet') === 'all' ? null : list(option('--views', ''));
const fullViewTiers = list(option('--all-view-tiers', target === 'pc' ? 'high' : ''));
const warmupMs = Number(option('--warmup-ms', '2500')), sampleMs = Number(option('--sample-ms', target === 'pc' ? '6000' : '8000')), settleMs = Number(option('--settle-ms', '1500'));
const format = option('--format', 'jpeg') as 'jpeg' | 'png';
const dest = workspacePath(workspace, option('--dest', target === 'hub' ? `results/look-${backend}` : `evidence/look/${target}-${backend}`));
for (const preset of presets) assert(preset in FARM_LOOK_PRESETS, `Unknown preset ${preset}`);
for (const tier of [...frameTiers, ...captureTiers]) assert((LOOK_TIERS as readonly string[]).includes(tier), `Unknown tier ${tier}`);
assert(['pc', 'tablet', 'hub'].includes(target) && ['webgpu', 'webgl2'].includes(backend) && ['jpeg', 'png'].includes(format), 'Usage: --target pc|tablet|hub --backend webgpu|webgl2 --format jpeg|png');

const pcLoad = () => pcLoadSample(workspace);
/** The hub's load beside each block (as runner/perf-farm.mjs records it): CPU over one second and nvidia-smi where present. */
async function hubLoad() {
  const sample = () => cpus().reduce((sum, cpu) => { const t = cpu.times; return { idle: sum.idle + t.idle, total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq }; }, { idle: 0, total: 0 });
  const a = sample(); await new Promise(done => setTimeout(done, 1000)); const b = sample();
  const gpu = await new Promise<string | null>(done => execFile('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { timeout: 5000 }, (error, stdout) => done(error ? null : String(stdout).trim())));
  return { at: new Date().toISOString(), cpuTotalPercent: b.total > a.total ? Math.round(1000 * (1 - (b.idle - a.idle) / (b.total - a.total))) / 10 : null, nvidiaSmi: gpu, method: 'os.cpus over 1 s; nvidia-smi utilization.gpu,memory.used where present' };
}
/** The adapter the page reports (the contact sheet names each device by it). */
const adapterOf = (page: Page) => page.evaluate(async () => {
  const gpu = (navigator as any).gpu, adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null, info = adapter?.info;
  const gl = document.createElement('canvas').getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { webgpu: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null,
    webgl2: gl ? { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) } : null,
    userAgent: navigator.userAgent, devicePixelRatio };
});
const stats = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b), q = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]! : null;
  const mean = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : null, r = (v: number | null) => v === null ? null : Math.round(v * 100) / 100;
  return { frames: sorted.length, p50: r(q(.5)), p95: r(q(.95)), p99: r(q(.99)), max: r(q(1)), meanFps: mean ? Math.round(10000 / mean) / 10 : null, over33ms: sorted.filter(v => v > 33.4).length, over50ms: sorted.filter(v => v > 50).length, over100ms: sorted.filter(v => v > 100).length };
};

// Captures use the B-06 framing (scripts/capture-farm-parity.ts): the canvas fills 1280 x 720 and the page shell, HUD, help, credits and
// developer panel are hidden, so every preset is compared on the same full frame as the parity set.
const CAPTURE_CSS = `
html,body{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;overflow:hidden!important;display:block!important}
body>header,body>footer,aside{display:none!important}
main,#farm-view,#scene-shell,#farm,.ks-root{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;max-width:none!important;max-height:none!important;min-height:0!important;width:1280px!important;height:720px!important;box-sizing:border-box!important}
main,#farm-view,#scene-shell,#farm{position:absolute!important;left:0!important;top:0!important;display:block!important}
canvas{display:block!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important}
#farm-view>:not(canvas),#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}
canvas,.ks-root{outline:none!important}
`;
async function openScene(browser: Browser, url: string, viewport: { width: number; height: number; dpr: number } | null, css?: string) {
  const page = await browser.newPage(), messages: string[] = [];
  if (css) await page.evaluateOnNewDocument(text => {
    const apply = () => { if (!document.head) return false; const style = document.createElement('style'); style.id = 'capture-normalization'; style.textContent = text; document.head.append(style); return true; };
    if (!apply()) document.addEventListener('DOMContentLoaded', apply, { once: true });
  }, css);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  if (viewport) await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.dpr });
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
  // A device screen stays on while the page holds a screen wake lock (no device setting is changed).
  if (target === 'tablet') await page.evaluate(async () => { try { (window as any).__wakeLock = await (navigator as any).wakeLock.request('screen'); } catch (error) { (window as any).__wakeLockError = String(error); } });
  await page.waitForFunction(() => ['setLook', 'lookState', 'setView', 'feedFrameTimes', 'tierState', 'runWorkload'].every(name => typeof (window as any).__kilnScene?.[name] === 'function'), { timeout: TIMEOUT });
  await page.evaluate(() => { (window as any).__kilnScene.feedFrameTimes([]); });
  return { page, messages };
}
/** Requests a preset and waits until the tier's effective options are built and have rendered a few frames. */
async function applyLook(page: Page, preset: string, tier: Tier) {
  const requested = formatFarmLook(parseFarmLook(preset)), effective = formatFarmLook(resolveFarmLook(parseFarmLook(preset), tier).look);
  await page.evaluate(name => (window as any).__kilnScene.setLook(name), preset);
  await page.waitForFunction((r, e) => { const s = (window as any).__kilnScene.lookState?.(); return !!s && s.requested === r && s.effective === e && s.active; }, { timeout: TIMEOUT, polling: 100 }, requested, effective);
  // useBuilt sets the new pipeline in an effect after the commit that changed the key; a few frames make sure it is the one rendering.
  await waitFrames(page, 6);
  return page.evaluate(() => (window as any).__kilnScene.lookState());
}
const url = (base: string, tier: Tier, extra: string) => `${base.replace(/[/]+$/, '')}/?tier=${tier}${backend === 'webgl2' ? '&backend=webgl2' : ''}${extra}`;

interface FrameRow { tier: Tier; preset: string; look: unknown; stats: ReturnType<typeof stats>; tierState: unknown }
async function frameBlock(browser: Browser, base: string, tier: Tier, viewport: { width: number; height: number; dpr: number } | null, sideState: () => Promise<unknown>) {
  const before = await sideState();
  const { page, messages } = await openScene(browser, url(base, tier, ''), viewport);
  const rows: FrameRow[] = [];
  try {
    await page.evaluate(() => {
      const w = window as any, rec = w.__lookFrames = { on: false, last: null as number | null, list: [] as number[] };
      const tick = (t: number) => { if (rec.on) { if (rec.last !== null) rec.list.push(t - rec.last); rec.last = t; } else rec.last = null; requestAnimationFrame(tick); };
      requestAnimationFrame(tick); w.__kilnScene.setAmbient(true); w.__kilnScene.runWorkload('living-orbit');
    });
    const canvas = await page.evaluate(() => { const c = document.querySelector('canvas')!; return { width: c.width, height: c.height, css: [innerWidth, innerHeight], dpr: devicePixelRatio }; });
    const adapter = await adapterOf(page);
    for (const preset of presets) {
      const look = await applyLook(page, preset, tier);
      await page.evaluate(ms => new Promise(done => setTimeout(done, ms)), warmupMs);
      await page.evaluate(() => { const rec = (window as any).__lookFrames; rec.list = []; rec.last = null; rec.on = true; });
      await page.evaluate(ms => new Promise(done => setTimeout(done, ms)), sampleMs);
      const intervals: number[] = await page.evaluate(() => { const rec = (window as any).__lookFrames; rec.on = false; return rec.list.slice(); });
      const tierState = await page.evaluate(() => { const s = (window as any).__kilnScene.tierState(); return s ? { tier: s.tier, level: s.level, live: s.live, locked: s.locked } : null; });
      // Every interval is kept in order beside the summary, so hitches are not averaged away (owner, 2026-09-29 20:35).
      rows.push({ tier, preset, look, stats: stats(intervals), tierState, intervalsMs: intervals.filter(Number.isFinite).map(v => Math.round(v * 1000) / 1000) });
      console.log(`${target} ${backend} ${tier} ${preset}: p50 ${rows.at(-1)!.stats.p50} ms, p95 ${rows.at(-1)!.stats.p95} ms, ${rows.at(-1)!.stats.frames} frames`);
    }
    return { tier, canvas, adapter, rows, messages, before, after: await sideState() };
  } finally { await page.close(); }
}

async function captureBlock(browser: Browser, base: string, tier: Tier, viewNames: string[] | null, sideState: () => Promise<unknown>) {
  const before = await sideState();
  const { page, messages } = await openScene(browser, url(base, tier, '&freeze=1&time=0&view=hero'), { width: WIDTH, height: HEIGHT, dpr: 1 }, CAPTURE_CSS);
  const shots: { preset: string; view: string; file: string; look: unknown }[] = [];
  try {
    await page.evaluate(() => { const api = (window as any).__kilnScene; api.setAmbient(false); api.setTimeScale(0); });
    await waitFrames(page, 4);
    const canvas = await page.evaluate(() => { const c = document.querySelector('canvas')!, r = c.getBoundingClientRect(); return { width: c.width, height: c.height, x: r.x, y: r.y, cssWidth: r.width, cssHeight: r.height, dpr: devicePixelRatio }; });
    // The drawing buffer is the tier's own render scale; the device-metrics override on a phone or tablet reports sub-pixel CSS sizes.
    assert([canvas.x, canvas.y, canvas.cssWidth - WIDTH, canvas.cssHeight - HEIGHT].every(v => Math.abs(v) < .5), `Capture canvas is not the full ${WIDTH} x ${HEIGHT} frame: ${JSON.stringify(canvas)}`);
    const all: string[] = await page.evaluate(() => (window as any).__kilnScene.viewNames()), adapter = await adapterOf(page);
    const names = viewNames ?? all;
    for (const name of names) assert(all.includes(name), `Unknown view ${name}`);
    for (const preset of presets) {
      const look = await applyLook(page, preset, tier);
      for (const view of names) {
        await page.evaluate(v => (window as any).__kilnScene.setView(v), view);
        // TRAA converges over frames and SSAA accumulates; the clock is frozen, so a settled frame is stable.
        await waitFrames(page, 24); await page.evaluate(ms => new Promise(done => setTimeout(done, ms)), settleMs); await waitFrames(page, 4);
        const file = `captures/${tier}/${preset}/${view}.${format === 'png' ? 'png' : 'jpg'}`; await mkdir(resolve(dest, `captures/${tier}/${preset}`), { recursive: true });
        await page.screenshot({ path: resolve(dest, file) as `${string}.png`, type: format, ...(format === 'jpeg' ? { quality: 90 } : {}), clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
        shots.push({ preset, view, file, look });
      }
      console.log(`${target} ${backend} ${tier} captures ${preset}: ${names.length} views`);
    }
    return { tier, views: names, framing: 'B-06: full-frame canvas, page shell and HUD hidden', canvas, adapter, shots, messages, before, after: await sideState() };
  } finally { await page.close(); }
}

const report: Record<string, unknown> = { schema: 'kiln.farm-look-runs/1', date: new Date().toISOString(), target, backend, root, presets, frameTiers, captureTiers, sampleMs, warmupMs, settleMs,
  note: target === 'pc' ? 'INDICATIVE ONLY: this PC is shared; each block carries its load sample. Frame pacing uncapped (--disable-gpu-vsync --disable-frame-rate-limit), headless, window 1280 x 720.'
    : target === 'hub' ? `The hub's own frame time, run only when the hub is idle (standing decision 1); each block carries its load sample. Frame pacing uncapped (--disable-gpu-vsync --disable-frame-rate-limit), ${headless ? 'headless' : 'headed at 0,0'}, window 1280 x 720.`
    : 'The tablet\'s own frame time (vsync-bound at its panel rate), valid with the device state recorded before and after each block. Captures use a 1280 x 720 device-metrics override for framing comparable with the PC.' };
await mkdir(dest, { recursive: true });
const save = () => writeFile(resolve(dest, 'runs.json'), JSON.stringify(report, null, 2) + '\n');
let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined;
const adb = target === 'tablet' ? adbFor() : null;
let forward: { port: number; browserURL: string } | null = null, reversed: number | null = null;
const ledger: Record<string, unknown> = {}; report.ledger = ledger;
try {
  hosted = await serveOwned(workspacePath(workspace, root)); ledger.server = { port: hosted.port, pid: process.pid };
  let base = hosted.url;
  if (adb) {
    ledger.mappingsBefore = await listMappings(adb);
    report.deviceStateStart = await requireNominal(adb, 'before the look runs');
    await reversePort(adb, hosted.port); reversed = hosted.port; base = `http://127.0.0.1:${hosted.port}`;
    await wakeAndOpenChrome(adb); forward = await forwardDevtools(adb); ledger.devtoolsForward = forward.port;
    browser = await connectDevtools(forward.browserURL);
  } else {
    browser = await launchChrome({ workspace, name: 'look', executablePath: chrome || undefined, headless, windowSize: [WIDTH, HEIGHT],
      args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', ...(headless ? [] : ['--window-position=0,0']), ...many('--chrome-arg')] });
    ledger.window = { width: WIDTH, height: HEIGHT, headless, position: headless ? null : '0,0' };
    await closeExtraStartupPages(browser);
  }
  report.browser = await browser.version();
  const sideState = adb ? () => requireNominal(adb, 'between look blocks') : target === 'hub' ? hubLoad : pcLoad;
  const frames: unknown[] = []; report.frames = frames;
  for (const tier of frameTiers) { frames.push(await frameBlock(browser, base, tier, adb ? null : { width: WIDTH, height: HEIGHT, dpr: 1 }, sideState)); await save(); }
  const captures: unknown[] = []; report.captures = captures;
  for (const tier of captureTiers) { captures.push(await captureBlock(browser, base, tier, fullViewTiers.includes(tier) ? null : views, sideState)); await save(); }
  report.status = 'complete';
} catch (error) { report.status = 'stopped'; report.error = error instanceof Error ? error.stack ?? error.message : String(error); console.error(report.error); }
finally {
  const cleanup: string[] = [];
  if (adb) {
    try { await browser?.disconnect(); ledger.disconnected = true; } catch (error) { cleanup.push('disconnect: ' + String(error)); }
    if (forward) try { await removeForward(adb, forward.port); ledger.forwardRemoved = true; } catch (error) { cleanup.push('forward: ' + String(error)); }
    if (reversed !== null) try { await removeReverse(adb, reversed); ledger.reverseRemoved = true; } catch (error) { cleanup.push('reverse: ' + String(error)); }
    try { report.deviceStateEnd = await deviceState(adb); ledger.mappingsAfter = await listMappings(adb); } catch (error) { cleanup.push('state: ' + String(error)); }
  } else try { await browser?.close(); ledger.browserClosed = true; } catch (error) { cleanup.push('browser: ' + String(error)); }
  try { await hosted?.close(); ledger.serverClosed = true; } catch (error) { cleanup.push('server: ' + String(error)); }
  ledger.cleanupErrors = cleanup; await save();
  if (report.status !== 'complete' || cleanup.length) process.exitCode = 1;
}
