import catalog from '../data/packs/cathedral-square.json';
import scenePacks from '../data/scene-packs.json';
import { PACKS_ENABLED } from './config';

export const CATHEDRAL_SQUARE_ID = 'cathedral-square';
export const cathedralPackHref = '/packs/cathedral-square/';
export const cathedralSceneHref = '/scenes/cathedral-square/';
export const cathedralAssetHref = (slug: string) => `/gallery/cathedral-square/${slug}/`;
export const cathedralPack = catalog;
export type CathedralAsset = (typeof catalog.assets)[number];

export function cathedralGalleryAssets(packsEnabled = PACKS_ENABLED): CathedralAsset[] {
  return packsEnabled ? catalog.assets : [];
}

export function cathedralModelUrl(asset: CathedralAsset): string {
  const pack = scenePacks[CATHEDRAL_SQUARE_ID];
  if (pack.release !== catalog.release)
    throw new Error('Cathedral gallery assets use a different scene release');
  return `${pack.base}${asset.runtimeModelDownload.member}?revision=${encodeURIComponent(asset.revisionId)}`;
}
