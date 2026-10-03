import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { sceneBrowserOptions } from '../../scenes/scripts/browser-options.mjs';
import { installTimingEvidence } from '../../scenes/scripts/timing-evidence.ts';
import { chromeExecutable } from './build-site-media.mjs';
import { assertControlBackend, assertPanelObservation, assertPositionMotion, movingFreightKinds, freightScanPlan, visibleFreightKinds, assertFreightScanCamera } from './scene-controls-proof.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(done => setTimeout(done, ms));

/** Read-only observer using Three's existing DevTools event and Fiber's mounted root.
 * Public scene test hooks are deliberately absent. Never invoke scene controllers here.
 * The snapshot retains only the live root's camera, named farmer and visible freight buffers.
 */
export function installControlObserver(scope = globalThis) {
  const scenes = new Set();
  const devtools = scope.__THREE_DEVTOOLS__ ?? new scope.EventTarget();
  scope.__THREE_DEVTOOLS__ = devtools;
  devtools.addEventListener('observe', event => { if (event.detail?.isScene && scenes.size < 64) scenes.add(event.detail); });
  scope.__siteControlSnapshot = () => {
    const states = [...scenes].map(scene => scene.__r3f?.root?.getState()).filter(state => state?.scene?.isScene && state.gl?.domElement?.isConnected && state.gl.domElement.closest('.ks-root'));
    const unique = [...new Set(states)];
    if (unique.length !== 1) throw Error(`Expected one mounted Fiber root, observed ${unique.length}`);
    const state = unique[0], root = state.gl.domElement.closest('.ks-root');
    const at = (subject, object) => object ? { subject, position: [object.matrixWorld.elements[12], object.matrixWorld.elements[13], object.matrixWorld.elements[14]] } : null;
    const freight = [];
    state.scene.traverse(object => {
      if (!/^traffic-(truck-tractor|trailer-(dryvan|flatbed|tanker))-lod\d$/.test(object.name) || !object.visible) return;
      const geometry = object.geometry, values = geometry?.attributes?.iA?.array, count = geometry?.instanceCount;
      if (!values || !Number.isFinite(count) || count < 1) return;
      const positions = [];
      for (let index = 0; index < Math.min(count, 64); index++) positions.push(Array.from(values.slice(index * 4, index * 4 + 4)));
      freight.push({ name: object.name, positions });
    });
    const backend = root.getAttribute('data-kiln-backend');
    let glRenderer = null;
    if (backend === 'webgl2') {
      const context = state.gl.backend?.gl ?? state.gl.getContext?.();
      const extension = context?.getExtension('WEBGL_debug_renderer_info');
      if (extension) glRenderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    }
    return { backend, glRenderer, gpu: backend === 'webgpu' ? scope.__timingEvidence?.gpu() : null,
      camera: { ...at('camera', state.camera), fov: state.camera.fov, forward: [8, 9, 10].map(index => -state.camera.matrixWorld.elements[index]) },
      canvas: { width: state.gl.domElement.clientWidth, height: state.gl.domElement.clientHeight },
      farmer: at('farmer-yard-0', state.scene.getObjectByName('farmer-yard-0')), freight,
      canvases: root.querySelectorAll('canvas').length, visibility: scope.document.visibilityState };
  };
}

