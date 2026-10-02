// Foundry Floor planting parity (draw-optimization wave B, OD-18): frozen-clock captures of the campus views with the shared
// planting (the default) and with ?plantingShared=false, compared with the B-06 comparer (compareParityImages): the shared
// planting must be look-neutral, so a second capture of the per-material planting is the noise floor and the shared one must
// stay inside it. A test-mode build of the campus standalone is required (bun scripts/build-scene.ts --scene foundry-floor
// --mode test --label <l>).
//   bun scripts/capture-foundry-planting-parity.ts --build <label> [--tiers high,minimal] [--views campus,pair,canopy,split,bridge,roundabout] [--backend webgl2] [--out <dir>]
// Besides the named campus views, `close-<zone>` views put the camera 22 to 28 m from a plant of that zone (island, avenue, parking,
// windbreak, arrival), where the crowns fill the frame at their finest level: the demanding case for colour and shading.
// Output per tier and view: <tier>-<view>-off.png, -repeat.png (off again), -on.png and -diff.png (the on/off difference x4),
// plus parity.json and parity.md. Pages load from the owned loopback server; nothing here reads time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';
import { parseCampus } from '../packages/foundry-floor/src/campus/data';
import { campusPlantings, PLANT_SIZES } from '../packages/foundry-floor/src/campus/exterior/planting';
import { sceneOutput } from './build-scene';
import { compareParityImages, type RgbaImage } from './parity-images';

const ROOT = resolve(import.meta.dir, '..'), WIDTH = 1280, HEIGHT = 720, TIMEOUT = 120_000;
const HIDE_UI = '.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel,#page-status{visibility:hidden!important}';
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const build = option('--build', ''), tiers = option('--tiers', 'high,minimal').split(','), views = option('--views', 'campus,pair,canopy,split,bridge,roundabout,close-island,close-avenue,close-parking,close-windbreak,close-arrival').split(',');
const backend = option('--backend', '') === 'webgl2' ? 'webgl2' : '';
const out = resolve(ROOT, option('--out', '../tmp/drawcalls/wave-b/foundry/parity'));
if (!build) throw new Error('--build <label> is required');

/* eslint-disable @typescript-eslint/no-explicit-any */
const invoke = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, v) => (window as any).__kilnScene.invoke(n, ...v), name, a);
async function shoot(base: string, owned: ReadonlySet<number>, browser: Awaited<ReturnType<typeof launchChrome>>, tier: string, view: string, shared: boolean): Promise<{ png: RgbaImage; stats: unknown; backend: string | null }> {
  const url = `${base}/?${new URLSearchParams({ freeze: '1', time: '0', capture: '1', tier, plantingShared: String(shared), ...(backend ? { backend } : {}) })}`;
  assertOwnedUrl(url, owned);
  const page = await browser.newPage(); page.setDefaultTimeout(TIMEOUT);
  try {
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
    await page.addStyleTag({ content: HIDE_UI });
    await page.waitForFunction(() => (window as any).__kilnScene.invoke('driveTraffic', 1) !== null, { timeout: TIMEOUT, polling: 100 });
    if (view.startsWith('close-')) { const pose = closePose(view.slice(6)); await invoke(page, 'campusPose', pose.position, pose.target, 50); } else await invoke(page, 'campusView', view);
    await waitFrames(page, 40);
    // The orbit eases into the view: wait until two reads 10 frames apart agree.
    for (let i = 0, last = ''; i < 30; i++) { const now = JSON.stringify((await invoke(page, 'campusState') as any).camera); if (now === last) break; last = now; await waitFrames(page, 10); }
    await waitFrames(page, 4);
    const stats = (await invoke(page, 'campusState') as any).vegetation, canvas = await page.$('canvas');
    const png = PNG.sync.read(Buffer.from(await canvas!.screenshot({ type: 'png' })));
    if (png.width !== WIDTH || png.height !== HEIGHT) throw new Error(`Capture is ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`);
    return { png: { width: png.width, height: png.height, data: new Uint8Array(png.data) }, stats, backend: await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend')) };
  } finally { await page.close().catch(() => {}); }
}
const plants = campusPlantings(parseCampus(readFileSync(resolve(ROOT, 'packages/foundry-floor/data/campus.json'), 'utf8')));
/** Camera 28 m from the first plant of the zone (the island's first conifer, past x = 300 on the avenue), eye 6 m up, looking at its middle, from the campus-centre side (the island's from outside it, 22 m). */
function closePose(zone: string): { position: [number, number, number]; target: [number, number, number] } {
  const p = plants.find(q => q.zone === zone && (zone !== 'island' || q.model === 'tree-conifer-m') && (zone !== 'avenue' || Math.abs(q.x) > 300))!, d = Math.hypot(p.x, p.z) || 1, h = PLANT_SIZES[p.model][1];
  const away = zone === 'island' ? 22 : -28;
  return { position: [p.x + p.x / d * away, 6, p.z + p.z / d * away], target: [p.x, h * 0.45, p.z] };
}
const write = (path: string, image: RgbaImage) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };
const exact = (a: RgbaImage, b: RgbaImage) => { let differing = 0, max = 0; for (let i = 0; i < a.data.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!)); if (d) { differing++; if (d > max) max = d; } } return { differingPixels: differing, maxChannelDelta: max }; };

