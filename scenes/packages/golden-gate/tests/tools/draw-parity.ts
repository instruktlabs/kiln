// Draw optimisation parity (docs/plans/2026-10-01-draw-optimization-cycle.md S4b/S5, OD-4, OD-18): frozen-clock captures of
// Golden Gate views with every draw optimisation off (bridgeMerge, shadowOnce, standIns and reflectionStandIns false), a
// second capture of the same as the noise floor, and the build's defaults (or one variant), compared with the B-06 comparer
// (scripts/parity-images.ts compareParityImages). A test-mode build is required:
//   bun scripts/build-scene.ts --scene golden-gate --mode test --label <l>
//   bun packages/golden-gate/tests/tools/draw-parity.ts --build <l> [--tiers high,minimal] [--views arrival,postcard,pier,send-side]
//     [--variant defaults|<query>] [--backend webgl2] [--out <dir>]
// `--variant` takes a query added to the "on" capture (for example `standIns=false` to isolate a feature); the default is the
// build's own defaults. Views are scene cameras (`cam`) or the capture tool's review poses (tests/tools/capture.ts POSES, held
// with setPose). Output per tier and view: <tier>-<view>[-<variant>]-off.png, -repeat.png, -on.png and -diff.png (x4), and
// parity.json and parity.md accumulating every run's rows. Pages load from the owned loopback server; nothing here reads time.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames } from '../../../scene-kit/src/testing/node';
import { sceneOutput } from '../../../../scripts/build-scene';
import { compareParityImages, type RgbaImage } from '../../../../scripts/parity-images';

const SCENES = resolve(import.meta.dir, '../../../..'), WIDTH = 1280, HEIGHT = 720, TIMEOUT = 180_000;
const OFF = { bridgeMerge: 'false', shadowOnce: 'false', standIns: 'false', reflectionStandIns: 'false' };
/** Review poses from tests/tools/capture.ts (SCENE-REVIEW-2): the south pier from above west and the south deck end from its side, over the Fort Point shore. */
const POSES: Record<string, { position: [number, number, number]; target: [number, number, number]; fov: number }> = {
  'sp-high-w': { position: [90, 70, -560], target: [0, 4, -640], fov: 55 },
  'send-side': { position: [140, 110, -1000], target: [0, 70, -1040], fov: 55 },
  'nend-side': { position: [140, 110, 1000], target: [0, 70, 1040], fov: 55 },
};
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const build = option('--build', ''), tiers = option('--tiers', 'high,minimal').split(','), views = option('--views', 'arrival,postcard,pier,send-side').split(',');
const variant = option('--variant', 'defaults'), backend = option('--backend', '') === 'webgl2' ? { backend: 'webgl2' } : {}, out = resolve(SCENES, option('--out', '../tmp/drawcalls/wave-b/gg/parity'));
if (!build) throw new Error('--build <label> is required');

/* eslint-disable @typescript-eslint/no-explicit-any */
const invoke = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, v) => (window as any).__kilnScene.invoke(n, ...v), name, a);
async function shoot(base: string, owned: ReadonlySet<number>, browser: Awaited<ReturnType<typeof launchChrome>>, tier: string, view: string, extra: Record<string, string>) {
  const pose = POSES[view], url = `${base}/?${new URLSearchParams({ capture: '1', hud: '0', tier, preset: 'day', cam: pose ? 'postcard' : view, time: '12', ...backend, ...extra })}`;
  assertOwnedUrl(url, owned);
  const page = await browser.newPage(); page.setDefaultTimeout(TIMEOUT);
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
    await waitFrames(page, 12);
    if (pose && await invoke(page, 'setPose', pose) !== 'pose') throw new Error(`setPose ${view} failed`);
    // The orbit and pose ease in: wait until two camera reads 10 frames apart agree.
    for (let i = 0, last = ''; i < 30; i++) { const now = JSON.stringify((await invoke(page, 'ggStats') as any).camera.position); if (now === last) break; last = now; await waitFrames(page, 10); }
    await waitFrames(page, 4);
    const stats = await invoke(page, 'ggStats') as any, canvas = await page.$('canvas');
    const png = PNG.sync.read(Buffer.from(await canvas!.screenshot({ type: 'png' })));
    if (png.width !== WIDTH || png.height !== HEIGHT) throw new Error(`Capture is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`);
    return { png: { width: png.width, height: png.height, data: new Uint8Array(png.data) } as RgbaImage, draw: stats.draw, bridge: { draws: stats.bridge.draws, proxies: stats.bridge.shadowProxies?.proxies ?? 0, reflection: stats.bridge.reflectionProxies }, backend: await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend')) };
  } finally { await page.close().catch(() => {}); }
}
const write = (path: string, image: RgbaImage) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };
const exact = (a: RgbaImage, b: RgbaImage) => { let differing = 0, max = 0; for (let i = 0; i < a.data.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!)); if (d) { differing++; if (d > max) max = d; } } return { differingPixels: differing, maxChannelDelta: max }; };

