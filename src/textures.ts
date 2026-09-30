/**
 * Kiln texture loading + PBR material — Wave 3B
 *
 * Loads image files (PNG/JPG/WebP) into Three.js Textures suitable for
 * MeshStandardMaterial slots (albedo / normal / roughness / metalness /
 * emissive). Works in Node via sharp (already a dep); the original
 * encoded bytes are stashed on `texture.userData.encoded` so the GLB
 * bridge can re-serialize without re-encoding.
 */

import * as THREE from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import type { TextureUsage } from './texture-contract';
export { TEXTURE_USAGES, type TextureUsage } from './texture-contract';

export type TextureSource = string | Buffer | Uint8Array;

export interface TextureLoadOptions {
  /** glTF material slot this image will occupy. Defaults to albedo for compatibility. */
  usage?: TextureUsage;
  /** Optional stable texture name used by QA/provenance. */
  name?: string;
}

export interface EncodedTextureData {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
}

export interface KilnTextureMetadata {
  usage: TextureUsage;
  colorSpace: 'srgb' | 'linear';
  width: number;
  height: number;
  hasAlpha: boolean;
}

/**
 * Load an image into a Three.js Texture. Accepts a file path, a Buffer,
 * or a Uint8Array of encoded bytes.
 *
 * The returned texture has:
 *   - a decoded RGBA DataTexture (for runtime preview in the editor)
 *   - `userData.encoded = { mime, bytes }` — original encoded bytes, used
 *     by the GLB bridge so we don't re-encode PNG on every export.
 *
 * @example
 * const wood = await loadTexture(hostSuppliedPngBytes, { usage: 'albedo', name: 'Oak' });
 * const barrel = new THREE.Mesh(unwrapped, pbrMaterial({ albedo: wood }));
 */
export async function loadTexture(
  source: TextureSource,
  opts: TextureLoadOptions = {},
): Promise<THREE.DataTexture> {
  let bytes: Uint8Array;
  if (typeof source === 'string') {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const abs = path.isAbsolute(source) ? source : path.resolve(source);
    bytes = new Uint8Array(fs.readFileSync(abs));
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(source)) {
    bytes = new Uint8Array(source);
  } else {
    bytes = source;
  }

  const mime = sniffMime(bytes);
  const sharp = (await import('sharp')).default;

  // Decode to RGBA via sharp so we have a live Texture for editor preview
  // and for any client-side work (projection baking, normal-map inspect).
  const img = sharp(bytes);
  const meta = await img.metadata();
  const { data } = await img
    .ensureAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });

  if (!meta.width || !meta.height) {
    throw new Error('loadTexture: could not read image dimensions');
  }

  const tex = new THREE.DataTexture(
    new Uint8Array(data),
    meta.width,
    meta.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  const usage = opts.usage ?? 'albedo';
  const colorSpace = usage === 'albedo' || usage === 'emissive' ? 'srgb' : 'linear';
  let hasAlpha = false;
  for (let offset = 3; offset < data.length; offset += 4) {
    if ((data[offset] ?? 255) < 255) {
      hasAlpha = true;
      break;
    }
  }
  tex.colorSpace = colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (opts.name) tex.name = opts.name;
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  (tex.userData as Record<string, unknown>)['encoded'] = {
    mime,
    bytes,
  } satisfies EncodedTextureData;
  (tex.userData as Record<string, unknown>)['kilnTexture'] = {
    usage,
    colorSpace,
    width: meta.width,
    height: meta.height,
    // `sharp.metadata().hasAlpha` only means that an alpha channel exists. QA
    // needs the stronger signal: at least one pixel is actually translucent.
    hasAlpha,
  } satisfies KilnTextureMetadata;

  return tex;
}

function sniffMime(bytes: Uint8Array): EncodedTextureData['mime'] {
  // PNG magic: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG magic: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP magic: "RIFF????WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // Default to PNG — safe for sharp to re-encode if ever needed.
  return 'image/png';
}

// =============================================================================
// PBR material primitive
// =============================================================================

