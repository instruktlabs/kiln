import curation from '../data/site-curation.json';
import { holodeckPack, holodeckShots } from './holodeck';

export const featuredWorlds = curation.featuredWorlds.map(holodeckPack);
export const otherWorlds = curation.otherWorlds.map(holodeckPack);
export const curatedWorlds = [...featuredWorlds, ...otherWorlds];
export const featuredAssetHrefs = curation.featuredAssets;
/** Lead with the view from inside a place; retain the overview on the pack page. */
export function worldCover(packId: string) {
  const shots = holodeckShots(packId);
  return shots[1] ?? shots[0];
}
