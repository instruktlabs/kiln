// Draw optimisation parity (docs/plans/2026-10-01-draw-optimization-cycle.md S4b/S5, OD-4, OD-18): frozen-clock captures of
// Golden Gate views with every draw optimisation off (bridgeMerge, shadowOnce, standIns and reflectionStandIns false), a
// second capture of the same as the noise floor, and the build's defaults (or one variant), compared with the B-06 comparer
// (scripts/parity-images.ts compareParityImages). A test-mode build is required:
//   bun scripts/build-scene.ts --scene golden-gate --mode test --label <l>
//   bun packages/golden-gate/tests/tools/draw-parity.ts --build <l> [--before <label>] [--tiers high,minimal] [--presets day]
//     [--views arrival,postcard,pier,send-side,deck,lanes,drive-nb-0|@set,...] [--variant defaults|<query>] [--backend webgl2]
//     [--over32-budget 100] [--write all|changed|none] [--page fresh|shared] [--out <dir>]
// Two-build mode (S5): `--before <label>` captures that build twice (the reference and its repeat, the noise floor) and
// `--build` once, each at its own defaults on its own server for the whole run, and checks every page's code chunk against
// its build's build.json, so a page can never be served by the other build. Without it, all three captures come from
// `--build`: optimisations off twice, then its defaults or `--variant`, a query added to the "on" capture (for example
// `standIns=false` to isolate a feature).
// Views are scene cameras (`cam`), review poses held with setPose (POSES below, from tests/tools/capture.ts and the wave-B
// review's shore and far-LOD poses) or chase-camera drive placements (`drive-<lane>-<station>`, the car at rest on an empty
// road). `@<set>` expands to a named list (VIEW_SETS). `--presets` takes day, golden and fog (the scene has no night).
// `--page fresh` (default) loads a page per capture; `--page shared` holds each run's cases on one page per tier (see
// sharedRun), about ten times faster, with the same path through the views in every run.
// A case passes when B-06 passes and the "on" capture has at most `--over32-budget` more pixels over 32 levels than the
// repeat: B-06 judges tile means, which thin-line regressions such as a kerb stipple never move far enough (wave-B review
// R1, R4). The default budget sits above the merge's measured residual (depth-tie specks far out: at most 74 px over 32
// levels, at the golden-hour arrival; 52 at the day span view) and below the kerb stipple it must catch (878 to 1,555 px
// in daylight).
// Output per case <tier>-<preset>-<view>[-<variant>][-webgl2]: -off.png, -repeat.png, -on.png and -diff.png (B-06 luminance
// x4) in same-build mode, -before.png, -repeat.png, -after.png and -diff.png in two-build mode (`--write changed` keeps them
// only for cases that fail or have at least 20 more pixels over 32 levels than the repeat), and parity.json and parity.md accumulating every
// run's rows. Pages load from the owned loopback server; nothing here reads time.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames } from '../../../scene-kit/src/testing/node';
import { sceneOutput } from '../../../../scripts/build-scene';
import { compareParityImages, type RgbaImage } from '../../../../scripts/parity-images';

