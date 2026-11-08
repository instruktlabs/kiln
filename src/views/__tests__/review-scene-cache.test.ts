import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../../render';
import { loadGlbReviewScene } from '../glb';
import { createReviewSceneCache } from '../review-scene-cache';

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
    expect(second.scene).toBe(first.scene);
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

  test('a load that fails leaves nothing behind', async () => {
    const cache = createReviewSceneCache();
    await expect(
      cache.lease('sha256:a', async () => Promise.reject(new Error('bad glb')), 12),
    ).rejects.toThrow('bad glb');
    expect(cache.stats().entries).toBe(0);
  });
});
