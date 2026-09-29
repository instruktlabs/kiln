import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

const [base, review] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-copy.mjs <site-url> <review-directory>');
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const report = { browser: await browser.version(), checks: [] };
try {
  for (const [route, selector, codeSelector] of [['/docs/install/', '[data-copy-docs]', '.docs-code pre'], ['/', '[data-copy-code]', '[data-copy-code]']]) {
    for (const outcome of ['success', 'failure']) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((outcome) => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
          if (outcome === 'failure') throw new Error('Deliberately denied clipboard for verification.');
          window.__copiedText = text;
        } } });
      }, outcome);
      await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
      const expected = await page.$eval(codeSelector, (element) => element.matches('pre') ? element.textContent : element.parentElement.nextElementSibling.textContent);
      await page.focus(selector);
      await page.keyboard.press('Enter');
      await page.waitForFunction((selector) => Boolean(window.__copiedText) || Boolean(getSelection()?.toString()) || document.querySelector(selector)?.textContent.trim() === 'Select to copy', { timeout: 5000 }, selector);
      const result = await page.evaluate(() => ({ copied: window.__copiedText, selection: getSelection()?.toString(), status: [...document.querySelectorAll('[aria-live="polite"], [role="status"]')].map((element) => element.textContent.trim()).filter(Boolean) }));
      report.checks.push({ route, outcome, correctText: outcome === 'success' ? result.copied === expected : result.selection === expected, statusAnnounced: result.status.some((text) => /copied|selected|copy command/i.test(text)), statuses: result.status });
      await page.close();
    }
  }
  const noJs = await browser.newPage();
  await noJs.setJavaScriptEnabled(false);
  for (const [route, selector] of [['/docs/install/', '[data-copy-docs]'], ['/', '[data-copy-code]']]) {
    await noJs.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
    report.checks.push({ route, outcome: 'no JavaScript', codeVisible: await noJs.$eval('pre', (element) => Boolean(element.textContent.trim()) && element.getClientRects().length > 0), controlsHidden: await noJs.$$eval(selector, (elements) => elements.every((element) => element.hidden)) });
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
assert.equal(report.checks.every((check) => check.outcome === 'no JavaScript' ? (check.codeVisible && check.controlsHidden) || (check.posterVisible && check.fallbackVisible && check.controlsHidden) : check.correctText && check.statusAnnounced), true, 'Copy or no-JavaScript fallback failed; see the saved report.');
