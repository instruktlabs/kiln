import data from '../data/holodeck.json';
import worlds from '../data/holodeck-worlds.json';
import type { CatalogImage } from './catalog';
import type { DownloadFile } from './download-choices';

/**
 * The Holodeck scene packs: Kiln assets placed in walkable Holodeck worlds. Assets are staged by
 * `scripts/stage-holodeck.mjs`; the walkable scenes live on the Holodeck site, whose world ids are configured in one
 * place, `src/data/holodeck-worlds.json`.
 */
export interface HolodeckPack {
  id: string;
  scene: string;
  name: string;
  description: string;
  available: boolean;
  status: string;
  assetCount: number;
  assets: string[];
  /** Modules this pack lists at their final revision while the walkable world still places an earlier one. */
  sceneStillPlacesEarlier?: {
    id: string;
    slug: string;
    placedRevisionId: string;
    finalRevisionId: string;
  }[];
  downloads: (DownloadFile & { profile: 'runtime' | 'editable'; label: string; url: string })[];
}
export interface HolodeckPlannedPack {
  id: string;
  scene: string;
  name: string;
  description: string;
}
export interface HolodeckAsset {
  slug: string;
  name: string;
  description: string;
  category: string;
  pack: string;
  packs: string[];
  collection: string;
  assetId: string;
  revisionId: string;
  parentRevision?: string;
  sourcePath: string;
  sourceSha256: string;
  runtimeModelDownload: DownloadFile & { url: string };
  runtimeDownload: DownloadFile & { url: string };
  editableDownload: DownloadFile & { url: string };
  poster: CatalogImage;
  metrics: {
    triangles: number;
    meshes: number;
    materials: number;
    bounds: number[];
    clips: string[];
    extensions: string[];
  };
  review: { ownerAccepted: boolean; status: string };
}

export const holodeck = data as unknown as {
  release: string;
  licence: { spdx: string; note: string };
  runtimeExporter: string;
  packs: HolodeckPack[];
  planned: HolodeckPlannedPack[];
  assets: HolodeckAsset[];
};
export const holodeckPacks = holodeck.packs;
export const holodeckPlanned = holodeck.planned;
/** Only assets with a recorded poster appear; staging records posters before a build can show them. */
export const holodeckAssets = holodeck.assets.filter((asset) => asset.poster);

export const holodeckSite = worlds.site;
/** The walkable scene for a pack, or the Holodeck site itself for a pack without a configured world. */
export function holodeckWorldUrl(packId: string) {
  const id = (worlds.worlds as Record<string, string>)[packId];
  return id
    ? new URL(worlds.worldPath.replace('{id}', encodeURIComponent(id)), worlds.site).href
    : worlds.site;
}
export const holodeckAssetHref = (asset: Pick<HolodeckAsset, 'slug'>) =>
  `/gallery/holodeck/${asset.slug}/`;
export const holodeckPackHref = (pack: Pick<HolodeckPack, 'scene'>) =>
  `/packs/holodeck/${pack.scene}/`;
export const holodeckPack = (id: string) => {
  const pack = holodeckPacks.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown Holodeck pack ${id}`);
  return pack;
};
/** Where an asset can be walked: one link per scene that places it. */
export const holodeckScenes = (asset: Pick<HolodeckAsset, 'packs'>) =>
  asset.packs.map((id) => {
    const pack = holodeckPack(id);
    return {
      label: `Walk ${pack.name}`,
      name: pack.name,
      href: holodeckWorldUrl(id),
      packHref: holodeckPackHref(pack),
    };
  });
