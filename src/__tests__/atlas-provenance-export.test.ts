import { afterEach, expect, test } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';
import { textureAtlas, remapUVToAtlas } from '../texture-atlas';
import { renderSceneToGLB, optimizeGlbBytes, composeSceneGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';
import { bakeSceneTextures } from '../texture-bake';
import { validateAtlasDocumentProvenance } from '../atlas-provenance';
const previous = process.env['KILN_QA_MODE'];
afterEach(() => {
  if (previous === undefined) delete process.env['KILN_QA_MODE'];
  else process.env['KILN_QA_MODE'] = previous;
});
const spec = {
  schemaVersion: 1,
  width: 128,
  height: 128,
  usage: 'albedo',
  sampler: {
    minFilter: 'nearest',
    magFilter: 'nearest',
    wrapS: 'clamp-to-edge',
    wrapT: 'clamp-to-edge',
  },
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
  const texture = await textureAtlas(spec),
    geometry = remapUVToAtlas(new THREE.PlaneGeometry(), texture, 'face', {
      inputOrigin: 'bottom-left',
      mode: 'texel-center',
    }),
    root = new THREE.Group();
  root.name = 'AtlasRoot';
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
    mesh.name = `Panel${i}`;
    mesh.position.x = i;
    mesh.userData.kilnPrivate = 'excluded';
    root.add(mesh);
  }
  return { root, texture, geometry };
}
for (const gltfExporter of ['legacy', 'three'] as const)
  test(`${gltfExporter} atlas provenance survives exact GLB reimport and optimizer`, async () => {
    process.env['KILN_QA_MODE'] = 'off';
    const { root, texture, geometry } = await fixture();
    const result = await renderSceneToGLB(root, { gltfExporter, optimize: 'off' }),
      io = new WebIO().registerExtensions(ALL_EXTENSIONS),
      doc = await io.readBinary(result.bytes);
    const table = doc.getRoot().getDefaultScene()!.getExtras().kilnAtlasProvenance as {
      atlases: unknown[];
    };
    expect(table?.atlases).toHaveLength(1);
    expect(result.bakedTextures?.[0]?.atlas?.id).toBe(
      texture.userData.kilnAtlas.manifest.manifestHash,
    );
    for (const primitive of doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives()))
      expect(primitive.getExtras().kilnAtlasBinding).toEqual(
        expect.objectContaining({ region: 'face' }),
      );
    for (const node of doc.getRoot().listNodes())
      expect(node.getExtras().kilnPrivate).toBeUndefined();
    await validateAtlasDocumentProvenance(doc);
    const use = doc.getRoot().listMaterials()[0]!,
      ref = use.getBaseColorTextureInfo()!.getExtras().kilnAtlasReference as {
        finalImageSha256: string;
      };
    expect(ref.finalImageSha256).toBe(
      `sha256:${createHash('sha256').update(use.getBaseColorTexture()!.getImage()!).digest('hex')}`,
    );
    const restored = await loadGlbReviewScene(result.bytes),
      meshes: THREE.Mesh[] = [];
    restored.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    expect(meshes[0]!.geometry.userData.kilnAtlasBinding).toEqual(
      geometry.userData.kilnAtlasBinding,
    );
    expect((meshes[0]!.material as THREE.MeshBasicMaterial).map!.userData.kilnAtlas).toEqual(
      texture.userData.kilnAtlas,
    );
    const optimized = await optimizeGlbBytes(result.bytes, { mode: 'full' });
    expect(optimized).toBeDefined();
    const optimizedDoc = await io.readBinary(optimized!.bytes);
    await validateAtlasDocumentProvenance(optimizedDoc);
    expect(optimizedDoc.getRoot().getDefaultScene()!.getExtras().kilnAtlasProvenance).toEqual(
      table,
    );
    expect(
      optimizedDoc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .every((p) => p.getExtras().kilnAtlasBinding !== undefined),
    ).toBe(true);
    const round = await loadGlbReviewScene(optimized!.bytes);
    expect(round.root).toBeDefined();
  });
test('already encoded atlas baking retains identity with all exact texture bindings', async () => {
  const { root, texture } = await fixture();
  const first = await bakeSceneTextures(root, []),
    second = await bakeSceneTextures(root, []);
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(second[0]!.atlas?.id).toBe(texture.userData.kilnAtlas.manifest.manifestHash);
  expect(second[0]!.bindings).toHaveLength(2);
  expect(second[0]!.imageSha256).toBe(first[0]!.imageSha256);
});

