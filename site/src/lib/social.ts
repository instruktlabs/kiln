import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import release from '../data/release.json';
import foundryFloor from '../data/foundry-floor.json';
import { hero } from './hero';
import { farm, vehicles, bridge } from './catalog';
import { PACKS_ENABLED, SITE } from './config';
import { SOCIAL_CARD, socialCardAlt, socialCardPath, socialCards } from './social-cards.mjs';

/** The cards `scripts/build-site-media.mjs` drew for this build, from the same inputs (it runs before the Astro build). */
const archiveIndex = resolve('public/assets/index.json');
const cards = new Map(
  socialCards({
    packsEnabled: PACKS_ENABLED,
    release,
    farm,
    vehicles,
    bridge,
    hero,
    foundryFloor,
    archive: existsSync(archiveIndex) ? JSON.parse(readFileSync(archiveIndex, 'utf8')) : [],
  }).map((card) => [card.slug, card]),
);

/** A page's share card: its URL, format, size and a description of the card itself. Unknown cards fail the build. */
export function socialCard(slug: string) {
  const card = cards.get(slug);
  if (!card)
    throw new Error(
      `No share card "${slug}": scripts/build-site-media.mjs draws ${[...cards.keys()].slice(0, 12).join(', ')}…`,
    );
  return {
    url: new URL(socialCardPath(slug), SITE).href,
    type: SOCIAL_CARD.type,
    width: SOCIAL_CARD.width,
    height: SOCIAL_CARD.height,
    alt: socialCardAlt(card),
  };
}
