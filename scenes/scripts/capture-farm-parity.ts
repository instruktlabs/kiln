import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { PNG } from 'pngjs';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { compareLuminanceImages, compareParityImages } from './parity-images';
import { cropImage, type CropRectangle } from './capture-woodland-ab';
import { closeExtraStartupPages } from './browser-startup';
import { readPilotRendererCounts, readPilotShaderClock } from './farm-renderer-counts';
import { compareFarmOptimizationCounts, compareStaticRendererCounts, compareX02Reference, summarizeStaticCountCoverage, validateX02Baseline, X02_BASELINE_PATH, type ColliderCounts, type X02Baseline } from './farm-count-gates';

const TIMEOUT = 120_000, WIDTH = 1280, HEIGHT = 720;
const fallbackWarning = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/;
export type ParityBackend = 'webgpu' | 'webgl2';
interface Diagnostic { kind: string; type?: string; text: string; url?: string }
export interface CapturedFarm { png: { width: number; height: number; data: Uint8Array }; stats: any; diagnostics: Diagnostic[]; file: string }

/**
 * SPEC 19.3 play positions, reached through the destinations (INV A.1) at their table yaws, and the
 * SPEC 19.7 farmhouse interior seen through the front door opened with E from the porch destination.
 * The pilot selects the destination in its own "Start near" menu; the rewrite uses the same
 * `visit` through its test hook after entering play. Neither side places the camera.
 */
export interface PlayFixture { destination: 'yard' | 'house' | 'bridge'; openDoor?: string; purpose: string }
export const PLAY_FIXTURES: Readonly<Record<string, PlayFixture>> = {
  'play-yard': { destination: 'yard', purpose: 'SPEC 19.3 play position: yard' },
  'play-house': { destination: 'house', purpose: 'SPEC 19.3 play position: house porch' },
  'play-bridge': { destination: 'bridge', purpose: 'SPEC 19.3 play position: bridge' },
  'play-house-door': { destination: 'house', openDoor: 'home-0', purpose: 'SPEC 19.7 extra: farmhouse interior through the open front door' },
};
/** SPEC 19.7 stream crop at the mill bank: the watermill-wheel view's lower right, where the stream leaves the wheel along the bank (16 by 9 tiles of 40 by 28 px). */
export const STREAM_CROP: CropRectangle = { x: 640, y: 468, width: 640, height: 252 };
const PILOT_PLAY_ACTIVE = 'Return to asset review';

/** Starts the sealed, unchanged server itself. Binding a busy port never contacts its owner. */
export async function serveSealedPilot(workspace: string, release: 'r33' | 'r34') {
  const root = workspacePath(workspace, `.tmp/pilot-${release}/scene`), log: { port: number; stdout: string; stderr: string; exit?: number | null }[] = [];
  for (let port = 4400; port <= 4499; port++) {
    const entry = { port, stdout: '', stderr: '', exit: undefined as number | null | undefined }; log.push(entry);
    const child = spawn(process.execPath, [resolve(root, 'serve.mjs'), String(port)], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TEMP: workspacePath(workspace, '.tmp'), TMP: workspacePath(workspace, '.tmp') } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const exited = new Promise<number | null>(done => child.once('close', code => { entry.exit = code; done(code); }));
    try {
      await new Promise<void>((accept, reject) => {
        timer = setTimeout(() => reject(new Error('Sealed pilot server readiness exceeded correctness timeout')), TIMEOUT);
        child.once('error', reject); child.once('exit', () => reject(new Error(entry.stderr || 'Sealed pilot server exited before ready')));
        child.stdout!.on('data', bytes => { entry.stdout += String(bytes); if (entry.stdout.includes(`Farm review: http://127.0.0.1:${port}/`)) accept(); });
        child.stderr!.on('data', bytes => { entry.stderr += String(bytes); });
      });
      clearTimeout(timer);
      let closed = false;
      return { url: `http://127.0.0.1:${port}`, port, pid: child.pid, log, get closed() { return closed; }, async close() {
        if (closed) return; if (child.exitCode === null && !child.killed) child.kill(); await exited; closed = true;
      } };
    } catch (error) {
      clearTimeout(timer); if (child.exitCode === null && !child.killed) child.kill(); await exited;
      // The immutable pilot prints error.message only. Bun omits EADDRINUSE in that message.
      const bunBusy = entry.stderr.split(/\r?\n/).some(line => line.trim() === `Failed to start server. Is port ${port} in use?`);
      if (!bunBusy && !/EADDRINUSE|address already in use/i.test(entry.stderr)) throw error;
    }
  }
  throw new Error('No permitted port is available for the sealed pilot');
}

