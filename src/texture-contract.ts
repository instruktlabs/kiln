/** Shared browser-safe texture usage vocabulary. Loading images belongs to the host. */
export const TEXTURE_USAGES = [
  'albedo',
  'emissive',
  'normal',
  'roughness',
  'metalness',
  'metallicRoughness',
  'occlusion',
] as const;

export type TextureUsage = (typeof TEXTURE_USAGES)[number];
