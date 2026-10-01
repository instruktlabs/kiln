// Tablet runs (TASK-M3.md item 5) through the device kit (scripts/device-kit.ts; README in packages/farm/dist/device-kit).
// The owner's Galaxy Tab S9 FE is driven over USB from this PC: the Farm build is served from this PC on a port in 4400-4499
// and reached from the tablet through `adb reverse`; the tablet's Chrome is driven through `adb forward` to its DevTools
// socket. Every result is written straight into evidence/tablet-<date>/ with the device state (battery, temperatures,
// thermal status, brightness, screen and display mode) recorded before and after it. A thermal status other than none
// stops the run. Nothing is installed on the tablet and no device setting changes; pages hold a screen wake lock while open.
//
// Steps (in order; --steps picks a subset):
//   state  adb devices, device state, existing mappings, this PC's load sample.
//   b09    B-09 flows with real touch: CDP Input.dispatchTouchEvent into the device Chrome (no touch emulation), both backends.
//   tier   the tier the classification assigns from the tablet's real adapter strings (WebGPU adapter info and the WebGL2
//          unmasked renderer), on the default backend and on WebGL2; time to ready with this PC's load sample (indicative).
//   soak   the live governor over a soak of at least three minutes on the assigned tier and on forced high (X-10: level
//          changes per minute, reversals, locks), with the frame intervals (the tablet's own, X-07 style); then 60 s of the
//          route and drive workloads on the assigned tier.
//   play   WebGL2 play positions yard, house porch and bridge: the device's own view on its assigned WebGL2 tier with the HUD,
//          and the parity framing (1280 x 720 at DPR 1, tier high, HUD hidden) as PNG.
//   look   frame time per tier for the look options, and economy captures (scripts/run-farm-look.ts --target tablet).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { classifyDevice, type DeviceProbe } from '../packages/scene-kit/src/quality/core';
import { assertOwnedUrl, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { adbDevices, adbFor, connectDevtools, deviceState, forwardDevtools, listMappings, pcLoadSample, removeForward, removeReverse, requireNominal, reversePort, tabletTarget, wakeAndOpenChrome } from './device-kit';
import { runFarmMobile } from './run-farm-mobile';

const TIMEOUT = 180_000;
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); if (at < 0) return fallback; const value = args[at + 1]; if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
const workspace = resolve(import.meta.dir, '..');
const localDate = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const date = option('--date', localDate), root = option('--root', 'packages/farm/dist/m3');
const dest = workspacePath(workspace, option('--dest', `evidence/tablet-${date}`));
const steps = option('--steps', 'state,b09,tier,soak,play,look').split(',').map(s => s.trim()).filter(Boolean);
const soakSeconds = Number(option('--soak-seconds', '210')), workloadSeconds = Number(option('--workload-seconds', '60'));
const b09Backends = option('--b09-backends', 'webgpu,webgl2').split(',') as ('webgpu' | 'webgl2')[];
// A repeated attempt writes beside the first (b09-<backend>-attempt<N>); earlier attempts stay as they are.
const attempt = Number(option('--attempt', '1')); assert(Number.isInteger(attempt) && attempt >= 1, '--attempt is a positive integer');
// --suffix names a later run on a rebuilt output (for example `final`): b09-<backend>-<suffix>, tier/tier-<backend>-<suffix>.json and
// summary-<steps>-<suffix>.json, beside the earlier files.
const suffix = option('--suffix', attempt > 1 ? `attempt${attempt}` : ''); assert(/^[a-z0-9-]*$/.test(suffix), '--suffix uses lowercase letters, numbers and hyphens');
for (const step of steps) assert(['state', 'b09', 'tier', 'soak', 'play', 'look'].includes(step), `Unknown step ${step}`);
assert(soakSeconds >= 180, 'X-10 needs a soak of at least three minutes');
const testRoot = workspacePath(workspace, `${root}/test`), devRoot = workspacePath(workspace, `${root}/dev`);
assert(existsSync(resolve(testRoot, 'index.html')) && existsSync(resolve(devRoot, 'index.html')), `Build the test and dev outputs under ${root} first`);

