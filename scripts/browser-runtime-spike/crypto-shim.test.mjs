import { describe, expect, test } from 'bun:test';
import { createHash as nodeHash } from 'node:crypto';
import { createHash } from './crypto-shim.mjs';

describe('browser runtime spike crypto shim', () => {
  test('matches node:crypto sha256 across block boundaries and chunked updates', () => {
    // Fixed byte patterns, no randomness: every length from 0 to 200 crosses the 55/56/64 edges.
    for (let length = 0; length <= 200; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 131 + length) & 0xff);
      const expected = nodeHash('sha256').update(bytes).digest('hex');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
      const split = Math.floor(length / 3);
      expect(
        createHash('sha256')
          .update(bytes.subarray(0, split))
          .update(bytes.subarray(split))
          .digest('hex'),
      ).toBe(expected);
    }
  });

  test('hashes strings as UTF-8 like node:crypto', () => {
    const text = 'Kiln é中😀 parameters';
    expect(createHash('sha256').update(text).digest('hex')).toBe(
      nodeHash('sha256').update(text).digest('hex'),
    );
    expect(createHash('sha256').update(text).digest('base64')).toBe(
      nodeHash('sha256').update(text).digest('base64'),
    );
  });

  test('matches node:crypto sha1 across block boundaries', () => {
    for (let length = 0; length <= 140; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 29 + length * 7) & 0xff);
      expect(
        createHash('sha1')
          .update(bytes.subarray(0, length >> 1))
          .update(bytes.subarray(length >> 1))
          .digest('hex'),
      ).toBe(nodeHash('sha1').update(bytes).digest('hex'));
    }
  });

  test('refuses algorithms the build path does not use', () => {
    expect(() => createHash('md5')).toThrow(/only sha256 and sha1/);
  });
});
