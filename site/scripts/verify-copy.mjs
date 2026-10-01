import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

const [base, review] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-copy.mjs <site-url> <review-directory>');

// The copy controls under test. A `block` is the shared code component: what it copies must be the whole file, equal to
// the downloadable source, and it must be the whole file while the block is collapsed to its first lines.
const cases = [
  { route: '/docs/install/', selector: '[data-copy-docs]', kind: 'docs' },
  { route: '/', selector: '[data-copy-code][aria-label="Copy Farmhouse · source.kiln.js"]', kind: 'block', download: '/sources/farmhouse.kiln.js' },
  { route: '/gallery/farmhouse/', selector: '[data-copy-code][aria-label="Copy farmhouse.kiln.js"]', kind: 'block', download: '/sources/farmhouse.kiln.js' },
];

const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const report = { browser: await browser.version(), checks: [] };
try {
  for (const { route, selector, kind, download } of cases) {
    for (const outcome of ['success', 'failure']) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((outcome) => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
          if (outcome === 'failure') throw new Error('Deliberately denied clipboard for verification.');
          window.__copiedText = text;
        } } });
      }, outcome);
      await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
      // What the visitor is copying: the docs example, or the highlighted code of the block the control belongs to.
      const expected = await page.$eval(selector, (control, kind) => kind === 'docs'
        ? control.closest('.docs-code').querySelector('pre').textContent
        : control.closest('[data-code-block]').querySelector('code').textContent, kind);
      const original = download ? await page.evaluate(async (path) => (await fetch(path)).text(), download) : null;
      const state = kind === 'block' ? await page.$eval(selector, (control) => {
        const block = control.closest('[data-code-block]');
        return { collapsible: block.hasAttribute('data-preview-lines'), collapsed: block.hasAttribute('data-collapsed') };
      }) : null;
      await page.focus(selector);
      await page.keyboard.press('Enter');
      await page.waitForFunction((selector) => Boolean(window.__copiedText) || Boolean(getSelection()?.toString()) || document.querySelector(selector)?.textContent.trim() === 'Select to copy', { timeout: 5000 }, selector);
      const result = await page.evaluate(() => ({ copied: window.__copiedText, selection: getSelection()?.toString(), status: [...document.querySelectorAll('[aria-live="polite"], [role="status"]')].map((element) => element.textContent.trim()).filter(Boolean) }));
      const got = outcome === 'success' ? result.copied : result.selection;
      const check = { route, outcome, correctText: got === expected, statusAnnounced: result.status.some((text) => /copied|selected|copy command/i.test(text)), statuses: result.status };
      if (kind === 'block') {
        // The block must have been collapsed when the visitor copied, and what came out must still be every line of the file.
        Object.assign(check, {
          collapsedWhenCopied: state.collapsible ? state.collapsed : null,
          wholeFile: got?.trimEnd() === original.trimEnd(),
          lines: got?.trimEnd().split('\n').length ?? 0,
        });
      }
      report.checks.push(check);
      await page.close();
    }
  }

  const noJs = await browser.newPage();
  await noJs.setJavaScriptEnabled(false);
  // Without the script every block shows its whole code and no control that needs the script is offered.
  for (const [route, controls] of [['/docs/install/', '[data-copy-docs]'], ['/', '[data-copy-code], [data-code-expand]'], ['/gallery/farmhouse/', '[data-copy-code], [data-code-expand]']]) {
    await noJs.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
    report.checks.push({
      route,
      outcome: 'no JavaScript',
      codeVisible: await noJs.$eval('pre', (element) => Boolean(element.textContent.trim()) && element.getClientRects().length > 0),
      // Hidden for real, not only marked hidden: a control an author style makes visible would offer what the script never wired.
      controlsHidden: await noJs.$$eval(controls, (elements) => elements.every((element) => element.hidden && element.getClientRects().length === 0)),
      notCollapsed: await noJs.$$eval('[data-code-block]', (blocks) => blocks.every((block) => {
        const scroll = block.querySelector('.code-scroll');
        return !block.hasAttribute('data-collapsed') && scroll.scrollHeight <= scroll.clientHeight + 1;
      })),
    });
  }
  for (const route of ['/gallery/farmhouse/', '/scenes/farm/']) {
    await noJs.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
    report.checks.push({ route, outcome: 'no JavaScript', posterVisible: await noJs.$eval('main img', (element) => element.getClientRects().length > 0 && element.complete && element.naturalWidth > 0), fallbackVisible: await noJs.$$eval('noscript', (elements) => elements.some((element) => element.textContent.trim().length > 0)), controlsHidden: await noJs.$$eval('[data-open], [data-explore]', (elements) => elements.every((element) => element.hidden)) });
  }
  await noJs.close();
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, 'copy-fallback-checks.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
const passes = (check) => {
  if (check.outcome === 'no JavaScript') {
    return 'codeVisible' in check
      ? check.codeVisible && check.controlsHidden && check.notCollapsed
      : check.posterVisible && check.fallbackVisible && check.controlsHidden;
  }
  const whole = 'wholeFile' in check ? check.wholeFile && check.collapsedWhenCopied !== false : true;
  return check.correctText && check.statusAnnounced && whole;
};
assert.equal(report.checks.every(passes), true, 'Copy or no-JavaScript fallback failed; see the saved report.');
