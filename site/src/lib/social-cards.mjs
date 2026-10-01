import { archiveLabel } from './archive-names.mjs';

/**
 * The share cards, in one list: `scripts/build-site-media.mjs` draws each card from these inputs and `BaseLayout` describes
 * the same card in its Open Graph and Twitter tags, so the declared type and the alt text cannot drift from the file.
 *
 * Share cards are JPEG. Every network's crawler documents JPEG and PNG; the previous site's fixture required a PNG after two
 * LinkedIn-specific preview fixes, and WebP is not something all of them read. The site's page images stay AVIF and WebP.
 */
export const SOCIAL_CARD = { extension: '.jpg', type: 'image/jpeg', width: 1200, height: 630 };
export const socialCardPath = (slug) => `/social/${slug}${SOCIAL_CARD.extension}`;

const PACK_NAMES = { farm: 'Shapes & Seasons Farm', vehicles: 'Generic Road Vehicles' };
const poster = (image) => (image ? { src: image.src, alt: image.alt } : undefined);

/**
 * Every card the build draws, from the parsed catalog files; the archive list is `public/assets/index.json`, or an empty
 * list when the archive has not been built.
 */
export function socialCards({ packsEnabled, release, farm, vehicles, bridge, hero, foundryFloor, archive = [] }) {
  const version = release.version.replace(/\.0$/, '');
  const heroPoster = packsEnabled ? poster(hero.poster) : undefined;
  const cards = [
    { slug: 'home', title: 'Build and revise 3D assets with your coding agent.', note: `Kiln · ${version} release package`, poster: heroPoster },
    { slug: 'packs', title: 'Assets made with Kiln.', note: 'Kiln Commons', poster: heroPoster },
    { slug: 'farm', title: PACK_NAMES.farm, note: `${farm.assetCount} assets · Kiln Commons`, poster: packsEnabled ? poster(farm.scene.poster) : undefined },
    { slug: 'vehicles', title: PACK_NAMES.vehicles, note: `${vehicles.assetCount} assets · Kiln Commons`, poster: packsEnabled ? poster(vehicles.assets.find((asset) => asset.slug === 'sedan').poster) : undefined },
    { slug: 'scenes', title: 'See the assets together.', note: 'Scenes made with Kiln', poster: packsEnabled ? poster(farm.scene.poster) : undefined },
    { slug: 'docs', title: 'Make the next revision.', note: 'Kiln documentation' },
    { slug: 'foundry-floor', title: foundryFloor.name, note: 'In production · Kiln Commons' },
    { slug: 'gallery', title: 'Read the source. Inspect the asset.', note: 'The Kiln gallery', poster: heroPoster },
    { slug: 'archive', title: 'Earlier Kiln examples.', note: 'Unreviewed historical examples' },
  ];
  if (packsEnabled) {
    for (const asset of [...farm.assets, ...vehicles.assets, bridge]) {
      cards.push({ slug: asset.slug, title: asset.name, note: asset.pack ? `${PACK_NAMES[asset.pack]} · Kiln Commons` : 'Standalone · Kiln Commons', poster: poster(asset.poster) });
    }
  }
  for (const asset of archive) {
    const label = archiveLabel(asset.name);
    cards.push({ slug: `archive-${asset.name}`, title: label, note: 'Earlier Kiln example · Unreviewed', poster: { src: `/${asset.poster ?? asset.thumb}`, alt: `Historical gallery render of ${label}` } });
  }
  return cards;
}

/**
 * The card as a sighted reader sees it: the picture (its own alt text), then the title and the note. Never the page title
 * alone (content review, finding 7).
 */
export function socialCardAlt(card) {
  const words = `titled “${card.title}”, with the note “${card.note}”`;
  if (!card.poster) return `Kiln share card on squared paper, ${words}.`;
  return `Kiln share card ${words}, beside a picture: ${card.poster.alt.replace(/\.$/, '')}.`;
}