for (const gltfExporter of ['legacy', 'three'] as const)
  test(`${gltfExporter} shared image keeps two effective sampler uses and rejects byte/sampler tampering`, async () => {
    process.env['KILN_QA_MODE'] = 'off';
    const { root, texture } = await fixture();
    const other = texture.clone();
    other.magFilter = THREE.LinearFilter;
    other.minFilter = THREE.LinearFilter;
    other.wrapS = THREE.RepeatWrapping;
    (root.children[1] as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: other });
    const result = await renderSceneToGLB(root, { gltfExporter, optimize: 'off' }),
      io = new WebIO().registerExtensions(ALL_EXTENSIONS),
      doc = await io.readBinary(result.bytes);
    expect(doc.getRoot().listTextures()).toHaveLength(1);
    const uses = doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getBaseColorTextureInfo()!);
    expect(uses).toHaveLength(2);
    expect(new Set(uses.map((i) => i.getMagFilter())).size).toBe(2);
    await validateAtlasDocumentProvenance(doc);
    const restored = await loadGlbReviewScene(result.bytes),
      maps: THREE.Texture[] = [];
    restored.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh)
        maps.push(((o as THREE.Mesh).material as THREE.MeshStandardMaterial).map!);
    });
    expect(new Set(maps.map((m) => m.magFilter)).size).toBe(2);
    expect(maps[0]).not.toBe(maps[1]);
    uses[0]!.setMagFilter(9729);
    uses[0]!.setWrapT(10497);
    const tampered = await io.writeBinary(doc);
    await expect(loadGlbReviewScene(tampered)).rejects.toThrow(/sampler/);
    const clean = await io.readBinary(result.bytes);
    clean
      .getRoot()
      .listTextures()[0]!
      .setImage(new Uint8Array([9]));
    await expect(loadGlbReviewScene(await io.writeBinary(clean))).rejects.toThrow(/image/);
  });
test('manual full-sheet atlas use exports no inferred named binding', async () => {
  process.env['KILN_QA_MODE'] = 'off';
  const { root } = await fixture();
  for (const child of root.children) (child as THREE.Mesh).geometry = new THREE.PlaneGeometry();
  const result = await renderSceneToGLB(root, { optimize: 'off' }),
    doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result.bytes);
  expect(
    doc
      .getRoot()
      .listMeshes()
      .every((m) => m.listPrimitives().every((p) => p.getExtras().kilnAtlasBinding === undefined)),
  ).toBe(true);
  await validateAtlasDocumentProvenance(doc);
});

test('missing atlas table/reference rejects only explicit lineage, ordinary GLBs still load', async () => {
  process.env['KILN_QA_MODE'] = 'off';
  const { root } = await fixture(),
    io = new WebIO().registerExtensions(ALL_EXTENSIONS),
    result = await renderSceneToGLB(root, { optimize: 'off' });
  const noTable = await io.readBinary(result.bytes);
  noTable.getRoot().getDefaultScene()!.setExtras({});
  await expect(loadGlbReviewScene(await io.writeBinary(noTable))).rejects.toThrow(/table/);
  const noRef = await io.readBinary(result.bytes);
  for (const m of noRef.getRoot().listMaterials()) m.getBaseColorTextureInfo()!.setExtras({});
  await expect(loadGlbReviewScene(await io.writeBinary(noRef))).rejects.toThrow(/reference/);
  const ordinary = new THREE.Group();
  ordinary.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()));
  const plain = await renderSceneToGLB(ordinary, { optimize: 'off' });
  expect((await loadGlbReviewScene(plain.bytes)).root).toBeDefined();
});

for (const optimize of ['off', 'full'] as const)
  test(`composition ${optimize} deduplicates atlas table before disposing source scenes`, async () => {
    process.env['KILN_QA_MODE'] = 'off';
    const { root } = await fixture(),
      first = await renderSceneToGLB(root, { optimize: 'off' });
    const parts = [0, 1].map((i) => ({
      bytes: first.bytes,
      transform: {
        pos: [i * 2, 0, 0] as [number, number, number],
        rotDeg: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
    }));
    const composed = await composeSceneGLB(parts, { optimize }),
      doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composed.bytes);
    expect(
      (doc.getRoot().getDefaultScene()!.getExtras().kilnAtlasProvenance as { atlases: unknown[] })
        ?.atlases,
    ).toHaveLength(1);
    await validateAtlasDocumentProvenance(doc);
    expect(
      doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .every((p) => p.getExtras().kilnAtlasBinding !== undefined),
    ).toBe(true);
    expect((await loadGlbReviewScene(composed.bytes)).root).toBeDefined();
  });

