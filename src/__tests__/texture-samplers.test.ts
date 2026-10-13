import { describe, expect, test } from 'bun:test';
import { NodeIO, type TextureInfo } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';
import { loadTexture } from '../textures';
import { optimizeGlbBytes, renderSceneToGLB } from '../render';

async function imageBytes(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 80, g: 120, b: 180, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

function sampler(info: TextureInfo | null) {
  expect(info).not.toBeNull();
  return {
    min: info!.getMinFilter(),
    mag: info!.getMagFilter(),
    s: info!.getWrapS(),
    t: info!.getWrapT(),
  };
}

// glTF sampler enums, independently checked after serialization and reloading.
const filters = [
  [THREE.NearestFilter, 9728],
  [THREE.LinearFilter, 9729],
  [THREE.NearestMipmapNearestFilter, 9984],
  [THREE.LinearMipmapNearestFilter, 9985],
  [THREE.NearestMipmapLinearFilter, 9986],
  [THREE.LinearMipmapLinearFilter, 9987],
] as const;
const wraps = [
  [THREE.ClampToEdgeWrapping, 33071],
  [THREE.MirroredRepeatWrapping, 33648],
  [THREE.RepeatWrapping, 10497],
] as const;

for (const gltfExporter of ['legacy', 'three'] as const) {
  describe(`texture sampler preservation (${gltfExporter})`, () => {
    test('retains every standard filter and wrap mode without changing source state', async () => {
      const png = await imageBytes();
      for (const [i, [min, minEnum]] of filters.entries()) {
        const texture = await loadTexture(png);
        const [s, sEnum] = wraps[i % wraps.length]!;
        const [t, tEnum] = wraps[(i + 1) % wraps.length]!;
        texture.minFilter = min;
        texture.magFilter = i % 2 ? THREE.LinearFilter : THREE.NearestFilter;
        texture.wrapS = s;
        texture.wrapT = t;
        const root = new THREE.Group();
        root.add(
          new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
        );
        const rendered = await renderSceneToGLB(root, { gltfExporter, optimize: 'off' });
        expect(rendered.gltfValidation.issues.numErrors).toBe(0);
        const doc = await new NodeIO()
          .registerExtensions([KHRMaterialsUnlit])
          .readBinary(rendered.bytes);
        expect(sampler(doc.getRoot().listMaterials()[0]!.getBaseColorTextureInfo())).toEqual({
          min: minEnum,
          mag: i % 2 ? 9729 : 9728,
          s: sEnum,
          t: tEnum,
        });
        expect([texture.minFilter, texture.magFilter, texture.wrapS, texture.wrapT]).toEqual([
          min,
          i % 2 ? THREE.LinearFilter : THREE.NearestFilter,
          s,
          t,
        ]);
      }
    });

    test('keeps per-slot samplers when image bytes are shared, including optimized exports', async () => {
      const png = await imageBytes();
      const albedo = await loadTexture(png, { usage: 'albedo' });
      const normal = await loadTexture(png, { usage: 'normal' });
      const mr = await loadTexture(png, { usage: 'metallicRoughness' });
      const emissive = await loadTexture(png, { usage: 'emissive' });
      const ao = await loadTexture(png, { usage: 'occlusion' });
      const textures = [albedo, normal, mr, emissive, ao];
      for (const [i, texture] of textures.entries()) {
        texture.minFilter = filters[i]![0];
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = wraps[i % wraps.length]![0];
        texture.wrapT = wraps[(i + 1) % wraps.length]![0];
      }
      const material = new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        roughnessMap: mr,
        metalnessMap: mr,
        emissiveMap: emissive,
        emissive: 0xffffff,
        aoMap: ao,
      });
      const root = new THREE.Group();
      root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
      const result = await renderSceneToGLB(root, { gltfExporter, optimize: 'off' });
      const optimized = await optimizeGlbBytes(result.bytes, { mode: 'full' });
      expect(optimized).toBeDefined();
      for (const bytes of [result.bytes, optimized!.bytes]) {
        const doc = await new NodeIO().readBinary(bytes);
        const saved = doc.getRoot().listMaterials()[0]!;
        const slots = [
          saved.getBaseColorTextureInfo(),
          saved.getNormalTextureInfo(),
          saved.getMetallicRoughnessTextureInfo(),
          saved.getEmissiveTextureInfo(),
          saved.getOcclusionTextureInfo(),
        ];
        for (const [i, slot] of slots.entries()) {
          expect(sampler(slot)).toEqual({
            min: filters[i]![1],
            mag: 9728,
            s: wraps[i % wraps.length]![1],
            t: wraps[(i + 1) % wraps.length]![1],
          });
        }
        const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
        for (const texture of doc.getRoot().listTextures()) {
          expect(await sharp(texture.getImage()!).ensureAlpha().raw().toBuffer()).toEqual(pixels);
        }
      }
    });

    test('retains ordinary loader defaults and independent samplers across materials', async () => {
      const png = await imageBytes();
      const ordinary = await loadTexture(png);
      const pixel = await loadTexture(png);
      pixel.minFilter = THREE.NearestFilter;
      pixel.magFilter = THREE.NearestFilter;
      pixel.wrapS = THREE.ClampToEdgeWrapping;
      pixel.wrapT = THREE.MirroredRepeatWrapping;
      const root = new THREE.Group();
      for (const [name, texture] of [
        ['ordinary', ordinary],
        ['pixel', pixel],
      ] as const) {
        const material = new THREE.MeshLambertMaterial({ map: texture });
        material.name = name;
        root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
      }
      const result = await renderSceneToGLB(root, { gltfExporter, optimize: 'full' });
      const doc = await new NodeIO().readBinary(result.bytes);
      const materials = doc.getRoot().listMaterials();
      expect(
        sampler(materials.find((m) => m.getName() === 'ordinary')!.getBaseColorTextureInfo()),
      ).toEqual({ min: 9987, mag: 9729, s: 10497, t: 10497 });
      expect(
        sampler(materials.find((m) => m.getName() === 'pixel')!.getBaseColorTextureInfo()),
      ).toEqual({ min: 9728, mag: 9728, s: 33071, t: 33648 });
      expect([
        ordinary.minFilter,
        ordinary.magFilter,
        ordinary.wrapS,
        ordinary.wrapT,
        ordinary.generateMipmaps,
      ]).toEqual([
        THREE.LinearMipmapLinearFilter,
        THREE.LinearFilter,
        THREE.RepeatWrapping,
        THREE.RepeatWrapping,
        true,
      ]);
    });
  });
}

test('default exporter rejects unrepresentable sampler values instead of defaulting them', async () => {
  const png = await imageBytes();
  for (const property of ['minFilter', 'magFilter', 'wrapS', 'wrapT']) {
    for (const value of [-1, 'constructor', String(THREE.NearestFilter)]) {
      const texture = await loadTexture(png);
      texture.name = 'invalid-sampler';
      Object.assign(texture, { [property]: value });
      const root = new THREE.Group();
      root.add(
        new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
      );
      await expect(
        renderSceneToGLB(root, { gltfExporter: 'legacy', optimize: 'off' }),
      ).rejects.toThrow(`invalid-sampler: unsupported ${property} ${value}`);
    }
  }
});
