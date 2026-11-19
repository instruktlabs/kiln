import { describe, expect, test } from 'bun:test';
import realSharp from 'sharp';
import shimSharp, { decodePng, encodePng } from './sharp-shim.mjs';

// Fixed pixels, no randomness: a gradient with a translucent band.
function pixels(width, height, channels) {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 7) * 11) & 0xff;
  return data;
}

const chunkTypes = (png) => {
  const types = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let offset = 8; offset < png.length; offset += 12 + view.getUint32(offset))
    types.push(String.fromCharCode(...png.subarray(offset + 4, offset + 8)));
  return types;
};

describe('browser runtime spike sharp shim', () => {
  for (const channels of [3, 4])
    test(`encodes ${channels}-channel pixels to the PNG layout sharp writes, with the same pixels`, async () => {
      const raw = pixels(37, 23, channels);
      const ours = await encodePng(raw, 37, 23, channels);
      const theirs = new Uint8Array(
        await realSharp(Buffer.from(raw), { raw: { width: 37, height: 23, channels } })
          .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
          .toBuffer(),
      );
      expect(chunkTypes(ours)).toEqual(chunkTypes(theirs));
      const decode = async (png) =>
        new Uint8Array(await realSharp(png).ensureAlpha().raw().toBuffer());
      expect(await decode(ours)).toEqual(await decode(theirs));
    });

  test('decodes PNGs as sharp does, including palette and filtered rows', async () => {
    const raw = pixels(41, 19, 4);
    const sources = [
      await realSharp(Buffer.from(raw), { raw: { width: 41, height: 19, channels: 4 } })
        .png({ adaptiveFiltering: true })
        .toBuffer(),
      await realSharp(Buffer.from(raw), { raw: { width: 41, height: 19, channels: 4 } })
        .png({ palette: true, colours: 16, dither: 0 })
        .toBuffer(),
      await realSharp(Buffer.from(pixels(41, 19, 3)), {
        raw: { width: 41, height: 19, channels: 3 },
      })
        .png({ adaptiveFiltering: true })
        .toBuffer(),
    ];
    for (const png of sources) {
      const expected = await realSharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const ours = await decodePng(new Uint8Array(png));
      expect(ours.info).toEqual({
        width: expected.info.width,
        height: expected.info.height,
        channels: 4,
      });
      expect(ours.data).toEqual(new Uint8Array(expected.data));
      const viaApi = await shimSharp(png)
        .ensureAlpha()
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      expect(new Uint8Array(viaApi.data)).toEqual(new Uint8Array(expected.data));
      expect(await shimSharp(png).metadata()).toMatchObject({ width: 41, height: 19 });
    }
  });

  test('refuses sharp operations the build path does not reach', () => {
    expect(() => shimSharp(new Uint8Array()).resize()).toThrow(/not available/);
  });
});
