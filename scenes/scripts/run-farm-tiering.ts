import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser, Page } from 'puppeteer-core';
import { classifyDevice, type DeviceProbe } from '../packages/scene-kit/src/quality/core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { compareParityImages, type RgbaImage } from './parity-images';

/**
 * B-10 (tiering) and B-13 (governor path and resize on the full scene) on the Farm test output.
 * B-10: emulated device profiles (user agent, touch, screen size, DPR; adapter strings through the test-only
 * `window.__kilnProbeOverride`, since Chrome cannot emulate them) must start on the tier that `classifyDevice`
 * predicts from the probe the page reports; synthetic `feedFrameTimes` traces drive the governor on logical
 * time, so nothing depends on this PC's load. B-13: under Z4 the ladder has no pixel-ratio step, so the
 * governor path changes the grass fraction; a governor step plus a window resize must give the same stream and
 * grass pixels as a fresh load at the final size with the same step. No timing is collected.
 */
const TIMEOUT = 120_000;
type Backend = 'webgpu' | 'webgl2';
interface Diagnostic { kind: string; type?: string; text: string; url?: string }
interface Step { name: string; status: 'pass' | 'fail'; details?: unknown; error?: string }
interface Profile { name: string; expected: Record<Backend, string>; width: number; height: number; dpr: number; mobile: boolean; tablet?: boolean; backend?: Backend; override?: Partial<DeviceProbe> }
const fallbackWarning = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/;
/** Chrome's reduced Android user agent; tablets omit "Mobile" and report `mobile: false` in client hints. */
const ANDROID_UA = (major: string, tablet = false) => `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 ${tablet ? '' : 'Mobile '}Safari/537.36`;
const adapter = (vendor: string, architecture: string, description = '') => ({ vendor, architecture, device: '', description });
/**
 * SPEC 15 / D-02, D-03, D-05 classification cases per backend (on WebGL2 every mobile profile is minimal, D-03; the Tab S9 FE's
 * Mali-G68 class is minimal on WebGPU as well, X-07, owner decision 2026-09-29 22:10).
 * The Tab S9 FE strings are the ones the Golden Gate builder read on the device (vendor arm, architecture valhall).
 * GG-008 (no Samsung Xclipse pattern) stays open: no profile invents Exynos 2400 strings.
 */
const PROFILES: Profile[] = [
  { name: 'Galaxy S24+ (Snapdragon, Adreno 750)', expected: { webgpu: 'high', webgl2: 'minimal' }, width: 412, height: 915, dpr: 2.8125, mobile: true, override: { adapter: adapter('qualcomm', 'adreno-7xx') } },
  { name: 'Galaxy Tab S9 FE (Exynos 1380, Mali-G68 / Valhall)', expected: { webgpu: 'minimal', webgl2: 'minimal' }, width: 823, height: 1317, dpr: 1.75, mobile: true, tablet: true, override: { adapter: adapter('arm', 'valhall') } },
  { name: 'phone on WebGL2 (Mali-G68)', expected: { webgpu: 'minimal', webgl2: 'minimal' }, width: 412, height: 915, dpr: 2.8125, mobile: true, backend: 'webgl2', override: { adapter: adapter('ARM', '', 'Mali-G68') } },
  { name: 'Galaxy S24+ with Save-Data', expected: { webgpu: 'balanced', webgl2: 'minimal' }, width: 412, height: 915, dpr: 2.8125, mobile: true, override: { adapter: adapter('qualcomm', 'adreno-7xx'), saveData: true } },
  { name: 'this desktop (no override)', expected: { webgpu: 'high', webgl2: 'high' }, width: 1280, height: 720, dpr: 1, mobile: false },
];
const badDiagnostics = (messages: Diagnostic[]) => messages.filter(m => m.kind !== 'console' || m.type === 'error' || (m.type === 'warn' && !fallbackWarning.test(m.text)));

