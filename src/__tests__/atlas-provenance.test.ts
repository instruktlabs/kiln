import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { textureAtlas, remapUVToAtlas } from '../texture-atlas';
import {
  collectAtlasProvenance,
  readAtlasTextureProvenance,
  validateAtlasProvenanceTable,
  expandAtlasBinding,
  refreshAtlasDocumentProvenance,
  validateAtlasDocumentProvenance,
  mergeAtlasDocumentProvenance,
} from '../atlas-provenance';

const spec = {
  schemaVersion: 1,
  width: 128,
  height: 128,
  usage: 'albedo',
  regions: [
    {
      name: 'face',
      content: { x: 4, y: 4, width: 4, height: 4 },
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: 4,
          height: 4,
          background: [255, 12, 34, 255],
          operations: [],
        },
      },
    },
  ],
};
async function fixture() {
  const texture = await textureAtlas(spec);
  const geometry = remapUVToAtlas(new THREE.PlaneGeometry(), texture, 'face', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
  });
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture })),
    new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture })),
  );
  return { texture, geometry, root };
}
test('atlas owner deduplicates exact texture identity and emits compact named bindings', async () => {
  const { texture, geometry, root } = await fixture();
  const collection = collectAtlasProvenance(root);
  expect(collection.table?.atlases).toHaveLength(1);
  expect(collection.texture(texture)?.id).toBe(texture.userData.kilnAtlas.manifest.manifestHash);
  const binding = collection.binding(geometry)!;
  expect(Object.keys(binding).sort()).toEqual([
    'atlasId',
    'inputOrigin',
    'mode',
    'region',
    'version',
  ]);
  expect(expandAtlasBinding(binding, collection.table!)).toEqual(
    geometry.userData.kilnAtlasBinding,
  );
  expect(readAtlasTextureProvenance(new THREE.Texture())).toBeUndefined();
  expect(collectAtlasProvenance(new THREE.Group()).table).toBeUndefined();
});
test('atlas owner rejects getters, conflicting source stamps and forged binding formulas before invocation', async () => {
  const { texture, geometry, root } = await fixture();
  let called = 0;
  const stamp = texture.userData.kilnAtlas;
  Object.defineProperty(texture.userData, 'kilnAtlas', {
    enumerable: true,
    configurable: true,
    get() {
      called++;
      return stamp;
    },
  });
  expect(() => collectAtlasProvenance(root)).toThrow();
  expect(called).toBe(0);
  Object.defineProperty(texture.userData, 'kilnAtlas', {
    enumerable: true,
    configurable: true,
    writable: true,
    value: stamp,
  });
  geometry.userData.kilnAtlasBinding.scale[0] += 0.1;
  expect(() => collectAtlasProvenance(root)).toThrow();
  texture.userData.kilnMaterialResource = {
    map: {
      recipe: { kind: 'atlas', spec: { ...stamp.spec, usage: 'normal' }, manifest: stamp.manifest },
    },
  };
  expect(() => readAtlasTextureProvenance(texture)).toThrow();
});
test('table validates closed identity and dense bounds without accessor reads', async () => {
  const { root } = await fixture();
  const table = collectAtlasProvenance(root).table!;
  expect(validateAtlasProvenanceTable(table)).toEqual(table);
  expect(() => validateAtlasProvenanceTable({ ...table, extra: true })).toThrow();
  const sparse = Array(1);
  expect(() => validateAtlasProvenanceTable({ ...table, atlases: sparse })).toThrow();
  const repeated = { ...table, atlases: [...table.atlases, ...table.atlases] };
  expect(() => validateAtlasProvenanceTable(repeated)).toThrow();
});
test('document refs bind final bytes and sampler per material slot, even with a shared image', async () => {
  const { root, texture } = await fixture(),
    collection = collectAtlasProvenance(root),
    doc = new Document();
  doc
    .getRoot()
    .setDefaultScene(doc.createScene().setExtras({ kilnAtlasProvenance: collection.table! }));
  const image = doc
    .createTexture()
    .setImage(new Uint8Array([1, 2, 3]))
    .setMimeType('image/png');
  const a = doc.createMaterial().setBaseColorTexture(image).getBaseColorTextureInfo()!;
  const b = doc.createMaterial().setBaseColorTexture(image).getBaseColorTextureInfo()!;
  a.setMinFilter(9728)
    .setMagFilter(9728)
    .setWrapS(33071)
    .setWrapT(33071)
    .setExtras({ kilnAtlasReference: collection.texture(texture)! });
  b.setMinFilter(9729)
    .setMagFilter(9729)
    .setWrapS(10497)
    .setWrapT(10497)
    .setExtras({ kilnAtlasReference: collection.texture(texture)! });
  await refreshAtlasDocumentProvenance(doc);
  expect(a.getExtras().kilnAtlasReference).not.toEqual(b.getExtras().kilnAtlasReference);
  await validateAtlasDocumentProvenance(doc);
  image.setImage(new Uint8Array([9]));
  await expect(validateAtlasDocumentProvenance(doc)).rejects.toThrow();
});