export async function main(argv = process.argv.slice(2)) {
  const [base, destination, expected, sceneFilter = 'all', backendFilter = 'both'] = argv;
  assert.ok(base && destination && /^[a-f0-9]{64}$/.test(expected ?? '') && argv.length <= 5,
    'Usage: node scripts/verify-scene-controls.mjs <site-url> <report-directory> <artifact-sha256> [all|farm|golden-gate|foundry-floor] [both|webgpu|webgl2]');
  assert.ok(['all', 'farm', 'golden-gate', 'foundry-floor'].includes(sceneFilter));
  assert.ok(['both', 'webgpu', 'webgl2'].includes(backendFilter));
  const options = sceneBrowserOptions();
  assert.equal(options.headless, false, 'Set KILN_SCENE_HEADED=1; this gate is a headed desktop touch-emulation check');
  const output = resolve(destination); await mkdir(output, { recursive: true });
  const report = { schema: 'kiln.site-live-controls/1', artifactSha256: expected, startedAt: new Date().toISOString(),
    scope: 'Actual public HUDs and real desktop-emulated touch; no physical-device, performance, owner appearance, collision completeness or freight joint-alignment acceptance.',
    browserOptions: options, verifierSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    dependencies: {}, selected: { sceneFilter, backendFilter }, scenarios: [], errors: [], complete: false };
  for (const path of ['./scene-controls-proof.mjs', '../../scenes/scripts/timing-evidence.ts']) report.dependencies[path] = hash(await readFile(new URL(path, import.meta.url)));
  async function pin() {
    assert.equal(hash(await readFile(join(site, 'dist/artifact-files.json'))), expected, 'Local artifact changed');
    const response = await fetch(new URL('/_review/receipt.json', base)); assert.equal(response.status, 200);
    assert.equal((await response.json()).productionArtifactSha256, expected, 'Served review artifact differs');
  }
  await pin();
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: false, pipe: true, args: ['--no-sandbox', ...options.args] });
  report.browser = await browser.version();
  try {
    const scenes = sceneFilter === 'all' ? ['golden-gate', 'foundry-floor', 'farm'] : [sceneFilter];
    const backends = backendFilter === 'both' ? ['webgpu', 'webgl2'] : [backendFilter];
    for (const backend of backends) for (const scene of scenes) {
      await pin();
      const result = { scene, backend, checks: [], observations: {}, complete: false }; report.scenarios.push(result);
      const page = await browser.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror', error => report.errors.push({ scene, backend, message: error.message }));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      if (backend === 'webgpu') await page.evaluateOnNewDocument(installTimingEvidence);
      else await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
      await page.evaluateOnNewDocument(installControlObserver);
      try {
        await page.goto(new URL(`/scenes/${scene}/`, base).href, { waitUntil: 'networkidle0' });
        await page.bringToFront();
        await page.$eval('scene-shell', element => element.scrollIntoView({ block: 'start' }));
        await page.tap('[data-explore]');
        await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('scene-shell')?.dataset.sceneState), { timeout: 240000 });
        assert.equal(await page.$eval('scene-shell', element => element.dataset.sceneState), 'ready');
        const iframe = await page.$('[data-mount] iframe');
        const frame = iframe ? await iframe.contentFrame() : page.mainFrame(); assert.ok(frame);
        await frame.waitForSelector('.ks-root canvas');
        const snapshot = () => frame.evaluate(() => window.__siteControlSnapshot());
        const record = (name, detail) => { result.checks.push({ name, pass: true, detail }); console.log(`ok ${backend}/${scene}: ${name}`); };
        await sleep(2000);
        result.observations.initial = await snapshot();
        assertControlBackend(backend, result.observations.initial, true);
        assert.equal(result.observations.initial.canvases, 1);
        assert.equal(result.observations.initial.visibility, 'visible');
        record('Actual headed renderer and single visible scene canvas', result.observations.initial.backend);
        async function findButton(label) {
          for (const handle of await frame.$$('button')) {
            if (await handle.evaluate((element, name) => !element.disabled && element.checkVisibility() && (element.getAttribute('aria-label') ?? element.textContent).replace(/\s+/g, ' ').trim() === name, label)) return handle;
            await handle.dispose();
          }
          return null;
        }
        async function tap(label, menu = 'More') {
          let handle = await findButton(label);
          if (!handle) { const trigger = await findButton(menu); assert.ok(trigger, `Missing ${menu} menu for ${label}`); await trigger.tap(); await trigger.dispose(); }
          await frame.waitForFunction(name => [...document.querySelectorAll('button')].some(element => !element.disabled && element.checkVisibility() && (element.getAttribute('aria-label') ?? element.textContent).replace(/\s+/g, ' ').trim() === name), {}, label);
          handle ??= await findButton(label); assert.ok(handle, `Missing ${label}`); await handle.tap(); await handle.dispose();
        }
        const cdp = await page.createCDPSession();
        async function gesture(selector, dx, dy, held = 700, extraSelector = null) {
          const element = await frame.$(selector); assert.ok(element, `Missing ${selector}`);
          const bounds = await element.boundingBox(); assert.ok(bounds, `Invisible ${selector}`);
          const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
          const points = [start];
          if (extraSelector) { const extra = await frame.$(extraSelector); const box = await extra?.boundingBox(); assert.ok(box); points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 }); }
          try {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
            for (let step = 1; step <= 6; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + dx * step / 6, y: start.y + dy * step / 6 }, ...points.slice(1)] }); await sleep(35); }
            await sleep(held);
          } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await element.dispose(); }
        }
        async function closeAutoHelp() { if (await frame.$('.ks-help')) await tap('Close controls'); }
        async function panels() {
          await tap('Controls'); await frame.waitForSelector('.ks-help');
          await tap('Credits'); await frame.waitForSelector('.ks-credits');
          const before = await snapshot();
          const scrollBefore = await frame.$eval('.ks-credits', element => element.scrollTop);
          await gesture('.ks-credits', 0, -90, 100);
          const observation = await frame.$eval('.ks-credits', (element, scrollBefore) => {
            const rect = element.getBoundingClientRect(), root = element.closest('.ks-root').getBoundingClientRect();
            const box = value => ({ left: value.left, top: value.top, right: value.right, bottom: value.bottom });
            return { rect: box(rect), root: box(root), hitWithin: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollBefore, scrollAfter: element.scrollTop };
          }, scrollBefore);
          result.observations.panels = { observation, before, after: await snapshot() };
          assertPanelObservation(observation);
          assert.ok(await frame.$('.ks-help'), 'Opening credits must preserve the underlying help panel');
          const after = result.observations.panels.after;
          assert.ok(Math.hypot(...before.camera.position.map((value, index) => after.camera.position[index] - value)) < 0.03, 'Panel touch leaked into camera movement');
          const close = await frame.$('.ks-credits button'); await close.focus(); await page.keyboard.press('Escape');
          await frame.waitForSelector('.ks-credits', { hidden: true });
          assert.ok(await frame.$('.ks-help'), 'Escape should dismiss the focused credits panel only');
          const focus = await frame.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), within: Boolean(document.activeElement?.closest('.ks-toolbar')), visible: document.activeElement?.checkVisibility() }));
          result.observations.panels.focusAfterDismissal = focus;
          assert.ok(focus.within && focus.visible, 'Panel dismissal must restore focus to a visible toolbar control');
          await tap('Close controls');
          record('Help and credits stack, scroll by touch, block camera gestures and restore focus', { ...observation, focus });
        }
        async function joystick(subject) {
          const attempts = [];
          for (const [dx, dy] of [[0, -42], [42, 0], [0, 42], [-42, 0]]) {
            const before = (await snapshot())[subject]; await gesture('.ks-joystick', dx, dy, 1000); const after = (await snapshot())[subject];
            attempts.push({ dx, dy, before, after });
            try { const metres = assertPositionMotion(before, after); record('Nested touch joystick moves the actual subject', { subject, metres, attempts }); return; } catch (error) { if (attempts.length === 4) throw error; }
          }
        }
        async function freightScan() {
          const evidence = { scope: 'Public orbit gestures locate visible tractor/trailer buffers before testing motion; no individual identity, occlusion or coupling-alignment claim.', motionControls: [], gestures: [], scan: [], movement: [] };
          result.observations.freight = evidence;
          const rendered = () => frame.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          async function closeMenus() {
            for (const trigger of await frame.$$('.ks-menu[data-open]>.ks-menu-trigger')) { await trigger.tap(); await trigger.dispose(); }
          }
          async function motion(paused) {
            const labels = () => frame.evaluate(() => [...document.querySelectorAll('button')]
              .filter(button => ['Pause motion', 'Resume motion'].includes(button.textContent.trim()))
              .map(button => ({ label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed'), visible: button.checkVisibility() })));
            const before = await labels(); assert.equal(before.length, 1, 'Expected one public motion control');
            const expected = paused ? 'Resume motion' : 'Pause motion';
            if (before[0].label !== expected) await tap(before[0].label);
            await rendered();
            const after = await labels(); evidence.motionControls.push({ requestedPaused: paused, before, after });
            assert.equal(after.length, 1); assert.equal(after[0].label, expected); assert.equal(after[0].pressed, String(paused));
            await closeMenus();
          }
          async function dragCanvas(dx, button, dy = 0) {
            const canvas = await frame.$('.ks-root canvas'); assert.ok(canvas);
            try {
              const bounds = await canvas.boundingBox(); assert.ok(bounds && bounds.width > 80 && bounds.height > 80);
              assert.ok(Math.abs(dy) < bounds.height / 4, 'Vertical freight gesture exceeds its bound');
              const segments = Math.ceil(Math.abs(dx) / (bounds.width - 64)), delta = dx / segments, deltaY = dy / segments;
              for (let index = 0; index < segments; index++) {
                const x = bounds.x + bounds.width / 2 - delta / 2, y = bounds.y + bounds.height * 0.55 - deltaY / 2;
                const hit = await canvas.evaluate((element, delta, deltaY) => {
                  const rect = element.getBoundingClientRect();
                  return document.elementFromPoint(rect.x + rect.width / 2 - delta / 2, rect.y + rect.height * 0.55 - deltaY / 2) === element;
                }, delta, deltaY);
                assert.ok(hit, 'Freight gesture starts behind another element');
                const gesture = { type: 'mouse-drag', button, dx: delta, dy: deltaY, start: { x, y }, canvasBounds: bounds, before: await snapshot() };
                evidence.gestures.push(gesture);
                await page.mouse.move(x, y); await page.mouse.down({ button });
                try { await page.mouse.move(x + delta, y + deltaY, { steps: 8 }); }
                finally { await page.mouse.up({ button }); }
                await rendered(); gesture.after = await snapshot();
              }
            } finally { await canvas.dispose(); }
          }
          await motion(true);
          await tap('The split', 'View'); await closeMenus(); await rendered();
          const initial = await snapshot(); evidence.initial = initial;
          const plan = freightScanPlan(initial.canvas, initial.camera); evidence.plan = plan;
          await dragCanvas(plan.rotatePixels, 'left', plan.rotateYPixels);
          await dragCanvas(plan.panWestPixels, 'right');
          const canvas = await frame.$('.ks-root canvas'); assert.ok(canvas);
          try {
            const bounds = await canvas.boundingBox(); assert.ok(bounds);
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.55);
            const gesture = { type: 'mouse-wheel', deltaY: plan.wheelDelta, canvasBounds: bounds, before: await snapshot() };
            evidence.gestures.push(gesture);
            await page.mouse.wheel({ deltaY: plan.wheelDelta }); await rendered(); gesture.after = await snapshot();
          } finally { await canvas.dispose(); }
          let located = false;
          for (let step = 0; step < plan.maxPositions; step++) {
            const observed = await snapshot(); evidence.scan.push({ step, observed });
            assertFreightScanCamera(observed.camera, plan, step);
            if (visibleFreightKinds(observed.freight).length === 2) { located = true; break; }
            if (step + 1 < plan.maxPositions) await dragCanvas(plan.scanPanPixels, 'right');
          }
          assert.ok(located, `No visible tractor and trailer after ${plan.maxPositions} public camera positions`);
          await motion(false);
          const moved = new Set(); let previous = await snapshot(); evidence.movement.push(previous);
          for (let attempt = 0; attempt < 15 && moved.size < 2; attempt++) {
            await sleep(1000); const next = await snapshot(); evidence.movement.push(next);
            // Camera movement must not stand in for resumed traffic movement.
            assert.ok(Math.hypot(...next.camera.position.map((value, index) => value - previous.camera.position[index])) < 0.03, 'Camera moved during freight motion observation');
            for (const kind of movingFreightKinds(previous.freight, next.freight)) moved.add(kind);
            previous = next;
          }
          evidence.movedKinds = [...moved].sort(); assert.deepEqual(evidence.movedKinds, ['tractor', 'trailer']);
          record('Public camera scan finds ambient tractor and trailer buffers, and Resume motion advances both', 'Visible buffer motion only; no individual coupling/alignment claim');
        }
        if (scene === 'farm') {
          await tap('Walk the farm'); await frame.waitForSelector('.farm-play-touch .ks-joystick'); await closeAutoHelp(); await sleep(600);
          await joystick('farmer'); await tap('Back to overview'); await frame.waitForSelector('.farm-overview-touch');
          record('Farm returns from play to overview');
        } else {
          await panels();
          if (scene === 'foundry-floor') {
            await freightScan();
            await tap('Enter the fab'); await frame.waitForSelector('.ff-hud');
            await frame.waitForFunction(() => !document.querySelector('.fc-exit')?.disabled);
            assert.match(await frame.$eval('.fc-interior-location', element => element.textContent), /South-west building.*Level 1.*Cutaway/);
            assertControlBackend(backend, await snapshot(), true);
            await tap('Walk', 'View'); await frame.waitForSelector('.ff-camera-walk .ks-joystick'); await closeAutoHelp(); await sleep(600);
            await joystick('camera');
            await tap('Stop walking'); await frame.waitForSelector('.ff-camera-orbit');
            await tap('Exit to campus'); await frame.waitForSelector('.fc-hud');
            record('Registered cutaway entry, walking and return to campus');
          }
          await tap('Drive the sedan'); await frame.waitForSelector('.ks-joystick'); await closeAutoHelp(); await sleep(700);
          const before = (await snapshot()).camera;
          if (scene === 'foundry-floor') await gesture('.ks-joystick', 20, 0, 1800, '.ks-touch-button[aria-label="Throttle"]');
          else await gesture('.ks-joystick', 8, -44, 1800);
          const after = (await snapshot()).camera;
          const speed = await frame.$eval(scene === 'golden-gate' ? '.gg-speed' : '.fc-speed', element => element.textContent);
          assert.ok(Number.parseFloat(speed) > 0, `Drive did not accelerate: ${speed}`);
          const metres = assertPositionMotion(before, after);
          record('Drive touch input accelerates the sedan and advances its follow camera', { before, after, speed, metres, simultaneousSteeringAndThrottle: scene === 'foundry-floor' });
          await tap('Leave the car'); await frame.waitForSelector('.ks-joystick', { hidden: true });
          record('Leave car returns to orbit controls');
        }
        await page.screenshot({ path: join(output, `${backend}-${scene}.png`) });
        await page.tap('[data-exit]'); await page.waitForFunction(() => document.querySelector('scene-shell')?.dataset.sceneState === 'idle');
        assert.equal(await page.$eval('[data-explore]', element => element === document.activeElement), true);
        record('Scene exit disposes the mount and restores Explore focus');
        await pin(); result.complete = true;
      } catch (error) { result.error = error.stack ?? String(error); throw error; }
      finally { await page.close(); }
    }
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors)); report.complete = true;
  } catch (error) { report.failure = error.stack ?? String(error); throw error; }
  finally { await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'controls.json'), JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Live control gate passed ${report.scenarios.length} selected scene/backend scenarios. Desktop touch emulation only.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
