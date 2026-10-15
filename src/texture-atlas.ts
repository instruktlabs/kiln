/** Three state and affine UV wrapper; host resources never enter authored arguments. */
import * as THREE from 'three';
import { applyPortableSamplerV1 } from './portable-sampler-runtime';
import {
  compileTextureAtlasSpecV1,
  type TextureAtlasCompileOptionsV1,
  type TextureAtlasManifestV1,
} from './texture-atlas-pixels';
import {
  atlasFailure,
  canonicalAtlasMetadataJsonV1,
  TEXTURE_ATLAS_COMPILER_IDS,
  TEXTURE_ATLAS_COMPILER_ID_V1_2,
  TEXTURE_ATLAS_LIMITS,
  TEXTURE_ATLAS_LIMITS_V1_2,
} from './texture-atlas-contract';
import { sha256Hex } from './procedural-material-v2';
import { remapUV } from './uv-shapes';
/** SDK/host API. Sandbox integration closes over options and exposes exactly one argument. */
export async function textureAtlas(
  input: unknown,
  options: TextureAtlasCompileOptionsV1 = {},
): Promise<THREE.DataTexture> {
  const compiled = await compileTextureAtlasSpecV1(input, options);
  const texture = new THREE.DataTexture(
    compiled.pixels,
    compiled.spec.width,
    compiled.spec.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'Atlas';
  texture.flipY = false;
  texture.colorSpace =
    compiled.spec.usage === 'albedo' || compiled.spec.usage === 'emissive'
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
  applyPortableSamplerV1(texture, compiled.spec.sampler);
  texture.userData.kilnAtlas = { spec: compiled.spec, manifest: compiled.manifest };
  texture.userData.kilnTexture = {
    usage: compiled.spec.usage,
    colorSpace:
      compiled.spec.usage === 'albedo' || compiled.spec.usage === 'emissive' ? 'srgb' : 'linear',
    width: compiled.spec.width,
    height: compiled.spec.height,
    hasAlpha: compiled.pixels.some((v, i) => i % 4 === 3 && v < 255),
  };
  return texture;
}
export interface AtlasUVOptionsV1 {
  inputOrigin: 'top-left' | 'bottom-left';
  mode: 'content-boundary' | 'texel-center';
}
function manifestOf(atlas: THREE.Texture | TextureAtlasManifestV1): TextureAtlasManifestV1 {
  const value = (atlas as THREE.Texture)?.isTexture
    ? (atlas as THREE.Texture).userData.kilnAtlas?.manifest
    : atlas;
  if (!value || typeof value !== 'object')
    atlasFailure('an atlas texture or compiled manifest is required.');
  canonicalAtlasMetadataJsonV1(value);
  const manifest = value as TextureAtlasManifestV1;
  const limits =
    manifest.compilerId === TEXTURE_ATLAS_COMPILER_ID_V1_2
      ? TEXTURE_ATLAS_LIMITS_V1_2
      : TEXTURE_ATLAS_LIMITS;
  if (
    manifest.version !== 'kiln.atlas-manifest.v1' ||
    !(TEXTURE_ATLAS_COMPILER_IDS as readonly unknown[]).includes(manifest.compilerId) ||
    manifest.origin !== 'top-left' ||
    !Array.isArray(manifest.regions) ||
    !manifest.regions.length ||
    manifest.regions.length > limits.regions ||
    !Number.isSafeInteger(manifest.width) ||
    manifest.width < 4 ||
    manifest.width > limits.edge ||
    !Number.isSafeInteger(manifest.height) ||
    manifest.height < 4 ||
    manifest.height > limits.edge
  )
    atlasFailure('invalid atlas manifest dimensions/version.');
  const { manifestHash, ...payload } = manifest;
  if (
    `sha256:${sha256Hex(`kiln.atlas-manifest.v1\n${canonicalAtlasMetadataJsonV1(payload)}`)}` !==
    manifestHash
  )
    atlasFailure('atlas manifest identity mismatch.');
  return manifest;
}
export function remapUVToAtlas(
  geometry: THREE.BufferGeometry,
  atlas: THREE.Texture | TextureAtlasManifestV1,
  name: string,
  options: AtlasUVOptionsV1,
): THREE.BufferGeometry {
  const manifest = manifestOf(atlas);
  canonicalAtlasMetadataJsonV1(options);
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((k) => !['inputOrigin', 'mode'].includes(k)) ||
    !['top-left', 'bottom-left'].includes(options.inputOrigin) ||
    !['content-boundary', 'texel-center'].includes(options.mode)
  )
    atlasFailure('explicit inputOrigin and content-boundary/texel-center mode are required.');
  const region = manifest.regions.find((r) => r.name === name);
  if (!region) atlasFailure(`unknown named region ${String(name)}.`);
  const { x, y, width: w, height: h } = region.content;
  if (
    ![x, y, w, h].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    w < 1 ||
    h < 1 ||
    x + w > manifest.width ||
    y + h > manifest.height
  )
    atlasFailure('invalid region content rectangle.');
  const uv = geometry?.getAttribute?.('uv'),
    position = geometry?.getAttribute?.('position');
  if (
    !position ||
    !uv ||
    uv.itemSize !== 2 ||
    uv.count !== position.count ||
    uv.count < 1 ||
    uv.count > TEXTURE_ATLAS_LIMITS.uvVertices ||
    (uv as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ||
    (
      (uv as THREE.InterleavedBufferAttribute).data as
        | (THREE.InterleavedBuffer & { isInstancedInterleavedBuffer?: boolean })
        | undefined
    )?.isInstancedInterleavedBuffer
  )
    atlasFailure(
      'matching per-vertex UV0 and positions are required; per-instance UVs are unsupported.',
    );
  let bytes = uv.count * 8;
  const interleavedBuffers = new Set<ArrayBufferLike>();
  const count = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      // Three's geometry-copy data cache deduplicates interleaved backing buffers.
      const buffer = attribute.array.buffer;
      if (!interleavedBuffers.has(buffer)) {
        interleavedBuffers.add(buffer);
        bytes += buffer.byteLength;
      }
    } else {
      // Ordinary attributes/morphs/index clone independently even with shared input arrays.
      // Typed convenience subclasses may allocate in both constructor and copy.
      bytes +=
        attribute.array.byteLength *
        (attribute.constructor === THREE.BufferAttribute ||
        attribute.constructor === THREE.InstancedBufferAttribute
          ? 1
          : 2);
    }
  };
  for (const attr of Object.values(geometry.attributes)) count(attr);
  for (const attrs of Object.values(geometry.morphAttributes))
    for (const attr of attrs) count(attr);
  if (geometry.index) count(geometry.index);
  if (bytes > TEXTURE_ATLAS_LIMITS.uvAttributeBytes)
    atlasFailure('owned UV clone attribute allocation budget exceeded.');
  for (let i = 0; i < uv.count; i++)
    if (![uv.getX(i), uv.getY(i)].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
      atlasFailure('UV0 must be finite in the unit domain [0,1]; region tiling is unsupported.');
  const center = options.mode === 'texel-center',
    su = (w - (center ? 1 : 0)) / manifest.width,
    sv = (h - (center ? 1 : 0)) / manifest.height;
  const bottom = options.inputOrigin === 'bottom-left';
  const offset: [number, number] = [
    (x + (center ? 0.5 : 0)) / manifest.width,
    (y + (bottom ? h - (center ? 0.5 : 0) : center ? 0.5 : 0)) / manifest.height,
  ];
  const scale: [number, number] = [su, bottom ? -sv : sv];
  const output = remapUV(geometry, { scale, offset });
  output.userData.kilnAtlasBinding = {
    manifestHash: manifest.manifestHash,
    specHash: manifest.specHash,
    layoutHash: manifest.layoutHash,
    region: name,
    content: structuredClone(region.content),
    allocation: structuredClone(region.allocation),
    inputOrigin: options.inputOrigin,
    mode: options.mode,
    scale,
    offset,
  };
  return output;
}
