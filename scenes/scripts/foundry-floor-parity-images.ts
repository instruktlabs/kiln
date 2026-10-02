// Foundry Floor parity images (draw-optimization step S5): from the captures of scripts/capture-foundry-draw-parity.ts, picks the
// cases that fail either check first and then the passing WebGPU cases with the most differing pixels (Foundry Floor has no shadow,
// so the OD-4 shadow differences are none: what differs is the shared planting's edge pixels), and writes for each four PNGs:
// BEFORE and AFTER at 640 px wide, an amplified difference (the largest channel delta x16 in red over the dimmed AFTER) and a zoomed
// crop of the densest changed area (BEFORE | AFTER side by side, nearest-neighbour x4). The full-size set goes to --out; the same set
// (at most --max images, 640 px wide) goes to --share with images.md, a caption list.
//   bun scripts/foundry-floor-parity-images.ts [--parity evidence/draw-after/foundry-floor/parity] [--out evidence/draw-after/foundry-floor/images]
//     [--share ../tmp/drawcalls/s5/images/foundry-floor] [--max 12] [--backend webgpu] [--variant defaults]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = resolve(import.meta.dir, '..');
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const parityDir = resolve(ROOT, option('--parity', 'evidence/draw-after/foundry-floor/parity')), out = resolve(ROOT, option('--out', 'evidence/draw-after/foundry-floor/images')), share = resolve(ROOT, option('--share', '../tmp/drawcalls/s5/images/foundry-floor'));
const max = Number(option('--max', '12')), backend = option('--backend', 'webgpu'), variant = option('--variant', 'defaults');
interface Image { width: number; height: number; data: Uint8Array }
const read = (path: string): Image => { const png = PNG.sync.read(readFileSync(path)); return { width: png.width, height: png.height, data: new Uint8Array(png.data) }; };
const write = (path: string, image: Image) => { const png = new PNG({ width: image.width, height: image.height }); png.data = Buffer.from(image.data); writeFileSync(path, PNG.sync.write(png)); };
const blank = (width: number, height: number): Image => ({ width, height, data: new Uint8Array(width * height * 4).fill(255) });
/** 2x2 box average down to half size. */
function half(image: Image): Image {
  const w = image.width >> 1, h = image.height >> 1, o = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const at = (dx: number, dy: number) => image.data[((y * 2 + dy) * image.width + x * 2 + dx) * 4 + c]!;
    o.data[(y * w + x) * 4 + c] = Math.round((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4);
  }
  return o;
}
const delta = (a: Image, b: Image, i: number) => Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
/** The largest channel delta x16 in red over the dimmed AFTER; each changed pixel is grown by two pixels so a lone edge pixel still reads after the 2x reduction. */
function amplified(before: Image, after: Image): Image {
  const w = after.width, h = after.height, o = blank(w, h), grown = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const d = delta(before, after, p * 4); if (!d) continue;
    const x = p % w, y = (p / w) | 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) grown[yy * w + xx] = Math.max(grown[yy * w + xx]!, Math.min(255, d * 16));
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4, g = grown[p]!;
    if (g) { o.data[i] = 255; o.data[i + 1] = o.data[i + 2] = 255 - g; } else for (let c = 0; c < 3; c++) o.data[i + c] = Math.round(after.data[i + c]! * .35);
  }
  return o;
}
/** The 80x45 window with the most changed pixels (weighted by delta), on a stride of 8. */
function densest(before: Image, after: Image, w = 80, h = 45): { x: number; y: number; pixels: number } {
  let best = { x: 0, y: 0, pixels: -1 };
  const weight = new Float64Array(before.width * before.height);
  for (let p = 0; p < weight.length; p++) weight[p] = delta(before, after, p * 4) ? 1 : 0;
  for (let y = 0; y + h <= before.height; y += 8) for (let x = 0; x + w <= before.width; x += 8) {
    let n = 0; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) n += weight[yy * before.width + xx]!;
    if (n > best.pixels) best = { x, y, pixels: n };
  }
  return best;
}
/** BEFORE | AFTER crops, each 80x45 scaled x4 (320x180), with a 2 px white gutter. */
function zoom(before: Image, after: Image, at: { x: number; y: number }, w = 80, h = 45, k = 4): Image {
  const o = blank(w * k * 2 + 2, h * k);
  for (const [panel, image] of [[0, before], [1, after]] as const) for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) for (let c = 0; c < 3; c++) {
    o.data[(y * o.width + panel * (w * k + 2) + x) * 4 + c] = image.data[((at.y + (y / k | 0)) * image.width + at.x + (x / k | 0)) * 4 + c]!;
  }
  return o;
}

