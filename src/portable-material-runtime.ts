/** Compile the strict portable material contract into bounded Three.js state. */

import type * as THREE from 'three';

import type { MaterialTextureSlot } from './material-recipes';
import { DEFAULT_TEXTURE_RESOLVER, type TextureResolver } from './texture-resolver';
import {
  type CanonicalPortableMaterialSpecV2,
  type CanonicalPortableTextureRefV2,
  ProceduralTextureError,
  canonicalizePortableMaterialSpecV2,
} from './procedural-material-v2';
import { proceduralTexture } from './procedural-texture';
import { pbrMaterial, type PbrMaterialOptions, type TextureUsage } from './textures';
import { loadTexture } from './textures';
import {
  admitPortableMaterialSpecV3,
  PORTABLE_MATERIAL_V3_LIMITS,
  PORTABLE_MATERIAL_SLOT_USAGE,
  PortableMaterialV3Error,
  type CanonicalPortableMaterialSpecV3,
} from './procedural-material-v3';
import { applyPortableSamplerV1 } from './portable-sampler-runtime';
import type { PreparedPortableTextureV3 } from './texture-resolver';

const SLOT_USAGE = {
  baseColor: 'albedo',
  normal: 'normal',
  metallicRoughness: 'metallicRoughness',
  emissive: 'emissive',
  occlusion: 'occlusion',
} as const satisfies Record<MaterialTextureSlot, TextureUsage>;

type PortableSlot = keyof typeof SLOT_USAGE;

/**
 * Compile a JSON-shaped V2 material without exposing loaders, paths, URLs,
 * DataTextures, shader source, or a host resolver to authored code.
 *
 * The whole contract and every resource/slot binding are validated before the
 * first texture is compiled or loaded. A late invalid slot therefore cannot
 * cause partial allocations or host resource calls.
 */
export async function compilePortableMaterialSpecV2(
  input: unknown,
  options: { resolver?: TextureResolver } = {},
): Promise<THREE.MeshStandardMaterial> {
  const spec = canonicalizePortableMaterialSpecV2(input);
  // The direct API is host-owned. The sandbox exposes a one-argument closure,
  // so authored code cannot supply or replace this capability.
  const resolver = options.resolver ?? DEFAULT_TEXTURE_RESOLVER;
  const entries = Object.entries(spec.textures) as Array<
    [PortableSlot, CanonicalPortableTextureRefV2]
  >;

  for (const [slot, ref] of entries) {
    if (ref.kind !== 'resource') continue;
    const descriptor = resolver.describeApprovedTexture?.(ref.resourceId);
    if (!descriptor) {
      throw new ProceduralTextureError(
        `portableMaterial.textures.${slot} resource ${JSON.stringify(ref.resourceId)} is not an approved texture resource ID.`,
      );
    }
    if (!(descriptor.allowedSlots as readonly string[]).includes(slot)) {
      throw new ProceduralTextureError(
        `portableMaterial.textures.${slot} resource ${JSON.stringify(ref.resourceId)} is not approved for that slot.`,
      );
    }
    if (descriptor.usage !== SLOT_USAGE[slot]) {
      throw new ProceduralTextureError(
        `portableMaterial.textures.${slot} requires ${SLOT_USAGE[slot]} data, but ${JSON.stringify(ref.resourceId)} provides ${descriptor.usage}.`,
      );
    }
  }

  const loaded = new Map<PortableSlot, THREE.Texture>();
  await Promise.all(
    entries.map(async ([slot, ref]) => {
      const texture =
        ref.kind === 'procedural'
          ? proceduralTexture(ref.spec)
          : await resolver.loadApprovedTexture(ref.resourceId);
      loaded.set(slot, texture);
    }),
  );

  const materialOptions: PbrMaterialOptions = {
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissiveIntensity: spec.emissiveIntensity,
    alphaMode: spec.alphaMode,
    ...(spec.alphaMode === 'mask' ? { alphaCutoff: spec.alphaCutoff } : {}),
    doubleSided: spec.doubleSided,
    ...(loaded.get('baseColor')
      ? { albedo: loaded.get('baseColor') }
      : spec.baseColor !== undefined
        ? { albedo: spec.baseColor }
        : {}),
    ...(loaded.get('normal') ? { normal: loaded.get('normal') } : {}),
    ...(loaded.get('metallicRoughness')
      ? { metallicRoughness: loaded.get('metallicRoughness') }
      : {}),
    ...(loaded.get('emissive')
      ? { emissive: loaded.get('emissive') }
      : spec.emissive !== undefined
        ? { emissive: spec.emissive }
        : {}),
    ...(loaded.get('occlusion') ? { aoMap: loaded.get('occlusion') } : {}),
  };
  const material = pbrMaterial(materialOptions);
  if (spec.name) material.name = spec.name;
  if (loaded.has('baseColor') && spec.baseColor !== undefined)
    material.color.setHex(spec.baseColor);
  if (loaded.has('emissive') && spec.emissive !== undefined)
    material.emissive.setHex(spec.emissive);
  (material.userData as Record<string, unknown>)['kilnPortableMaterial'] =
    spec satisfies CanonicalPortableMaterialSpecV2;
  return material;
}

