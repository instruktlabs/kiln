import troy from '../data/troy.json';
import foundry from '../data/packs/foundry-floor.json';
import { catalogAssets, type CatalogImage } from './catalog';
import { PACKS_ENABLED } from './config';

export { foundry };
export type FoundryAsset = (typeof foundry.assets)[number];
export interface GalleryCard {
  slug: string;
  name: string;
  pack: string | null;
  packs: string[];
  category: string;
  href: string;
  revisionId: string;
  runtimeDownload: { sha256: string };
  poster: CatalogImage;
  metrics: { triangles: number };
  review: { ownerAccepted: boolean; status: string };
}

export function buildGallery(packsEnabled: boolean): GalleryCard[] {
  if (!packsEnabled) return [];
  const cards: GalleryCard[] = catalogAssets(true).map((asset) => ({
    ...asset,
    packs: [asset.pack ?? 'standalone'],
    href: `/gallery/${asset.slug}/`,
  }));
  for (const asset of foundry.assets) {
    const shared = cards.find(
      (card) =>
        card.slug === asset.slug &&
        card.revisionId === asset.revisionId &&
        card.runtimeDownload.sha256 === asset.runtimeDownload.sha256,
    );
    if (shared) {
      shared.packs.push('foundry-floor');
      continue;
    }
    cards.push({
      ...asset,
      packs: ['foundry-floor'],
      category: foundry.groups.find((group) => group.id === asset.group)!.title,
      href: `/gallery/foundry-floor/${asset.slug}/`,
      review: { ownerAccepted: false, status: 'awaiting-owner-review' },
    });
  }
  cards.push(
    ...troy.assets.map((asset) => ({
      ...asset,
      packs: ['troy'],
      href: `/gallery/troy/${asset.slug}/`,
    })),
  );
  return cards;
}

export const galleryCards = buildGallery(PACKS_ENABLED);
export const foundryGalleryHref = (asset: FoundryAsset) =>
  galleryCards.find((card) => card.slug === asset.slug && card.packs.includes('foundry-floor'))
    ?.href;
export const foundryGalleryAssets = foundry.assets.filter((asset) =>
  foundryGalleryHref(asset)?.startsWith('/gallery/foundry-floor/'),
);