export interface PbrMaterialOptions {
  /** Base color — either a hex color or a Texture (albedo map). */
  albedo?: number | string | THREE.Texture;
  /** Normal map Texture. */
  normal?: THREE.Texture;
  /** Roughness scalar [0,1], or the same packed texture supplied for metalness. */
  roughness?: number | THREE.Texture;
  /** Metalness scalar [0,1], or the same packed texture supplied for roughness. */
  metalness?: number | THREE.Texture;
  /** Explicit glTF metallic-roughness texture: G=roughness, B=metalness. */
  metallicRoughness?: THREE.Texture;
  /** Emissive: hex color or Texture. */
  emissive?: number | string | THREE.Texture;
  /** Emissive intensity multiplier. */
  emissiveIntensity?: number;
  /** Ambient occlusion map Texture (R channel). */
  aoMap?: THREE.Texture;
  /** AO intensity [0,1]. Default 1. */
  aoMapIntensity?: number;
  /** Portable glTF alpha mode. Defaults to opaque. */
  alphaMode?: 'opaque' | 'mask' | 'blend';
  /** Alpha cutoff for mask mode. Defaults to 0.5; invalid outside [0,1]. */
  alphaCutoff?: number;
  /** Render both sides of the surface. Defaults false. */
  doubleSided?: boolean;
}

function textureMetadata(texture: THREE.Texture): KilnTextureMetadata | undefined {
  return (texture.userData as Record<string, unknown>)['kilnTexture'] as
    | KilnTextureMetadata
    | undefined;
}

function requireTextureUsage(texture: THREE.Texture, usage: TextureUsage): void {
  const meta = textureMetadata(texture);
  if (meta && meta.usage !== usage) {
    throw new TypeError(
      `Texture ${JSON.stringify(texture.name || '(unnamed)')} was loaded for ${meta.usage}, not ${usage}.`,
    );
  }
  texture.colorSpace =
    usage === 'albedo' || usage === 'emissive' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
}

/**
 * Full PBR material. Any of the slots can be a Texture or a scalar/color.
 * Maps to MeshStandardMaterial and exports as glTF pbrMetallicRoughness.
 *
 * @example
 * const wood = proceduralTexture({
 *   schemaVersion: 2,
 *   usage: 'albedo',
 *   layers: [{ op: 'noise', colorA: 0x4f301c, colorB: 0x9a6b3e, scale: 8, seed: 4 }],
 * });
 * const crate = pbrMaterial({ albedo: wood, roughness: 0.85, metalness: 0 });
 */