const SCENES = resolve(import.meta.dir, '../../../..'), WIDTH = 1280, HEIGHT = 720, TIMEOUT = 180_000;
const OFF = { bridgeMerge: 'false', shadowOnce: 'false', standIns: 'false', reflectionStandIns: 'false' };
type Pose = { position: [number, number, number]; target: [number, number, number]; fov: number };
const POSES: Record<string, Pose> = {
  // tests/tools/capture.ts (SCENE-REVIEW-2): the south pier poses, the side poses and the deck ends.
  'sp-high-w': { position: [90, 70, -560], target: [0, 4, -640], fov: 55 },
  'sp-high-e': { position: [-90, 70, -720], target: [0, 4, -640], fov: 55 },
  'sp-top': { position: [30, 150, -600], target: [0, 2, -640], fov: 55 },
  'sp-deck': { position: [0, 95, -480], target: [0, 5, -640], fov: 55 },
  'side-span': { position: [450, 85, -300], target: [0, 68, -300], fov: 55 },
  'side-full': { position: [900, 120, 0], target: [0, 70, 0], fov: 55 },
  'send-side': { position: [140, 110, -1000], target: [0, 70, -1040], fov: 55 },
  'send-high': { position: [0, 200, -900], target: [0, 60, -1060], fov: 55 },
  'send-drive': { position: [0, 78.5, -960], target: [0, 74, -1100], fov: 55 },
  'send-back': { position: [20, 90, -1150], target: [0, 72, -1000], fov: 55 },
  'nend-side': { position: [140, 110, 1000], target: [0, 70, 1040], fov: 55 },
  'nend-high': { position: [0, 200, 900], target: [0, 60, 1060], fov: 55 },
  'nend-drive': { position: [0, 78.5, 960], target: [0, 74, 1100], fov: 55 },
  'nend-back': { position: [20, 90, 1150], target: [0, 72, 1000], fov: 55 },
  // tests/tools/capture.ts: the driver's eye 1.2 m above the middle lane entering and leaving the deck (g3 route).
  'send-enter': { position: [-13.34, 60.2, -1151.59], target: [-5.95, 61.71, -1092.63], fov: 55 },
  'send-leave': { position: [4.8, 65.66, -972.98], target: [4.8, 62.92, -1052.98], fov: 55 },
  'nend-enter': { position: [4.8, 65.22, 1152.98], target: [4.8, 63.13, 1092.98], fov: 55 },
  'nend-leave': { position: [-4.8, 65.66, 972.98], target: [-4.8, 63.08, 1052.98], fov: 55 },
  // Wave-B review (review-golden-gate-foundry gg-ab.ts): low over the water near the shores, so the anchorages', approaches'
  // and traffic's reflections fill the frame, and beyond the far-LOD switch at High (5,200 m x 1.12) and Low (1,900 m x 1.12).
  'fp-east-low': { position: [-260, 6, -760], target: [0, 30, -1100], fov: 55 },
  'fp-west-low': { position: [260, 6, -760], target: [0, 30, -1100], fov: 55 },
  'n-east-low': { position: [-260, 6, 760], target: [0, 30, 1100], fov: 55 },
  'n-west-low': { position: [260, 6, 760], target: [0, 30, 1100], fov: 55 },
  'pier-reflect': { position: [-60, 3, -520], target: [0, 60, -700], fov: 55 },
  'far-high': { position: [6600, 900, -500], target: [0, 100, 0], fov: 40 },
  'far-low': { position: [2700, 600, -300], target: [0, 100, 0], fov: 50 },
};
/** Named view lists for `--views @<set>`: the scene cameras, the capture tool's water, pier and approaches sets, the review's deck, shore and drive sets. */
const VIEW_SETS: Record<string, string[]> = {
  defaults: ['arrival', 'postcard', 'pier', 'send-side', 'deck', 'lanes', 'drive-nb-0'],
  views: ['arrival', 'postcard', 'pier', 'topdown', 'horizon', 'deck', 'tower', 'span', 'lanes', 'sidewalk', 'traffic'],
  deck: ['deck', 'lanes', 'traffic', 'sidewalk', 'tower'],
  water: ['postcard', 'pier', 'topdown', 'horizon', 'deck'],
  pier: ['sp-high-w', 'sp-high-e', 'sp-top', 'sp-deck', 'side-span', 'side-full'],
  approaches: ['send-side', 'send-high', 'send-drive', 'send-back', 'nend-side', 'nend-high', 'nend-drive', 'nend-back', 'send-enter', 'send-leave', 'nend-enter', 'nend-leave'],
  shore: ['fp-east-low', 'fp-west-low', 'n-east-low', 'n-west-low', 'pier-reflect'],
  drive: ['drive-nb--1300', 'drive-nb--640', 'drive-nb-0', 'drive-nb-660', 'drive-nb-1300', 'drive-sb--400', 'drive-sb-400'],
};
/** Chase-camera drive placements: `drive-<lane>-<station>` puts the car at rest in the lane's middle (nb-middle, sb-middle) at that route station (m). */
const DRIVE = /^drive-(nb|sb)-(-?\d+)$/;
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const build = option('--build', ''), before = option('--before', ''), tiers = option('--tiers', 'high,minimal').split(','), presets = option('--presets', 'day').split(',');
const views = option('--views', '@defaults').split(',').flatMap(v => { if (!v.startsWith('@')) return [v]; const set = VIEW_SETS[v.slice(1)]; if (!set) throw new Error(`Unknown view set ${v}; sets: ${Object.keys(VIEW_SETS).join(', ')}`); return set; });
const variant = option('--variant', 'defaults'), backend = option('--backend', '') === 'webgl2' ? { backend: 'webgl2' } : {}, out = resolve(SCENES, option('--out', '../tmp/drawcalls/wave-b/gg/parity'));
/** `--write changed` keeps a case's images when it fails or has at least this many more pixels over 32 levels than its repeat (the wave-B review's "cases with > 20 px over 32"). */
const CHANGED = 20;
const budget = Number(option('--over32-budget', '100')), writeMode = option('--write', 'all'), pageMode = option('--page', 'fresh');
if (!build) throw new Error('--build <label> is required');
if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('--over32-budget must be a finite nonnegative integer');
if (!['all', 'changed', 'none'].includes(writeMode)) throw new Error('--write is all, changed or none');
if (!['fresh', 'shared'].includes(pageMode)) throw new Error('--page is fresh or shared');
for (const p of presets) if (!['day', 'golden', 'fog'].includes(p)) throw new Error(`Unknown preset ${p}; the scene has day, golden and fog`);
if (before && variant !== 'defaults') throw new Error('--variant applies to same-build runs only');

