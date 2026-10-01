// Screen-to-ground diagnostic (development only): for a view and pixels, prints the water-plane
// point, the collision height, the rendered terrain height and the CPU shoreline distance.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/diag-points.ts <view> x,y [x,y ...]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned } from './owned.ts';
import { outputFor } from './build.ts';
import { stagedDir } from '../../scripts/release.ts';

const shore = PNG.sync.read(readFileSync(resolve(stagedDir(), 'terrain/water/near_shore_distance_u16.png')), { skipRescale: true }) as unknown as { data: Uint16Array };
const shoreAt = (x: number, z: number) => Math.abs(x) >= 2000 || Math.abs(z) >= 2000 ? null : Math.round(shore.data[(Math.floor((2000 - z) / 4000 * 2048) * 2048 + Math.floor((x + 2000) / 4000 * 2048)) * 4]! * .1 - 300);
// PowerShell turns x,y into 'x y': read every number and pair them.
const view = process.argv[2] ?? 'tower', numbers = process.argv.slice(3).join(' ').split(/[^-\d.]+/).filter(Boolean).map(Number);
const pixels = Array.from({ length: Math.floor(numbers.length / 2) }, (_, i) => [numbers[2 * i]!, numbers[2 * i + 1]!] as [number, number]);
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-points', 1280, 720);
try {
  const page = await chrome.browser.newPage();
  const url = `${hosted.url}/?capture=1&hud=0&tier=high&time=12&cam=${view}`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kilnHarness?.snapshot().readyCount > 0, { timeout: 180_000 });
  await page.evaluate(() => (window as any).__kilnScene.waitFrames(8));
  const rows = await page.evaluate((list: [number, number][]) => list.map(([x, y]) => {
    const s = (window as any).__kilnScene, p = s.invoke('groundPoint', x, y) as [number, number] | null;
    const c = s.invoke('ggStats').camera.position as number[];
    // The visible terrain point: march the pixel's ray coarsely against the collision field, then
    // finely against the rendered tiles around the first crossing.
    let hit: number[] | null = null;
    if (p) {
      const d = [p[0] - c[0]!, -c[1]!, p[1] - c[2]!], length = Math.hypot(d[0]!, d[1]!, d[2]!), at = (t: number) => [c[0]! + d[0]! * t / length, c[1]! + d[1]! * t / length, c[2]! + d[2]! * t / length];
      let start = 0;
      for (let t = 0; t <= length + 40; t += 8) { const q = at(t); if (s.invoke('heightAt', q[0], q[2]) > q[1]! - 8) { start = Math.max(0, t - 40); break; } start = t; }
      for (let t = start; t <= length + 40; t += 1) { const q = at(t), h = s.invoke('terrainHeight', q[0], q[2]); if (h && h.y >= q[1]!) { hit = [...q.map(v => Math.round(v * 10) / 10), h.tile, ...(h.uv ?? []).map((v: number) => Math.round(v * 1000) / 1000)]; break; } }
    }
    return { pixel: [x, y], ground: p && p.map(v => Math.round(v)), collision: p && Math.round(s.invoke('heightAt', p[0], p[1]) * 10) / 10, hit };
  }), pixels);
  for (const row of rows) console.log(JSON.stringify({ ...row, shore: row.ground ? shoreAt(row.ground[0]!, row.ground[1]!) : null, hitShore: row.hit ? shoreAt(row.hit[0] as number, row.hit[2] as number) : null }));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
