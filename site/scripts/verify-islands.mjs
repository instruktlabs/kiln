import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { sceneBrowserOptions } from '../../scenes/scripts/browser-options.mjs';

const base = process.argv[2];
const review = process.argv[3];
if (!base || !review) throw new Error('Usage: node scripts/verify-islands.mjs <site-url> <review-directory>');
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const widths = [390, 768, 1280, 1440, 1920];
const farm = JSON.parse(await readFile(new URL('../src/data/packs/farm.json', import.meta.url), 'utf8'));
const farmhouse = farm.assets.find((asset) => asset.id === 'farmhouse');
assert.ok(farmhouse, 'The selected Farm delivery must contain farmhouse.');
const results = { browser: '', pages: [], behaviors: [], errors: [] };
const launch = sceneBrowserOptions();
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: launch.headless, pipe: true, args: ['--no-sandbox', ...launch.args] });
results.browserLaunch = launch;
results.browser = await browser.version();
const page = await browser.newPage();
page.on('pageerror', (error) => results.errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') results.errors.push(message.text()); });
try {
  for (const [slug, route] of [['scenes', '/scenes/'], ['scene-farm', '/scenes/farm/'], ['scene-foundry-floor', '/scenes/foundry-floor/']]) {
    await mkdir(join(review, 'screenshots', slug), { recursive: true });
    await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
    for (const width of widths) {
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(review, 'screenshots', slug, `${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${route} horizontal overflow at ${width}`);
    }
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.evaluate(axe);
      const violations = await page.evaluate(async () => (await window.axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })));
      results.pages.push({ route, width, violations });
    }
  }
  await page.setViewport({ width: 1440, height: 1000 });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(new URL('/scenes/farm/', base).href, { waitUntil: 'networkidle0' });
  assert.equal(requests.some((url) => /(?:\/(?:mount|RoomEnvironment|AssetViewerRuntime)[.-][\w-]+\.js|\/scene-packs\/|three\.module)/.test(url)), false);
  results.behaviors.push('Farm pre-Explore loads no React/Three scene module and no scene pack file.');
  await page.click('[data-explore]');
  // The island is ready when the scene reports its first complete frame (or, in a build without
  // the scene package, when the stand-in mounts). Either way the shell says so in data-scene-state.
  await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('scene-shell')?.dataset.sceneState), { timeout: 120000 });
  results.sceneStartup = await page.$eval('scene-shell', (element) => ({ state: element.dataset.sceneState, error: element.dataset.sceneError ?? null, backend: element.dataset.sceneBackend ?? null, status: element.querySelector('[data-status]')?.textContent }));
  assert.equal(results.sceneStartup.state, 'ready', `The Farm island must reach its ready state: ${JSON.stringify(results.sceneStartup)}`);
  assert.equal(await page.$eval('[data-exit]', (element) => element === document.activeElement), true);
  assert.equal(await page.$eval('body > header', (element) => element.inert), true);
  await mkdir(join(review, 'screenshots/scene-open'), { recursive: true });
  for (const width of widths) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.screenshot({ path: join(review, 'screenshots/scene-open', `${width}.png`) });
  }
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.evaluate(axe);
    results.pages.push({ route: '/scenes/farm/ (Explore)', width, violations: await page.evaluate(async () => (await window.axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length }))) });
  }
  if (await page.$eval('[data-fullscreen]', (element) => !element.hidden)) {
    await page.click('[data-fullscreen]');
    assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
    await page.click('[data-fullscreen]');
    results.behaviors.push('Farm fullscreen enters and leaves.');
  }
  await page.click('[data-exit]');
  assert.equal(await page.$eval('[data-mount]', (element) => element.childElementCount), 0);
  assert.equal(await page.$eval('[data-explore]', (element) => element === document.activeElement), true);
  assert.equal(await page.$eval('body > header', (element) => element.inert), false);
  results.behaviors.push('Explore mounts the Farm island and waits for its ready state, focuses Exit, covers the window and hides the background from focus; Exit unmounts, restores background and focuses Explore.');

  const brokenScene = await browser.newPage();
  await brokenScene.setRequestInterception(true);
  let failImport = true;
  brokenScene.on('request', (request) => {
    // The Farm's code is the staged runtime chunk (scripts/scene-runtime.mjs); interrupt that request.
    if (failImport && /^\/scene-runtime\/farm\/.+\.js$/.test(new URL(request.url()).pathname)) void request.abort();
    else void request.continue();
  });
  await brokenScene.goto(new URL('/scenes/farm/', base).href, { waitUntil: 'networkidle0' });
  await brokenScene.click('[data-explore]');
  await brokenScene.waitForFunction(() => document.querySelector('[data-status]')?.textContent.includes('could not load'));
  assert.equal(await brokenScene.$eval('[data-explore]', (element) => element === document.activeElement), true);
  failImport = false;
  results.behaviors.push('An interrupted scene-module request returns a visible error and restores Explore focus.');
  await brokenScene.close();

  await page.goto(new URL('/gallery/archive/robot-arm/', base).href, { waitUntil: 'networkidle0' });
  await page.click('[data-open]');
  await page.waitForSelector('[data-mount] canvas', { timeout: 20000 });
  // The animation clip select; the tone mapping select is another control of the same view and is checked by verify-viewer-tone.mjs.
  const clips = '[data-mount] select:not([data-tone-mapping])';
  await page.waitForFunction((selector) => document.querySelector(selector)?.options.length > 1, { timeout: 20000 }, clips);
  assert.equal(await page.$eval(clips, (select) => select.value), '-1');
  await page.select(clips, '0');
  await mkdir(join(review, 'screenshots/viewer-open'), { recursive: true });
  for (const width of widths) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.$eval('asset-viewer', (element) => element.scrollIntoView());
    await page.screenshot({ path: join(review, 'screenshots/viewer-open', `${width}.png`) });
  }
  results.behaviors.push('Robot-arm GLB loads, starts in its rest pose, exposes recorded clips and plays a selected clip.');
  await page.click('[data-close]');
  assert.equal(await page.$eval('[data-mount]', (element) => element.childElementCount), 0);
  results.behaviors.push('Closing the viewer unmounts the renderer.');

  await page.goto(new URL('/gallery/farmhouse/', base).href, { waitUntil: 'networkidle0' });
  const farmhouseResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === farmhouse.modelPath && url.searchParams.get('revision') === farmhouse.revisionId;
  }, { timeout: 20000 });
  await page.click('[data-open]');
  const receivedModel = await farmhouseResponse;
  const modelBytes = await receivedModel.buffer();
  const glbSha256 = createHash('sha256').update(modelBytes).digest('hex');
  assert.equal(glbSha256, farmhouse.runtimeDownload.sha256, 'The browser must receive the exact selected runtime GLB.');
  assert.equal(modelBytes.toString('utf8', 0, 4), 'glTF');
  const gltf = JSON.parse(modelBytes.toString('utf8', 20, 20 + modelBytes.readUInt32LE(12)));
  const meshNodes = gltf.nodes.filter((node) => node.mesh !== undefined);
  assert.equal(meshNodes.length, farmhouse.metrics.meshes);
  const interiorFloor = meshNodes.some((node) => node.name === 'Mesh_InteriorFloor');
  if (farm.floorRevision?.ownerAcceptance?.revisionId === farmhouse.revisionId) assert.equal(interiorFloor, true, 'The accepted wood-floor revision must include its actual floor mesh.');
  results.loadedFarmhouse = { revisionId: farmhouse.revisionId, modelUrl: receivedModel.url(), glbSha256, meshes: meshNodes.length, interiorFloor };
  results.behaviors.push('The viewer requests the revision-qualified URL and receives bytes and mesh count matching the selected sealed Farm delivery.');
  await page.waitForSelector('[data-mount] canvas', { timeout: 20000 });
  await page.waitForNetworkIdle({ idleTime: 750 });
  await mkdir(join(review, 'screenshots/viewer-farmhouse'), { recursive: true });
  for (const width of widths) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.$eval('asset-viewer', (element) => element.scrollIntoView());
    await page.screenshot({ path: join(review, 'screenshots/viewer-farmhouse', `${width}.png`) });
  }
  await page.setViewport({ width: 390, height: 1000, deviceScaleFactor: 1 });
  const closeBeforeCanvas = await page.evaluate(() => document.querySelector('[data-close]').getBoundingClientRect().top < document.querySelector('[data-mount] canvas').getBoundingClientRect().top);
  assert.equal(closeBeforeCanvas, true);
  results.behaviors.push('Farmhouse GLB loads with the shared neutral-tone viewer; Close remains before the canvas on mobile.');
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.evaluate(axe);
    results.pages.push({ route: '/gallery/farmhouse/ (3D open)', width, violations: await page.evaluate(async () => (await window.axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length }))) });
  }
  await page.click('[data-close]');

  // A failed first GLB request must not poison later opens: drei caches the rejected load by URL until the viewer's
  // error path clears it (engineering review, finding 5). Fail the first request, then let the retry through.
  const retry = await browser.newPage();
  await retry.setRequestInterception(true);
  let failModel = true;
  let modelRequests = 0;
  retry.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === farmhouse.modelPath) {
      modelRequests += 1;
      if (failModel) {
        failModel = false;
        void request.abort();
        return;
      }
    }
    void request.continue();
  });
  await retry.goto(new URL('/gallery/farmhouse/', base).href, { waitUntil: 'networkidle0' });
  await retry.click('[data-open]');
  await retry.waitForFunction(() => document.querySelector('[data-status]')?.textContent.includes('try again'), { timeout: 20000 });
  assert.equal(await retry.$eval('[data-open]', (element) => !element.hidden && element === document.activeElement), true);
  assert.equal(modelRequests, 1);
  await retry.click('[data-open]');
  await retry.waitForSelector('[data-mount] canvas', { timeout: 20000 });
  await retry.waitForNetworkIdle({ idleTime: 750 });
  assert.equal(modelRequests, 2, 'The second open must request the GLB again.');
  assert.equal(await retry.$eval('[data-status]', (element) => element.textContent.includes('Drag to orbit')), true);
  results.retry = { modelRequests, status: await retry.$eval('[data-status]', (element) => element.textContent.trim()) };
  results.behaviors.push('A failed first GLB request shows the retry copy and restores Open; the second open requests the GLB again and loads it.');
  await retry.close();

  const fallback = await browser.newPage();
  await fallback.evaluateOnNewDocument(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      return kind === 'webgl2' || kind === 'webgl' ? null : original.call(this, kind, ...args);
    };
  });
  await fallback.goto(new URL('/gallery/archive/robot-arm/', base).href, { waitUntil: 'networkidle0' });
  await fallback.click('[data-open]');
  await fallback.waitForFunction(() => document.querySelector('[data-status]')?.textContent.includes('cannot draw'));
  assert.equal(await fallback.$eval('[data-poster]', (element) => element.hidden), false);
  assert.equal(await fallback.$eval('[data-open]', (element) => element === document.activeElement), true);
  results.behaviors.push('Forced no-WebGL leaves the poster, source and downloads usable with a visible error.');
  await fallback.close();
  assert.equal(results.errors.length, 0);
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, 'viewer-scene-checks.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
