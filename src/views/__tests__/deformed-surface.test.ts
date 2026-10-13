import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import { createGltfIO } from '../../gltf-io';
import { executeKilnCode, renderSceneToGLB } from '../../render';
import { loadGlbReviewScene, loadGlbGeometryFlatScene } from '../glb';
import { renderClipAnimation } from '../index';
import { poseSceneAtTime, prepareClip } from '../pose';
import { decodePng } from '../png';
import {
  collectTriangles,
  createPartBoundsReader,
  measureBounds,
  measurePartBounds,
} from '../raster';

function fixture(relative: boolean, detached: boolean) {
  const root = new THREE.Group();
  root.position.set(0.3, 0.2, -0.4);
  root.rotation.y = 0.3;
  root.scale.set(1.1, 0.9, 1);
  const geometry = new THREE.PlaneGeometry(1, 2, 1, 2);
  const position = geometry.getAttribute('position');
  const joints: number[] = [],
    weights: number[] = [];
  const morph = position.clone();
  for (let i = 0; i < position.count; i++) {
    const blend = (position.getY(i) + 1) / 2;
    joints.push(0, 1, 0, 0);
    weights.push(1 - blend, blend, 0, 0);
    morph.setXYZ(i, relative ? 0 : position.getX(i), relative ? 0 : position.getY(i), 0.4 * blend);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.morphAttributes.position = [morph];
  geometry.morphTargetsRelative = relative;
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'Surface';
  const base = new THREE.Bone(),
    tip = new THREE.Bone();
  base.name = 'Base';
  tip.name = 'Tip';
  tip.position.y = 1;
  base.add(tip);
  (detached ? root : mesh).add(base);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([base, tip]));
  if (detached) mesh.bindMode = THREE.DetachedBindMode;
  return { root, mesh, tip };
}

function referenceBounds(mesh: THREE.Mesh) {
  const box = new THREE.Box3();
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++)
    box.expandByPoint(
      mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),
    );
  return { min: box.min.toArray(), max: box.max.toArray() };
}

function closeBounds(
  actual: ReturnType<typeof measurePartBounds>,
  expected: ReturnType<typeof referenceBounds>,
  precision = 10,
) {
  expect(actual).not.toBeNull();
  for (const side of ['min', 'max'] as const)
    for (let axis = 0; axis < 3; axis++)
      expect(actual![side][axis]).toBeCloseTo(expected[side][axis]!, precision);
}

for (const relative of [false, true])
  for (const detached of [false, true]) {
    test(`surface review follows combined morph/skin deformation (relative=${relative}, detached=${detached})`, () => {
      const { root, mesh, tip } = fixture(relative, detached);
      const original = [...mesh.geometry.getAttribute('position').array];
      const rest = measureBounds(root);
      tip.rotation.z = 0.8;
      mesh.morphTargetInfluences![0] = 0.7;
      root.updateMatrixWorld(true);
      const expected = referenceBounds(mesh);
      expect(expected).not.toEqual(rest);
      closeBounds(measureBounds(root), expected);
      closeBounds(measurePartBounds(mesh), expected);
      const reader = createPartBoundsReader(root);
      closeBounds(reader(mesh), expected);
      closeBounds(reader(root), expected);
      const { tris } = collectTriangles(root);
      const index = mesh.geometry.index!;
      for (let i = 0; i < index.count; i++) {
        const vertex = mesh
          .getVertexPosition(index.getX(i), new THREE.Vector3())
          .applyMatrix4(mesh.matrixWorld);
        for (let axis = 0; axis < 3; axis++)
          expect(tris[Math.floor(i / 3)]!.v[(i % 3) * 3 + axis]).toBeCloseTo(
            vertex.getComponent(axis),
            10,
          );
      }
      expect([...mesh.geometry.getAttribute('position').array]).toEqual(original);
    });
  }

test('isolated surface measurement refreshes changed ancestors and skeletons outside the selected subtree', () => {
  const { root, mesh, tip } = fixture(true, true);
  root.position.x += 2;
  tip.rotation.z = -0.6;
  const actual = measurePartBounds(mesh); // No preceding whole-scene update.
  root.updateMatrixWorld(true);
  closeBounds(actual, referenceBounds(mesh));
});

test('exact GLB review and derivative CPU geometry retain skin joints, binding and sampled pose', async () => {
  const { root, mesh } = fixture(false, false);
  mesh.geometry.morphAttributes = {};
  mesh.morphTargetInfluences = undefined;
  mesh.morphTargetDictionary = undefined;
  const end = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.8);
  const clip = new THREE.AnimationClip('Bend', 1, [
    new THREE.QuaternionKeyframeTrack('Tip.quaternion', [0, 1], [0, 0, 0, 1, ...end.toArray()]),
  ]);
  const exported = await renderSceneToGLB(root, {
    gltfExporter: 'three',
    derivative: true,
    clips: [clip],
    optimize: 'off',
  });
  const review = await loadGlbReviewScene(exported.bytes);
  expect(review.reasonCodes).not.toContain('GLB_FLAT_SKIN_DEFORMATION_UNSUPPORTED');
  expect(review.root.getObjectByName('Tip')).toHaveProperty('isBone', true);
  const plan = prepareClip(review.root, review.clips[0]!);
  expect(plan.unresolved).toEqual([]);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  for (const time of [0, 0.5, 1]) {
    poseSceneAtTime(review.root, plan, time);
    mixer.setTime(time);
    root.updateMatrixWorld(true);
    const expected = referenceBounds(mesh);
    closeBounds(measureBounds(review.root), expected, 6);
    const derivative = await renderSceneToGLB(review.root, {
      gltfExporter: 'three',
      derivative: true,
      optimize: 'off',
    });
    const flat = await loadGlbGeometryFlatScene(derivative.bytes);
    expect(flat.reasonCodes).not.toContain('GLB_FLAT_SKIN_DEFORMATION_UNSUPPORTED');
    closeBounds(measureBounds(flat.root), expected, 6);
  }
});

