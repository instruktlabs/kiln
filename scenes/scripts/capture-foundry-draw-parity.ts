// Foundry Floor cross-build parity (draw-optimization step S5): the same frozen-clock views captured on a BEFORE build
// (draw-base, main at c734e2a) and an AFTER build (draw-after, HEAD 892d103), plus a second BEFORE capture as the noise floor,
// judged by the B-06 comparer (scripts/parity-images.ts compareParityImages: 16x9 luminance tiles, tile threshold max(3x repeat
// noise, 0.02), pass fraction 0.97, global mean < 0.02) and by the thin-line check the Golden Gate review added (pixels differing
// by more than 32 levels in a channel, at most `--over32-budget` (100 per 1280x720 view) more than the BEFORE repeat has). Both
// builds are test-mode standalones of the campus (bun scripts/build-scene.ts --scene foundry-floor --mode test --label <l>) and are
// served side by side from owned loopback ports. Nothing is passed to either build but the shared frozen-clock parameters, so the
// AFTER build runs its own defaults (shared planting, MSAA discard on WebGPU).
//   bun scripts/capture-foundry-draw-parity.ts [--before draw-base] [--after draw-after] [--tiers minimal,economy,balanced,high]
//     [--views campus,pair,canopy,split,bridge,roundabout,close-island,close-avenue,close-parking,close-windbreak,close-arrival,drive,fab-landing,…]
//     [--backend webgl2] [--after-query plantingShared=false] [--over32-budget 100] [--save high|all|fail] [--out evidence/draw-after/foundry-floor/parity]
//   bun scripts/capture-foundry-draw-parity.ts --merge [--out <dir>]     (rebuilds parity.md and parity-summary.json from every parity-*.json)
// `--after-query` adds dev parameters to the AFTER captures only (for example plantingShared=false, which restores the per-material
// planting): with it the AFTER build differs from BEFORE by the MSAA discard alone, so a view that matches BEFORE exactly then proves
// that every pixel the defaults changed belongs to the planting.
// Views: the count fixtures of scripts/scene-fixtures.ts (six campus views, the drive placement, eight fab views) and the five
// planting close-ups of capture-foundry-planting-parity.ts. `drive` puts the sedan down at rest at a fixed place on the split road,
// where the count fixture's two seconds at throttle .8 end to within about 4 m (that fixture's own end point is a workload state:
// it moves by metres between loads, which a pixel comparison cannot absorb); `fab-<view>` enters the fab from Arrival and sets one
// of its eight views.
// Output: <out>/captures/<backend>/<tier>-<view>[-<variant>]-{before,after,repeat,diff}.png (after, before and the x4 B-06 diff for every case at high
// WebGPU and for every failing case, repeat only for failing cases), parity-<backend>-<tiers>.json and, after --merge, parity.md. Pages load from the owned loopback
// servers; nothing here reads time. The exit code is 1 when a case fails either check.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';
import { parseCampus } from '../packages/foundry-floor/src/campus/data';
import { campusPlantings, PLANT_SIZES } from '../packages/foundry-floor/src/campus/exterior/planting';
import { sceneOutput } from './build-scene';
import { compareParityImages, type RgbaImage } from './parity-images';

const ROOT = resolve(import.meta.dir, '..'), WIDTH = 1280, HEIGHT = 720, TIMEOUT = 180_000;
const HIDE_UI = '.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel,#page-status{visibility:hidden!important}';
const CAMPUS_VIEWS = ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout'], CLOSE_VIEWS = ['close-island', 'close-avenue', 'close-parking', 'close-windbreak', 'close-arrival'];
const FAB_VIEWS = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'].map(v => `fab-${v}`);
const ALL_VIEWS = [...CAMPUS_VIEWS, ...CLOSE_VIEWS, 'drive', ...FAB_VIEWS];
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const out = resolve(ROOT, option('--out', 'evidence/draw-after/foundry-floor/parity'));

/* eslint-disable @typescript-eslint/no-explicit-any */
const invoke = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, v) => (window as any).__kilnScene.invoke(n, ...v), name, a) as Promise<any>;
const write = (path: string, image: RgbaImage) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };
/** Exact pixel differences: pixels differing at all, by more than 8 and by more than 32 levels in any channel, and the largest channel delta. */
const exact = (a: RgbaImage, b: RgbaImage) => {
  let differing = 0, over8 = 0, over32 = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!)); if (d) { differing++; if (d > 8) over8++; if (d > 32) over32++; if (d > max) max = d; } }
  return { differingPixels: differing, over8, over32, maxChannelDelta: max };
};

