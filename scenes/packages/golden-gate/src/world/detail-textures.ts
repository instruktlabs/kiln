// Procedural water textures (no third-party images). Both are original, deterministic and tileable:
// 1. Slope moments (RGBA16F, 256^2, full CPU mip chain): R,G = mean surface slope (dh/dx, dh/dz),
//    B,A = mean squared slope. A wind-aligned Phillips spectrum is synthesized with an FFT. Because
//    each mip level averages the moments, trilinear/anisotropic sampling returns the slope variance
//    of the filtered footprint (LEAN mapping): the shader turns lost detail into roughness instead
//    of sparkle.
// 2. Macro noise (RGBA8, 256^2, CPU mips): four independent tileable gradient-noise fBm channels for
//    large-scale variation of chop, foam breakup and flow phase.
import { DataTexture, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { toHalf } from './png16';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussian(rand: () => number): number { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** In-place iterative radix-2 FFT of one complex line (inverse when `inverse`). */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]!; re[i] = re[j]!; re[j] = t; t = im[i]!; im[i] = im[j]!; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b]! * cr - im[b]! * ci, xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr; im[b] = im[a]! - xi; re[a] = re[a]! + xr; im[a] = im[a]! + xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function fft2(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  const lr = new Float64Array(n), li = new Float64Array(n);
  for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) { lr[x] = re[y * n + x]!; li[x] = im[y * n + x]!; } fft(lr, li, inverse); for (let x = 0; x < n; x++) { re[y * n + x] = lr[x]!; im[y * n + x] = li[x]!; } }
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) { lr[y] = re[y * n + x]!; li[y] = im[y * n + x]!; } fft(lr, li, inverse); for (let y = 0; y < n; y++) { re[y * n + x] = lr[y]!; im[y * n + x] = li[y]!; } }
}

export interface SlopeField { size: number; sx: Float32Array; sz: Float32Array }
/**
 * Unit-RMS slope field of a tileable wind-sea patch. Wind blows toward -u (scene -X before rotation).
 * `peakCycles`: spectral peak in cycles per tile; `cutoffCycles`: small-wave damping.
 */
export function synthesizeSlopes(size = 256, seed = 1, peakCycles = 7, cutoffCycles = 70): SlopeField {
  const n = size, hr = new Float64Array(n * n), hi = new Float64Array(n * n), rand = mulberry32(seed);
  const L = 1 / (2 * Math.PI * peakCycles * Math.SQRT2), l = 1 / (2 * Math.PI * cutoffCycles), wx = -1, wz = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const m = i < n / 2 ? i : i - n, q = j < n / 2 ? j : j - n; if (!m && !q) continue;
    const kx = 2 * Math.PI * m, kz = 2 * Math.PI * q, k = Math.hypot(kx, kz), c = (kx * wx + kz * wz) / k;
    const directional = c > 0 ? c * c : .2 * c * c; // a little energy travels against the wind
    const phillips = Math.exp(-1 / ((k * L) ** 2)) / k ** 4 * directional * Math.exp(-((k * l) ** 2));
    const a = Math.sqrt(phillips / 2);
    hr[j * n + i] = gaussian(rand) * a; hi[j * n + i] = gaussian(rand) * a;
  }
  const sxr = new Float64Array(n * n), sxi = new Float64Array(n * n), szr = new Float64Array(n * n), szi = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const m = i < n / 2 ? i : i - n, q = j < n / 2 ? j : j - n, kx = 2 * Math.PI * m, kz = 2 * Math.PI * q, idx = j * n + i;
    // slope spectrum: i k h
    sxr[idx] = -kx * hi[idx]!; sxi[idx] = kx * hr[idx]!; szr[idx] = -kz * hi[idx]!; szi[idx] = kz * hr[idx]!;
  }
  fft2(sxr, sxi, n, true); fft2(szr, szi, n, true);
  let sum = 0; for (let i = 0; i < n * n; i++) sum += sxr[i]! ** 2 + szr[i]! ** 2;
  const scale = 1 / Math.sqrt(sum / (n * n) || 1), sx = new Float32Array(n * n), sz = new Float32Array(n * n);
  // Texture v runs toward -Z like the other maps; world slope dh/dz = -dh/dv.
  for (let i = 0; i < n * n; i++) { sx[i] = sxr[i]! * scale; sz[i] = szr[i]! * scale; }
  return { size: n, sx, sz };
}

