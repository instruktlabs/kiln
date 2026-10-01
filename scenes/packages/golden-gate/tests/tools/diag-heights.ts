// Height diagnostic (development only): rendered terrain height (ray cast) against the collision
// heightfield and the water depth map at given points, to find terrain standing above the sea.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/diag-heights.ts [x,z ...]
import { assertOwnedUrl, launchHeadless, serveOwned } from './owned.ts';
import { outputFor } from './build.ts';

const points = process.argv.slice(2).filter(a => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a)).map(a => a.split(',').map(Number) as [number, number]);
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-heights', 640, 360);
try {
  const page = await chrome.browser.newPage();
  const url = `${hosted.url}/?capture=1&hud=0&tier=high&time=12`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kilnHarness?.snapshot().readyCount > 0, { timeout: 180_000 });
  const grid: [number, number][] = points.length ? points : [];
  if (!grid.length) for (let z = -1000; z <= -500; z += 50) for (let x = -200; x <= 600; x += 100) grid.push([x, z]);
  const rows = await page.evaluate((list: [number, number][]) => list.map(([x, z]) => {
    const scene = (window as any).__kilnScene;
    return { x, z, terrain: scene.invoke('terrainHeight', x, z), collision: scene.invoke('heightAt', x, z) };
  }), grid);
  for (const row of rows) console.log(JSON.stringify(row));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
