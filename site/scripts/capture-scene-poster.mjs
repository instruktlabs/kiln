import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { chromeExecutable } from './build-site-media.mjs';
import { imageRecord } from './generate-commons.mjs';
import { pinMirrorFile, readJson, upsertBy, writeJson } from './media-pins.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain', '.bin': 'application/octet-stream' };
export const POSTER_SIZE = { width: 1440, height: 925 };

/** Serve the staged `public/` directory (the scene's frame page, runtime chunk and verified pack) on a loopback port (0: a free one). */
export async function servePublic(root = resolve(SITE, 'public'), port = 0, pages = {}) {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)).replace(/^[/\\]+/, '');
    if (pages[path]) { response.writeHead(200, { 'content-type': 'text/html' }).end(pages[path]); return; }
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': statSync(file).size });
    createReadStream(file).pipe(response);
  });
  await new Promise((done, fail) => server.once('error', fail).listen(port, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

/**
 * Views a scene's own controls offer; each names the button that selects it (null keeps the opening view), or
 * the steps to take in order when the view is behind another control or reached by playing the scene: a
 * button's label, a held key, a drag from the middle of the view, a wheel turn or a wait.
 */
const VIEWS = {
  farm: {
    opening: null,
    // On foot behind Rowan: turn the camera to the pens and walk up to the sheep pen, with the cows beyond.
    walk: ['Walk the farm', { wait: 1500 }, { key: 's', ms: 3000 }, { drag: [430, 0] }, { key: 'w', ms: 12000 }],
  },
  'golden-gate': { day: null, 'golden-hour': 'Golden hour', fog: 'Fog', drive: 'Drive the sedan' },
  'foundry-floor': { campus: 'One pair', interior: ['Enter the fab', 'Overview'] },
};

/**
 * Every scene is pictured by two captures, one above the other: a wide view, then a closer one. A scene's
 * main view keeps its poster record; its other view is recorded beside it under `captures`. Foundry Floor
 * keeps both of its views under `captures`, because its main record is the pack's rig poster.
 */
const MAIN_VIEW = { farm: 'opening', 'golden-gate': 'drive' };

/** What each captured view shows, for the image's alternative text. */
const POSTER_ALT = {
  farm: {
    opening: 'Farm scene with a farmhouse, barn, fields, woodland and a stream.',
    walk: 'The farmer seen from behind in the Farm scene, standing at the sheep pen fence with cows, wheat and pumpkins beyond.',
  },
  'foundry-floor': {
    campus: 'The Foundry Floor campus from above: paired fab buildings along a central road, with parking and planting at the near entrance.',
    interior: 'The Foundry Floor fab interior from above: process tools in bays, joined by the loops of an overhead transport track.',
  },
  'golden-gate': {
    day: 'The Golden Gate Bridge scene from above the water by day: the full span between its two towers, with the headlands on either side.',
    drive: 'A blue sedan driving across the deck of the Golden Gate Bridge scene, with traffic around it and both towers ahead.',
  },
};

/**
 * A poster is a capture of the scene itself: its staged frame page in headless Chrome at a fixed window
 * size, the scene's own view button pressed, the scene's controls hidden, a fixed settle time. Nothing is
 * composited or retouched. The result is a lossless PNG; the media pipeline derives the site's variants.
 */
export async function captureScenePoster({ scene = 'golden-gate', view = 'day', settleMs = 6000, size = POSTER_SIZE, port = 0 } = {}) {
  const buttons = VIEWS[scene];
  if (!buttons || !(view in buttons)) throw new Error(`Unknown scene view: ${scene}/${view}`);
  const pages = {};
  if (scene === 'farm') {
    const runtime = await readJson(resolve(SITE, 'public/scene-runtime/farm/runtime.json'));
    const pack = (await readJson(resolve(SITE, 'src/data/scene-packs.json'))).farm;
    pages['farm-poster.html'] = `<!doctype html><html lang="en"><title>Farm poster capture</title><style>html,body,#scene{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="scene"></div><script type="module">import {mount} from ${JSON.stringify(runtime.url)};mount(document.getElementById('scene'),{assetBase:${JSON.stringify(pack.base)},onReady(){document.body.dataset.ready='true'},onError(error){throw error}});</script></html>`;
  }
  const server = await servePublic(undefined, port, pages);
  // Over a pipe: no DevTools port is opened.
  const browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    pipe: true,
    args: ['--no-sandbox', `--window-size=${size.width},${size.height}`],
    defaultViewport: { ...size, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${server.origin}/${scene === 'farm' ? 'farm-poster.html' : `scene-runtime/${scene}/frame.html`}`, { waitUntil: 'load' });
    await page.waitForFunction(() => (document.body.dataset.ready === 'true' || document.getElementById('page-status')?.dataset.state === 'ready' || document.getElementById('page-status')?.textContent.trim() === '') && document.querySelector('.ks-root canvas'), { timeout: 180_000 });
    const middle = [size.width / 2, size.height / 2];
    for (const step of [buttons[view] ?? []].flat()) {
      if (typeof step !== 'string') {
        if (step.wait) await new Promise((done) => setTimeout(done, step.wait));
        if (step.key) { await page.focus('.ks-root'); await page.keyboard.down(step.key); await new Promise((done) => setTimeout(done, step.ms)); await page.keyboard.up(step.key); }
        if (step.drag) { await page.mouse.move(...middle); await page.mouse.down(); await page.mouse.move(middle[0] + step.drag[0], middle[1] + step.drag[1], { steps: 10 }); await page.mouse.up(); }
        if (step.wheel) { await page.mouse.move(...middle); await page.mouse.wheel({ deltaY: step.wheel }); }
        await new Promise((done) => setTimeout(done, 300));
        continue;
      }
      const label = step;
      // A control behind another one (the interior's views) appears only once the first has loaded its part.
      const button = await page.waitForFunction((text) => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === text && !candidate.disabled), { timeout: 60_000 }, label).catch(() => null);
      if (!button) throw new Error(`The scene has no "${label}" control`);
      await button.evaluate((element) => element.click());
    }
    await new Promise((done) => setTimeout(done, settleMs));
    // The scene's controls and any focus ring are chrome, not scene: hide them for the poster.
    await page.addStyleTag({ content: '.ks-hud,.ks-fade{display:none!important}.ks-root,.ks-root *{outline:none!important}' });
    await page.evaluate(() => document.activeElement?.blur?.());
    await new Promise((done) => setTimeout(done, 500));
    const canvas = await page.$('.ks-root canvas');
    const png = await canvas.screenshot({ type: 'png' });
    if (problems.length) throw new Error(`The scene reported page errors during capture: ${problems.join('; ')}`);
    const meta = await sharp(png).metadata();
    if (meta.width !== size.width || meta.height !== size.height) throw new Error(`Unexpected capture size ${meta.width}x${meta.height}`);
    return { png, browser: await browser.version() };
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * Add a captured poster to the media set: the PNG into the mirror, its pin in the mirror manifest, its image
 * plan entry, and the scene's media record with the capture's provenance (which build it was taken from,
 * with which browser, in which view). `fetch-mirror` derives the site variants from the pin.
 */
export async function recordScenePoster({ scene, view, png, browser, mirror, site = SITE }) {
  const packs = await readJson(join(site, 'src/data/scene-packs.json'));
  const pack = packs[scene];
  if (!pack) throw new Error(`No scene pack record for ${scene}`);
  const runtime = await readJson(join(site, 'public/scene-runtime', scene, 'runtime.json'));
  const alt = POSTER_ALT[scene]?.[view];
  if (!alt) throw new Error(`No poster description for ${scene}/${view}`);
  const path = `media/scenes/${scene}/${pack.release}/${scene}-scene-${view}.png`;
  const pin = await pinMirrorFile({ mirror, manifestFile: join(site, 'src/data/mirror-manifest.json'), path, bytes: png });
  const image = imageRecord(path, POSTER_SIZE.width, POSTER_SIZE.height, alt);
  const planFile = join(site, 'src/data/commons-build.json');
  const plan = await readJson(planFile);
  await writeJson(planFile, { ...plan, images: upsertBy(plan.images, 'inputPath', image) });
  const mediaFile = join(site, 'src/data/scene-media.json');
  const media = await readJson(mediaFile).catch(() => ({}));
  const record = {
    poster: image,
    capture: {
      tool: 'scripts/capture-scene-poster.mjs',
      view,
      release: pack.release,
      size: [POSTER_SIZE.width, POSTER_SIZE.height],
      browser,
      source: 'The staged scene runtime, captured from its canvas with controls hidden; nothing composited or retouched.',
      runtimeSha256: runtime.sha256,
      packJsonSha256: pack.packJsonSha256,
      pngBytes: pin.bytes,
      pngSha256: pin.sha256,
    },
  };
  // A scene's main view is its poster; every other view is kept under its name, beside whatever else it records.
  if (MAIN_VIEW[scene] === view) media[scene] = { ...media[scene], ...record };
  else media[scene] = { ...media[scene], captures: { ...media[scene]?.captures, [view]: record } };
  await writeJson(mediaFile, media);
  if (scene === 'farm' && MAIN_VIEW.farm === view) {
    const farmFile = join(site, 'src/data/packs/farm.json');
    const farm = await readJson(farmFile);
    farm.scene.poster = image;
    await writeJson(farmFile, farm);
  }
  return { pin, image };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const scene = option('--scene', 'golden-gate');
  const view = option('--view', 'drive');
  const record = argv.includes('--record');
  const out = option('--out');
  if (!out && !record) throw new Error('Usage: node scripts/capture-scene-poster.mjs (--out file.png | --record [--mirror DIR]) [--scene golden-gate] [--view day|golden-hour|fog|drive; foundry-floor: campus|interior] [--settle 6000] [--port 0]');
  const { png, browser } = await captureScenePoster({ scene, view, settleMs: Number(option('--settle', 6000)), port: Number(option('--port', 0)) });
  if (out) {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(resolve(out), png);
    console.log(`Captured ${scene} (${view}) with ${browser}: ${png.length} bytes -> ${resolve(out)}`);
  }
  if (record) {
    const mirror = option('--mirror', env.KILN_ASSET_MIRROR);
    if (!mirror) throw new Error('--record needs --mirror or KILN_ASSET_MIRROR');
    const { pin } = await recordScenePoster({ scene, view, png, browser, mirror });
    console.log(`Recorded the ${scene} poster: ${pin.path}, ${pin.bytes} bytes, sha256 ${pin.sha256}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
