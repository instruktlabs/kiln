import data from '../data/cabin-woods-psx-horror.json';
import type { CatalogImage } from './catalog';
import type { DownloadFile } from './download-choices';

export const CABIN_WOODS_ID = 'cabin-woods-psx-horror';
export interface CabinWoodsAsset {
  slug: string;
  name: string;
  pack: typeof CABIN_WOODS_ID;
  category: string;
  description: string;
  collection: string;
  assetId: string;
  revisionId: string;
  modelPath: string;
  sourcePath: string;
  sourceSha256: string;
  sourceRef?: string;
  manifestDownload: DownloadFile;
  canonicalDownload: DownloadFile;
  runtimeModelDownload: DownloadFile;
  metadataDownload: DownloadFile;
  runtimeDownload: DownloadFile;
  editableDownload: DownloadFile;
  poster: CatalogImage & { fidelity?: Record<string, unknown> | null };
  metrics: {
    triangles: number;
    meshes: number;
    materials: number;
    bounds: number[];
    boundsMin: number[];
    boundsMax: number[];
    clips: string[];
    extensions: string[];
  };
  review: { ownerAccepted: boolean; status: 'accepted' | 'awaiting-owner-review' };
  historyScope: 'selected-only';
}

export const cabinWoodsAssets = data.assets as CabinWoodsAsset[];
export const cabinWoodsTextureResources =
  (
    data as unknown as {
      textureResources?: { slug: string; label: string; editableDownload: DownloadFile }[];
    }
  ).textureResources ?? [];
export const cabinWoodsHref = (asset: Pick<CabinWoodsAsset, 'slug'>) =>
  `/gallery/${CABIN_WOODS_ID}/${asset.slug}/`;
