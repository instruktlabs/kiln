// S5 cross-build parity for the Farm (docs/plans/2026-10-01-draw-optimization-cycle.md S5, OD-4, OD-18): two test builds,
// BEFORE and AFTER, at the same frozen-clock views, compared with the B-06 metric (scripts/parity-images.ts
// compareParityImages: 16x9 linear-luminance tiles, tile threshold max(3 x repeat noise, 0.02), pass fraction 0.97, global
// mean < 0.02) and the thin-line check of the Golden Gate review (packages/golden-gate/tests/tools/draw-parity.ts: pixels
// differing by more than 32 levels in any channel, at most --over32-budget more than the BEFORE repeat). Per tier and view:
// BEFORE, a second BEFORE page (the noise floor) and AFTER, each on its own page. When AFTER differs from BEFORE, the AFTER
// build is captured again with its levers switched by dev parameters, so each difference is attributed by measurement:
//   off    heroMerge=false&shadowCache=false&standIns=false&casterTexels=0 (the AFTER build with every lever off)
//   merge  shadowCache=false&standIns=false&casterTexels=0                 (OD-18 hero anchor merge alone)
//   shadow heroMerge=false                                                 (OD-4/OD-9 cache, stand-ins and 2-texel threshold)
// Views: the count probe's Farm fixtures (scripts/scene-fixtures.ts) plus play destinations (dest-tractor, dest-paddocks)
// for close views of the hero shadows. The walk and tractor-drive workloads step on the frame's own delta, so their end
// state differs run to run (the tractor's wheel angle comes from its accumulated travel): each is run once on a BEFORE page
// to find its end pose, and every capture then places Rowan (walk) or mounts the tractor and places it (tractor-drive) there.
//   bun scripts/capture-farm-draw-parity.ts --before draw-base --after draw-after [--tiers minimal,economy,balanced,high]
//     [--views all|id,…] [--backend webgpu|webgl2] [--out evidence/draw-after/farm/parity] [--over32-budget 100]
//     [--decompose auto|never|always]
// Output in --out: parity.json and parity.md (rows accumulate across runs, keyed by tier, view and backend) and, for every
// view where AFTER differs from BEFORE: <tier>-<view>[-webgl2]-before.png, -after.png, -diff.png (B-06, x4 luminance),
// -crop.png (zoomed BEFORE | AFTER over x8 difference | frame) and the lever captures that differ. Pixels only, no timing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser } from 'puppeteer-core';
import { launchChrome, serveOwned } from '../packages/scene-kit/src/testing/node';
import { sceneOutput } from './build-scene';
import { compareParityImages, type RgbaImage } from './parity-images';
import { FARM_VIEWS } from './scene-fixtures';
import { enterFarmView, FARM_PARITY_VIEWS, FARM_WORKLOADS, openFarmPage, settleFarmShadow, shootFarm, type FarmBackend, type FarmPose } from './farm-capture-pages';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dir, '..'), args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
export const LEVERS = { off: 'heroMerge=false&shadowCache=false&standIns=false&casterTexels=0', merge: 'shadowCache=false&standIns=false&casterTexels=0', shadow: 'heroMerge=false' } as const;
export type Lever = keyof typeof LEVERS;

/** Judge this invocation's requested cells, never stale rows accumulated by another backend/run. */
export function farmDrawParityVerdict(request: { tiers: readonly string[]; views: readonly string[]; backend: string }, rows: readonly {
  tier: string; view: string; backend: string; pass: boolean; error?: unknown; messages?: Record<string, readonly unknown[]>;
}[]) {
  const required = request.tiers.flatMap(tier => request.views.map(view => `${tier}/${view}/${request.backend}`));
  const key = (row: typeof rows[number]) => `${row.tier}/${row.view}/${row.backend}`, keys = rows.map(key);
  const missing = required.filter(value => !keys.includes(value)), extra = keys.filter(value => !required.includes(value));
  const duplicate = keys.filter((value, i) => keys.indexOf(value) !== i);
  const failed = rows.filter(row => row.pass !== true || row.error !== undefined || Object.values(row.messages ?? {}).some(messages => messages.some(message => typeof message === 'string' && /^(?:error|pageerror):/.test(message)))).map(key);
  const pass = required.length > 0 && !missing.length && !extra.length && !duplicate.length && !failed.length;
  return { scope: 'Requested tier/view cells on this backend only', pass, exitCode: pass ? 0 : 1,
    expected: required.length, checked: rows.length, missing, extra, duplicate, failed };
}

