import farm from '../data/packs/farm.json';
import vehicles from '../data/packs/vehicles.json';
import bridge from '../data/standalone/golden-gate-bridge.json';
import { PACKS_ENABLED } from './config';
export { farm, vehicles, bridge };
/** The asset pages under /gallery/: launch mode only (KILN_SITE_PACKS=1), since they link the Commons downloads on R2. */
export const catalogAssets = (packsEnabled: boolean) =>
  packsEnabled ? [...farm.assets, ...vehicles.assets, bridge] : [];
export const assets = catalogAssets(PACKS_ENABLED);
/** The pack pages under /packs/: the Foundry Floor page states the pack's production status and is built in both modes. */
export const packSlugs = (packsEnabled: boolean) =>
  packsEnabled ? ['farm', 'vehicles', 'foundry-floor'] : ['foundry-floor'];
export type CatalogAsset = (typeof assets)[number];
export type VehicleAsset = (typeof vehicles.assets)[number];
/** Keep the lighter Bridge preview independent of the downloadable full model. */
export function assetPreview(asset: CatalogAsset) {
  if (asset.id === 'golden-gate-bridge') {
    const web = bridge.tiers.find((tier) => tier.tier === 'web')!;
    return { url: web.runtime.url, revisionId: web.revisionId, tier: 'web' as const };
  }
  return { url: asset.modelPath, revisionId: asset.revisionId, tier: null };
}
export const isVehicle = (asset: CatalogAsset): asset is VehicleAsset => asset.pack === 'vehicles';
export type CatalogImage = Pick<
  (typeof farm.assets)[number]['poster'],
  'src' | 'width' | 'height' | 'alt' | 'srcsetAvif' | 'srcsetWebp'
>;
export const FULL_WIDTH_IMAGE_SIZES =
  '(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) calc(100vw - 4rem), (max-width: 1439px) calc(100vw - 9rem), 81rem';
export const number = (value: number) => value.toLocaleString('en-US');
export const bounds = (values: number[]) => values.map((value) => value.toFixed(2)).join(' × ');
/** A file size in bytes, with megabytes added where they say something (a 777-byte text is not "0.00 MB"). */
export const bytes = (value: number) =>
  value < 10_000
    ? `${number(value)} bytes`
    : `${number(value)} bytes (${(value / 1_000_000).toFixed(2)} MB)`;
/**
 * Names as one sentence list: "A and B", "A, B and C". When a name has a comma in it ("OHT rail, straight") the list
 * uses semicolons, "A; B, c; and D", so every name stays one item.
 */
export const listOf = (names: readonly string[]) => {
  if (names.length < 3) return names.join(' and ');
  return names.some((name) => name.includes(','))
    ? `${names.slice(0, -1).join('; ')}; and ${names.at(-1)}`
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

export const imageQualification = (image: object): string | undefined =>
  'revisionQualification' in image && typeof image.revisionQualification === 'string'
    ? image.revisionQualification
    : undefined;
