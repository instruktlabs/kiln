// D-18 owner evidence: "the hero view and two others that show saturated materials". This picks the two others by
// measurement rather than by eye: the colour saturation of every named Farm view in the retained M2b static captures
// (the rewrite's WebGPU frames of `m2b-static-02`, ACES at .95, 1280 x 720, time 0). Static bytes only; no browser.
// Usage: bun scripts/look-ab-views.ts [--run m2b-static-02]  ->  evidence/look-ab/view-selection.json
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2), workspace = resolve(import.meta.dir, '..');
const run = (() => { const at = args.indexOf('--run'); return at >= 0 && args[at + 1] ? args[at + 1]! : 'm2b-static-02'; })();
const base = resolve(workspace, 'evidence/parity', run);
const views = (await readdir(base)).filter(name => name.endsWith('-webgpu')).map(name => name.slice(0, -'-webgpu'.length)).sort();

/** HSV saturation per pixel (max - min) / max over sRGB bytes; "vivid" counts pixels with saturation >= .5 and value >= .25. */
function saturation(png: PNG) {
  let sum = 0, vivid = 0; const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]! / 255, g = png.data[i + 1]! / 255, b = png.data[i + 2]! / 255, max = Math.max(r, g, b), min = Math.min(r, g, b);
    const s = max > 0 ? (max - min) / max : 0; sum += s; if (s >= .5 && max >= .25) vivid++;
  }
  return { meanSaturation: Math.round(sum / n * 1e4) / 1e4, vividFraction: Math.round(vivid / n * 1e4) / 1e4 };
}
const rows = [];
for (const view of views) {
  const dir = resolve(base, `${view}-webgpu`), attempts = (await readdir(dir)).filter(name => /^attempt-\d+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  const attempt = attempts.at(-1)!, file = resolve(dir, attempt, `${view}-new-webgpu.png`);
  rows.push({ view, source: `evidence/parity/${run}/${view}-webgpu/${attempt}/${view}-new-webgpu.png`, ...saturation(PNG.sync.read(await readFile(file))) });
}
// Interior views are lit by a few lamps and framed on walls; the owner judges materials in daylight, so the two picks are
// the daylight views (not hero) with the largest vivid fraction.
const interior = new Set(['house-interior', 'watermill-interior']);
const ranked = rows.filter(row => row.view !== 'hero' && !interior.has(row.view)).sort((a, b) => b.vividFraction - a.vividFraction || b.meanSaturation - a.meanSaturation);
const picks = ['hero', ...ranked.slice(0, 2).map(row => row.view)];
const result = { schema: 'kiln.farm-look-ab-views/1', date: new Date().toISOString(), rule: 'D-18: the hero view and two others that show saturated materials',
  method: 'HSV saturation of every pixel of the retained rewrite WebGPU capture (ACES .95, 1280 x 720, time 0); vivid = saturation >= .5 and value >= .25; the two daylight views other than hero with the largest vivid fraction',
  run, picks, views: rows.sort((a, b) => b.vividFraction - a.vividFraction) };
await mkdir(resolve(workspace, 'evidence/look-ab'), { recursive: true });
await writeFile(resolve(workspace, 'evidence/look-ab/view-selection.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ picks, views: rows.map(row => [row.view, row.vividFraction, row.meanSaturation]) }));
