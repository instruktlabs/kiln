// S5 Farm page helpers shared by scripts/capture-farm-draw-parity.ts (cross-build parity) and scripts/farm-x02-baseline.ts
// (the OD-8 X-02 reference): one fresh page per capture at any tier and backend, the B-06 page normalization (1280x720
// canvas, HUD hidden), the count probe's fixtures (scripts/scene-fixtures.ts FARM_FIXTURES) plus play destinations, a wait
// for the cached sun shadow to settle, and pinned end poses for the two workloads. Counts and pixels only, never timing.
import type { Browser, Page } from 'puppeteer-core';
import { PNG } from 'pngjs';
import { assertOwnedUrl, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';
import { FARM_FIXTURES } from './scene-fixtures';
import type { RgbaImage } from './parity-images';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TIMEOUT = 180_000;
export type FarmBackend = 'webgpu' | 'webgl2';
/** scripts/capture-farm-parity.ts normalizedCss (B-06): a 1280x720 canvas at the page origin, HUD and chrome hidden. */
export const FARM_PARITY_CSS = `
html,body{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;overflow:hidden!important;display:block!important}
body>header,body>footer,aside{display:none!important}
main,#farm-view,#scene-shell,#farm,.ks-root{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;max-width:none!important;max-height:none!important;min-height:0!important;width:1280px!important;height:720px!important;box-sizing:border-box!important}
main,#farm-view,#scene-shell,#farm{position:absolute!important;left:0!important;top:0!important;display:block!important}
canvas{display:block!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important}
#farm-view>:not(canvas),#page-status,.ks-hud,.ks-help,.ks-credits,.ks-fade,.ks-dev-panel{visibility:hidden!important}
canvas,.ks-root{outline:none!important}
`;
const FALLBACK = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/;

/** Opens one page on an owned server with the Farm's frozen-clock query and the B-06 normalization; checks the backend. */
export async function openFarmPage(o: { browser: Browser; base: string; owned: ReadonlySet<number>; tier: string; backend: FarmBackend; view: string; extra?: Record<string, string> }) {
  const page = await o.browser.newPage(), messages: string[] = [];
  page.setDefaultTimeout(TIMEOUT);
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warn') && !FALLBACK.test(m.text())) messages.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => messages.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(css => {
    const apply = () => { if (!document.head) return false; const s = document.createElement('style'); s.textContent = css; document.head.append(s); return true; };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, FARM_PARITY_CSS);
  const query = new URLSearchParams({ freeze: '1', time: '0', view: o.view, tier: o.tier, ...(o.backend === 'webgl2' ? { backend: 'webgl2' } : {}), ...o.extra });
  const url = `${o.base}/?${query}`; assertOwnedUrl(url, o.owned);
  try {
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
    const backend = await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend'));
    if (backend !== o.backend) throw new Error(`Expected the ${o.backend} backend, got ${backend}`);
    await FARM_FIXTURES.prepare(page);
    return { page, messages, url };
  } catch (error) { await page.close().catch(() => {}); throw error; }
}

const invoke = (page: Page, name: string, ...a: unknown[]) => page.evaluate((n, x) => (window as any).__kilnScene.invoke(n, ...x), name, a) as Promise<any>;
const frames = (page: Page, n: number) => waitFrames(page, n);
/** Polls simState 20 frames apart until the follow camera, Rowan and the tractor repeat (to 1e-4, the hook's rounding). */
async function rest(page: Page) {
  for (let i = 0, last = ''; i < 60; i++) {
    const s = await invoke(page, 'simState'), now = JSON.stringify([s.player.position, s.player.yaw, s.tractor.position, s.tractor.yaw, s.camera.position, s.camera.quaternion]);
    if (now === last) return; last = now; await frames(page, 20);
  }
  throw new Error('The Farm did not come to rest');
}
/** A workload's end pose, pinned so every build and repeat is captured at the same place (the workloads step on the frame's own delta). */
export interface FarmPose { player: { position: number[]; yaw: number }; tractor: { position: number[]; yaw: number }; driving: boolean }
/**
 * Fixtures: the count probe's FARM_FIXTURES (12 named views, 4 play fixtures, the walk and tractor-drive workloads) plus
 * play destinations (`dest-<name>`, the follow camera at an INV A.1 start point) for close views of the heroes' shadows.
 */
