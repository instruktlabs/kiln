// Browser stand-in for the part of `node:crypto` the build path calls: synchronous
// `createHash('sha256' | 'sha1').update(...).digest('hex')`, plus `randomUUID`. WebCrypto's digest is
// asynchronous, and the engine hashes synchronously in many places (artifact, requirements
// and material identities), so the spike carries a small streaming SHA-256 instead of
// pulling a Node polyfill. Spike code: it does not ship in the package.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const encoder = new TextEncoder();

function toBytes(data, encoding) {
  if (typeof data === 'string') {
    if (encoding === undefined || encoding === 'utf8' || encoding === 'utf-8')
      return encoder.encode(data);
    throw new Error(`crypto-shim: unsupported string encoding ${encoding}`);
  }
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new TypeError('crypto-shim: update() takes a string or bytes');
}

class Sha256 {
  #h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  #block = new Uint8Array(64);
  #fill = 0;
  #length = 0;
  #w = new Uint32Array(64);
  #done = false;

  update(data, encoding) {
    if (this.#done) throw new Error('crypto-shim: digest already called');
    const bytes = toBytes(data, encoding);
    this.#length += bytes.length;
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(64 - this.#fill, bytes.length - offset);
      this.#block.set(bytes.subarray(offset, offset + take), this.#fill);
      this.#fill += take;
      offset += take;
      if (this.#fill === 64) {
        this.#compress(this.#block);
        this.#fill = 0;
      }
    }
    return this;
  }

  #compress(block) {
    const w = this.#w;
    for (let i = 0; i < 16; i++)
      w[i] =
        (block[i * 4] << 24) |
        (block[i * 4 + 1] << 16) |
        (block[i * 4 + 2] << 8) |
        block[i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    const h = this.#h;
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += k;
  }

  digest(encoding) {
    if (this.#done) throw new Error('crypto-shim: digest already called');
    this.#done = true;
    const bits = this.#length * 8;
    const tail = new Uint8Array(this.#fill < 56 ? 64 : 128);
    tail.set(this.#block.subarray(0, this.#fill));
    tail[this.#fill] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(tail.length - 4, bits >>> 0);
    this.#compress(tail.subarray(0, 64));
    if (tail.length === 128) this.#compress(tail.subarray(64));
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.#h[i]);
    if (encoding === 'hex') return Array.from(out, (x) => x.toString(16).padStart(2, '0')).join('');
    if (encoding === 'base64') return btoa(String.fromCharCode(...out));
    if (encoding === undefined) return out;
    throw new Error(`crypto-shim: unsupported digest encoding ${encoding}`);
  }
}

/** SHA-1, for the texture name hash in src/texture-bake.ts. Collects bytes, hashes at digest. */
class Sha1 {
  #parts = [];
  #done = false;

  update(data, encoding) {
    if (this.#done) throw new Error('crypto-shim: digest already called');
    this.#parts.push(toBytes(data, encoding).slice());
    return this;
  }

  digest(encoding) {
    if (this.#done) throw new Error('crypto-shim: digest already called');
    this.#done = true;
    const length = this.#parts.reduce((sum, part) => sum + part.length, 0);
    const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    let offset = 0;
    for (const part of this.#parts) {
      padded.set(part, offset);
      offset += part.length;
    }
    padded[length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x100000000));
    view.setUint32(padded.length - 4, (length * 8) >>> 0);
    const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
    const w = new Uint32Array(80);
    for (let block = 0; block < padded.length; block += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
      for (let i = 16; i < 80; i++) {
        const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
        w[i] = (x << 1) | (x >>> 31);
      }
      let [a, b, c, d, e] = h;
      for (let i = 0; i < 80; i++) {
        let f;
        let k;
        if (i < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d;
        d = c;
        c = (b << 30) | (b >>> 2);
        b = a;
        a = t;
      }
      h[0] += a;
      h[1] += b;
      h[2] += c;
      h[3] += d;
      h[4] += e;
    }
    const out = new Uint8Array(20);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 5; i++) outView.setUint32(i * 4, h[i]);
    if (encoding === 'hex') return Array.from(out, (x) => x.toString(16).padStart(2, '0')).join('');
    if (encoding === undefined) return out;
    throw new Error(`crypto-shim: unsupported digest encoding ${encoding}`);
  }
}

export function createHash(algorithm) {
  if (algorithm === 'sha256') return new Sha256();
  if (algorithm === 'sha1') return new Sha1();
  throw new Error(
    `crypto-shim: only sha256 and sha1 are available in the browser build, not ${algorithm}`,
  );
}

export function randomUUID() {
  return globalThis.crypto.randomUUID();
}

export default { createHash, randomUUID };
