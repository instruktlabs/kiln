import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';

/**
 * Check, in a real browser, that the site viewer's lighting reproduces the review rig.
 *
 *   node scripts/verify-viewer-rig.mjs --chart C:/.../engine-work/review-lighting --out review/round-2/viewer-rig [--tolerance 3]
 *
 * The rig's calibration chart (`assets/calibration.glb`: 48 patches, two roughness values, four panel
 * orientations: key, up, side, away) is rendered from the rig's four fixed cameras with the viewer's own
 * `applyReviewRig`, in a WebGL renderer built into a small page by Vite. The median of each patch's central
 * 11x11 pixels is compared with `measurements/review-neutral-v1.json`, which the engine's render service
 * measured on the same chart (WebGPU, Dawn/D3D12). Nothing is written next to the chart; the evidence goes to
 * `--out`. It needs Chrome or Chromium (CHROME_PATH) and the site's installed dependencies.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The largest difference measured between this viewer (WebGL, ANGLE/D3D11) and the rig (WebGPU, Dawn/D3D12) is one
// byte; a byte or two more is allowed for another GPU driver's rounding.
export const CHART_TOLERANCE_BYTES = 2;

/** Build the harness page (`viewer-rig-harness.ts` and everything it imports) into `outDir`. */
export async function buildHarness(outDir) {
  const { build } = await import('vite');
  await rm(outDir, { recursive: true, force: true });
  await build({
    configFile: false,
    envDir: false,
    root: SITE,
    logLevel: 'warn',
    publicDir: false,
    resolve: { dedupe: ['three'] },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      reportCompressedSize: false,
      modulePreload: false,
      chunkSizeWarningLimit: 4096,
      rollupOptions: { input: { harness: resolve(SITE, 'scripts/viewer-rig-harness.ts') }, output: { entryFileNames: 'harness.js', codeSplitting: false } },
    },
  });
  await writeFile(join(outDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>viewer rig harness</title><script type="module" src="./harness.js"></script>');
}

/** Serve the built harness and the chart's GLB on a loopback port; resolves with the origin and a stop function. */
async function serve(root, glb) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') return void response.writeHead(204).end();
      if (url.pathname === '/calibration.glb') return void response.writeHead(200, { 'content-type': 'model/gltf-binary' }).end(glb);
      const file = url.pathname === '/' ? '/index.html' : url.pathname;
      if (file.includes('..')) return void response.writeHead(400).end();
      const body = await readFile(join(root, file));
      response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((done) => server.close(done)) };
}

/**
 * What differs between the viewer's rig values and the preset a rig render receipt recorded. The receipts of
 * the chart renders name the preset in full: environment, exposure, hemisphere, the three lights and shadows.
 * (Their tone mapping is named after the prototype that was measured, so it is compared by constants elsewhere.)
 */
export function presetDifferences(rig, preset) {
  const differences = [];
  const same = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) differences.push(`${label}: viewer ${JSON.stringify(a)}, receipt ${JSON.stringify(b)}`); };
  same('id', rig.id, preset.id);
  same('exposure', rig.exposure, preset.exposure);
  same('environment', { type: rig.environment.type, sigma: rig.environment.sigma, intensity: rig.environment.intensity }, preset.environment);
  same('hemisphere', { type: 'hemisphere', ...rig.hemisphere }, preset.ambient);
  for (const role of ['key', 'fill', 'rim']) same(role, { enabled: true, color: rig[role].color, intensity: rig[role].intensity, position: [...rig[role].position], castsShadow: false }, preset[role]);
  same('sun', { enabled: false }, preset.sun);
  same('shadows', rig.shadows, preset.shadows.enabled);
  return differences;
}

/** Compare the browser's patch medians with the rig's own measurement of the same chart. */
export function compareChart(measured, browser) {
  const key = (orientation, patch, roughness) => `${orientation}/${patch}/${roughness}`;
  const rig = new Map(measured.map((entry) => [key(entry.orientation, entry.patch, entry.roughness), entry]));
  const groups = [];
  for (const group of browser) {
    const deltas = [];
    for (const sample of group.samples) {
      const reference = rig.get(key(group.name, sample.patch, sample.roughness));
      if (!reference) throw new Error(`The rig has no measurement for ${group.name} patch ${sample.patch} roughness ${sample.roughness}`);
      const delta = sample.rgb.map((value, index) => value - reference.rgb[index]);
      deltas.push({ name: reference.name, roughness: sample.roughness, viewer: sample.rgb, rig: reference.rgb, delta, worst: Math.max(...delta.map(Math.abs)) });
    }
    const all = deltas.flatMap((entry) => entry.delta.map(Math.abs));
    const within = (limit) => all.filter((value) => value <= limit).length / all.length;
    groups.push({
      group: group.name,
      patches: deltas.length,
      meanAbs: all.reduce((sum, value) => sum + value, 0) / all.length,
      meanSigned: deltas.flatMap((entry) => entry.delta).reduce((sum, value) => sum + value, 0) / all.length,
      maxAbs: Math.max(...all),
      within: { 0: within(0), 1: within(1), 2: within(2), 3: within(3) },
      worst: [...deltas].sort((a, b) => b.worst - a.worst).slice(0, 5),
    });
  }
  const all = groups.flatMap((group) => [group.maxAbs]);
  return { groups, maxAbs: Math.max(...all), meanAbs: groups.reduce((sum, group) => sum + group.meanAbs, 0) / groups.length };
}