export const FARM_DESTINATION_VIEWS = ['dest-tractor', 'dest-paddocks'] as const;
export const FARM_PARITY_VIEWS = [...FARM_FIXTURES.fixtures.map(f => f.id), ...FARM_DESTINATION_VIEWS];
export const FARM_WORKLOADS = new Set(['walk', 'tractor-drive']);
/**
 * Enters a fixture. A workload without `pin` runs as the count probe runs it and returns the pose it reached. With `pin`
 * it does not run: play starts, Rowan is placed at the pinned pose (walk), or mounts the tractor at its INV A.1 start point
 * with E and the tractor is placed at the pinned pose (tractor-drive). The drive accumulates wheel travel on the frame's own
 * delta, so only a mount without driving gives every build and repeat the same wheel angle (travel 0, steer 0).
 */
export async function enterFarmView(page: Page, view: string, pin?: FarmPose | null): Promise<FarmPose | null> {
  const play = async (to: string) => {
    await page.evaluate(() => (window as any).__kilnScene.setPlaying(true)); await frames(page, 2);
    if (await invoke(page, 'teleport', to) !== true) throw new Error(`Farm destination ${to}`);
    await frames(page, 3);
  };
  if (view.startsWith('dest-')) { await play(view.slice(5)); await rest(page); return null; }
  const fixture = FARM_FIXTURES.fixtures.find(f => f.id === view); if (!fixture) throw new Error(`Unknown Farm view ${view}`);
  if (!FARM_WORKLOADS.has(view)) { await fixture.enter(page); return null; }
  if (!pin) {
    await fixture.enter(page);
    const s = await invoke(page, 'simState');
    return { player: { position: s.player.position, yaw: s.player.yaw }, tractor: { position: s.tractor.position, yaw: s.tractor.yaw }, driving: s.driving };
  }
  if (view === 'walk') { await play('yard'); await invoke(page, 'placePlayer', ...pin.player.position, pin.player.yaw); }
  else {
    await play('tractor');
    if ((await invoke(page, 'simState')).nearest !== 'tractor') throw new Error('Rowan is not beside the tractor at its start point');
    await page.focus('.ks-root'); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__kilnScene.invoke('simState').driving === true, { timeout: TIMEOUT, polling: 'raf' });
    await invoke(page, 'placeTractor', ...pin.tractor.position, pin.tractor.yaw);
  }
  await frames(page, 3); await rest(page);
  const s = await invoke(page, 'simState');
  if (s.driving !== pin.driving) throw new Error(`${view}: driving ${s.driving}, pinned pose driving ${pin.driving}`);
  return pin;
}
/** Waits until the cached sun shadow has settled (pendingSettle 0); a build without the cache returns at once. */
export async function settleFarmShadow(page: Page, limit = 900) {
  return page.evaluate(async lim => {
    const s = (window as any).__kilnScene;
    for (let i = 0; i < lim; i++) { const c = s.invoke('counts')?.shadow; if (!c) return { frames: i, cache: false }; if (c.pendingSettle === 0) return { frames: i, cache: true, live: c.liveCasters, staticRenders: c.staticRenders }; await s.waitFrames(1); }
    const c = s.invoke('counts')?.shadow; return { frames: lim, cache: true, live: c?.liveCasters, pending: c?.pendingSettle, unsettled: true };
  }, limit);
}
/** renderer.info totals of the last frame, read once a frame until three reads agree (X-02 counts, including shadow passes). */
export async function stableFarmCounts(page: Page, limit = 300) {
  return page.evaluate(async lim => {
    const s = (window as any).__kilnScene; let last = '', same = 0, read: any = null;
    for (let i = 0; i < lim; i++) {
      await s.waitFrames(1); const st = s.stats();
      read = { drawCalls: st.render.drawCalls, triangles: st.render.triangles, pipelines: st.pipelines, programs: st.programs, geometries: st.memory.geometries, textures: st.memory.textures };
      const key = JSON.stringify(read); if (key === last) { if (++same >= 2) return { ...read, frames: i, stable: true }; } else { last = key; same = 0; }
    }
    return { ...read, frames: lim, stable: false };
  }, limit);
}
/** The 1280x720 canvas as RGBA. */
export async function shootFarm(page: Page): Promise<RgbaImage> {
  await frames(page, 6);
  const bytes = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 720 }, captureBeyondViewport: false });
  const png = PNG.sync.read(Buffer.from(bytes));
  if (png.width !== 1280 || png.height !== 720) throw new Error(`Capture is ${png.width}x${png.height}, expected 1280x720`);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}