/* eslint-disable @typescript-eslint/no-explicit-any */
const invoke = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, v) => (window as any).__kilnScene.invoke(n, ...v), name, a) as Promise<any>;
const api = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, v) => (window as any).__kilnScene[n](...v), name, a) as Promise<any>;
/** Waits until two reads 10 frames apart agree (the orbit, pose and chase camera ease in). */
async function settle(page: Page, read: () => Promise<unknown>) { for (let i = 0, last = ''; i < 30; i++) { const now = JSON.stringify(await read()); if (now === last) break; last = now; await waitFrames(page, 10); } }
/** Enters the car (play mode) and places it at rest; traffic is off for drive views, so the road is the same in every capture. */
async function placeCar(page: Page, lane: string, station: number) {
  await api(page, 'setPlaying', true);
  for (let i = 0; i < 300 && !(await invoke(page, 'driveState')); i++) await waitFrames(page, 5);
  if (!(await invoke(page, 'driveState'))) { await api(page, 'setTimeScale', 1); for (let i = 0; i < 300 && !(await invoke(page, 'driveState')); i++) await waitFrames(page, 5); await api(page, 'setTimeScale', 0); }
  if (!(await invoke(page, 'driveState'))) throw new Error('Could not enter the car');
  await invoke(page, 'setDriveInput', { throttle: 0 });
  if (!(await invoke(page, 'placeCar', `${lane}-middle`, station, 0))) throw new Error(`placeCar ${lane}-middle ${station} failed`);
  await waitFrames(page, 30); await settle(page, async () => (await invoke(page, 'driveState'))?.camera.position);
}
interface Hosted { url: string; label: string; chunk: string }
/** The build's entry chunk (index-*.js) from its build.json, which each page must have loaded. */
function entryChunk(label: string): string {
  const built = JSON.parse(readFileSync(resolve(sceneOutput('golden-gate', label, 'test'), 'build.json'), 'utf8')) as { chunks: { name: string }[] };
  const entry = built.chunks.map(c => c.name).find(n => /^index-.*\.js$/.test(n)); if (!entry) throw new Error(`No index chunk in ${label}'s build.json`);
  return entry;
}
type Browser = Awaited<ReturnType<typeof launchChrome>>;
/** Opens a page of one build at a tier and preset, with the camera at `cam`; drive pages run with traffic off. */
async function load(hosted: Hosted, owned: ReadonlySet<number>, browser: Browser, tier: string, preset: string, cam: string, drives: boolean, extra: Record<string, string>) {
  const url = `${hosted.url}/?${new URLSearchParams({ capture: '1', hud: '0', tier, preset, cam, time: '12', ...(drives ? { traffic: 'false' } : {}), ...backend, ...extra })}`;
  assertOwnedUrl(url, owned);
  const page = await browser.newPage(); page.setDefaultTimeout(TIMEOUT); await page.setCacheEnabled(false);
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
    const scripts = await page.$$eval('script[src]', list => list.map(s => (s as HTMLScriptElement).src));
    if (!scripts.some(s => s.endsWith(`/${hosted.chunk}`))) throw new Error(`Page for ${hosted.label} loaded ${scripts.join(', ')}, not ${hosted.chunk}`);
    await waitFrames(page, 12);
    return page;
  } catch (error) { await page.close().catch(() => {}); throw error; }
}
/** Holds a view on an open page (a pose, a drive placement or, on a shared page, a scene camera) and captures it. */
async function capture(page: Page, view: string, shared: boolean) {
  const pose = POSES[view], drive = DRIVE.exec(view);
  if (pose && await invoke(page, 'setPose', pose) !== 'pose') throw new Error(`setPose ${view} failed`);
  if (shared && !pose && !drive) { await invoke(page, 'setView', view); await waitFrames(page, 20); }
  if (drive) await placeCar(page, drive[1]!, Number(drive[2]));
  else await settle(page, async () => (await invoke(page, 'ggStats')).camera.position);
  await waitFrames(page, shared ? 6 : 4);
  const stats = await invoke(page, 'ggStats'), canvas = await page.$('canvas');
  const png = PNG.sync.read(Buffer.from(await canvas!.screenshot({ type: 'png' })));
  if (png.width !== WIDTH || png.height !== HEIGHT) throw new Error(`Capture is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`);
  return { png: { width: png.width, height: png.height, data: new Uint8Array(png.data) } as RgbaImage, draw: stats.draw ?? null, usingFar: stats.usingFarBridge, preset: stats.preset,
    bridge: { webMeshes: stats.bridge.webMeshes, draws: stats.bridge.draws ?? null, proxies: stats.bridge.shadowProxies?.proxies ?? 0, reflection: stats.bridge.reflectionProxies ?? 0 },
    camera: stats.camera.position, backend: await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend')) };
}
type Shot = Awaited<ReturnType<typeof capture>>;
interface Case { tier: string; preset: string; view: string }
/** Fresh pages: every capture loads its own page, whose URL fixes the preset and the camera. */
async function freshShot(hosted: Hosted, owned: ReadonlySet<number>, browser: Browser, c: Case, extra: Record<string, string>): Promise<Shot> {
  const special = !!POSES[c.view] || DRIVE.test(c.view), page = await load(hosted, owned, browser, c.tier, c.preset, special ? 'postcard' : c.view, DRIVE.test(c.view), extra);
  try { return await capture(page, c.view, false); } finally { await page.close().catch(() => {}); }
}
/**
 * Shared pages: one page per build, tier and kind (scene views and poses on one, drive placements with traffic off on
 * another) holds every case in the same order in each run, changing the preset with `setPreset` and the camera with
 * `setView` or `setPose`; the governor is held (`feedFrameTimes`), as the count probe does, so a slow frame cannot change
 * the tier. Each of the three runs takes the same path, so LOD hysteresis and other view history match between them.
 */
async function sharedRun(hosted: Hosted, owned: ReadonlySet<number>, browser: Browser, cases: Case[], extra: Record<string, string>): Promise<Shot[]> {
  const shots: Shot[] = new Array(cases.length);
  const groups = new Map<string, number[]>();
  cases.forEach((c, i) => { const k = `${c.tier}|${DRIVE.test(c.view)}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
  for (const [k, indices] of groups) {
    const [tier, drives] = k.split('|') as [string, string], first = cases[indices[0]!]!;
    const page = await load(hosted, owned, browser, tier, first.preset, 'arrival', drives === 'true', extra);
    try {
      await page.evaluate(() => (window as any).__kilnScene.feedFrameTimes([]));
      let preset = first.preset;
      for (const i of indices) {
        const c = cases[i]!;
        if (c.preset !== preset) { await invoke(page, 'setPreset', c.preset); preset = c.preset; await waitFrames(page, 6); }
        shots[i] = await capture(page, c.view, true);
        if (shots[i]!.preset !== c.preset) throw new Error(`${c.view}: preset ${shots[i]!.preset}, expected ${c.preset}`);
      }
    } finally { await page.close().catch(() => {}); }
  }
  return shots;
}
const write = (path: string, image: RgbaImage) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };
/** Exact pixel differences: pixels differing at all, by more than 8 and by more than 32 levels in any channel, the largest channel delta and the box of the over-32 pixels. */
const exact = (a: RgbaImage, b: RgbaImage) => {
  let differing = 0, over8 = 0, over32 = 0, max = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!));
    if (!d) continue;
    differing++; if (d > 8) over8++; if (d > max) max = d;
    if (d > 32) { over32++; const p = i / 4, x = p % a.width, y = Math.floor(p / a.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { differingPixels: differing, over8, over32, maxChannelDelta: max, over32Box: x1 < 0 ? null : [x0, y0, x1, y1] };
};

mkdirSync(out, { recursive: true });
const on = before || variant === 'defaults' ? {} : Object.fromEntries(new URLSearchParams(variant)), tag = (variant === 'defaults' ? '' : `-${variant.replace(/[^a-zA-Z0-9]+/g, '_')}`) + (backend.backend ? '-webgl2' : '');
// One server per build for the whole run, on distinct ports: a closed server's keep-alive sockets can otherwise answer for the next one.
const servedB = await serveOwned(sceneOutput('golden-gate', build, 'test')), servedA = before ? await serveOwned(sceneOutput('golden-gate', before, 'test')) : servedB;
const hostB: Hosted = { url: servedB.url, label: build, chunk: entryChunk(build) }, hostA: Hosted = before ? { url: servedA.url, label: before, chunk: entryChunk(before) } : hostB;
const owned = new Set([servedA.port, servedB.port]), browser = await launchChrome({ workspace: SCENES, name: 'gg-draw-parity', windowSize: [WIDTH, HEIGHT] });
const reference = before ? {} : OFF, [nameA, nameB] = before ? ['before', 'after'] : ['off', 'on'];
const results: any[] = [], cases: Case[] = tiers.flatMap(tier => presets.flatMap(preset => views.map(view => ({ tier, preset, view }))));
try {
  // Shared pages capture each run as a whole (reference, repeat, then the build under test); fresh pages go case by case.
  const runs = pageMode === 'shared' ? await (async () => { const a = await sharedRun(hostA, owned, browser, cases, reference), r = await sharedRun(hostA, owned, browser, cases, reference); return { a, r, b: await sharedRun(hostB, owned, browser, cases, on) }; })() : null;
  for (const [index, { tier, preset, view }] of cases.entries()) {
    const c = cases[index]!;
    const a = runs ? runs.a[index]! : await freshShot(hostA, owned, browser, c, reference), r = runs ? runs.r[index]! : await freshShot(hostA, owned, browser, c, reference), b = runs ? runs.b[index]! : await freshShot(hostB, owned, browser, c, on);
    const parity = compareParityImages(a.png, r.png, b.png, { over32Budget: budget }), name = `${tier}-${preset}-${view}${tag}`, onVsOff = exact(a.png, b.png), repeatVsOff = exact(a.png, r.png);
    const lines = parity.lines;
    const pass = parity.pass;
    if (writeMode === 'all' || (writeMode === 'changed' && (!pass || onVsOff.over32 >= repeatVsOff.over32 + CHANGED))) {
      write(resolve(out, `${name}-${nameA}.png`), a.png); write(resolve(out, `${name}-repeat.png`), r.png); write(resolve(out, `${name}-${nameB}.png`), b.png); write(resolve(out, `${name}-diff.png`), parity.diff);
    }
    const row = { tier, preset, view, variant, before: before || null, page: pageMode, backend: b.backend, pass, b06: parity.pass, luminancePass: parity.luminancePass, parityScope: parity.scope, lines, globalMean: parity.globalMean, noiseGlobalMean: parity.noiseGlobalMean, passingTiles: parity.passingTiles, tiles: parity.tiles.length,
      failingTiles: parity.tiles.filter(t => !t.pass).map(t => ({ x: t.x, y: t.y, mean: +t.mean.toExponential(2), threshold: +t.threshold.toExponential(2) })),
      onVsOff, repeatVsOff, draw: { off: a.draw, on: b.draw }, bridge: { off: a.bridge, on: b.bridge }, usingFar: { off: a.usingFar, on: b.usingFar }, camera: { off: a.camera, on: b.camera } };
    results.push(row);
    console.log(`${name} (${b.backend}${before ? `, ${before} vs ${build}` : ''}): ${row.pass ? 'PASS' : 'FAIL'} B-06 ${parity.pass ? 'pass' : 'FAIL'} mean ${parity.globalMean.toExponential(2)} noise ${parity.noiseGlobalMean.toExponential(2)} tiles ${parity.passingTiles}/${parity.tiles.length}; over 32 ${onVsOff.over32} vs repeat ${repeatVsOff.over32} (budget ${budget}) ${lines.pass ? 'ok' : 'OVER'}; differing ${onVsOff.differingPixels} (max ${onVsOff.maxChannelDelta}), repeat differing ${repeatVsOff.differingPixels}`);
  }
} finally { await browser.close(); await servedB.close(); if (servedA !== servedB) await servedA.close(); }
// parity.json accumulates rows across runs (keyed by build, reference build, tier, preset, view, variant and backend); parity.md lists them all.
const json = resolve(out, 'parity.json'), key = (r: any) => `${r.build}|${r.before ?? ''}|${r.tier}|${r.preset ?? 'day'}|${r.view}|${r.variant}|${r.backend}`;
const previous: any[] = existsSync(json) ? (JSON.parse(readFileSync(json, 'utf8')).results ?? []).filter((r: any) => r.build) : [], fresh = new Set(results.map(r => key({ ...r, build })));
const all = [...previous.filter(r => !fresh.has(key(r))), ...results.map(r => ({ build, ...r }))];
writeFileSync(json, JSON.stringify({ size: [WIDTH, HEIGHT], off: OFF, results: all }, null, 1) + '\n');
writeFileSync(resolve(out, 'parity.md'), ['| build | reference | backend | tier | preset | view | variant | pass | B-06 | mean luminance delta | repeat noise | tiles passing | over 32 (on vs reference) | over 32 (repeat vs reference) | pixels differing (on vs reference) | max channel delta | pixels differing (repeat vs reference) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...all.map(r => `| ${r.build} | ${r.before ?? 'off'} | ${r.backend} | ${r.tier} | ${r.preset ?? 'day'} | ${r.view} | ${r.variant} | ${r.pass ? 'yes' : 'NO'} | ${(r.b06 ?? r.pass) ? 'yes' : 'NO'} | ${r.globalMean.toExponential(2)} | ${r.noiseGlobalMean.toExponential(2)} | ${r.passingTiles}/${r.tiles} | ${r.onVsOff.over32 ?? '-'} | ${r.repeatVsOff.over32 ?? '-'} | ${r.onVsOff.differingPixels} | ${r.onVsOff.maxChannelDelta} | ${r.repeatVsOff.differingPixels} |`)].join('\n') + '\n');
process.exitCode = results.every(r => r.pass) ? 0 : 1;
