import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { chromeExecutable } from './build-site-media.mjs';

/**
 * Check, in a real browser, the tone mapping control of the 3D view.
 *
 *   node scripts/verify-viewer-tone.mjs <site-url> <output-directory> [screenshot-directory]
 *     [--baseline] [--compare <baseline.json> [--baseline-images <directory>]] [--repeat <loads>]
 *
 * Each page opens its 3D view and captures the canvas under the default tone mapping, ACES, Linear and the default again.
 * The control must be there, named, with the three choices and the default selected, work from the keyboard (the same picture
 * as choosing it with the mouse), change the picture, and putting the default back must restore the default picture. "The same
 * picture" is the tolerance below, not a hash: two renders of one state are not always byte-identical (the sedan's keyboard
 * picture has differed from its mouse picture in 3 pixels, by one level).
 *
 * `--baseline` records only the default picture (for a build that has no control yet). `--compare` requires the default
 * picture to be the one that build drew: byte for byte, or, because a fresh load of the same build is not always
 * byte-identical (the Farmhouse has been seen to differ by 9 to 23 of 679,200 pixels between loads of one build), within
 * 0.01% of the picture's pixels, which is far below the hundreds of thousands of pixels a different tone mapping changes.
 * The baseline's pictures are read from `--baseline-images` (default `<screenshot-directory>/before`). `--repeat 4` loads
 * each page that many times and records how far those loads of the default disagree, which is the noise the tolerance
 * must cover.
 */
const args = process.argv.slice(2);
const valued = ['--compare', '--repeat', '--baseline-images'];
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const positional = args.filter((arg, index) => !arg.startsWith('--') && !valued.includes(args[index - 1]));
const [base, review, screenshotDirectory = join(review ?? '', 'screenshots')] = positional;
if (!base || !review) throw new Error('Usage: node scripts/verify-viewer-tone.mjs <site-url> <output-directory> [screenshot-directory] [--baseline] [--compare <baseline.json>] [--baseline-images <directory>] [--repeat <loads>]');
const baselineOnly = flag('--baseline');
const baseline = option('--compare') ? JSON.parse(await readFile(option('--compare'), 'utf8')) : undefined;
const baselineImages = option('--baseline-images') ?? join(screenshotDirectory, 'before');
const repeat = Math.max(1, Number(option('--repeat') ?? 1));
/** The share of a picture's pixels that may differ from the same build's other loads before the default counts as changed. */
const NOISE_FRACTION = 0.0001;

// A reviewed Farm asset, a vehicle (declares MSFT_lod, painted metal) and one earlier example.
const routes = ['/gallery/farmhouse/', '/gallery/sedan/', '/gallery/archive/robot-arm/'];
const select = 'section[aria-label="3D inspection controls"] select[data-tone-mapping]';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const routeName = (route) => route.split('/').filter(Boolean).at(-1);

/** Mean absolute difference per colour channel, 0 to 255, between two RGBA buffers of one size. */
const meanDifference = (a, b) => {
  assert.equal(a.length, b.length, 'Pictures differ in size');
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return sum / ((a.length / 4) * 3);
};

/** How many pixels of two RGBA buffers of one size differ in any colour channel. */
const differingPixels = (a, b) => {
  assert.equal(a.length, b.length, 'Pictures differ in size');
  let count = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count += 1;
  return count;
};

/** Open the page, choose Open 3D view and wait until the model has loaded and settled. */
const openViewer = async (page, route) => {
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
  await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
  await page.click('asset-viewer [data-open]');
  await page.waitForSelector('asset-viewer canvas');
  await page.waitForFunction(() => ![...document.querySelectorAll('asset-viewer [role="status"]')].some((element) => element.textContent?.startsWith('Loading GLB')));
  await sleep(3000);
};

/** The 3D view's picture, as raw RGBA, and its hash; written to `file` when one is given. */
const grab = async (page, file) => {
  const canvas = await page.$('asset-viewer canvas');
  await canvas.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const png = await canvas.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (file) await writeFile(file, png);
  return { data, hash: sha256(data), width: info.width, height: info.height };
};

