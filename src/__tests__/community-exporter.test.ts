import { afterEach, expect, test } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { createLocalToolContext } from '../local-runtime';
import { renderSceneToGLB, optimizeGlbBytes } from '../render';

const previous = process.env['KILN_GLTF_EXPORTER'];
afterEach(() => {
  if (previous === undefined) delete process.env['KILN_GLTF_EXPORTER'];
  else process.env['KILN_GLTF_EXPORTER'] = previous;
});
function fixture() {
  const root = new THREE.Group();
  root.name = 'Asset';
  const pivot = new THREE.Group();
  pivot.name = 'Joint_Vane';
  pivot.position.set(0.2, 1.1, -0.3);
  root.add(pivot);
  const geometry = new THREE.BoxGeometry(0.6, 0.2, 0.01);
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(24).fill([1, 0, 0]).flat(), 3),
  );
  geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: 0x4477aa,
      metalness: 0.65,
      roughness: 0.27,
      clearcoat: 0.8,
      transmission: 0.5,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
  );
  mesh.name = 'Mesh_Pennant';
  mesh.userData['privatePayload'] = 'do not export';
  // Plain JSON exports as extras (R48); an engine key and a non-JSON value never do.
  mesh.userData['kilnPrivate'] = 'engine only';
  mesh.userData['handle'] = new THREE.Vector3(1, 2, 3);
  pivot.add(mesh);
  return root;
}
const io = () => new WebIO().registerExtensions(ALL_EXTENSIONS);

test('experimental exporter preserves attributes and physical extensions and only plain author metadata', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const result = await renderSceneToGLB(fixture(), { optimize: 'off', derivative: true });
  expect(result.gltfValidation.issues.numErrors).toBe(0);
  const doc = await io().readBinary(result.bytes);
  const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  expect(primitive.getAttribute('COLOR_0')).not.toBeNull();
  expect(primitive.getAttribute('TEXCOORD_1')).not.toBeNull();
  expect(
    doc
      .getRoot()
      .listExtensionsUsed()
      .map((extension) => extension.extensionName),
  ).toContain('KHR_materials_clearcoat');
  expect(
    doc
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === 'Mesh_Pennant')!
      .getExtras(),
  ).toEqual({ privatePayload: 'do not export' });
  expect(result.warnings.join(' ')).toContain('Mesh_Pennant userData.handle (a Vector3)');
  expect(result.warnings.some((warning) => warning.includes('color is not preserved'))).toBe(false);
});

test('existing exporter stays the default and candidate selection fails closed on typos', async () => {
  delete process.env['KILN_GLTF_EXPORTER'];
  const baseline = await renderSceneToGLB(fixture(), { optimize: 'off', derivative: true });
  process.env['KILN_GLTF_EXPORTER'] = 'legacy';
  expect((await renderSceneToGLB(fixture(), { optimize: 'off', derivative: true })).bytes).toEqual(
    baseline.bytes,
  );
  process.env['KILN_GLTF_EXPORTER'] = 'thre';
  expect(renderSceneToGLB(fixture())).rejects.toThrow('KILN_GLTF_EXPORTER');
});

test('physical extensions survive downstream optimization', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const result = await renderSceneToGLB(fixture(), { optimize: 'off', derivative: true });
  const optimized = await optimizeGlbBytes(result.bytes, { mode: 'palette' });
  expect(optimized).toBeDefined();
  const doc = await io().readBinary(optimized!.bytes);
  expect(
    doc
      .getRoot()
      .listExtensionsUsed()
      .map((extension) => extension.extensionName),
  ).toContain('KHR_materials_clearcoat');
});

