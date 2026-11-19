import { expect, test } from 'bun:test';
import { hasTranslucentTexel } from '../texture-alpha';

/** The byte-by-byte scan both callers used before #431: any byte at i % 4 === 3 below 255. */
const reference = (bytes: Uint8Array) => bytes.some((v, i) => i % 4 === 3 && v < 255);

test('finds a translucent texel exactly where the byte scan does', () => {
  for (const length of [0, 3, 4, 7, 8, 64, 65, 66, 67]) {
    const opaque = new Uint8Array(length).fill(255);
    expect(hasTranslucentTexel(opaque)).toBe(reference(opaque));
    for (let at = 0; at < length; at++) {
      const bytes = new Uint8Array(length).fill(255);
      bytes[at] = 254;
      expect(hasTranslucentTexel(bytes)).toBe(reference(bytes));
      bytes[at] = 0;
      expect(hasTranslucentTexel(bytes)).toBe(reference(bytes));
    }
  }
});

test('reads unaligned and offset views by their own bytes', () => {
  const backing = new Uint8Array(41).fill(255);
  backing[0] = 0; // outside every view below
  for (const offset of [1, 2, 3, 4, 5]) {
    const view = backing.subarray(offset, offset + 32);
    expect(hasTranslucentTexel(view)).toBe(false);
    const copy = backing.slice();
    copy[offset + 31] = 10;
    const translucent = copy.subarray(offset, offset + 32);
    expect(hasTranslucentTexel(translucent)).toBe(reference(translucent));
    expect(hasTranslucentTexel(translucent)).toBe(true);
  }
});