/** New V3 path owns every mutable texture/source/pixel/encoded-byte binding. */
export async function compilePortableMaterialSpecV3(
  input: unknown,
  options: { resolver?: TextureResolver; signal?: AbortSignal } = {},
): Promise<THREE.MeshStandardMaterial> {
  const owned = new Map<PortableSlot, THREE.Texture>();
  try {
    const admission = admitPortableMaterialSpecV3(input),
      spec = admission.spec;
    const resolver = options.resolver ?? DEFAULT_TEXTURE_RESOLVER;
    const entries = Object.entries(spec.textures) as Array<
      [PortableSlot, NonNullable<CanonicalPortableMaterialSpecV3['textures'][PortableSlot]>]
    >;
    // All slots are checked before even bounded encoded-byte preparation.
    for (const [slot, ref] of entries)
      if (ref.kind === 'resource') {
        const descriptor = resolver.describeApprovedTexture?.(ref.resourceId);
        if (
          !descriptor?.allowedSlots.includes(slot) ||
          descriptor.usage !== PORTABLE_MATERIAL_SLOT_USAGE[slot]
        )
          throw new ProceduralTextureError(
            `${slot} requires an injected resource approved for its exact slot and usage.`,
          );
        if (!resolver.preparePortableTexture)
          throw new ProceduralTextureError(
            'V3 needs a verified-byte preparation resolver; keep V2 for a legacy resolver.',
          );
      }
    const prepared = new Map<PortableSlot, PreparedPortableTextureV3>();
    let encoded = 0,
      texels = admission.texels,
      resourcePixels = 0;
    for (const [slot, ref] of entries)
      if (ref.kind === 'resource') {
        options.signal?.throwIfAborted();
        const raw = await resolver.preparePortableTexture!(ref.resourceId, {
          signal: options.signal,
        });
        const d = structuredClone(raw.descriptor);
        if (
          !(raw.bytes instanceof Uint8Array) ||
          raw.bytes.length < 24 ||
          raw.bytes.length > 8 * 1024 * 1024 ||
          d.encodedByteLength !== raw.bytes.length ||
          d.resourceId !== ref.resourceId ||
          d.usage !== PORTABLE_MATERIAL_SLOT_USAGE[slot] ||
          !d.allowedSlots.includes(slot) ||
          d.colorSpace !== (slot === 'baseColor' || slot === 'emissive' ? 'srgb' : 'linear') ||
          !Number.isInteger(d.width) ||
          !Number.isInteger(d.height) ||
          d.width < 1 ||
          d.height < 1 ||
          d.width > 4096 ||
          d.height > 4096 ||
          !/^sha256:[a-f0-9]{64}$/.test(d.imageSha256)
        )
          throw new ProceduralTextureError('Prepared texture descriptor/bytes are invalid.');
        const pixels = d.width * d.height;
        texels += pixels;
        resourcePixels += pixels;
        encoded += raw.bytes.length;
        // Decoded RGBA write/copy plus encoded snapshot/hash/decode passes are
        // charged beside the sole procedural admission owner's work estimate.
        const resourceWork = resourcePixels * 12 + encoded * 8;
        if (admission.estimatedWorkUnits + resourceWork > PORTABLE_MATERIAL_V3_LIMITS.maxWork)
          throw new ProceduralTextureError(
            'Aggregate material work budget exceeded before compilation or decoding.',
          );
        if (
          texels > PORTABLE_MATERIAL_V3_LIMITS.maxTexels ||
          encoded > PORTABLE_MATERIAL_V3_LIMITS.maxEncodedBytes
        )
          throw new ProceduralTextureError(
            'Aggregate resource texel/encoded-byte budget exceeded before decoding.',
          );
        const snapshot = {
          descriptor: structuredClone(d),
          bytes: raw.bytes.slice(),
          userData: structuredClone(raw.userData),
        };
        const header = new DataView(
          snapshot.bytes.buffer,
          snapshot.bytes.byteOffset,
          snapshot.bytes.byteLength,
        );
        if (
          ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => snapshot.bytes[i] === n) ||
          String.fromCharCode(...snapshot.bytes.subarray(12, 16)) !== 'IHDR' ||
          header.getUint32(16) !== d.width ||
          header.getUint32(20) !== d.height
        )
          throw new ProceduralTextureError('Prepared texture PNG/header dimensions mismatch.');
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', snapshot.bytes));
        if (
          `sha256:${Array.from(hash, (x) => x.toString(16).padStart(2, '0')).join('')}` !==
          d.imageSha256
        )
          throw new ProceduralTextureError('Prepared texture encoded hash mismatch.');
        prepared.set(slot, snapshot);
      }
    // Includes held outputs, decoder/copy allowances, encoded snapshots and generated mips.
    const transient =
      admission.conservativePixelAllocationBytes +
      resourcePixels * 12 +
      encoded * 3 +
      Math.ceil((texels * 4) / 3);
    if (transient > PORTABLE_MATERIAL_V3_LIMITS.maxTransientBytes)
      throw new ProceduralTextureError(
        'Aggregate material allocation budget exceeded before decoding.',
      );
    for (const [slot, ref] of entries) {
      options.signal?.throwIfAborted();
      let texture: THREE.DataTexture;
      if (ref.kind === 'procedural') texture = proceduralTexture(ref.spec);
      else {
        const source = prepared.get(slot)!;
        texture = await loadTexture(source.bytes.slice(), {
          usage: source.descriptor.usage,
          name: ref.resourceId,
        });
        owned.set(slot, texture);
        if (
          texture.image.width !== source.descriptor.width ||
          texture.image.height !== source.descriptor.height ||
          !texture.image.data ||
          texture.image.data.length !== source.descriptor.width * source.descriptor.height * 4
        )
          throw new ProceduralTextureError('Prepared texture decoded dimensions mismatch.');
        const actual = texture.userData['kilnTexture'];
        texture.userData = { ...structuredClone(source.userData), ...texture.userData };
        texture.userData['kilnTexture'] = {
          ...(source.userData['kilnTexture'] as Record<string, unknown>),
          ...actual,
        };
      }
      owned.set(slot, texture);
      texture.flipY = false;
      texture.premultiplyAlpha = false;
      applyPortableSamplerV1(texture, ref.sampler);
      texture.userData['kilnPortableBinding'] = {
        schemaVersion: 3,
        slot,
        sampler: { ...ref.sampler },
      };
    }
    options.signal?.throwIfAborted();
    const material = pbrMaterial({
      roughness: spec.roughness,
      metalness: spec.metalness,
      emissiveIntensity: spec.emissiveIntensity,
      alphaMode: spec.alphaMode,
      ...(spec.alphaMode === 'mask' ? { alphaCutoff: spec.alphaCutoff } : {}),
      doubleSided: spec.doubleSided,
      ...(owned.has('baseColor')
        ? { albedo: owned.get('baseColor') }
        : spec.baseColor !== undefined
          ? { albedo: spec.baseColor }
          : {}),
      ...(owned.has('normal') ? { normal: owned.get('normal') } : {}),
      ...(owned.has('metallicRoughness')
        ? { metallicRoughness: owned.get('metallicRoughness') }
        : {}),
      ...(owned.has('emissive')
        ? { emissive: owned.get('emissive') }
        : spec.emissive !== undefined
          ? { emissive: spec.emissive }
          : {}),
      ...(owned.has('occlusion') ? { aoMap: owned.get('occlusion') } : {}),
    });
    if (spec.name) material.name = spec.name;
    if (owned.has('baseColor') && spec.baseColor !== undefined)
      material.color.setHex(spec.baseColor);
    if (owned.has('emissive') && spec.emissive !== undefined)
      material.emissive.setHex(spec.emissive);
    material.userData['kilnPortableMaterial'] = spec;
    return material;
  } catch (error) {
    for (const texture of owned.values()) texture.dispose();
    if (error instanceof PortableMaterialV3Error) throw error;
    const wrapped = new PortableMaterialV3Error(
      error instanceof ProceduralTextureError
        ? error.message
        : 'Texture preparation or compilation failed; verify injected bytes, metadata and cancellation state.',
    );
    wrapped.cause = error;
    throw wrapped;
  }
}
