import manifest from '../data/asset-delivery.json';
import type { DownloadFile } from './download-choices';

interface DeliveryAsset {
  slug: string;
  runtimeDownload: DownloadFile;
  editableDownload: DownloadFile;
}
interface DeliveryGroup {
  downloads: (DownloadFile & { profile: 'runtime' | 'editable' })[];
  assets: DeliveryAsset[];
}
const groups = manifest.groups as Record<string, DeliveryGroup>;

export function assetDelivery(group: string, slug: string): DeliveryAsset {
  const asset = groups[group]?.assets.find((candidate) => candidate.slug === slug);
  if (!asset) throw new Error(`No asset downloads for ${group}/${slug}`);
  return asset;
}

export function packDelivery(group: string) {
  const downloads = groups[group]?.downloads;
  const runtime = downloads?.find((download) => download.profile === 'runtime');
  const editable = downloads?.find((download) => download.profile === 'editable');
  if (!runtime || !editable) throw new Error(`Incomplete pack downloads for ${group}`);
  return { runtime, editable };
}
