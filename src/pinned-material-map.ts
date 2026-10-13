/** Host-only atlas map capability. Authored code receives neither this port nor bytes. */
import type { TextureUsage } from './texture-contract';
export type MaterialMapSlotV1 =
  | 'baseColor'
  | 'normal'
  | 'metallicRoughness'
  | 'emissive'
  | 'occlusion';
export type MaterialHashV1 = `sha256:${string}`;
export interface MaterialMapPinV1 {
  resourceId: string;
  revisionId: string;
  sha256: string;
}
export interface VerifiedPinnedMaterialMapDescriptorV1 {
  materialId: string;
  revisionId: MaterialHashV1;
  resourceId: string;
  slot: MaterialMapSlotV1;
  usage: TextureUsage;
  colorSpace: 'srgb' | 'linear';
  width: number;
  height: number;
  encodedByteLength: number;
  imageSha256: MaterialHashV1;
  decodedPixelHash?: MaterialHashV1;
}
export interface OwnedMaterialMapPixelsV1 {
  descriptor: VerifiedPinnedMaterialMapDescriptorV1;
  pixels: Uint8Array;
  decodedPixelHash: MaterialHashV1;
}
export interface PinnedMaterialMapPortV1 {
  describePinnedMaterialMap(
    mapResourceId: unknown,
    pin: MaterialMapPinV1,
  ): VerifiedPinnedMaterialMapDescriptorV1 | undefined;
  resolvePinnedMaterialMapPixels(
    mapResourceId: unknown,
    pin: MaterialMapPinV1,
    context?: { signal?: AbortSignal },
  ): Promise<OwnedMaterialMapPixelsV1>;
}
