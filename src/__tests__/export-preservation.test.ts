import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { createGltfIO } from '../gltf-io';
import { renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';

function row(options: { hidden?: boolean; extras?: boolean } = {}) {
  const root = new THREE.Group();
  root.name = 'Row';
  const hidden = new THREE.Group();
  hidden.name = 'Hidden';
  hidden.visible = false;
  if (options.hidden) root.add(hidden);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Box${i}`;
    mesh.position.set(i * 2, 0, 0);
    if (options.extras) mesh.userData.assetPartId = `part-${i}`;
    (options.hidden && i >= 4 ? hidden : root).add(mesh);
  }
  return root;
}

describe('export preserves placed geometry and per-node intent', () => {
  for (const gltfExporter of ['legacy', 'three'] as const) {
    test(`instanced review derivatives retain placement (${gltfExporter})`, async () => {
      const source = await renderSceneToGLB(row(), { role: 'fill' });
      const loaded = await loadGlbReviewScene(source.bytes);
      const before = new THREE.Box3().setFromObject(loaded.root);
      const derivative = await renderSceneToGLB(loaded.root, { gltfExporter, derivative: true });
      const after = new THREE.Box3().setFromObject(
        (await loadGlbReviewScene(derivative.bytes)).root,
      );
      expect(before.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
      expect(before.max.toArray()).toEqual([14.5, 0.5, 0.5]);
      expect(after.min.toArray()).toEqual(before.min.toArray());
      expect(after.max.toArray()).toEqual(before.max.toArray());
      expect(derivative.tris).toBe(96);
    });

    test(`canonical bounds include instance placements (${gltfExporter})`, async () => {
      const result = await renderSceneToGLB(row(), { role: 'fill', gltfExporter });
      expect(result.instancing?.instances).toBe(8);
      expect(result.integrationManifest.bounds.size).toEqual([15, 1, 1]);
    });

    for (const optimize of ['off', 'full'] as const) {
      test(`material extras survive palette consolidation (${gltfExporter}, ${optimize})`, async () => {
        const root = row();
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.material = new THREE.MeshStandardMaterial({
            color: Number(node.name.slice(3)) * 0x112233,
          });
          node.material.userData.surfaceId = node.name;
        });
        const result = await renderSceneToGLB(root, { gltfExporter, optimize, role: 'fill' });
        const doc = await createGltfIO().readBinary(result.bytes);
        expect(
          doc
            .getRoot()
            .listMaterials()
            .map((m) => m.getExtras().surfaceId)
            .sort(),
        ).toEqual(Array.from({ length: 8 }, (_, i) => `Box${i}`));
      });
      test(`hidden ancestors survive fill optimization (${gltfExporter}, ${optimize})`, async () => {
        const result = await renderSceneToGLB(row({ hidden: true }), {
          gltfExporter,
          optimize,
          role: 'fill',
        });
        expect(result.tris).toBe(48);
        expect(result.integrationManifest.renderMetrics.triangles).toBe(48);
        expect(result.integrationManifest.hiddenNodes?.[0]?.triangles).toBe(48);
        expect(result.integrationManifest.bounds.size).toEqual([7, 1, 1]);
      });

      test(`per-node extras survive fill optimization (${gltfExporter}, ${optimize})`, async () => {
        const result = await renderSceneToGLB(row({ extras: true }), {
          gltfExporter,
          optimize,
          role: 'fill',
        });
        const doc = await createGltfIO().readBinary(result.bytes);
        const values = doc
          .getRoot()
          .listNodes()
          .map((node) => node.getExtras().assetPartId)
          .filter((value) => value !== undefined)
          .sort();
        expect(values).toEqual(Array.from({ length: 8 }, (_, i) => `part-${i}`));
      });
    }
  }
});
