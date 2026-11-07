import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { sceneBrowserOptions } from '../../scenes/scripts/browser-options.mjs';
import { VIEWER_THREE_ALIAS } from './viewer-three-alias.mjs';

/**
 * What the 3D view draws, counted at the graphics API in a real browser.
 *
 *   node scripts/verify-viewer-draws.mjs <model.glb> <output-directory> [--backend webgpu,webgl2]
 *     [--view label:px,py,pz:tx,ty,tz ...] [--budget <draws>]
 *
 * The site's own viewer runtime is built into a small page and given the model. WebGPU pass encoders and WebGL2
 * contexts are wrapped before any page script runs, so the counts are the calls the browser receives, per frame:
 * after the model loads the page must go idle (no draws while nothing changes), an orbit step must draw, and each
 * saved camera is counted and photographed. `--budget` fails the run when any frame draws more than that.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Runs in the page before its scripts. Counts every draw and groups the counts by animation frame. */
export function installDrawCounter() {
  const state = { frames: [], current: { draws: 0, triangles: 0, instanced: 0 }, blocked: [] };
  window.kilnDraws = state;
  // Main-thread tasks over 50 ms, such as a shader compile the page has to wait for.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.blocked.push(Math.round(entry.duration));
  }).observe({ type: 'longtask', buffered: true });
  const count = (vertices, instances, mode) => {
    state.current.draws += 1;
    if (instances > 1) state.current.instanced += 1;
    if (mode === undefined || mode === 4) state.current.triangles += (vertices / 3) * instances;
  };
  for (const prototype of [globalThis.WebGL2RenderingContext?.prototype].filter(Boolean)) {
    const wrap = (name, read) => {
      const original = prototype[name];
      prototype[name] = function (...args) {
        read(this, args);
        return original.apply(this, args);
      };
    };
    wrap('drawElements', (gl, a) => count(a[1], 1, a[0] === gl.TRIANGLES ? 4 : 0));
    wrap('drawArrays', (gl, a) => count(a[2], 1, a[0] === gl.TRIANGLES ? 4 : 0));
    wrap('drawElementsInstanced', (gl, a) => count(a[1], a[4], a[0] === gl.TRIANGLES ? 4 : 0));
    wrap('drawArraysInstanced', (gl, a) => count(a[2], a[3], a[0] === gl.TRIANGLES ? 4 : 0));
  }
  const pass = globalThis.GPURenderPassEncoder?.prototype;
  if (pass) {
    for (const [name, read] of [
      ['draw', (a) => count(a[0], a[1] ?? 1)],
      ['drawIndexed', (a) => count(a[0], a[1] ?? 1)],
    ]) {
      const original = pass[name];
      pass[name] = function (...args) {
        read(args);
        return original.apply(this, args);
      };
    }
  }
  const tick = () => {
    if (state.current.draws > 0) state.frames.push({ ...state.current, at: Math.round(performance.now()) });
    state.current = { draws: 0, triangles: 0, instanced: 0 };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Build the harness page into `outDir`. */
export async function buildHarness(outDir) {
  const { build } = await import('vite');
  await rm(outDir, { recursive: true, force: true });
  await build({
    configFile: false,
    envDir: false,
    root: SITE,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: [VIEWER_THREE_ALIAS] },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'esnext',
      sourcemap: false,
      reportCompressedSize: false,
      modulePreload: false,
      chunkSizeWarningLimit: 8192,
      rollupOptions: { input: { harness: resolve(SITE, 'scripts/viewer-draws-harness.ts') }, output: { entryFileNames: 'harness.js' } },
    },
  });
  await writeFile(join(outDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>viewer draws</title><style>.h-viewer{height:540px}body{margin:0}</style><div id="viewer"></div><script type="module" src="./harness.js"></script>');
}

function serve(root, glbPath) {
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://127.0.0.1');
      if (pathname === '/favicon.ico') return void response.writeHead(204).end();
      if (pathname === '/model.glb') return void response.writeHead(200, { 'content-type': 'model/gltf-binary' }).end(await readFile(glbPath));
      const file = pathname === '/' ? '/index.html' : pathname;
      if (file.includes('..')) return void response.writeHead(400).end();
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'content-type': type }).end(await readFile(join(root, file)));
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((closed) => server.close(closed)) })));
}

/** Frames recorded since `from`, reduced to the heaviest. */
const heaviest = async (page, from) => page.evaluate((start) => {
  const frames = window.kilnDraws.frames.slice(start);
  return { frames: frames.length, draws: Math.max(0, ...frames.map((frame) => frame.draws)), triangles: Math.max(0, ...frames.map((frame) => frame.triangles)), instanced: Math.max(0, ...frames.map((frame) => frame.instanced)), all: frames.slice(0, 6).map((frame) => frame.draws) };
}, from);
const frameCount = (page) => page.evaluate(() => window.kilnDraws.frames.length);

