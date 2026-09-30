import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

/**
 * The Farm scene under touch emulation (390 x 844, a touch screen and a coarse primary pointer): the controls the Farm page
 * describes are the ones the scene draws.
 *
 *   node scripts/verify-scene-touch.mjs <site-url> <output-directory> [screenshot-directory]
 *
 * The page says the scene is played with a joystick, a one-finger drag to look, a pinch to zoom and at most one tap target,
 * "not drawn as a pad of buttons". So on a touch screen: the overview must offer one camera tap target and none of the
 * pad's arrows, plus and minus; choosing Walk the farm must show the joystick and at most one context tap target. This is
 * emulation in desktop Chrome and shows what the scene draws for a touch screen; it measures no device.
 */
const [base, review, screenshotDirectory = join(review ?? '', 'screenshots')] = process.argv.slice(2);
if (!base || !review) throw new Error('Usage: node scripts/verify-scene-touch.mjs <site-url> <output-directory> [screenshot-directory]');
const PAD = new Set(['+', '-', '−', '←', '→', '↑', '↓']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const results = { browser: await browser.version(), viewport: '390x844, touch, mobile', checks: [], observed: {}, errors: [] };
const check = (name, pass, detail) => results.checks.push(detail === undefined ? { name, pass: Boolean(pass) } : { name, pass: Boolean(pass), detail });
await mkdir(screenshotDirectory, { recursive: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (error) => results.errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(new URL('/scenes/farm/', base).href, { waitUntil: 'networkidle0' });
  const media = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, noHover: matchMedia('(hover: none)').matches, touchPoints: navigator.maxTouchPoints }));
  results.observed.media = media;
  check('The browser reports a coarse pointer and a touch screen', media.coarse && media.touchPoints > 0, media);

  await page.evaluate(() => document.querySelector('scene-shell').scrollIntoView({ block: 'start' }));
  await page.tap('scene-shell [data-explore]');
  await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('scene-shell')?.dataset.sceneState), { timeout: 240000 });
  assert.equal(await page.$eval('scene-shell', (element) => element.dataset.sceneState), 'ready', 'The Farm must reach ready');
  await page.waitForSelector('.farm-hud');
  await sleep(2500);

  const hud = () => page.evaluate(() => {
    const root = document.querySelector('.farm-hud');
    const visible = (element) => element.checkVisibility() && element.getBoundingClientRect().width > 0;
    const rectOf = (element) => { const rect = element.getBoundingClientRect(); return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
    return {
      layout: [...root.classList].filter((name) => name.startsWith('farm-overview') || name.startsWith('farm-play')),
      buttons: [...root.querySelectorAll('button')].filter(visible).map((element) => ({ text: (element.getAttribute('aria-label') ?? element.textContent).trim(), ...rectOf(element) })),
      cameraPad: [...root.querySelectorAll('.farm-camera button')].filter(visible).map((element) => (element.getAttribute('aria-label') ?? element.textContent).trim()),
      joystick: [...root.querySelectorAll('.ks-joystick')].filter(visible).map((element) => ({ label: element.getAttribute('aria-label'), role: element.getAttribute('role'), ...rectOf(element) })),
      contextButtons: [...root.querySelectorAll('.ks-touch-button')].filter(visible).map((element) => (element.getAttribute('aria-label') ?? element.textContent).trim()),
      innerWidth,
    };
  });

  // Overview.
  const overview = await hud();
  results.observed.overview = overview;
  await page.screenshot({ path: join(screenshotDirectory, 'farm-overview-touch-390.png') });
  check('The overview uses the touch layout', overview.layout.includes('farm-overview-touch'), overview.layout);
  check('The overview offers one camera tap target and no arrow, plus or minus pad', overview.cameraPad.length === 1 && !overview.cameraPad.some((text) => PAD.has(text)), overview.cameraPad);
  check('No control in the overview is a pad key', !overview.buttons.some((button) => PAD.has(button.text)), overview.buttons.map((button) => button.text));
  check('Every overview control is inside the window and at least 44 px each way', overview.buttons.every((button) => button.left >= 0 && button.right <= overview.innerWidth && button.width >= 44 && button.height >= 44), overview.buttons);

  // Walk: the joystick and at most one context tap target.
  const walk = overview.buttons.find((button) => button.text === 'Walk the farm');
  check('The overview has a Walk the farm control', Boolean(walk));
  if (walk) {
    await page.touchscreen.tap(walk.left + walk.width / 2, walk.top + walk.height / 2);
    await page.waitForSelector('.farm-hud.farm-play-touch', { timeout: 60000 });
    await sleep(2500);
    const play = await hud();
    results.observed.play = play;
    await page.screenshot({ path: join(screenshotDirectory, 'farm-play-touch-390.png') });
    check('Walking uses the touch layout', play.layout.includes('farm-play-touch'), play.layout);
    check('The joystick is drawn, named and large enough to use', play.joystick.length === 1 && play.joystick[0].role === 'application' && play.joystick[0].width >= 100 && play.joystick[0].height >= 100, play.joystick);
    check('At most one context tap target', play.contextButtons.length <= 1, play.contextButtons);
    check('No control in play is a pad key', !play.buttons.some((button) => PAD.has(button.text)), play.buttons.map((button) => button.text));
    check('Every play control is inside the window', play.buttons.every((button) => button.left >= 0 && button.right <= play.innerWidth), play.buttons);
  }
  await page.close();
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, 'scene-touch.json'), JSON.stringify(results, null, 2));
  for (const item of results.checks) console.log(`${item.pass ? 'ok    ' : 'FAILED'} ${item.name}${item.detail === undefined ? '' : ` ${JSON.stringify(item.detail).slice(0, 200)}`}`);
}
assert.ok(results.checks.every((item) => item.pass), `Touch controls check failed: ${JSON.stringify(results.checks.filter((item) => !item.pass).map((item) => item.name))}`);
assert.equal(results.errors.length, 0, `The page threw: ${JSON.stringify(results.errors.slice(0, 3))}`);
console.log(`Scene touch gate passed: ${results.checks.length} checks.`);
