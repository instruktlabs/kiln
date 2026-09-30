import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { shiftOf } from './layout-shift.mjs';

const [base, review, screenshotDirectory = join(review ?? '', 'screenshots/source')] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-source.mjs <site-url> <output-directory> [screenshot-directory]');
const farm = JSON.parse(await readFile(new URL('../src/data/packs/farm.json', import.meta.url), 'utf8'));
const vehicles = JSON.parse(await readFile(new URL('../src/data/packs/vehicles.json', import.meta.url), 'utf8'));
const bridge = JSON.parse(await readFile(new URL('../src/data/standalone/golden-gate-bridge.json', import.meta.url), 'utf8'));
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const house = farm.assets.find((asset) => asset.slug === 'farmhouse');

// The source block of each page. The home page shows the farmhouse source in the first of several blocks.
const galleryBlock = 'section[aria-labelledby="source"] [data-code-block]';
const routes = [
  { route: '/', block: '[data-code-block]:has([data-copy-code][aria-label="Copy Farmhouse · source.kiln.js"])', downloadPath: house.sourcePath, sourceHash: house.sourceSha256, screenshots: 'home' },
  ...[...farm.assets, ...vehicles.assets, bridge].map((asset) => ({
    route: `/gallery/${asset.slug}/`,
    block: galleryBlock,
    downloadPath: asset.sourcePath,
    sourceHash: asset.sourceSha256,
    screenshots: asset.slug === 'farmhouse' ? 'gallery-farmhouse' : null,
  })),
  { route: '/gallery/archive/robot-arm/', block: galleryBlock, downloadSelector: 'a[download][href$=".kiln.js"]' },
  ...['install', 'programs', 'geometry'].map((slug) => ({ route: `/docs/${slug}/`, block: null })),
];
const lineCount = (text) => text.replace(/\r?\n$/, '').split(/\r?\n/).length;

/** What the page shows of one block right now: the state the control reports and how much of the code is visible. */
const inspectBlock = (selector) => document.querySelector(selector) && (() => {
  const block = document.querySelector(selector);
  const scroll = block.querySelector('.code-scroll');
  const toggle = block.querySelector('[data-code-expand]');
  const fade = block.querySelector('.code-fade');
  const paddingBottom = Number.parseFloat(getComputedStyle(scroll).paddingBottom);
  const scrollRect = scroll.getBoundingClientRect();
  const lines = [...block.querySelectorAll('code .line')];
  const toggleRect = toggle?.getBoundingClientRect();
  const fadeRect = fade?.getBoundingClientRect();
  return {
    collapsible: block.hasAttribute('data-preview-lines'),
    previewLines: Number(block.dataset.previewLines) || null,
    collapsed: block.hasAttribute('data-collapsed'),
    expanded: toggle?.getAttribute('aria-expanded') ?? null,
    toggleShown: Boolean(toggle) && !toggle.hidden && toggle.getClientRects().length > 0,
    toggleText: toggle?.querySelector('[data-code-expand-text]')?.textContent ?? null,
    toggleIcon: toggle?.querySelector('[data-code-expand-icon]')?.textContent ?? null,
    toggleInViewport: toggleRect ? toggleRect.top >= 0 && toggleRect.bottom <= window.innerHeight : null,
    toggleFocused: toggle ? document.activeElement === toggle : null,
    clipped: scroll.scrollHeight > scroll.clientHeight + 1,
    linesInDocument: lines.length,
    linesVisible: lines.filter((line) => line.getBoundingClientRect().bottom <= scrollRect.bottom - paddingBottom + 0.5).length,
    fadeDisplay: fade ? getComputedStyle(fade).display : null,
    fadeAtBottom: fadeRect && fadeRect.height > 0 ? Math.abs(fadeRect.bottom - scrollRect.bottom) < 1 : null,
    codeText: block.querySelector('code').textContent,
  };
})();

