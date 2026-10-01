// FF1 captures (TASK-FF1 "Evidence"): the landing view and a 600x frame at 1280x720 on WebGPU and on the WebGL2
// fallback, headless with an explicit --window-size, from the dist/test build served on an owned port (4700-4749).
// The kit clock is frozen (`freeze=1`), so the twin holds at its stored day-30 warm start until a hook steps it:
//   landing          the opening page: megafab mode, 1x, day 30 00:00, the gallery view;
//   landing-600x     the same view at 600x after one sim hour (moving vehicles drawn as pulses);
//   overview-600x    the overview orbit at the same instant.
// Each backend records the kit's program and pipeline counts, draw calls and triangles, the first-frame and ready
// times (indicative: this PC is shared, so the record carries a load sample), the twin's state and hash, and any
// unexpected console message. A fresh page repeats the landing shot to check it reproduces.
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/capture.ts [--backends=webgpu,webgl2]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { loadSample } from '../../scripts/load-sample.ts';
import { createFab, FAB_DATA } from '../../src/sim/index.ts';

type Backend = 'webgpu' | 'webgl2';
const WIDTH = 1280, HEIGHT = 720;
const backends = (process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/ff1');
mkdirSync(outDir, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rel = (path: string) => relative(PACKAGE_ROOT, path).replace(/\\/g, '/');

// The same twin run headless under Bun: the browser's hashes must equal these on both backends.
const headless = (() => {
  const fab = createFab({ snapshot: readFileSync(resolve(PACKAGE_ROOT, `data/warm/seed-${FAB_DATA.config.seeds.default}.json`), 'utf8'), mode: 'megafab' });
  fab.step(fab.now());
  const landing = fab.hash();
  fab.step(fab.now() + 3_600_000);
  return { landing, plusOneHour: fab.hash(), simMs: fab.now() };
})();
const loadBefore = await loadSample();
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('ff-capture', WIDTH, HEIGHT);
const records: Record<string, unknown>[] = [];
try {
  const openPage = async (backend: Backend, viewport?: import('puppeteer-core').Viewport) => {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    // A mobile or touch viewport reloads the page when it changes, so it is set before navigation.
    if (viewport) await page.setViewport(viewport);
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    await page.evaluateOnNewDocument(() => { (window as any).__kilnMeasureRequested = true; });
    const params = `capture=1&freeze=1&tier=high${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
    const url = `${hosted.url}/?${params}`; assertOwnedUrl(url, owned);
    const started = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    // Polled every animation frame: the page-relative time (ms since navigation start) when the harness first reports ready.
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); const done = h && (h.readyCount > 0 || h.errors.length > 0); if (done) (window as any).__ffReadyAt ??= performance.now(); return done; }, { timeout: 180_000, polling: 'raf' });
    const wallReadyMs = Date.now() - started, pageReadyMs = await page.evaluate(() => (window as any).__ffReadyAt as number);
    const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
    if (!snapshot.readyCount) throw new Error(`${backend}: ${JSON.stringify(snapshot.errors)}`);
    await page.evaluate(() => (window as any).__kilnScene.waitFrames(12));
    return { page, messages, params, snapshot, wallReadyMs, pageReadyMs };
  };
  const shoot = async (page: import('puppeteer-core').Page, file: string) => {
    const bytes = Buffer.from(await page.screenshot({ type: 'png' }));
    mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, bytes);
    return { file: rel(file), sha256: sha(bytes), bytes: bytes.length };
  };
  const state = (page: import('puppeteer-core').Page) => page.evaluate(() => (window as any).__kilnScene.invoke('ffState'));
  const stats = (page: import('puppeteer-core').Page) => page.evaluate(() => { const s = (window as any).__kilnScene.stats(); return { programs: s.programs, pipelines: s.pipelines, render: s.render, readyMs: s.readyMs, cpuRenderMedianMs: s.cpuRenderMedianMs, longTasks: s.longTasks }; });

  for (const backend of backends) {
    const { page, messages, params, snapshot, wallReadyMs, pageReadyMs } = await openPage(backend);
    try {
      const landingState = await state(page), landingStats = await stats(page);
      const landing = await shoot(page, resolve(outDir, backend, 'landing.png'));
      await page.evaluate(() => (window as any).__kilnScene.invoke('ffSetScale', 600));
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(2));
      await page.evaluate(() => (window as any).__kilnScene.invoke('ffAdvance', 3_600_000));
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(6));
      const fastState = await state(page), fastStats = await stats(page);
      const fast = await shoot(page, resolve(outDir, backend, 'landing-600x.png'));
      await page.evaluate(() => (window as any).__kilnScene.invoke('ffSetView', 'overview'));
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(6));
      const overviewState = await state(page), overviewStats = await stats(page);
      const overview = await shoot(page, resolve(outDir, backend, 'overview-600x.png'));
      const unexpected = unexpectedMessages(messages);
      records.push({
        backend: snapshot.backend?.backend, requested: backend, fellBack: snapshot.backend?.fellBack, gpu: snapshot.backend?.adapter ?? null, url: `/?${params}`, viewport: [WIDTH, HEIGHT],
        timing: { indicative: true, firstRenderMs: Math.round(pageReadyMs), firstRenderNote: 'navigation start to the first rendered frame after the scene is built (the harness ready callback), polled per animation frame', wallReadyMs, kitReadyMs: landingStats.readyMs === null ? null : Math.round(landingStats.readyMs),
          progress: (snapshot.progress as { phase: string; at: number }[]).map(p => ({ phase: p.phase, at: Math.round(p.at) })) },
        shots: [
          { name: 'landing', ...landing, state: landingState, stats: landingStats },
          { name: 'landing-600x', ...fast, state: fastState, stats: fastStats },
          { name: 'overview-600x', ...overview, state: overviewState, stats: overviewStats },
        ],
        programs: Math.max(landingStats.programs, fastStats.programs, overviewStats.programs), pipelines: Math.max(landingStats.pipelines, fastStats.pipelines, overviewStats.pipelines),
        twin: { landingHash: landingState.hash, plusOneHourHash: fastState.hash, matchesHeadless: landingState.hash === headless.landing && fastState.hash === headless.plusOneHour },
        unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length,
      });
      console.log(JSON.stringify({ backend, actual: snapshot.backend?.backend, fellBack: snapshot.backend?.fellBack, firstRenderMs: Math.round(pageReadyMs), wallReadyMs, kitReadyMs: landingStats.readyMs, twin: [landingState.hash, fastState.hash, headless.landing, headless.plusOneHour], programs: landingStats.programs, pipelines: landingStats.pipelines, draws: landingStats.render?.drawCalls, overviewDraws: overviewStats.render?.drawCalls, unexpected: unexpected.length }));
    } finally { await page.close(); }
  }
  // Phone width (D-22 layout check, indicative): the landing view with the HUD at 390 x 844 CSS pixels, touch emulated.
  const phone = await (async () => {
    const opened = await openPage(backends[0] as Backend, { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    try {
      const layout = await opened.page.evaluate(() => {
        const box = (sel: string) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
        return { toolbar: box('.ff-top > .ks-toolbar'), status: box('.ff-status'), viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth };
      });
      return { ...(await shoot(opened.page, resolve(outDir, backends[0] as Backend, 'phone-landing.png'))), layout };
    } finally { await opened.page.close(); }
  })();
  console.log(JSON.stringify({ phone }));
  // The HUD's own buttons (not the hooks): About opens in one tap, Pilot line removes the synthetic traffic, Overview
  // moves the camera, Pause stops sim time (the kit clock runs here, unlike the frozen shots above).
  const controls = await (async () => {
    const opened = await openPage(backends[0] as Backend);
    const { page } = opened;
    try {
      const click = async (label: string) => {
        const handle = await page.evaluateHandle((text: string) => [...document.querySelectorAll('.ff-hud button')].find(b => b.textContent === text) ?? null, label);
        const element = handle.asElement() as import('puppeteer-core').ElementHandle<Element> | null;
        if (!element) throw new Error(`No HUD button ${label}`);
        await element.click();
        await page.evaluate(() => (window as any).__kilnScene.waitFrames(4));
      };
      await click('About this model');
      const about = await page.evaluate(() => { const panel = document.querySelector('#ff-about'); return panel ? { headings: [...panel.querySelectorAll('h3')].map(h => h.textContent), height: Math.round(panel.getBoundingClientRect().height) } : null; });
      const aboutShot = await shoot(page, resolve(outDir, backends[0] as Backend, 'about.png'));
      await click('Close About');
      await click('Pilot line');
      const pilot = await state(page);
      await click('Overview');
      const overview = await state(page);
      await page.evaluate(() => (window as any).__kilnScene.setTimeScale(1));
      await click('600x');
      const running0 = (await state(page)).simMs as number;
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(30));
      const running1 = (await state(page)).simMs as number;
      await click('Pause');
      const paused0 = (await state(page)).simMs as number;
      await page.evaluate(() => (window as any).__kilnScene.waitFrames(30));
      const paused1 = (await state(page)).simMs as number;
      return {
        about: { opened: about !== null, ...about, ...aboutShot },
        pilot: { mode: pilot.mode, synthetic: pilot.synthetic, vehicles: pilot.proxy.vehicles + pilot.proxy.pulses },
        overview: { view: overview.view, camera: overview.camera },
        at600x: { simAdvancedMs: running1 - running0 }, paused: { simAdvancedMs: paused1 - paused0 },
        unexpectedCount: unexpectedMessages(opened.messages).length,
      };
    } finally { await page.close(); }
  })();
  console.log(JSON.stringify({ controls: { ...controls, about: { opened: controls.about.opened, headings: controls.about.headings } } }));
  // Reproducibility: the landing shot again from a fresh page on the first backend.
  const again = await openPage(backends[0] as Backend);
  let reproducibility: Record<string, unknown>;
  try {
    const repeat = await shoot(again.page, resolve(outDir, backends[0] as Backend, 'landing-repeat.png'));
    const first = (records[0]?.shots as { sha256: string }[] | undefined)?.[0];
    reproducibility = { backend: backends[0], file: repeat.file, identical: first?.sha256 === repeat.sha256 };
  } finally { await again.page.close(); }
  // The public build (no test hooks, live clock): it must load and render on both backends without console errors.
  const publicHost = await serveOwned(outputFor('public'), owned); owned.add(publicHost.port);
  const publicRuns: Record<string, unknown>[] = [];
  try {
    for (const backend of backends) {
      const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
      page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
      page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
      page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
      try {
        // The public page reads no URL parameters, so WebGL2 is reached the way a visitor without WebGPU reaches it.
        if (backend === 'webgl2') await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'gpu', { get: () => undefined }); });
        const url = `${publicHost.url}/`; assertOwnedUrl(url, owned);
        await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
        await page.waitForFunction(() => { const t = document.querySelector('#page-status')?.textContent ?? 'x'; const done = t === '' || t.startsWith('Scene could not start'); if (done) (window as any).__ffReadyAt ??= performance.now(); return done; }, { timeout: 180_000, polling: 'raf' });
        const status = await page.evaluate(() => document.querySelector('#page-status')?.textContent ?? '');
        const readyMs = await page.evaluate(() => (window as any).__ffReadyAt as number);
        const backendAttr = await page.evaluate(() => document.querySelector('[data-kiln-backend]')?.getAttribute('data-kiln-backend') ?? null);
        await new Promise(accept => setTimeout(accept, 1500));
        const shot = await shoot(page, resolve(outDir, backend, 'public-landing.png'));
        const unexpected = unexpectedMessages(messages);
        publicRuns.push({ requested: backend, backend: backendAttr, status, firstRenderMs: Math.round(readyMs), ...shot, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
        console.log(JSON.stringify({ public: backend, backend: backendAttr, status, firstRenderMs: Math.round(readyMs), unexpected: unexpected.length }));
      } finally { await page.close(); }
    }
  } finally { await publicHost.close(); }
  const loadAfter = await loadSample();
  writeJson(resolve(outDir, 'captures.json'), {
    task: 'TASK-FF1 evidence: landing view and a 600x frame, WebGPU and WebGL2, headless 1280x720 with --window-size',
    captured: new Date().toISOString(), build: 'dist/test (development build with test hooks)', clock: 'kit clock frozen (freeze=1); the twin steps only through ffAdvance',
    load: { before: loadBefore, after: loadAfter, note: 'indicative only: this PC is shared with other builders and authors' },
    headlessTwin: { ...headless, note: 'the same restore, mode switch and one-hour step under Bun' },
    reproducibility, records, phone, controls, publicBuild: { build: 'dist/standalone (public)', runs: publicRuns },
  });
  console.log(JSON.stringify({ captures: rel(resolve(outDir, 'captures.json')), reproducibility }));
} finally { await chrome.close(); await hosted.close(); }
