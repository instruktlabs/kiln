import { derivativeStateKey, registerReviewArtifact } from './derivative-memo';

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
 */

export interface ReviewSceneLease<T extends { root: unknown }> {
  scene: T;
  /** True when the scene was loaded by an earlier call. */
  reused: boolean;
  /** Give the scene back. Idempotent; call it in a `finally`. */
  release(): void;
}

interface Idle<T> {
  scene: T;
  key: string;
  triangles: number;
}

export interface ReviewSceneCache {
  lease<T extends { root: unknown }>(
    artifact: string,
    load: () => Promise<T>,
    triangles: number,
  ): Promise<ReviewSceneLease<T>>;
  stats(): { entries: number; triangles: number; maxEntries: number; maxTriangles: number };
}

export function createReviewSceneCache(
  options: { maxEntries?: number; maxTriangles?: number } = {},
): ReviewSceneCache {
  const maxEntries = options.maxEntries ?? 2;
  const maxTriangles = options.maxTriangles ?? 6_000_000;
  const idle = new Map<string, Idle<{ root: unknown }>>();
  let held = 0;
  const drop = (artifact: string) => {
    const entry = idle.get(artifact);
    if (!entry) return;
    idle.delete(artifact);
    held -= entry.triangles;
  };
  return {
    async lease<T extends { root: unknown }>(
      artifact: string,
      load: () => Promise<T>,
      triangles: number,
    ): Promise<ReviewSceneLease<T>> {
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
        entry = { scene, key: key ?? '', triangles };
        if (key === undefined) {
          // Not describable as data: lend it, but never take it back.
          return { scene, reused: false, release: () => {} };
        }
      }
      const lent = entry;
      let released = false;
      return {
        scene: lent.scene,
        reused,
        release: () => {
          if (released) return;
          released = true;
          if (derivativeStateKey(lent.scene.root, {}) !== lent.key) return;
          if (idle.has(artifact) || lent.triangles > maxTriangles) return;
          while (idle.size >= maxEntries || held + lent.triangles > maxTriangles) {
            const oldest = idle.keys().next().value;
            if (oldest === undefined) break;
            drop(oldest);
          }
          idle.set(artifact, lent);
          held += lent.triangles;
        },
      };
    },
    stats: () => ({ entries: idle.size, triangles: held, maxEntries, maxTriangles }),
  };
}

/** The host's shared review scenes. Keys are artifact hashes, so calls never collide. */
export const reviewSceneCache = createReviewSceneCache();