export function farmDrawParityMarkdownRow(r: any): string {
  const number = (value: unknown, exponential = false) => typeof value === 'number' && Number.isFinite(value) ? exponential ? value.toExponential(2) : String(value) : 'unavailable';
  const lever = (name: Lever) => r.levers?.[name] ? `${number(r.levers[name].vsBefore?.over8)}/${number(r.levers[name].vsBefore?.over32)}` : '-';
  return `| ${r.backend} | ${r.tier} | ${r.view} | ${r.pass ? 'yes' : '**NO**'} | ${r.b06 ? 'yes' : 'NO'} | ${number(r.passingTiles)}/144 | ${number(r.globalMean, true)} | ${number(r.noiseGlobalMean, true)} | ${number(r.afterVsBefore?.over32)} / ${number(r.repeatVsBefore?.over32)} | ${number(r.afterVsBefore?.differing)} / ${number(r.repeatVsBefore?.differing)} | ${number(r.afterVsBefore?.max)} | ${lever('off')} | ${lever('merge')} | ${lever('shadow')} |`;
}

/** Exact differences: pixels differing at all, by more than 8 and by more than 32 levels in any channel, the largest delta, and where. */
export function exactDifference(a: RgbaImage, b: RgbaImage) {
  let differing = 0, over8 = 0, over32 = 0, max = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0, i = 0; i < a.data.length; i += 4, p++) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!));
    if (!d) continue; differing++; if (d > max) max = d;
    if (d > 8) { over8++; const x = p % a.width, y = Math.floor(p / a.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (d > 32) over32++;
  }
  return { differing, over8, over32, max, box: over8 ? { x0, y0, x1, y1 } : null };
}
/** The window (w x h) holding the most differing pixels (over 8 levels when there are any), for a zoomed crop. */
export function densestWindow(a: RgbaImage, b: RgbaImage, w = 160, h = 90) {
  const cell = 10, cols = Math.ceil(a.width / cell), rows = Math.ceil(a.height / cell), strong = new Float64Array(cols * rows), weak = new Float64Array(cols * rows);
  for (let p = 0, i = 0; i < a.data.length; i += 4, p++) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!));
    if (!d) continue; const k = Math.floor(Math.floor(p / a.width) / cell) * cols + Math.floor((p % a.width) / cell);
    weak[k]! += d; if (d > 8) strong[k]! += d;
  }
  const grid = strong.some(v => v > 0) ? strong : weak, cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + ch <= rows; y++) for (let x = 0; x + cw <= cols; x++) {
    let sum = 0; for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) sum += grid[(y + j) * cols + x + i]!;
    if (sum > best) { best = sum; bx = x; by = y; }
  }
  // Centre the window on the weighted centroid of the differences inside the best one.
  let sx = 0, sy = 0, sw = 0;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const v = grid[(by + j) * cols + bx + i]!; sx += v * ((bx + i + .5) * cell); sy += v * ((by + j + .5) * cell); sw += v; }
  const cx = sw ? sx / sw : (bx + cw / 2) * cell, cy = sw ? sy / sw : (by + ch / 2) * cell;
  return { x: Math.max(0, Math.min(Math.round(cx - w / 2), a.width - w)), y: Math.max(0, Math.min(Math.round(cy - h / 2), a.height - h)), width: w, height: h };
}
const blank = (width: number, height: number): RgbaImage => ({ width, height, data: new Uint8Array(width * height * 4).fill(255) });
/** Nearest-neighbour copy of `rect` from `src` into `dst` at (dx, dy), scaled to (dw, dh); `pixel` may remap each value. */
function blit(dst: RgbaImage, src: RgbaImage, rect: { x: number; y: number; width: number; height: number }, dx: number, dy: number, dw: number, dh: number, pixel?: (i: number) => [number, number, number]) {
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = rect.x + Math.min(rect.width - 1, Math.floor(x * rect.width / dw)), sy = rect.y + Math.min(rect.height - 1, Math.floor(y * rect.height / dh)), s = (sy * src.width + sx) * 4, d = ((dy + y) * dst.width + dx + x) * 4;
    const [r, g, b] = pixel ? pixel(s) : [src.data[s]!, src.data[s + 1]!, src.data[s + 2]!];
    dst.data[d] = r; dst.data[d + 1] = g; dst.data[d + 2] = b; dst.data[d + 3] = 255;
  }
}
/** 640x360: BEFORE | AFTER zoomed 2.5x on top; the x8 channel difference of the crop | the AFTER frame with the crop outlined below. */
export function cropSheet(before: RgbaImage, after: RgbaImage) {
  const rect = densestWindow(before, after, 128, 72), out = blank(640, 360);
  blit(out, before, rect, 0, 0, 320, 180); blit(out, after, rect, 320, 0, 320, 180);
  blit(out, after, rect, 0, 180, 320, 180, s => { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(after.data[s + c]! - before.data[s + c]!)); const v = Math.min(255, d * 8); return [v, v, v]; });
  blit(out, after, { x: 0, y: 0, width: after.width, height: after.height }, 320, 180, 320, 180);
  const sx = 320 / after.width, sy = 180 / after.height, rx0 = 320 + Math.floor(rect.x * sx), ry0 = 180 + Math.floor(rect.y * sy), rx1 = 320 + Math.ceil((rect.x + rect.width) * sx), ry1 = 180 + Math.ceil((rect.y + rect.height) * sy);
  const mark = (x: number, y: number) => { if (x < 320 || x >= 640 || y < 180 || y >= 360) return; const d = (y * 640 + x) * 4; out.data[d] = 255; out.data[d + 1] = 40; out.data[d + 2] = 40; };
  for (let x = rx0; x <= rx1; x++) { mark(x, ry0); mark(x, ry1); } for (let y = ry0; y <= ry1; y++) { mark(rx0, y); mark(rx1, y); }
  for (let y = 0; y < 360; y++) for (const x of [319, 320]) { const d = (y * 640 + x) * 4; out.data[d] = out.data[d + 1] = out.data[d + 2] = 255; }
  for (let x = 0; x < 640; x++) for (const y of [179, 180]) { const d = (y * 640 + x) * 4; out.data[d] = out.data[d + 1] = out.data[d + 2] = 255; }
  return { image: out, rect };
}
export const writePng = (path: string, image: RgbaImage) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };

interface Shot { png: RgbaImage; pose: FarmPose | null; settle: unknown; counts: unknown; messages: string[] }
/** A workload's end pose: the workload run once on a BEFORE page (as the count probe runs it), not captured. */
async function discover(browser: Browser, server: { url: string; port: number }, tier: string, backend: FarmBackend, view: string): Promise<FarmPose> {
  const { page } = await openFarmPage({ browser, base: server.url, owned: new Set([server.port]), tier, backend, view: 'hero' });
  try { const pose = await enterFarmView(page, view, null); if (!pose) throw new Error(`${view}: no pose`); return pose; } finally { await page.close().catch(() => {}); }
}
async function capture(browser: Browser, server: { url: string; port: number }, tier: string, backend: FarmBackend, view: string, pin: FarmPose | null, extra?: string): Promise<Shot> {
  const named = (FARM_VIEWS as readonly string[]).includes(view);
  const { page, messages } = await openFarmPage({ browser, base: server.url, owned: new Set([server.port]), tier, backend, view: named ? view : 'hero', ...(extra ? { extra: Object.fromEntries(new URLSearchParams(extra)) } : {}) });
  try {
    const pose = await enterFarmView(page, view, pin), settle = await settleFarmShadow(page), png = await shootFarm(page);
    const counts = await page.evaluate(() => { const s = (window as any).__kilnScene, st = s.stats(); return { drawCalls: st.render?.drawCalls, triangles: st.render?.triangles, pipelines: st.pipelines, shadow: st.counts?.shadow ? { staticRenders: st.counts.shadow.staticRenders, liveCasters: st.counts.shadow.liveCasters, pendingSettle: st.counts.shadow.pendingSettle } : null }; });
    return { png, pose, settle, counts, messages };
  } finally { await page.close().catch(() => {}); }
}