async function measure(browser, origin, backend, views, output) {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console error: ${message.text()}`); });
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installDrawCounter);
    const query = new URLSearchParams({ backend, views: JSON.stringify(views) });
    const started = Date.now();
    await page.goto(`${origin}/?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas[data-viewer-backend]', { timeout: 60000 });
    const actual = await page.$eval('canvas[data-viewer-backend]', (canvas) => canvas.dataset.viewerBackend);
    // The model is in when a frame draws more than the view's own ground and the page then goes quiet.
    await page.waitForFunction(() => window.kilnDraws.frames.some((frame) => frame.draws > 4), { timeout: 180000 });
    // The view buttons are enabled once the model's shaders are built. Before that the page draws nothing while it
    // compiles, which would pass for going quiet, and a view clicked then is ignored.
    await page.waitForFunction(
      () => ![...document.querySelectorAll('section[aria-label="3D inspection controls"] button')].some((button) => button.disabled),
      { timeout: 240000 },
    );
    let quiet = 0;
    let last = await frameCount(page);
    while (quiet < 2000 && Date.now() - started < 240000) {
      await sleep(250);
      const now = await frameCount(page);
      quiet = now === last ? quiet + 250 : 0;
      last = now;
    }
    const firstFrameMs = Date.now() - started - quiet;
    // When the model first drew, on the page's own clock, and the longest the page could not respond while loading. The
    // environment map's build comes first and draws many calls but few triangles, so the model's frame is told by those.
    const { modelShownMs, longestBlockMs } = await page.evaluate(() => {
      const { frames, blocked } = window.kilnDraws;
      const most = Math.max(0, ...frames.map((frame) => frame.triangles));
      return {
        modelShownMs: frames.find((frame) => frame.triangles >= most / 2)?.at ?? null,
        longestBlockMs: Math.max(0, ...blocked),
      };
    });
    const load = await heaviest(page, 0);
    const idleFrom = await frameCount(page);
    await sleep(2000);
    const idle = await heaviest(page, idleFrom);
    const orbitFrom = await frameCount(page);
    await page.click('button[aria-label="Orbit left"]');
    await sleep(1500);
    const orbit = await heaviest(page, orbitFrom);
    await page.click('button[aria-label="Orbit right"]');
    await sleep(1500);
    const canvas = await page.$('canvas[data-viewer-backend]');
    const pictures = {};
    const framed = join(output, `${backend}-framed.png`);
    await canvas.screenshot({ path: framed });
    pictures.framed = framed;
    const counted = {};
    for (const view of views) {
      const [button] = await page.$$(`xpath/.//button[normalize-space()='${view.label}']`);
      const from = await frameCount(page);
      await button.click();
      await sleep(1500);
      counted[view.label] = await heaviest(page, from);
      const picture = join(output, `${backend}-${view.label.replace(/[^a-z0-9]+/gi, '-')}.png`);
      await canvas.screenshot({ path: picture });
      pictures[view.label] = picture;
    }
    const failures = await page.evaluate(() => window.kilnViewerFailures);
    return { requested: backend, backend: actual, firstFrameMs, modelShownMs, longestBlockMs, load, idle, orbit, views: counted, pictures, failures, problems };
  } finally {
    await page.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const take = (name) => { const found = []; for (let i = 0; i < args.length; i++) if (args[i] === name) found.push(args[i + 1]); return found; };
  const valued = new Set(['--backend', '--view', '--budget']);
  const [glb, review] = args.filter((arg, index) => !arg.startsWith('--') && !valued.has(args[index - 1]));
  if (!glb || !review) throw new Error('Usage: node scripts/verify-viewer-draws.mjs <model.glb> <output-directory> [--backend webgpu,webgl2] [--view label:px,py,pz:tx,ty,tz] [--budget <draws>]');
  const backends = (take('--backend')[0] ?? 'webgpu,webgl2').split(',');
  const budget = take('--budget')[0] ? Number(take('--budget')[0]) : undefined;
  const views = take('--view').map((spec) => {
    const [label, position, target] = spec.split(':');
    return { label, position: position.split(',').map(Number), target: target.split(',').map(Number) };
  });
  await mkdir(review, { recursive: true });
  const built = join(review, 'harness');
  await buildHarness(built);
  const { origin, stop } = await serve(built, resolve(glb));
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), pipe: true, ...sceneBrowserOptions({ args: ['--no-sandbox', '--enable-unsafe-webgpu'] }) });
  const results = { glb: resolve(glb), browser: await browser.version(), runs: [] };
  try {
    for (const backend of backends) results.runs.push(await measure(browser, origin, backend, views, review));
  } finally {
    await browser.close();
    await stop();
  }
  await writeFile(join(review, 'draws.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  const errors = [];
  for (const run of results.runs) {
    if (run.idle.frames > 0) errors.push(`${run.requested}: ${run.idle.frames} frames drew while nothing changed`);
    if (run.orbit.frames === 0) errors.push(`${run.requested}: an orbit step drew nothing`);
    if (run.failures.length || run.problems.length) errors.push(`${run.requested}: ${[...run.failures, ...run.problems].join('; ')}`);
    if (budget !== undefined && Math.max(run.load.draws, run.orbit.draws) > budget) errors.push(`${run.requested}: ${Math.max(run.load.draws, run.orbit.draws)} draws in a frame, over the budget of ${budget}`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}
