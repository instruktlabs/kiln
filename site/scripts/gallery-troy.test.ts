import { expect, test } from 'bun:test';
import { buildGallery } from '../src/lib/gallery';

test('curated gallery keeps Bridge and Troy assets but excludes Battle before the gate', () => {
  const cards = buildGallery(true);
  expect(cards.some(card => card.href === '/gallery/golden-gate-bridge/')).toBe(true);
  expect(cards.some(card => card.href === '/gallery/troy/wooden-horse/')).toBe(true);
  expect(cards.some(card => card.slug === 'battle-scene-reference')).toBe(false);
});
