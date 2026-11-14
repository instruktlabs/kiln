import troy from '../data/troy.json';
import foundry from '../data/packs/foundry-floor.json';
import { catalogAssets, type CatalogImage } from './catalog';
import { PACKS_ENABLED } from './config';
import { isTroyGalleryAsset } from './troy-gallery.mjs';
import { cabinWoodsAssets, cabinWoodsHref } from './cabin-woods';
import { holodeckAssetHref, holodeckAssets, holodeckScenes } from './holodeck';
import taxonomy from '../data/gallery-taxonomy.json';
import { browseGallery } from './gallery-browse';
import {
  CATHEDRAL_SQUARE_ID,
  cathedralAssetHref,
  cathedralGalleryAssets,
  cathedralSceneHref,
} from './cathedral-gallery';
import { H7_ID, h7AssetHref, h7GalleryAssets } from './h7-gallery';
import {
  SEED_TOWN_ID,
  seedTownAssetHref,
  seedTownGalleryAssets,
  seedTownSceneHref,
} from './seed-town-gallery';
import { TEXT_TO_3D_PACK, textTo3dAssetHref, textTo3dGalleryAssets } from './text-to-3d-gallery';

export { foundry };
export type FoundryAsset = (typeof foundry.assets)[number];
export interface GalleryCard {
  slug: string;
  name: string;
  pack: string | null;
  packs: string[];
  category: string;
  tags: string[];
  addedOn: string;
  href: string;
  revisionId: string;
  runtimeDownload: { sha256: string };
  /** Null until a pack's rig posters are rendered (Seed Town before its poster run). */
  poster: CatalogImage | null;
  metrics: { triangles: number };
  review: { ownerAccepted: boolean; status: string };
  /** Walkable scenes that place this asset, linked beside the card. */
  scenes?: { label: string; href: string }[];
}

export function buildGallery(packsEnabled: boolean): GalleryCard[] {
  if (!packsEnabled) return [];
  const cards: Omit<GalleryCard, 'tags' | 'addedOn'>[] = catalogAssets(true).map((asset) => ({
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
    ...troy.assets.filter(isTroyGalleryAsset).map((asset) => ({
      ...asset,
      packs: ['troy'],
      href: `/gallery/troy/${asset.slug}/`,
    })),
  );
  cards.push(
    ...cabinWoodsAssets.map((asset) => ({
      ...asset,
      packs: ['cabin-woods-psx-horror'],
      href: cabinWoodsHref(asset),
    })),
  );
  cards.push(
    ...holodeckAssets.map((asset) => ({
      ...asset,
      href: holodeckAssetHref(asset),
      scenes: holodeckScenes(asset).map(({ label, href }) => ({ label, href })),
    })),
  );
  cards.push(
    ...cathedralGalleryAssets(packsEnabled).map((asset) => ({
      ...asset,
      pack: CATHEDRAL_SQUARE_ID,
      packs: [CATHEDRAL_SQUARE_ID],
      category: '',
      href: cathedralAssetHref(asset.slug),
      runtimeDownload: asset.runtimeModelDownload,
      review: { ownerAccepted: false, status: 'awaiting-owner-review' },
      scenes: [{ label: 'Explore Cathedral Square', href: cathedralSceneHref }],
    })),
  );
  cards.push(
    ...textTo3dGalleryAssets(packsEnabled).map((asset) => ({
      ...asset,
      pack: TEXT_TO_3D_PACK,
      packs: [TEXT_TO_3D_PACK],
      category: '',
      href: textTo3dAssetHref(asset.slug),
      review: { ownerAccepted: false, status: 'awaiting-owner-review' },
    })),
    ...h7GalleryAssets(packsEnabled).map((asset) => ({
      ...asset,
      poster: asset.poster ?? null,
      pack: H7_ID,
      packs: [H7_ID],
      category: '',
      href: h7AssetHref(asset.slug),
      runtimeDownload: asset.runtimeModelDownload,
      review: { ownerAccepted: false, status: 'awaiting-owner-review' },
    })),
    ...seedTownGalleryAssets(packsEnabled).map((asset) => ({
      ...asset,
      poster: asset.poster ?? null,
      pack: SEED_TOWN_ID,
      packs: [SEED_TOWN_ID],
      category: '',
      href: seedTownAssetHref(asset.slug),
      runtimeDownload: asset.runtimeModelDownload,
      review: { ownerAccepted: false, status: 'awaiting-owner-review' },
      scenes: [{ label: 'Explore Seed Town', href: seedTownSceneHref }],
    })),
  );
  return browseGallery(
    cards.map((card) => {
      const editorial = (
        taxonomy.assets as Record<string, { category: string; tags: string[]; addedOn: string }>
      )[card.href];
      if (!editorial) throw new Error(`Missing gallery taxonomy for ${card.href}`);
      return { ...card, ...editorial };
    }),
  );
}

export const galleryCards = buildGallery(PACKS_ENABLED);
export const foundryGalleryHref = (asset: FoundryAsset) =>
  galleryCards.find((card) => card.slug === asset.slug && card.packs.includes('foundry-floor'))
    ?.href;
export const foundryGalleryAssets = foundry.assets.filter((asset) =>
  foundryGalleryHref(asset)?.startsWith('/gallery/foundry-floor/'),
);