const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
const results = { browser: await browser.version(), rig: 'review-neutral-v1', repeat, noiseFraction: NOISE_FRACTION, pages: [], errors: [], consoleProblems: [] };
await mkdir(screenshotDirectory, { recursive: true });
try {
  for (const route of routes) {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (error) => results.errors.push({ route, message: error.message }));
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) results.consoleProblems.push({ route, type: message.type(), text: message.text().slice(0, 240) }); });
    const record = { route, checks: [] };
    const check = (name, pass, detail) => record.checks.push(detail === undefined ? { name, pass: Boolean(pass) } : { name, pass: Boolean(pass), detail });
    try {
      await openViewer(page, route);
      const capture = (name) => grab(page, join(screenshotDirectory, `${routeName(route)}-${name}.png`));
      const defaults = await capture('default');
      record.defaultHash = defaults.hash;
      record.size = [defaults.width, defaults.height];
      const allowedPixels = Math.ceil(defaults.width * defaults.height * NOISE_FRACTION);
      const control = await page.$(select);
      record.controlPresent = Boolean(control);
      if (baselineOnly) {
        results.pages.push(record);
        continue;
      }

      check('The control is there', control);
      if (control) {
        // Its name, its choices and the default.
        const state = await page.$eval(select, (element) => ({
          value: element.value,
          options: [...element.options].map((option) => ({ value: option.value, text: option.textContent })),
          label: element.closest('label')?.textContent?.replace(element.textContent ?? '', '').trim(),
        }));
        const accessibleName = (await page.accessibility.snapshot({ root: control, interestingOnly: false }))?.name ?? '';
        check('Named "Tone mapping"', accessibleName === 'Tone mapping', { accessibleName, label: state.label });
        check('Offers Neutral (default), ACES and Linear', JSON.stringify(state.options) === JSON.stringify([{ value: 'neutral', text: 'Neutral (default)' }, { value: 'aces', text: 'ACES' }, { value: 'linear', text: 'Linear' }]), state.options);
        check('Starts on the default', state.value === 'neutral', { value: state.value });

        // Choosing changes the picture, and the default puts it back exactly.
        await page.select(select, 'aces');
        await sleep(900);
        const aces = await capture('aces');
        await page.select(select, 'linear');
        await sleep(900);
        const linear = await capture('linear');
        await page.select(select, 'neutral');
        await sleep(900);
        const back = await capture('default-again');
        record.hashes = { default: defaults.hash, aces: aces.hash, linear: linear.hash, defaultAgain: back.hash };
        record.meanDifferences = {
          acesFromDefault: Number(meanDifference(defaults.data, aces.data).toFixed(3)),
          linearFromDefault: Number(meanDifference(defaults.data, linear.data).toFixed(3)),
          acesFromLinear: Number(meanDifference(aces.data, linear.data).toFixed(3)),
          defaultAgainFromDefault: Number(meanDifference(defaults.data, back.data).toFixed(3)),
        };
        record.differingPixels = {
          acesFromDefault: differingPixels(defaults.data, aces.data),
          linearFromDefault: differingPixels(defaults.data, linear.data),
          defaultAgainFromDefault: differingPixels(defaults.data, back.data),
        };
        check('ACES changes the picture', record.meanDifferences.acesFromDefault >= 1, record.meanDifferences);
        check('Linear changes the picture', record.meanDifferences.linearFromDefault >= 1);
        check('ACES and Linear differ from each other', record.meanDifferences.acesFromLinear >= 0.5);
        check('The default restores the picture', record.differingPixels.defaultAgainFromDefault <= allowedPixels, { defaultAgainFromDefault: record.meanDifferences.defaultAgainFromDefault, differingPixels: record.differingPixels.defaultAgainFromDefault, allowedPixels });

        // From the keyboard.
        await page.focus(select);
        await page.keyboard.press('ArrowDown');
        await sleep(900);
        const keyboardValue = await page.$eval(select, (element) => element.value);
        const keyboard = await capture('keyboard');
        record.differingPixels.keyboardFromMouseAces = differingPixels(aces.data, keyboard.data);
        check('Works from the keyboard', keyboardValue === 'aces' && record.differingPixels.keyboardFromMouseAces <= allowedPixels, { keyboardValue, differingFromMouseAces: record.differingPixels.keyboardFromMouseAces, allowedPixels });
        await page.select(select, 'neutral');
        await sleep(900);
      }

      // The default is the picture the build before the control drew.
      if (baseline) {
        const before = baseline.pages.find((item) => item.route === route);
        const reference = await sharp(join(baselineImages, `${routeName(route)}-default.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => undefined);
        const identical = before?.defaultHash === defaults.hash;
        const differing = identical ? 0 : reference && reference.data.length === defaults.data.length ? differingPixels(reference.data, defaults.data) : undefined;
        record.againstBaseline = { identical, differingPixels: differing, allowedPixels, ofPixels: defaults.width * defaults.height, before: before?.defaultHash, now: defaults.hash };
        check('The default picture is the one the build before the control drew', identical || (differing !== undefined && differing <= allowedPixels), record.againstBaseline);
        if (record.differingPixels) check('A changed tone mapping differs from that picture by far more than the tolerance', Math.min(record.differingPixels.acesFromDefault, record.differingPixels.linearFromDefault) > allowedPixels * 100, { allowedPixels, aces: record.differingPixels.acesFromDefault, linear: record.differingPixels.linearFromDefault });
      }

      // Fresh loads of the unchanged default: how far do they disagree with each other?
      if (repeat > 1) {
        const samples = [defaults];
        for (let load = 1; load < repeat; load += 1) {
          const again = await browser.newPage();
          again.setDefaultTimeout(120000);
          try {
            await openViewer(again, route);
            samples.push(await grab(again));
          } finally { await again.close(); }
        }
        record.noise = { loads: samples.length, distinctPictures: new Set(samples.map((sample) => sample.hash)).size, largestDifferingPixels: Math.max(...samples.map((sample) => differingPixels(defaults.data, sample.data))), allowedPixels, ofPixels: defaults.width * defaults.height };
        check('Fresh loads of the default agree to within the tolerance', record.noise.largestDifferingPixels <= allowedPixels, record.noise);
      }

      // A phone-width page: the control is reachable and nothing scrolls sideways.
      if (route === '/gallery/farmhouse/') {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
        await sleep(1200);
        const phone = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, left: rect?.left, right: rect?.right, height: rect?.height };
        }, select);
        check('At 390 px the control is inside the page and nothing scrolls sideways', phone.scrollWidth <= phone.innerWidth && phone.left >= 0 && phone.right <= phone.innerWidth && phone.height >= 44, phone);
        const controls = await page.$('section[aria-label="3D inspection controls"]');
        await controls.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await controls.screenshot({ path: join(screenshotDirectory, 'farmhouse-controls-390.png') });
        await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
      }
    } finally { await page.close(); }
    results.pages.push(record);
    console.log(`${route}: ${record.checks.filter((item) => item.pass).length}/${record.checks.length} tone checks; default ${record.defaultHash?.slice(0, 12)}${record.meanDifferences ? `; mean differences ${JSON.stringify(record.meanDifferences)}` : ''}${record.againstBaseline ? `; against the build before: ${record.againstBaseline.identical ? 'identical' : `${record.againstBaseline.differingPixels} of ${record.againstBaseline.ofPixels} pixels differ (allowed ${record.againstBaseline.allowedPixels})`}` : ''}${record.noise ? `; ${record.noise.loads} loads gave ${record.noise.distinctPictures} distinct picture(s), at most ${record.noise.largestDifferingPixels} pixels apart` : ''}`);
  }
} finally {
  await browser.close();
  await mkdir(review, { recursive: true });
  await writeFile(join(review, baselineOnly ? 'tone-baseline.json' : 'tone-checks.json'), JSON.stringify(results, null, 2));
}
if (!baselineOnly) {
  assert.ok(results.pages.every((item) => item.checks.every((entry) => entry.pass)), `Tone mapping check failed: ${JSON.stringify(results.pages.flatMap((item) => item.checks.filter((entry) => !entry.pass).map((entry) => `${item.route}: ${entry.name}`)))}`);
  assert.equal(results.errors.length, 0, 'A page threw a script exception.');
  assert.equal(results.consoleProblems.length, 0, `Console errors or warnings: ${JSON.stringify(results.consoleProblems.slice(0, 3))}`);
  console.log(`Tone mapping gate passed: ${results.pages.length} pages, ${results.pages.reduce((sum, item) => sum + item.checks.length, 0)} checks.`);
} else {
  console.log(`Baseline recorded for ${results.pages.length} pages.`);
}