test('headless textures retain pixels and source state across concurrent exports', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  >;
  const pixels = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  const texture = new THREE.DataTexture(pixels, 2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  const source = texture.source;
  const sourceImage = texture.image;
  mesh.material.map = texture;
  const [a, b] = await Promise.all([
    renderSceneToGLB(root, { derivative: true }),
    renderSceneToGLB(root, { derivative: true }),
  ]);
  expect(a.bytes).toEqual(b.bytes);
  const doc = await io().readBinary(a.bytes);
  const image = doc.getRoot().listTextures()[0]!.getImage()!;
  expect(new Uint8Array(await sharp(image).ensureAlpha().raw().toBuffer())).toEqual(pixels);
  expect(mesh.material.map).toBe(texture);
  expect(texture.source).toBe(source);
  expect(texture.image).toBe(sourceImage);
  expect(mesh.userData['privatePayload']).toBe('do not export');
  // Under 1 s locally, but this is the file's first sharp decode, so it pays
  // libvips start-up; a loaded Windows runner has taken 5.8 s for it.
}, 30_000);

test('candidate preserves morph and skin data and does not mutate bone references', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(24 * 4), 4));
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(new Array(24).fill([1, 0, 0, 0]).flat(), 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const bone = new THREE.Bone();
  bone.name = 'Bone';
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  root.add(mesh);
  const result = await renderSceneToGLB(root, { derivative: true, geometryPolicy: 'strict' });
  const doc = await io().readBinary(result.bytes);
  expect(doc.getRoot().listSkins()).toHaveLength(1);
  expect(doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.listTargets()).toHaveLength(1);
  expect(mesh.skeleton.bones[0]).toBe(bone);
});

test('candidate retains sprite quad geometry and camera-facing semantics', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xff4400, opacity: 0.5, transparent: true }),
  );
  sprite.name = 'Card';
  sprite.material.name = 'SmokeMaterial';
  sprite.center.set(0, 0);
  sprite.position.set(1, 2, 3);
  root.add(sprite);
  const result = await renderSceneToGLB(root, { derivative: true });
  const doc = await io().readBinary(result.bytes);
  const card = doc
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === 'Card')!;
  expect(card.getTranslation()).toEqual([1, 2, 3]);
  expect(card.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!.getCount()).toBe(4);
  expect(card.getMesh()!.listPrimitives()[0]!.getMaterial()!.getName()).toBe('SmokeMaterial');
  expect(JSON.stringify(card.getExtras())).toContain('vfx.facing.camera-spherical');
  expect(root.children[0]).toBe(sprite);
});

test('local subprocess carries the host exporter choice without ambient environment', async () => {
  const local = createLocalToolContext({}, { KILN_GLTF_EXPORTER: 'three' });
  const result = await local.evaluatorPort!.render(
    `function build(){const root=createRoot('Root');const g=boxGeo(1,1,1);g.setAttribute('color',new THREE.Float32BufferAttribute(new Array(24).fill([1,0,0]).flat(),3));createPart('Body',g,new THREE.MeshStandardMaterial({vertexColors:true}),{parent:root});return root;}`,
  );
  const doc = await io().readBinary(result.glb);
  expect(
    doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('COLOR_0'),
  ).not.toBeNull();
  expect(local.localExecution.mode).toBe('subprocess');
});

test('candidate rejects invalid material groups before upstream export', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh;
  mesh.material = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  mesh.geometry.clearGroups();
  mesh.geometry.addGroup(0, 3, 4);
  await expect(renderSceneToGLB(root, { derivative: true })).rejects.toThrow('material');
});

test('candidate rejects overlapping material groups', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh;
  mesh.material = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  mesh.geometry.clearGroups();
  mesh.geometry.addGroup(0, 36, 0);
  mesh.geometry.addGroup(0, 36, 1);
  await expect(renderSceneToGLB(root, { derivative: true })).rejects.toThrow('material groups');
});

test('candidate keeps transformed Scene roots as named transform nodes', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const root = new THREE.Scene();
  root.name = 'MovedScene';
  root.position.set(1, 2, 3);
  root.add(fixture());
  const result = await renderSceneToGLB(root, { derivative: true });
  const doc = await io().readBinary(result.bytes);
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'MovedScene');
  expect(node?.getTranslation()).toEqual([1, 2, 3]);
});