export function pbrMaterial(opts: PbrMaterialOptions = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial();

  // Duck-typed `.isTexture` — sandbox-created textures may belong to a
  // different module realm. See render.ts cross-module-THREE comment.
  const isTex = (v: unknown): v is THREE.Texture =>
    !!(v as { isTexture?: boolean } | null)?.isTexture;

  if (isTex(opts.albedo)) {
    requireTextureUsage(opts.albedo, 'albedo');
    mat.map = opts.albedo;
    mat.color = new THREE.Color(0xffffff);
  } else if (opts.albedo !== undefined) {
    mat.color = new THREE.Color(opts.albedo as number | string);
  }

  if (opts.normal) {
    requireTextureUsage(opts.normal, 'normal');
    mat.normalMap = opts.normal;
  }

  const roughnessTexture = isTex(opts.roughness) ? opts.roughness : undefined;
  const metalnessTexture = isTex(opts.metalness) ? opts.metalness : undefined;
  if (opts.metallicRoughness && (roughnessTexture || metalnessTexture)) {
    throw new AuthoringDiagnosticError(
      'MATERIAL_PACKED_CHANNELS',
      'Use metallicRoughness for the packed G/B map; do not also pass texture-valued roughness/metalness.',
    );
  }
  if (roughnessTexture && metalnessTexture && roughnessTexture !== metalnessTexture) {
    throw new AuthoringDiagnosticError(
      'MATERIAL_PACKED_CHANNELS',
      'Separate roughness and metalness textures are ambiguous in glTF. Pack G=roughness/B=metalness and pass metallicRoughness.',
    );
  }
  if ((roughnessTexture && !metalnessTexture) || (!roughnessTexture && metalnessTexture)) {
    throw new AuthoringDiagnosticError(
      'MATERIAL_PACKED_CHANNELS',
      'A texture-valued roughness or metalness must be the same packed G/B texture in both slots, or use metallicRoughness.',
    );
  }
  const packedMr = opts.metallicRoughness ?? roughnessTexture;
  if (packedMr) {
    requireTextureUsage(packedMr, 'metallicRoughness');
    mat.roughnessMap = packedMr;
    mat.metalnessMap = packedMr;
  }

  if (typeof opts.roughness === 'number') {
    mat.roughness = opts.roughness as number;
  } else if (packedMr) {
    mat.roughness = 1;
  } else {
    mat.roughness = 0.8;
  }

  if (typeof opts.metalness === 'number') {
    mat.metalness = opts.metalness as number;
  } else if (packedMr) {
    mat.metalness = 1;
  }

  if (isTex(opts.emissive)) {
    requireTextureUsage(opts.emissive, 'emissive');
    mat.emissiveMap = opts.emissive;
    mat.emissive = new THREE.Color(0xffffff);
  } else if (opts.emissive !== undefined) {
    mat.emissive = new THREE.Color(opts.emissive as number | string);
  }
  if (opts.emissiveIntensity !== undefined) {
    mat.emissiveIntensity = opts.emissiveIntensity;
  }

  if (opts.aoMap) {
    requireTextureUsage(opts.aoMap, 'occlusion');
    mat.aoMap = opts.aoMap;
  }
  if (opts.aoMapIntensity !== undefined) mat.aoMapIntensity = opts.aoMapIntensity;

  const alphaMode = opts.alphaMode ?? 'opaque';
  if (alphaMode !== 'opaque' && alphaMode !== 'mask' && alphaMode !== 'blend') {
    throw new AuthoringDiagnosticError(
      'MATERIAL_ALPHA_MODE',
      'alphaMode must be one of "opaque", "mask", or "blend".',
    );
  }
  if (opts.doubleSided !== undefined && typeof opts.doubleSided !== 'boolean') {
    throw new TypeError('doubleSided must be a boolean when provided.');
  }
  if (opts.alphaCutoff !== undefined && alphaMode !== 'mask') {
    throw new TypeError('alphaCutoff is valid only when alphaMode is "mask".');
  }
  if (
    opts.alphaCutoff !== undefined &&
    (!Number.isFinite(opts.alphaCutoff) || opts.alphaCutoff < 0 || opts.alphaCutoff > 1)
  ) {
    throw new RangeError('alphaCutoff must be a finite number in [0,1].');
  }
  if (alphaMode === 'mask') {
    mat.alphaTest = opts.alphaCutoff ?? 0.5;
    mat.transparent = false;
  } else if (alphaMode === 'blend') {
    mat.alphaTest = 0;
    mat.transparent = true;
  }
  if (opts.doubleSided) mat.side = THREE.DoubleSide;
  (mat.userData as Record<string, unknown>)['kilnMaterial'] = {
    alphaMode,
    ...(alphaMode === 'mask' ? { alphaCutoff: mat.alphaTest } : {}),
    doubleSided: opts.doubleSided === true,
  };

  return mat;
}

export interface FoliageMaterialOptions {
  alphaCutoff?: number;
  roughness?: number;
  doubleSided?: boolean;
}

/** Portable foliage material: glTF MASK + cutoff + double-sided by default. */
export function foliageMaterial(
  albedo: number | string | THREE.Texture,
  opts: FoliageMaterialOptions = {},
): THREE.MeshStandardMaterial {
  return pbrMaterial({
    albedo,
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    alphaMode: 'mask',
    alphaCutoff: opts.alphaCutoff ?? 0.5,
    doubleSided: opts.doubleSided ?? true,
  });
}
