import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packRgbaReadback } from '../src/readback.mjs';
// three r187's copyTextureToBuffer strips WebGPU's 256-byte row alignment itself (r186 returned the aligned rows).
// A padded buffer would mean the pinned three changed under the service, so it is refused, not unpadded by guess.
test('a 1200-wide readback with 256-byte-aligned rows is refused', () => {
  const width = 1200,
    height = 3,
    row = width * 4,
    stride = Math.ceil(row / 256) * 256;
  assert.throws(
    () => packRgbaReadback(new Uint8Array((height - 1) * stride + row), width, height),
    /readback/,
  );
  assert.throws(() => packRgbaReadback(new Uint8Array(height * stride), width, height), /readback/);
});
test('a tightly packed 1200-wide readback keeps every row', () => {
  const width = 1200,
    height = 3,
    row = width * 4;
  const input = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) input.fill(y + 1, y * row, (y + 1) * row);
  const output = packRgbaReadback(input, width, height);
  assert.equal(output.length, row * height);
  for (let y = 0; y < height; y++)
    assert.ok(output.subarray(y * row, (y + 1) * row).every((v) => v === y + 1));
});
test('aligned and already packed arrays retain exact pixels and respect byte offsets', () => {
  const backing = new Uint8Array(1024 * 2 * 4 + 16).fill(7);
  const input = backing.subarray(8, -8);
  assert.deepEqual(packRgbaReadback(input, 1024, 2), Buffer.from(input));
  assert.throws(() => packRgbaReadback(new Uint8Array(2), 1200, 2), /readback/);
});
