import { describe, expect, test } from 'bun:test';
import { backdropClearColor } from '../../render-service/src/display-transform.mjs';
import { REVIEW_RIG, backdropLinear, reviewNeutral, srgbEncode } from '../src/lib/review-rig';

const bytesOf = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const toBytes = (display: readonly number[]) =>
  display.map((c) => Math.round(srgbEncode(Math.min(1, Math.max(0, c))) * 255));

describe('the viewer backdrop survives the output pass', () => {
  test('under the rig mapping it reads back as the rig backdrop', () => {
    const linear = backdropLinear('neutral');
    expect(toBytes(reviewNeutral(linear))).toEqual(bytesOf(REVIEW_RIG.backdrop));
  });

  test('the rig mapping gives the clear colour the render service uses', () => {
    const engine = backdropClearColor(REVIEW_RIG.backdrop, REVIEW_RIG.exposure, 'review-neutral');
    backdropLinear('neutral').forEach((value, index) => expect(value).toBeCloseTo(engine[index], 10));
  });

  test('ACES at exposure 1 gives the clear colour the render service uses', () => {
    const engine = backdropClearColor(REVIEW_RIG.backdrop, 1, 'aces');
    backdropLinear('aces').forEach((value, index) => expect(value).toBeCloseTo(engine[index], 10));
  });

  test('Linear at exposure 1 is the backdrop decoded, with nothing else in the way', () => {
    expect(toBytes(backdropLinear('linear'))).toEqual(bytesOf(REVIEW_RIG.backdrop));
  });
});
