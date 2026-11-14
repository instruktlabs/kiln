// Take pictures of the Seed Town dev page with a Chrome this script owns.
//
//   bun packages/seed-town/scripts/capture.mjs [--url http://127.0.0.1:4479] [--seed 2026] [--hour day|dusk]
//       [--size 1920x1080] [--prefix day] [--shots town,eye-start,...] [--settle 900] [--frames 4]
//
// The dev page (standalone/vite.dev.config.ts) must be running: it exposes the test hooks and writes
// each posted frame to packages/seed-town/review/<prefix>-<shot>.png. A picture is the canvas itself,
// read back in the frame after it was drawn, at the canvas's own pixel size: no page screenshot and
// no compositor. Render large and downsample afterwards for a still that is to be published.
import { launchChrome } from '../../scene-kit/src/testing/node';

const option = (flag, fallback) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] ?? fallback : fallback; };
const url = option('--url', 'http://127.0.0.1:4479'), seed = option('--seed', '2026'), hour = option('--hour', 'day');
const [width, height] = option('--size', '1920x1080').split('x').map(Number);
const prefix = option('--prefix', hour), settle = Number(option('--settle', '900')), frames = Number(option('--frames', '4'));
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 180) throw new Error('--size must be <width>x<height>');
if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error('--prefix may use lower-case letters, digits and hyphens');

/** A shot is the opening orbit, one of the plan's cameras as an orbit view, or one of them walked to at eye height. */
const SHOTS = {
  town: {},
  'town-back': { orbit: 'TOWN_BACK' },
  plan: { orbit: 'PLAN' },
  'square-over': { orbit: 'SQUARE_OVER' },
  'lane-over': { orbit: 'LANE_OVER' },
  'eye-start': { start: true },
  'eye-street': { eye: 'STREET' },
  'eye-street-back': { eye: 'STREET_BACK' },
  'eye-square': { eye: 'SQUARE' },
  'eye-square-corner': { eye: 'SQUARE_CORNER' },
  'eye-lane': { eye: 'LANE' },
  'eye-lane-corner': { eye: 'LANE_CORNER' },
  // Outside the town, measured from where a walk starts on the south road: [east, north] metres and the way to look.
  country: { orbit: 'ROAD_SOUTH' },
  'eye-approach': { at: [0, -62], look: [0, 1] },
  'eye-leave': { at: [0, 32], look: [0, -1] },
  'eye-field': { at: [-36, -4], look: [0.62, 0.78] },
  // Beside the road where it leaves the town, looking across the join.
  'eye-gate': { at: [6.5, 43], look: [-0.6, 0.8] },
  'eye-gate-in': { at: [1.5, 36], look: [0, 1] },
};
const names = option('--shots', 'town,square-over,lane-over,eye-start,eye-street-back,eye-square,eye-lane').split(',').filter(Boolean);
for (const name of names) if (!SHOTS[name]) throw new Error(`Unknown shot ${name}; known: ${Object.keys(SHOTS).join(', ')}`);

const css = `
html,body{margin:0!important;padding:0!important;width:${width}px!important;height:${height}px!important;overflow:hidden!important;display:block!important}
body>header,body>footer{display:none!important}
#scene-shell,#seed-town,.ks-root{position:absolute!important;left:0!important;top:0!important;margin:0!important;width:${width}px!important;height:${height}px!important}
canvas{display:block!important;width:${width}px!important;height:${height}px!important}
#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}
`;

const browser = await launchChrome({ name: 'seed-town-capture', windowSize: [width, height], defaultViewport: { width, height, deviceScaleFactor: 1 } });
const diagnostics = [];
try {
  const page = (await browser.pages())[0] ?? await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(text => {
    const apply = () => { if (!document.head) return false; const style = document.createElement('style'); style.textContent = text; document.head.append(style); return true; };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, css);
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warn') diagnostics.push(`${message.type()}: ${message.text()}`); });
  page.on('pageerror', error => diagnostics.push(`pageerror: ${String(error)}`));
  const query = new URLSearchParams({ seed, tier: 'high', ...(hour === 'dusk' ? { hour: 'dusk' } : {}) });
  await page.goto(`${url}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => {
    const data = document.querySelector('[data-mode]')?.dataset, failed = window.__kilnHarness?.snapshot().errors?.length > 0;
    return failed || (!!window.__kilnScene && Number(data?.draws) > 0 && !!data?.renderDrawCalls);
  }, { timeout: 120_000 });
  const failure = await page.evaluate(() => window.__kilnHarness?.snapshot().errors?.[0] ?? null);
  if (failure) throw new Error(`Scene could not start: ${failure.code}: ${failure.message}`);

  const taken = [];
  for (const name of names) {
    const shot = SHOTS[name], file = `${prefix}-${name}`;
    const result = await page.evaluate(async (spec, file, settle, frames) => {
      const scene = window.__kilnScene, root = document.querySelector('[data-mode]');
      const sleep = ms => new Promise(done => setTimeout(done, ms));
      const walking = !!(spec.eye || spec.start || spec.at);
      if (walking !== (root.dataset.mode === 'walk')) { scene.walk(walking); await sleep(400); }
      if (spec.orbit && !scene.view(spec.orbit)) return `${file}: no view ${spec.orbit}`;
      if (spec.eye) {
        const view = scene.town().frame.views.find(item => item.id === spec.eye);
        if (!view) return `${file}: no view ${spec.eye}`;
        const [px, , pz] = view.position, [tx, ty, tz] = view.target, dx = tx - px, dy = ty - view.position[1], dz = tz - pz;
        scene.placeEyes(px, 0.3, pz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      }
      if (spec.at) {
        const start = scene.town().frame.start;
        scene.placeEyes(start.x + spec.at[0], 0.3, start.z + spec.at[1], Math.atan2(-spec.look[0], -spec.look[1]), 0.05);
      }
      await sleep(settle);
      await scene.waitFrames(frames);
      delete root.dataset.shot;
      window.__seedTownShot = file;
      for (let i = 0; i < 300 && !root.dataset.shot; i++) await sleep(50);
      return root.dataset.shot ?? `${file}: timeout`;
    }, shot, file, settle, frames);
    taken.push(result);
  }
  const data = await page.evaluate(() => ({ ...document.querySelector('[data-mode]').dataset }));
  console.log(JSON.stringify({ seed, hour, size: [width, height], taken, data, diagnostics }, null, 2));
} finally {
  await browser.close();
}
