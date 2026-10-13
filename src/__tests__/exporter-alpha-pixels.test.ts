import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { optimizeGlbBytes, renderSceneToGLB } from '../render';

for (const gltfExporter of ['legacy', 'three'] as const) {
  test(`${gltfExporter} preserves hidden cutout RGB and partial-alpha bytes in direct PNG bindings`, async () => {
    const root = new THREE.Group();
    const pixels = Uint8Array.from([
      177, 31, 95, 0, 147, 73, 211, 1, 65, 113, 241, 64, 201, 101, 17, 128,
    ]);
    const map = new THREE.DataTexture(pixels, 2, 2);
    map.colorSpace = THREE.SRGBColorSpace;
    map.name = 'DilatedCutout';
    map.magFilter = THREE.NearestFilter;
    const image = map.image;
    const source = map.source;
    const material = new THREE.MeshStandardMaterial({
      map,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    const original = await renderSceneToGLB(root, {
      gltfExporter,
      derivative: true,
      optimize: 'off',
    });
    const optimized = await optimizeGlbBytes(original.bytes, { mode: 'full' });
    expect(optimized).toBeDefined();
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    for (const bytes of [original.bytes, optimized!.bytes]) {
      const doc = await io.readBinary(bytes);
      const saved = doc.getRoot().listMaterials()[0]!;
      expect(saved.getAlphaMode()).toBe('MASK');
      expect(saved.getAlphaCutoff()).toBeCloseTo(0.4, 7);
      const decoded = await sharp(saved.getBaseColorTexture()!.getImage()!)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect([...decoded]).toEqual([...pixels]);
      expect(saved.getBaseColorTextureInfo()!.getMagFilter()).toBe(9728);
    }
    expect(map.image).toBe(image);
    expect(map.source).toBe(source);
    expect(material.map).toBe(map);
    expect([...(map.image.data as Uint8Array)]).toEqual([...pixels]);
  });
}

test('experimental direct JPEG bindings retain original encoded bytes', async () => {
  const encoded = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#764521' },
  })
    .jpeg({ quality: 81 })
    .toBuffer();
  const map = new THREE.Texture();
  map.flipY = false;
  map.userData['encoded'] = { bytes: new Uint8Array(encoded), mime: 'image/jpeg' };
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map }));
  const result = await renderSceneToGLB(root, {
    gltfExporter: 'three',
    derivative: true,
    optimize: 'off',
  });
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(result.bytes);
  expect(doc.getRoot().listTextures()[0]!.getMimeType()).toBe('image/jpeg');
  expect(doc.getRoot().listTextures()[0]!.getImage()).toEqual(new Uint8Array(encoded));
  expect(map.userData['encoded'].bytes).toEqual(new Uint8Array(encoded));
});

test('direct-image preservation does not bypass image flips or derived metallic-roughness packing', async () => {
  const root = new THREE.Group();
  const pixels = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  const map = new THREE.DataTexture(pixels, 2, 2);
  map.flipY = true;
  const metalnessMap = new THREE.DataTexture(Uint8Array.from([0, 0, 220, 255]), 1, 1);
  const roughnessMap = new THREE.DataTexture(Uint8Array.from([0, 50, 0, 255]), 1, 1);
  const normalMap = new THREE.DataTexture(Uint8Array.from([127, 63, 255, 255]), 1, 1);
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({
        map,
        metalnessMap,
        roughnessMap,
        normalMap,
        normalScale: new THREE.Vector2(1, -1),
        metalness: 1,
        roughness: 1,
      }),
    ),
  );
  const result = await renderSceneToGLB(root, {
    gltfExporter: 'three',
    derivative: true,
    optimize: 'off',
  });
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(result.bytes);
  const material = doc.getRoot().listMaterials()[0]!;
  // GLB buffer alignment bytes must not become part of an embedded PNG.
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/png')
      expect([...texture.getImage()!.slice(-12)]).toEqual([
        0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
      ]);
  }
  const decode = async (bytes: Uint8Array) => [
    ...(await sharp(bytes).ensureAlpha().raw().toBuffer()),
  ];
  expect(await decode(material.getBaseColorTexture()!.getImage()!)).toEqual([
    ...pixels.slice(8),
    ...pixels.slice(0, 8),
  ]);
  expect(await decode(material.getMetallicRoughnessTexture()!.getImage()!)).toEqual([
    0, 50, 220, 255,
  ]);
  // Kiln prepares tangents; the explicit negative normal scale requires a green flip.
  expect(await decode(material.getNormalTexture()!.getImage()!)).toEqual([127, 192, 255, 255]);
  expect(map.flipY).toBe(true);
  expect([...(map.image.data as Uint8Array)]).toEqual([...pixels]);
});
