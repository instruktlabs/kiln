import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchHeadless, serveOwned } from '../packages/golden-gate/tests/tools/owned';
const out = resolve('../engine-work/local-v09-review/revision2-golden-farm/before');
await mkdir(out, { recursive: true });
const chrome = await launchHeadless('gg-farm-r2-before', 1280, 900), results: unknown[] = [];
const frames = (page: any, n = 12) => page.evaluate((n: number) => (window as any).__kilnScene.waitFrames(n), n);
const invoke = (page: any, name: string) => page.evaluate((name: string) => { const api = (window as any).__kilnScene; return api.invoke ? api.invoke(name) : api[name](); }, name);
async function button(page: any, label: string) {
  const h = await page.evaluateHandle((label: string) => [...document.querySelectorAll<HTMLButtonElement>('.ks-root button')].find(b => b.textContent?.trim() === label), label);
  assert(h.asElement(), label); await h.asElement().click(); await h.dispose();
}
try {
  for (const [scene, directory] of (process.argv.includes('--farm-only') ? [['farm', 'packages/farm/dist/m4/test']] : [['golden-gate', 'packages/golden-gate/dist/test'], ['farm', 'packages/farm/dist/m4/test']])) {
    const server = await serveOwned(resolve(directory!));
    try {
      const page = await chrome.browser.newPage();
      page.on('pageerror', error => console.error(scene, error.message));
      await page.goto(server.url + '/?tier=balanced', { waitUntil: 'load' });
      await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h?.readyCount > 0 || h?.errors?.length; }, { timeout: 180000 });
      assert.deepEqual(await page.evaluate(() => (window as any).__kilnHarness.snapshot().errors), []);
      await frames(page); await page.screenshot({ path: resolve(out, `${scene}-opening.png`) });
      if (scene === 'golden-gate') {
        const intersections = await page.evaluate(() => {
          const controls = [...document.querySelectorAll<HTMLElement>('.gg-camera button, .gg-top .ks-toolbar button')];
          return controls.flatMap((a, i) => controls.slice(i + 1).flatMap(b => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top ? [[a.textContent, b.textContent]] : []; }));
        });
        results.push({ scene, intersections, opening: await invoke(page, 'ggStats') });
      } else {
        await button(page, 'Walk the farm'); await frames(page);
        if (await page.$('.ks-help')) await button(page, 'Close controls');
        await frames(page); const before = await invoke(page, 'simState');
        const canvas = await page.$('canvas'), b = await canvas.boundingBox();
        await page.mouse.move(b.x + b.width * .55, b.y + b.height * .5);
        await page.mouse.down({ button: 'right' }); await page.mouse.move(b.x + b.width * .65, b.y + b.height * .65, { steps: 15 }); await page.mouse.up({ button: 'right' });
        await frames(page); const rightDrag = await invoke(page, 'simState');
        await page.mouse.wheel({ deltaY: -300 }); await frames(page); const wheel = await invoke(page, 'simState');
        await page.screenshot({ path: resolve(out, 'farm-walk.png') });
        results.push({ scene, before, rightDrag, wheel, pointerLocked: await page.evaluate(() => !!document.pointerLockElement) });
      }
      await page.close();
    } finally { await server.close(); }
  }
} finally { await chrome.close(); await writeFile(resolve(out, 'reproduction.json'), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results));
