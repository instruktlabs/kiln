// Terrain map diagnostic (development only): checks, inside the loaded scene page, that each near
// tile's object-space normal map agrees with the collision heightfield's slopes (and which axis
// convention agrees best), and that its albedo shows water where the heightfield is at sea level.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/diag-terrain.ts
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned } from './owned.ts';
import { outputFor } from './build.ts';
void PACKAGE_ROOT;

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-diag', 960, 540);
try {
  const page = await chrome.browser.newPage();
  const url = `${hosted.url}/?capture=1&hud=0&tier=high&time=12`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kilnHarness?.snapshot().readyCount > 0, { timeout: 180_000 });
  const result = await page.evaluate(async () => {
    const scene = await (await fetch('./assets/data/scene.json')).json();
    const heightAt = (x: number, z: number) => (window as any).__kilnScene.invoke('heightAt', x, z) as number;
    const decode = async (path: string) => {
      const bitmap = await createImageBitmap(await (await fetch(`./assets/${path}`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
    };
    const tiles = [];
    for (const tile of scene.terrain.levels.near.tiles) {
      const [xmin, zmin, xmax, zmax] = tile.bounds, normal = await decode(tile.normal), albedo = await decode(tile.albedo);
      const at = (img: { width: number; height: number; data: Uint8ClampedArray }, x: number, z: number) => {
        const u = (x - xmin) / (xmax - xmin), v = (zmax - z) / (zmax - zmin);
        const i = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width))), j = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
        const k = (j * img.width + i) * 4; return [img.data[k]!, img.data[k + 1]!, img.data[k + 2]!];
      };
      // Candidate conventions for the decoded normal (n = rgb * 2 - 1) versus the heightfield normal.
      const conventions: Record<string, (n: number[]) => number[]> = {
        'xyz': n => [n[0]!, n[1]!, n[2]!], 'flipX': n => [-n[0]!, n[1]!, n[2]!], 'flipZ': n => [n[0]!, n[1]!, -n[2]!], 'flipXZ': n => [-n[0]!, n[1]!, -n[2]!],
        'zUp': n => [n[0]!, n[2]!, -n[1]!], 'zUpFlip': n => [n[0]!, n[2]!, n[1]!],
      };
      const score: Record<string, number> = Object.fromEntries(Object.keys(conventions).map(k => [k, 0]));
      let slopes = 0; const water = [0, 0, 0], land = [0, 0, 0]; let nw = 0, nl = 0; const flat = [0, 0, 0]; let nf = 0;
      for (let z = zmin + 60; z < zmax - 60; z += 37) for (let x = xmin + 60; x < xmax - 60; x += 37) {
        const h = heightAt(x, z), s = 40;
        const dx = (heightAt(x + s, z) - heightAt(x - s, z)) / (2 * s), dz = (heightAt(x, z + s) - heightAt(x, z - s)) / (2 * s);
        const a = at(albedo, x, z);
        if (h <= .01 && heightAt(x + 80, z) <= .01 && heightAt(x - 80, z) <= .01 && heightAt(x, z + 80) <= .01 && heightAt(x, z - 80) <= .01) { for (let c = 0; c < 3; c++) water[c]! += a[c]!; nw++; }
        else if (h > 15) { for (let c = 0; c < 3; c++) land[c]! += a[c]!; nl++; }
        const raw = at(normal, x, z).map(c => c / 255 * 2 - 1);
        if (h > 15 && Math.hypot(dx, dz) > .2) {
          const l = Math.hypot(dx, 1, dz), expected = [-dx / l, 1 / l, -dz / l];
          for (const [name, f] of Object.entries(conventions)) { const n = f(raw), m = Math.hypot(n[0]!, n[1]!, n[2]!) || 1; score[name]! += (n[0]! * expected[0]! + n[1]! * expected[1]! + n[2]! * expected[2]!) / m; }
          slopes++;
        }
        if (h > 15 && Math.hypot(dx, dz) < .05) { for (let c = 0; c < 3; c++) flat[c]! += raw[c]!; nf++; }
      }
      tiles.push({ key: tile.key, slopes, meanDot: Object.fromEntries(Object.entries(score).map(([k, v]) => [k, Math.round(v / Math.max(1, slopes) * 1000) / 1000])),
        flatNormal: flat.map(v => Math.round(v / Math.max(1, nf) * 1000) / 1000), albedoWater: water.map(v => Math.round(v / Math.max(1, nw))), waterSamples: nw, albedoLand: land.map(v => Math.round(v / Math.max(1, nl))), landSamples: nl,
        size: [albedo.width, normal.width] });
    }
    return tiles;
  });
  for (const tile of result) console.log(JSON.stringify(tile));
  await page.close();
} finally { await chrome.close(); await hosted.close(); }