mkdirSync(out, { recursive: true });
const on = variant === 'defaults' ? {} : Object.fromEntries(new URLSearchParams(variant)), tag = (variant === 'defaults' ? '' : `-${variant.replace(/[^a-zA-Z0-9]+/g, '_')}`) + (backend.backend ? '-webgl2' : '');
const hosted = await serveOwned(sceneOutput('golden-gate', build, 'test')), owned = new Set([hosted.port]), browser = await launchChrome({ workspace: SCENES, name: 'gg-draw-parity', windowSize: [WIDTH, HEIGHT] });
const results: any[] = [];
try {
  for (const tier of tiers) for (const view of views) {
    const a = await shoot(hosted.url, owned, browser, tier, view, OFF), r = await shoot(hosted.url, owned, browser, tier, view, OFF), b = await shoot(hosted.url, owned, browser, tier, view, on);
    const parity = compareParityImages(a.png, r.png, b.png), name = `${tier}-${view}${tag}`;
    write(resolve(out, `${name}-off.png`), a.png); write(resolve(out, `${name}-repeat.png`), r.png); write(resolve(out, `${name}-on.png`), b.png); write(resolve(out, `${name}-diff.png`), parity.diff);
    const row = { tier, view, variant, backend: b.backend, pass: parity.pass, globalMean: parity.globalMean, noiseGlobalMean: parity.noiseGlobalMean, passingTiles: parity.passingTiles, tiles: parity.tiles.length,
      failingTiles: parity.tiles.filter(t => !t.pass).map(t => ({ x: t.x, y: t.y, mean: +t.mean.toExponential(2), threshold: +t.threshold.toExponential(2) })),
      onVsOff: exact(a.png, b.png), repeatVsOff: exact(a.png, r.png), draw: { off: a.draw, on: b.draw }, bridge: { off: a.bridge, on: b.bridge } };
    results.push(row);
    console.log(`${name} (${b.backend}): ${parity.pass ? 'PASS' : 'FAIL'} mean ${parity.globalMean.toExponential(2)} noise ${parity.noiseGlobalMean.toExponential(2)} tiles ${parity.passingTiles}/${parity.tiles.length} differing ${row.onVsOff.differingPixels} (max ${row.onVsOff.maxChannelDelta}), repeat differing ${row.repeatVsOff.differingPixels}`);
  }
} finally { await browser.close(); await hosted.close(); }
// parity.json accumulates rows across runs (keyed by build, tier, view, variant and backend); parity.md lists them all.
const json = resolve(out, 'parity.json'), key = (r: any) => `${r.build}|${r.tier}|${r.view}|${r.variant}|${r.backend}`;
const previous: any[] = existsSync(json) ? (JSON.parse(readFileSync(json, 'utf8')).results ?? []).filter((r: any) => r.build) : [], fresh = new Set(results.map(r => key({ ...r, build })));
const all = [...previous.filter(r => !fresh.has(key(r))), ...results.map(r => ({ build, ...r }))];
writeFileSync(json, JSON.stringify({ size: [WIDTH, HEIGHT], off: OFF, results: all }, null, 1) + '\n');
writeFileSync(resolve(out, 'parity.md'), ['| build | backend | tier | view | variant | pass | mean luminance delta | repeat noise | tiles passing | pixels differing (on vs off) | max channel delta | pixels differing (repeat vs off) |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...all.map(r => `| ${r.build} | ${r.backend} | ${r.tier} | ${r.view} | ${r.variant} | ${r.pass ? 'yes' : 'NO'} | ${r.globalMean.toExponential(2)} | ${r.noiseGlobalMean.toExponential(2)} | ${r.passingTiles}/${r.tiles} | ${r.onVsOff.differingPixels} | ${r.onVsOff.maxChannelDelta} | ${r.repeatVsOff.differingPixels} |`)].join('\n') + '\n');
process.exitCode = results.every(r => r.pass) ? 0 : 1;