async function main(argv = process.argv.slice(2)) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const chartDir = option('--chart');
  const out = option('--out');
  if (!chartDir || !out) throw new Error('Usage: node scripts/verify-viewer-rig.mjs --chart DIR --out DIR [--tolerance BYTES]');
  const tolerance = Number(option('--tolerance', CHART_TOLERANCE_BYTES));
  const chart = JSON.parse(await readFile(join(chartDir, 'assets/chart.json'), 'utf8'));
  const glb = await readFile(join(chartDir, 'assets/calibration.glb'));
  if (sha256(glb) !== chart.glbSha256) throw new Error(`calibration.glb is ${sha256(glb)}, the chart names ${chart.glbSha256}`);
  const measured = JSON.parse(await readFile(join(chartDir, 'measurements/review-neutral-v1.json'), 'utf8'));

  const harness = join(SITE, '.cache/viewer-rig-harness');
  await buildHarness(harness);
  const server = await serve(harness, glb);
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`); });
    await page.goto(`${server.origin}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.kilnRigChart === 'function', { timeout: 30000 });
    const rendered = await page.evaluate((request) => window.kilnRigChart(request), { glbUrl: `${server.origin}/calibration.glb`, width: chart.width, height: chart.height, groups: chart.groups });
    const comparison = compareChart(measured, rendered.results);
    // The chart renders' own receipts: same GLB, same preset values, backdrop pixels at the corners.
    const receipts = [];
    for (const group of chart.groups) {
      const receipt = JSON.parse(await readFile(join(chartDir, `images/charts/${rendered.rig.id}/${group.name}.receipt.json`), 'utf8'));
      const corners = rendered.results.find((entry) => entry.name === group.name).corners;
      receipts.push({ group: group.name, sameGlb: receipt.glbSha256 === chart.glbSha256, differences: presetDifferences(rendered.rig, receipt.preset), backdropCorners: { rig: receipt.corners, viewer: corners, equal: JSON.stringify(receipt.corners) === JSON.stringify(corners) }, rendererId: receipt.rendererId });
    }
    const previousRun = await page.evaluate((request) => window.kilnRigChart(request), { lighting: 'previous', glbUrl: `${server.origin}/calibration.glb`, width: chart.width, height: chart.height, groups: chart.groups });
    const previous = compareChart(measured, previousRun.results);
    await mkdir(out, { recursive: true });
    const images = {};
    for (const group of rendered.results) {
      const bytes = Buffer.from(group.png.replace(/^data:image\/png;base64,/, ''), 'base64');
      await writeFile(join(out, `${group.name}.png`), bytes);
      images[group.name] = { bytes: bytes.length, sha256: sha256(bytes), corners: group.corners };
    }
    const report = {
      chart: { glbSha256: chart.glbSha256, width: chart.width, height: chart.height, sampling: chart.sampling },
      viewer: { module: 'src/lib/review-rig-three.ts (applyReviewRig)', usesReviewNeutral: rendered.usesReviewNeutral, three: rendered.three },
      browser: { version: await browser.version(), renderedBy: rendered.renderedBy },
      tolerance,
      receipts,
      ...comparison,
      previousViewerLighting: { note: 'The lighting the viewer had before it followed the rig, measured against the same chart; for comparison, not gated.', groups: previous.groups.map(({ group, meanAbs, meanSigned, maxAbs }) => ({ group, meanAbs, meanSigned, maxAbs })), meanAbs: previous.meanAbs, maxAbs: previous.maxAbs },
      images,
      errors,
    };
    await writeFile(join(out, 'viewer-rig-verify.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Viewer lighting vs review-neutral-v1 chart (${rendered.renderedBy}; three r${rendered.three}; Review Neutral shader: ${rendered.usesReviewNeutral})`);
    for (const group of comparison.groups) {
      console.log(`${group.group.padEnd(5)} ${group.patches} patches  mean |delta| ${group.meanAbs.toFixed(3)}  signed ${group.meanSigned.toFixed(3)}  max ${group.maxAbs}  within 1/2/3 bytes ${['1', '2', '3'].map((limit) => `${(group.within[limit] * 100).toFixed(1)}%`).join(' / ')}`);
    }
    console.log(`Before the change (previous viewer lighting, same chart): ${previous.groups.map((group) => `${group.group} mean |delta| ${group.meanAbs.toFixed(1)} (max ${group.maxAbs})`).join('; ')}`);
    console.log(`Backdrop corners: ${Object.entries(images).map(([name, image]) => `${name} ${JSON.stringify(image.corners[0])}`).join(', ')}`);
    if (errors.length) console.log(`Browser messages:\n${errors.join('\n')}`);
    for (const receipt of receipts) console.log(`Receipt ${receipt.group}: same GLB ${receipt.sameGlb}; ${receipt.differences.length ? receipt.differences.join('; ') : 'lights, exposure, environment and shadows identical to the recorded preset'}; backdrop corners equal ${receipt.backdropCorners.equal} (${JSON.stringify(receipt.backdropCorners.viewer[0])})`);
    const receiptFault = receipts.find((receipt) => !receipt.sameGlb || receipt.differences.length || !receipt.backdropCorners.equal);
    if (receiptFault) throw new Error(`The viewer's rig values disagree with the rig's ${receiptFault.group} receipt.`);
    if (!rendered.usesReviewNeutral) throw new Error('The viewer fell back to three’s own Neutral tone mapping; the rig’s mapper is not installed.');
    if (comparison.maxAbs > tolerance) throw new Error(`The viewer differs from the rig by up to ${comparison.maxAbs} bytes (tolerance ${tolerance}).`);
    console.log(`Every patch median is within ${tolerance} bytes of the rig's own measurement (largest ${comparison.maxAbs}).`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
