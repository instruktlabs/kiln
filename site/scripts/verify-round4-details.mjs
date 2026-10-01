import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
const [base = 'http://127.0.0.1:4407', destination = '.cache/round-4/details'] = process.argv.slice(2);
const out = resolve(destination); await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const report = { browser: await browser.version(), pages: [], problems: [] };
try {
  const page = await browser.newPage();
  for (const route of ['/docs/install/', '/docs/rendering/', '/packs/', '/packs/farm/', '/packs/vehicles/', '/packs/foundry-floor/', '/gallery/', '/gallery/farmhouse/', '/gallery/golden-gate-bridge/', '/gallery/archive/', '/gallery/archive/robot-arm/', '/scenes/', '/scenes/golden-gate/']) for (const width of [320, 1440]) {
    await page.setViewport({ width, height: 1000 }); await page.goto(new URL(route, base).href, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const h1 = document.querySelector('h1'); const crumb = document.querySelector('nav[aria-label="Breadcrumb"]');
      const code = document.querySelector('.docs-prose p code'); const quote = document.querySelector('.docs-prose blockquote');
      return { title: document.title, heading: h1.textContent.trim(), headingGap: h1.getBoundingClientRect().top - crumb.getBoundingClientRect().bottom,
        code: code && { prefix: getComputedStyle(code, '::before').content, weight: getComputedStyle(code).fontWeight },
        sourceBlocks: [...document.querySelectorAll('pre.astro-code')].map(pre => ({ theme:pre.className, background:getComputedStyle(pre).backgroundColor })),
        quote: quote && { style: getComputedStyle(quote).fontStyle, borders: ['Top', 'Right', 'Bottom', 'Left'].map(edge => getComputedStyle(quote)[`border${edge}Width`]) },
        headingsBeforeNavigation: !document.querySelector('.docs-disclosure')?.checkVisibility() || h1.getBoundingClientRect().bottom <= document.querySelector('.docs-disclosure').getBoundingClientRect().top,
        packCards: [...document.querySelectorAll('.pack-card')].map(card => ({ name: card.getAttribute('aria-label'), nestedLinks: card.querySelectorAll('a').length })) };
    });
    const problems = [];
    if (result.code && (result.code.prefix !== 'none' || result.code.weight !== '400')) problems.push('inline code retains typography defaults');
    if (result.sourceBlocks.some(pre=>!pre.theme.includes('workbench') || pre.background!=='rgb(247, 243, 235)')) problems.push('code block differs from Workbench theme');
    if (result.quote && (result.quote.style !== 'normal' || new Set(result.quote.borders).size !== 1)) problems.push('blockquote border or style differs');
    if (!result.headingsBeforeNavigation) problems.push('mobile navigation precedes H1');
    if (Math.abs(result.headingGap - 32) > 1) problems.push(`heading gap ${result.headingGap}px, expected 32`);
    if (result.packCards.some(card => !card.name || card.nestedLinks)) problems.push('pack card has no short name or nested links');
    await page.addStyleTag({ content: '* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important;} p {margin-bottom:2em!important;}' });
    const textSpacing = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('pre, .overflow-x-auto, [role=region]')).map(e => ({ tag: e.tagName, text: e.textContent.trim().slice(0,70), class: e.className, right: e.getBoundingClientRect().right })).slice(0,12) }));
    if (textSpacing.documentWidth > width + 1) problems.push('text spacing overflows page');
    report.pages.push({ route, width, ...result, textSpacing, problems });
    if (problems.length) report.problems.push({ route, width, problems });
  }
} finally { await browser.close(); await writeFile(join(out, 'details.json'), `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify({ pages: report.pages.length, problems: report.problems }));
assert.equal(report.problems.length, 0, 'Round-4 computed styles, header and text-spacing checks failed');
