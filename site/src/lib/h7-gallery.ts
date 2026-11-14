import catalog from '../data/packs/h-7.json';
import type { CatalogImage } from './catalog';
import { PACKS_ENABLED } from './config';
import { assetDelivery } from './delivery';

export const H7_ID = 'h-7';
export const h7PackHref = '/packs/h-7/';
export const h7DemoHref = '/play/';
export const h7AssetHref = (slug: string) => `/gallery/h-7/${slug}/`;
/** A poster arrives with the rig poster run (scripts/rig-posters.mjs h-7); until then it is absent. */
export type H7Poster = CatalogImage & { inputPath?: string };
/** `partOf` marks an extra model of another card: a lower detail level or a corpse, with no page of its own. */
export type H7Asset = (typeof catalog.assets)[number] & { poster?: H7Poster; partOf?: string };
export const h7Pack = catalog as Omit<typeof catalog, 'assets'> & { assets: H7Asset[] };

/** The assets with a gallery page. */
export function h7GalleryAssets(packsEnabled = PACKS_ENABLED): H7Asset[] {
  return packsEnabled ? h7Pack.assets.filter((asset) => !asset.partOf) : [];
}

/** The extra models that ship with one card, in catalog order. */
export function h7Parts(slug: string): H7Asset[] {
  return h7Pack.assets.filter((asset) => asset.partOf === slug);
}

/** The collection has no scene pack, so the 3D view loads the same pinned file the download button serves. */
export function h7ModelUrl(asset: H7Asset): string {
  return assetDelivery(H7_ID, asset.slug).runtimeDownload.url;
}
