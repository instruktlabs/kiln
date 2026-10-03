// Explicit browser gate, separate from portable source tests. No assets, renderer, or GPU timing.
// From scenes/: bun packages/scene-kit/tests/browser/run-hud-layout.ts
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChrome, serveOwned } from '../../src/testing/node';

const workspace = resolve(import.meta.dir, '../../../..');
await mkdir(resolve(workspace, '.tmp'), { recursive: true });
const out = await mkdtemp(resolve(workspace, '.tmp/hud-layout-'));
let server: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Awaited<ReturnType<typeof launchChrome>> | undefined;
const results: { name: string; pass: boolean; error?: string }[] = [];
try {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'hud-fixture.tsx')], outdir: out, target: 'browser',
    define: { 'import.meta.env.KILN_TEST': 'false', 'import.meta.env.KILN_DEV': 'false', 'process.env.NODE_ENV': '"production"' } });
  assert(build.success, build.logs.join('\n'));
  const css: string[] = [];
  for (const [file, name] of [['farm/src/ui/FarmHud.tsx', 'FARM_HUD_CSS'], ['golden-gate/src/ui/styles.ts', 'GG_HUD_CSS'], ['foundry-floor/src/scene/Hud.tsx', 'FF_HUD_CSS'], ['foundry-floor/src/campus/exterior/Hud.tsx', 'CSS']]) {
    const source = await readFile(resolve(workspace, 'packages', file!), 'utf8');
    const match = source.match(new RegExp(`const ${name} = \x60([\\s\\S]*?)\x60;`)); assert(match, `${name} remains a literal stylesheet`); css.push(match[1]!);
  }
  await writeFile(resolve(out, 'index.html'), `<!doctype html><html><body><style>body{margin:0}#fixture{position:absolute;left:40px;top:30px;width:360px;height:280px}.fixture-nested{position:absolute;inset:0;pointer-events:none!important}${css.join('\n')}</style><div id="fixture"></div><script type="module" src="./hud-fixture.js"></script></body></html>`);
  server = await serveOwned(out);
  browser = await launchChrome({ workspace, name: 'hud-layout', windowSize: [1280, 900] });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900, hasTouch: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(server.url); await page.waitForSelector('.ks-help-button');
  const check = async (name: string, run: () => Promise<void>) => {
    try { await run(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
  };
  for (const variant of ['kit', 'farm', 'golden-gate', 'foundry-floor']) {
    for (const [width, height] of [[360, 280], [760, 320], [1120, 720]]) {
      await page.evaluate(({ variant, width, height }) => {
        Object.assign(document.getElementById('fixture')!.style, { width: `${width}px`, height: `${height}px` });
        (window as any).__mountHud(variant);
      }, { variant, width, height });
      await page.waitForFunction(variant => document.querySelector('.ks-root')?.getAttribute('data-fixture') === variant && document.querySelector('.ks-help-button')?.getAttribute('aria-expanded') === 'false', {}, variant);
      for (const kind of ['help', 'credits']) {
        await page.click(`.ks-${kind}-button`); await page.waitForSelector(`.ks-${kind}`);
        await check(`${variant} ${width}x${height} ${kind}: bounds, scroll and hit-testing`, async () => {
          const measured = await page.$eval(`.ks-${kind}`, panel => {
            const box = panel.getBoundingClientRect(), root = panel.closest('.ks-root')!.getBoundingClientRect();
            const node = panel as HTMLElement; node.scrollTop = node.scrollHeight;
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
              root: { x: root.x, y: root.y, right: root.right, bottom: root.bottom }, scroll: node.scrollTop,
              hit: panel.contains(document.elementFromPoint(box.right - 20, box.bottom - 20)) };
          });
          assert(measured.height >= 80, `Usable panel height: ${JSON.stringify(measured)}`);
          assert(measured.x >= measured.root.x && measured.y >= measured.root.y && measured.right <= measured.root.right + 1 && measured.bottom <= measured.root.bottom + 1, `Panel stays in embedded HUD: ${JSON.stringify(measured)}`);
          assert(measured.scroll > 0, 'Long content scrolls'); assert(measured.hit, 'Panel receives the hit above controls');
        });
        await check(`${variant} ${width}x${height} ${kind}: keyboard entry and Escape restore focus`, async () => {
          await page.keyboard.press('Tab');
          assert.equal(await page.$eval(`.ks-${kind}`, panel => panel.contains(document.activeElement)), true, 'Tab enters panel controls');
          await page.keyboard.press('Escape');
          await page.waitForFunction(selector => !document.querySelector(selector), {}, `.ks-${kind}`);
          assert.equal(await page.$eval(`.ks-${kind}-button`, button => document.activeElement === button), true);
        });
      }
      await check(`${variant} ${width}x${height}: nested touch controls`, async () => {
        const before = await page.evaluate(() => (window as any).__canvasHits);
        const box = await page.$eval('.ks-joystick', node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        const stick = await page.touchscreen.touchStart(box.x, box.y); await stick.move(box.x + 25, box.y - 25);
        const moving = await page.evaluate(() => ({ ...(window as any).__input.state.move }));
        await stick.end(); assert(moving.x > 0 && moving.y > 0, 'Nested touch joystick changes movement');
        assert.equal(await page.evaluate(() => (window as any).__input.state.move.x + (window as any).__input.state.move.y), 0, 'Releasing touch stops movement');
        await page.$eval('.ks-touch-button', node => (node as HTMLElement).scrollIntoView({ block: 'nearest' }));
        const action = await page.$eval('.ks-touch-button', node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        const touch = await page.touchscreen.touchStart(action.x, action.y);
        assert.equal(await page.evaluate(() => (window as any).__input.state.actions.boost), 1);
        await touch.end(); assert.equal(await page.evaluate(() => (window as any).__input.state.actions.boost), 0);
        assert.equal(await page.evaluate(() => (window as any).__canvasHits), before, 'Controls do not click through');
      });
    }
  }
  // Public GG/Foundry panels live inside More. Selecting a panel closes that menu,
  // so its own trigger is hidden by CSS even while the panel remains open.
  for (const [width, height] of [[360, 280], [1120, 720]]) {
    await page.evaluate(({ width, height }) => {
      Object.assign(document.getElementById('fixture')!.style, { width: `${width}px`, height: `${height}px` });
      (window as any).__mountHud('menu');
    }, { width, height });
    await page.waitForFunction(() => document.querySelector('.ks-root')?.getAttribute('data-fixture') === 'menu');
    for (const kind of ['help', 'credits']) for (const method of ['Escape', 'Close']) {
      await check(`collapsed More ${width}x${height} ${kind}: ${method} restores visible menu focus`, async () => {
        await page.waitForSelector('.ks-menu-trigger', { visible: true });
        assert.equal(await page.$eval('.ks-menu-trigger', button => {
          const rect = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }), true, 'The public-style More toolbar must receive the click');
        await page.click('.ks-menu-trigger');
        await page.waitForFunction(() => document.querySelector('.ks-menu-trigger')?.getAttribute('aria-expanded') === 'true');
        await page.waitForSelector(`.ks-${kind}-button`, { visible: true });
        await page.click(`.ks-${kind}-button`); await page.waitForSelector(`.ks-${kind}`, { visible: true });
        assert.equal(await page.$eval(`.ks-${kind}-button`, button => button.checkVisibility()), false, 'The original panel trigger is hidden in the collapsed menu');
        const close = await page.$(`.ks-${kind} button`); assert(close);
        if (method === 'Escape') { await close.focus(); await page.keyboard.press('Escape'); }
        else await close.click();
        await page.waitForSelector(`.ks-${kind}`, { hidden: true });
        assert.equal(await page.$eval('.ks-menu-trigger', button => document.activeElement === button && button.checkVisibility()), true, 'Focus returns to visible More');
      });
    }
  }
  // Foundry campus has a second row of More controls underneath the fixed help
  // panel. Reopening More must make those actual touch targets reachable while
  // keeping both panels mounted; visibility alone does not establish that.
  for (const [width, height] of [[390, 844], [360, 280], [760, 320], [1120, 720]]) {
    await page.evaluate(({ width, height }) => {
      Object.assign(document.getElementById('fixture')!.style, { width: `${width}px`, height: `${height}px` });
      (window as any).__mountHud('foundry-campus');
    }, { width, height });
    await page.waitForFunction(() => document.querySelector('.ks-root')?.getAttribute('data-fixture') === 'foundry-campus');
    await check(`Foundry campus ${width}x${height}: reopened More remains touchable above stacked panels`, async () => {
      const tap = async (selector: string) => {
        await page.waitForSelector(selector, { visible: true });
        const point = await page.$eval(selector, node => {
          const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return { x, y, hit: hit?.outerHTML, receivesTouch: node.contains(hit) };
        });
        assert(point.receivesTouch, `Actual touch target ${selector} is covered: ${JSON.stringify(point)}`);
        await page.touchscreen.tap(point.x, point.y);
      };
      const more = '.ks-menu-trigger[aria-label="More"]';
      await tap(more); await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', {}, more);
      await tap('.ks-help-button'); await page.waitForSelector('.ks-help', { visible: true });
      assert.equal(await page.$eval(more, button => button.getAttribute('aria-expanded')), 'false', 'Choosing Controls collapses More');
      await tap(more); await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', {}, more);
      await tap('.ks-credits-button'); await page.waitForSelector('.ks-credits', { visible: true });
      assert.equal(await page.$eval('.ks-help', panel => panel.checkVisibility()), true, 'Opening Credits preserves Controls');
      const panel = await page.$eval('.ks-credits', node => {
        const element = node as HTMLElement; element.scrollTop = element.scrollHeight;
        const r = element.getBoundingClientRect();
        return { scroll: element.scrollTop, receivesTouch: element.contains(document.elementFromPoint(r.right - 20, r.bottom - 20)) };
      });
      assert(panel.scroll > 0 && panel.receivesTouch, 'The stacked Credits panel still scrolls and receives touch');
      await tap(more); await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', {}, more);
      await tap('.ks-help-button'); await page.waitForSelector('.ks-help', { hidden: true });
      assert.equal(await page.$eval('.ks-credits', panel => panel.checkVisibility()), true, 'A menu action can close Controls while Credits stays open');
      await page.$eval('.ks-credits button', button => (button as HTMLButtonElement).focus());
      await page.keyboard.press('Escape'); await page.waitForSelector('.ks-credits', { hidden: true });
      assert.equal(await page.$eval(more, button => document.activeElement === button && button.checkVisibility()), true, 'Escape returns focus to visible More');
    });
  }
  console.log(JSON.stringify({ scope: 'DOM-only shared HUD with current Farm, Golden Gate and Foundry styles; no renderer qualification', results }, null, 2));
  assert.deepEqual(errors, [], 'No browser errors');
  assert(results.every(result => result.pass), `${results.filter(result => !result.pass).length} HUD browser contracts failed`);
} finally { try { await browser?.close(); } finally { await server?.close(); await rm(out, { recursive: true, force: true }); } }
