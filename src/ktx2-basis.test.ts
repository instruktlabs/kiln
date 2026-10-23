/**
 * KTX2 through the optional `ktx2-encoder` peer (#201). Real-encoder cases skip when the peer
 * is not installed; it is a pinned devDependency, so the repository's own installs have it.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createKtx2Encoder, KTX2_ENCODER_PACKAGE, loadKtx2Encoder } from './ktx2-basis';
import { isKtx2 } from './runtime-textures';
import { encodePng } from './views/png';

const peer = existsSync(resolve('node_modules/ktx2-encoder/package.json'));
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const png = (rgb: number[]) => new Uint8Array(encodePng(new Uint8Array(rgb), 4, 4));
const COLOR = png(Array.from({ length: 16 }, (_, i) => [i * 16, 255 - i * 16, 90]).flat());
const NORMAL = png(Array.from({ length: 16 }, () => [128, 128, 255]).flat());

describe('ktx2-encoder peer', () => {
  test('a missing peer names the exact install command', async () => {
    const missing = Object.assign(new Error("Cannot find package 'ktx2-encoder'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    await expect(
      loadKtx2Encoder(async () => {
        throw missing;
      }),
    ).rejects.toThrow('npm install ktx2-encoder@0.6.0');
    expect(KTX2_ENCODER_PACKAGE).toEqual({ name: 'ktx2-encoder', version: '0.6.0' });
  });

  test.skipIf(!peer)(
    'per-slot modes, recorded identity and identical bytes for the same input',
    async () => {
      const encoder = await createKtx2Encoder();
      expect(encoder.identity).toEqual({
        name: 'ktx2-encoder',
        version: '0.6.0',
        basisWasmSha256: 'sha256:9807719e87cf3d979b0d69ae7112eb88aec6a0e0206c0b2d00dc0bed0d581b80',
        settings: {
          srgb: expect.objectContaining({ mode: 'etc1s', isSetKTX2SRGBTransferFunc: true }),
          linear: expect.objectContaining({ mode: 'uastc', isSetKTX2SRGBTransferFunc: false }),
          normal: expect.objectContaining({ mode: 'uastc', isNormalMap: true }),
        },
      });
      const input = { mimeType: 'image/png', name: 'map' };
      const color = await encoder({
        ...input,
        image: COLOR,
        colorSpace: 'srgb',
        slot: 'baseColor',
      });
      const again = await encoder({
        ...input,
        image: COLOR,
        colorSpace: 'srgb',
        slot: 'baseColor',
      });
      const normal = await encoder({
        ...input,
        image: NORMAL,
        colorSpace: 'linear',
        slot: 'normal',
      });
      expect(isKtx2(color)).toBe(true);
      expect(isKtx2(normal)).toBe(true);
      expect(sha(again)).toBe(sha(color));
      const { read } = await import('ktx-parse');
      const etc1s = read(color);
      const uastc = read(normal);
      // ETC1S is BasisLZ-supercompressed; UASTC is Zstandard-supercompressed (KTX2 spec 3.2).
      expect(etc1s.supercompressionScheme).toBe(1);
      expect(uastc.supercompressionScheme).toBe(2);
      expect([etc1s.pixelWidth, etc1s.pixelHeight]).toEqual([4, 4]);
      // Colour carries the sRGB transfer function (2), data stays linear (1).
      expect(etc1s.dataFormatDescriptor[0]!.transferFunction).toBe(2);
      expect(uastc.dataFormatDescriptor[0]!.transferFunction).toBe(1);
    },
    60_000, // The first encode compiles 3.3 MB of WebAssembly.
  );
});
