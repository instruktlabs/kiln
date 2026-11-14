import catalog from '../data/packs/seed-town.json';
import scenePacks from '../data/scene-packs.json';
import type { CatalogImage } from './catalog';
import { PACKS_ENABLED } from './config';

export const SEED_TOWN_ID = 'seed-town';
export const seedTownPackHref = '/packs/seed-town/';
export const seedTownSceneHref = '/scenes/seed-town/';
export const seedTownAssetHref = (slug: string) => `/gallery/seed-town/${slug}/`;
/** A kit's poster arrives with the rig poster run (scripts/rig-posters.mjs seed-town); until then it is absent. */
export type SeedTownPoster = CatalogImage & { inputPath?: string };
export type SeedTownAsset = (typeof catalog.assets)[number] & { poster?: SeedTownPoster };
export const seedTownPack = catalog as Omit<typeof catalog, 'assets'> & { assets: SeedTownAsset[] };

export function seedTownGalleryAssets(packsEnabled = PACKS_ENABLED): SeedTownAsset[] {
  return packsEnabled ? seedTownPack.assets : [];
}

export function seedTownModelUrl(asset: SeedTownAsset): string {
  const pack = scenePacks[SEED_TOWN_ID];
  if (pack.release !== catalog.release)
    throw new Error('Seed Town gallery assets use a different scene release');
  return `${pack.base}${asset.runtimeModelDownload.member}?revision=${encodeURIComponent(asset.revisionId)}`;
}

/** A size range in the units the kit declares, for example "1.6 to 2 m (1.8 by default)". */
export function sizeRange(size: {
  min: number;
  default: number;
  max: number;
  unit?: string;
}): string {
  const unit = size.unit ? ` ${size.unit}` : '';
  return `${size.min} to ${size.max}${unit} (${size.default} by default)`;
}
