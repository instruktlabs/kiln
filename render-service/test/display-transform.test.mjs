import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { BACKDROP_HEX, BACKDROP_IDS } from '../src/backdrops.mjs';
import {
  backdropClearColor,
  displayBytes,
  hexToBytes,
  linearForDisplayBytes,
  srgbDecode,
  toneMap,
} from '../src/display-transform.mjs';
import { PRESENTATION_PRESET_IDS, getPresentationPreset } from '../src/presentation-presets.mjs';

test('the forward transform reproduces pixels measured on the GPU', () => {
  // Each colour cleared as a plain background and read back from a dawn-d3d12 device
  // (RTX 3070) under three r187 at the studio exposure of 1.38. This is the calibration
  // that says the port is the transform the output pass really applies. Under r186 the
  // first and last read 213 and 230 in blue: r187 corrected the fit (see the next test).
  for (const [hex, measured] of [
    ['#aab1bc', [203, 207, 212]],
    ['#1a1a1a', [14, 14, 14]],
    ['#dfe3e8', [227, 228, 229]],
  ]) {
    const linear = hexToBytes(hex).map((byte) => srgbDecode(byte / 255));
    assert.deepEqual(displayBytes(linear, 1.38), measured, hex);
  }
});

test("the ACES port is the installed three's own TSL fit", () => {
  // three r187 moved the 0.983729 factor of RRTAndODTFit's denominator off the linear
  // term (mrdoob/three.js#35110), which matches its GLSL chunk and moved WebGPU output
  // by up to a byte. The port has to follow every such change, and CI has no device to
  // measure one on, so the installed source is pinned here: a change fails this test.
  const file = createRequire(import.meta.url).resolve(
    'three/src/nodes/display/ToneMappingFunctions.js',
  );
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const RRTAndODTFit');
  assert.ok(start >= 0, 'RRTAndODTFit is no longer defined where the port expects it');
  const fit = source.slice(start, source.indexOf('} );', start));
  assert.ok(fit.includes('const a = color.mul( color.add( 0.0245786 ) ).sub( 0.000090537 );'), fit);
  assert.ok(
    fit.includes('const b = color.mul( color.mul( 0.983729 ).add( 0.4329510 ) ).add( 0.238081 );'),
    fit,
  );
  // The same fit, written out independently, at greys either side of the shoulder.
  const reference = (x) =>
    (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
  for (const grey of [0.02, 0.18, 0.5, 1, 4]) {
    const expected = Math.min(1, Math.max(0, reference(grey / 0.6)));
    // Both matrices' rows sum to one (to 1e-5), so a grey stays grey: compare one channel.
    const [r] = toneMap([grey, grey, grey], 1);
    assert.ok(Math.abs(r - expected) < 1e-4, `${grey}: ${r} vs ${expected}`);
  }
});

test('every backdrop reads back as its own table bytes at every preset exposure', () => {
  for (const id of PRESENTATION_PRESET_IDS) {
    const { exposure, toneMapping } = getPresentationPreset(id);
    for (const backdrop of BACKDROP_IDS) {
      const hex = BACKDROP_HEX[backdrop];
      const clear = backdropClearColor(hex, exposure, toneMapping);
      // A clear above 1.0 is fine: the framebuffer is HalfFloat, and a lower
      // exposure needs a brighter scene value to reach the same byte.
      assert.ok(
        clear.every((c) => c >= 0),
        `${backdrop} at ${id}: ${clear}`,
      );
      assert.deepEqual(
        displayBytes(clear, exposure, toneMapping),
        hexToBytes(hex),
        `${backdrop} at ${id}`,
      );
    }
  }
});

test('the inverse is exact for every grey at any exposure', () => {
  for (const exposure of [0.9, 1.38, 2.5]) {
    for (let grey = 0; grey <= 255; grey++) {
      const bytes = [grey, grey, grey];
      assert.deepEqual(displayBytes(linearForDisplayBytes(bytes, exposure), exposure), bytes);
    }
  }
});

test('refuses what the tone mapping cannot reach and what it cannot parse', () => {
  assert.throws(() => linearForDisplayBytes([255, 0, 0], 1.38), /not reachable/);
  assert.throws(() => linearForDisplayBytes([170, 177], 1.38), /three integers/);
  assert.throws(() => backdropClearColor('#aab1bc', 0), /exposure/);
  assert.throws(() => backdropClearColor('aab1bc', 1.38), /hex/);
});

test('review transform reproduces independent GPU radiance and preserves highlight hue', () => {
  // HalfFloat radiance of the calibration chart's key-facing #C0362C matte panel on Dawn/D3D12, not albedo values:
  // under three r186, which the rig was calibrated on, and under r187, whose room environment lights it about 8% more.
  // Each maps to the bytes the GPU read back for that panel.
  assert.deepEqual(
    displayBytes([0.61181640625, 0.05377197265625, 0.040435791015625], 0.9, 'review-neutral'),
    [193, 51, 40],
  );
  assert.deepEqual(
    displayBytes([0.64599609375, 0.0570068359375, 0.042938232421875], 0.9, 'review-neutral'),
    [198, 54, 42],
  );
  for (const gain of [1, 2, 4, 8, 16]) {
    const rgb = displayBytes([gain, gain * 0.3, gain * 0.05], 1, 'review-neutral');
    assert.ok(rgb[0] > rgb[1] && rgb[1] > rgb[2], `highlight channel order: ${rgb}`);
    // At high radiance an 8-bit channel can round to 255 while the continuous
    // shoulder remains below one; that is different from hard clipping.
    assert.ok(toneMap([gain, gain * 0.3, gain * 0.05], 1, 'review-neutral')[0] < 1);
  }
});

test('review inverse exactly reaches named backdrops through both branches and exposures', () => {
  for (const exposure of [0.2, 0.9, 2.5]) {
    for (const hex of [
      ...Object.values(BACKDROP_HEX),
      '#000000',
      '#010101',
      '#333333',
      '#f8f8f8',
    ]) {
      const clear = backdropClearColor(hex, exposure, 'review-neutral');
      assert.deepEqual(displayBytes(clear, exposure, 'review-neutral'), hexToBytes(hex));
    }
    for (let grey = 0; grey < 255; grey++) {
      const bytes = [grey, grey, grey];
      assert.deepEqual(
        displayBytes(
          linearForDisplayBytes(bytes, exposure, 'review-neutral'),
          exposure,
          'review-neutral',
        ),
        bytes,
      );
    }
  }
  assert.throws(() => linearForDisplayBytes([255, 0, 0], 0.9, 'review-neutral'), /not reachable/);
  assert.throws(() => backdropClearColor('#aab1bc', 0.9, 'unknown'), /tone mapping/);
});
