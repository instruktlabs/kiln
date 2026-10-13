/**
 * Model-authored procedural textures — T2.2
 *
 * ## Why a declarative spec and not a callback
 *
 * The obvious API is "give me a function and I will call it per pixel". It is
 * rejected here for the same reason `material-recipes.ts` resolves texture
 * slots through a closed approved-ID registry: the author of this code is an
 * untrusted model. A callback is arbitrary code with arbitrary cost and no
 * reviewable record of what it drew. A declarative layer stack is bounded
 * before a single pixel is written, recorded verbatim in provenance, and
 * reproducible from the manifest alone.
 *
 * Procedural content also sidesteps the licensing problem entirely: pixels
 * computed from numbers have no third-party provenance to track, unlike the
 * curated tiling library T2.1 has to license and ship.
 *
 * ## Determinism
 *
 * Every generator is a pure function of the spec. Noise uses an integer hash of
 * the lattice coordinate plus the seed — never `Math.random()`, which would
 * make the same asset code produce different bytes on every generation and
 * break the byte-identity fixtures the repo pins.
 *
 * Noise is also **tileable**: the lattice wraps at the cell period, so a
 * texture sampled with `RepeatWrapping` (which is what the loader sets, and
 * what a tiling material wants) does not show a seam where the pattern
 * restarts. Non-tiling noise is the usual reason a procedural material looks
 * fine on a test cube and obviously wrong on a wall.
 *
 * ## Color space
 *
 * Unlike `texture-bake.ts` — which must never guess, because it is handed
 * finished pixels whose meaning it cannot know — this function is told the
 * usage up front and therefore sets `colorSpace` itself, exactly as
 * approved texture loading does. Getting it wrong here is an authoring error the QA gate
 * still catches.
 */

import * as THREE from 'three';
import { compileProceduralTextureSpecV2 } from './procedural-texture-v2-compiler';
import { compileProceduralTextureSpecV3 } from './procedural-texture-v3';
import type { ProceduralTextureSpecV3 } from './procedural-texture-v3';
import {
  type ProceduralTextureSpec as LegacyProceduralTextureSpec,
  ProceduralTextureError,
} from './procedural-material-v2';

export {
  MAX_NOISE_OCTAVES,
  MAX_PORTABLE_MATERIAL_TEXELS,
  MAX_PORTABLE_MATERIAL_TEXTURES,
  MAX_PROCEDURAL_LAYERS,
  MAX_PROCEDURAL_NAME_LENGTH,
  MAX_PROCEDURAL_PATTERN_COUNT,
  MAX_PROCEDURAL_SIZE,
  MIN_PROCEDURAL_SIZE,
  PORTABLE_MATERIAL_SPEC_VERSION,
  PROCEDURAL_TEXTURE_SPEC_VERSION,
  ProceduralTextureError,
  canonicalProceduralTextureJsonV2,
  canonicalizePortableMaterialSpecV2,
  canonicalizeProceduralTextureSpecV2,
  hashProceduralTextureSpecV2,
  migrateProceduralTextureSpecV1,
} from './procedural-material-v2';
export type {
  CanonicalPortableMaterialSpecV2,
  CanonicalPortableTextureRefV2,
  CanonicalProceduralLayerV2,
  CanonicalProceduralTextureSpecV2,
  PortableMaterialSpecV2,
  PortableTextureRefV2,
  ProceduralBlend,
  ProceduralLayer,
  ProceduralTextureSpecV1,
  ProceduralTextureSpecV2,
} from './procedural-material-v2';

export * from './procedural-texture-v3';
export type ProceduralTextureSpec = LegacyProceduralTextureSpec | ProceduralTextureSpecV3;

/** Dispatch never invokes an input accessor; absent/undefined retains V1 compatibility. */
export function proceduralTextureSchemaVersion(input: unknown): 1 | 2 | 3 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ProceduralTextureError(
      'proceduralTexture requires a plain JSON object.',
      'PROCEDURAL_TEXTURE_V3_CONTRACT',
    );
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    throw new ProceduralTextureError(
      'proceduralTexture requires a plain JSON object.',
      'PROCEDURAL_TEXTURE_V3_CONTRACT',
    );
  const descriptor = Object.getOwnPropertyDescriptor(input, 'schemaVersion');
  if (descriptor && (!descriptor.enumerable || !('value' in descriptor)))
    throw new ProceduralTextureError(
      'proceduralTexture.schemaVersion must be a JSON data field.',
      'PROCEDURAL_TEXTURE_V3_CONTRACT',
    );
  const version: unknown = descriptor?.value;
  if (version === undefined || version === 1) return 1;
  if (version === 2 || version === 3) return version;
  throw new ProceduralTextureError(
    'proceduralTexture.schemaVersion must be 1, 2 or 3.',
    'PROCEDURAL_TEXTURE_V3_CONTRACT',
  );
}

