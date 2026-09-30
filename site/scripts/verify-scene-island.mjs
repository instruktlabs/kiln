import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const [base, sceneId = 'farm', screenshot = `.tmp/${sceneId}-island.png`] = positional;
if (!base) throw new Error('Usage: node scripts/verify-scene-island.mjs <site-url> [farm|golden-gate] [screenshot.png] [--strict]');
/** Per scene: its page, its staged pack, and how its runtime is loaded (module in the page, or a frame). */
const SCENES = {
  farm: { name: 'Farm', route: '/scenes/farm/', pack: '/scene-packs/farm/', runtime: '/scene-runtime/farm/', frame: false },
  'golden-gate': { name: 'Golden Gate', route: '/scenes/golden-gate/', pack: '/scene-packs/golden-gate/', runtime: '/scene-runtime/golden-gate/', frame: true },
};
const scene = SCENES[sceneId];
if (!scene) throw new Error(`Unknown scene ${sceneId}; use one of ${Object.keys(SCENES).join(', ')}`);
const route = new URL(scene.route, base).href;
const shell = 'scene-shell';
const report = { browser: '', scene: sceneId, route, console: [], pageErrors: [], failedRequests: [], badResponses: [], phases: [], checks: [] };
/** The scene's own root inside the page, or inside its frame. */
const sceneRoot = (page) => page.evaluate((frame) => {
  const doc = frame ? document.querySelector('[data-mount] iframe')?.contentDocument : document;
  const root = doc?.querySelector('.ks-root');
  const canvas = root?.querySelector('canvas');
  return { backend: root?.getAttribute('data-kiln-backend') ?? null, canvas: canvas ? [canvas.width, canvas.height] : null, region: root?.getAttribute('role') ?? null };
}, scene.frame);
const check = (message) => report.checks.push(message);
// @react-three/fiber 9.8.1 constructs THREE.Clock, which three 0.186 marks deprecated. The
// gallery viewers on this site log the same line, so it is expected here and still reported.
const KNOWN_WARNINGS = [/^THREE\.Clock: This module has been deprecated/];

