import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
const [base, review] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-hero-qualification.mjs <site-url> <review-directory>');
const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const results = [];
await mkdir(join(review, 'screenshots/hero-qualification'), { recursive: true });
try {
  for (const width of [360, 390]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(new URL('/', base).href, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => { await document.fonts.ready; return true; });
    const sheet = await page.$('.drawing-sheet');
    await sheet.screenshot({ path: join(review, 'screenshots/hero-qualification', `${width}.png`) });
    results.push(await page.evaluate(() => ({ width: innerWidth, items: [...document.querySelectorAll('.drawing-sheet figcaption span')].filter((element) => element.textContent.includes('r_')).flatMap((element) => {
      const words = [];
      const iterator = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = iterator.nextNode())) {
        const match = /r_[a-z0-9]+/.exec(node.textContent);
        if (!match) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const word = range.getBoundingClientRect();
        const caption = element.parentElement.getBoundingClientRect();
        const style = getComputedStyle(element.parentElement);
        const contentLeft = caption.left + Number.parseFloat(style.paddingLeft);
        const contentRight = caption.right - Number.parseFloat(style.paddingRight);
        words.push({ word: match[0], wordLeft: word.left, wordRight: word.right, contentLeft, contentRight, overflowWrap: getComputedStyle(element).overflowWrap, exceedsPadding: word.left < contentLeft - 1 || word.right > contentRight + 1 });
      }
      return words;
    }) })));
  }
} finally { await browser.close(); }
await writeFile(join(review, 'hero-qualification-check.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
assert.equal(results.every((result) => result.items.length > 0 && result.items.every((item) => !item.exceedsPadding)), true, 'A hero revision identifier extends into its title-block padding.');
