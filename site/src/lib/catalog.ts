import farm from '../data/packs/farm.json';
import vehicles from '../data/packs/vehicles.json';
import bridge from '../data/standalone/golden-gate-bridge.json';
import { PACKS_ENABLED } from './config';
export { farm, vehicles, bridge };
export const assets = PACKS_ENABLED ? [...farm.assets, ...vehicles.assets, bridge] : [];
export type CatalogAsset = (typeof assets)[number];
export type VehicleAsset = (typeof vehicles.assets)[number];
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