function summarize(root: string) {
  // Every parity-*.json contributes; a case run again (the same variant, backend, tier and view) is taken from the newest file.
  const files = readdirSync(root).filter(f => /^parity-(webgpu|webgl2)-.*\.json$/.test(f)).sort((a, b) => statSync(resolve(root, a)).mtimeMs - statSync(resolve(root, b)).mtimeMs), newest = new Map<string, any>();
  for (const f of files) for (const r of JSON.parse(readFileSync(resolve(root, f), 'utf8')).results as any[]) newest.set(`${r.variant ?? 'defaults'}|${r.backend}|${r.tier}|${r.view}`, r);
  const rows = [...newest.values()];
  for (const r of rows) r.variant ??= 'defaults';
  const key = (r: any) => `${r.variant === 'defaults' ? 0 : 1}${r.variant}|${r.backend}|${TIER_ORDER.indexOf(r.tier)}|${ALL_VIEWS.indexOf(r.view)}`;
  rows.sort((a, b) => key(a) < key(b) ? -1 : 1);
  const by = (pick: (r: any) => string) => { const m = new Map<string, { cases: number; pass: number; b06: number; lines: number }>(); for (const r of rows) { const c = m.get(pick(r)) ?? { cases: 0, pass: 0, b06: 0, lines: 0 }; c.cases++; if (r.pass) c.pass++; if (r.b06) c.b06++; if (r.lines.pass) c.lines++; m.set(pick(r), c); } return [...m.entries()].map(([k, v]) => ({ key: k, ...v })); };
  const md = ['| variant | backend | tier | view | pass | B-06 | tiles | mean luminance delta | noise mean | over 32 (after vs before) | over 32 (repeat vs before) | pixels differing (after vs before) | max channel delta | pixels differing (repeat vs before) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.variant} | ${r.backend} | ${r.tier} | ${r.view} | ${r.pass ? 'yes' : 'NO'} | ${r.b06 ? 'yes' : 'NO'} | ${r.passingTiles}/${r.tiles} | ${r.globalMean.toExponential(2)} | ${r.noiseGlobalMean.toExponential(2)} | ${r.lines.over32} | ${r.lines.noise} | ${r.afterVsBefore.differingPixels} | ${r.afterVsBefore.maxChannelDelta} | ${r.repeatVsBefore.differingPixels} |`)];
  const totals = { cases: rows.length, pass: rows.filter(r => r.pass).length, b06: rows.filter(r => r.b06).length, lines: rows.filter(r => r.lines.pass).length, byVariantBackendTier: by(r => `${r.variant} ${r.backend} ${r.tier}`), byVariantBackend: by(r => `${r.variant} ${r.backend}`) };
  writeFileSync(resolve(root, 'parity.md'), md.join('\n') + '\n'); writeFileSync(resolve(root, 'parity-summary.json'), JSON.stringify({ totals, results: rows }, null, 1) + '\n');
  return totals;
}
const TIER_ORDER = ['minimal', 'economy', 'balanced', 'high'];
if (args.includes('--merge')) { console.log(JSON.stringify(summarize(out))); process.exit(0); }

const beforeBuild = option('--before', 'draw-base'), afterBuild = option('--after', 'draw-after'), tiers = option('--tiers', TIER_ORDER.join(',')).split(',');
const afterQuery = option('--after-query', ''), variant = afterQuery ? afterQuery.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') : 'defaults', variantTag = afterQuery ? `-${variant}` : '';
const views = option('--views', ALL_VIEWS.join(',')).split(','), backend = option('--backend', '') === 'webgl2' ? 'webgl2' : 'webgpu', save = option('--save', 'high'), budget = Number(option('--over32-budget', '100'));
if (!(budget >= 0)) throw new Error('--over32-budget must be 0 or more');
for (const v of views) if (!ALL_VIEWS.includes(v)) throw new Error(`Unknown view ${v}`);
for (const t of tiers) if (!TIER_ORDER.includes(t)) throw new Error(`Unknown tier ${t}`);

const plants = campusPlantings(parseCampus(readFileSync(resolve(ROOT, 'packages/foundry-floor/data/campus.json'), 'utf8')));
/** Camera 28 m from the first plant of the zone (the island's first conifer, past x = 300 on the avenue), eye 6 m up, looking at its middle, from the campus-centre side (the island's from outside it, 22 m); as capture-foundry-planting-parity.ts. */
function closePose(zone: string): { position: [number, number, number]; target: [number, number, number] } {
  const p = plants.find(q => q.zone === zone && (zone !== 'island' || q.model === 'tree-conifer-m') && (zone !== 'avenue' || Math.abs(q.x) > 300))!, d = Math.hypot(p.x, p.z) || 1, h = PLANT_SIZES[p.model][1];
  const away = zone === 'island' ? 22 : -28;
  return { position: [p.x + p.x / d * away, 6, p.z + p.z / d * away], target: [p.x, h * 0.45, p.z] };
}
/** Waits until two reads 10 frames apart agree (the orbit, chase camera and fab camera ease in). */
async function settle(page: Page, read: () => Promise<unknown>) { for (let i = 0, last = ''; i < 40; i++) { const now = JSON.stringify(await read()); if (now === last) break; last = now; await waitFrames(page, 10); } }
interface Shot { png: RgbaImage; backend: string | null; messages: string[]; msaa: unknown }
async function open(browser: Awaited<ReturnType<typeof launchChrome>>, base: string, owned: ReadonlySet<number>, tier: string, messages: string[], extra: Record<string, string>): Promise<Page> {
  const url = `${base}/?${new URLSearchParams({ freeze: '1', time: '0', capture: '1', tier, ...(backend === 'webgl2' ? { backend } : {}), ...extra })}`;
  assertOwnedUrl(url, owned);
  const page = await browser.newPage(); page.setDefaultTimeout(TIMEOUT);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
  await page.addStyleTag({ content: HIDE_UI });
  await page.waitForFunction(() => (window as any).__kilnScene.invoke('driveTraffic', 1) !== null, { timeout: TIMEOUT, polling: 100 });
  return page;
}
async function grab(page: Page, messages: string[]): Promise<Shot> {
  await waitFrames(page, 4);
  const canvas = await page.$('canvas'), png = PNG.sync.read(Buffer.from(await canvas!.screenshot({ type: 'png' })));
  if (png.width !== WIDTH || png.height !== HEIGHT) throw new Error(`Capture is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`);
  const msaa = await invoke(page, 'msaaPolicy').catch(() => null);
  return { png: { width: png.width, height: png.height, data: new Uint8Array(png.data) }, backend: await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend')), messages: messages.splice(0), msaa };
}
const campusShot = async (browser: Awaited<ReturnType<typeof launchChrome>>, base: string, owned: ReadonlySet<number>, tier: string, view: string, extra: Record<string, string> = {}): Promise<Shot> => {
  const messages: string[] = [], page = await open(browser, base, owned, tier, messages, extra);
  try {
    if (view.startsWith('close-')) { const pose = closePose(view.slice(6)); await invoke(page, 'campusPose', pose.position, pose.target, 50); }
    else if (view === 'drive') {
      // The sedan set down at rest at a fixed place on the split road, where the count fixture's two seconds at throttle .8 end to within
      // about 4 m (the fixture's own end point moves by metres between loads, because the car starts on the wall clock); the chase camera settles behind it.
      await page.evaluate(() => (window as any).__kilnScene.setPlaying(true));
      await page.waitForFunction(() => (window as any).__kilnScene.invoke('driveState') !== null, { timeout: TIMEOUT, polling: 100 });
      await invoke(page, 'setDriveInput', { throttle: 0 }); await invoke(page, 'placeCar', -3820, 7.25, 0, 0);
    } else await invoke(page, 'campusView', view);
    await waitFrames(page, 40);
    await settle(page, async () => view === 'drive' ? (await invoke(page, 'driveState'))?.camera.position : (await invoke(page, 'campusState')).camera);
    return await grab(page, messages);
  } finally { await page.close().catch(() => {}); }
};
/** One page enters the fab from Arrival (as tests/tools/capture-local-v09.ts) and captures each requested fab view. */
async function fabShots(browser: Awaited<ReturnType<typeof launchChrome>>, base: string, owned: ReadonlySet<number>, tier: string, wanted: string[], extra: Record<string, string> = {}): Promise<Map<string, Shot>> {
  const messages: string[] = [], page = await open(browser, base, owned, tier, messages, extra), shots = new Map<string, Shot>();
  try {
    await invoke(page, 'campusView', 'canopy');
    await page.waitForFunction(() => (window as any).__kilnScene.invoke('campusState')?.canEnter, { timeout: TIMEOUT, polling: 100 });
    await invoke(page, 'campusEnter');
    await page.waitForFunction(() => { const s = (window as any).__kilnScene.invoke('campusPlace'); return s.interiorReady && !s.moving; }, { timeout: TIMEOUT, polling: 100 });
    await page.evaluate(() => (window as any).__kilnScene.setTimeScale(0));
    await waitFrames(page, 12);
    for (const view of wanted) {
      await invoke(page, 'ffSetView', view.slice(4)); await waitFrames(page, 12);
      await settle(page, () => invoke(page, 'ffCamera'));
      shots.set(view, await grab(page, messages));
    }
    return shots;
  } finally { await page.close().catch(() => {}); }
}

mkdirSync(resolve(out, 'captures', backend), { recursive: true });
const hostedBefore = await serveOwned(sceneOutput('foundry-floor', beforeBuild, 'test')), hostedAfter = await serveOwned(sceneOutput('foundry-floor', afterBuild, 'test'));
const owned = new Set([hostedBefore.port, hostedAfter.port]), browser = await launchChrome({ workspace: ROOT, name: 'ff-draw-parity', windowSize: [WIDTH, HEIGHT] });
const results: any[] = [], afterParams = Object.fromEntries(new URLSearchParams(afterQuery));
function record(tier: string, view: string, before: Shot, repeat: Shot, after: Shot) {
  const parity = compareParityImages(before.png, repeat.png, after.png), name = `${tier}-${view}${variantTag}`;
  const afterVsBefore = exact(before.png, after.png), repeatVsBefore = exact(before.png, repeat.png);
  const lines = { over32: afterVsBefore.over32, noise: repeatVsBefore.over32, budget, pass: afterVsBefore.over32 <= repeatVsBefore.over32 + budget };
  const pass = parity.pass && lines.pass;
  if (save === 'all' || (save === 'high' && tier === 'high' && backend === 'webgpu') || !pass) {
    const dir = resolve(out, 'captures', backend); write(resolve(dir, `${name}-before.png`), before.png); write(resolve(dir, `${name}-after.png`), after.png); write(resolve(dir, `${name}-diff.png`), parity.diff);
    if (!pass) write(resolve(dir, `${name}-repeat.png`), repeat.png);
  }
  const row = { variant, backend, tier, view, pass, b06: parity.pass, lines, globalMean: parity.globalMean, noiseGlobalMean: parity.noiseGlobalMean, passingTiles: parity.passingTiles, tiles: parity.tiles.length,
    failingTiles: parity.tiles.filter(t => !t.pass).map(t => ({ x: t.x, y: t.y, mean: +t.mean.toExponential(2), threshold: +t.threshold.toExponential(2) })), afterVsBefore, repeatVsBefore,
    backends: { before: before.backend, after: after.backend }, msaaPolicyAfter: after.msaa, messages: { before: before.messages, repeat: repeat.messages, after: after.messages } };
  results.push(row);
  console.log(`${backend}${variantTag} ${tier}-${view}: ${pass ? 'PASS' : 'FAIL'} B-06 ${parity.pass ? 'pass' : 'FAIL'} mean ${parity.globalMean.toExponential(2)} noise ${parity.noiseGlobalMean.toExponential(2)} tiles ${parity.passingTiles}/${parity.tiles.length}; over 32 ${afterVsBefore.over32} vs repeat ${repeatVsBefore.over32} (budget ${budget}) ${lines.pass ? 'ok' : 'OVER'}; differing ${afterVsBefore.differingPixels} (max ${afterVsBefore.maxChannelDelta}), repeat differing ${repeatVsBefore.differingPixels}${after.messages.length || before.messages.length ? ` MESSAGES ${before.messages.length}/${after.messages.length}` : ''}`);
}
try {
  for (const tier of tiers) {
    for (const view of views.filter(v => !v.startsWith('fab-'))) {
      const before = await campusShot(browser, hostedBefore.url, owned, tier, view), repeat = await campusShot(browser, hostedBefore.url, owned, tier, view), after = await campusShot(browser, hostedAfter.url, owned, tier, view, afterParams);
      record(tier, view, before, repeat, after);
    }
    const fab = views.filter(v => v.startsWith('fab-'));
    if (fab.length) {
      const before = await fabShots(browser, hostedBefore.url, owned, tier, fab), repeat = await fabShots(browser, hostedBefore.url, owned, tier, fab), after = await fabShots(browser, hostedAfter.url, owned, tier, fab, afterParams);
      for (const view of fab) record(tier, view, before.get(view)!, repeat.get(view)!, after.get(view)!);
    }
  }
} finally { await browser.close(); await hostedBefore.close(); await hostedAfter.close(); }
writeFileSync(resolve(out, `parity-${backend}-${tiers.join('+')}${variantTag}${views.length === ALL_VIEWS.length ? '' : '-subset'}.json`), JSON.stringify({ before: beforeBuild, after: afterBuild, size: [WIDTH, HEIGHT], backend, budget, results }, null, 1) + '\n');
console.log(JSON.stringify(summarize(out)));
process.exitCode = results.every(r => r.pass) ? 0 : 1;
