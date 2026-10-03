// Explicit DOM-only gate: root runs it before and after the source fix. No scene/GPU/timing work.
// From scenes: bun packages/scene-kit/tests/browser/run-input-handoff.ts new-label
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChrome, serveOwned } from '../../src/testing/node';
import { cleanupTimingResources } from '../../../../scripts/timing-evidence';
const workspace = resolve(import.meta.dir, '../../../..'), label = process.argv[2];
assert(/^[a-z0-9][a-z0-9-]*$/.test(label ?? ''), 'New output label required');
const out = resolve(workspace, '.tmp/alignment-motion', label); assert(!existsSync(out), 'Refusing to overwrite evidence'); mkdirSync(out);
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const report: any = { schema: 'kiln.input-handoff-dom/1', scope: 'Real React VirtualJoystick lifecycle and InputProvider binding; emulated pointers, no scene renderer/assets or physical-device claim.', sources: {}, results: [], errors: [] };
for (const file of ['../../src/input/core.ts', '../../src/input/index.tsx', './input-handoff-fixture.tsx', './run-input-handoff.ts']) report.sources[file] = hash(resolve(import.meta.dir, file));
const resources: { name: string; close(): Promise<void>; timeoutMs?: number }[] = [];
try {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'input-handoff-fixture.tsx')], outdir: out, target: 'browser', define: { 'process.env.NODE_ENV': '"production"' } }); assert(build.success, build.logs.join('\n'));
  writeFileSync(resolve(out, 'index.html'), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.ks-joystick{position:absolute;left:60px;top:80px;width:132px;height:132px;background:#789;touch-action:none}.ks-sr-only{display:none}</style><div id="fixture"></div><script type="module" src="./input-handoff-fixture.js"></script>');
  const hosted = await serveOwned(out); resources.unshift({ name: 'server', close: hosted.close, timeoutMs: 5000 });
  const browser = await launchChrome({ workspace, name: label, headless: true, windowSize: [800, 500] }); resources.unshift({ name: 'browser', close: () => browser.close(), timeoutMs: 10000 });
  const page = await browser.newPage(); resources.unshift({ name: 'page', close: () => page.close(), timeoutMs: 5000 });
  page.on('pageerror', error => report.errors.push(String(error))); await page.setViewport({ width: 800, height: 500, hasTouch: true });
  await page.goto(hosted.url); await page.waitForSelector('.ks-joystick');
  const cdp = await page.createCDPSession(); resources.unshift({ name: 'cdp', close: () => cdp.detach(), timeoutMs: 5000 });
  const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const state = () => page.evaluate(() => (window as any).__inputState());
  const focus = () => page.$eval('.ks-root', element => (element as HTMLElement).focus());
  async function mount(mode = 'switch') { await page.evaluate(mode => (window as any).__mountInput(mode), mode); await settle(); }
  let touchActive = false;
  async function down() {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 126, y: 146, id: 1 }] }); touchActive = true;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 158, y: 96, id: 1 }] }); await settle();
    const moving = await state(); assert(moving.move.x > 0 && moving.move.y > 0, 'Joystick acquired movement'); return moving;
  }
  const end = async (cancel = false) => { if (!touchActive) return; touchActive = false; await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); };
  const check = async (name: string, run: (row: any) => Promise<void>) => {
    const row: any = { name, pass: false }; report.results.push(row);
    try { await run(row); row.pass = true; }
    catch (error) { row.failure = error instanceof Error ? error.stack : String(error); }
    finally { await page.keyboard.up('w'); await page.keyboard.up('Shift'); await end(); await settle(); }
    console.log(`${row.pass ? 'pass' : 'FAIL'} ${name}`);
  };
  await check('idle joystick unmount preserves first keyboard movement', async row => {
    await mount(); await focus(); await page.keyboard.down('w'); await settle(); row.after = await state();
    assert.equal(row.after.joystick, false); assert.deepEqual(row.after.move, { x: 0, y: 1 });
  });
  await check('active joystick to keyboard unmount preserves newer key and release', async row => {
    await mount(); row.touch = await down(); await focus(); await page.keyboard.down('w'); await settle(); row.keyboard = await state();
    assert.equal(row.keyboard.joystick, false); assert.deepEqual(row.keyboard.move, { x: 0, y: 1 });
    await page.keyboard.down('Shift'); await settle(); row.shifted = await state(); assert.equal(row.shifted.run, true);
    await end(); await settle(); row.releasedTouch = await state(); assert.deepEqual(row.releasedTouch.move, { x: 0, y: 1 });
    await page.keyboard.up('w'); await page.keyboard.up('Shift'); await settle(); row.releasedKeys = await state(); assert.deepEqual(row.releasedKeys.move, { x: 0, y: 0 }); assert.equal(row.releasedKeys.run, false);
  });
  await check('old touch cancel cannot clear newer keyboard while joystick stays mounted', async row => {
    await mount('always'); row.touch = await down(); await focus(); await page.keyboard.down('w'); await settle(); row.keyboard = await state();
    await end(true); await settle(); row.canceled = await state(); assert.deepEqual(row.canceled.move, { x: 0, y: 1 });
  });
  for (const canceled of [false, true]) await check(`owned touch ${canceled ? 'cancel' : 'release'} stops movement`, async row => {
    await mount('always'); row.touch = await down(); await end(canceled); await settle(); row.after = await state(); assert.deepEqual(row.after.move, { x: 0, y: 0 }); assert.equal(row.after.run, false);
  });
  await check('unmount active joystick releases its own movement', async row => {
    await mount('always'); row.touch = await down(); await page.evaluate(() => (window as any).__hideStick()); await settle(); row.after = await state();
    assert.equal(row.after.joystick, false); assert.deepEqual(row.after.move, { x: 0, y: 0 });
  });
  for (const action of ['__disableInput', '__disposeInput']) await check(`${action} clears movement and later cancel stays inactive`, async row => {
    await mount('always'); row.touch = await down(); await page.evaluate(action => (window as any)[action](), action); await end(true); await settle(); row.after = await state();
    assert.equal(row.after.enabled, false); assert.deepEqual(row.after.move, { x: 0, y: 0 }); assert.equal(row.after.run, false);
  });
} catch (error) { report.failure = error instanceof Error ? error.stack : String(error); }
finally {
  report.cleanup = await cleanupTimingResources(resources);
  report.pass = !report.failure && report.errors.length === 0 && report.results.length === 8 && report.results.every((row: any) => row.pass) && report.cleanup.every((row: any) => row.ok);
  writeFileSync(resolve(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ out, pass: report.pass, results: report.results.map((row: any) => ({ name: row.name, pass: row.pass })), failure: report.failure, errors: report.errors, cleanup: report.cleanup }));
  if (!report.pass) process.exitCode = 1;
}
