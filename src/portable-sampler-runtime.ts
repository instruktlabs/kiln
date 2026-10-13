/** Apply only after the caller has established independent texture ownership. */
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  type Texture,
} from 'three';
import { canonicalizePortableSamplerV1, type CanonicalPortableSamplerV1 } from './portable-sampler';
const min = {
  nearest: NearestFilter,
  linear: LinearFilter,
  'nearest-mipmap-nearest': NearestMipmapNearestFilter,
  'linear-mipmap-nearest': LinearMipmapNearestFilter,
  'nearest-mipmap-linear': NearestMipmapLinearFilter,
  'linear-mipmap-linear': LinearMipmapLinearFilter,
} as const;
const wrap = {
  repeat: RepeatWrapping,
  'clamp-to-edge': ClampToEdgeWrapping,
  'mirrored-repeat': MirroredRepeatWrapping,
} as const;
export function applyPortableSamplerV1<T extends Texture>(
  ownedTexture: T,
  sampler: CanonicalPortableSamplerV1,
): T {
  const value = canonicalizePortableSamplerV1(sampler);
  ownedTexture.minFilter = min[value.minFilter];
  ownedTexture.magFilter = value.magFilter === 'nearest' ? NearestFilter : LinearFilter;
  ownedTexture.wrapS = wrap[value.wrapS];
  ownedTexture.wrapT = wrap[value.wrapT];
  ownedTexture.generateMipmaps = value.minFilter.includes('mipmap');
  ownedTexture.needsUpdate = true;
  return ownedTexture;
}