test('mutated atlas source RGBA cannot retain a stale compiled provenance stamp', async () => {
  const { root, texture } = await fixture();
  const data = texture.image.data as Uint8Array;
  data[0] = data[0]! ^ 255;
  await expect(bakeSceneTextures(root, [])).rejects.toThrow(/stale.*provenance/);
});
test('Three normal conversion keeps original pixel lineage and validated imported roundtrip', async () => {
  process.env['KILN_QA_MODE'] = 'off';
  const texture = await textureAtlas({
    ...spec,
    usage: 'normal',
    regions: [
      {
        ...spec.regions[0]!,
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 4,
            height: 4,
            usage: 'normal',
            background: [90, 130, 220, 255],
            operations: [],
          },
        },
      },
    ],
  });
  const geometry = remapUVToAtlas(new THREE.PlaneGeometry(), texture, 'face', {
      inputOrigin: 'bottom-left',
      mode: 'texel-center',
    }),
    material = new THREE.MeshStandardMaterial({ normalMap: texture });
  material.normalScale.set(-1, 1);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));
  const first = await renderSceneToGLB(root, { gltfExporter: 'three', optimize: 'off' }),
    io = new WebIO().registerExtensions(ALL_EXTENSIONS),
    doc = await io.readBinary(first.bytes);
  const image = doc.getRoot().listMaterials()[0]!.getNormalTexture()!.getImage()!;
  expect(`sha256:${createHash('sha256').update(image).digest('hex')}`).not.toBe(
    first.bakedTextures![0]!.imageSha256,
  );
  const restored = await loadGlbReviewScene(first.bytes),
    round = await renderSceneToGLB(restored.root, { gltfExporter: 'legacy', optimize: 'off' }),
    roundDoc = await io.readBinary(round.bytes);
  expect(roundDoc.getRoot().listMaterials()[0]!.getNormalTexture()!.getImage()).toEqual(image);
  await validateAtlasDocumentProvenance(roundDoc);
});

test('authored delivery flags cannot bypass source provenance and owned import bytes cannot change', async () => {
  process.env['KILN_QA_MODE'] = 'off';
  const texture = await textureAtlas({
    ...spec,
    usage: 'normal',
    regions: [
      {
        ...spec.regions[0]!,
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 4,
            height: 4,
            usage: 'normal',
            background: [90, 130, 220, 255],
            operations: [],
          },
        },
      },
    ],
  });
  const material = new THREE.MeshStandardMaterial({ normalMap: texture });
  material.normalScale.set(-1, 1);
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
  const exported = await renderSceneToGLB(source, { gltfExporter: 'three', optimize: 'off' }),
    loaded = await loadGlbReviewScene(exported.bytes);
  let imported: THREE.Texture | undefined;
  loaded.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh)
      imported = ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).normalMap!;
  });
  const fake = new THREE.Texture();
  fake.userData = { ...structuredClone(imported!.userData), kilnAtlasDelivery: true };
  const fakeRoot = new THREE.Group();
  fakeRoot.add(
    new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ normalMap: fake })),
  );
  await expect(bakeSceneTextures(fakeRoot, [])).rejects.toThrow(/stale.*provenance/);
  imported!.userData.encoded.bytes = texture.userData.encoded.bytes;
  await expect(bakeSceneTextures(loaded.root, [])).rejects.toThrow(/stale.*provenance/);
});

test('an unreadable atlas source cannot silently drop its identity-bearing texture', async () => {
  const { root, texture } = await fixture();
  Object.defineProperty(texture, 'image', { configurable: true, writable: true, value: undefined });
  await expect(bakeSceneTextures(root, [])).rejects.toThrow(/stale.*provenance/);
});

for (const gltfExporter of ['legacy', 'three'] as const)
  test(`${gltfExporter} full-sheet sprite atlas preserves identity without a named remap`, async () => {
    process.env['KILN_QA_MODE'] = 'off';
    const { texture } = await fixture(),
      root = new THREE.Group();
    root.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })));
    const result = await renderSceneToGLB(root, { gltfExporter, optimize: 'off' }),
      doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result.bytes);
    expect(
      (doc.getRoot().getDefaultScene()!.getExtras().kilnAtlasProvenance as { atlases: unknown[] })
        ?.atlases,
    ).toHaveLength(1);
    await validateAtlasDocumentProvenance(doc);
  });
