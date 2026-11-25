import curation from '../data/site-curation.json';
import posters from '../data/featured-asset-posters.json';
import type { CatalogImage } from './catalog';
import type { GalleryCard } from './gallery';
import { holodeckPack, holodeckShots, type HolodeckPack } from './holodeck';

export const featuredWorlds = curation.featuredWorlds.map(holodeckPack);
export const otherWorlds = curation.otherWorlds.map(holodeckPack);
export const curatedWorlds = [...featuredWorlds, ...otherWorlds];
export const featuredAssetHrefs = curation.featuredAssets;
const featuredPosters: Record<
  string,
  { revisionId: string; glbSha256: string; poster: CatalogImage }
> = posters;
const heroCaptions: Record<string, string> = curation.heroCaptions;

export function featuredAssetPoster(asset: GalleryCard) {
  const entry = featuredPosters[asset.href];
  const model = asset.runtimeModelDownload ?? asset.runtimeDownload;
  return entry?.revisionId === asset.revisionId && entry.glbSha256 === model.sha256
    ? entry.poster
    : asset.poster;
}

export function worldHeroCaption(pack: HolodeckPack) {
  return heroCaptions[pack.id] ?? pack.description;
}

/** Lead with the view from inside a place; retain the overview on the pack page. */
export function worldCover(packId: string) {
  const shots = holodeckShots(packId);
  return shots[1] ?? shots[0];
}
