/**
 * three r187 reads a render target back tightly packed: its WebGPU `copyTextureToBuffer` strips the 256-byte row
 * alignment itself (r186 returned the aligned rows). Any other length means the pinned three changed under the
 * service, so it is refused rather than unpadded by guess; the host then degrades to its CPU views as for any failure.
 * The result is a Buffer view of `pixels`, which every caller copies into its PNG.
 */
export function packRgbaReadback(pixels, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error('invalid readback dimensions');
  const input = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  if (input.length !== width * 4 * height) throw new Error('unexpected GPU readback byte length');
  return input;
}