export interface MipLevel { data: Uint16Array | Uint8Array; width: number; height: number }
/** Moment pyramid in half floats: level k averages 2x2 moments of level k-1. */
export function slopeMomentMips(field: SlopeField): { levels: MipLevel[]; moments: Float32Array[] } {
  let size = field.size, current = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const x = field.sx[i]!, z = field.sz[i]!; current[i * 4] = x; current[i * 4 + 1] = z; current[i * 4 + 2] = x * x; current[i * 4 + 3] = z * z; }
  const moments = [current];
  while (size > 1) {
    const half = size >> 1, next = new Float32Array(half * half * 4);
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) for (let c = 0; c < 4; c++) {
      const a = ((2 * y) * size + 2 * x) * 4 + c, b = a + 4, d = a + size * 4, e = d + 4;
      next[(y * half + x) * 4 + c] = (current[a]! + current[b]! + current[d]! + current[e]!) * .25;
    }
    moments.push(next); current = next; size = half;
  }
  const levels = moments.map((m, k) => { const data = new Uint16Array(m.length); for (let i = 0; i < m.length; i++) data[i] = toHalf(m[i]!); const w = field.size >> k; return { data, width: w, height: w }; });
  return { levels, moments };
}
export function slopeMomentTexture(field: SlopeField, anisotropy: number): DataTexture {
  const { levels } = slopeMomentMips(field), base = levels[0]!;
  const texture = new DataTexture(base.data, base.width, base.height, RGBAFormat, HalfFloatType);
  texture.mipmaps = levels as never; texture.generateMipmaps = false;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter; texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy; texture.flipY = false; texture.name = 'water-slope-moments'; texture.needsUpdate = true;
  return texture;
}

/** Tileable 2D gradient noise with an integer lattice period. */
function gradientNoise(period: number, rand: () => number): (x: number, y: number) => number {
  const angles = new Float32Array(period * period); for (let i = 0; i < angles.length; i++) angles[i] = rand() * Math.PI * 2;
  const grad = (i: number, j: number, dx: number, dy: number) => { const a = angles[((j % period + period) % period) * period + ((i % period + period) % period)]!; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fade(fx), v = fade(fy);
    const a = grad(i, j, fx, fy), b = grad(i + 1, j, fx - 1, fy), c = grad(i, j + 1, fx, fy - 1), d = grad(i + 1, j + 1, fx - 1, fy - 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
}
export function macroNoiseLevels(size = 256, seed = 7): MipLevel[] {
  const rand = mulberry32(seed), channels: ((x: number, y: number) => number)[][] = [];
  for (let c = 0; c < 4; c++) channels.push([4, 8, 16, 32].map(period => gradientNoise(period, rand)));
  let current = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let c = 0; c < 4; c++) {
    let value = 0, amplitude = .5, norm = 0;
    [4, 8, 16, 32].forEach((period, octave) => { value += channels[c]![octave]!(x / size * period, y / size * period) * amplitude; norm += amplitude; amplitude *= .5; });
    current[(y * size + x) * 4 + c] = Math.min(1, Math.max(0, .5 + value / norm * 1.1));
  }
  const levels: MipLevel[] = []; let w = size;
  for (;;) {
    const data = new Uint8Array(current.length); for (let i = 0; i < current.length; i++) data[i] = Math.round(current[i]! * 255);
    levels.push({ data, width: w, height: w }); if (w === 1) break;
    const half = w >> 1, next = new Float32Array(half * half * 4);
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) for (let c = 0; c < 4; c++) {
      const a = ((2 * y) * w + 2 * x) * 4 + c; next[(y * half + x) * 4 + c] = (current[a]! + current[a + 4]! + current[a + w * 4]! + current[a + w * 4 + 4]!) * .25;
    }
    current = next; w = half;
  }
  return levels;
}
export function macroNoiseTexture(anisotropy: number): DataTexture {
  const levels = macroNoiseLevels(), base = levels[0]!;
  const texture = new DataTexture(base.data, base.width, base.height, RGBAFormat, UnsignedByteType);
  texture.mipmaps = levels as never; texture.generateMipmaps = false;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter; texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy; texture.flipY = false; texture.name = 'water-macro-noise'; texture.needsUpdate = true;
  return texture;
}
