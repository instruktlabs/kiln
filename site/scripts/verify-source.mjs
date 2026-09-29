import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

const [base, review] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-source.mjs <site-url> <review-directory>');
const farm = JSON.parse(await readFile(new URL('../src/data/packs/farm.json', import.meta.url), 'utf8'));
const bridge = JSON.parse(await readFile(new URL('../src/data/standalone/golden-gate-bridge.json', import.meta.url), 'utf8'));
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const sourceSelector = 'section[aria-labelledby="source"] details';
const routes = [
  ...[...farm.assets, bridge].map((asset) => ({
    route: `/gallery/${asset.slug}/`,
    source: true,
    sourceHash: asset.sourceSha256,
    download: 'section[aria-labelledby="source"] a[download]',
  })),
  { route: '/gallery/archive/robot-arm/', source: true, download: 'a[download][href$=".kiln.js"]' },
  ...['install', 'programs', 'geometry'].map((slug) => ({ route: `/docs/${slug}/`, source: false })),
];
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const results = { browser: await browser.version(), pages: [], errors: [] };
try {
  for (const entry of routes) {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (error) => results.errors.push({ route: entry.route, message: error.message }));
    const result = { route: entry.route, checks: [], axe: [] };
    try {
      await page.goto(new URL(entry.route, base).href, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => { await document.fonts.ready; });
      if (entry.source) {
        await page.focus(`${sourceSelector} summary`);
        await page.keyboard.press('Enter');
        result.checks.push({ name: 'Source expands from keyboard', pass: await page.$eval(sourceSelector, (element) => element.open) });
        const highlighted = await page.$eval(`${sourceSelector} code`, (element) => element.textContent);
        const original = await page.$eval(entry.download, async (element) => (await fetch(element.href)).text());
        result.checks.push({ name: 'Highlighted source matches downloadable source', pass: highlighted.trimEnd() === original.trimEnd() });
        if (entry.sourceHash) {
          const actual = createHash('sha256').update(original).digest('hex');
          result.checks.push({ name: 'Downloaded source matches selected manifest SHA-256', pass: actual === entry.sourceHash, actual });
        }
      }
      await page.evaluate(axe);
      for (const width of [390, 1440]) {
        await page.setViewport({ width, height: 1000 });
        result.axe.push({ width, violations: await page.evaluate(async () => {
          const result = await window.axe.run();
          return result.violations.map(({ id, impact, nodes }) => ({
            id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          }));
        }) });
      }
      if (entry.route === '/gallery/farmhouse/') {
        await mkdir(join(review, 'screenshots/source-open'), { recursive: true });
        for (const width of [390, 768, 1280, 1440, 1920]) {
          await page.setViewport({ width, height: 1000 });
          await page.$eval(sourceSelector, (element) => element.scrollIntoView());
          await page.screenshot({ path: join(review, 'screenshots/source-open', `${width}.png`) });
        }
      }
    } finally { await page.close(); }
    results.pages.push(result);
    console.log(`${entry.route}: ${result.checks.filter((check) => check.pass).length}/${result.checks.length} source checks; ${result.axe.reduce((sum, check) => sum + check.violations.length, 0)} axe violations`);
  }
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, 'source-open-checks.json'), JSON.stringify(results, null, 2));
}
assert.ok(results.pages.every((page) => page.checks.every((check) => check.pass)), 'Source content or keyboard check failed.');
assert.ok(results.pages.every((page) => page.axe.every((check) => check.violations.length === 0)), 'Expanded source or docs accessibility check failed.');
assert.equal(results.errors.length, 0, 'A source page threw a script exception.');
console.log(`Source gate passed: ${results.pages.length} pages, ${results.pages.reduce((sum, page) => sum + page.axe.length, 0)} axe checks.`);
