// Browser stand-in for the two `sharp` uses the build path reaches.
// - Encode: raw RGB(A) pixels to PNG for procedural textures (src/texture-bake.ts
//   encodePngFromRaw). It writes the chunk layout sharp 0.35 / libvips / libpng write for
//   those options (IHDR, pHYs, one IDAT with filter type 0 on every row, IEND), so the decoded
//   pixels are identical. The compressed IDAT bytes are not: sharp deflates with zlib-ng at
//   level 9, the browser with CompressionStream('deflate').
// - Decode: an approved PNG to RGBA for library textures (src/textures.ts loadTexture keeps
//   the encoded bytes for the GLB and decodes only for the live texture and its alpha flag).
// Any other sharp use fails with a named error. Spike code: it does not ship in the package.

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function encodePng(data, width, height, channels) {
  if (channels !== 3 && channels !== 4)
    throw new Error(`sharp-shim: PNG encode supports 3 or 4 channels, not ${channels}`);
  const stride = width * channels;
  const rows = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++)
    rows.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  // libvips writes 72 dpi (2835 pixels per metre) when the input carries no resolution.
  const phys = new Uint8Array(9);
  const physView = new DataView(phys.buffer);
  physView.setUint32(0, 2835);
  physView.setUint32(4, 2835);
  phys[8] = 1;
  return concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('pHYs', phys),
    chunk('IDAT', await pipe(rows, new CompressionStream('deflate'))),
    chunk('IEND', new Uint8Array()),
  ]);
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function readChunks(bytes) {
  for (let i = 0; i < 8; i++)
    if (bytes[i] !== SIGNATURE[i])
      throw new Error('sharp-shim: only PNG decodes in the browser build.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = { idat: [] };
  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR')
      png.header = {
        width: view.getUint32(offset + 8),
        height: view.getUint32(offset + 12),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    else if (type === 'PLTE') png.palette = data;
    else if (type === 'tRNS') png.transparency = data;
    else if (type === 'IDAT') png.idat.push(data);
    offset += 12 + length;
  }
  return png;
}

function unfilter(filtered, height, stride, bpp) {
  const lines = new Uint8Array(height * stride);
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const src = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = lines.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : zero;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prior[x];
      const c = x >= bpp ? prior[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`sharp-shim: PNG filter ${filter}`);
      line[x] = (src[x] + predictor) & 0xff;
    }
  }
  return lines;
}

/** Non-interlaced 8-bit PNG (or sub-byte palette/grey) to RGBA, as sharp's ensureAlpha().raw(). */
export async function decodePng(bytes) {
  const { header, palette, transparency, idat } = readChunks(bytes);
  const { width, height, depth, colorType, interlace } = header;
  const channels = CHANNELS[colorType];
  if (interlace || channels === undefined || depth > 8 || (depth < 8 && channels !== 1))
    throw new Error(
      `sharp-shim: PNG colour type ${colorType}, depth ${depth}, interlace ${interlace} is not supported.`,
    );
  const filtered = await pipe(concat(idat), new DecompressionStream('deflate'));
  const stride = Math.ceil((width * channels * depth) / 8);
  const lines = unfilter(filtered, height, stride, Math.max(1, (channels * depth) >> 3));
  const sample = (line, x) => {
    if (depth === 8) return line[x];
    const perByte = 8 / depth;
    const shift = 8 - depth * ((x % perByte) + 1);
    return (line[Math.floor(x / perByte)] >> shift) & ((1 << depth) - 1);
  };
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const line = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(line, x);
        out[o] = palette[i * 3];
        out[o + 1] = palette[i * 3 + 1];
        out[o + 2] = palette[i * 3 + 2];
        out[o + 3] = transparency && i < transparency.length ? transparency[i] : 255;
      } else if (colorType === 0) {
        const v = depth === 8 ? line[x] : Math.round((sample(line, x) * 255) / ((1 << depth) - 1));
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
        out[o + 3] = 255;
      } else {
        const px = line.subarray(x * channels, (x + 1) * channels);
        const grey = colorType === 4;
        out[o] = px[0];
        out[o + 1] = grey ? px[0] : px[1];
        out[o + 2] = grey ? px[0] : px[2];
        out[o + 3] = grey ? px[1] : colorType === 6 ? px[3] : 255;
      }
    }
  }
  return { data: out, info: { width, height, channels: 4 } };
}

export default function sharp(input, options = {}) {
  const raw = options.raw;
  const bytes = () => (input instanceof Uint8Array ? input : new Uint8Array(input));
  let png = false;
  let rawOut = false;
  const pipeline = {
    png() {
      png = true;
      return pipeline;
    },
    // Decode always yields RGBA, which is what every build-path caller asks for.
    ensureAlpha() {
      return pipeline;
    },
    raw(rawOptions = {}) {
      if (rawOptions.depth !== undefined && rawOptions.depth !== 'uchar')
        throw new Error('sharp-shim: only 8-bit raw output is available.');
      rawOut = true;
      return pipeline;
    },
    async metadata() {
      const { header } = readChunks(bytes());
      return { width: header.width, height: header.height, format: 'png' };
    },
    async toBuffer(resolveWithObject) {
      if (raw && png && !resolveWithObject)
        return Buffer.from(await encodePng(bytes(), raw.width, raw.height, raw.channels));
      if (!raw && rawOut) {
        const { data, info } = await decodePng(bytes());
        return resolveWithObject ? { data: Buffer.from(data), info } : Buffer.from(data);
      }
      throw new Error('sharp-shim: only raw pixels to PNG and PNG to raw RGBA are available.');
    },
    resize() {
      throw new Error('sharp-shim: resize() is not available in the browser build.');
    },
  };
  return pipeline;
}
