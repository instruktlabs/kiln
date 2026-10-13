/**
 * Closed texture/material dependency injected into generated-code evaluation.
 *
 * The trusted host may construct this object around a bounded resource cache.
 * Generated source never receives the object: primitives.ts exposes only two
 * argument-count-checked closures, so source cannot provide caches, paths,
 * URLs, bytes, hashes, deadlines, resolvers, or filesystem handles.
 */
import type * as THREE from 'three';
import type { TextureUsage } from './textures';
import type { PinnedMaterialMapPortV1 } from './pinned-material-map';

export interface PreparedPortableTextureV3 {
  descriptor: {
    resourceId: string;
    usage: TextureUsage;
    allowedSlots: readonly string[];
    colorSpace: 'srgb' | 'linear';
    width: number;
    height: number;
    encodedByteLength: number;
    imageSha256: `sha256:${string}`;
  };
  /** Caller-owned verified PNG bytes, prepared without pixel decoding. */
  bytes: Uint8Array;
  /** Verified provenance only; decoding supplies actual hasAlpha metadata. */
  userData: Record<string, unknown>;
}

import {
  type ApprovedTextureResourceCache,
  DEFAULT_APPROVED_TEXTURE_CACHE,
} from './material-resources';
import { materialRecipe as applyTrustedMaterialRecipe } from './material-recipe-runtime';
import type {
  MaterialRecipeId,
  MaterialRecipeOverridesV1,
  ApprovedTextureResourceId,
} from './material-recipes';

export interface TextureResolver {
  /** Host-only, verified immutable material closure for atlas compilation. */
  pinnedMaterialMaps?: PinnedMaterialMapPortV1;
  /** Host-only metadata used to reject invalid portable slot bindings before loading. */
  describeApprovedTexture?(
    resourceId: unknown,
  ): { usage: TextureUsage; allowedSlots: readonly string[] } | undefined;
  loadApprovedTexture(resourceId: unknown): Promise<THREE.DataTexture>;
  preparePortableTexture?(
    resourceId: unknown,
    context?: { signal?: AbortSignal },
  ): Promise<PreparedPortableTextureV3>;
  materialRecipe(id: unknown, overrides?: unknown): Promise<THREE.MeshStandardMaterial>;
}

export function createTextureResolver(
  cache: ApprovedTextureResourceCache = DEFAULT_APPROVED_TEXTURE_CACHE,
): TextureResolver {
  return Object.freeze({
    describeApprovedTexture(resourceId: unknown) {
      if (typeof resourceId !== 'string') return undefined;
      try {
        return cache.descriptor(resourceId as ApprovedTextureResourceId);
      } catch {
        return undefined;
      }
    },
    async loadApprovedTexture(resourceId: unknown): Promise<THREE.DataTexture> {
      if (typeof resourceId !== 'string') {
        throw new RangeError('Unsupported approved texture resource ID.');
      }
      return (await cache.load(resourceId as ApprovedTextureResourceId)).texture;
    },
    async preparePortableTexture(
      resourceId: unknown,
      context?: { signal?: AbortSignal },
    ): Promise<PreparedPortableTextureV3> {
      context?.signal?.throwIfAborted();
      if (typeof resourceId !== 'string')
        throw new RangeError('Unsupported approved texture resource ID.');
      const resolved = await cache.resolveAsync(resourceId as ApprovedTextureResourceId);
      context?.signal?.throwIfAborted();
      // resolveAsync already verifies closed ID, length, hash and bounded PNG IHDR.
      const header = new DataView(
        resolved.bytes.buffer,
        resolved.bytes.byteOffset,
        resolved.bytes.byteLength,
      );
      return {
        descriptor: {
          resourceId,
          usage: resolved.provenance.usage,
          allowedSlots: [...resolved.descriptor.allowedSlots],
          colorSpace: resolved.provenance.colorSpace,
          width: header.getUint32(16),
          height: header.getUint32(20),
          encodedByteLength: resolved.bytes.length,
          imageSha256: `sha256:${resolved.provenance.contentHash}`,
        },
        // resolveAsync already returns a caller-owned copy, never cached bytes.
        bytes: resolved.bytes,
        userData: { kilnTexture: { approvedResource: structuredClone(resolved.provenance) } },
      };
    },
    async materialRecipe(id: unknown, overrides?: unknown): Promise<THREE.MeshStandardMaterial> {
      if (typeof id !== 'string') throw new TypeError('materialRecipe id must be a string');
      return applyTrustedMaterialRecipe(
        id as MaterialRecipeId,
        overrides as MaterialRecipeOverridesV1 | undefined,
        { cache },
      );
    },
  });
}

export const DEFAULT_TEXTURE_RESOLVER: TextureResolver = createTextureResolver();
