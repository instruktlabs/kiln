import { expect, test } from 'bun:test';
import { SOCIAL_CARD_EXTENSION, pngIco, staleSocialCards } from './build-site-media.mjs';

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

test('favicon.ico wraps each PNG with a directory entry', () => {
  const small = Buffer.from([1, 2, 3]);
  const large = Buffer.from([4, 5, 6, 7]);
  const ico = pngIco([[16, small], [48, large]]);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(2);
  expect(ico.readUInt8(6)).toBe(16);
  expect(ico.readUInt32LE(6 + 8)).toBe(3);
  expect(ico.readUInt32LE(6 + 12)).toBe(38);
  expect(ico.readUInt8(22)).toBe(48);
  expect(ico.readUInt32LE(22 + 12)).toBe(41);
  expect(ico.subarray(41)).toEqual(large);
});