test('unresolved advisory animation tracks do not produce invalid empty glTF animations', async () => {
  process.env['KILN_GLTF_EXPORTER'] = 'three';
  const clip = new THREE.AnimationClip('Missing', 1, [
    new THREE.VectorKeyframeTrack('NoSuchNode.position', [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const result = await renderSceneToGLB(fixture(), { clips: [clip], derivative: true });
  expect(result.gltfValidation.issues.numErrors).toBe(0);
  expect((await io().readBinary(result.bytes)).getRoot().listAnimations()).toHaveLength(0);
  expect(result.warnings.some((w) => w.includes('NoSuchNode'))).toBe(true);
});

test('candidate preserves texture rotation around a nonzero center without mutating source', async () => {
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  >;
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  texture.offset.set(0.2, -0.1);
  texture.repeat.set(1.3, 1.3);
  texture.center.set(0.4, 0.6);
  texture.rotation = 0.35;
  texture.updateMatrix();
  const originalMatrix = texture.matrix.clone();
  mesh.material.map = texture;
  const result = await renderSceneToGLB(root, { gltfExporter: 'three', derivative: true });
  const json = (await io().writeJSON(await io().readBinary(result.bytes))).json;
  const transform = json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!.extensions![
    'KHR_texture_transform'
  ] as { offset: number[]; scale: number[]; rotation: number };
  const c = Math.cos(transform.rotation);
  const s = Math.sin(transform.rotation);
  const restored = new THREE.Matrix3().set(
    transform.scale[0]! * c,
    transform.scale[1]! * s,
    transform.offset[0]!,
    -transform.scale[0]! * s,
    transform.scale[1]! * c,
    transform.offset[1]!,
    0,
    0,
    1,
  );
  for (let i = 0; i < 9; i++)
    expect(restored.elements[i]).toBeCloseTo(originalMatrix.elements[i]!, 6);
  expect(texture.center.toArray()).toEqual([0.4, 0.6]);
  expect(texture.offset.toArray()).toEqual([0.2, -0.1]);
  expect(texture.matrix.equals(originalMatrix)).toBe(true);
});

test('candidate refuses sheared UV transforms instead of silently changing texture placement', async () => {
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  >;
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  texture.name = 'ShearedSail';
  texture.repeat.set(1.7, 1.3);
  texture.rotation = 0.35;
  mesh.material.map = texture;
  await expect(renderSceneToGLB(root, { gltfExporter: 'three', derivative: true })).rejects.toThrow(
    'ShearedSail: UV matrix contains shear',
  );
});

test('candidate preserves a manual glTF-order UV matrix', async () => {
  const root = fixture();
  const mesh = root.getObjectByName('Mesh_Pennant') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  >;
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  texture.matrixAutoUpdate = false;
  const c = Math.cos(0.3),
    s = Math.sin(0.3);
  texture.matrix.set(1.7 * c, 1.3 * s, 0.2, -1.7 * s, 1.3 * c, -0.1, 0, 0, 1);
  mesh.material.map = texture;
  const result = await renderSceneToGLB(root, { gltfExporter: 'three', derivative: true });
  const json = (await io().writeJSON(await io().readBinary(result.bytes))).json;
  const transform = json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!.extensions![
    'KHR_texture_transform'
  ] as { offset: number[]; scale: number[]; rotation: number };
  expect(transform.offset).toEqual([0.2, -0.1]);
  expect(transform.scale[0]).toBeCloseTo(1.7, 6);
  expect(transform.scale[1]).toBeCloseTo(1.3, 6);
  expect(transform.rotation).toBeCloseTo(0.3, 6);
  expect(texture.matrixAutoUpdate).toBe(false);
  expect(texture.offset.toArray()).toEqual([0, 0]);
});

test('physical material factors survive export and palette rewrite', async () => {
  const root = fixture();
  const material = (root.getObjectByName('Mesh_Pennant') as THREE.Mesh)
    .material as THREE.MeshPhysicalMaterial;
  material.clearcoat = 0.7;
  material.clearcoatRoughness = 0.23;
  material.transmission = 0.65;
  material.thickness = 0.4;
  material.attenuationDistance = 2.5;
  material.attenuationColor.setRGB(0.2, 0.4, 0.6);
  material.ior = 1.4;
  material.specularIntensity = 0.55;
  material.specularColor.setRGB(0.7, 0.8, 0.9);
  material.sheen = 0.6;
  material.sheenColor.setRGB(0.3, 0.5, 0.7);
  material.sheenRoughness = 0.4;
  material.iridescence = 0.35;
  material.iridescenceIOR = 1.6;
  material.iridescenceThicknessRange = [110, 370];
  material.anisotropy = 0.45;
  material.anisotropyRotation = 0.2;
  const original = await renderSceneToGLB(root, { gltfExporter: 'three', derivative: true });
  const rewritten = await optimizeGlbBytes(original.bytes, { mode: 'palette' });
  if (!rewritten) throw new Error('Expected palette rewrite result');
  for (const bytes of [original.bytes, rewritten.bytes]) {
    const json = (await io().writeJSON(await io().readBinary(bytes))).json;
    const output = json.materials![0]!;
    expect(output.doubleSided).toBe(true);
    expect(output.pbrMetallicRoughness!.metallicFactor).toBe(0.65);
    expect(output.pbrMetallicRoughness!.roughnessFactor).toBe(0.27);
    expect(output.extensions).toMatchObject({
      KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.23 },
      KHR_materials_transmission: { transmissionFactor: 0.65 },
      KHR_materials_volume: {
        thicknessFactor: 0.4,
        attenuationDistance: 2.5,
        attenuationColor: [0.2, 0.4, 0.6],
      },
      KHR_materials_ior: { ior: 1.4 },
      KHR_materials_specular: { specularFactor: 0.55, specularColorFactor: [0.7, 0.8, 0.9] },
      KHR_materials_sheen: { sheenColorFactor: [0.18, 0.3, 0.42], sheenRoughnessFactor: 0.4 },
      KHR_materials_iridescence: {
        iridescenceFactor: 0.35,
        iridescenceIor: 1.6,
        iridescenceThicknessMinimum: 110,
        iridescenceThicknessMaximum: 370,
      },
      KHR_materials_anisotropy: { anisotropyStrength: 0.45, anisotropyRotation: 0.2 },
    });
  }
});

test('emissive intensity survives both exporters and a palette rewrite', async () => {
  // Four distinct materials so the palette pass actually merges them.
  const root = new THREE.Group();
  root.name = 'Asset';
  const colours = [0x884422, 0x224488, 0x448822, 0x888888];
  colours.forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    if (index === 0) {
      material.emissive.setHex(0xff8000);
      material.emissiveIntensity = 8;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), material);
    mesh.name = `Mesh_Block${index}`;
    mesh.position.x = index * 0.3;
    root.add(mesh);
  });
  const authored = new THREE.Color(0xff8000).multiplyScalar(8).toArray();

  for (const gltfExporter of ['legacy', 'three'] as const) {
    const original = await renderSceneToGLB(root, { gltfExporter, derivative: true });
    const rewritten = await optimizeGlbBytes(original.bytes, { mode: 'palette' });
    if (!rewritten?.summary) throw new Error('Expected palette rewrite result');
    expect(rewritten.summary.materialsAfter).toBeLessThan(rewritten.summary.materialsBefore);
    for (const bytes of [original.bytes, rewritten.bytes]) {
      const json = (await io().writeJSON(await io().readBinary(bytes))).json;
      const glowing = json.materials!.filter((material) =>
        (material.emissiveFactor ?? [0, 0, 0]).some((channel) => channel > 0),
      );
      expect(glowing).toHaveLength(1);
      const strength =
        (
          glowing[0]!.extensions?.['KHR_materials_emissive_strength'] as
            | { emissiveStrength: number }
            | undefined
        )?.emissiveStrength ?? 1;
      const emitted = glowing[0]!.emissiveFactor!.map((channel) => channel * strength);
      for (let i = 0; i < 3; i++) expect(emitted[i]!).toBeCloseTo(authored[i]!, 5);
    }
  }
});
