import { expect, test } from 'bun:test';
import { SOCIAL_CARD_EXTENSION, staleSocialCards } from './build-site-media.mjs';

// Share cards are JPEG: every network's crawler reads JPEG and PNG, and the previous site's fixture required a PNG after two
// LinkedIn-specific preview fixes (#111, #112), so a format only some crawlers document (WebP) is not used for them.
test('share cards are JPEG files', () => {
  expect(SOCIAL_CARD_EXTENSION).toBe('.jpg');
});

test('social cards no page uses are the ones left over from an earlier build', () => {
  const cards = [{ slug: 'home' }, { slug: 'foundry-floor' }, { slug: 'archive-windmill' }];
  const onDisk = ['archive-windmill.jpg', 'foundry-floor.jpg', 'home.jpg', 'old-name.jpg', 'zeta.jpg'];
  expect(staleSocialCards(onDisk, cards)).toEqual(['old-name.jpg', 'zeta.jpg']);
});

test('cards an earlier build wrote as WebP are stale, whatever page they were for', () => {
  const cards = [{ slug: 'home' }];
  expect(staleSocialCards(['home.jpg', 'home.webp', 'gallery.webp', 'old.png'], cards)).toEqual(['gallery.webp', 'home.webp', 'old.png']);
});

test('only card images are candidates, and nothing is stale when every card is used', () => {
  expect(staleSocialCards(['home.jpg', 'notes.txt', '.gitkeep'], [{ slug: 'home' }])).toEqual([]);
  expect(staleSocialCards([], [{ slug: 'home' }])).toEqual([]);
});
