import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

const [base, screenshot = '.tmp/farm-island.png'] = process.argv.slice(2);
if (!base) throw new Error('Usage: node scripts/verify-farm-island.mjs <site-url> [screenshot.png]');
const route = new URL('/scenes/farm/', base).href;
const shell = 'farm-scene-shell';
const report = { browser: '', route, console: [], pageErrors: [], failedRequests: [], badResponses: [], phases: [], checks: [] };
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
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => {
    if (/\.js(?:$|\?)/.test(response.url())) scripts.push(Number(response.headers()['content-length'] ?? 0));
  });
  await page.goto(route, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('meta[name="robots"]', (meta) => meta.content), 'noindex, nofollow');
  check('The page carries robots noindex, nofollow.');
  assert.equal(requests.some((url) => url.includes('/scene-packs/')), false);
  assert.ok(scripts.length > 0 && Math.max(...scripts) < 100_000, 'No large script may load before Explore.');
  check('Before Explore the page requests no pack file and no script over 100 kB (no React, Three or scene chunk).');
  for (let round = 1; round <= 2; round++) {
    await page.click('[data-explore]');
    await page.waitForFunction((tag) => ['loading', 'ready', 'error'].includes(document.querySelector(tag)?.dataset.sceneState), {}, shell);
    assert.equal(await page.$eval('[data-exit]', (element) => element === document.activeElement), true);
    assert.equal(await page.$eval('body > header', (element) => element.inert), true);
    await settled(page);
    const result = await state(page);
    report.phases.push({ round, ...result });
    assert.equal(result.state, 'ready', `The Farm scene must reach its ready state; it ended in ${result.state} (${result.error ?? 'no error code'}).`);
    assert.notEqual(result.phase, null, 'The scene must report progress to the shell.');
    const scene = await page.evaluate(() => {
      const root = document.querySelector('.ks-root');
      const canvas = root?.querySelector('canvas');
      return { backend: root?.getAttribute('data-kiln-backend') ?? null, canvas: canvas ? [canvas.width, canvas.height] : null, region: root?.getAttribute('role') ?? null };
    });
    Object.assign(report.phases.at(-1), scene);
    assert.ok(scene.canvas && scene.canvas[0] > 0 && scene.canvas[1] > 0, 'The scene canvas must have a size.');
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
  report.packRequests = requests.filter((url) => url.includes('/scene-packs/farm/r34/')).map((url) => new URL(url).pathname.replace('/scene-packs/farm/r34/', ''));
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
  fallbackBackend.backend = await webgl2.$eval('.ks-root', (root) => root.getAttribute('data-kiln-backend'));
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
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--strict')) {
  assert.equal(report.exploreConsole.unexpected.length + report.pageErrors.filter((entry) => entry.scenario === 'explore').length, 0, 'The Explore scenario logged unexpected console errors, warnings or page errors.');
}
await writeFile(resolve(dirname(resolve(screenshot)), 'farm-island-report.json'), `${JSON.stringify(report, null, 2)}\n`);
