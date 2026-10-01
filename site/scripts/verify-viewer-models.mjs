import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { chromeExecutable } from './build-site-media.mjs';

/**
 * Every reviewed asset's 3D view, in a real browser, receives the exact file the site pins and draws it.
 *
 *   node scripts/verify-viewer-models.mjs <site-url> <output-directory> [screenshot-directory]
 *
 * The 30 models of the build plan (`src/data/commons-build.json`: 23 Farm, 6 vehicles, the bridge) are each opened
 * through their own asset page's Open control. For each one the check waits for the model request the viewer
 * makes, requires the response to carry the planned byte count and SHA-256 (the URL carries the revision), then
 * requires a canvas that has drawn a solid shape other than the viewer's backdrop, with no page error and no console
 * error. It is a check on delivery and drawing; how the picture is lit is checked by verify-viewer-rig.mjs and
 * verify-viewer-tone.mjs. The Golden Gate bridge is the 12 MB full tier and gets a longer allowance.
 *
 * "Drawn" has to mean a model. The viewer draws a grid and a loading line before any model arrives (2% of the canvas
 * differs from the backdrop with the model request held back), so a share of differing pixels would pass a blank
 * viewer. The measure counts only solid pixels: a pixel counts when it and its eight neighbours all differ from the
 * backdrop, which a one or two pixel grid line or a letter stroke never does. Before it runs on the 30 models the
 * script runs the same viewer with the model request held back, and that canvas has to stay a tenth under the minimum.
 */
const BACKDROP = [0xaa, 0xb1, 0xbc];
const DRAWN_MINIMUM = 0.002;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const slugOf = (output) => output.split('/').at(-1).replace(/\.glb$/, '');

/**
 * The share of a picture's pixels that are solid drawing: a pixel counts when it and every neighbour inside the picture
 * differ from the viewer's backdrop by more than a few levels in some channel. Lines one or two pixels wide do not count.
 */
export async function drawnFraction(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const differs = new Uint8Array(width * height);
  for (let pixel = 0; pixel < differs.length; pixel += 1) {
    const at = pixel * channels;
    differs[pixel] = Math.abs(data[at] - BACKDROP[0]) > 6 || Math.abs(data[at + 1] - BACKDROP[1]) > 6 || Math.abs(data[at + 2] - BACKDROP[2]) > 6 ? 1 : 0;
  }
  let solid = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let all = differs[y * width + x] === 1;
      for (let dy = -1; all && dy <= 1; dy += 1) {
        for (let dx = -1; all && dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && differs[ny * width + nx] !== 1) all = false;
        }
      }
      if (all) solid += 1;
    }
  }
  return solid / (width * height);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, review, screenshotDirectory = join(review ?? '', 'screenshots')] = process.argv.slice(2);
  if (!base || !review) throw new Error('Usage: node scripts/verify-viewer-models.mjs <site-url> <output-directory> [screenshot-directory]');
  const plan = JSON.parse(await readFile(new URL('../src/data/commons-build.json', import.meta.url), 'utf8'));
  await mkdir(screenshotDirectory, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, pipe: true, args: ['--no-sandbox'] });
  const results = { browser: await browser.version(), models: [], failures: [] };
  try {
    // The control that gives "drawn" its meaning: the same viewer, its model request held back, has a canvas with the
    // backdrop and whatever chrome the viewer draws without a model (grid, shadows). That has to stay under the minimum, or
    // a canvas above it would not prove a model was drawn.
    const control = await browser.newPage();
    try {
      await control.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
      await control.setRequestInterception(true);
      control.on('request', (request) => {
        if (new URL(request.url()).pathname.endsWith('.glb')) return; // Held: never continued, never answered.
        request.continue();
      });
      await control.goto(new URL(`/gallery/${slugOf(plan.models[0].output)}/`, base).href, { waitUntil: 'domcontentloaded' });
      await control.click('[data-open]');
      await control.waitForSelector('[data-mount] canvas', { timeout: 45000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const picture = await (await control.$('[data-mount] canvas')).screenshot({ type: 'png' });
      results.control = { model: 'held back', drawnFraction: Number((await drawnFraction(picture)).toFixed(4)), minimum: DRAWN_MINIMUM };
      console.log(`control: with the model request held back the canvas shows ${results.control.drawnFraction} drawn (must be at most ${DRAWN_MINIMUM / 10}, a tenth of the minimum ${DRAWN_MINIMUM})`);
      assert.ok(results.control.drawnFraction <= DRAWN_MINIMUM / 10, 'the viewer without a model already counts as drawn; the check cannot tell a model from the viewer chrome');
    } finally {
      await control.close();
    }
    for (const model of plan.models) {
      const slug = slugOf(model.output);
      const row = { slug, output: model.output, plannedBytes: model.bytes, plannedSha256: model.sha256 };
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      try {
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(new URL(`/gallery/${slug}/`, base).href, { waitUntil: 'networkidle0' });
        row.dataModel = await page.$eval('asset-viewer', (element) => element.dataset.model);
        assert.ok(row.dataModel.startsWith(`/${model.output}?revision=`), `the viewer names ${row.dataModel}, the plan says /${model.output}`);
        const allowance = slug === 'golden-gate-bridge' ? 180000 : 45000;
        const response = page.waitForResponse((candidate) => new URL(candidate.url()).pathname === `/${model.output}` && candidate.request().method() === 'GET', { timeout: allowance });
        await page.click('[data-open]');
        const received = await response;
        const bytes = await received.buffer();
        row.receivedBytes = bytes.length;
        row.receivedSha256 = sha256(bytes);
        assert.equal(bytes.length, model.bytes, 'byte count differs from the plan');
        assert.equal(row.receivedSha256, model.sha256, 'SHA-256 differs from the plan');
        await page.waitForSelector('[data-mount] canvas', { timeout: allowance });
        await page.waitForNetworkIdle({ idleTime: 750, timeout: allowance });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const canvas = await page.$('[data-mount] canvas');
        const picture = await canvas.screenshot({ type: 'png' });
        row.drawnFraction = Number((await drawnFraction(picture)).toFixed(4));
        assert.ok(row.drawnFraction >= DRAWN_MINIMUM, `only ${row.drawnFraction} of the canvas differs from the backdrop`);
        if (['farmhouse', 'sedan', 'golden-gate-bridge', 'tractor'].includes(slug)) await canvas.screenshot({ path: join(screenshotDirectory, `${slug}-1440.png`) });
        assert.deepEqual(errors, [], `page or console errors: ${JSON.stringify(errors.slice(0, 2))}`);
        row.pass = true;
      } catch (error) {
        row.pass = false;
        row.error = String(error.message ?? error).slice(0, 300);
        results.failures.push(slug);
      } finally {
        await page.close();
      }
      results.models.push(row);
      console.log(`${row.pass ? 'ok    ' : 'FAILED'} ${slug.padEnd(24)} ${String(row.receivedBytes ?? '-').padStart(9)} B  sha256 ${(row.receivedSha256 ?? '-').slice(0, 12)}  drawn ${row.drawnFraction ?? '-'}${row.error ? `  ${row.error}` : ''}`);
    }
  } finally {
    await browser.close();
    await mkdir(review, { recursive: true });
    await writeFile(join(review, 'viewer-models.json'), JSON.stringify(results, null, 2));
  }
  console.log(results.failures.length ? `FAILED: ${results.failures.join(', ')}` : `Viewer models gate passed: ${results.models.length} models received byte for byte and drawn.`);
  process.exitCode = results.failures.length ? 1 : 0;
}