// Headless only, with an explicit window size. No frame or load timings are recorded.
const browser = await puppeteer.launch({
  executablePath: chromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--window-size=1440,900', ...(process.env.KILN_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
report.browser = await browser.version();

/** Console output, page errors and failed requests from one page, tagged by scenario. */
function observe(page, scenario) {
  page.on('console', (message) => report.console.push({ scenario, type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => report.pageErrors.push({ scenario, message: error.message }));
  page.on('requestfailed', (request) => report.failedRequests.push({ scenario, url: request.url(), reason: request.failure()?.errorText }));
  page.on('response', (response) => { if (response.status() >= 400) report.badResponses.push({ scenario, url: response.url(), status: response.status() }); });
}
const state = (page) => page.$eval(shell, (element) => ({
  state: element.dataset.sceneState,
  phase: element.dataset.scenePhase ?? null,
  error: element.dataset.sceneError ?? null,
  loading: element.querySelector('[data-loading]').textContent,
  status: element.querySelector('[data-status]').textContent,
}));
const settled = (page) => page.waitForFunction((tag) => ['ready', 'error'].includes(document.querySelector(tag)?.dataset.sceneState), { timeout: 120_000 }, shell);

try {
  // Explore, wait for the scene's own ready state, look at it, then leave and explore again.
  const page = await browser.newPage();
  observe(page, 'explore');
  const requests = [];
  const scripts = [];
  const served = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => {
    if (/\.js(?:$|\?)/.test(response.url())) scripts.push(Number(response.headers()['content-length'] ?? 0));
    if (response.url().includes(scene.runtime)) served.push(response);
  });
  await page.goto(route, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('meta[name="robots"]', (meta) => meta.content), 'noindex, nofollow');
  check('The page carries robots noindex, nofollow.');
  assert.equal(requests.some((url) => url.includes('/scene-packs/') || url.includes('/scene-runtime/')), false);
  assert.ok(scripts.length > 0 && Math.max(...scripts) < 100_000, 'No large script may load before Explore.');
  check('Before Explore the page requests no pack file, no scene runtime and no script over 100 kB (no React, Three or scene chunk).');
  for (let round = 1; round <= 2; round++) {
    await page.click('[data-explore]');
    await page.waitForFunction((tag) => ['loading', 'ready', 'error'].includes(document.querySelector(tag)?.dataset.sceneState), {}, shell);
    assert.equal(await page.$eval('[data-exit]', (element) => element === document.activeElement), true);
    assert.equal(await page.$eval('body > header', (element) => element.inert), true);
    await settled(page);
    const result = await state(page);
    report.phases.push({ round, ...result });
    assert.equal(result.state, 'ready', `The ${scene.name} scene must reach its ready state; it ended in ${result.state} (${result.error ?? 'no error code'}).`);
    assert.notEqual(result.phase, null, 'The scene must report progress to the shell.');
    const inside = await sceneRoot(page);
    Object.assign(report.phases.at(-1), inside, { tier: await page.$eval(shell, (element) => element.dataset.sceneTier ?? null), reportedBackend: await page.$eval(shell, (element) => element.dataset.sceneBackend ?? null) });
    if (!scene.frame) assert.ok(inside.canvas && inside.canvas[0] > 0 && inside.canvas[1] > 0, 'The scene canvas must have a size.');
    if (round === 1 && !scene.frame) {
      // One three copy: the runtime's own REVISION is the revision three announced globally, and the
      // module the shell imported is the one served (the served bytes are the measured, staged file).
      const runtimeUrl = await page.$eval(shell, (element) => element.dataset.runtimeUrl);
      const identity = await page.evaluate(async (url) => {
        const runtime = await import(/* @vite-ignore */ url);
        return { runtimeRevision: runtime.REVISION, announced: globalThis.__THREE__ };
      }, runtimeUrl);
      report.three = identity;
      assert.equal(identity.runtimeRevision, identity.announced, 'The runtime and the page must share one three revision.');
      const runtimeResponse = served.find((response) => response.url().endsWith('.js'));
      assert.ok(runtimeResponse, 'The scene runtime must be served.');
      report.runtimeServed = { url: new URL(runtimeResponse.url()).pathname, bytes: (await runtimeResponse.buffer()).length };
      check(`One three copy: the runtime's REVISION (${identity.runtimeRevision}) is the revision three announced (${identity.announced}).`);
    }
    if (round === 1) {
      await mkdir(dirname(resolve(screenshot)), { recursive: true });
      await page.screenshot({ path: resolve(screenshot) });
      if (await page.$eval('[data-fullscreen]', (element) => !element.hidden)) {
        await page.click('[data-fullscreen]');
        assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
        await page.click('[data-fullscreen]');
        assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
        check('Fullscreen enters and leaves while the scene runs.');
      }
    }
    await page.click('[data-exit]');
    assert.equal(await page.$eval('[data-mount]', (element) => element.childElementCount), 0);
    assert.equal(await page.$eval('[data-explore]', (element) => element === document.activeElement), true);
    assert.equal(await page.$eval('body > header', (element) => element.inert), false);
    assert.equal((await state(page)).state, 'idle');
  }
  check('Explore reaches the scene ready state, Exit unmounts and restores focus, and a second Explore reaches it again.');
  report.packRequests = requests.filter((url) => url.includes(scene.pack)).map((url) => new URL(url).pathname);
  report.runtimeRequests = requests.filter((url) => url.includes(scene.runtime)).map((url) => new URL(url).pathname);
  await page.close();

  // A pack that cannot be fetched must end in the shell's error surface, and the error text's
  // own advice (try Explore again) must work once the pack can be fetched.
  const broken = await browser.newPage();
  observe(broken, 'pack-unavailable');
  let blockPack = true;
  await broken.setRequestInterception(true);
  broken.on('request', (request) => (blockPack && /\/scene-packs\/.*pack\.json/.test(request.url()) ? void request.abort() : void request.continue()));
  await broken.goto(route, { waitUntil: 'networkidle0' });
  await broken.click('[data-explore]');
  await settled(broken);
  const unavailable = await state(broken);
  assert.equal(unavailable.state, 'error');
  assert.match(unavailable.status, /could not load/);
  assert.equal(await broken.$eval('[data-explore]', (element) => element === document.activeElement), true);
  report.packUnavailable = unavailable;
  check('An unavailable pack shows the visible error and restores Explore focus.');
  blockPack = false;
  await broken.click('[data-explore]');
  await broken.waitForFunction((tag) => document.querySelector(tag).dataset.sceneState !== 'error', {}, shell);
  await settled(broken);
  const recovered = await state(broken);
  assert.equal(recovered.state, 'ready', `Explore after a failed load must recover; it ended in ${recovered.state} (${recovered.error ?? 'no error code'}).`);
  assert.equal(recovered.error, null);
  report.recoveredAfterPackFailure = recovered;
  check('Explore again after an unavailable pack recovers to the ready state.');
  await broken.close();

  // A mount that throws inside React is caught by the island's boundary and reaches the same surface.
  const throwing = await browser.newPage();
  observe(throwing, 'mount-throws');
  await throwing.evaluateOnNewDocument(() => {
    window.ResizeObserver = undefined;
  });
  await throwing.goto(route, { waitUntil: 'networkidle0' });
  await throwing.click('[data-explore]');
  await settled(throwing);
  const thrown = await state(throwing);
  assert.equal(thrown.state, 'error');
  assert.match(thrown.status, /could not load/);
  assert.equal(await throwing.$eval('[data-explore]', (element) => element === document.activeElement), true);
  report.mountThrows = thrown;
  check('A mount that throws shows the visible error and restores Explore focus.');
  await throwing.close();

  // No WebGPU but WebGL2: the scene runs on its WebGL2 backend.
  const webgl2 = await browser.newPage();
  observe(webgl2, 'webgl2-only');
  await webgl2.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  await webgl2.goto(route, { waitUntil: 'networkidle0' });
  await webgl2.click('[data-explore]');
  await settled(webgl2);
  const fallbackBackend = await state(webgl2);
  assert.equal(fallbackBackend.state, 'ready', `Without WebGPU the scene must still run; it ended in ${fallbackBackend.state} (${fallbackBackend.error ?? 'no error code'}).`);
  fallbackBackend.backend = (await sceneRoot(webgl2)).backend;
  assert.equal(fallbackBackend.backend, 'webgl2');
  report.webgl2Only = fallbackBackend;
  check('Without WebGPU the scene falls back to its WebGL2 backend and reaches the ready state.');
  await webgl2.close();

  // No graphics API at all: the scene must fail into the same surface, not throw at the page.
  const noGraphics = await browser.newPage();
  observe(noGraphics, 'no-graphics');
  await noGraphics.evaluateOnNewDocument(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(kind, ...args) {
      return ['webgl', 'webgl2', 'experimental-webgl', 'webgpu'].includes(kind) ? null : original.call(this, kind, ...args);
    };
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  });
  await noGraphics.goto(route, { waitUntil: 'networkidle0' });
  await noGraphics.click('[data-explore]');
  await settled(noGraphics);
  const withoutGraphics = await state(noGraphics);
  assert.equal(withoutGraphics.state, 'error');
  assert.match(withoutGraphics.status, /could not load/);
  assert.equal(await noGraphics.$eval('[data-explore]', (element) => element === document.activeElement), true);
  report.noGraphics = withoutGraphics;
  check('Without WebGL or WebGPU the scene fails into the visible error and restores Explore focus.');
  await noGraphics.close();
} finally {
  await browser.close();
}
// Puppeteer reports console warnings as "warn". A known upstream line is listed, never hidden.
const flagged = report.console.filter((entry) => entry.scenario === 'explore' && ['error', 'warn', 'warning'].includes(entry.type));
const isKnown = (entry) => KNOWN_WARNINGS.some((pattern) => pattern.test(entry.text));
report.exploreConsole = { known: flagged.filter(isKnown), unexpected: flagged.filter((entry) => !isKnown(entry)) };
report.multipleInstances = report.console.filter((entry) => /Multiple instances of Three\.js/i.test(entry.text));
console.log(JSON.stringify(report, null, 2));
assert.equal(report.multipleInstances.length, 0, 'three logged its Multiple instances warning: the page loaded two copies.');
if (process.argv.includes('--strict')) {
  assert.equal(report.exploreConsole.unexpected.length + report.pageErrors.filter((entry) => entry.scenario === 'explore').length, 0, 'The Explore scenario logged unexpected console errors, warnings or page errors.');
}
await writeFile(resolve(dirname(resolve(screenshot)), `${sceneId}-island-report.json`), `${JSON.stringify(report, null, 2)}\n`);
