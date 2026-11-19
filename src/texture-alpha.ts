/** Alpha facts about 8-bit RGBA pixels, read without a per-byte callback. */

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * True when any complete RGBA texel has an alpha byte below 255. Trailing bytes that do not
 * make a whole texel hold no alpha and are ignored. On little-endian hosts an aligned buffer
 * is read four bytes at a time: a texel's alpha is the top byte of its 32-bit word, so the
 * word is below 0xff000000 exactly when the alpha is below 255.
 */
export function hasTranslucentTexel(rgba: Uint8Array): boolean {
  const texels = rgba.length >>> 2;
  if (LITTLE_ENDIAN && rgba.byteOffset % 4 === 0) {
    const words = new Uint32Array(rgba.buffer, rgba.byteOffset, texels);
    for (let i = 0; i < texels; i++) if (words[i]! < 0xff000000) return true;
    return false;
  }
  for (let i = 3; i < texels * 4; i += 4) if (rgba[i]! < 255) return true;
  return false;
}