test('repeated source identity cannot bypass scene binding admission or attach a prior mesh atlas', async () => {
  const { texture, geometry, root } = await fixture();
  for (let i = 0; i < 1024; i++)
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture })));
  expect(() => collectAtlasProvenance(root)).toThrow(/budget/);
  const unrelated = new THREE.Group();
  unrelated.add(
    new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
    new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
  );
  expect(() => collectAtlasProvenance(unrelated)).toThrow(/matching/);
});

test('whole scene atlas count is admitted before any manifest cloning', async () => {
  const { texture } = await fixture(),
    root = new THREE.Group();
  for (let i = 0; i < 129; i++) {
    const copy = texture.clone();
    copy.userData.kilnAtlas.manifest.manifestHash = `sha256:${i.toString(16).padStart(64, '0')}`;
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: copy })));
  }
  const original = globalThis.structuredClone;
  let clones = 0;
  globalThis.structuredClone = ((value: unknown) => {
    clones++;
    return original(value);
  }) as typeof structuredClone;
  try {
    expect(() => collectAtlasProvenance(root)).toThrow(/budget/);
    expect(clones).toBe(0);
  } finally {
    globalThis.structuredClone = original;
  }
});

test('aggregate encoded image budget rejects before hashing', async () => {
  const { root, texture } = await fixture(),
    collection = collectAtlasProvenance(root),
    doc = new Document();
  doc
    .getRoot()
    .setDefaultScene(doc.createScene().setExtras({ kilnAtlasProvenance: collection.table! }));
  const shared = new Uint8Array(16_777_216);
  for (let i = 0; i < 5; i++) {
    const image = doc.createTexture().setImage(shared).setMimeType('image/png');
    doc
      .createMaterial()
      .setBaseColorTexture(image)
      .getBaseColorTextureInfo()!
      .setExtras({ kilnAtlasReference: collection.texture(texture)! });
  }
  await expect(refreshAtlasDocumentProvenance(doc)).rejects.toThrow(/aggregate.*hash budget/);
});

test('composition conflicts are rejected before manifest cloning and target mutation', async () => {
  const { root } = await fixture(),
    table = collectAtlasProvenance(root).table!,
    target = new Document(),
    source = new Document();
  target.getRoot().setDefaultScene(target.createScene().setExtras({ kilnAtlasProvenance: table }));
  const damaged = structuredClone(table);
  damaged.atlases[0]!.spec.usage = 'normal';
  source
    .getRoot()
    .setDefaultScene(source.createScene().setExtras({ kilnAtlasProvenance: damaged }));
  const original = globalThis.structuredClone;
  let clones = 0;
  globalThis.structuredClone = ((value: unknown) => {
    clones++;
    return original(value);
  }) as typeof structuredClone;
  try {
    await expect(mergeAtlasDocumentProvenance(target, source)).rejects.toThrow(/conflicting/);
    expect(clones).toBe(0);
    expect(target.getRoot().getDefaultScene()!.getExtras().kilnAtlasProvenance).toBe(table);
  } finally {
    globalThis.structuredClone = original;
  }
});
