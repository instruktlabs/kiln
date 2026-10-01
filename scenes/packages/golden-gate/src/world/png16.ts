// Minimal PNG decoder for the terrain's data maps (grayscale, 8 or 16 bit, not interlaced).
// Browser image decoding clamps 16-bit PNGs to 8 bits, so depth, shore-distance and
// collision maps are decoded here at full precision. Inflate uses the platform's
// DecompressionStream ('deflate' is the zlib format PNG uses); no dependency is added.

export interface DecodedPng { width: number; height: number; bitDepth: 8 | 16; channels: number; data: Uint8Array | Uint16Array }

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function parsePngChunks(buffer: ArrayBuffer): { width: number; height: number; bitDepth: number; colorType: number; interlace: number; idat: Uint8Array } {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0, total = 0;
  const parts: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const start = offset + 8;
    if (start + length + 4 > bytes.length) throw new Error(`Truncated PNG chunk ${type}`);
    if (type === 'IHDR') { width = view.getUint32(start); height = view.getUint32(start + 4); bitDepth = bytes[start + 8]!; colorType = bytes[start + 9]!; interlace = bytes[start + 12]!; }
    else if (type === 'IDAT') { parts.push(bytes.subarray(start, start + length)); total += length; }
    else if (type === 'IEND') break;
    offset = start + length + 4;
  }
  if (!width || !height) throw new Error('PNG has no IHDR');
  const idat = new Uint8Array(total); let at = 0; for (const part of parts) { idat.set(part, at); at += part.length; }
  return { width, height, bitDepth, colorType, interlace, idat };
}

/** Reverses PNG scanline filters in place. `raw` holds (1 + stride) bytes per row. */
export function unfilterScanlines(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x]!, a = x >= bpp ? out[dst + x - bpp]! : 0, b = y > 0 ? out[prev + x]! : 0, c = x >= bpp && y > 0 ? out[prev + x - bpp]! : 0;
      let predicted: number;
      switch (filter) {
        case 0: predicted = 0; break;
        case 1: predicted = a; break;
        case 2: predicted = b; break;
        case 3: predicted = (a + b) >> 1; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; break; }
        default: throw new Error(`Unknown PNG filter ${filter} on row ${y}`);
      }
      out[dst + x] = (value + predicted) & 255;
    }
  }
  return out;
}

export async function decodePng(buffer: ArrayBuffer): Promise<DecodedPng> {
  const { width, height, bitDepth, colorType, interlace, idat } = parsePngChunks(buffer);
  const channels = CHANNELS[colorType];
  if (!channels || (bitDepth !== 8 && bitDepth !== 16)) throw new Error(`Unsupported PNG colour type ${colorType} / bit depth ${bitDepth}`);
  if (interlace) throw new Error('Interlaced PNG is unsupported');
  const bpp = channels * (bitDepth / 8), stride = width * bpp;
  const raw = await inflateZlib(idat);
  if (raw.length < (stride + 1) * height) throw new Error('PNG image data is truncated');
  const bytes = unfilterScanlines(raw, height, stride, bpp);
  if (bitDepth === 8) return { width, height, bitDepth, channels, data: bytes };
  const data = new Uint16Array(width * height * channels);
  for (let i = 0, j = 0; i < data.length; i++, j += 2) data[i] = (bytes[j]! << 8) | bytes[j + 1]!;
  return { width, height, bitDepth, channels, data };
}

// IEEE 754 binary16 conversion with round-to-nearest-even; used for RG16F uploads.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(value: number): number {
  f32[0] = value; const x = u32[0]!, sign = (x >>> 16) & 0x8000, exponent = (x >>> 23) & 0xff, mantissa = x & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  const e = exponent - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    const m = mantissa | 0x800000, shift = 14 - e, half = m >>> shift, rest = m & ((1 << shift) - 1), mid = 1 << (shift - 1);
    return sign | (half + (rest > mid || (rest === mid && (half & 1)) ? 1 : 0));
  }
  const half = (e << 10) | (mantissa >>> 13), rest = mantissa & 0x1fff;
  return sign | (half + (rest > 0x1000 || (rest === 0x1000 && (half & 1)) ? 1 : 0));
}
export function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1, exponent = (bits >> 10) & 0x1f, mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}
/** 65,536-entry table from a 16-bit source code to half-float bits of `decode(code)`. */
export function halfFloatLut(decode: (code: number) => number): Uint16Array {
  const lut = new Uint16Array(65536); for (let code = 0; code < 65536; code++) lut[code] = toHalf(decode(code)); return lut;
}
