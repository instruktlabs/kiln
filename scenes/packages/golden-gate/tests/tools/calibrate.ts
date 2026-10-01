// Look calibration probe (development only). Loads the test build headless at one tier, and for
// each named plan applies preset overrides through the `tunePreset` hook at several cameras, then
// prints region statistics, International Orange evidence and a contact sheet path. Plans live in
// this file and are edited while calibrating; the chosen values move into src/presets.ts.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/calibrate.ts <plan> [webgl2] [tier=high]
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { downsample, luma, montage, paintStats, readPng, regionMean, round, writePng, type Image } from './image.ts';

/** Preset overrides, plus `waterDebug` (a water debug view) and `hide` (world parts) applied through their own hooks. */
type Values = Record<string, number | number[] | string | string[]>;
interface Plan { preset: string; views: string[]; variants: Record<string, Values> }
const PLANS: Record<string, Plan> = {
  day: { preset: 'day', views: ['postcard', 'tower', 'pier', 'topdown'], variants: {
    base: {},
    s35e85: { skyGain: .45, envIntensity: .85, envSaturation: .35 },
    s35e70: { skyGain: .45, envIntensity: .7, envSaturation: .35 },
    s50e85: { skyGain: .45, envIntensity: .85, envSaturation: .5 },
    s35e85sun35: { skyGain: .45, envIntensity: .85, envSaturation: .35, sunIntensity: 3.5 },
  } },
  presets: { preset: 'day', views: ['postcard', 'tower', 'pier', 'horizon', 'deck'], variants: { day: {}, golden: {}, fog: {} } },
  golden: { preset: 'golden', views: ['postcard', 'tower', 'pier'], variants: {
    base: {},
    gain7: { skyGain: .7 },
    blueFog: { skyGain: .6, fogColor: [.52, .53, .6] },
    clear: { skyGain: .6, turbidity: 3.2, rayleigh: 2.4, fogColor: [.55, .54, .6], hazeDensity: 8e-5 },
  } },
  fog: { preset: 'fog', views: ['postcard', 'tower', 'pier'], variants: {
    base: {},
    denser: { marineDensity: 8e-3 },
    env1: { envIntensity: 1 },
  } },
  sky: { preset: 'day', views: ['postcard', 'tower', 'horizon'], variants: {
    t4: { turbidity: 4, rayleigh: .9, skyGain: .5 },
    t6: { turbidity: 6, rayleigh: .8, skyGain: .5 },
    t6r6: { turbidity: 6, rayleigh: .6, skyGain: .55 },
    t9: { turbidity: 9, rayleigh: .7, skyGain: .5 },
  } },
  water: { preset: 'day', views: ['tower', 'postcard', 'topdown'], variants: { off: { waterDebug: 'off' }, opacity: { waterDebug: 'opacity' }, noTerrain: { waterDebug: 'opacity', hide: ['terrain'] } } },
  decompose: { preset: 'day', views: ['postcard', 'tower'], variants: {
    sunOnly: { skyGain: .45, envIntensity: 0 },
    envOnly: { skyGain: .45, envIntensity: 1, sunIntensity: 0 },
    envOnlyGain1: { skyGain: 1, envIntensity: 1, sunIntensity: 0 },
  } },
};
/** Regions per view at 1280x720 (x0, y0, x1, y1), judged as means. */
const REGIONS: Record<string, Record<string, [number, number, number, number]>> = {
  postcard: { sky: [300, 5, 1000, 60], knoll: [100, 500, 400, 700], water: [1150, 500, 1270, 700] },
  tower: { sky: [0, 0, 200, 80] },
  pier: { water: [0, 500, 1280, 720], far: [0, 330, 1280, 420] },
  topdown: { water: [200, 100, 1080, 620] },
  horizon: { sky: [0, 0, 1280, 120], water: [0, 520, 1280, 720] },
  deck: { road: [500, 560, 780, 720] },
};

const planName = process.argv[2] ?? 'day', plan = PLANS[planName];
if (!plan) throw new Error(`Unknown plan ${planName}; plans: ${Object.keys(PLANS).join(', ')}`);
const backend = process.argv.includes('webgl2') ? 'webgl2' : 'webgpu', tier = process.argv.find(a => a.startsWith('tier='))?.slice(5) ?? 'high';
const out = resolve(PACKAGE_ROOT, '.tmp/calibrate', planName); mkdirSync(out, { recursive: true });
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-calibrate', 1280, 720);
try {
  const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
  page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  const url = `${hosted.url}/?capture=1&hud=0&tier=${tier}&cam=${plan.views[0]}&time=12${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 });
  const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
  if (!snapshot.readyCount) throw new Error(`Scene failed: ${JSON.stringify(snapshot.errors)}`);
  const invoke = (name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
  const frames = (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n);
  const thumbs: Image[] = [];
  for (const [variant, values] of Object.entries(plan.variants)) {
    const preset = planName === 'presets' ? variant : plan.preset;
    await invoke('setPreset', preset);
    for (const view of plan.views) {
      const { waterDebug, hide, ...preset } = values;
      await invoke('setView', view); await invoke('tunePreset', preset); await invoke('setWaterDebug', typeof waterDebug === 'string' ? waterDebug : 'off');
      for (const part of ['terrain', 'bridge', 'water', 'banks', 'sky']) await invoke('setPartVisible', part, !(Array.isArray(hide) && hide.includes(part)));
      await frames(8);
      const bytes = await page.screenshot({ type: 'png' }), img = readPng(bytes);
      writeFileSync(resolve(out, `${backend}-${variant}-${view}.png`), bytes);
      thumbs.push(downsample(img, 4));
      const regions = Object.fromEntries(Object.entries(REGIONS[view] ?? {}).map(([name, r]) => { const c = regionMean(img, ...r); return [name, { srgb: round(c), luma: Math.round(luma(c)) }]; }));
      console.log(JSON.stringify({ variant, view, regions, paint: paintStats(img) }));
    }
  }
  const sheet = resolve(out, `${backend}-sheet.png`);
  writeFileSync(sheet, writePng(montage(thumbs, plan.views.length)));
  console.log(JSON.stringify({ sheet, rows: Object.keys(plan.variants), columns: plan.views, unexpected: unexpectedMessages(messages).slice(0, 10) }));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