mkdirSync(out, { recursive: true });
const dir = sceneOutput('foundry-floor', build, 'test'), hosted = await serveOwned(dir), owned = new Set([hosted.port]), browser = await launchChrome({ workspace: ROOT, name: 'planting-parity', windowSize: [WIDTH, HEIGHT] });
const results: any[] = [];
try {
  for (const tier of tiers) for (const view of views) {
    const off = await shoot(hosted.url, owned, browser, tier, view, false), repeat = await shoot(hosted.url, owned, browser, tier, view, false), on = await shoot(hosted.url, owned, browser, tier, view, true);
    const parity = compareParityImages(off.png, repeat.png, on.png), name = `${tier}-${view}`;
    write(resolve(out, `${name}-off.png`), off.png); write(resolve(out, `${name}-repeat.png`), repeat.png); write(resolve(out, `${name}-on.png`), on.png); write(resolve(out, `${name}-diff.png`), parity.diff);
    const row = { tier, view, backend: on.backend, pass: parity.pass, globalMean: parity.globalMean, noiseGlobalMean: parity.noiseGlobalMean, passingTiles: parity.passingTiles, tiles: parity.tiles.length,
      onVsOff: exact(off.png, on.png), repeatVsOff: exact(off.png, repeat.png), planting: { off: off.stats, on: on.stats } };
    results.push(row); console.log(`${name} (${on.backend}): ${parity.pass ? 'PASS' : 'FAIL'} mean ${parity.globalMean.toExponential(2)} noise ${parity.noiseGlobalMean.toExponential(2)} tiles ${parity.passingTiles}/${parity.tiles.length} differing ${row.onVsOff.differingPixels} (max ${row.onVsOff.maxChannelDelta}), repeat differing ${row.repeatVsOff.differingPixels}`);
  }
} finally { await browser.close(); await hosted.close(); }
writeFileSync(resolve(out, 'parity.json'), JSON.stringify({ build, size: [WIDTH, HEIGHT], results }, null, 1) + '\n');
writeFileSync(resolve(out, 'parity.md'), ['| tier | view | pass | mean luminance delta | repeat noise | tiles passing | pixels differing (on vs off) | max channel delta | pixels differing (repeat vs off) |', '|---|---|---|---|---|---|---|---|---|',
  ...results.map(r => `| ${r.tier} | ${r.view} | ${r.pass ? 'yes' : 'NO'} | ${r.globalMean.toExponential(2)} | ${r.noiseGlobalMean.toExponential(2)} | ${r.passingTiles}/${r.tiles} | ${r.onVsOff.differingPixels} | ${r.onVsOff.maxChannelDelta} | ${r.repeatVsOff.differingPixels} |`)].join('\n') + '\n');
process.exitCode = results.every(r => r.pass) ? 0 : 1;
