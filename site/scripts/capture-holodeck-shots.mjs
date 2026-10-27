import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { chromeExecutable } from './build-site-media.mjs';
import { HOLODECK_PACKS, HOLODECK_SHOT_SIZE, HOLODECK_SHOTS } from './holodeck-spec.mjs';
import { readJson } from './media-pins.mjs';
import { hashBytes } from './mirror-core.mjs';
import { HOLODECK_WORLDS, holodeckWorld } from './stage-holodeck.mjs';

/**
 * Capture each pack's declared scene shots from its live Holodeck world with Chrome on WebGPU, interface hidden, at
 * the shot size. Each world loads in benchmark mode with the declared camera and settles before the screenshot. The
 * folder gets `<view>.png` and `receipt.json`, which names the world, the SHA-256 of its `manifest.json` (read
 * before and after the capture, so a deploy in between is refused), the camera, the backend and browser, whether
 * Chrome ran headless or headed, how the shot settled and how far the frame still moved;
 * `stage-holodeck.mjs --shots --captures DIR` stages them. Needs a WebGPU-capable GPU.
 *
 *   node scripts/capture-holodeck-shots.mjs --out .localdata/holodeck-shots [--only view,view]
 *     [--headed] [--settle MS] [--drift MS] [--max-drift VALUE|off]
 *
 * On a Linux hybrid-GPU host, headless Chrome gets no GPU through PRIME offload: the world never reports a drawn
 * frame and the wait times out. Capture headed, with the offload variables exported -- Chrome inherits this
 * process's environment, so nothing here needs to pass them:
 *
 *   __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only __GLX_VENDOR_LIBRARY_NAME=nvidia \
 *     node scripts/capture-holodeck-shots.mjs --out .localdata/holodeck-shots --headed
 */

export const CAPTURE_TOOL = 'scripts/capture-holodeck-shots.mjs';
/**
 * How long to let a world settle when it publishes no readiness of its own. Meridian Sanctuary's sky light and
 * probe grid were still resolving at 8 s -- its mirror cubes came out black and its orbs showed only sky -- and
 * were right at 45 s.
 */
const SETTLE_MS = 45_000;
/** How far apart the two frames of the drift check are taken, and how long the hidden interface has to repaint. */
const DRIFT_MS = 2_000;
/** A converged frame differs between two captures only by dithering and tone-mapping noise. */
const MAX_DRIFT = 0.01;
const READY_MS = 180_000;
const HIDE_INTERFACE = 'aside.viewer-diagnostics, .diagnostics-toggle { display: none !important; }';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const SIGNALS = "['renderReady', 'skyLightReady', 'probeGridReady']";
/** The world has drawn at least one frame. */
export const WORLD_READY = 'window.holodeckPrototype?.ready && window.holodeckPrototype.drawCalls > 0';
/** Which readiness signals of its own the world publishes, if any. */
export const RENDER_SIGNALS = `${SIGNALS}.filter((name) => window.holodeckPrototype?.[name] !== undefined)`;
/** Every readiness signal the world publishes is true. Holodeck publishes none yet, so a settle stands in. */
export const RENDER_READY = `${SIGNALS}.map((name) => window.holodeckPrototype?.[name]).filter((signal) => signal !== undefined).every(Boolean)`;

/**
 * How far two captures of the same frame differ: the mean absolute difference of their luminance, 0..1. A converged
 * frame differs only by dithering and tone-mapping noise; a probe grid still filling in or a sky light still
 * resolving moves much further, which is exactly what a fixed wait photographed half-finished.
 */
export async function captureDrift(first, second) {
  const [a, b] = await Promise.all([first, second].map((png) => sharp(png).greyscale().raw().toBuffer()));
  if (a.length !== b.length) throw new Error(`The two captures are different sizes: ${a.length} and ${b.length} samples`);
  let total = 0;
  for (let index = 0; index < a.length; index++) total += Math.abs(a[index] - b[index]);
  return total / a.length / 255;
}

/**
 * Settle one open world and keep its frame. The world's own readiness decides when it publishes any; otherwise a
 * settle stands in, and either way the kept frame is the second of two taken `driftMs` apart, so a scene still
 * resolving is refused rather than photographed. A world that never reports a drawn frame says what to try, because
 * on a Linux hybrid-GPU host that is headless Chrome missing the GPU rather than a broken world.
 */