const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const results = { browser: await browser.version(), pages: [], errors: [] };
await mkdir(screenshotDirectory, { recursive: true });
try {
  for (const entry of routes) {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (error) => results.errors.push({ route: entry.route, message: error.message }));
    // A stand-in clipboard, so what the copy control hands over can be compared with the file.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copiedText = text; } } });
    });
    const result = { route: entry.route, checks: [], axe: [] };
    const check = (name, pass, detail) => result.checks.push(detail === undefined ? { name, pass: Boolean(pass) } : { name, pass: Boolean(pass), detail });
    try {
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(new URL(entry.route, base).href, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => { await document.fonts.ready; });
      if (entry.block) {
        const original = entry.downloadPath
          ? await page.evaluate(async (path) => (await fetch(path)).text(), entry.downloadPath)
          : await page.$eval(entry.downloadSelector, async (element) => (await fetch(element.href)).text());
        const total = lineCount(original);
        const toggleSelector = `${entry.block} [data-code-expand]`;
        const copySelector = `${entry.block} [data-copy-code]`;
        const state = () => page.evaluate(inspectBlock, entry.block);

        // 1. The whole file is in the page, collapsed or not: what the block holds is what the download holds.
        const loaded = await state();
        check('Whole source is in the page', loaded.codeText.trimEnd() === original.trimEnd(), { lines: total });
        if (entry.sourceHash) {
          const actual = createHash('sha256').update(original).digest('hex');
          check('Downloaded source matches selected manifest SHA-256', actual === entry.sourceHash, { actual });
        }

        if (loaded.collapsible) {
          // 2. Collapsed at load: first lines, a fade over the cut, and a control that says what it reveals.
          check('Collapsed at load', loaded.collapsed && loaded.expanded === 'false' && loaded.clipped && loaded.toggleShown);
          check('First lines shown, cut mid-file', Math.abs(loaded.linesVisible - loaded.previewLines) <= 1 && loaded.linesVisible < loaded.linesInDocument, { previewLines: loaded.previewLines, linesVisible: loaded.linesVisible, linesInDocument: loaded.linesInDocument });
          check('Fade covers the cut', loaded.fadeDisplay === 'block' && loaded.fadeAtBottom === true);
          const name = (await page.accessibility.snapshot({ root: await page.$(toggleSelector), interestingOnly: false }))?.name ?? '';
          check('Control names what it reveals', name === `Show all ${total.toLocaleString('en-US')} lines of ${(await page.$eval(copySelector, (button) => button.getAttribute('aria-label'))).replace(/^Copy /, '')}`, { name });

          // The Copy button is revealed by script after the page is drawn; the header must not grow when it appears.
          const headerHeights = await page.evaluate((selector) => {
            const block = document.querySelector(selector);
            const header = block.firstElementChild;
            const button = block.querySelector('[data-copy-code]');
            const shown = header.getBoundingClientRect().height;
            button.hidden = true;
            const hidden = header.getBoundingClientRect().height;
            button.hidden = false;
            return { shown, hidden };
          }, entry.block);
          check('Revealing Copy does not change the header height', Math.abs(headerHeights.shown - headerHeights.hidden) < 0.5, headerHeights);

          // 3. Copy hands over the whole file while the block is collapsed.
          await page.focus(copySelector);
          await page.keyboard.press('Enter');
          const copied = await page.evaluate(() => window.__copiedText);
          check('Copy copies the whole file while collapsed', (await state()).collapsed && copied?.trimEnd() === original.trimEnd(), { copiedLines: copied ? lineCount(copied) : 0, fileLines: total });

          // 4. The keyboard opens and closes it, and the control stays where the reader can see it.
          await page.focus(toggleSelector);
          await page.keyboard.press('Enter');
          const open = await state();
          check('Expands from keyboard (Enter)', open.expanded === 'true' && !open.collapsed && !open.clipped && open.toggleText === 'Show fewer lines' && open.toggleIcon === '↑' && open.linesVisible === open.linesInDocument, { linesVisible: open.linesVisible, linesInDocument: open.linesInDocument });
          check('Control stays in view and focused once expanded', open.toggleInViewport === true && open.toggleFocused === true, { toggleInViewport: open.toggleInViewport, toggleFocused: open.toggleFocused });
          const openName = (await page.accessibility.snapshot({ root: await page.$(toggleSelector), interestingOnly: false }))?.name ?? '';
          check('Expanded control announces its state', /^Show fewer lines/.test(openName) && (await state()).expanded === 'true', { name: openName });
          check('Whole source is still the same once expanded', open.codeText.trimEnd() === original.trimEnd());
          await page.keyboard.press('Space');
          const closed = await state();
          check('Collapses from keyboard (Space)', closed.expanded === 'false' && closed.collapsed && closed.clipped && closed.toggleText === loaded.toggleText && closed.toggleFocused === true, { toggleText: closed.toggleText });
        } else {
          check('Short source shows in full, with no expand control', !loaded.collapsed && !loaded.clipped && !loaded.toggleShown && loaded.linesInDocument >= total - 1);
        }
      }

      // 5. Accessibility of the collapsed page, then of the expanded one.
      await page.evaluate(axe);
      const runAxe = () => page.evaluate(async () => {
        const outcome = await window.axe.run();
        return outcome.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
      });
      for (const width of [390, 1440]) {
        await page.setViewport({ width, height: 1000 });
        result.axe.push({ width, state: 'collapsed', violations: await runAxe() });
      }
      const expandable = entry.block ? await page.$(`${entry.block} [data-code-expand]`) : null;
      if (expandable) {
        await expandable.click();
        for (const width of [390, 1440]) {
          await page.setViewport({ width, height: 1000 });
          result.axe.push({ width, state: 'expanded', violations: await runAxe() });
        }
        await expandable.click();
      }

      // 6. Screenshots of the collapsed and expanded block, for the review.
      if (entry.screenshots) {
        await page.setViewport({ width: 1440, height: 1000 });
        for (const width of [390, 768, 1280, 1440]) {
          await page.setViewport({ width, height: 1000 });
          await page.$eval(entry.block, (element) => element.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: join(screenshotDirectory, `${entry.screenshots}-collapsed-${width}.png`) });
        }
        await page.click(`${entry.block} [data-code-expand]`);
        for (const width of [390, 1440]) {
          await page.setViewport({ width, height: 1000 });
          await page.$eval(entry.block, (element) => element.scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: join(screenshotDirectory, `${entry.screenshots}-expanded-top-${width}.png`) });
          await page.$eval(entry.block, (element) => element.scrollIntoView({ block: 'end' }));
          await page.screenshot({ path: join(screenshotDirectory, `${entry.screenshots}-expanded-bottom-${width}.png`) });
        }
      }
    } finally { await page.close(); }
    results.pages.push(result);
    console.log(`${entry.route}: ${result.checks.filter((item) => item.pass).length}/${result.checks.length} source checks; ${result.axe.reduce((sum, item) => sum + item.violations.length, 0)} axe violations over ${result.axe.length} runs`);
  }

  // 7. Layout shift. Collapsing must not move what the reader is looking at: the script runs while the page is parsed, so
  // nothing after the block exists yet. Four kinds of load of each page (scripts/layout-shift.mjs has the mechanics, and why
  // the 3D viewer is held off in the first three):
  //   served     the page as it is served, a first load (request interception also switches the browser cache off);
  //   stripped   the same page with the collapse script removed: what the page shifts by on its own;
  //   late       the same page with the collapse deferred to after the load: the control. A comparison that finds nothing
  //              proves nothing until it is shown to find something, so this one has to shift by 0.01 or more;
  //   returning  a second load with the site's files cached and the viewer live, which has to stay under 0.01 (the pages
  //              have enhancement of their own that moves a control by a few pixels once script runs).
  // The served page's worst load may not exceed the stripped page's least by more than 0.001.
  results.layoutShift = [];
  const plan = { returning: 3, served: 3, stripped: 3, late: 1 };
  for (const entry of routes.filter((item) => item.block && (item.route === '/' || item.route === '/gallery/farmhouse/' || item.route === '/gallery/archive/robot-arm/'))) {
    for (const width of [390, 1440]) {
      const runs = { returning: [], served: [], stripped: [], late: [] };
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [mode, count] of Object.entries(plan)) {
          if (repeat < count) runs[mode].push(await shiftOf(browser, { base, route: entry.route, block: entry.block, width, mode, onError: (message) => results.errors.push({ route: entry.route, message }) }));
        }
      }
      const totals = (mode) => runs[mode].map((item) => item.total);
      const worst = (mode) => Math.max(...totals(mode));
      const least = (mode) => Math.min(...totals(mode));
      const hasViewer = runs.returning[0].revealed !== null;
      const record = {
        route: entry.route,
        width,
        collapsed: [...runs.returning, ...runs.served, ...runs.late].every((item) => item.collapsed),
        strippedCollapsed: runs.stripped.some((item) => item.collapsed),
        withScript: worst('served'),
        withoutScript: least('stripped'),
        withoutScriptWorst: worst('stripped'),
        late: least('late'),
        returning: worst('returning'),
        // On a page with a viewer: its Open control is revealed on every returning load and stays hidden in the held loads.
        viewerLive: hasViewer ? runs.returning.every((item) => item.revealed === true) : null,
        viewerHeld: hasViewer ? [...runs.served, ...runs.stripped, ...runs.late].every((item) => item.revealed === false) : null,
        // What moved on the returning loads that shifted, so the record shows what the shift is.
        returningShifts: runs.returning.filter((item) => item.total > 0).map((item) => item.shifts),
      };
      results.layoutShift.push(record);
      console.log(`Layout shift ${entry.route} at ${width}: served ${record.withScript.toFixed(4)} (worst of 3), stripped ${record.withoutScript.toFixed(4)} (least of 3), collapse deferred ${record.late.toFixed(4)}; returning ${record.returning.toFixed(4)} (worst of 3), viewer live ${record.viewerLive}, held off ${record.viewerHeld}, collapsed ${record.collapsed}`);
    }
  }
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  const report = JSON.parse(JSON.stringify(results));
  await writeFile(join(review, 'source-checks.json'), JSON.stringify(report, null, 2));
}
assert.ok(results.pages.every((page) => page.checks.every((item) => item.pass)), 'Source content, collapse or keyboard check failed.');
assert.ok(results.pages.every((page) => page.axe.every((item) => item.violations.length === 0)), 'Collapsed or expanded source, or docs, accessibility check failed.');
assert.ok(results.layoutShift.every((item) => item.collapsed), 'A source block was not collapsed after load.');
assert.ok(results.layoutShift.every((item) => item.withScript <= item.withoutScript + 0.001), 'The collapse script moved content on screen.');
assert.ok(results.layoutShift.every((item) => item.late >= 0.01), 'A collapse deferred to after the load shifts the page by less than 0.01: the comparison cannot see a shift when there is one.');
assert.ok(results.layoutShift.every((item) => item.viewerLive !== false && item.viewerHeld !== false), 'The 3D viewer was not live on the returning loads, or ran on the loads where it is held off.');
assert.ok(results.layoutShift.every((item) => !item.strippedCollapsed), 'The page collapsed a block without the collapse script.');
assert.ok(results.layoutShift.every((item) => item.returning < 0.01), 'A source page shifts by 0.01 or more when it is loaded a second time.');
assert.equal(results.errors.length, 0, 'A source page threw a script exception.');
console.log(`Source gate passed: ${results.pages.length} pages, ${results.pages.reduce((sum, page) => sum + page.checks.length, 0)} checks, ${results.pages.reduce((sum, page) => sum + page.axe.length, 0)} axe runs, ${results.layoutShift.length} layout-shift measurements.`);