const adb = adbFor();
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const write = async (path: string, value: unknown) => { const file = resolve(dest, path); await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); return file; };
const round = (v: number | null | undefined, d = 2) => typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
const summary: Record<string, unknown> = { schema: 'kiln.farm-tablet-runs/1', date, started: new Date().toISOString(), root, steps: {} as Record<string, unknown> };
const stepSummary = summary.steps as Record<string, unknown>;

/** One owned server, its adb reverse, the DevTools forward and a connection; everything is released in reverse order. */
async function withTablet<T>(label: string, serveRoot: string, fn: (s: { browser: Browser; base: string; ports: Set<number>; ledger: Record<string, unknown> }) => Promise<T>) {
  const ledger: Record<string, unknown> = { label, mappingsBefore: await listMappings(adb) };
  const before = await requireNominal(adb, `before ${label}`);
  const hosted = await serveOwned(serveRoot); ledger.server = { port: hosted.port, pid: process.pid };
  let reversed = false, forward: { port: number; browserURL: string } | null = null, browser: Browser | null = null;
  const cleanup: string[] = [];
  try {
    await reversePort(adb, hosted.port); reversed = true;
    await wakeAndOpenChrome(adb); forward = await forwardDevtools(adb); ledger.devtoolsForward = forward.port;
    browser = await connectDevtools(forward.browserURL); ledger.browser = await browser.version();
    const result = await fn({ browser, base: `http://127.0.0.1:${hosted.port}`, ports: new Set([hosted.port]), ledger });
    return { before, result, after: await deviceState(adb), ledger };
  } finally {
    if (browser) try { await browser.disconnect(); } catch (error) { cleanup.push('disconnect: ' + String(error)); }
    if (forward) try { await removeForward(adb, forward.port); } catch (error) { cleanup.push('forward: ' + String(error)); }
    if (reversed) try { await removeReverse(adb, hosted.port); } catch (error) { cleanup.push('reverse: ' + String(error)); }
    try { await hosted.close(); } catch (error) { cleanup.push('server: ' + String(error)); }
    ledger.mappingsAfter = await listMappings(adb).catch(error => String(error)); ledger.cleanupErrors = cleanup;
    if (cleanup.length) console.error(`${label}: cleanup problems`, cleanup);
  }
}

