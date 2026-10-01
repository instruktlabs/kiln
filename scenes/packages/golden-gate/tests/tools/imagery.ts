// The staged near terrain imagery as one map, for placement read from our own imagery (review 2 item 1 and
// review 3 items 1 to 5). nearAlbedo() decodes the four staged near albedo tiles (WebP) in headless Chrome, with
// no server, into one RGBA mosaic over X, Z in [-2000, 2000]: row 0 is +Z (north), column 0 is -X (east), about
// 0.98 m per texel. The decoded mosaic is cached under .tmp/ (gitignored), keyed by the tiles' SHA-256.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT, launchHeadless } from './owned.ts';
import type { Image, Rgb } from './image.ts';
import { stagedDir } from '../../scripts/release.ts';

export const TILE = 2048, SIZE = 2 * TILE, EXTENT = 2000;
const TILES = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
const tilePath = (row: number, col: number) => resolve(stagedDir(), 'terrain/tiles', `near_${row}${col}_albedo.webp`);

export async function nearAlbedo(): Promise<Uint8Array> {
  const hash = createHash('sha256');
  for (const [row, col] of TILES) hash.update(readFileSync(tilePath(row, col)));
  const cache = resolve(PACKAGE_ROOT, '.tmp', `near-albedo-${hash.digest('hex').slice(0, 12)}.rgba`);
  if (existsSync(cache)) { const bytes = readFileSync(cache); if (bytes.length === SIZE * SIZE * 4) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length); }
  const chrome = await launchHeadless('gg-imagery', 800, 600), mosaic = new Uint8Array(SIZE * SIZE * 4);
  try {
    const page = await chrome.browser.newPage();
    await page.goto('about:blank');
    for (const [row, col] of TILES) {
      const b64 = readFileSync(tilePath(row, col)).toString('base64');
      const raw: string = await page.evaluate(async (data: string) => {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));
        return `${bitmap.width}x${bitmap.height}:` + btoa(s);
      }, b64);
      const [size, data] = raw.split(':') as [string, string];
      if (size !== `${TILE}x${TILE}`) throw new Error(`near_${row}${col}_albedo is ${size}`);
      const px = Buffer.from(data, 'base64');
      for (let j = 0; j < TILE; j++) mosaic.set(px.subarray(j * TILE * 4, (j + 1) * TILE * 4), ((row * TILE + j) * SIZE + col * TILE) * 4);
    }
  } finally { await chrome.close(); }
  mkdirSync(resolve(PACKAGE_ROOT, '.tmp'), { recursive: true });
  writeFileSync(cache, mosaic);
  return mosaic;
}

/** Bilinear imagery colour at (x, z); null outside the terrain frame. */
export function albedoAt(mosaic: Uint8Array, x: number, z: number): Rgb | null {
  const u = (x + EXTENT) / (2 * EXTENT) * SIZE - .5, v = (EXTENT - z) / (2 * EXTENT) * SIZE - .5;
  if (u < 0 || v < 0 || u > SIZE - 1 || v > SIZE - 1) return null;
  const c0 = Math.floor(u), r0 = Math.floor(v), c1 = Math.min(SIZE - 1, c0 + 1), r1 = Math.min(SIZE - 1, r0 + 1), fu = u - c0, fv = v - r0;
  const at = (r: number, c: number, k: number) => mosaic[(r * SIZE + c) * 4 + k]!;
  return [0, 1, 2].map(k => (at(r0, c0, k) * (1 - fu) + at(r0, c1, k) * fu) * (1 - fv) + (at(r1, c0, k) * (1 - fu) + at(r1, c1, k) * fu) * fv) as Rgb;
}

export interface MapFrame { xWest: number; xEast: number; zSouth: number; zNorth: number; mpp: number }
/** The imagery over a frame as a map image: north up, west left, mpp metres per pixel (grey beyond the terrain). */
export function mapImage(mosaic: Uint8Array, f: MapFrame): Image {
  const W = Math.round((f.xWest - f.xEast) / f.mpp), H = Math.round((f.zNorth - f.zSouth) / f.mpp), img: Image = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = albedoAt(mosaic, f.xWest - (i + .5) * f.mpp, f.zNorth - (j + .5) * f.mpp) ?? [96, 96, 96], o = (j * W + i) * 4;
    img.data[o] = Math.round(c[0]); img.data[o + 1] = Math.round(c[1]); img.data[o + 2] = Math.round(c[2]); img.data[o + 3] = 255;
  }
  return img;
}
/** Blend a colour into the map pixel that holds world (x, z). */
export function plotMap(img: Image, f: MapFrame, x: number, z: number, rgb: Rgb, a = .9): void {
  const i = Math.floor((f.xWest - x) / f.mpp), j = Math.floor((f.zNorth - z) / f.mpp); if (i < 0 || j < 0 || i >= img.width || j >= img.height) return;
  const o = (j * img.width + i) * 4; for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(img.data[o + k]! * (1 - a) + rgb[k]! * a);
}
