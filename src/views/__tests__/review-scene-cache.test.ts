import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../../render';
import { loadGlbReviewScene } from '../glb';
import { registerReviewLodChains } from '../lod';
import { createReviewSceneCache, reviewSceneBytes } from '../review-scene-cache';

async function fixtureBytes(color = '#cc3333'): Promise<Uint8Array> {
  const root = new THREE.Group();
  root.name = 'Root';
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color }),
  );
  box.name = 'Box';
  root.add(box);
  return Uint8Array.from(
    (await renderSceneToGLB(root, { derivative: true, gltfExporter: 'three' })).bytes,
  );
}

function counted(bytes: Uint8Array) {
  const loader = {
    loads: 0,
    load: async () => {
      loader.loads++;
      return loadGlbReviewScene(bytes);
    },
  };
  return loader;
}

const box = (root: unknown) => (root as THREE.Object3D).getObjectByName('Box')!;

describe('review scene cache', () => {
  test('a released scene is lent again for the same artifact', async () => {
    const cache = createReviewSceneCache();
    const loader = counted(await fixtureBytes());
    const first = await cache.lease('sha256:a', loader.load, 12);
    expect(first.reused).toBe(false);
    first.release();
    const second = await cache.lease('sha256:a', loader.load, 12);
    expect(second.reused).toBe(true);
    expect(second.scene.root).toBe(first.scene.root);
    expect(loader.loads).toBe(1);
    second.release();
  });

  test('a scene on lease is never lent twice: a concurrent call loads its own', async () => {
    const cache = createReviewSceneCache();
    const loader = counted(await fixtureBytes());
    const first = await cache.lease('sha256:a', loader.load, 12);
    const second = await cache.lease('sha256:a', loader.load, 12);
    expect(second.scene).not.toBe(first.scene);
    expect(loader.loads).toBe(2);
    first.release();
    second.release();
    // One idle copy per artifact is kept.
    expect(cache.stats().entries).toBe(1);
  });

  test('a scene returned changed is dropped, not lent again', async () => {
    const cache = createReviewSceneCache();
    const loader = counted(await fixtureBytes());
    const changes: Array<(root: unknown) => void> = [
      (root) => {
        box(root).visible = false;
      },
      (root) => {
        box(root).position.x = 3;
      },
      (root) => {
        (root as THREE.Object3D).add(new THREE.Group());
      },
      (root) => {
        let mesh: THREE.Mesh | undefined;
        (root as THREE.Object3D).traverse((node) => {
          if ((node as THREE.Mesh).isMesh) mesh ??= node as THREE.Mesh;
        });
        mesh!.geometry.getAttribute('position').needsUpdate = true;
      },
      (root) => {
        let mesh: THREE.Mesh | undefined;
        (root as THREE.Object3D).traverse((node) => {
          if ((node as THREE.Mesh).isMesh) mesh ??= node as THREE.Mesh;
        });
        (mesh!.material as THREE.MeshStandardMaterial).color.set('#00ff00');
      },
    ];
    for (const change of changes) {
      const lease = await cache.lease('sha256:a', loader.load, 12);
      change(lease.scene.root);
      lease.release();
      expect(cache.stats().entries).toBe(0);
    }
    expect(loader.loads).toBe(changes.length);
  });

  test('releasing twice is harmless and other artifacts get their own scene', async () => {
    const cache = createReviewSceneCache();
    const a = counted(await fixtureBytes());
    const b = counted(await fixtureBytes('#3333cc'));
    const lease = await cache.lease('sha256:a', a.load, 12);
    lease.release();
    lease.release();
    const other = await cache.lease('sha256:b', b.load, 12);
    expect(other.reused).toBe(false);
    other.release();
    expect(cache.stats().entries).toBe(2);
  });

  test('idle scenes stay within the entry and triangle budgets, oldest out first', async () => {
    const cache = createReviewSceneCache({ maxEntries: 2, maxTriangles: 30 });
    const bytes = await fixtureBytes();
    for (const artifact of ['sha256:a', 'sha256:b', 'sha256:c']) {
      const lease = await cache.lease(artifact, counted(bytes).load, 12);
      lease.release();
    }
    expect(cache.stats()).toMatchObject({ entries: 2, triangles: 24 });
    const oldest = counted(bytes);
    (await cache.lease('sha256:a', oldest.load, 12)).release();
    expect(oldest.loads).toBe(1);
    const kept = counted(bytes);
    (await cache.lease('sha256:c', kept.load, 12)).release();
    expect(kept.loads).toBe(0);
    // A scene larger than the whole budget is never kept.
    (await cache.lease('sha256:huge', counted(bytes).load, 31)).release();
    expect(cache.stats().triangles).toBeLessThanOrEqual(30);
    expect((await cache.lease('sha256:huge', counted(bytes).load, 31)).reused).toBe(false);
  });

  test('a lease gets its own arrays; the scene objects are shared', async () => {
    const cache = createReviewSceneCache();
    const loader = counted(await fixtureBytes());
    const first = await cache.lease('sha256:a', loader.load, 12);
    const codes = first.scene.reasonCodes as string[];
    first.release();
    codes.push('GLB_FLAT_PARSE_FAILED');
    const second = await cache.lease('sha256:a', loader.load, 12);
    expect(second.reused).toBe(true);
    expect(second.scene.reasonCodes).not.toContain('GLB_FLAT_PARSE_FAILED');
    (second.scene.reasonCodes as string[]).push('GLB_FLAT_PARSE_FAILED');
    second.release();
    const third = await cache.lease('sha256:a', loader.load, 12);
    expect(third.scene.reasonCodes).not.toContain('GLB_FLAT_PARSE_FAILED');
    third.release();
  });

  test('idle scenes stay within a byte budget measured off the scene', async () => {
    const bytes = await fixtureBytes();
    const one = reviewSceneBytes((await loadGlbReviewScene(bytes)).root);
    expect(one).toBeGreaterThan(0);
    const cache = createReviewSceneCache({ maxEntries: 4, maxBytes: one * 2 });
    for (const artifact of ['sha256:a', 'sha256:b', 'sha256:c'])
      (await cache.lease(artifact, counted(bytes).load, 1)).release();
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: one * 2 });
    const small = createReviewSceneCache({ maxBytes: one - 1 });
    (await small.lease('sha256:a', counted(bytes).load, 1)).release();
    expect(small.stats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  test('an idle scene no call asks for is dropped after maxIdleLeases leases, and clear drops all', async () => {
    const bytes = await fixtureBytes();
    const cache = createReviewSceneCache({ maxEntries: 4, maxIdleLeases: 2 });
    (await cache.lease('sha256:a', counted(bytes).load, 1)).release();
    for (const other of ['sha256:b', 'sha256:b'])
      (await cache.lease(other, counted(bytes).load, 1)).release();
    expect(cache.stats().entries).toBe(2);
    (await cache.lease('sha256:b', counted(bytes).load, 1)).release();
    // `a` was last used three leases ago.
    expect(cache.stats().entries).toBe(1);
    const lent = await cache.lease('sha256:c', counted(bytes).load, 1);
    cache.clear();
    expect(cache.stats()).toMatchObject({ entries: 0, triangles: 0, bytes: 0 });
    lent.release();
    expect(cache.stats().entries).toBe(0);
  });

  test('a lower level of detail left drawn, or a level set aside that changed, drops the scene', async () => {
    const cache = createReviewSceneCache();
    const bytes = await fixtureBytes();
    const withLevel = async () => {
      const loaded = await loadGlbReviewScene(bytes);
      const base = box(loaded.root);
      const level = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial(),
      );
      level.name = 'Box_LOD1';
      registerReviewLodChains(loaded.root as THREE.Object3D, [{ base, levels: [level] }]);
      return loaded;
    };
    // Unchanged: lent again.
    const kept = await cache.lease('sha256:lod', withLevel, 12);
    kept.release();
    expect(cache.stats().entries).toBe(1);
    // A swap left in place.
    const swapped = await cache.lease('sha256:lod', withLevel, 12);
    expect(swapped.reused).toBe(true);
    const base = box(swapped.scene.root);
    const parent = base.parent!;
    const chainLevel = (await import('../lod')).reviewLodChains(swapped.scene.root)[0]!.levels[0]!;
    parent.children[parent.children.indexOf(base)] = chainLevel;
    chainLevel.parent = parent;
    base.parent = null;
    swapped.release();
    expect(cache.stats().entries).toBe(0);
    // A level set aside, moved.
    const fresh = await cache.lease('sha256:lod', withLevel, 12);
    expect(fresh.reused).toBe(false);
    fresh.release();
    const edited = await cache.lease('sha256:lod', withLevel, 12);
    expect(edited.reused).toBe(true);
    (await import('../lod')).reviewLodChains(edited.scene.root)[0]!.levels[0]!.position.x = 4;
    edited.release();
    expect(cache.stats().entries).toBe(0);
  });

  test('a load that fails leaves nothing behind', async () => {
    const cache = createReviewSceneCache();
    await expect(
      cache.lease('sha256:a', async () => Promise.reject(new Error('bad glb')), 12),
    ).rejects.toThrow('bad glb');
    expect(cache.stats().entries).toBe(0);
  });
});
