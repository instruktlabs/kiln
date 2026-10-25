import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { HOLODECK_PACKS, HOLODECK_SHOT_SIZE, HOLODECK_SHOTS } from './holodeck-spec.mjs';
import { readJson } from './media-pins.mjs';
import { hashBytes } from './mirror-core.mjs';
import { HOLODECK_WORLDS, holodeckWorld } from './stage-holodeck.mjs';

/**
 * Capture each pack's declared scene shots from its live Holodeck world with headless Chrome on WebGPU, interface
 * hidden, at the shot size. Each world loads in benchmark mode with the declared camera and settles before the
 * screenshot. The folder gets `<view>.png` and `receipt.json`, which names the world, the SHA-256 of its
 * `manifest.json` (read before and after the capture, so a deploy in between is refused), the camera, the backend
 * and browser; `stage-holodeck.mjs --shots --captures DIR` stages them. Needs a WebGPU-capable GPU.
 *
 *   node scripts/capture-holodeck-shots.mjs --out .localdata/holodeck-shots [--only view,view]
 */

export const CAPTURE_TOOL = 'scripts/capture-holodeck-shots.mjs';
const SETTLE_MS = 8000;
const HIDE_INTERFACE = 'aside.viewer-diagnostics, .diagnostics-toggle { display: none !important; }';

const manifestSha256 = async (world) => {
  const response = await fetch(new URL('manifest.json', world), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${world}manifest.json answered ${response.status}`);
  return hashBytes(Buffer.from(await response.arrayBuffer()));
};

export async function captureHolodeckShots({ out, only, size = HOLODECK_SHOT_SIZE, shots = HOLODECK_SHOTS, packs = HOLODECK_PACKS }) {
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
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
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
      await page.waitForFunction(() => window.holodeckPrototype?.ready && window.holodeckPrototype.drawCalls > 0, { timeout: 180_000 });
      await new Promise((done) => setTimeout(done, SETTLE_MS));
      await page.addStyleTag({ content: HIDE_INTERFACE });
      await new Promise((done) => setTimeout(done, 500));
      const png = Buffer.from(await page.screenshot({ type: 'png' }));
      const probe = await page.evaluate(() => { const p = window.holodeckPrototype; return { backend: p.backend, drawCalls: p.drawCalls, errors: p.errors ?? [] }; });
      await page.close();
      if (errors.length || probe.errors.length) throw new Error(`${view}: the world reported errors: ${[...errors, ...probe.errors].join('; ')}`);
      if (probe.backend !== 'WebGPU') throw new Error(`${view}: rendered on ${probe.backend}, not WebGPU`);
      if ((await manifestSha256(world)) !== before) throw new Error(`${view}: ${world} changed during the capture`);
      await writeFile(join(out, `${view}.png`), png);
      receipt.shots[view] = { world, manifestSha256: before, camera, backend: probe.backend, drawCalls: probe.drawCalls, browser: version, capturedAt: new Date().toISOString() };
      await writeFile(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
      console.log(JSON.stringify({ view, ...receipt.shots[view] }));
    }
  } finally {
    await browser.close();
  }
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--out') options.out = resolve(value);
    else if (flag === '--only') options.only = value.split(',');
    else throw new Error(`Unknown option ${flag}`);
  }
  await captureHolodeckShots(options);
}
