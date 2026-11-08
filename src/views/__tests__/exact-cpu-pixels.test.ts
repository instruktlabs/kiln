import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderReviewDerivativeGlb, renderSceneToGLB } from '../../render';
import { cameraFromBounds, decodePng, measureBounds, renderGlbViewCell } from '..';
import { rasterizeCameraPaced, withoutHiddenMeshes } from '../camera';
import { loadGlbReviewScene } from '../glb';

/** Opaque and double-sided parts, an instanced one and a hidden one: what a derivative re-encodes. */
async function fixtureBytes(): Promise<Uint8Array> {
  const root = new THREE.Group();
  root.name = 'Root';
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#cc3333' }),
  );
  box.name = 'Box';
  box.position.set(-1, 0, 0);
  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({ color: '#33aa55', side: THREE.DoubleSide }),
  );
  sail.name = 'Sail';
  sail.position.set(0.4, 0.9, 0);
  sail.rotation.set(0.3, 0.8, 0);
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.1, 1, 8),
    new THREE.MeshStandardMaterial({ color: '#3333cc' }),
    3,
  );
  posts.name = 'Posts';
  for (let i = 0; i < 3; i++)
    posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0.8 + i * 0.4, 0, 0.3));
  const hidden = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ffff00' }),
  );
  hidden.name = 'Hidden';
  hidden.position.set(0, 0, 1.2);
  hidden.visible = false;
  root.add(box, sail, posts, hidden);
  return Uint8Array.from(
    (await renderSceneToGLB(root, { derivative: true, gltfExporter: 'three' })).bytes,
  );
}

describe('a camera-only CPU shot drawn from the review scene', () => {
  test('has the pixels of the derivative it no longer exports', async () => {
    const { root } = await loadGlbReviewScene(await fixtureBytes());
    const scene = root as THREE.Object3D;
    const derivative = await renderReviewDerivativeGlb(withoutHiddenMeshes(scene), {
      gltfExporter: 'three',
    });
    const bounds = measureBounds(scene);
    const size = 96;
    for (const dir of [
      [1, 0.5, 1],
      [-1, 0.3, 0.2],
      [0.1, -0.8, -1],
    ] as [number, number, number][]) {
      const camera = cameraFromBounds(bounds, dir, 1, undefined, bounds);
      const exact = await rasterizeCameraPaced(scene, camera, size, true);
      const flat = await renderGlbViewCell(derivative, { name: 'v', dir }, { size, camera });
      expect(Buffer.from(exact).equals(Buffer.from(decodePng(flat.png).rgb))).toBe(true);
    }
  });
});