export { compileProceduralTextureSpecV2 } from './procedural-texture-v2-compiler';
export type { CompiledProceduralTextureV2 } from './procedural-texture-v2-compiler';

export function proceduralTexture(spec: ProceduralTextureSpec): THREE.DataTexture {
  if (proceduralTextureSchemaVersion(spec) === 3) {
    const compiled = compileProceduralTextureSpecV3(spec);
    const { width, height, usage, name } = compiled.spec;
    const tex = new THREE.DataTexture(
      compiled.pixels,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    if (name) tex.name = name;
    tex.colorSpace =
      usage === 'albedo' || usage === 'emissive' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    tex.userData['kilnProcedural'] = {
      ...compiled.spec,
      canonicalJson: compiled.canonicalJson,
      recipeHash: compiled.recipeHash,
      compilerId: compiled.compilerId,
    };
    return tex;
  }
  const compiled = compileProceduralTextureSpecV2(spec);
  const { size, usage, name, layers } = compiled.spec;

  const tex = new THREE.DataTexture(
    compiled.pixels,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  if (name) tex.name = name;
  tex.colorSpace =
    usage === 'albedo' || usage === 'emissive' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  // Recorded so the manifest says what was generated, not merely that something
  // was. The spec is small, serializable, and enough to reproduce the bytes.
  (tex.userData as Record<string, unknown>)['kilnProcedural'] = {
    schemaVersion: 2,
    size,
    usage,
    ...(name ? { name } : {}),
    layers,
    canonicalJson: compiled.canonicalJson,
    recipeHash: compiled.recipeHash,
  };

  return tex;
}

/**
 * Derive a tangent-space normal map from the luminance of another texture.
 *
 * This is the cheap way to get PBR surface detail out of a procedural albedo:
 * treat brightness as height and take its gradient. Sampling wraps, so a
 * tiling source yields a tiling normal map.
 *
 * The output is linear data, never sRGB — a normal map holds vectors, not
 * color, and tagging it sRGB is the single most common way to get PBR lighting
 * subtly wrong.
 *
 * @param source Any texture with readable 8-bit RGB/RGBA pixels.
 * @param opts.strength Height scale. 1 is subtle; 4-8 reads clearly. Default 2.
 */
export function normalMapFromHeight(
  source: THREE.Texture,
  opts: { strength?: number; name?: string } = {},
): THREE.DataTexture {
  const image = source.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  const data = image?.data;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!data || !width || !height) {
    throw new ProceduralTextureError(
      'normalMapFromHeight: the source texture has no readable pixels. Pass a proceduralTexture() result or a loadApprovedTexture() result, not a texture built from an image element.',
    );
  }
  const channels = data.length / (width * height);
  if (channels !== 3 && channels !== 4) {
    throw new ProceduralTextureError(
      `normalMapFromHeight: the source has ${data.length} bytes for ${width}x${height}, which is neither RGB nor RGBA.`,
    );
  }

  const strength = opts.strength ?? 2;
  if (!Number.isFinite(strength) || strength <= 0) {
    throw new ProceduralTextureError(
      `normalMapFromHeight: strength must be a positive number, got ${JSON.stringify(opts.strength)}.`,
    );
  }

  const lum = (x: number, y: number): number => {
    const xw = ((x % width) + width) % width;
    const yw = ((y % height) + height) % height;
    const o = (yw * width + xw) * channels;
    // Rec. 601 luma — matches how the eye reads the albedo this is derived from.
    return (0.299 * (data[o] ?? 0) + 0.587 * (data[o + 1] ?? 0) + 0.114 * (data[o + 2] ?? 0)) / 255;
  };

  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Central differences; the wrap in `lum` is what keeps the edges seamless.
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      // Gradient of a height field gives the surface normal as (-dx, -dy, 1).
      let nx = -dx;
      let ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const o = (y * width + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
      out[o + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = opts.name ?? (source.name ? `${source.name}_Normal` : '');
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
