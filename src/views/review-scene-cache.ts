import type { BufferAttribute, InterleavedBufferAttribute, Mesh, Object3D, Texture } from 'three';
import { derivativeStateKey, registerReviewArtifact } from './derivative-memo';
import { reviewLodChains } from './lod';

/**
 * The host loads a review scene from the artifact's GLB on every kiln_render, kiln_inspect,
 * kiln_screenshot_animation and kiln_view_interior call, even when the build cache hands back the
 * same bytes. On a large asset that load is the largest part of a call that renders nothing new.
 * This cache lends a loaded scene to one call at a time and takes it back afterwards.
 *
 * A lease is exclusive. A scene on lease is never lent to a second call; a call that finds its
 * artifact's scene out loads its own copy, so calls never wait on each other and never see
 * another call's isolation, hidden parts, level-of-detail swap or pose. On release the scene's
 * state key (views/derivative-memo.ts) must equal the one taken when it was loaded. A scene that
 * comes back with anything changed, added or posed is dropped, never lent again.
 *
 * Idle scenes are bounded by count, triangles and the bytes they hold (attribute and index arrays
 * and encoded textures, lower levels of detail included), and an idle scene no call has asked
 * for in `maxIdleLeases` leases is dropped. The lifetime is counted in calls, never timed.
 * `clear()` drops every idle scene.
 */

export interface ReviewSceneLease<T extends { root: unknown }> {
  scene: T;
  /** True when the scene was loaded by an earlier call. Its top-level arrays are this lease's copies. */
  reused: boolean;
  /** Give the scene back. Idempotent; call it in a `finally`. */
  release(): void;
}

interface Idle<T> {
  scene: T;
  key: string;
  triangles: number;
  bytes: number;
  /** The lease count when a call last had this scene. */
  used: number;
}

/** Bytes a loaded scene holds: attribute, index and instance arrays and encoded textures. */
export function reviewSceneBytes(root: unknown): number {
  const seen = new Set<object>();
  let bytes = 0;
  const add = (owner: object, length: number | undefined) => {
    if (seen.has(owner)) return;
    seen.add(owner);
    bytes += length ?? 0;
  };
  const attribute = (value: BufferAttribute | InterleavedBufferAttribute) =>
    (value as InterleavedBufferAttribute).isInterleavedBufferAttribute
      ? add(
          (value as InterleavedBufferAttribute).data,
          (value as InterleavedBufferAttribute).data.array.byteLength,
        )
      : add(value, (value as BufferAttribute).array.byteLength);
  const visit = (node: Object3D) => {
    const mesh = node as Mesh & {
      instanceMatrix?: BufferAttribute;
      instanceColor?: BufferAttribute | null;
    };
    const geometry = mesh.geometry;
    if (geometry) {
      for (const value of Object.values(geometry.attributes)) attribute(value);
      for (const list of Object.values(
        geometry.morphAttributes as Record<
          string,
          Array<BufferAttribute | InterleavedBufferAttribute>
        >,
      ))
        for (const value of list) attribute(value);
      if (geometry.index) attribute(geometry.index);
    }
    if (mesh.instanceMatrix) attribute(mesh.instanceMatrix);
    if (mesh.instanceColor) attribute(mesh.instanceColor);
    if (mesh.material)
      for (const material of [mesh.material].flat())
        for (const value of Object.values(material))
          if ((value as Texture | null)?.isTexture) {
            const encoded = (value as Texture).userData?.encoded as
              | { byteLength?: number }
              | undefined;
            add(value as Texture, encoded?.byteLength);
          }
  };
  (root as Object3D).traverse(visit);
  for (const chain of reviewLodChains(root))
    for (const member of [chain.base, ...chain.levels])
      if (member.parent === null) member.traverse(visit);
  return bytes;
}

/** A lease's own top-level arrays (reason codes, clips): the scene's objects stay shared. */
function lend<T extends object>(scene: T): T {
  const copy = { ...scene } as Record<string, unknown>;
  for (const [name, value] of Object.entries(copy))
    if (Array.isArray(value)) copy[name] = [...value];
  return copy as T;
}

export interface ReviewSceneCache {
  lease<T extends { root: unknown }>(
    artifact: string,
    load: () => Promise<T>,
    triangles: number,
  ): Promise<ReviewSceneLease<T>>;
  stats(): {
    entries: number;
    triangles: number;
    bytes: number;
    maxEntries: number;
    maxTriangles: number;
    maxBytes: number;
  };
  /** Drop every idle scene. Scenes on lease are unaffected and are not taken back. */
  clear(): void;
}

export function createReviewSceneCache(
  options: {
    maxEntries?: number;
    maxTriangles?: number;
    maxBytes?: number;
    maxIdleLeases?: number;
  } = {},
): ReviewSceneCache {
  const maxEntries = options.maxEntries ?? 2;
  const maxTriangles = options.maxTriangles ?? 6_000_000;
  // The 2,635,224-triangle cathedral holds 136 MB, its GLB 15 MB: one such scene fits.
  const maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
  const maxIdleLeases = options.maxIdleLeases ?? 32;
  const idle = new Map<string, Idle<{ root: unknown }>>();
  let held = 0;
  let heldBytes = 0;
  let leases = 0;
  let generation = 0;
  const drop = (artifact: string) => {
    const entry = idle.get(artifact);
    if (!entry) return;
    idle.delete(artifact);
    held -= entry.triangles;
    heldBytes -= entry.bytes;
  };
  return {
    async lease<T extends { root: unknown }>(
      artifact: string,
      load: () => Promise<T>,
      triangles: number,
    ): Promise<ReviewSceneLease<T>> {
      leases++;
      for (const [other, value] of [...idle])
        if (other !== artifact && leases - value.used > maxIdleLeases) drop(other);
      let entry = idle.get(artifact) as Idle<T> | undefined;
      let reused = false;
      if (entry) {
        // Only ever put back unchanged (see `release`), and nothing touches an idle scene.
        drop(artifact);
        reused = true;
      }
      if (!entry) {
        const scene = await load();
        registerReviewArtifact(scene.root, artifact);
        const key = derivativeStateKey(scene.root, {});
        entry = { scene, key: key ?? '', triangles, bytes: 0, used: leases };
        if (key === undefined) {
          // Not describable as data: lend it, but never take it back.
          return { scene, reused: false, release: () => {} };
        }
        entry.bytes = reviewSceneBytes(scene.root);
      }
      const lent = entry;
      const leasedIn = generation;
      let released = false;
      return {
        scene: lend(lent.scene),
        reused,
        release: () => {
          if (released) return;
          released = true;
          if (leasedIn !== generation) return;
          if (derivativeStateKey(lent.scene.root, {}) !== lent.key) return;
          if (idle.has(artifact) || lent.triangles > maxTriangles || lent.bytes > maxBytes) return;
          while (
            idle.size >= maxEntries ||
            held + lent.triangles > maxTriangles ||
            heldBytes + lent.bytes > maxBytes
          ) {
            const oldest = idle.keys().next().value;
            if (oldest === undefined) break;
            drop(oldest);
          }
          lent.used = leases;
          idle.set(artifact, lent);
          held += lent.triangles;
          heldBytes += lent.bytes;
        },
      };
    },
    stats: () => ({
      entries: idle.size,
      triangles: held,
      bytes: heldBytes,
      maxEntries,
      maxTriangles,
      maxBytes,
    }),
    clear: () => {
      generation++;
      for (const artifact of [...idle.keys()]) drop(artifact);
    },
  };
}

/** The host's shared review scenes. Keys are artifact hashes, so calls never collide. */
export const reviewSceneCache = createReviewSceneCache();
