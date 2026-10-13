import { expect, test, spyOn } from 'bun:test';
import * as THREE from 'three';
import { textureAtlas, remapUVToAtlas } from '../texture-atlas';
import { inspectAtlasScene, ATLAS_QA_LIMITS } from './atlas';
import { inspectPortableSceneMaterials } from './material';
import type { AtlasProvenanceV1 } from '../atlas-provenance';
import * as atlasProvenance from '../atlas-provenance';
import { renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';

async function fixture() {
  const atlas = await textureAtlas({
    schemaVersion: 1,
    width: 16,
    height: 16,
    usage: 'albedo',
    sampler: {
      minFilter: 'nearest',
      magFilter: 'nearest',
      wrapS: 'clamp-to-edge',
      wrapT: 'clamp-to-edge',
    },
    regions: [
      {
        name: 'panel',
        content: { x: 2, y: 2, width: 4, height: 4 },
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 4,
            height: 4,
            background: [80, 40, 20, 255],
            operations: [],
          },
        },
      },
    ],
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1], 3),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const mapped = remapUVToAtlas(geometry, atlas, 'panel', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
  });
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(
    mapped,
    new THREE.MeshStandardMaterial({ map: atlas }),
  );
  mesh.name = 'Panel';
  const root = new THREE.Group();
  root.name = 'Root';
  root.add(mesh);
  return { atlas, mesh, root };
}
const codes = (root: THREE.Object3D) => inspectAtlasScene(root).findings.map((f) => f.code);

test('ordinary materials/manual atlas sheets impose no named region requirement and inspect no pixels', async () => {
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  expect(inspectAtlasScene(ordinary).findings).toEqual([]);
  expect(inspectAtlasScene(ordinary).coverage).toBe('none');
  const { atlas, mesh, root } = await fixture();
  const before = structuredClone(mesh.geometry.userData);
  Object.defineProperty(atlas.image, 'data', {
    get() {
      throw Error('QA cannot read pixels');
    },
  });
  expect(inspectAtlasScene(root).findings).toEqual([]);
  expect(mesh.geometry.userData).toEqual(before);
  delete mesh.geometry.userData.kilnAtlasBinding;
  expect(inspectAtlasScene(root).findings).toEqual([]);
});

test('actual indexed/group/draw ranges skip unused UVs and report drawn nonfinite/out-of-region values', async () => {
  const { mesh, root } = await fixture();
  const atlasMaterial = mesh.material as THREE.Material;
  mesh.material = [atlasMaterial, new THREE.MeshStandardMaterial()];
  mesh.geometry.addGroup(0, 3, 0);
  mesh.geometry.addGroup(3, 3, 1);
  const uv = mesh.geometry.getAttribute('uv');
  uv.setXY(5, 9, 9);
  expect(codes(root)).toEqual([]);
  mesh.geometry.groups[1]!.materialIndex = 0;
  expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
  mesh.geometry.setDrawRange(0, 3);
  expect(codes(root)).toEqual([]);
  uv.setXY(0, Number.NaN, 0.2);
  expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
});

test('named bindings reject stale identity/missing region and sampler or slot changes', async () => {
  const { atlas, mesh, root } = await fixture();
  const stamp = structuredClone(mesh.geometry.userData.kilnAtlasBinding);
  mesh.geometry.userData.kilnAtlasBinding.region = 'missing';
  expect(codes(root)).toContain('ATLAS_REGION_MISSING');
  mesh.geometry.userData.kilnAtlasBinding = structuredClone(stamp);
  mesh.geometry.userData.kilnAtlasBinding.manifestHash = `sha256:${'f'.repeat(64)}`;
  expect(codes(root)).toContain('ATLAS_BINDING_IDENTITY');
  mesh.geometry.userData.kilnAtlasBinding = structuredClone(stamp);
  atlas.wrapS = THREE.RepeatWrapping;
  expect(codes(root)).toContain('ATLAS_SAMPLER_MISMATCH');
  atlas.wrapS = THREE.ClampToEdgeWrapping;
  atlas.flipY = true;
  expect(codes(root)).toContain('ATLAS_BINDING_TRANSFORM');
  atlas.flipY = false;
  (mesh.material as THREE.MeshStandardMaterial).map = null;
  (mesh.material as THREE.MeshStandardMaterial).normalMap = atlas;
  expect(codes(root)).toContain('ATLAS_SLOT_USAGE');
});