interface Opened { page: Page; diagnostics: { kind: string; type?: string; text: string; url?: string }[]; requests: string[]; unowned: string[]; readyObservedMs: number; wakeLock: string }
/** Opens one tab on the tablet (only tabs this run opens are ever touched) and waits for the scene. */
async function openTab(browser: Browser, url: string, ports: Set<number>, o: { measure?: boolean; viewport?: { width: number; height: number } | null; css?: string } = {}): Promise<Opened> {
  const page = await browser.newPage(), diagnostics: Opened['diagnostics'] = [], requests: string[] = [], unowned: string[] = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') diagnostics.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 400), url: m.location().url }); });
  page.on('pageerror', e => diagnostics.push({ kind: 'pageerror', text: String(e).slice(0, 400) }));
  page.on('requestfailed', r => diagnostics.push({ kind: 'requestfailed', text: r.failure()?.errorText ?? '', url: r.url() }));
  // Passive: the page may only fetch from this run's own server (no interception, which would add a round trip per request to time to ready).
  page.on('request', r => { const u = r.url(); if (/^(data|blob):/.test(u)) return; requests.push(u); try { assertOwnedUrl(u, ports); } catch { unowned.push(u); } });
  if (o.measure) await page.evaluateOnNewDocument(() => { (window as any).__kilnMeasureRequested = true; });
  if (o.css) await page.evaluateOnNewDocument(css => {
    const apply = () => { if (!document.head) return false; const style = document.createElement('style'); style.textContent = css; document.head.append(style); return true; };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, o.css);
  if (o.viewport) await page.setViewport({ width: o.viewport.width, height: o.viewport.height, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
  const readyObservedMs = await page.evaluate(() => performance.now());
  const wakeLock = await page.evaluate(async () => { try { (window as any).__wakeLock = await (navigator as any).wakeLock.request('screen'); return 'held'; } catch (error) { return String(error); } });
  return { page, diagnostics, requests, unowned, readyObservedMs, wakeLock };
}
const closeTab = async (opened: Opened | null) => { if (!opened) return; try { await opened.page.evaluate(() => (window as any).__kilnHarness?.unmount()); } catch { /* not mounted */ } await opened.page.close(); };

/** The real adapter strings as the page sees them (the kit's own probe is recorded beside them). */
const readAdapters = (page: Page) => page.evaluate(async () => {
  const out: Record<string, unknown> = {};
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter();
    out.webgpu = adapter ? { info: { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, device: adapter.info?.device, description: adapter.info?.description, isFallbackAdapter: adapter.info?.isFallbackAdapter ?? null },
      features: [...adapter.features].sort() } : (navigator as any).gpu ? 'no adapter' : 'navigator.gpu absent';
  } catch (error) { out.webgpu = `error: ${String(error)}`; }
  try {
    const gl = document.createElement('canvas').getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
    out.webgl2 = gl ? { vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null, unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null } : 'no WebGL2 context';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (error) { out.webgl2 = `error: ${String(error)}`; }
  const uaData = (navigator as any).userAgentData;
  out.navigator = { userAgent: navigator.userAgent, userAgentData: uaData ? await uaData.getHighEntropyValues(['model', 'platformVersion', 'mobile', 'fullVersionList']) : null, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as any).deviceMemory ?? null,
    screen: [screen.width, screen.height], inner: [innerWidth, innerHeight], dpr: devicePixelRatio, coarse: matchMedia('(pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints };
  return out;
});
const sceneState = (page: Page) => page.evaluate(() => {
  const api = (window as any).__kilnScene, t = api.tierState(), events = api.events as { type: string; value: any }[];
  return { tier: t.tier, level: t.level, device: t.device, probe: t.probe, locked: t.locked, live: t.live, backend: events.find(e => e.type === 'backend')?.value ?? null,
    tierEvents: events.filter(e => e.type === 'tier').map(e => e.value), dataBackend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, stats: api.stats() };
});

async function stepState() {
  const record = { at: new Date().toISOString(), adbDevices: (await adbDevices()).devices, device: await deviceState(adb), mappings: await listMappings(adb), pcLoad: await pcLoadSample(workspace) };
  await write(`state/state-${stamp()}.json`, record);
  assert(record.adbDevices.some(d => d.serial === adb.serial && d.state === 'device'), `Tablet ${adb.serial} is not attached in state device`);
  if (!record.device.thermal.nominal) throw new Error(`STOP: tablet thermal status is ${record.device.thermal.name}`);
  return { device: record.device, pcLoad: record.pcLoad };
}

async function stepB09() {
  const results: Record<string, unknown> = {};
  for (const backend of b09Backends) {
    await requireNominal(adb, `before B-09 ${backend}`);
    const pcLoad = await pcLoadSample(workspace);
    await wakeAndOpenChrome(adb); const forward = await forwardDevtools(adb);
    try {
      const out = `evidence/tablet-${date}/b09-${backend}${suffix ? `-${suffix}` : ''}`;
      assert(!existsSync(workspacePath(workspace, out)), `Refusing to overwrite ${out}`);
      const run = await runFarmMobile({ workspace, backend, label: `tablet-${date}`, root: `${root}/test`, out, device: tabletTarget(adb, forward.browserURL) });
      const report = run.report as any;
      results[backend] = { pass: run.pass, out, summary: report.summary, touchPath: 'CDP Input.dispatchTouchEvent into the device Chrome (no emulation)', pcLoadBefore: pcLoad, deviceBefore: report.ledger?.deviceStateBefore, deviceAfter: report.ledger?.deviceStateAfter };
    } finally { await removeForward(adb, forward.port); }
    console.log(`tablet B-09 ${backend}: ${(results[backend] as any).pass ? 'PASS' : 'FAIL'}`);
  }
  return results;
}

async function stepTier() {
  const { farmTiers } = await (async () => { await import('three'); return import('../packages/farm/src/tiers'); })();
  const results: Record<string, unknown> = {};
  for (const backend of ['auto', 'webgl2'] as const) assert(!existsSync(resolve(dest, `tier/tier-${backend}${suffix ? `-${suffix}` : ''}.json`)), `Refusing to overwrite ${`tier/tier-${backend}${suffix ? `-${suffix}` : ''}.json`}`);
  for (const backend of ['auto', 'webgl2'] as const) {
    const pcLoad = await pcLoadSample(workspace);
    const run = await withTablet(`tier ${backend}`, testRoot, async ({ browser, base, ports }) => {
      let opened: Opened | null = null;
      try {
        opened = await openTab(browser, `${base}/${backend === 'webgl2' ? '?backend=webgl2' : ''}`, ports, { measure: true });
        const state = await sceneState(opened.page), adapters = await readAdapters(opened.page);
        const predicted = classifyDevice(state.probe as DeviceProbe, farmTiers);
        const adapterText = JSON.stringify([state.probe?.adapter, adapters.webgpu, adapters.webgl2]).toLowerCase();
        return { url: `/${backend === 'webgl2' ? '?backend=webgl2' : ''}`, state: { ...state, stats: { readyMs: state.stats.readyMs, drawCalls: state.stats.render?.drawCalls, triangles: state.stats.render?.triangles } },
          adapters, predicted, matchesClassification: predicted.tier === state.tier && JSON.stringify(predicted.device) === JSON.stringify(state.device),
          gg008: { xclipse: /xclipse/.test(adapterText), note: 'GG-008: classifyDevice has no Samsung Xclipse pattern; this tablet reports ARM Mali strings, so GG-008 is neither triggered nor resolved here' },
          readyMs: { kit: round(state.stats.readyMs), observedAfterNavigation: round(opened.readyObservedMs), indicative: 'time to ready on the tablet is indicative only while this PC is under load (pcLoadBefore)' },
          wakeLock: opened.wakeLock, diagnostics: opened.diagnostics, unownedRequests: opened.unowned, requests: opened.requests.length };
      } finally { await closeTab(opened); }
    });
    results[backend] = { ...run.result, pcLoadBefore: pcLoad, deviceBefore: run.before, deviceAfter: run.after, ledger: run.ledger };
    await write(`tier/tier-${backend}${suffix ? `-${suffix}` : ''}.json`, results[backend]);
    const r = run.result as any; console.log(`tablet tier ${backend}: ${r.state.tier} (${r.predicted.reasons.join('; ')}), backend ${r.state.dataBackend}, matches classification: ${r.matchesClassification}`);
  }
  return Object.fromEntries(Object.entries(results).map(([k, v]: [string, any]) => [k, { tier: v.state.tier, backend: v.state.dataBackend, adapter: v.state.probe?.adapter, webgpu: v.adapters.webgpu?.info ?? v.adapters.webgpu, webgl2: v.adapters.webgl2, matchesClassification: v.matchesClassification, readyMs: v.readyMs }]));
}

/** Frame statistics in the SPEC 20.3 schema, plus the X-10 governor counts from the page's own onTier events. */
async function soak(browser: Browser, base: string, ports: Set<number>, o: { tier: string | null; workload: string; seconds: number }) {
  let opened: Opened | null = null;
  try {
    const query = o.tier ? `?tier=${o.tier}` : '';
    opened = await openTab(browser, `${base}/${query}`, ports, { measure: true });
    const initial = await sceneState(opened.page);
    await opened.page.evaluate(workload => {
      const w = window as any, api = w.__kilnScene, log: unknown[] = w.__soakLog = [], tasks: number[] = w.__soakLongTasks = [];
      try { new PerformanceObserver(list => { for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration)); }).observe({ type: 'longtask' }); } catch { /* no longtask support */ }
      const start = performance.now(); let last = -1, lastLocked = false;
      w.__soakTimer = setInterval(() => { const t = api.tierState(); if (t.level !== last || t.locked !== lastLocked) { log.push({ t: Math.round(performance.now() - start), level: t.level, locked: t.locked }); last = t.level; lastLocked = t.locked; } }, 250);
      api.beginMeasurement(); api.runWorkload(workload); api.recordFrames(true); w.__soakStart = start;
    }, o.workload);
    const before = Date.now();
    // Progress every 30 s; the page keeps its own timeline.
    for (let elapsed = 0; elapsed < o.seconds; elapsed += 30) {
      await new Promise(done => setTimeout(done, Math.min(30, o.seconds - elapsed) * 1000));
      const s = await opened.page.evaluate(() => { const t = (window as any).__kilnScene.tierState(); return `level ${t.level}${t.locked ? ' locked' : ''}, ${(window as any).__kilnScene.frameTimes().length} frames`; });
      console.log(`  soak ${o.tier ?? 'assigned'} ${o.workload}: ${Math.min(o.seconds, elapsed + 30)} s, ${s}`);
    }
    const wallSeconds = (Date.now() - before) / 1000;
    const result = await opened.page.evaluate(() => {
      const w = window as any, api = w.__kilnScene; api.recordFrames(false); clearInterval(w.__soakTimer);
      const frames: number[] = api.frameTimes(), stats = api.stats(), t = api.tierState(), events = (api.events as { type: string; value: any }[]).filter(e => e.type === 'tier').map(e => e.value);
      return { frames, cpu: api.cpuRenderTimes(), stats: { drawCalls: stats.render?.drawCalls, triangles: stats.render?.triangles, longTasks: stats.longTasks, readyMs: stats.readyMs, cpuRenderMedianMs: stats.cpuRenderMedianMs },
        tier: { tier: t.tier, level: t.level, locked: t.locked, live: t.live }, events, timeline: w.__soakLog, longTaskMs: w.__soakLongTasks, visibility: document.visibilityState };
    });
    const sorted = result.frames.slice().sort((a: number, b: number) => a - b), q = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
    const mean = sorted.length ? sorted.reduce((s: number, v: number) => s + v, 0) / sorted.length : null;
    const live = result.events.filter((e: any) => e.kind === 'live'), directions = live.map((e: any) => e.direction);
    // A reversal is a revert (the benefit rule) or a change of direction between down and up steps; the governor locks after two.
    let reversals = 0, previous: string | null = null;
    for (const d of directions) { if (d === 'revert') reversals++; else { if (previous && d !== previous) reversals++; previous = d; } }
    const minutes = o.seconds / 60, locks = result.tier.locked ? 1 : 0, advice = result.events.filter((e: any) => e.kind === 'advice');
    return {
      tierRequested: o.tier ?? 'assigned by classification', workload: o.workload, seconds: o.seconds, wallSeconds: round(wallSeconds, 1), initial: { tier: initial.tier, level: initial.level, backend: initial.dataBackend, adapter: initial.probe?.adapter },
      frames: sorted.length, medianMs: round(q(.5)), p95Ms: round(q(.95)), p99Ms: round(q(.99)), maxMs: round(q(1)), meanFps: mean ? round(1000 / mean, 1) : null, over33ms: sorted.filter((v: number) => v > 33.4).length,
      over50ms: sorted.filter((v: number) => v > 50).length, over100ms: sorted.filter((v: number) => v > 100).length,
      cpuRenderMedianMs: round(result.stats.cpuRenderMedianMs), drawCalls: result.stats.drawCalls, triangles: result.stats.triangles, longTasks: result.stats.longTasks, longTasksOver100ms: result.longTaskMs.filter((d: number) => d > 100),
      readyMs: round(result.stats.readyMs), governor: { final: result.tier, liveChanges: live.length, changesPerMinute: round(live.length / minutes), reversals, locks, advice, events: result.events, timeline: result.timeline,
        x10: { rule: 'at most 4 changes per minute, at most one lock per session', pass: live.length / minutes <= 4 && locks <= 1 } },
      spec20Tablet: { rule: '30 FPS or better with p95 under 33.3 ms in orbit and in play; no task over 100 ms after ready', fps30: mean ? 1000 / mean >= 30 : null, p95Under33: q(.95) !== null ? q(.95)! < 33.3 : null, noTaskOver100: result.longTaskMs.every((d: number) => d <= 100) },
      visibility: result.visibility, wakeLock: opened.wakeLock, diagnostics: opened.diagnostics, unownedRequests: opened.unowned, frameIntervalsMs: result.frames.map((v: number) => round(v, 3)),
    };
  } finally { await closeTab(opened); }
}
async function stepSoak() {
  const plan = [{ tier: null, workload: 'living-orbit', seconds: soakSeconds }, { tier: 'high', workload: 'living-orbit', seconds: soakSeconds },
    { tier: null, workload: 'living-route', seconds: workloadSeconds }, { tier: null, workload: 'tractor-drive', seconds: workloadSeconds }] as const;
  const results: Record<string, unknown> = {};
  for (const item of plan) {
    const name = `${item.tier ?? 'assigned'}-${item.workload}`, pcLoad = await pcLoadSample(workspace);
    const run = await withTablet(`soak ${name}`, testRoot, ({ browser, base, ports }) => soak(browser, base, ports, item));
    const record = { ...run.result, pcLoadBefore: pcLoad, deviceBefore: run.before, deviceAfter: run.after, ledger: run.ledger,
      note: 'Frame intervals are the tablet\'s own (vsync-bound at its panel rate, see deviceBefore.display) and valid with the device state recorded; readyMs is indicative only (the pack is served from this PC, see pcLoadBefore).' };
    await write(`soak/${name}.json`, record);
    const r = run.result; results[name] = { tier: r.governor.final.tier, backend: r.initial.backend, frames: r.frames, medianMs: r.medianMs, p95Ms: r.p95Ms, meanFps: r.meanFps, governor: { liveChanges: r.governor.liveChanges, changesPerMinute: r.governor.changesPerMinute, reversals: r.governor.reversals, locks: r.governor.locks, finalLevel: r.governor.final.level, x10: r.governor.x10.pass },
      spec20Tablet: r.spec20Tablet, temperaturesC: { before: run.before.thermal.temperaturesC, after: run.after.thermal.temperaturesC }, displayHz: run.before.display.renderFrameRate };
    console.log(`tablet soak ${name}: tier ${r.governor.final.tier} level ${r.governor.final.level}, p50 ${r.medianMs} / p95 ${r.p95Ms} ms, ${r.governor.liveChanges} changes, ${r.governor.reversals} reversals, ${r.governor.locks} locks`);
    if (!run.after.thermal.nominal) throw new Error(`STOP: tablet thermal status is ${run.after.thermal.name} after ${name}`);
  }
  return results;
}

/** capture-farm-parity.ts normalization: the scene fills 1280 x 720 with the HUD hidden. */
const PARITY_CSS = `html,body{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;overflow:hidden!important;display:block!important}
body>header,body>footer,aside{display:none!important}
main,#farm-view,#scene-shell,#farm,.ks-root{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;max-width:none!important;max-height:none!important;min-height:0!important;width:1280px!important;height:720px!important;box-sizing:border-box!important}
main,#farm-view,#scene-shell,#farm{position:absolute!important;left:0!important;top:0!important;display:block!important}
canvas{display:block!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important}
#farm-view>:not(canvas),#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}
canvas,.ks-root{outline:none!important}`;
const DESTINATIONS = { 'play-yard': 'yard', 'play-house': 'house', 'play-bridge': 'bridge' } as const;
async function stepPlay() {
  const results: Record<string, unknown> = {};
  for (const variant of ['device', 'parity'] as const) {
    const pcLoad = await pcLoadSample(workspace);
    const run = await withTablet(`play ${variant}`, testRoot, async ({ browser, base, ports }) => {
      let opened: Opened | null = null; const shots: unknown[] = [];
      try {
        const query = `?backend=webgl2&freeze=1&time=0${variant === 'parity' ? '&tier=high&view=hero' : ''}`;
        opened = await openTab(browser, `${base}/${query}`, ports, variant === 'parity' ? { viewport: { width: 1280, height: 720 }, css: PARITY_CSS } : {});
        const page = opened.page;
        await page.evaluate(() => { const api = (window as any).__kilnScene; api.feedFrameTimes([]); api.setAmbient(false); api.setTimeScale(0); api.setTime(0); });
        await page.evaluate(() => (window as any).__kilnScene.setPlaying(true)); await waitFrames(page, 2);
        for (const [name, destination] of Object.entries(DESTINATIONS)) {
          assert.equal(await page.evaluate(d => (window as any).__kilnScene.teleport(d), destination), true, `Destination ${destination} accepted`);
          await waitFrames(page, 3); await page.evaluate(() => new Promise(done => setTimeout(done, 3000))); await waitFrames(page, 3);
          const state = await page.evaluate(() => { const api = (window as any).__kilnScene, t = api.tierState(), sim = api.simState(), s = api.stats();
            return { backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'), tier: t.tier, level: t.level, player: sim.player, active: sim.active, driving: sim.driving, camera: api.cameraPose?.(),
              drawCalls: s.render?.drawCalls, triangles: s.render?.triangles, canvas: (() => { const c = document.querySelector('canvas')!; return { width: c.width, height: c.height, css: [innerWidth, innerHeight], dpr: devicePixelRatio }; })() }; });
          assert.equal(state.backend, 'webgl2'); assert.equal(state.active, true); assert.equal(state.driving, false);
          const file = `play-webgl2/${variant}/${name}.png`; await mkdir(resolve(dest, `play-webgl2/${variant}`), { recursive: true });
          await page.screenshot({ path: resolve(dest, file) as `${string}.png`, type: 'png', ...(variant === 'parity' ? { clip: { x: 0, y: 0, width: 1280, height: 720 } } : {}) });
          shots.push({ name, destination, file, state });
          console.log(`tablet play ${variant} ${name}: tier ${state.tier}, ${state.drawCalls} draws, canvas ${state.canvas.width}x${state.canvas.height}`);
        }
        return { query, shots, wakeLock: opened.wakeLock, diagnostics: opened.diagnostics, unownedRequests: opened.unowned,
          conditions: variant === 'parity' ? 'Device metrics override 1280 x 720 at DPR 1, tier high, HUD hidden (the parity capture framing); frozen clock at 0, ambient off, governor held' : 'The tablet\'s own viewport and WebGL2 tier (classification), HUD visible; frozen clock at 0, ambient off, governor held' };
      } finally { await closeTab(opened); }
    });
    results[variant] = { ...run.result, pcLoadBefore: pcLoad, deviceBefore: run.before, deviceAfter: run.after, ledger: run.ledger };
    await write(`play-webgl2/${variant}/results.json`, results[variant]);
  }
  return Object.fromEntries(Object.entries(results).map(([k, v]: [string, any]) => [k, v.shots.map((s: any) => ({ name: s.name, file: s.file, tier: s.state.tier }))]));
}

async function stepLook() {
  const out = `evidence/tablet-${date}/look-webgpu`;
  const code = await new Promise<number | null>(done => {
    const child = spawn(process.execPath, [resolve(workspace, 'scripts/run-farm-look.ts'), '--target', 'tablet', '--backend', 'webgpu', '--root', `${root}/dev`, '--dest', out], { cwd: workspace, stdio: 'inherit', windowsHide: true });
    child.once('close', done);
  });
  return { out, exitCode: code };
}

const runners: Record<string, () => Promise<unknown>> = { state: stepState, b09: stepB09, tier: stepTier, soak: stepSoak, play: stepPlay, look: stepLook };
await mkdir(dest, { recursive: true });
let failed = false;
for (const step of steps) {
  try { stepSummary[step] = { status: 'done', result: await runners[step]!() }; }
  catch (error) {
    failed = true; const text = error instanceof Error ? error.stack ?? error.message : String(error);
    stepSummary[step] = { status: /STOP:/.test(text) ? 'stopped' : 'failed', error: text }; console.error(`tablet ${step}:`, text);
    if (/STOP:/.test(text)) break;
  }
  await write(`summary-${steps.join('-')}${suffix ? `-${suffix}` : ''}.json`, { ...summary, updated: new Date().toISOString() });
}
summary.finished = new Date().toISOString(); summary.mappingsAtEnd = await listMappings(adb); summary.deviceAtEnd = await deviceState(adb);
await write(`summary-${steps.join('-')}${suffix ? `-${suffix}` : ''}.json`, summary);
if (failed) process.exitCode = 1;