function nativeSkinDocument() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const joints = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint8Array(12))
    .setBuffer(buffer);
  const weights = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]))
    .setNormalized(true)
    .setBuffer(buffer);
  const joint = doc.createNode('Joint').setTranslation([2, 3, 0]);
  const skin = doc.createSkin().addJoint(joint);
  const material = doc.createMaterial().setDoubleSided(true);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', positions)
    .setAttribute('JOINTS_0', joints)
    .setAttribute('WEIGHTS_0', weights)
    .setMaterial(material);
  const node = doc
    .createNode('Surface')
    .setMesh(doc.createMesh().addPrimitive(primitive))
    .setSkin(skin)
    .setTranslation([99, 99, 99]);
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node).addChild(joint));
  return { doc, skin, primitive, joints, weights, buffer };
}

for (const inverseMode of ['omitted', 'extra-matrix'] as const) {
  test(`glTF skin ${inverseMode} uses normalized weights and ignores mesh node transform`, async () => {
    const { doc, skin, buffer } = nativeSkinDocument();
    if (inverseMode === 'extra-matrix')
      skin.setInverseBindMatrices(
        doc
          .createAccessor()
          .setType('MAT4')
          .setArray(
            new Float32Array([...new THREE.Matrix4().elements, ...new THREE.Matrix4().elements]),
          )
          .setBuffer(buffer),
      );
    const bytes = await createGltfIO().writeBinary(doc);
    for (const load of [loadGlbReviewScene, loadGlbGeometryFlatScene]) {
      const loaded = await load(bytes);
      closeBounds(measureBounds(loaded.root), { min: [2, 3, 0], max: [3, 4, 0] });
      expect(collectTriangles(loaded.root).tris[0]!.doubleSided).toBe(true);
    }
  });
}

test('review rejects missing skin data and extra influence sets instead of showing a false pose', async () => {
  const { doc, primitive, joints, weights } = nativeSkinDocument();
  primitive.setAttribute('WEIGHTS_0', null);
  await expect(loadGlbReviewScene(await createGltfIO().writeBinary(doc))).rejects.toThrow(
    'Invalid skin attributes',
  );
  primitive
    .setAttribute('WEIGHTS_0', weights)
    .setAttribute('JOINTS_1', joints)
    .setAttribute('WEIGHTS_1', weights);
  await expect(loadGlbReviewScene(await createGltfIO().writeBinary(doc))).rejects.toThrow(
    'four influences',
  );
});

test('ordinary morph meshes and logical position attributes use the same surface boundary', () => {
  const geometry = new THREE.BufferGeometry();
  const data = new THREE.InterleavedBuffer(
    new Float32Array([99, 0, 0, 0, 99, 1, 0, 0, 99, 0, 1, 0]),
    4,
  );
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 1));
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 2, 0, 0, 0], 3),
  ];
  geometry.morphTargetsRelative = true;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.morphTargetInfluences![0] = 0.5;
  closeBounds(measureBounds(mesh), { min: [0, 0, 0], max: [1, 1, 1] });
  geometry.morphAttributes = {};
  mesh.updateMorphTargets();
  geometry.setAttribute(
    'position',
    new THREE.Int16BufferAttribute([0, 0, 0, 32767, 0, 0, 0, 32767, 0], 3, true),
  );
  closeBounds(measureBounds(mesh), { min: [0, 0, 0], max: [1, 1, 0] });
});

test('cross-realm skin animation changes geometry pixels and all reported pose bounds', async () => {
  const { root, clips } = await executeKilnCode(`
    function build() {
      const root = new THREE.Group(); root.name = 'Root';
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 2,0,0, 0,1,0], 3));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); mesh.name = 'Surface';
      const bone = new THREE.Bone(); bone.name = 'Joint'; mesh.add(bone); root.add(mesh);
      root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([bone])); return root;
    }
    function animate() {
      return [new THREE.AnimationClip('Turn', 1, [new THREE.QuaternionKeyframeTrack('Joint.quaternion',
        [0,1], [0,0,0,1, 0,0,Math.SQRT1_2,Math.SQRT1_2])])];
    }
  `);
  const result = await renderClipAnimation(root, clips, {
    clip: 'Turn',
    frameTimes: [0, 1],
    perFrame: true,
    size: 96,
    measureParts: [{ name: 'Surface' }],
    shot: {
      subject: { name: 'Surface' },
      camera: { type: 'orbit', azimuthDeg: 90, elevationDeg: 0 },
    },
  });
  expect(result.ok).toBe(true);
  closeBounds(result.poseBounds![0]!.scene, { min: [0, 0, 0], max: [2, 1, 0] });
  const last = result.poseBounds![1]!;
  for (const bounds of [last.scene, last.subject!, last.parts![0]!.bounds])
    closeBounds(bounds, { min: [-1, 0, 0], max: [0, 2, 0] }, 6);
  // Ignore the label area: differing phase text alone must never prove animation.
  const firstPixels = decodePng(result.pngs![0]!).rgb.subarray(96 * 3 * 24);
  const lastPixels = decodePng(result.pngs![1]!).rgb.subarray(96 * 3 * 24);
  expect(firstPixels).not.toEqual(lastPixels);
});
