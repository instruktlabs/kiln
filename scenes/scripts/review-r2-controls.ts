import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Page } from 'puppeteer-core';
import { launchHeadless, serveOwned } from '../packages/golden-gate/tests/tools/owned';
const out = resolve('../engine-work/local-v09-review/revision2-golden-farm/controls');
await mkdir(out, { recursive: true });
const chrome = await launchHeadless('gg-farm-r2-controls', 1280, 900), results: unknown[] = [];
const usedPorts = new Set<number>();
const frames = (page: Page, n = 12) => page.evaluate((n: number) => (window as any).__kilnScene.waitFrames(n), n);
const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((name: string, args: unknown[]) => (window as any).__kilnScene.invoke(name, ...args), name, args);
async function ready(page: Page) {
  await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return !!(window as any).__kilnScene && (h?.readyCount > 0 || h?.errors?.length); }, { timeout: 180000 });
  assert.deepEqual(await page.evaluate(() => (window as any).__kilnHarness.snapshot().errors), []); await frames(page);
}
async function button(page: Page, label: string, touch = false) {
  const h = await page.evaluateHandle((label: string) => [...document.querySelectorAll<HTMLButtonElement>('.ks-root button')].find(b => b.textContent?.trim() === label), label);
  const element = h.asElement(); assert(element, label);
  if (touch) { const b = await element.boundingBox(); assert(b); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); }
  else await element.click(); await h.dispose();
}
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
async function candidate(directory: string) {
  const files = ['index.html', 'assets/pack.json', ...(await readdir(resolve(directory, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(name => 'assets/' + name)];
  return Promise.all(files.map(async path => { const bytes = await readFile(resolve(directory, path)); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }));
}
try {
  for (const backend of ['webgpu', 'webgl2']) for (const scene of ['golden-gate', 'farm']) {
    const directory = resolve(`packages/${scene}/dist/review-r2/test`);
    const server = await serveOwned(directory, usedPorts); usedPorts.add(server.port);
    try {
      const page = await chrome.browser.newPage(), errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(server.url + '/?tier=balanced' + (backend === 'webgl2' ? '&backend=webgl2' : ''), { waitUntil: 'load' });
      await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h?.readyCount > 0 || h?.errors?.length; }, { timeout: 180000 });
      assert.deepEqual(await page.evaluate(() => (window as any).__kilnHarness.snapshot().errors), []); await frames(page);
      const record: any = { scene, backend, candidate: await candidate(directory), errors }; results.push(record);
      await page.screenshot({ path: resolve(out, `${scene}-${backend}-opening.png`) });
      if (scene === 'golden-gate') {
        record.opening = await invoke(page, 'ggStats');
        assert(record.opening.camera.position[1] > 700);
        record.waterUnderEye = await invoke(page, 'heightAt', 1800, -240);
        record.layouts = [];
        for (const [width, height] of [[1280, 900], [1920, 1080], [844, 390], [360, 760]]) {
          await page.setViewport({ width, height, deviceScaleFactor: 1 }); await frames(page);
          const overlaps = await page.evaluate(() => {
            const controls = [...document.querySelectorAll<HTMLElement>('.gg-camera button, .gg-top .ks-toolbar button')];
            return controls.flatMap((a, i) => controls.slice(i + 1).flatMap(b => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.left < y.right - .1 && x.right > y.left + .1 && x.top < y.bottom - .1 && x.bottom > y.top + .1 ? [[a.textContent, b.textContent]] : []; }));
          });
          assert.deepEqual(overlaps, [], `${width}x${height} controls overlap`); record.layouts.push({ width, height, overlaps });
        }
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
        await button(page, 'Drive the sedan'); await frames(page); if (await page.$('.ks-help')) await button(page, 'Close controls');
        await page.$eval('.ks-root', element => (element as HTMLElement).focus());
        await page.keyboard.down('w'); await page.keyboard.down('Shift'); await frames(page, 60);
        record.keyboardBoost = await invoke(page, 'driveState'); assert.equal(record.keyboardBoost.input.boost, 1); assert(record.keyboardBoost.speed > 0);
        await page.keyboard.up('Shift'); await page.keyboard.up('w'); await page.keyboard.press('Escape'); await frames(page);
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); await ready(page);
        await button(page, 'Drive the sedan', true); await frames(page);
        const joystick = await page.$('.ks-joystick'), boost = await page.$('button[aria-label="Boost"]'), brake = await page.$('button[aria-label="Brake"]');
        assert(joystick && boost && brake); const j = await joystick.boundingBox(), b = await boost.boundingBox(), r = await brake.boundingBox(); assert(j && b && r);
        const client = await page.createCDPSession(); const finger = { x: j.x + j.width / 2 + 20, y: j.y + j.height / 2 - 50, id: 1 };
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger, { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }] }); await frames(page, 60);
        record.touchBoost = await invoke(page, 'driveState'); assert.equal(record.touchBoost.input.boost, 1); assert(record.touchBoost.input.throttle > .5); assert(record.touchBoost.input.steer > .1);
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await frames(page);
        record.touchReleased = await invoke(page, 'driveState'); assert.equal(record.touchReleased.input.boost, 0); assert.equal(record.touchReleased.input.throttle, 0);
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 3 }] }); await frames(page, 60);
        record.touchBrake = await invoke(page, 'driveState'); assert.equal(record.touchBrake.input.brake, 1); assert(record.touchBrake.speed < record.touchReleased.speed);
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.screenshot({ path: resolve(out, `${scene}-${backend}-mobile-drive.png`) }); await client.detach();
      } else {
        await button(page, 'Walk the farm'); await page.waitForFunction(() => !!document.pointerLockElement, { timeout: 10000 }); await frames(page);
        const before = await invoke(page, 'simState'); record.firstPerson = before;
        await page.screenshot({ path: resolve(out, `${scene}-${backend}-first-person.png`) });
        assert(Math.abs(before.camera.position[1] - before.player.position[1] - 1.72) < .001); assert.equal(before.player.visible, false);
        await page.mouse.move(700, 450); await frames(page);
        const turned = await invoke(page, 'simState'); assert(distance(before.camera.quaternion, turned.camera.quaternion) > .001);
        await page.mouse.down({ button: 'right' }); await page.mouse.move(780, 530, { steps: 10 }); await page.mouse.up({ button: 'right' }); await frames(page);
        record.rightDrag = await invoke(page, 'simState'); assert(distance(before.camera.position, record.rightDrag.camera.position) < .01);
        await page.mouse.wheel({ deltaY: -300 }); await frames(page); record.wheel = await invoke(page, 'simState');
        assert(distance(record.rightDrag.camera.position, record.wheel.camera.position) < .01); assert.equal(record.wheel.camera.fov, before.camera.fov);
        await page.keyboard.down('w'); await frames(page, 45); await page.keyboard.up('w'); record.walked = await invoke(page, 'simState');
        assert(distance(record.walked.player.position, before.player.position) > .1);
        await page.screenshot({ path: resolve(out, `${scene}-${backend}-walking.png`) });
        await invoke(page, 'reviewWalkingPose', true); await page.keyboard.down('w'); await frames(page, 24);
        await page.screenshot({ path: resolve(out, `${scene}-${backend}-walking-pose.png`) });
        await page.keyboard.up('w'); await invoke(page, 'reviewWalkingPose', false);
        await page.evaluate(() => document.exitPointerLock()); await frames(page); assert.equal((await invoke(page, 'simState')).active, false);
        await button(page, 'Walk the farm'); await frames(page); await invoke(page, 'teleport', 'tractor'); await frames(page); await page.keyboard.press('e'); await frames(page);
        record.tractor = await invoke(page, 'simState'); assert(record.tractor.driving); assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
        const canvas = await page.$('canvas'), rect = await canvas!.boundingBox(); assert(rect); await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .5);
        await page.mouse.wheel({ deltaY: -300 }); await frames(page); record.tractorZoom = await invoke(page, 'simState');
        assert(distance(record.tractor.camera.position, record.tractorZoom.camera.position) > .05);
        await button(page, 'Back to overview'); await frames(page);
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); await ready(page);
        await button(page, 'Walk the farm', true); await frames(page); assert(await page.$('.ks-joystick'));
        await invoke(page, 'teleport', 'bridge'); await frames(page);
        record.mobile = await invoke(page, 'simState'); assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
        const joystick = await page.$('.ks-joystick'), j = await joystick!.boundingBox(); assert(j);
        const client = await page.createCDPSession(), finger = { x: j.x + j.width / 2, y: j.y + j.height / 2 - 50, id: 1 };
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger, { x: 260, y: 400, id: 2 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger, { x: 290, y: 385, id: 2 }] }); await frames(page, 45);
        record.mobileMoved = await invoke(page, 'simState');
        assert(distance(record.mobile.player.position, record.mobileMoved.player.position) > .1);
        assert(distance(record.mobile.camera.quaternion, record.mobileMoved.camera.quaternion) > .001);
        assert(Math.abs(record.mobileMoved.camera.position[1] - record.mobileMoved.player.position[1] - 1.72) < .001);
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await client.detach();
        await page.screenshot({ path: resolve(out, `${scene}-${backend}-mobile-walk.png`) });
        await page.$eval('.ks-root', element => (element as HTMLElement).focus());
        const shellEscapes = await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes);
        await page.keyboard.press('Escape'); await frames(page); assert.equal((await invoke(page, 'simState')).active, false);
        assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), shellEscapes);
        await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), shellEscapes + 1);
      }
      assert.deepEqual(errors, []); record.passed = true; await page.close();
    } finally { await server.close(); }
  }
} finally { await chrome.close(); await writeFile(resolve(out, 'controls.json'), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results.map((v: any) => ({ scene: v.scene, backend: v.backend, ok: true }))));
