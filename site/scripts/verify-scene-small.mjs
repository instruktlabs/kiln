import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
const [base = 'http://127.0.0.1:4407', destination = '.cache/round-4/small-scenes'] = process.argv.slice(2);
const out = resolve(destination); await mkdir(out, { recursive: true });
const report = { runs: [], errors: [] };
for (const disabled of [false, true]) {
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox', ...(disabled ? ['--disable-3d-apis', '--disable-gpu'] : [])] });
  try {
    for (const scene of ['farm', 'golden-gate', 'foundry-floor']) {
      const page = await browser.newPage();
      try {
      await page.setViewport({ width: 320, height: 256 });
      await page.goto(new URL(`/scenes/${scene}/`, base).href, { waitUntil: 'load' });
      await page.click('[data-explore]');
      await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('scene-shell')?.dataset.sceneState), { timeout: 90000 });
      const state = await page.evaluate(() => {
        const shell = document.querySelector('scene-shell');
        const box = element => { const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
        return { state:shell.dataset.sceneState, status:shell.querySelector('[data-status]').textContent, scrollWidth:document.documentElement.scrollWidth,
          controls:[...shell.querySelectorAll('[data-exit], [data-fullscreen]')].filter(e=>e.checkVisibility()).map(box),
          frame: shell.querySelector('iframe') ? box(shell.querySelector('iframe')) : null,
          restoredFocus:document.activeElement === shell.querySelector('[data-explore]') };
      });
      report.runs.push({ scene, disabled, browser:await browser.version(), ...state });
      await page.screenshot({ path:join(out, `${scene}-${disabled ? 'no-graphics' : 'ready'}-320x256.png`) });
      if (disabled) { assert.equal(state.state, 'error'); assert.match(state.status, /graphics|cannot draw/i); assert.equal(state.restoredFocus, true); }
      else { assert.equal(state.state, 'ready', `${scene}: ${state.status}`); assert.equal(state.controls.length, 2); for (const control of state.controls) assert.ok(control.top>=0 && control.left>=0 && control.bottom<=256 && control.right<=320, `${scene} control outside viewport`); if(state.frame) assert.ok(state.frame.bottom<=256 && state.frame.top>=0); }
      assert.ok(state.scrollWidth <= 320);
      } catch(error) { report.errors.push(`${scene} ${disabled ? 'graphics unavailable' : 'normal'}: ${error}`); } finally { await page.close(); }
    }
    if (disabled) {
      const page=await browser.newPage(); await page.goto(new URL('/gallery/farmhouse/',base).href,{waitUntil:'load'}); await page.click('asset-viewer [data-open]');
      await page.waitForFunction(()=>/graphics|cannot draw/i.test(document.querySelector('asset-viewer [data-status]').textContent),{timeout:30000});
      report.viewer=await page.$eval('asset-viewer [data-status]',e=>e.textContent);
      await page.close();
    }
  } catch(error) { report.errors.push(String(error)); } finally { await browser.close(); }
}
await writeFile(join(out,'small-scenes.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report)); assert.equal(report.errors.length,0);
