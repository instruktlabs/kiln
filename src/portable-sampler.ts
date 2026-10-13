/** Shared portable sampler contract; no renderer, loader or native dependencies. */
import { ProceduralTextureError } from './procedural-material-v2';

export const PORTABLE_MIN_FILTERS_V1 = [
  'nearest',
  'linear',
  'nearest-mipmap-nearest',
  'linear-mipmap-nearest',
  'nearest-mipmap-linear',
  'linear-mipmap-linear',
] as const;
export const PORTABLE_MAG_FILTERS_V1 = ['nearest', 'linear'] as const;
export const PORTABLE_WRAPS_V1 = ['repeat', 'clamp-to-edge', 'mirrored-repeat'] as const;
export interface PortableSamplerV1 {
  minFilter: (typeof PORTABLE_MIN_FILTERS_V1)[number];
  magFilter: (typeof PORTABLE_MAG_FILTERS_V1)[number];
  wrapS: (typeof PORTABLE_WRAPS_V1)[number];
  wrapT: (typeof PORTABLE_WRAPS_V1)[number];
}
export type CanonicalPortableSamplerV1 = PortableSamplerV1;
export function canonicalizePortableSamplerV1(input: unknown): CanonicalPortableSamplerV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ProceduralTextureError('portableSampler requires a complete JSON object.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    throw new ProceduralTextureError('portableSampler must be plain JSON data.');
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor))
      throw new ProceduralTextureError(
        'portableSampler requires enumerable JSON data fields, never accessors.',
      );
  }
  const value = input as Record<string, unknown>;
  const allowed = {
    minFilter: PORTABLE_MIN_FILTERS_V1,
    magFilter: PORTABLE_MAG_FILTERS_V1,
    wrapS: PORTABLE_WRAPS_V1,
    wrapT: PORTABLE_WRAPS_V1,
  };
  if (Object.keys(value).some((key) => !Object.hasOwn(allowed, key)))
    throw new ProceduralTextureError('portableSampler contains an unsupported field.');
  for (const [key, options] of Object.entries(allowed))
    if (!(options as readonly unknown[]).includes(value[key]))
      throw new ProceduralTextureError(
        `portableSampler.${key} requires one of ${options.join(', ')}.`,
      );
  return {
    minFilter: value['minFilter'],
    magFilter: value['magFilter'],
    wrapS: value['wrapS'],
    wrapT: value['wrapT'],
  } as CanonicalPortableSamplerV1;
}
