// Local v0.9 owner-review controls, tested in the actual standalone runtime on both backends.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { outputFor } from './build';
import { launchHeadless, PACKAGE_ROOT, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned';

const server = await serveOwned(outputFor('test')), chrome = await launchHeadless('gg-local-review', 1280, 900);
const results: unknown[] = [];
const frames = (page: Page, n = 12) => page.evaluate(n => (window as any).__kilnScene.waitFrames(n), n);
const state = (page: Page) => page.evaluate(() => ({ motion: (window as any).__kilnScene.invoke('motionState'), traffic: (window as any).__kilnScene.invoke('trafficSample', 8), camera: (window as any).__kilnScene.invoke('ggStats').camera }));
async function click(page: Page, text: string) {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent?.trim() === text), text);
  const button = handle.asElement(); assert(button, `Button ${text} exists`); await button.click(); await handle.dispose();
}
async function ready(page: Page) {
  await page.waitForFunction(() => ['ready','error'].includes(document.querySelector<HTMLElement>('#page-status')?.dataset.state ?? ''), { timeout: 180_000 });
  assert.equal(await page.$eval('#page-status', e => (e as HTMLElement).dataset.state), 'ready', await page.$eval('#page-status', e => e.textContent));
}
try {
  for (const backend of ['webgpu', 'webgl2']) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', message => messages.push({ kind: 'console', type: message.type(), text: message.text() }));
    page.on('pageerror', error => messages.push({ kind: 'pageerror', text: String(error) }));
    await page.goto(`${server.url}/?backend=${backend}&tier=balanced`, { waitUntil: 'load', timeout: 120_000 });
    await ready(page); await frames(page);
    await click(page, 'Pause motion'); await frames(page, 2); const paused = await state(page); await frames(page, 20);
    assert.equal(paused.motion.paused, true); assert.deepEqual(await state(page), paused, 'ambient motion stays still while paused');
    await click(page, 'Resume motion'); await frames(page, 12); assert((await state(page)).motion.time > paused.motion.time);

    await click(page, 'Flyovers'); await page.click('.gg-flights button'); await frames(page, 6);
    await click(page, 'Pause motion'); await frames(page, 2); const flight = await state(page); await frames(page, 15);
    assert.equal(flight.camera.mode, 'flight'); assert.deepEqual(await state(page), flight, 'paused flight keeps its pose');
    await click(page, 'Resume motion'); await frames(page, 6); assert.notDeepEqual((await state(page)).camera.position, flight.camera.position);
    await page.focus('.ks-root'); const escapes = await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes);
    await page.keyboard.press('Escape'); await frames(page, 2);
    assert.equal((await state(page)).camera.mode, 'orbit');
    assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escapes, 'stopping a flight consumes Escape');

    for (const [button, panel] of [['Controls','.ks-help'], ['Credits','.ks-credits'], ['Flyovers','.gg-flights']]) {
      await click(page, button!); assert(await page.$(panel!)); await page.keyboard.press('Escape');
      await page.waitForSelector(panel!, { hidden: true });
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), button, 'panel restores focus');
      assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escapes, 'panel Escape stays in scene');
    }
    await page.focus('.ks-root'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escapes + 1, 'unhandled Escape reaches host');

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluate(() => (window as any).__kilnHarness.mount({ backend: (document.querySelector('.ks-root') as HTMLElement).dataset.kilnBackend, quality: 'balanced' }));
    await ready(page); await frames(page, 2); const reduced = await state(page); await frames(page, 15);
    assert.equal(reduced.motion.paused, true); assert.deepEqual(await state(page), reduced, 'reduced motion freezes ambient animation');
    await click(page, 'Resume motion'); await frames(page, 6); assert((await state(page)).motion.time > reduced.motion.time);

    await page.evaluate(() => {
      (document.querySelector('#golden-gate') as HTMLElement).style.transform = 'translateY(200vh)';
      (window as any).__kilnHarness.mount({ quality: 'balanced' });
    });
    await ready(page);
    await page.waitForFunction(() => (window as any).__kilnScene.motionPolicy().paused === true);
    await page.evaluate(() => { (document.querySelector('#golden-gate') as HTMLElement).style.transform = ''; });
    await page.waitForFunction(() => (window as any).__kilnScene.motionPolicy().paused === false);
    assert.deepEqual(unexpectedMessages(messages), [], 'browser is quiet');
    results.push({ backend, ok: true, checks: ['pause/resume ambient','pause/resume flight','Escape hierarchy and focus','reduced motion','offscreen initial ready'], messages });
    console.log(`${backend}: PASS`); await page.close();
  }
} catch (error) { results.push({ ok: false, error: String(error) }); throw error; }
finally {
  writeJson(resolve(PACKAGE_ROOT, 'evidence/local-review/controls.json'), { results });
  await chrome.close(); await server.close();
}