test('invalid metadata accessors are closed findings without invoking them', async () => {
  const { atlas, root } = await fixture();
  let invoked = false;
  Object.defineProperty(atlas.userData, 'kilnAtlas', {
    enumerable: true,
    get() {
      invoked = true;
      throw Error('PRIVATE PATH');
    },
  });
  const result = inspectAtlasScene(root);
  expect(result.findings.map((f) => f.code)).toContain('ATLAS_METADATA_INVALID');
  expect(invoked).toBe(false);
  expect(JSON.stringify(result)).not.toContain('PRIVATE PATH');
});

test('bounded source coverage is explicit; invisible and within-region mirrors are not visual failures', async () => {
  const { atlas, mesh, root } = await fixture();
  const uv = mesh.geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 - uv.getY(i));
  expect(codes(root)).toEqual([]);
  uv.setX(0, 9);
  root.visible = false;
  expect(codes(root)).toEqual([]);
  root.visible = true;
  for (let i = 0; i < ATLAS_QA_LIMITS.bindings + 1; i++)
    root.add(new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ map: atlas })));
  const result = inspectAtlasScene(root);
  expect(result.coverage).toBe('partial');
  expect(result.truncated).toBe(true);
  expect(result.findings.length).toBeLessThanOrEqual(ATLAS_QA_LIMITS.findings);
  expect(result.findings.map((f) => f.code)).toContain('ATLAS_INSPECTION_PARTIAL');
});

test('unused material groups cannot impose sampler failures on drawn atlas use', async () => {
  const { atlas, mesh, root } = await fixture();
  const unused = atlas.clone();
  unused.wrapS = THREE.RepeatWrapping;
  mesh.material = [
    mesh.material as THREE.Material,
    new THREE.MeshStandardMaterial({ map: unused }),
  ];
  mesh.geometry.addGroup(0, 6, 0);
  expect(codes(root)).toEqual([]);
});

test('shared portable material owner emits atlas findings through both material QA callers', async () => {
  const { mesh, root } = await fixture();
  mesh.geometry.getAttribute('uv').setX(0, 9);
  expect(inspectPortableSceneMaterials(root).map((f) => f.code)).toContain('ATLAS_UV_DOMAIN');
});

test('saved records, effective sampler overrides, typed UVs and companion layouts remain source compatible', async () => {
  const { atlas, mesh, root } = await fixture();
  const p = structuredClone(atlas.userData.kilnAtlas) as AtlasProvenanceV1;
  delete atlas.userData.kilnAtlas;
  atlas.userData.kilnMaterialResource = { map: { recipe: { kind: 'atlas', ...p } } };
  atlas.userData.kilnPortableBinding = {
    schemaVersion: 3,
    slot: 'baseColor',
    sampler: { ...p.manifest.sampler, wrapS: 'repeat' },
  };
  atlas.wrapS = THREE.RepeatWrapping;
  expect(codes(root)).toEqual([]);
  const uv = mesh.geometry.getAttribute('uv');
  const half = new THREE.Float16BufferAttribute(new Uint16Array(uv.count * 2), 2);
  for (let i = 0; i < uv.count; i++) half.setXY(i, uv.getX(i), uv.getY(i));
  mesh.geometry.setAttribute('uv', half);
  expect(codes(root)).toEqual([]);
  mesh.geometry.setAttribute(
    'uv',
    new THREE.Uint16BufferAttribute(new Uint16Array(uv.count * 2).fill(16384), 2, true),
  );
  expect(codes(root)).toEqual([]);
  const interleaved = new THREE.InterleavedBuffer(new Float32Array(uv.count * 3), 3);
  const attr = new THREE.InterleavedBufferAttribute(interleaved, 2, 1);
  for (let i = 0; i < uv.count; i++) attr.setXY(i, uv.getX(i), uv.getY(i));
  mesh.geometry.setAttribute('uv', attr);
  expect(codes(root)).toEqual([]);
  const companion = await textureAtlas({
    ...p.spec,
    usage: 'normal',
    regions: p.spec.regions.map((r) => ({
      ...r,
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: 4,
          height: 4,
          usage: 'normal',
          background: [128, 128, 255, 255],
          operations: [],
        },
      },
    })),
  });
  (mesh.material as THREE.MeshStandardMaterial).normalMap = companion;
  expect(codes(root)).toEqual([]);
  companion.userData.kilnAtlas.manifest.layoutHash = `sha256:${'f'.repeat(64)}`;
  expect(codes(root)).toContain('ATLAS_METADATA_INVALID');
});

