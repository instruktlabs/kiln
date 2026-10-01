// Runtime controls and deferred interior loading on the exact FF3 candidate, with both graphics backends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { ff3OutputFor } from './build-ff3';
import { launchHeadless, PACKAGE_ROOT, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned';
const revision2=process.argv.includes('--revision2');
const finalIntake=process.argv.includes('--final-intake');
assert(!finalIntake || revision2,'Final intake requires revision2');
const revisionEvidence=finalIntake?'evidence/revision2/final-intake':'evidence/revision2';
const server = await serveOwned(ff3OutputFor('test',revision2)), chrome = await launchHeadless('ff-local-review', 1280, 900);
const bundle = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, revision2?`${revisionEvidence}/build/bundle-test.json`:'evidence/build/ff3/bundle-test.json'), 'utf8')) as { chunks: { name: string; role: string }[] };
const interiorChunks = bundle.chunks.filter(c => c.role === 'interior').map(c => c.name);
const results: unknown[] = [];
const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((name, args) => (window as any).__kilnScene.invoke(name, ...args), name, args);
const frames = (page: Page, n = 12) => page.evaluate(n => (window as any).__kilnScene.waitFrames(n), n);
async function click(page: Page, text: string) {
  console.log(`control: ${text}`);
  await page.waitForFunction(text => [...document.querySelectorAll('.ks-hud button')].some(b => b.textContent?.trim() === text), {}, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b => b.textContent?.trim() === text), text);
  const button = handle.asElement(); assert(button, `Button ${text} exists`); await button.click(); await handle.dispose();
}
async function ready(page: Page) {
  await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector<HTMLElement>('#page-status')?.dataset.state ?? ''), { timeout: 180_000 });
  assert.equal(await page.$eval('#page-status', e => (e as HTMLElement).dataset.state), 'ready', await page.$eval('#page-status', e => e.textContent));
}
async function inside(page: Page) {
  await invoke(page, 'campusView', 'canopy');
  await page.waitForFunction(() => [...document.querySelectorAll('.ks-hud button')].some(b => b.textContent?.trim() === 'Enter the fab'));
  await click(page, 'Enter the fab');
  await page.waitForFunction(() => (window as any).__kilnScene.invoke('campusPlace').interiorReady === true, { timeout: 180_000 });
  await frames(page, 4);
}
try {
  for (const backend of ['webgpu', 'webgl2']) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [], requests: string[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text() }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e) }));
    page.on('request', r => requests.push(new URL(r.url()).pathname));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${server.url}/?backend=${backend}&tier=balanced`, { waitUntil: 'load', timeout: 120_000 }); await ready(page);
    assert.equal((await invoke(page, 'campusState')).paused, true);
    assert(interiorChunks.length > 0);
    assert(interiorChunks.every(name => !requests.some(url => url.endsWith(name))), 'interior code stays deferred until entry');
    const pausedTraffic = await invoke(page, 'driveTraffic', 8); await frames(page, 15);
    assert.deepEqual(await invoke(page, 'driveTraffic', 8), pausedTraffic, 'reduced motion freezes exterior traffic');
    await click(page, 'Resume motion'); await frames(page, 12);
    assert((await invoke(page, 'driveTraffic', 8)).time > pausedTraffic.time);
    await click(page, 'Pause motion');
    await inside(page);
    assert(interiorChunks.some(name => requests.some(url => url.endsWith(name))), 'entry fetches the interior chunk');
    const paused = await invoke(page, 'ffState'); assert.equal(paused.scale, 0); await frames(page, 15);
    assert.equal((await invoke(page, 'ffState')).simMs, paused.simMs, 'reduced motion freezes production');
    await click(page, '1x'); await frames(page, 12); assert((await invoke(page, 'ffState')).simMs > paused.simMs);
    await click(page, 'Pause'); await frames(page, 2); const held = await invoke(page, 'ffState'); await frames(page, 12);
    assert.equal((await invoke(page, 'ffState')).simMs, held.simMs);
    const escaped = await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes);
    await click(page, 'About this model');
    await page.waitForSelector('#ff-about');
    await page.focus('#ff-about button'); await page.keyboard.press('Escape'); await frames(page, 2);
    await page.waitForSelector('#ff-about', { hidden: true, timeout: 5000 });
    assert.equal(await page.$('#ff-about'), null, 'About consumes Escape and closes');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), 'ff-about', 'About restores its trigger focus');
    assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escaped, 'About consumes Escape before host');
    await click(page, 'Tour'); await frames(page, 3); await page.focus('.ks-root'); await page.keyboard.press('Escape'); await frames(page, 2);
    assert.equal((await invoke(page, 'ffCamera')).mode, 'orbit');
    assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escaped, 'tour consumes Escape');
    for (let step = 0; step < 100 && !(await invoke(page, 'ffFloor')).state.active?.carrying; step++) await invoke(page, 'ffAdvance', 10000);
    const floor = await invoke(page, 'ffFloor'); assert(floor.foup && floor.state.active?.carrying, 'a real production floor transfer is observable');
    await click(page, 'Follow floor transfer'); await frames(page, 2);
    assert.equal((await invoke(page, 'ffCamera')).mode, 'follow');
    await page.focus('.ks-root'); await page.keyboard.press('Escape'); await frames(page, 2);
    assert.equal((await invoke(page, 'ffCamera')).mode, 'orbit');
    assert.equal(await page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes), escaped, 'follow consumes Escape');
    await click(page, 'Exit to campus');
    await page.waitForFunction(() => { const s = (window as any).__kilnScene.invoke('campusPlace'); return s.place === 'exterior' && !s.moving; });
    await page.setViewport({ width: 320, height: 256, deviceScaleFactor: 1 });
    await page.evaluate(backend => { document.querySelector<HTMLElement>('#foundry-floor')!.style.marginTop = '2000px'; scrollTo(0, 0); (window as any).__kilnHarness.mount({ backend, quality: 'balanced' }); }, backend);
    await ready(page); assert.equal(await page.evaluate(() => scrollY), 0, 'offscreen small viewport reaches ready without scroll');
    assert.deepEqual(unexpectedMessages(messages), []);
    results.push({ backend, ok: true, floor, checks: ['deferred interior', 'pause/resume exterior and production', 'reduced motion', 'About/tour/follow Escape', 'production transfer', 'exit/reentry lifecycle', '320x256 offscreen ready'], messages });
    await page.close();
  }
  const noGpu = await chrome.browser.newPage();
  await noGpu.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => null }, configurable: true });
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await noGpu.goto(server.url, { waitUntil: 'load' });
  await noGpu.waitForFunction(() => document.querySelector<HTMLElement>('#page-status')?.dataset.state === 'error', { timeout: 30000 });
  assert.equal(await noGpu.$eval('#page-status', e => (e as HTMLElement).dataset.errorCode), 'renderer-init');
  results.push({ noGraphics: true, state: 'error', errorCode: 'renderer-init' }); await noGpu.close();
  writeJson(resolve(PACKAGE_ROOT, revision2?`${revisionEvidence}/contract/local-review.json`:'evidence/contract/ff3/local-review.json'), { ok: true, results });
  console.log(JSON.stringify({ ok: true, checks: results.length }));
} finally { await chrome.close(); await server.close(); }