async function configure(page: Page, ports: ReadonlySet<number>, diagnostics: Diagnostic[]) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
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
/** The parity normalization (capture-farm-parity.ts) in viewport units: the scene fills the viewport with the HUD hidden, so a viewport resize is a scene resize. */
const fillCss = `html,body{margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;display:block!important}
body>header,body>footer,aside{display:none!important}
main,#scene-shell,#farm,.ks-root{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;max-width:none!important;max-height:none!important;min-height:0!important;width:100vw!important;height:100vh!important;box-sizing:border-box!important}
main,#scene-shell,#farm{position:absolute!important;left:0!important;top:0!important;display:block!important}
canvas{display:block!important;width:100vw!important;height:100vh!important;border:0!important;border-radius:0!important}
#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}canvas,.ks-root{outline:none!important}`;
async function fillViewport(page: Page) {
  await page.evaluateOnNewDocument(css => {
    const apply = () => { if (!document.head) return false; const style = document.createElement('style'); style.textContent = css; document.head.append(style); return true; };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, fillCss);
}
async function capture(page: Page, file: string, width: number, height: number): Promise<RgbaImage> {
  const size = await page.evaluate(() => { const c = document.querySelector('canvas')!, r = c.getBoundingClientRect(); return { width: c.width, height: c.height, x: r.x, y: r.y, cssWidth: r.width, cssHeight: r.height }; });
  assert.deepEqual(size, { width, height, x: 0, y: 0, cssWidth: width, cssHeight: height }, 'drawing buffer and CSS size equal the viewport at DPR 1');
  const bytes = await page.screenshot({ path: file as `${string}.png`, type: 'png', clip: { x: 0, y: 0, width, height }, captureBeyondViewport: false });
  const png = PNG.sync.read(Buffer.from(bytes)); return { width: png.width, height: png.height, data: png.data };
}
function crop(image: RgbaImage, r: { x: number; y: number; width: number; height: number }): RgbaImage {
  const data = new Uint8Array(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) data.set(image.data.subarray(((r.y + y) * image.width + r.x) * 4, ((r.y + y) * image.width + r.x + r.width) * 4), y * r.width * 4);
  return { width: r.width, height: r.height, data };
}
const settle = (page: Page) => page.evaluate(() => new Promise<void>(done => setTimeout(done, 3000))); // SPEC 19 fixed settling delay; never measured
const liveEvents = (page: Page) => page.evaluate(() => ((window as any).__kilnScene.events as { type: string; value: any }[]).filter(e => e.type === 'tier' && e.value?.kind === 'live').map(e => ({ level: e.value.level, direction: e.value.direction })));
const feed = (page: Page, trace: number[]) => page.evaluate((t: number[]) => (window as any).__kilnScene.feedFrameTimes(t) as { level: number; direction: string }[], trace);
const repeat = (ms: number, frames: number) => Array.from({ length: frames }, () => ms);
/** The parity stream crop (capture-farm-parity.ts STREAM_CROP) at 1280 by 720. */
const STREAM_RECT = { x: 640, y: 468, width: 640, height: 252 };

export async function runFarmTiering(o: { workspace?: string; label: string; root?: string; backend: Backend; out?: string }) {
  const workspace = resolve(o.workspace ?? process.cwd()), out = workspacePath(workspace, o.out ? `${o.out}-${o.backend}` : `evidence/m3/tiering/${o.label}-${o.backend}`);
  assert(!existsSync(out), `Refusing to overwrite ${out}`); await mkdir(out, { recursive: true });
  // The Farm table imports the kit index, whose React Three Fiber CommonJS build requires 'three'; load the ES module first.
  await import('three'); const { farmTiers } = await import('../packages/farm/src/tiers');
  const steps: Step[] = [], diagnostics: Diagnostic[] = [], ledger: Record<string, unknown> = { runnerPid: process.pid };
  const report: Record<string, unknown> = { schema: 'kiln.farm-b10-b13/1', date: new Date().toISOString(), label: o.label, backend: o.backend,
    conditions: { governor: 'synthetic feedFrameTimes traces on logical time (no wall-clock waits, no CPU throttling); real frames never step the governor in the test build', captures: 'freeze=1, time=0, ambient off, DPR 1, SPEC 19 settling delay', timing: 'not collected' }, steps, diagnostics, ledger };
  const save = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const entry: Step = { name, status: 'fail' }; steps.push(entry);
    try { entry.details = await fn(); entry.status = 'pass'; } catch (error) { entry.error = error instanceof Error ? error.stack ?? error.message : String(error); }
    console.log(`B-10/B-13 ${o.backend} ${name}: ${entry.status.toUpperCase()}${entry.error ? ' ' + entry.error.split('\n')[0] : ''}`); await save();
  };
  let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined;
  try {
    hosted = await serveOwned(workspacePath(workspace, o.root ?? 'packages/farm/dist/test')); ledger.server = { port: hosted.port, pid: process.pid };
    const b = browser = await launchChrome({ workspace, name: `b10-${o.backend}`, windowSize: [1280, 720] }); ledger.browserPid = b.process()?.pid; report.browser = await b.version();
    report.windowSize = [1280, 720];
    const major = /\/(\d+)\./.exec(String(report.browser))?.[1] ?? '154', ports = new Set([hosted.port]);
    const open = async (profile: Profile, params: Record<string, string> = {}, fill = false) => {
      const context = await b.createBrowserContext(), page = await context.newPage(); await configure(page, ports, diagnostics);
      if (fill) await fillViewport(page);
      if (profile.mobile) await page.setUserAgent({ userAgent: ANDROID_UA(major, profile.tablet), userAgentMetadata: { brands: [{ brand: 'Google Chrome', version: major }], fullVersion: `${major}.0.0.0`, platform: 'Android', platformVersion: '15.0.0', architecture: '', model: '', mobile: !profile.tablet } });
      await page.setViewport({ width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr, isMobile: profile.mobile, hasTouch: profile.mobile });
      if (profile.override) await page.evaluateOnNewDocument(override => { (window as any).__kilnProbeOverride = override; }, profile.override as any);
      const url = new URL(hosted!.url); for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      if ((profile.backend ?? o.backend) === 'webgl2') url.searchParams.set('backend', 'webgl2');
      await page.goto(url.href, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
      await page.waitForFunction(() => typeof (window as any).__kilnScene?.feedFrameTimes === 'function', { timeout: TIMEOUT });
      return { page, close: async () => { try { await page.evaluate(() => (window as any).__kilnHarness?.unmount()); } catch { /* not mounted */ } await context.close(); } };
    };

    await step('B-10 emulated profiles start on the tier the classification table predicts', async () => {
      const results = [];
      for (const profile of PROFILES) {
        const { page, close } = await open(profile);
        try {
          const state = await page.evaluate(() => { const t = (window as any).__kilnScene.tierState(); return { tier: t.tier, level: t.level, device: t.device, probe: t.probe, live: t.live, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'), events: ((window as any).__kilnScene.events as any[]).filter(e => e.type === 'tier').map(e => e.value) }; });
          const predicted = classifyDevice(state.probe as DeviceProbe, farmTiers);
          assert.equal(state.tier, predicted.tier, `${profile.name}: page tier ${state.tier} equals the table's ${predicted.tier}`);
          assert.equal(state.tier, profile.expected[o.backend], `${profile.name}: expected ${profile.expected[o.backend]}`);
          assert.deepEqual(state.events[0], { kind: 'initial', tier: state.tier, reasons: predicted.reasons, level: 0 }, `${profile.name}: onTier initial event`);
          results.push({ profile: profile.name, expected: profile.expected[o.backend], tier: state.tier, predicted: predicted.tier, reasons: predicted.reasons, device: state.device, backend: state.backend,
            probe: { backend: state.probe.backend, adapter: state.probe.adapter, screen: [state.probe.screenWidth, state.probe.screenHeight], dpr: state.probe.devicePixelRatio, coarsePointer: state.probe.coarsePointer, mobileUA: state.probe.mobileUA, saveData: state.probe.saveData },
            live: state.live });
        } finally { await close(); }
      }
      return { profiles: results, note: 'GG-008 open: no Samsung Xclipse (Exynos 2400) pattern; its adapter strings are unread, so no profile invents them. An Exynos S24+ classifies by whatever strings it reports (arm-like strings would give economy) until the strings are read on a device.' };
    });
    // Governor cases need a tier with a live ladder: on WebGL2 every mobile profile is minimal (D-03, one level), so that run uses the desktop.
    const governorProfile = o.backend === 'webgpu' ? PROFILES[0]! : PROFILES[4]!;
    await step('B-10 a trace that improves after the step: exactly one down step, then stability; 12 ms gives no up step before upHoldMs and exactly one after', async () => {
      const { page, close } = await open(governorProfile);
      try {
        const tier = await page.evaluate(() => (window as any).__kilnScene.tierState().tier); assert.equal(tier, 'high');
        const down = await feed(page, repeat(30, 200)), band = await feed(page, repeat(17, 2400)), early = await feed(page, repeat(12, 1000)), late = await feed(page, repeat(12, 500));
        assert.deepEqual(down, [{ level: 1, direction: 'down' }], '30 ms: one down step to grass .75');
        assert.deepEqual(band, [], '17 ms (inside the band, a 43% benefit): the step is kept and nothing changes for 40.8 s');
        assert.deepEqual(early, [], '12 ms for 12 s: no up step before upHoldMs has elapsed');
        assert.deepEqual(late, [{ level: 0, direction: 'up' }], 'then exactly one up step');
        const state = await page.evaluate(() => { const t = (window as any).__kilnScene.tierState(); return { level: t.level, live: t.live, locked: t.locked }; });
        assert.equal(state.level, 0); assert.equal(state.live.vegetationDensity, 1); assert.equal(state.locked, false);
        assert.deepEqual(await liveEvents(page), [...down, ...band, ...early, ...late], 'onTier live events equal the returned changes');
        return { profile: governorProfile.name, tier, down, band, early, late, final: state, traceSeconds: { down: 6, band: 40.8, early: 12, late: 6 } };
      } finally { await close(); }
    });
    await step('C-02 in the browser: a constant 30 ms trace steps down, the benefit rule reverts it, the next step locks (two reversals), then nothing changes', async () => {
      const { page, close } = await open(governorProfile);
      try {
        const first = await feed(page, repeat(30, 1500)), second = await feed(page, repeat(30, 1500)), third = await feed(page, repeat(30, 1000));
        const state = await page.evaluate(() => { const t = (window as any).__kilnScene.tierState(); return { tier: t.tier, level: t.level, live: t.live, locked: t.locked }; });
        assert.equal(state.tier, 'high'); assert.deepEqual(first, [{ level: 1, direction: 'down' }, { level: 0, direction: 'revert' }], 'one down step, then the benefit revert (no improvement)');
        assert.deepEqual(second, [{ level: 1, direction: 'down' }], 'down steps return after the 60 s disable; the second reversal within 2 min locks');
        assert.deepEqual(third, [], 'locked: nothing changes');
        assert.equal(state.level, 1); assert.equal(state.live.vegetationDensity, .75); assert.equal(state.locked, true);
        assert.deepEqual(await liveEvents(page), [...first, ...second], 'onTier live events equal the returned changes');
        return { profile: governorProfile.name, first, second, third, final: state, traceSeconds: [45, 45, 30] };
      } finally { await close(); }
    });
    await step('B-13 governor step and window resize give the fresh-load pixels (stream and grass; Z4: no pixel-ratio step)', async () => {
      const desktop = PROFILES[4]!, trace = [...repeat(30, 200), ...repeat(17, 400)], views = ['watermill-wheel', 'eye-height'] as const;
      const results: Record<string, unknown> = {};
      for (const view of views) {
        const params = { tier: 'high', freeze: '1', time: '0', view };
        const prepare = async (page: Page) => { await page.evaluate(v => { const api = (window as any).__kilnScene; api.setAmbient?.(false); api.setTimeScale(0); api.setTime(0); api.setView(v); }, view); await waitFrames(page, 3); };
        // Reference: a fresh load at the final 1280 by 720 size, the same governor step, captured twice for the noise floor.
        const ref = await open({ ...desktop, width: 1280, height: 720 }, params, true);
        let reference: RgbaImage, noise: RgbaImage, level0: RgbaImage, refState: unknown;
        try {
          // Control: the same fresh page before the step (grass 1), to show the comparison detects a grass change.
          await prepare(ref.page); await settle(ref.page); level0 = await capture(ref.page, resolve(out, `${view}-fresh-level0.png`), 1280, 720);
          const changes = await feed(ref.page, trace); assert.deepEqual(changes, [{ level: 1, direction: 'down' }]);
          await waitFrames(ref.page, 3); await settle(ref.page);
          reference = await capture(ref.page, resolve(out, `${view}-fresh.png`), 1280, 720); await settle(ref.page); noise = await capture(ref.page, resolve(out, `${view}-fresh-repeat.png`), 1280, 720);
          refState = await ref.page.evaluate(() => (window as any).__kilnScene.tierState().live);
        } finally { await ref.close(); }
        // Test: load at 960 by 540, take the same governor step, resize to 1280 by 720.
        const test = await open({ ...desktop, width: 960, height: 540 }, params, true);
        try {
          await prepare(test.page); const before = await test.page.evaluate(() => (window as any).__kilnScene.tierState().live);
          const changes = await feed(test.page, trace); assert.deepEqual(changes, [{ level: 1, direction: 'down' }]);
          const stepped = await test.page.evaluate(() => (window as any).__kilnScene.tierState().live);
          assert.equal(stepped.pixelRatio, before.pixelRatio, 'Z4: the governor path never changes the pixel ratio'); assert.equal(stepped.vegetationDensity, .75);
          await test.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 }); await waitFrames(test.page, 6); await settle(test.page);
          const after = await capture(test.page, resolve(out, `${view}-stepped-resized.png`), 1280, 720);
          const full = compareParityImages(reference, noise, after), control = compareParityImages(reference, noise, level0);
          const stream = view === 'watermill-wheel' ? compareParityImages(crop(reference, STREAM_RECT), crop(noise, STREAM_RECT), crop(after, STREAM_RECT)) : null;
          await writeFile(resolve(out, `${view}-diff.png`), PNG.sync.write(Object.assign(new PNG({ width: full.diff.width, height: full.diff.height }), { data: Buffer.from(full.diff.data) })));
          results[view] = { before, stepped, reference: refState, full: { pass: full.pass, passingTiles: full.passingTiles, globalMean: full.globalMean, noiseGlobalMean: full.noiseGlobalMean }, stream: stream && { pass: stream.pass, passingTiles: stream.passingTiles, globalMean: stream.globalMean, noiseGlobalMean: stream.noiseGlobalMean },
            control: { meaning: 'grass 1 (before the step) against grass .75: the difference the gate must be able to see', pass: control.pass, passingTiles: control.passingTiles, globalMean: control.globalMean } };
          if (view === 'eye-height') assert(control.globalMean > 10 * Math.max(full.globalMean, 1e-6), `grass control: the grass step is visible to the metric (${control.passingTiles}/144 tiles, mean ${control.globalMean})`);
          assert(full.pass, `${view}: ${full.passingTiles}/144 tiles, global mean ${full.globalMean}`); if (stream) assert(stream.pass, `stream crop: ${stream.passingTiles}/144, mean ${stream.globalMean}`);
        } finally { await test.close(); }
      }
      return { ...results, pixelRatio: 'Z4: DYNAMIC_DPR_SUPPORTED is false and the ladder has no pixel-ratio step, so the governor path changes grass only; the pixel ratio is asserted unchanged' };
    });
    await step('no browser errors or warnings', async () => { const bad = badDiagnostics(diagnostics); assert.deepEqual(bad, []); return { messages: diagnostics.length }; });
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); }
  finally {
    const cleanup: string[] = [];
    try { await browser?.close(); ledger.browserClosed = true; } catch (error) { cleanup.push('browser: ' + String(error)); }
    try { await hosted?.close(); ledger.serverClosed = true; } catch (error) { cleanup.push('server: ' + String(error)); }
    ledger.cleanupErrors = cleanup;
    report.status = !report.error && steps.length > 0 && steps.every(s => s.status === 'pass') ? 'pass' : 'fail';
    await save(); if (cleanup.length) throw new AggregateError(cleanup, 'Owned resources did not all close');
  }
  return { out, pass: report.status === 'pass' };
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (key: string, fallback?: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
  const label = value('--label'), backend = value('--backend', 'both')!;
  assert(label && /^[a-z0-9][a-z0-9._-]*$/.test(label), 'Usage: bun scripts/run-farm-tiering.ts --label <name> [--backend both|webgpu|webgl2] [--root packages/farm/dist/test] [--out evidence/<milestone>/tiering/<name>] (default evidence/m3/tiering/<label>; the backend is appended)');
  let pass = true;
  for (const b of (backend === 'both' ? ['webgpu', 'webgl2'] : [backend]) as Backend[]) {
    const result = await runFarmTiering({ label, backend: b, root: value('--root'), out: value('--out') }); console.log(`B-10/B-13 ${b}: ${result.pass ? 'PASS' : 'FAIL'} (${result.out})`); pass &&= result.pass;
  }
  if (!pass) process.exitCode = 1;
}