const normalizedCss = `
html,body{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;overflow:hidden!important;display:block!important}
body>header,body>footer,aside{display:none!important}
main,#farm-view,#scene-shell,#farm,.ks-root{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;max-width:none!important;max-height:none!important;min-height:0!important;width:1280px!important;height:720px!important;box-sizing:border-box!important}
main,#farm-view,#scene-shell,#farm{position:absolute!important;left:0!important;top:0!important;display:block!important}
canvas{display:block!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important}
#farm-view>:not(canvas),#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}
canvas,.ks-root{outline:none!important}
`;
async function configurePage(page: Page, ports: ReadonlySet<number>, diagnostics: Diagnostic[]) {
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(css => {
    const apply = () => {
      if (!document.head) return false;
      const style = document.createElement('style'); style.id = 'parity-normalization'; style.textContent = css; document.head.append(style);
      const favicon = document.createElement('link'); favicon.rel = 'icon'; favicon.href = 'data:,'; document.head.append(favicon); return true;
    };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, normalizedCss);
  page.on('console', message => diagnostics.push({ kind: 'console', type: message.type(), text: message.text(), url: message.location().url }));
  page.on('pageerror', error => diagnostics.push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', request => diagnostics.push({ kind: 'requestfailed', text: request.failure()?.errorText ?? '', url: request.url() }));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (/^(data|blob):/.test(url)) { void request.continue(); return; }
    try { assertOwnedUrl(url, ports); void request.continue(); }
    catch (error) { diagnostics.push({ kind: 'unowned-request-blocked', text: String(error), url }); void request.abort('blockedbyclient'); }
  });
}
function badDiagnostics(messages: Diagnostic[]) { return messages.filter(m => m.kind !== 'console' || m.type === 'error' || (m.type === 'warn' && !fallbackWarning.test(m.text))); }
async function pauseForCapture(page: Page) {
  // SPEC 19's fixed settling delay; never measured, exported or compared as performance.
  await page.evaluate(() => new Promise<void>(done => setTimeout(done, 3000)));
}
async function screenshot(page: Page, file: string) {
  const size = await page.evaluate(() => { const c = document.querySelector('canvas')!, r = c.getBoundingClientRect(); return { width: c.width, height: c.height, x: r.x, y: r.y, cssWidth: r.width, cssHeight: r.height, dpr: devicePixelRatio }; });
  assert.deepEqual(size, { width: WIDTH, height: HEIGHT, x: 0, y: 0, cssWidth: WIDTH, cssHeight: HEIGHT, dpr: 1 }, 'Both drawing buffer and CSS viewport must be exactly 1280×720, DPR1');
  const bytes = await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }, captureBeyondViewport: false });
  return PNG.sync.read(Buffer.from(bytes));
}
async function pilotStats(page: Page, backend: ParityBackend, ownedPorts: ReadonlySet<number>) {
  const result = await page.evaluate(() => ({ renderer: document.querySelector('#renderer')?.textContent ?? '', counts: document.querySelector('#stats')?.textContent ?? '', ready: document.querySelector('#load')?.textContent ?? '', quality: (document.querySelector('#view-quality') as HTMLSelectElement)?.value, herdEnabled: (document.querySelector('#farm-life') as HTMLInputElement)?.checked }));
  assert.equal(result.quality, 'high'); assert.equal(result.herdEnabled, false);
  assert(result.renderer.startsWith(backend === 'webgpu' ? 'WebGPU ·' : 'WebGL2 fallback ·'), 'Pilot backend matches requested backend');
  const numbers = result.counts.match(/([\d,]+) total draws · ([\d,]+) visible triangles · ([\d,]+) geometries · ([\d,]+) textures/);
  const pool = result.renderer.match(/Asset textures (\d+) → (\d+) shared compatible resources/), rendererCounts = await readPilotRendererCounts(page, ownedPorts);
  assert.equal(rendererCounts.backend, backend);
  return { ...result, drawCalls: rendererCounts.render.drawCalls, triangles: rendererCounts.render.triangles,
    geometries: rendererCounts.memory.geometries, textures: rendererCounts.memory.textures, pipelines: rendererCounts.pipelines, programs: rendererCounts.memory.programs,
    dom: { drawCalls: numbers ? Number(numbers[1]!.replaceAll(',', '')) : null, mainTriangles: numbers ? Number(numbers[2]!.replaceAll(',', '')) : null,
      geometries: numbers ? Number(numbers[3]!.replaceAll(',', '')) : null, textures: numbers ? Number(numbers[4]!.replaceAll(',', '')) : null },
    assetTexturePool: pool ? { uniqueBefore: Number(pool[1]), uniqueAfter: Number(pool[2]) } : null,
    rendererCounts, countSource: 'Read-only CDP renderer.info totals including shadows; actual pipeline cache; DOM main triangles labeled separately', timing: 'not collected' };
}
/** Rewrite: enter play through the kit, then the destination hook (the pilot's `visit`); E opens the door as a player would. */
async function enterRewritePlay(page: Page, fixture: PlayFixture) {
  await page.evaluate(() => (window as any).__kilnScene.setPlaying(true)); await waitFrames(page, 2);
  assert.equal(await page.evaluate(name => (window as any).__kilnScene.teleport(name), fixture.destination), true, 'Destination accepted');
  await waitFrames(page, 3);
  if (!fixture.openDoor) return null;
  assert.equal(await page.evaluate(() => (window as any).__kilnScene.simState().nearest), fixture.openDoor, 'The destination faces the door it opens');
  await page.focus('.ks-root'); await page.keyboard.press('KeyE');
  await page.waitForFunction(id => { const door = (window as any).__kilnScene.simState().doors.find((entry: any) => entry.id === id); return door?.target === 1 && Math.abs(door.amount - 1) < 1e-3; }, { timeout: TIMEOUT, polling: 'raf' }, fixture.openDoor);
  return page.evaluate(id => (window as any).__kilnScene.simState().doors.find((entry: any) => entry.id === id), fixture.openDoor);
}
/** Pilot: its own destination menu (`#visit` change starts play and resets the camera), then E on the canvas. */
async function enterPilotPlay(page: Page, fixture: PlayFixture) {
  await page.select('#visit', fixture.destination);
  await page.waitForFunction(text => document.querySelector('#play-farm')?.textContent === text, { timeout: TIMEOUT }, PILOT_PLAY_ACTIVE);
  if (!fixture.openDoor) return null;
  // The pilot finds the nearest interaction in its frame loop; E before that would do nothing.
  await page.waitForFunction(() => { const button = document.querySelector('#interact') as HTMLButtonElement | null; return !!button && !button.disabled && /^Open /.test(button.textContent ?? ''); }, { timeout: TIMEOUT });
  await page.focus('#canvas'); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => /^Close /.test(document.querySelector('#interact')?.textContent ?? ''), { timeout: TIMEOUT });
  return page.evaluate(() => document.querySelector('#interact')?.textContent ?? '');
}
const pilotPlayState = (page: Page) => page.evaluate(() => document.querySelector('#play-state')?.textContent ?? '');
/** `Walking · x, y, z · status` from the pilot's play status line (x and z to .1 m, y to .01 m). */
export function parsePilotPlayState(text: string) {
  const match = text.match(/^(Walking|Driving) · (-?[\d.]+), (-?[\d.]+), (-?[\d.]+) · /);
  return match ? { mode: match[1]!, position: [Number(match[2]), Number(match[3]), Number(match[4])] as [number, number, number] } : null;
}

