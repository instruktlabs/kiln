import { describe, expect, spyOn, test } from 'bun:test';
import * as pngModule from '../png';
import { encodePng } from '../png';
import { createPngDecodeMemo, decodePngShared } from '../png-memo';

function frame(seed: number, size = 16): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 7 + seed * 31) % 256;
  return new Uint8Array(encodePng(rgb, size, size));
}

describe('decoding each frame once', () => {
  test('equal bytes decode once and every caller gets its own pixels', () => {
    const decode = spyOn(pngModule, 'decodePng');
    try {
      const memo = createPngDecodeMemo();
      const png = frame(1);
      const first = memo(png);
      // A copy with equal bytes, as the port, the cache and the annotator each hold.
      const second = memo(Uint8Array.from(png));
      expect(decode).toHaveBeenCalledTimes(1);
      expect(second).toEqual(pngModule.decodePng(png));
      first.rgb.fill(0);
      expect(memo(png).rgb).toEqual(pngModule.decodePng(png).rgb);
    } finally {
      decode.mockRestore();
    }
  });

  test('different bytes decode separately', () => {
    const memo = createPngDecodeMemo();
    expect(memo(frame(1)).rgb).not.toEqual(memo(frame(2)).rgb);
  });

  test('a malformed frame throws every time and is never stored', () => {
    const memo = createPngDecodeMemo();
    const bad = new Uint8Array([1, 2, 3]);
    expect(() => memo(bad)).toThrow('bad signature');
    expect(() => memo(bad)).toThrow('bad signature');
  });

  test('the memo keeps no more decoded bytes than its budget', () => {
    const decode = spyOn(pngModule, 'decodePng');
    try {
      // 16x16 RGB is 768 bytes; a budget of 1,600 holds two frames.
      const memo = createPngDecodeMemo(1_600);
      const [a, b, c] = [frame(1), frame(2), frame(3)];
      memo(a);
      memo(b);
      memo(c);
      expect(decode).toHaveBeenCalledTimes(3);
      memo(c);
      memo(b);
      expect(decode).toHaveBeenCalledTimes(3);
      memo(a);
      expect(decode).toHaveBeenCalledTimes(4);
    } finally {
      decode.mockRestore();
    }
  });

  test('the shared decoder matches decodePng', () => {
    const png = frame(4);
    expect(decodePngShared(png)).toEqual(pngModule.decodePng(png));
  });
});
