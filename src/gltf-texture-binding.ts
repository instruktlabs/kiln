import * as THREE from 'three';
import type { TextureInfo } from '@gltf-transform/core';
import type { Transform } from '@gltf-transform/extensions';

const MIN: Record<number, THREE.MinificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
};
const WRAP: Record<number, THREE.Wrapping> = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
};

/** glTF image orientation and sampling belong to every texture use, not just atlases. */
export function restoreGltfTextureBinding(texture: THREE.Texture, info: TextureInfo): void {
  texture.minFilter = MIN[info.getMinFilter() ?? 9729]!;
  texture.magFilter = info.getMagFilter() === 9728 ? THREE.NearestFilter : THREE.LinearFilter;
  texture.wrapS = WRAP[info.getWrapS()]!;
  texture.wrapT = WRAP[info.getWrapT()]!;
  texture.generateMipmaps = [9984, 9985, 9986, 9987].includes(info.getMinFilter() ?? 9729);
  texture.flipY = false;
  const transform = info.getExtension<Transform>('KHR_texture_transform');
  texture.channel = transform?.getTexCoord() ?? info.getTexCoord();
  if (transform) {
    texture.offset.fromArray(transform.getOffset());
    texture.repeat.fromArray(transform.getScale());
    texture.rotation = transform.getRotation();
    // glTF composes T*R*S. Three's automatic UV matrix composes nonuniform
    // repeat and rotation in a different order; retain the actual glTF basis.
    const c = Math.cos(texture.rotation),
      s = Math.sin(texture.rotation);
    const [sx, sy] = transform.getScale(),
      [x, y] = transform.getOffset();
    texture.matrix.set(sx * c, sy * s, x, -sx * s, sy * c, y, 0, 0, 1);
    texture.matrixAutoUpdate = false;
  }
}

/** Two uses of one image may differ in sampler, UV channel, transform or atlas provenance. */
export function gltfTextureBindingKey(info: TextureInfo | null | undefined): string {
  if (!info) return '';
  const transform = info.getExtension<Transform>('KHR_texture_transform');
  return JSON.stringify([
    info.getMinFilter(),
    info.getMagFilter(),
    info.getWrapS(),
    info.getWrapT(),
    info.getTexCoord(),
    transform?.getTexCoord(),
    transform?.getOffset(),
    transform?.getScale(),
    transform?.getRotation(),
    info.getExtras()['kilnAtlasReference'],
  ]);
}
