import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createGltfIO } from '../gltf-io';
import { renderSceneToGLB } from '../render';

for (const gltfExporter of ['legacy', 'three'] as const) {
  for (const geometryPolicy of ['warn', 'strict'] as const) {
    test(`${gltfExporter}/${geometryPolicy} diagnoses back-only material before export mutation`, async () => {
      const geometry = new THREE.PlaneGeometry();
      geometry.deleteAttribute('normal');
      const material = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
      material.name = 'InnerSkin';
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'Shell';
      const original = [...geometry.index!.array];
      await expect(
        renderSceneToGLB(mesh, { gltfExporter, geometryPolicy, derivative: true, optimize: 'off' }),
      ).rejects.toThrow(
        /EXPORT_MATERIAL_SIDE_UNSUPPORTED.*Shell.*InnerSkin.*BackSide.*glTF.*FrontSide.*DoubleSide/,
      );
      expect(geometry.getAttribute('normal')).toBeUndefined();
      expect([...geometry.index!.array]).toEqual(original);
      expect(material.side).toBe(THREE.BackSide);
    });
  }
  test(`${gltfExporter} checks only used array materials and preserves front/double delivery`, async () => {
    const geometry = new THREE.PlaneGeometry();
    geometry.clearGroups();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const materials = [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
    ];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = 'Panel';
    materials[2]!.name = 'UnusedBack';
    const result = await renderSceneToGLB(mesh, {
      gltfExporter,
      derivative: true,
      optimize: 'off',
    });
    const doc = await createGltfIO().readBinary(result.bytes);
    expect(
      doc
        .getRoot()
        .listMeshes()[0]!
        .listPrimitives()
        .map((p) => p.getMaterial()!.getDoubleSided()),
    ).toEqual([false, true]);
    geometry.groups[1]!.materialIndex = 2;
    await expect(renderSceneToGLB(mesh, { gltfExporter, derivative: true })).rejects.toThrow(
      /Panel.*UnusedBack.*BackSide/,
    );
  });
  test(`${gltfExporter} rejects a back-only sprite with its material identity`, async () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ side: THREE.BackSide }));
    sprite.name = 'Card';
    sprite.material.name = 'Reverse';
    await expect(renderSceneToGLB(sprite, { gltfExporter, derivative: true })).rejects.toThrow(
      /Card.*Reverse.*BackSide/,
    );
  });
}
