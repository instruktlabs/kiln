import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { renderSceneToGLB } from '../../render';
import { withoutHiddenMeshes } from '../camera';
import { collectTriangles, measureBounds } from '../raster';
import { cloneReviewScene } from '../scene-copy';

function skinFixture(detached = false) {
  const root = new THREE.Group();
  root.name = 'Root';
  root.position.set(2, 1, -3);
  root.rotation.y = 0.3;
  root.scale.set(1.2, 0.8, 1);
  const geometry = new THREE.BoxGeometry(0.2, 1, 0.2);
  geometry.translate(0, 0.5, 0);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      4,
    ),
  );
  const mesh: THREE.SkinnedMesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'Surface';
  const bone = new THREE.Bone();
  bone.name = 'Joint';
  (detached ? root : mesh).add(bone);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone]));
  if (detached) mesh.bindMode = THREE.DetachedBindMode;
  bone.rotation.z = 0.7;
  root.updateMatrixWorld(true);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshStandardMaterial());
  hidden.name = 'Hidden';
  hidden.visible = false;
  root.add(hidden);
  return { root, mesh, bone, hidden };
}

function points(mesh: THREE.SkinnedMesh) {
  mesh.updateWorldMatrix(true, false);
  for (const bone of mesh.skeleton.bones) bone.updateWorldMatrix(true, false);
  return Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) =>
    mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray(),
  );
}

function expectPoints(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, vertex] of actual.entries())
    for (const [axis, value] of vertex.entries()) expect(value).toBeCloseTo(expected[i]![axis]!, 6);
}

for (const detached of [false, true])
  test(`hidden-sibling copy owns bones and preserves posed export (detached=${detached})`, async () => {
    const { root, mesh, bone, hidden } = skinFixture(detached);
    const expected = points(mesh);
    const copy = withoutHiddenMeshes(root);
    const copiedMesh = copy.getObjectByName('Surface') as THREE.SkinnedMesh;
    expect(copy).not.toBe(root);
    expect(copy.getObjectByName('Hidden')).toBeUndefined();
    expect(copiedMesh.skeleton).not.toBe(mesh.skeleton);
    expect(copiedMesh.skeleton.bones[0]).toBe(copy.getObjectByName('Joint') as THREE.Bone);
    expectPoints(points(copiedMesh), expected);
    const exported = await renderSceneToGLB(copy, {
      gltfExporter: 'three',
      derivative: true,
      optimize: 'off',
    });
    const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(exported.bytes).buffer, '');
    const imported = loaded.scene.getObjectByName('Surface') as THREE.SkinnedMesh;
    expectPoints(points(imported), expected);
    copiedMesh.skeleton.bones[0]!.rotation.z = -0.4;
    expect(points(copiedMesh)).not.toEqual(expected);
    expectPoints(points(mesh), expected);
    expect(bone.rotation.z).toBe(0.7);
    expect(hidden.parent).toBe(root);
    expect(hidden.visible).toBe(false);
  });

test('hidden bone ancestry survives as transforms without bringing hidden geometry back', async () => {
  const { root, mesh, bone, hidden } = skinFixture(true);
  hidden.add(bone);
  hidden.position.set(0.2, 0.1, 0);
  const unwanted = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial());
  unwanted.name = 'HiddenChild';
  hidden.add(unwanted);
  root.updateMatrixWorld(true);
  const expected = points(mesh);
  const expectedTriangles = collectTriangles(root).tris.length;
  const copy = withoutHiddenMeshes(root);
  const copiedMesh = copy.getObjectByName('Surface') as THREE.SkinnedMesh;
  expect(copiedMesh.skeleton.bones[0]).toBe(copy.getObjectByName('Joint') as THREE.Bone);
  expect(copy.getObjectByName('Joint')).toBeDefined();
  expect(copy.getObjectByName('Hidden')).not.toHaveProperty('isMesh', true);
  expect(copy.getObjectByName('HiddenChild')).toBeUndefined();
  expect(collectTriangles(copy).tris).toHaveLength(expectedTriangles);
  expectPoints(points(copiedMesh), expected);
  const exported = await renderSceneToGLB(copy, {
    gltfExporter: 'three',
    derivative: true,
    optimize: 'off',
  });
  const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(exported.bytes).buffer, '');
  expectPoints(points(loaded.scene.getObjectByName('Surface') as THREE.SkinnedMesh), expected);
  expect(hidden.children).toEqual([bone, unwanted]);
  expect(hidden.visible).toBe(false);
});

test('pruning an unused hidden unbound skin leaves ordinary visible geometry unchanged', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const hidden = new THREE.SkinnedMesh();
  hidden.visible = false;
  root.add(hidden);
  expect(measureBounds(withoutHiddenMeshes(root))).toEqual(measureBounds(root));
  root.remove(hidden);
  expect(withoutHiddenMeshes(root)).toBe(root);
  root.visible = false;
  expect(collectTriangles(withoutHiddenMeshes(root)).tris).toHaveLength(0);
  expect(root.children).toHaveLength(1);
});

test('an incomplete review root diagnoses external skeleton dependencies before copying', () => {
  const { root, mesh } = skinFixture(true);
  const incomplete = new THREE.Group();
  incomplete.add(mesh);
  const hidden = new THREE.Group();
  hidden.visible = false;
  incomplete.add(hidden);
  expect(() => withoutHiddenMeshes(incomplete)).toThrow(/Joint.*outside.*review/i);
  expect(mesh.skeleton.bones[0]!.parent).toBe(root);
});

test('two-sided copies own material arrays and morph state while sharing immutable geometry', () => {
  const { root, mesh } = skinFixture();
  mesh.material = [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
  ];
  mesh.geometry.morphAttributes.position = [mesh.geometry.getAttribute('position').clone()];
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences![0] = 0.3;
  const copied = cloneReviewScene(root, { omitHidden: true, doubleSided: true });
  const skin = copied.getObjectByName('Surface') as THREE.SkinnedMesh;
  expect(skin.geometry).toBe(mesh.geometry);
  expect(skin.material).not.toBe(mesh.material);
  expect((skin.material as THREE.Material[]).map((material) => material.side)).toEqual([
    THREE.DoubleSide,
    THREE.DoubleSide,
  ]);
  expect(mesh.material.map((material) => material.side)).toEqual([THREE.FrontSide, THREE.BackSide]);
  skin.morphTargetInfluences![0] = 0.8;
  expect(mesh.morphTargetInfluences![0]).toBe(0.3);
  skin.skeleton.boneInverses[0]!.elements[12] = 99;
  expect(mesh.skeleton.boneInverses[0]!.elements[12]).not.toBe(99);
  root.visible = false;
  expect(
    collectTriangles(cloneReviewScene(root, { omitHidden: true, doubleSided: true })).tris,
  ).toHaveLength(0);
});

test('a visible unbound skin gives an actionable copy error', () => {
  const root = new THREE.Group();
  const mesh = new THREE.SkinnedMesh();
  mesh.name = 'Unbound';
  root.add(mesh);
  expect(() => cloneReviewScene(root)).toThrow('Review skin Unbound has no skeleton.');
});