test('zero draw ranges skip named obligations; actual atlas dimensions and channels cannot drift', async () => {
  const { atlas, mesh, root } = await fixture();
  mesh.geometry.getAttribute('uv').setX(0, 9);
  mesh.geometry.setDrawRange(0, 0);
  expect(codes(root)).toEqual([]);
  mesh.geometry.setDrawRange(0, Infinity);
  mesh.geometry.getAttribute('uv').setX(0, 0.2);
  atlas.image.width = 8;
  expect(codes(root)).toContain('ATLAS_METADATA_INVALID');
  atlas.image.width = 16;
  atlas.channel = 1;
  expect(codes(root)).toContain('ATLAS_BINDING_TRANSFORM');
});

test('malformed ranges and ordinary traversal limits preserve partial coverage', async () => {
  const { mesh, root } = await fixture();
  mesh.geometry.drawRange.start = Number.NaN;
  expect(inspectAtlasScene(root).coverage).toBe('partial');
  expect(codes(root)).toContain('ATLAS_INSPECTION_PARTIAL');
  const ordinary = new THREE.Group();
  for (let i = 0; i < ATLAS_QA_LIMITS.nodes + 1; i++) ordinary.add(new THREE.Object3D());
  const result = inspectAtlasScene(ordinary);
  expect(result.coverage).toBe('partial');
  expect(result.findings).toEqual([]);
  expect(result.nodesChecked).toBeLessThanOrEqual(ATLAS_QA_LIMITS.nodes);
});

test('unique texture bound stops provenance normalization before extra shared-owner work', async () => {
  const { atlas, mesh } = await fixture();
  const root = new THREE.Group();
  for (let i = 0; i < ATLAS_QA_LIMITS.textures + 2; i++)
    root.add(new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ map: atlas.clone() })));
  const spy = spyOn(atlasProvenance, 'readAtlasTextureProvenance');
  try {
    const result = inspectAtlasScene(root);
    expect(result.coverage).toBe('partial');
    expect(spy.mock.calls.length).toBeLessThanOrEqual(ATLAS_QA_LIMITS.textures);
    expect(result.findings.map((f) => f.code)).toContain('ATLAS_INSPECTION_PARTIAL');
    expect(result.findings.filter((f) => f.disposition === 'block')).toEqual([]);
  } finally {
    spy.mockRestore();
  }
});

test('UV visits stop at the exact work cap and per-instance UVs cannot masquerade as per-vertex', async () => {
  const { mesh, root } = await fixture();
  const uv = mesh.geometry.getAttribute('uv');
  const instanced = new THREE.InstancedBufferAttribute(new Float32Array(uv.array), 2);
  mesh.geometry.setAttribute('uv', instanced);
  expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
  mesh.geometry.setAttribute('uv', uv);
  mesh.geometry.setIndex(
    new THREE.BufferAttribute(new Uint32Array(ATLAS_QA_LIMITS.uvVisits + 3), 1),
  );
  const result = inspectAtlasScene(root);
  expect(result.uvVerticesChecked).toBe(ATLAS_QA_LIMITS.uvVisits);
  expect(result.coverage).toBe('partial');
  expect(result.findings.map((f) => f.code)).toContain('ATLAS_INSPECTION_PARTIAL');
});

test('unmeasured valid bindings after the binding cap are partial observations, never fabricated failures', async () => {
  const { mesh, atlas } = await fixture();
  const root = new THREE.Group();
  for (let i = 0; i < ATLAS_QA_LIMITS.bindings + 2; i++)
    root.add(new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ map: atlas })));
  const result = inspectAtlasScene(root);
  expect(result.coverage).toBe('partial');
  expect(result.findings.filter((f) => f.disposition === 'block')).toEqual([]);
});

