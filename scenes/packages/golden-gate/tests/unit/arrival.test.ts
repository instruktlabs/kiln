import { expect, test } from 'bun:test';
import { LAYOUT } from '../../scripts/authored-layout';

test('opening view is an elevated water-side approach looking down across the bridge', () => {
  const view = LAYOUT.cameras.named[LAYOUT.cameras.default]!;
  expect(view.position[1]).toBeGreaterThan(700);
  expect(Math.abs(view.position[2])).toBeLessThan(500);
  expect(Math.abs(view.position[0])).toBeGreaterThan(1200);
  expect(view.target[1]).toBeLessThan(150);
  expect(Math.abs(view.target[0])).toBeLessThan(50);
});
