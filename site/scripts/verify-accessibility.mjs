import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { isEmbeddedDocument, routeForFile } from './static-validation-core.mjs';

// Maintainer gate: exact emitted pages at both required widths, then actual Tab tours on core page types.
const [base, directory = '.cache/accessibility', selectedRoute] = process.argv.slice(2);
if (!base) throw new Error('Usage: bun scripts/verify-accessibility.mjs <site-url> [report-directory]');
const out = resolve(directory);
await mkdir(out, { recursive: true });
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}
const routes = (await htmlFiles(resolve('dist'))).map(file => routeForFile(relative(resolve('dist'), file))).filter(route => !isEmbeddedDocument(route) && (!selectedRoute || route === selectedRoute));
const core = ['/', '/packs/', '/packs/farm/', '/packs/vehicles/', '/packs/foundry-floor/', '/gallery/', '/gallery/farmhouse/', '/gallery/sedan/', '/gallery/golden-gate-bridge/', '/gallery/cow/', '/gallery/archive/', '/gallery/archive/robot-arm/', '/gallery/archive/mechanical-peacock/', '/docs/', '/docs/install/', '/docs/rendering/', '/docs/tools/', '/docs/engine-handoff/', '/scenes/', '/scenes/farm/', '/scenes/golden-gate/', '/scenes/foundry-floor/'];
if (!selectedRoute) for (const route of core) assert.ok(routes.includes(route), `Keyboard tour route missing: ${route}`);
const report = { pages: [], tours: [], problems: [] };
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
report.browser = await browser.version();
try {
  const pending = routes.flatMap(route => [320, 1440].map(width => ({ route, width })));
  await Promise.all([0, 1].map(async () => {
    const page = await browser.newPage();
    let job;
    while ((job = pending.shift())) {
      await page.setViewport({ width: job.width, height: 1000 });
      await page.goto(new URL(job.route, base).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(axe);
      const result = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        documentWidth: document.documentElement.scrollWidth,
        overflowElements: [...document.querySelectorAll('main *')].filter(element => {
          if (element.getBoundingClientRect().right <= innerWidth + 1) return false;
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
          }
          return true;
        }).map(element => ({ tag: element.tagName, class: element.className, text: element.textContent.trim().slice(0, 100), right: element.getBoundingClientRect().right })),
        violations: (await window.axe.run()).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })),
      }));
      report.pages.push({ ...job, ...result });
      if (result.overflow || result.violations.length) report.problems.push({ ...job, ...result });
      if (report.pages.length % 20 === 0) console.log(`Accessibility: ${report.pages.length}/${routes.length * 2} page widths checked, ${report.problems.length} issues.`);
    }
    await page.close();
  }));
  const page = await browser.newPage();
  for (const route of core.filter(route => routes.includes(route))) for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(new URL(route, base).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const stops = [];
    const seen = new Set();
    for (let i = 0; i < 250; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const edge = Math.max(0, (parseFloat(style.outlineOffset) || 0) + (parseFloat(style.outlineWidth) || 0));
        const clips = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const box = parent.getBoundingClientRect();
          const css = getComputedStyle(parent);
          if (['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowX) && (rect.left - edge < box.left - 1 || rect.right + edge > box.right + 1)) clips.push(`horizontal: ${parent.id || parent.className || parent.tagName}`);
          if (['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowY) && (rect.top - edge < box.top - 1 || rect.bottom + edge > box.bottom + 1)) clips.push(`vertical: ${parent.id || parent.className || parent.tagName}`);
        }
        return { key: [...document.querySelectorAll('*')].indexOf(element), name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 90), tag: element.tagName, outline: style.outlineStyle, outlineWidth: style.outlineWidth, clips, headerX: element.closest('body > header') ? rect.left : null };
      });
      if (stop.tag === 'BODY' || seen.has(stop.key)) break;
      seen.add(stop.key); stops.push(stop);
    }
    const clipped = stops.filter(stop => stop.clips.length);
    const header = stops.filter(stop => stop.headerX !== null).map(stop => stop.headerX);
    const monotonic = width < 1440 || header.every((x, index) => index === 0 || x >= header[index - 1]);
    const tour = { route, width, stops, clipped: clipped.length, monotonic };
    report.tours.push(tour);
    if (clipped.length || !monotonic) report.problems.push({ route, width, tour: { clipped, monotonic } });
  }
  await page.close();
} finally {
  await browser.close();
  await writeFile(join(out, 'accessibility.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`${report.pages.length} page widths, ${report.tours.length} keyboard tours, ${report.problems.length} problems. ${join(out, 'accessibility.json')}`);
assert.equal(report.problems.length, 0, 'Accessibility gate found issues; see report.');
