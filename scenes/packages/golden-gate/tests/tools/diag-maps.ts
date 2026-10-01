// Water-map orientation diagnostic (development only). Renders the water's opacity-factor debug view
// with the terrain hidden, and compares each sampled pixel's shoreline factor (red) with the
// shoreline map decoded on the CPU at the pixel's point on the water plane, for several candidate
// transforms. The transform with no mismatches is how the GPU is actually sampling the map.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/diag-maps.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned } from './owned.ts';
import { outputFor } from './build.ts';
import { stagedDir } from '../../scripts/release.ts';
import { readPng } from './image.ts';

const shore = PNG.sync.read(readFileSync(resolve(stagedDir(), 'terrain/water/near_shore_distance_u16.png')), { skipRescale: true }) as unknown as { width: number; data: Uint16Array };
const shoreAt = (x: number, z: number) => {
  if (Math.abs(x) >= 2000 || Math.abs(z) >= 2000) return NaN;
  const i = Math.floor((x + 2000) / 4000 * 2048), j = Math.floor((2000 - z) / 4000 * 2048); return shore.data[(j * 2048 + i) * 4]! * .1 - 300;
};
const transforms: Record<string, (x: number, z: number) => [number, number]> = {
  identity: (x, z) => [x, z], mirrorZ: (x, z) => [x, -z], mirrorX: (x, z) => [-x, z], mirrorXZ: (x, z) => [-x, -z], swap: (x, z) => [z, x], swapNeg: (x, z) => [-z, -x],
};
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-maps', 1280, 720);
try {
  const page = await chrome.browser.newPage();
  const url = `${hosted.url}/?capture=1&hud=0&tier=high&time=12`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kilnHarness?.snapshot().readyCount > 0, { timeout: 180_000 });
  const invoke = (name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args);
  await invoke('setPartVisible', 'terrain', false); await invoke('setPartVisible', 'bridge', false); await invoke('setWaterDebug', 'opacity');
  for (const view of ['tower', 'postcard', 'span']) {
    await invoke('setView', view); await page.evaluate(() => (window as any).__kilnScene.waitFrames(8));
    const img = readPng(await page.screenshot({ type: 'png' }));
    const pixels: [number, number][] = []; for (let y = 8; y < 720; y += 24) for (let x = 8; x < 1280; x += 24) pixels.push([x, y]);
    const points = await page.evaluate((list: [number, number][]) => list.map(([x, y]) => (window as any).__kilnScene.invoke('groundPoint', x, y)), pixels) as ([number, number] | null)[];
    const score: Record<string, { agree: number; disagree: number }> = Object.fromEntries(Object.keys(transforms).map(k => [k, { agree: 0, disagree: 0 }]));
    pixels.forEach(([px, py], index) => {
      const p = points[index]; if (!p) return;
      const red = img.data[(py * img.width + px) * 4]!, gpuWater = red > 127;
      if (red > 40 && red < 215) return; // factor edge: ambiguous
      for (const [name, f] of Object.entries(transforms)) {
        const [x, z] = f(p[0], p[1]), s = shoreAt(x, z); if (!Number.isFinite(s) || Math.abs(s) < 4) continue;
        if ((s > 0) === gpuWater) score[name]!.agree++; else score[name]!.disagree++;
      }
    });
    console.log(view, JSON.stringify(score));
  }
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
