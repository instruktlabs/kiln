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

/** Serve the staged `public/` directory (the scene's frame page, runtime chunk and verified pack) on a free local port. */
export async function servePublic(root = resolve(SITE, 'public')) {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)).replace(/^[/\\]+/, '');
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': statSync(file).size });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

/** Views a scene's own controls offer; each names the button that selects it (null keeps the opening view). */
const VIEWS = {
  'golden-gate': { day: null, 'golden-hour': 'Golden hour', fog: 'Fog', drive: 'Drive the sedan' },
};

/** What each captured view shows, for the image's alternative text. */
const POSTER_ALT = {
  'golden-gate': {
    drive: 'A blue sedan driving across the deck of the Golden Gate Bridge scene, with traffic ahead and a tower in the distance.',
  },
};

/**
 * A poster is a capture of the scene itself: its staged frame page in headless Chrome at a fixed window
 * size, the scene's own view button pressed, the scene's controls hidden, a fixed settle time. Nothing is
 * composited or retouched. The result is a lossless PNG; the media pipeline derives the site's variants.
 */
export async function captureScenePoster({ scene = 'golden-gate', view = 'day', settleMs = 6000, size = POSTER_SIZE } = {}) {
  const buttons = VIEWS[scene];
  if (!buttons || !(view in buttons)) throw new Error(`Unknown scene view: ${scene}/${view}`);
  const server = await servePublic();
  const browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ['--no-sandbox', `--window-size=${size.width},${size.height}`],
    defaultViewport: { ...size, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${server.origin}/scene-runtime/${scene}/frame.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('page-status')?.textContent.trim() === '' && document.querySelector('.ks-root canvas'), { timeout: 180_000 });
    if (buttons[view]) {
      const pressed = await page.evaluate((label) => {
        const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === label);
        button?.click();
        return Boolean(button);
      }, buttons[view]);
      if (!pressed) throw new Error(`The scene has no "${buttons[view]}" control`);
    }
    await new Promise((done) => setTimeout(done, settleMs));
    // The scene's controls and any focus ring are chrome, not scene: hide them for the poster.
    await page.addStyleTag({ content: '.ks-hud,.ks-fade{display:none!important}.ks-root,.ks-root *{outline:none!important}' });
    await page.evaluate(() => document.activeElement?.blur?.());
    await new Promise((done) => setTimeout(done, 500));
    const png = await page.screenshot({ type: 'png' });
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
  media[scene] = {
    poster: image,
    capture: {
      tool: 'scripts/capture-scene-poster.mjs',
      view,
      release: pack.release,
      size: [POSTER_SIZE.width, POSTER_SIZE.height],
      browser,
      source: 'The staged scene frame page with its controls hidden; nothing composited or retouched.',
      runtimeSha256: pack.runtime?.sha256 ?? null,
      packJsonSha256: pack.packJsonSha256,
      pngBytes: pin.bytes,
      pngSha256: pin.sha256,
    },
  };
  await writeJson(mediaFile, media);
  return { pin, image };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const scene = option('--scene', 'golden-gate');
  const view = option('--view', 'drive');
  const record = argv.includes('--record');
  const out = option('--out');
  if (!out && !record) throw new Error('Usage: node scripts/capture-scene-poster.mjs (--out file.png | --record [--mirror DIR]) [--scene golden-gate] [--view day|golden-hour|fog|drive] [--settle 6000]');
  const { png, browser } = await captureScenePoster({ scene, view, settleMs: Number(option('--settle', 6000)) });
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