export async function captureFarmNew(o: { browser: Browser; url: string; ports: ReadonlySet<number>; backend: ParityBackend; view: string; file: string; woodlandTangents?: boolean; staticBaseline?: boolean; instanceUniforms?: boolean; play?: PlayFixture; ambientTime?: number }): Promise<CapturedFarm> {
  const ambientTime = o.ambientTime ?? 0; assert(Number.isFinite(ambientTime) && ambientTime >= 0, 'Fixed ambient time must be a nonnegative number');
  const page = await o.browser.newPage(), diagnostics: Diagnostic[] = [];
  try {
    await configurePage(page, o.ports, diagnostics);
    const initialView = o.play ? 'hero' : o.view;
    const url = new URL(o.url); url.searchParams.set('tier', 'high'); url.searchParams.set('freeze', '1'); url.searchParams.set('time', '0'); url.searchParams.set('view', initialView);
    if (o.backend === 'webgl2') url.searchParams.set('backend', 'webgl2');
    if (o.woodlandTangents === false) url.searchParams.set('woodlandTangents', 'false');
    if (o.staticBaseline === true) url.searchParams.set('staticBaseline', 'true');
    // M4 item 1 A/B: three's per-mesh instance uniform buffers instead of the Farm's instanced-attribute path.
    if (o.instanceUniforms === true) url.searchParams.set('instanceUniforms', 'true');
    await page.goto(url.href, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
    await page.waitForFunction(() => typeof (window as any).__kilnScene?.setView === 'function' && typeof (window as any).__kilnScene?.setAmbient === 'function', { timeout: TIMEOUT });
    await page.evaluate(({ view, time }) => { const api = (window as any).__kilnScene; api.feedFrameTimes([]); api.setAmbient(false); api.setTimeScale(0); api.setTime(time); api.setView(view); }, { view: initialView, time: ambientTime });
    const door = o.play ? await enterRewritePlay(page, o.play) : null;
    await waitFrames(page, 3); await pauseForCapture(page);
    const stats = await page.evaluate(() => {
      const api = (window as any).__kilnScene, raw = api.stats(), tier = api.tierState(), host = (window as any).__kilnHarness.snapshot();
      return { backend: host.backend, readyCount: host.readyCount, errors: host.errors, render: raw.render, memory: raw.memory, pipelines: raw.pipelines, programs: raw.programs, counts: raw.counts,
        tier: { tier: tier.tier, level: tier.level, live: tier.live, initial: tier.knobs }, motion: api.motionPolicy(), camera: api.cameraPose?.(), sim: api.simState?.() ?? null, colliders: api.colliderStats?.() ?? null, timing: 'not collected' };
    });
    if (o.play) {
      assert.equal(stats.sim?.active, true, 'Rewrite is in play'); assert.equal(stats.sim.driving, false); assert.equal(stats.sim.player.visible, true, 'Rowan is visible at the play fixture');
      stats.play = { fixture: o.play, door };
    }
    assert.equal(stats.readyCount, 1); assert.deepEqual(stats.errors, []); assert.equal(stats.backend.backend, o.backend);
    assert.equal(typeof stats.programs, 'number', 'Rebuild with the corrected pipeline-cache instrumentation before count capture');
    assert.equal(stats.tier.tier, 'high'); assert.equal(stats.tier.level, 0); assert.equal(stats.motion.time, ambientTime); assert.equal(stats.motion.ambient, ambientTime);
    assert.equal(stats.tier.live.vegetationDensity, stats.tier.initial.vegetationDensity); assert.equal(stats.tier.live.instanceDensity, stats.tier.initial.instanceDensity);
    const png = await screenshot(page, o.file);
    assert.deepEqual(badDiagnostics(diagnostics), [], 'Rewrite browser errors or warnings');
    return { png, stats, diagnostics, file: o.file };
  } catch (error) {
    await page.screenshot({ path: o.file.replace(/\.png$/, '-failure.png'), type: 'png' }).catch(() => {});
    await writeFile(o.file.replace(/\.png$/, '-failure.json'), JSON.stringify({ error: String(error), diagnostics }, null, 2)); throw error;
  } finally {
    try { await page.evaluate(() => (window as any).__kilnHarness?.unmount()); } catch { /* page may have failed before mounting */ }
    await page.close();
  }
}
export async function capturePilotPair(o: { browser: Browser; url: string; ports: ReadonlySet<number>; backend: ParityBackend; view: string; dir: string; play?: PlayFixture }) {
  const page = await o.browser.newPage(), diagnostics: Diagnostic[] = [];
  try {
    await configurePage(page, o.ports, diagnostics);
    const url = new URL(o.url); url.searchParams.set('quality', 'high'); url.searchParams.set('profile', ''); url.searchParams.set('view', o.play ? 'hero' : o.view);
    if (o.backend === 'webgl2') url.searchParams.set('backend', 'webgl2');
    await page.goto(url.href, { waitUntil: 'load', timeout: TIMEOUT });
    await page.waitForFunction(() => /^589 pack placements \+ 843 woodland trees/.test(document.querySelector('#load')?.textContent ?? '') && !(document.querySelector('#play-farm') as HTMLButtonElement)?.disabled, { timeout: TIMEOUT });
    const door = o.play ? await enterPilotPlay(page, o.play) : null;
    // The shader clock brackets each capture, so the frozen rewrite can take the same wind and water phase.
    const bracket = async (file: string) => { const before = await readPilotShaderClock(page, o.ports), png = await screenshot(page, file), after = await readPilotShaderClock(page, o.ports); return { png, clock: { before, after, phase: (before.time + after.time) / 2, window: after.time - before.time } }; };
    await pauseForCapture(page);
    const { png: first, clock: firstClock } = await bracket(resolve(o.dir, `${o.view}-pilot-${o.backend}.png`)), firstStats: any = await pilotStats(page, o.backend, o.ports);
    const firstPlay = o.play ? await pilotPlayState(page) : null;
    await pauseForCapture(page);
    const { png: repeat, clock: repeatClock } = await bracket(resolve(o.dir, `${o.view}-pilot-repeat-${o.backend}.png`)), repeatStats: any = await pilotStats(page, o.backend, o.ports);
    const repeatPlay = o.play ? await pilotPlayState(page) : null;
    firstStats.shaderClock = firstClock; repeatStats.shaderClock = repeatClock;
    if (o.play) {
      for (const text of [firstPlay, repeatPlay]) assert(parsePilotPlayState(text ?? '')?.mode === 'Walking', `Pilot is walking at the fixture: ${text}`);
      firstStats.play = { fixture: o.play, state: firstPlay, door }; repeatStats.play = { fixture: o.play, state: repeatPlay, door };
    }
    assert.deepEqual(badDiagnostics(diagnostics), [], 'Pilot browser errors or warnings');
    return { first, repeat, firstStats, repeatStats, diagnostics, phase: firstClock.phase };
  } catch (error) {
    await page.screenshot({ path: resolve(o.dir, 'pilot-failure.png'), type: 'png' }).catch(() => {});
    await writeFile(resolve(o.dir, 'pilot-failure.json'), JSON.stringify({ error: String(error), diagnostics }, null, 2)); throw error;
  } finally { await page.close(); }
}

export async function runFarmParity(options: { workspace?: string; release?: 'r33' | 'r34'; backend?: ParityBackend | 'both'; label: string; views?: string[]; newRoot?: string; woodlandAb?: boolean; stage?: string }) {
  // Play fixtures are captured after the named views, so a combined run reads in SPEC 19.3 order.
  const workspace = resolve(options.workspace ?? process.cwd()), release = options.release ?? 'r33';
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.label), 'Evidence label must be a simple directory name');
  const out = workspacePath(workspace, `evidence/parity/${options.label}`); assert(!existsSync(out), 'Refusing to overwrite existing parity evidence'); await mkdir(out, { recursive: true });
  const layout = JSON.parse(await readFile(workspacePath(workspace, `.tmp/pilot-${release}/scene/layout.json`), 'utf8'));
  const views = options.views ?? Object.keys(layout.views); assert(views.length > 0 && views.every(view => Object.hasOwn(layout.views, view) || Object.hasOwn(PLAY_FIXTURES, view)), 'Every requested view exists in the sealed layout or is a play fixture');
  const namedViews = views.filter(view => Object.hasOwn(layout.views, view)), playViews = views.filter(view => Object.hasOwn(PLAY_FIXTURES, view));
  const backends: ParityBackend[] = !options.backend || options.backend === 'both' ? ['webgpu', 'webgl2'] : [options.backend];
  const countGateEnabled = options.stage === 'm2b' || options.stage === 'm2d';
  // M2d calibration (PROGRESS R4-07): the pilot's 3 s old-old pair cannot bound grass-wind and stream
  // differences between time 0 and its elapsed shader clock, so the frozen rewrite takes that phase.
  const alignPhase = options.stage === 'm2d';
  const results: any[] = [], ledger: any = { runnerPid: process.pid, closed: false }, report: any = { schema: 'kiln.farm-parity/1', date: new Date().toISOString(), release, stage: options.stage ?? 'm2a', conditions: { width: WIDTH, height: HEIGHT, dpr: 1, tier: 'high', captureDelay: '3 seconds after readiness; repeat 3 seconds later', rewriteTime: alignPhase ? "the pilot's shader clock at its first capture (midpoint of a read-only bracket), then frozen: grass wind and stream phase match; clip mixers are not aligned and stay within the old-old noise rule" : 0, rewriteHerd: false, liveGovernor: 'disabled with empty synthetic trace', oracle: 'unmodified sealed serve.mjs verifies delivery.json', normalizationCss: normalizedCss, imageMetric: 'B-06/D18 full-view sRGB-decoded linear luminance, Rec.709 coefficients, 16×9 tiles; >32-channel budget 100 pixels beyond repeat noise', tileThreshold: 'max(3 * old-old tile noise, 0.02)', tilePassFraction: .97, globalMeanExclusiveLimit: .02, diffVisualGain: 4, performanceTiming: 'not collected', countGate: countGateEnabled ? 'B-07 optimization goldens and collider counts (frozen pilot fixture) and X-02 counts at every named view and play fixture: inclusive ±2% draws/triangles, pipelines <=105% of the committed reference of the optimized build (' + X02_BASELINE_PATH + ', OD-8/D-53; the two pilot samples are recorded beside it, not gated); qualification requires every named view and play fixture on both backends' : 'Not applied: this stage records observations only',
    playFixtures: Object.fromEntries(playViews.map(view => [view, PLAY_FIXTURES[view]])), playConditions: 'Rewrite: setPlaying(true) then the teleport hook (the pilot visit) under the frozen clock; the player clip is held at its start. Pilot: its #visit destination menu; E on the canvas for the door; its play status line records the farmer position',
    streamCrop: views.includes('watermill-wheel') ? { view: 'watermill-wheel', rectangle: STREAM_CROP, rule: 'Luminance-only historical crop diagnostic (16 by 9 tiles of 40 by 28 px); not full-view D18 qualification' } : undefined }, views, backends, results, ledger };
  const save = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
  let pilot: Awaited<ReturnType<typeof serveSealedPilot>> | undefined, hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined;
  // OD-8 (D-53): X-02 compares against the committed reference of the optimized build; B-06 pixels and B-07 still use the pilot.
  const x02Reference = countGateEnabled ? JSON.parse(await readFile(workspacePath(workspace, X02_BASELINE_PATH), 'utf8')) as X02Baseline : null;
  if (x02Reference) { const problems = validateX02Baseline(x02Reference); assert(problems.length === 0, `X-02 reference ${X02_BASELINE_PATH}: ${problems.join('; ')}`); }
  // Each release is judged against its own sealed collision world (SPEC 19.8; r34 differs only by its farmhouse, D-07).
  const colliderFixture = JSON.parse(await readFile(workspacePath(workspace, `packages/farm/fixtures/${release === 'r33' ? 'play-colliders.json' : `play-colliders-${release}.json`}`), 'utf8')) as ColliderCounts;
  try {
    pilot = await serveSealedPilot(workspace, release); ledger.pilot = { port: pilot.port, pid: pilot.pid, log: pilot.log };
    hosted = await serveOwned(workspacePath(workspace, options.newRoot ?? 'packages/farm/dist/test')); ledger.rewrite = { port: hosted.port, pid: process.pid };
    browser = await launchChrome({ workspace, name: `parity-${options.label}` }); ledger.browserPid = browser.process()?.pid; ledger.browserProfile = browser.process()?.spawnargs.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length); report.browser = await browser.version();
    await closeExtraStartupPages(browser);
    const ports = new Set([pilot.port, hosted.port]);
    for (const backend of backends) for (const view of views) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const dir = resolve(out, `${view}-${backend}`, `attempt-${attempt}`); await mkdir(dir, { recursive: true });
        console.log(`B-06 ${view}/${backend}: START attempt ${attempt}`);
        const result: any = { view, backend, attempt, status: 'fail', directory: dir };
        try {
          const play = PLAY_FIXTURES[view];
          const old = await capturePilotPair({ browser, url: pilot.url, ports, backend, view, dir, play });
          const fresh = await captureFarmNew({ browser, url: hosted.url, ports, backend, view, file: resolve(dir, `${view}-new-${backend}.png`), play, ambientTime: alignPhase ? old.phase : 0 });
          const metric = compareParityImages(old.first, old.repeat, fresh.png); const { diff, ...numbers } = metric;
          const writePng = (name: string, image: { width: number; height: number; data: Uint8Array }) => writeFile(resolve(dir, name), PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }));
          await writePng(`${view}-diff-${backend}.png`, diff);
          Object.assign(result, { fixture: play ? 'play fixture' : 'named view', metric: numbers, pilot: { first: old.firstStats, repeat: old.repeatStats, diagnostics: old.diagnostics }, rewrite: { stats: fresh.stats, diagnostics: fresh.diagnostics }, status: metric.pass ? 'pass' : 'fail' });
          const failures: string[] = metric.pass ? [] : ['B-06 luminance/thin-line parity thresholds failed'];
          if (play) {
            // Both sides stand at the same destination: the pilot's status line rounds x and z to .1 m and y to .01 m.
            const pilotAt = parsePilotPlayState((old.firstStats as any).play.state)!.position, rewriteAt = fresh.stats.sim.player.position as number[];
            const offsets = rewriteAt.map((value, axis) => Math.abs(value - pilotAt[axis]!)), limits = [.051, .0051, .051];
            result.playPosition = { pilot: pilotAt, rewrite: rewriteAt, offsets, limits, pass: offsets.every((offset, axis) => offset <= limits[axis]!) };
            if (!result.playPosition.pass) failures.push('Play fixture positions differ beyond the pilot status rounding');
          }
          if (view === 'watermill-wheel') {
            const a = cropImage(old.first, STREAM_CROP), b = cropImage(old.repeat, STREAM_CROP), c = cropImage(fresh.png, STREAM_CROP), crop = compareLuminanceImages(a, b, c);
            await writePng(`stream-crop-pilot-${backend}.png`, a); await writePng(`stream-crop-pilot-repeat-${backend}.png`, b); await writePng(`stream-crop-new-${backend}.png`, c); await writePng(`stream-crop-diff-${backend}.png`, crop.diff);
            const { diff: _cropDiff, ...cropNumbers } = crop; result.streamCrop = { rectangle: STREAM_CROP, metric: cropNumbers };
            if (!crop.pass) failures.push('SPEC 19.7 stream crop at the mill bank failed');
          }
          if (countGateEnabled) {
            const rewriteCounts = { drawCalls: fresh.stats.render.drawCalls, triangles: fresh.stats.render.triangles,
              geometries: fresh.stats.memory.geometries, textures: fresh.stats.memory.textures, pipelines: fresh.stats.pipelines, programs: fresh.stats.programs };
            const kind = play ? 'play fixture' : 'named view';
            const x02 = compareX02Reference(x02Reference!, { view, backend, tier: 'high', viewport: [WIDTH, HEIGHT], freshPage: true }, rewriteCounts);
            const first = compareStaticRendererCounts(old.firstStats, rewriteCounts, kind), repeat = compareStaticRendererCounts(old.repeatStats, rewriteCounts, kind);
            const b07 = compareFarmOptimizationCounts({ release, counts: fresh.stats.counts, pilot: old.firstStats, pilotRepeat: old.repeatStats, rewrite: rewriteCounts, textureProfile: fresh.stats.counts.shadow === null ? 'prewarmed' : 'cached-shadows', colliders: { actual: fresh.stats.colliders, fixture: colliderFixture } });
            result.countChecks = { b07, x02: { ...x02, baseline: `${X02_BASELINE_PATH} (OD-8, D-53: re-baselined on the optimized build)`, pilotObservation: { first, repeat, gated: false, note: 'Both pilot samples, recorded only: the optimized build lowers draws on purpose' } } };
            if (!b07.pass) failures.push('B-07 optimization statistics failed');
            if (!result.countChecks.x02.pass) failures.push(`X-02 renderer count limits failed at this ${kind}`);
          }
          result.status = failures.length ? 'fail' : 'pass';
          if (failures.length) result.error = failures.join('; ');
        } catch (error) { result.error = error instanceof Error ? error.stack : String(error); }
        results.push(result); await writeFile(resolve(dir, 'result.json'), JSON.stringify(result, null, 2)); await save();
        console.log(`B-06 ${view}/${backend}: ${result.status.toUpperCase()} attempt ${attempt}${result.error ? ' ' + result.error : ''}`);
        if (result.status === 'pass') break;
      }
    }
    if (options.woodlandAb) {
      const { captureWoodlandAb } = await import('./capture-woodland-ab');
      report.woodlandAb = [];
      for (const backend of backends) report.woodlandAb.push(await captureWoodlandAb({ backend, out: resolve(out, `woodland-ab-${backend}`), capture: (file: string, woodlandTangents: boolean) => captureFarmNew({ browser: browser!, url: hosted!.url, ports, backend, view: 'hero', file, woodlandTangents, staticBaseline: true }) }));
    }
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error; }
  finally {
    const cleanup: string[] = [];
    try { await browser?.close(); ledger.browserClosed = true; } catch (error) { cleanup.push('browser: ' + String(error)); }
    try { await hosted?.close(); ledger.rewriteClosed = true; } catch (error) { cleanup.push('rewrite server: ' + String(error)); }
    try { await pilot?.close(); ledger.pilotClosed = pilot?.closed ?? true; } catch (error) { cleanup.push('pilot server: ' + String(error)); }
    ledger.cleanupErrors = cleanup; ledger.closed = cleanup.length === 0;
    const completed = new Map(results.map(result => [`${result.view}/${result.backend}`, result]));
    report.summary = { expectedViews: views.length * backends.length, completedViews: completed.size, passingViews: [...completed.values()].filter(result => result.status === 'pass').length,
      failingViews: [...completed.values()].filter(result => result.status === 'fail').length, unattemptedViews: views.length * backends.length - completed.size, retainedAttempts: results.length };
    if (countGateEnabled) report.staticCountQualification = summarizeStaticCountCoverage(namedViews.length === Object.keys(layout.views).length ? Object.keys(layout.views) : namedViews, results, playViews);
    await save();
    if (cleanup.length) throw new AggregateError(cleanup, 'Owned parity resources did not all close');
  }
  const final = new Map(results.map(result => [`${result.view}/${result.backend}`, result]));
  return { out, pass: [...final.values()].every(result => result.status === 'pass'), report };
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (key: string, fallback?: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
  if (args.includes('--help')) {
    console.log('Usage: bun scripts/capture-farm-parity.ts --label <new-evidence-directory> [--backend both|webgpu|webgl2] [--views hero,opposite,...|all|play] [--release r33|r34] [--new-root packages/farm/dist/test] [--stage m2a|m2b|m2d] [--woodland-ab]');
    console.log(`Play fixtures: ${Object.keys(PLAY_FIXTURES).join(', ')}. "all" is every named view plus the play fixtures; "play" is the play fixtures only.`);
  } else {
  const backend = value('--backend', 'both'), release = value('--release', 'r33');
  assert(['both', 'webgpu', 'webgl2'].includes(backend!), 'Backend must be both, webgpu or webgl2'); assert(['r33', 'r34'].includes(release!), 'Release must be r33 or r34');
  const requested = value('--views'), sealed = Object.keys(JSON.parse(await readFile(workspacePath(process.cwd(), `.tmp/pilot-${release}/scene/layout.json`), 'utf8')).views);
  const views = requested === 'all' ? [...sealed, ...Object.keys(PLAY_FIXTURES)] : requested === 'play' ? Object.keys(PLAY_FIXTURES) : requested?.split(',');
  const result = await runFarmParity({ label: value('--label') ?? `m2a-${new Date().toISOString().replace(/[:.]/g, '-')}`, backend: backend as ParityBackend | 'both', release: release as 'r33' | 'r34', views, newRoot: value('--new-root'), stage: value('--stage'), woodlandAb: args.includes('--woodland-ab') });
  console.log(`Parity evidence: ${result.out}; ${result.pass ? 'PASS' : 'FAIL'}`); if (!result.pass) process.exitCode = 1;
  }
}