test('normalized integer and half-float boundary quantization preserves the intended source region domain', async () => {
  const { mesh, root } = await fixture();
  const uv = mesh.geometry.getAttribute('uv');
  const quantized = new THREE.Uint16BufferAttribute(
    Array.from(uv.array, (v) => Math.round(v * 65535)),
    2,
    true,
  );
  mesh.geometry.setAttribute('uv', quantized);
  expect(codes(root)).toEqual([]);
  quantized.setX(0, 0.75);
  expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
  mesh.geometry.setAttribute('uv', uv);
  const alternate = await textureAtlas({
    schemaVersion: 1,
    width: 13,
    height: 13,
    usage: 'albedo',
    regions: [
      {
        name: 'panel',
        content: { x: 2, y: 2, width: 4, height: 4 },
        source: {
          kind: 'procedural',
          spec: { schemaVersion: 3, width: 4, height: 4, operations: [] },
        },
      },
    ],
  });
  const unit = new THREE.PlaneGeometry();
  const mapped = remapUVToAtlas(unit, alternate, 'panel', {
    inputOrigin: 'bottom-left',
    mode: 'texel-center',
  });
  const mappedUv = mapped.getAttribute('uv'),
    half = new THREE.Float16BufferAttribute(new Uint16Array(mappedUv.count * 2), 2);
  for (let i = 0; i < half.count; i++) half.setXY(i, mappedUv.getX(i), mappedUv.getY(i));
  mapped.setAttribute('uv', half);
  const alternateRoot = new THREE.Mesh(mapped, new THREE.MeshStandardMaterial({ map: alternate }));
  expect(codes(alternateRoot)).toEqual([]);
  half.setY(0, 0.75);
  expect(codes(alternateRoot)).toContain('ATLAS_UV_DOMAIN');
});

test('triangle-list draw and group trailing remainders do not reference UVs before a complete triangle', async () => {
  for (const indexed of [true, false]) {
    const { mesh, root } = await fixture();
    if (!indexed) mesh.geometry.setIndex(null);
    mesh.geometry.getAttribute('uv').setXY(3, 9, 9);
    mesh.geometry.setDrawRange(0, 4);
    expect(codes(root)).toEqual([]);
    mesh.geometry.setDrawRange(0, 6);
    expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
    mesh.material = [mesh.material as THREE.Material];
    mesh.geometry.clearGroups();
    mesh.geometry.addGroup(0, 4, 0);
    expect(codes(root)).toEqual([]);
    mesh.geometry.groups[0]!.count = 6;
    expect(codes(root)).toContain('ATLAS_UV_DOMAIN');
  }
});

test('validated reimport without decoded dimensions is partial and retains the effective imported sampler override', async () => {
  const { atlas, root } = await fixture();
  atlas.userData.kilnPortableBinding = {
    schemaVersion: 3,
    slot: 'baseColor',
    sampler: {
      minFilter: 'linear',
      magFilter: 'linear',
      wrapS: 'repeat',
      wrapT: 'mirrored-repeat',
    },
  };
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.wrapT = THREE.MirroredRepeatWrapping;
  expect(codes(root)).toEqual([]);
  const glb = await renderSceneToGLB(root, { optimize: 'off' });
  const loaded = await loadGlbReviewScene(glb.bytes);
  const result = inspectAtlasScene(loaded.root);
  expect(result.coverage).toBe('partial');
  expect(result.findings.filter((f) => f.disposition === 'block')).toEqual([]);
  expect(result.findings.map((f) => f.code)).toContain('ATLAS_INSPECTION_PARTIAL');
  let imported: THREE.Texture | undefined;
  loaded.root.traverse((node) => {
    const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (material?.map) imported = material.map;
  });
  expect(imported).toBeDefined();
  imported!.wrapS = THREE.ClampToEdgeWrapping;
  expect(codes(loaded.root)).toContain('ATLAS_SAMPLER_MISMATCH');
  const fake = atlas.clone();
  delete fake.userData.kilnPortableBinding;
  fake.userData.kilnValidatedAtlasDelivery = { effectiveSampler: { wrapS: 10497 } };
  expect(atlasProvenance.readValidatedAtlasDelivery(fake)).toBeUndefined();
  const fakeRoot = new THREE.Mesh(
    new THREE.PlaneGeometry(),
    new THREE.MeshStandardMaterial({ map: fake }),
  );
  expect(codes(fakeRoot)).toContain('ATLAS_SAMPLER_MISMATCH');
});
