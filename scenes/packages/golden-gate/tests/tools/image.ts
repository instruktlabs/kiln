// Scripted capture judgement: small pixel statistics instead of viewing images.
import { PNG } from 'pngjs';

export interface Image { width: number; height: number; data: Uint8Array }
export type Rgb = [number, number, number];
export function readPng(bytes: Uint8Array): Image { return PNG.sync.read(Buffer.from(bytes) as never) as Image; }
/** Mean sRGB colour in a (2r+1)^2 window, clamped to the image. */
export function sample(img: Image, x: number, y: number, r = 2): Rgb {
  let n = 0; const sum: Rgb = [0, 0, 0];
  for (let j = Math.round(y) - r; j <= Math.round(y) + r; j++) for (let i = Math.round(x) - r; i <= Math.round(x) + r; i++) {
    if (i < 0 || j < 0 || i >= img.width || j >= img.height) continue;
    const k = (j * img.width + i) * 4; sum[0] += img.data[k]!; sum[1] += img.data[k + 1]!; sum[2] += img.data[k + 2]!; n++;
  }
  return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [NaN, NaN, NaN];
}
export function regionMean(img: Image, x0: number, y0: number, x1: number, y1: number): Rgb {
  const sum: Rgb = [0, 0, 0]; let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
    const k = (y * img.width + x) * 4; sum[0] += img.data[k]!; sum[1] += img.data[k + 1]!; sum[2] += img.data[k + 2]!; n++;
  }
  return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [NaN, NaN, NaN];
}
export const luma = (c: Rgb) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
export const round = (c: Rgb) => c.map(v => Math.round(v * 10) / 10) as Rgb;
/** Mean and 99th-percentile absolute channel difference between two same-size images. */
export function compareImages(a: Image, b: Image): { mean: number; p99: number; over24: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('Image sizes differ');
  const hist = new Uint32Array(256); let sum = 0, over = 0; const count = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
    hist[d]!++; sum += d; if (d > 24) over++;
  }
  let acc = 0, p99 = 0; for (let d = 0; d < 256; d++) { acc += hist[d]!; if (acc >= count * .99) { p99 = d; break; } }
  return { mean: sum / count, p99, over24: over / count };
}
/** Fraction of pixels whose channels are all near zero or NaN-black, and fully saturated white. */
export function extremes(img: Image): { black: number; white: number } {
  let black = 0, white = 0; const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) { const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!; if (r < 3 && g < 3 && b < 3) black++; if (r > 252 && g > 252 && b > 252) white++; }
  return { black: black / n, white: white / n };
}
/** Tile statistics: a cheap tiling/sparkle proxy (per-tile luma mean and variance). */
export function tileStats(img: Image, tiles = 8): { means: number[]; spread: number } {
  const means: number[] = [], tw = Math.floor(img.width / tiles), th = Math.floor(img.height / tiles);
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) means.push(luma(regionMean(img, tx * tw, ty * th, (tx + 1) * tw, (ty + 1) * th)));
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  return { means, spread: Math.sqrt(means.reduce((a, b) => a + (b - avg) ** 2, 0) / means.length) };
}

export function writePng(img: Image): Buffer {
  const png = new PNG({ width: img.width, height: img.height }); png.data = Buffer.from(img.data); return PNG.sync.write(png);
}
/** Box-filtered downsample by an integer factor. */
export function downsample(img: Image, factor: number): Image {
  const width = Math.floor(img.width / factor), height = Math.floor(img.height / factor), data = new Uint8Array(width * height * 4), n = factor * factor;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sum = [0, 0, 0];
    for (let j = 0; j < factor; j++) for (let i = 0; i < factor; i++) { const k = ((y * factor + j) * img.width + x * factor + i) * 4; sum[0]! += img.data[k]!; sum[1]! += img.data[k + 1]!; sum[2]! += img.data[k + 2]!; }
    const o = (y * width + x) * 4; data[o] = sum[0]! / n; data[o + 1] = sum[1]! / n; data[o + 2] = sum[2]! / n; data[o + 3] = 255;
  }
  return { width, height, data };
}
/** Same-size images in a grid, row-major, with a 4 px dark gutter. */
export function montage(images: Image[], columns: number): Image {
  const w = images[0]!.width, h = images[0]!.height, gap = 4, rows = Math.ceil(images.length / columns);
  const width = columns * w + (columns - 1) * gap, height = rows * h + (rows - 1) * gap, data = new Uint8Array(width * height * 4).fill(24);
  images.forEach((img, index) => {
    const ox = (index % columns) * (w + gap), oy = Math.floor(index / columns) * (h + gap);
    for (let y = 0; y < h; y++) data.set(img.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * width + ox) * 4);
  });
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}
const toLinear = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
/** CIELAB (D65) of an sRGB colour. */
export function srgbToLab(c: Rgb): Rgb {
  const r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2]);
  const x = (.4124 * r + .3576 * g + .1805 * b) / .95047, y = .2126 * r + .7152 * g + .0722 * b, z = (.0193 * r + .1192 * g + .9505 * b) / 1.08883;
  const f = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
/** CIEDE2000 colour difference between two sRGB colours. */
export function deltaE2000(a: Rgb, b: Rgb): number {
  const [L1, a1, b1] = srgbToLab(a), [L2, a2, b2] = srgbToLab(b), rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = .5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const h = (x: number, y: number) => { const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; };
  const hp1 = h(ap1, b1), hp2 = h(ap2, b2), dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = hp1 + hp2; if (Cp1 * Cp2 !== 0) hm = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2;
  const T = 1 - .17 * Math.cos((hm - 30) * rad) + .24 * Math.cos(2 * hm * rad) + .32 * Math.cos((3 * hm + 6) * rad) - .2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + .015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + .045 * Cpm, Sh = 1 + .015 * Cpm * T, Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
/**
 * International Orange evidence: pixels that read as the paint (red-dominant), and the mean of the
 * best-lit fraction of them (sunlit faces), with its CIEDE2000 distance to the authored #C0362C.
 */
export function paintStats(img: Image, region?: [number, number, number, number], top = .15): { pixels: number; lit: Rgb; median: Rgb; deltaE: number; medianDeltaE: number } | null {
  const [x0, y0, x1, y1] = region ?? [0, 0, img.width, img.height], found: Rgb[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = (y * img.width + x) * 4, r = img.data[k]!, g = img.data[k + 1]!, b = img.data[k + 2]!;
    if (r > 50 && r > 1.9 * g && r > 1.9 * b) found.push([r, g, b]);
  }
  if (found.length < 30) return null;
  found.sort((a, b) => luma(b) - luma(a));
  const mean = (list: Rgb[]) => list.reduce((s, c) => [s[0] + c[0] / list.length, s[1] + c[1] / list.length, s[2] + c[2] / list.length] as Rgb, [0, 0, 0] as Rgb);
  const lit = mean(found.slice(0, Math.max(1, Math.round(found.length * top)))), median = found[Math.floor(found.length / 2)]!;
  return { pixels: found.length, lit: round(lit), median, deltaE: Math.round(deltaE2000(lit, [192, 54, 44]) * 10) / 10, medianDeltaE: Math.round(deltaE2000(median, [192, 54, 44]) * 10) / 10 };
}