export async function settleAndShoot(page, { view, headless = true, settleMs = SETTLE_MS, driftMs = DRIFT_MS, maxDrift = MAX_DRIFT, readyMs = READY_MS }) {
  try { await page.waitForFunction(WORLD_READY, { timeout: readyMs }); }
  catch (error) {
    const advice = headless
      ? ' Headless Chrome gets no GPU through PRIME offload on a Linux hybrid-GPU host: capture with --headed and __NV_PRIME_RENDER_OFFLOAD=1, __VK_LAYER_NV_optimus=NVIDIA_only, __GLX_VENDOR_LIBRARY_NAME=nvidia exported.'
      : '';
    throw new Error(`${view}: the world reported no drawn frame within ${readyMs} ms.${advice}`, { cause: error });
  }
  const published = (await page.evaluate(RENDER_SIGNALS)) ?? [];
  let settled;
  if (published.length) {
    try { await page.waitForFunction(RENDER_READY, { timeout: readyMs }); }
    catch (error) { throw new Error(`${view}: the world did not become render-ready within ${readyMs} ms (${published.join(', ')})`, { cause: error }); }
    settled = published.join('+');
  } else {
    await pause(settleMs);
    settled = `settle:${settleMs}ms`;
  }
  await page.addStyleTag({ content: HIDE_INTERFACE });
  await pause(driftMs);
  const first = Buffer.from(await page.screenshot({ type: 'png' }));
  await pause(driftMs);
  const png = Buffer.from(await page.screenshot({ type: 'png' }));
  const drift = await captureDrift(first, png);
  if (maxDrift !== false && drift > maxDrift) {
    throw new Error(`${view}: the frame still moved ${drift.toFixed(4)} between captures ${driftMs} ms apart, over ${maxDrift}. Give it a longer --settle, or --max-drift off for a scene that animates.`);
  }
  return { png, settled, drift };
}

const manifestSha256 = async (world) => {
  const response = await fetch(new URL('manifest.json', world), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${world}manifest.json answered ${response.status}`);
  return hashBytes(Buffer.from(await response.arrayBuffer()));
};

export async function captureHolodeckShots({ out, only, headed = false, settleMs, driftMs, maxDrift, size = HOLODECK_SHOT_SIZE, shots = HOLODECK_SHOTS, packs = HOLODECK_PACKS }) {
  if (!out) throw new Error('An explicit output folder is required');
  const worlds = await readJson(HOLODECK_WORLDS);
  const jobs = packs.flatMap((pack) => (shots[pack.id] ?? []).map((shot) => ({ ...shot, world: holodeckWorld(worlds, pack.id) })))
    .filter((job) => !only || only.includes(job.view));
  if (only && jobs.length !== only.length) throw new Error(`No declared shot for ${only.filter((view) => !jobs.some((job) => job.view === view)).join(', ')}`);
  await mkdir(out, { recursive: true });
  // A retake keeps the receipt entries of the shots it leaves alone.
  let receipt = { tool: CAPTURE_TOOL, size, shots: {} };
  try {
    const prior = JSON.parse(await readFile(join(out, 'receipt.json'), 'utf8'));
    if (prior.tool === CAPTURE_TOOL && prior.size?.width === size.width && prior.size?.height === size.height) receipt = prior;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: !headed, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
  try {
    const version = await browser.version();
    for (const { view, camera, world } of jobs) {
      const before = await manifestSha256(world);
      const page = await browser.newPage();
      await page.setViewport(size);
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.evaluateOnNewDocument((scenario) => { window.holodeckBenchmarkScenario = scenario; }, { id: view, ...camera });
      const url = new URL(world); url.searchParams.set('benchmark', '1');
      await page.goto(url.href, { waitUntil: 'load', timeout: 120_000 });
      const { png, settled, drift } = await settleAndShoot(page, { view, headless: !headed, settleMs, driftMs, maxDrift });
      const probe = await page.evaluate(() => { const p = window.holodeckPrototype; return { backend: p.backend, drawCalls: p.drawCalls, errors: p.errors ?? [] }; });
      await page.close();
      if (errors.length || probe.errors.length) throw new Error(`${view}: the world reported errors: ${[...errors, ...probe.errors].join('; ')}`);
      if (probe.backend !== 'WebGPU') throw new Error(`${view}: rendered on ${probe.backend}, not WebGPU`);
      if ((await manifestSha256(world)) !== before) throw new Error(`${view}: ${world} changed during the capture`);
      await writeFile(join(out, `${view}.png`), png);
      receipt.shots[view] = { world, manifestSha256: before, camera, backend: probe.backend, drawCalls: probe.drawCalls, browser: version, chrome: headed ? 'headed' : 'headless', settled, drift, capturedAt: new Date().toISOString() };
      await writeFile(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
      console.log(JSON.stringify({ view, ...receipt.shots[view] }));
    }
  } finally {
    await browser.close();
  }
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = { headed: args.includes('--headed') };
  const rest = args.filter((arg) => arg !== '--headed');
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--out') options.out = resolve(value);
    else if (flag === '--only') options.only = value.split(',');
    else if (flag === '--settle') options.settleMs = Number(value);
    else if (flag === '--drift') options.driftMs = Number(value);
    else if (flag === '--max-drift') options.maxDrift = value === 'off' ? false : Number(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  for (const [flag, value] of [['--settle', options.settleMs], ['--drift', options.driftMs], ['--max-drift', options.maxDrift]]) {
    if (value !== undefined && value !== false && !(Number.isFinite(value) && value >= 0)) throw new Error(`${flag} takes a number of at least 0`);
  }
  await captureHolodeckShots(options);
}
