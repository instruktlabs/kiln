import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { createGltfIO } from '../../gltf-io';
import { renderSceneToGLB } from '../../render';
import { loadGlbReviewScene } from '../glb';

test('review derivatives retain independent ordinary texture bindings and exact PNG bytes', async () => {
  const doc = new Document(),
    buffer = doc.createBuffer();
  const png = Uint8Array.from(
    await sharp(
      Uint8Array.from([200, 20, 40, 255, 30, 170, 10, 255, 10, 20, 210, 255, 100, 120, 140, 255]),
      { raw: { width: 2, height: 2, channels: 4 } },
    )
      .png()
      .toBuffer(),
  );
  const image = doc.createTexture('SharedImage').setImage(png).setMimeType('image/png');
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const uvs = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer);
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  const transform = doc.createExtension(KHRTextureTransform);
  for (let i = 0; i < 2; i++) {
    const material = doc.createMaterial(`Binding${i}`).setBaseColorTexture(image);
    const info = material.getBaseColorTextureInfo()!;
    info
      .setMinFilter(i ? 9986 : 9728)
      .setMagFilter(i ? 9729 : 9728)
      .setWrapS(i ? 33648 : 10497)
      .setWrapT(33071);
    if (i)
      info.setExtension(
        'KHR_texture_transform',
        transform.createTransform().setOffset([0.2, 0.3]).setScale([2, 3]).setRotation(0.4),
      );
    scene.addChild(
      doc
        .createNode(`Panel${i}`)
        .setMesh(
          doc
            .createMesh()
            .addPrimitive(
              doc
                .createPrimitive()
                .setAttribute('POSITION', positions)
                .setAttribute('TEXCOORD_0', uvs)
                .setMaterial(material),
            ),
        ),
    );
  }
  const io = createGltfIO(),
    loaded = await loadGlbReviewScene(await io.writeBinary(doc));
  const maps: THREE.Texture[] = [];
  loaded.root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh)
      maps.push(((n as THREE.Mesh).material as THREE.MeshStandardMaterial).map!);
  });
  expect(maps).toHaveLength(2);
  expect(maps[0]).not.toBe(maps[1]);
  expect(maps.map((m) => m.flipY)).toEqual([false, false]);
  expect(maps.map((m) => m.minFilter)).toEqual([
    THREE.NearestFilter,
    THREE.NearestMipmapLinearFilter,
  ]);
  expect(maps.map((m) => m.wrapS)).toEqual([THREE.RepeatWrapping, THREE.MirroredRepeatWrapping]);
  for (const gltfExporter of ['legacy', 'three'] as const) {
    const output = await renderSceneToGLB(loaded.root, {
      gltfExporter,
      derivative: true,
      optimize: 'off',
    });
    const result = await io.readBinary(output.bytes);
    for (const texture of result.getRoot().listTextures()) expect(texture.getImage()).toEqual(png);
    for (let i = 0; i < 2; i++) {
      const info = result.getRoot().listMaterials()[i]!.getBaseColorTextureInfo()!;
      expect(info.getMinFilter()).toBe(i ? 9986 : 9728);
      expect(info.getMagFilter()).toBe(i ? 9729 : 9728);
      expect(info.getWrapS()).toBe(i ? 33648 : 10497);
      expect(info.getWrapT()).toBe(33071);
      if (i && gltfExporter === 'three') {
        const actual =
          info.getExtension<import('@gltf-transform/extensions').Transform>(
            'KHR_texture_transform',
          )!;
        expect(actual.getOffset()).toEqual([0.2, 0.3]);
        expect(actual.getScale()[0]).toBeCloseTo(2, 7);
        expect(actual.getScale()[1]).toBeCloseTo(3, 7);
        expect(actual.getRotation()).toBeCloseTo(0.4, 7);
      }
    }
  }
});