const summary = JSON.parse(readFileSync(resolve(parityDir, 'parity-summary.json'), 'utf8')) as { results: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
const cases = summary.results.filter(r => r.backend === backend && r.variant === variant && existsSync(resolve(parityDir, 'captures', r.backend, `${r.tier}-${r.view}${variant === 'defaults' ? '' : `-${variant}`}-before.png`)));
const failing = cases.filter(r => !r.pass), passing = cases.filter(r => r.pass && r.afterVsBefore.differingPixels > 0).sort((a, b) => b.afterVsBefore.differingPixels - a.afterVsBefore.differingPixels);
// One case per view (the worst tier of it), failing cases first; four images per case, at most --max images.
const picked: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
for (const r of [...failing, ...passing]) if (!picked.some(p => p.view === r.view) && (picked.length + 1) * 4 <= max) picked.push(r);
mkdirSync(out, { recursive: true }); mkdirSync(share, { recursive: true });
const captions: string[] = ['# Foundry Floor parity images', '', `BEFORE is draw-base (main at c734e2a), AFTER is draw-after (HEAD 892d103), ${backend}, 1280x720, frozen clock. Foundry Floor has no shadow pass, so there are no OD-4 shadow differences; what these show is the largest B-06 and thin-line residual, which is the shared planting's edge pixels. Shared files are 640 px wide.`, ''];
for (const r of picked) {
  const name = `${r.tier}-${r.view}${variant === 'defaults' ? '' : `-${variant}`}`, dir = resolve(parityDir, 'captures', r.backend), before = read(resolve(dir, `${name}-before.png`)), after = read(resolve(dir, `${name}-after.png`));
  const at = densest(before, after), diff = amplified(before, after), crop = zoom(before, after, at), files: [string, Image][] = [[`${name}-before.png`, half(before)], [`${name}-after.png`, half(after)], [`${name}-diff.png`, half(diff)], [`${name}-crop.png`, crop]];
  for (const [file, image] of files) { write(resolve(out, file), image); copyFileSync(resolve(out, file), resolve(share, file)); }
  write(resolve(out, `${name}-before-full.png`), before); write(resolve(out, `${name}-after-full.png`), after); write(resolve(out, `${name}-diff-full.png`), diff);
  const dxy = `${r.afterVsBefore.differingPixels} of ${before.width * before.height} pixels differ (max channel delta ${r.afterVsBefore.maxChannelDelta}, ${r.afterVsBefore.over32} over 32 levels; the BEFORE repeat differs in ${r.repeatVsBefore.differingPixels}); B-06 ${r.passingTiles}/${r.tiles} tiles, mean luminance delta ${r.globalMean.toExponential(1)}; ${r.pass ? 'passes both checks' : 'FAILS'}`;
  captions.push(`## ${r.tier} ${r.view}`, '', `- \`${name}-before.png\`: BEFORE (draw-base).`, `- \`${name}-after.png\`: AFTER (draw-after).`, `- \`${name}-diff.png\`: every changed pixel in red, the largest channel delta times 16, over the dimmed AFTER.`,
    `- \`${name}-crop.png\`: BEFORE (left) and AFTER (right) of the densest changed area, the 80x45 window at (${at.x}, ${at.y}) of the 1280x720 frame, magnified 4x without smoothing.`, `- ${dxy}.`, '');
}
if (!picked.length) captions.push('No case differs between BEFORE and AFTER on this backend and variant.', '');
writeFileSync(resolve(share, 'images.md'), captions.join('\n')); writeFileSync(resolve(out, 'images.md'), captions.join('\n'));
console.log(`${picked.length} cases, ${picked.length * 4} images: ${picked.map(p => `${p.tier}-${p.view}`).join(', ')}`);
