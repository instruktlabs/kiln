import { expect, test } from 'bun:test';
import release from '../src/data/release.json';
import foundryFloor from '../src/data/foundry-floor.json';
import hero from '../src/data/hero.json';
import farm from '../src/data/packs/farm.json';
import vehicles from '../src/data/packs/vehicles.json';
import bridge from '../src/data/standalone/golden-gate-bridge.json';
import { SOCIAL_CARD, socialCardAlt, socialCardPath, socialCards } from '../src/lib/social-cards.mjs';

const data = { release, farm, vehicles, bridge, hero, foundryFloor, archive: [{ name: 'robot-arm', thumb: 'thumbs/robot-arm.webp' }] };

// Engineering review, finding 4: the declared type follows the card's real format.
test('share cards are JPEG files at 1200 x 630 and declare image/jpeg', () => {
  expect(SOCIAL_CARD).toEqual({ extension: '.jpg', type: 'image/jpeg', width: 1200, height: 630 });
  expect(socialCardPath('home')).toBe('/social/home.jpg');
});

test('one card per slug; the home card pictures the hero poster; the pre-upload build has no Commons cards', () => {
  const cards = socialCards({ ...data, packsEnabled: true });
  expect(new Set(cards.map((card) => card.slug)).size).toBe(cards.length);
  expect(cards.find((card) => card.slug === 'home')?.poster?.src).toBe(hero.poster.src);
  expect(cards.find((card) => card.slug === 'golden-gate-bridge')?.poster?.alt).toBe(bridge.poster.alt);
  // The home card names the release in `release.json` without a `.0` patch: "0.10", not "0.10.0" (and never a number
  // written into this test, which broke on the 0.10.0 bump).
  expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(cards.find((card) => card.slug === 'home')?.note).toBe(`Kiln · ${release.version.replace(/\.0$/, '')} release package`);
  const preUpload = socialCards({ ...data, packsEnabled: false });
  expect(preUpload.some((card) => card.poster && !card.slug.startsWith('archive-'))).toBe(false);
  expect(preUpload.some((card) => card.slug === 'farmhouse')).toBe(false);
});

// Content review, finding 7: the alt text describes the card from the card's own inputs, never the page title.
test('the alt text describes the card: its picture, title and note', () => {
  const cards = socialCards({ ...data, packsEnabled: true });
  const farmhouse = cards.find((card) => card.slug === 'farmhouse')!;
  expect(socialCardAlt(farmhouse)).toBe(`Kiln share card titled “Farmhouse”, with the note “Shapes & Seasons Farm · Kiln Commons”, beside a picture: ${farmhouse.poster!.alt.replace(/\.$/, '')}.`);
  expect(socialCardAlt(cards.find((card) => card.slug === 'docs')!)).toBe('Kiln share card on squared paper, titled “Make the next revision.”, with the note “Kiln documentation”.');
  expect(socialCardAlt(cards.find((card) => card.slug === 'archive-robot-arm')!)).toContain('beside a picture: Historical gallery render of');
  for (const card of cards) expect(socialCardAlt(card)).not.toBe(card.title);
});