if (import.meta.main) {
  const before = option('--before', 'draw-base'), after = option('--after', 'draw-after'), tiers = option('--tiers', 'minimal,economy,balanced,high').split(',');
  const views = option('--views', 'all') === 'all' ? FARM_PARITY_VIEWS : option('--views', '').split(','), backend = option('--backend', 'webgpu') as FarmBackend;
  const out = resolve(ROOT, option('--out', 'evidence/draw-after/farm/parity')), budget = Number(option('--over32-budget', '100')), decompose = option('--decompose', 'auto');
  for (const v of views) if (!FARM_PARITY_VIEWS.includes(v)) throw new Error(`Unknown Farm parity view ${v}`);
  if (!['webgpu', 'webgl2'].includes(backend)) throw new Error('Unknown Farm parity backend');
  if (!tiers.length || tiers.some(tier => !['minimal', 'economy', 'balanced', 'high'].includes(tier)) || new Set(tiers).size !== tiers.length || new Set(views).size !== views.length) throw new Error('Select unique valid Farm tiers and views');
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('--over32-budget must be a finite nonnegative integer');
  mkdirSync(out, { recursive: true });
  const servers = { before: await serveOwned(sceneOutput('farm', before, 'test')), after: await serveOwned(sceneOutput('farm', after, 'test')) };
  const browser = await launchChrome({ workspace: ROOT, name: 'farm-draw-parity', windowSize: [1280, 720] }), results: any[] = [], tag = backend === 'webgl2' ? '-webgl2' : '';
  const request = { tiers, views, backend };
  const json = resolve(out, 'parity.json'), key = (r: any) => `${r.tier}|${r.view}|${r.backend}`;
  const flush = () => {
    const previous: any[] = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')).results ?? [] : [], fresh = new Set(results.map(key));
    const all = [...previous.filter(r => !fresh.has(key(r))), ...results];
    writeFileSync(json, JSON.stringify({ before, after, size: [1280, 720], levers: LEVERS, over32Budget: budget, results: all,
      latestRun: { request, ...farmDrawParityVerdict(request, results) } }, null, 1) + '\n');
    writeFileSync(resolve(out, 'parity.md'), ['| Backend | Tier | View | Pass | B-06 | Tiles | Mean Δ | Repeat mean | >32 levels (after / repeat) | Pixels differing (after / repeat) | Max Δ | >8 / >32 with levers off | merge alone | shadow alone |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...all.sort((a, b) => a.backend.localeCompare(b.backend) || tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || FARM_PARITY_VIEWS.indexOf(a.view) - FARM_PARITY_VIEWS.indexOf(b.view)).map(farmDrawParityMarkdownRow)].join('\n') + '\n');
  };
  try {
    for (const tier of tiers) for (const view of views) {
      const name = `${tier}-${view}${tag}`;
      try {
        const pin = FARM_WORKLOADS.has(view) ? await discover(browser, servers.before, tier, backend, view) : null;
        const a = await capture(browser, servers.before, tier, backend, view, pin), r = await capture(browser, servers.before, tier, backend, view, pin), b = await capture(browser, servers.after, tier, backend, view, pin);
        const metric = compareParityImages(a.png, r.png, b.png, { over32Budget: budget }), afterVsBefore = exactDifference(a.png, b.png), repeatVsBefore = exactDifference(a.png, r.png);
        const lines = metric.lines;
        const differs = afterVsBefore.differing > repeatVsBefore.differing || afterVsBefore.over8 > repeatVsBefore.over8;
        const row: any = { tier, view, backend, pass: metric.pass, b06: metric.pass, luminancePass: metric.luminancePass, parityScope: metric.scope, lines, globalMean: metric.globalMean, noiseGlobalMean: metric.noiseGlobalMean, passingTiles: metric.passingTiles,
          failingTiles: metric.tiles.filter(t => !t.pass).map(t => ({ x: t.x, y: t.y, mean: +t.mean.toExponential(2), threshold: +t.threshold.toExponential(2) })), afterVsBefore, repeatVsBefore, differs,
          pose: a.pose, settle: { before: a.settle, after: b.settle }, counts: { before: a.counts, after: b.counts }, messages: { before: a.messages, repeat: r.messages, after: b.messages } };
        if (differs || !row.pass) {
          writePng(resolve(out, `${name}-before.png`), a.png); writePng(resolve(out, `${name}-after.png`), b.png); writePng(resolve(out, `${name}-diff.png`), metric.diff);
          if (repeatVsBefore.differing) writePng(resolve(out, `${name}-repeat.png`), r.png);
          const sheet = cropSheet(a.png, b.png); writePng(resolve(out, `${name}-crop.png`), sheet.image); row.crop = sheet.rect;
        }
        if (decompose === 'always' || (decompose === 'auto' && differs)) {
          row.levers = {};
          for (const [lever, query] of Object.entries(LEVERS) as [Lever, string][]) {
            const c = await capture(browser, servers.after, tier, backend, view, a.pose, query), m = compareParityImages(a.png, r.png, c.png, { over32Budget: budget }), vs = exactDifference(a.png, c.png);
            row.levers[lever] = { query, b06: m.pass, luminancePass: m.luminancePass, parityScope: m.scope, passingTiles: m.passingTiles, globalMean: m.globalMean, vsBefore: vs, vsAfter: exactDifference(b.png, c.png), counts: c.counts, messages: c.messages };
            if (vs.differing > repeatVsBefore.differing) { writePng(resolve(out, `${name}-${lever}.png`), c.png); writePng(resolve(out, `${name}-${lever}-crop.png`), cropSheet(a.png, c.png).image); }
          }
        }
        results.push(row);
        console.log(`${name}: ${row.pass ? 'PASS' : 'FAIL'} B-06 ${metric.pass ? 'pass' : 'FAIL'} ${metric.passingTiles}/144 mean ${metric.globalMean.toExponential(2)} noise ${metric.noiseGlobalMean.toExponential(2)}; >32 ${afterVsBefore.over32} vs repeat ${repeatVsBefore.over32} ${lines.pass ? 'ok' : 'OVER'}; differing ${afterVsBefore.differing} (>8 ${afterVsBefore.over8}, max ${afterVsBefore.max}) repeat ${repeatVsBefore.differing}${row.levers ? `; off ${row.levers.off.vsBefore.over8}, merge ${row.levers.merge.vsBefore.over8}, shadow ${row.levers.shadow.vsBefore.over8} px >8` : ''}`);
      } catch (error) {
        results.push({ tier, view, backend, pass: false, b06: false, error: String((error as Error)?.stack ?? error).slice(0, 1500), lines: {}, afterVsBefore: {}, repeatVsBefore: {}, globalMean: NaN, noiseGlobalMean: NaN, passingTiles: 0 });
        console.log(`${name}: ERROR ${String(error).split('\n')[0]}`);
      }
      flush();
    }
  } finally { await browser.close(); await servers.before.close(); await servers.after.close(); flush(); }
  const verdict = farmDrawParityVerdict(request, results);
  console.log(JSON.stringify(verdict)); if (!verdict.pass) process.exitCode = verdict.exitCode;
}
