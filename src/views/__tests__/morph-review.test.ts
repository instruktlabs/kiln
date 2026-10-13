import { expect, test } from 'bun:test';
import { Document } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGltfIO } from '../../gltf-io';
import { renderSceneToGLB, optimizeGlbBytes } from '../../render';
import { useCubicSpline } from '../../animation-cubic';
import { loadGlbGeometryFlatScene, loadGlbReviewScene } from '../glb';
import { prepareClip, poseSceneAtTime, measureLoopClosure } from '../pose';
import { measureBounds } from '../raster';
import { cloneReviewScene } from '../scene-copy';

function documentFixture() {
  const doc = new Document(),
    buffer = doc.createBuffer();
  const attr = (values: number[], type: 'VEC3' | 'SCALAR' = 'VEC3') =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', attr([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('NORMAL', attr([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  primitive.addTarget(
    doc.createPrimitiveTarget('Lift').setAttribute('POSITION', attr([0, 1, 0, 0, 1, 0, 0, 1, 0])),
  );
  primitive.addTarget(
    doc.createPrimitiveTarget('Push').setAttribute('POSITION', attr([0, 0, 2, 0, 0, 2, 0, 0, 2])),
  );
  const mesh = doc
    .createMesh('Surface')
    .addPrimitive(primitive)
    .setWeights([0.25, 0.5])
    .setExtras({ targetNames: ['Lift', 'Push'] });
  const node = doc.createNode('Actor').setMesh(mesh);
  const scene = doc.createScene('Scene').addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return { doc, primitive, mesh, node, scene, attr };
}
function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) result.push(n as THREE.Mesh);
  });
  return result;
}
const write = (doc: Document) => createGltfIO().writeBinary(doc);

test('flat and hierarchical GLB review apply mesh defaults and independent node overrides', async () => {
  const { doc, mesh, node, scene } = documentFixture();
  node.setWeights([0.5, 0.25]);
  scene.addChild(doc.createNode('Other').setMesh(mesh).setTranslation([2, 0, 0]));
  for (const load of [loadGlbReviewScene, loadGlbGeometryFlatScene]) {
    const loaded = await load(await write(doc));
    expect(loaded.reasonCodes).not.toContain('GLB_FLAT_MORPH_TARGETS_UNSUPPORTED');
    expect(measureBounds(loaded.root)).toEqual({ min: [0, 0.25, 0.5], max: [3, 1.5, 1] });
  }
  const loaded = await loadGlbReviewScene(await write(doc)),
    [a, b] = meshes(loaded.root);
  expect(a!.morphTargetDictionary).toEqual({ Lift: 0, Push: 1 });
  a!.morphTargetInfluences![0] = 1;
  expect(b!.morphTargetInfluences).toEqual([0.25, 0.5]);
});

test('missing target attributes are zero deltas and absent defaults are zero weights', async () => {
  const { doc, mesh, primitive, attr } = documentFixture();
  primitive
    .listTargets()[1]!
    .setAttribute('POSITION', null)
    .setAttribute('NORMAL', attr([0, 1, 0, 0, 1, 0, 0, 1, 0]));
  mesh.setWeights([]);
  const loaded = await loadGlbReviewScene(await write(doc)),
    surface = meshes(loaded.root)[0]!;
  expect(surface.morphTargetInfluences).toEqual([0, 0]);
  surface.morphTargetInfluences![1] = 0.5;
  expect(measureBounds(loaded.root)).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  expect([...surface.geometry.morphAttributes.position![1]!.array]).toEqual(Array(9).fill(0));
  expect([...surface.geometry.morphAttributes.normal![0]!.array]).toEqual(Array(9).fill(0));
});

for (const mode of ['STEP', 'LINEAR', 'CUBICSPLINE'] as const)
  test(`native ${mode} weights animate every primitive and retain clone independence`, async () => {
    const { doc, mesh, node, primitive, attr } = documentFixture();
    mesh.addPrimitive(primitive.clone());
    node.setName('Odd: actor');
    const values = mode === 'CUBICSPLINE' ? [0, 0, 0, 0, 0, 0, 0, 0, 1, 0.5, 0, 0] : [0, 0, 1, 0.5];
    const sampler = doc
      .createAnimationSampler()
      .setInput(attr([0, 1], 'SCALAR'))
      .setOutput(attr(values, 'SCALAR'))
      .setInterpolation(mode);
    doc
      .createAnimation('Shape')
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath('weights')
          .setSampler(sampler),
      );
    const bytes = await write(doc),
      loaded = await loadGlbReviewScene(bytes);
    expect(loaded.clips[0]!.tracks).toHaveLength(2);
    const clone = cloneReviewScene(loaded.root),
      prepared = prepareClip(clone, loaded.clips[0]!);
    expect(prepared.unresolved).toEqual([]);
    for (const time of [0, 0.25, 0.5, 1]) {
      poseSceneAtTime(clone, prepared, time);
      const phase =
        mode === 'STEP'
          ? time === 1
            ? 1
            : 0
          : mode === 'CUBICSPLINE'
            ? time * time * (3 - 2 * time)
            : time;
      for (const surface of meshes(clone))
        expect(surface.morphTargetInfluences).toEqual([phase, phase * 0.5]);
      // Native clips must also be consumable by Three's regular mixer.
      const mixer = new THREE.AnimationMixer(loaded.root);
      mixer.clipAction(loaded.clips[0]!).setLoop(THREE.LoopOnce, 1).play().clampWhenFinished = true;
      mixer.setTime(time);
      expect(measureBounds(clone)).toEqual(measureBounds(loaded.root));
      mixer.stopAllAction();
    }
    for (const surface of meshes(loaded.root))
      expect(surface.morphTargetInfluences).toEqual([0.25, 0.5]);
  });

test('source sampler handles four scalar weights without quaternion interpolation', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'Face';
  mesh.geometry.morphTargetsRelative = true;
  mesh.geometry.morphAttributes.position = Array.from(
    { length: 4 },
    () => new THREE.Float32BufferAttribute(new Float32Array(12), 3),
  );
  mesh.updateMorphTargets();
  for (const cubic of [false, true]) {
    const track = new THREE.NumberKeyframeTrack(
      'Face.morphTargetInfluences',
      [0, 1],
      cubic
        ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 0, 0, 0, 0]
        : [0, 0, 0, 0, 1, 2, 3, 4],
    );
    if (cubic) useCubicSpline(track);
    const clip = new THREE.AnimationClip('Shape', 1, [track]);
    poseSceneAtTime(mesh, prepareClip(mesh, clip), 0.5);
    expect(mesh.morphTargetInfluences).toEqual([0.5, 1, 1.5, 2]);
    // Existing transform-only loop evidence must not mislabel weights as scale.
    expect(measureLoopClosure(mesh, clip).status).toBe('incomplete');
    expect(measureLoopClosure(mesh, clip).unassessedTracks).toBe(1);
  }
  mesh.morphTargetDictionary = { Smile: 2 };
  const indexed = new THREE.AnimationClip('Smile', 1, [
    new THREE.NumberKeyframeTrack('Face.morphTargetInfluences[Smile]', [0, 1], [0, 1]),
  ]);
  poseSceneAtTime(mesh, prepareClip(mesh, indexed), 0.25);
  expect(mesh.morphTargetInfluences![2]).toBe(0.25);
});

test('combined exported skin and morph poses match independent GLTFLoader vertices', async () => {
  const root = new THREE.Group();
  root.position.set(0.3, 0.2, -0.4);
  root.rotation.y = 0.3;
  root.scale.set(1.1, 0.9, 1);
  const geo = new THREE.PlaneGeometry(1, 2, 1, 2),
    count = geo.getAttribute('position').count;
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = [
    new THREE.Float32BufferAttribute(
      Array.from({ length: count * 3 }, (_, i) => (i % 3 === 2 ? 0.4 : 0)),
      3,
    ),
  ];
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geo.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      4,
    ),
  );
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'Surface';
  const bone = new THREE.Bone();
  bone.name = 'Joint';
  mesh.add(bone);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone]));
  const end = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  const clip = new THREE.AnimationClip('Combined', 1, [
    new THREE.QuaternionKeyframeTrack('Joint.quaternion', [0, 1], [0, 0, 0, 1, ...end.toArray()]),
    new THREE.NumberKeyframeTrack('Surface.morphTargetInfluences[0]', [0, 1], [0, 1]),
  ]);
  const exported = await renderSceneToGLB(root, {
    gltfExporter: 'three',
    clips: [clip],
    derivative: true,
    optimize: 'off',
  });
  const optimized = await optimizeGlbBytes(exported.bytes, { mode: 'full' });
  expect(optimized).not.toBeNull();
  for (const bytes of [exported.bytes, optimized!.bytes]) {
    const loaded = await loadGlbReviewScene(bytes),
      control = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    for (const time of [0, 0.5, 1]) {
      poseSceneAtTime(loaded.root, prepareClip(loaded.root, loaded.clips[0]!), time);
      const mixer = new THREE.AnimationMixer(control.scene);
      const action = mixer.clipAction(control.animations[0]!).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(time);
      const expected = measureBounds(control.scene),
        actual = measureBounds(loaded.root);
      for (const side of ['min', 'max'] as const)
        for (let axis = 0; axis < 3; axis++)
          expect(actual[side][axis]).toBeCloseTo(expected[side][axis]!, 6);
      const vertices = (scene: THREE.Object3D) =>
        meshes(scene).flatMap((surface) =>
          Array.from({ length: surface.geometry.getAttribute('position').count }, (_, i) =>
            surface.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(surface.matrixWorld),
          ),
        );
      const expectedVertices = vertices(control.scene),
        actualVertices = vertices(loaded.root);
      expect(actualVertices).toHaveLength(expectedVertices.length);
      for (const point of actualVertices)
        expect(Math.min(...expectedVertices.map((other) => point.distanceTo(other)))).toBeLessThan(
          1e-6,
        );
      mixer.stopAllAction();
    }
  }
});

test('invalid morph target and default weight widths are rejected', async () => {
  for (const invalid of ['count', 'weights', 'attribute'] as const) {
    const { doc, mesh, primitive, attr } = documentFixture();
    if (invalid === 'count')
      mesh.addPrimitive(primitive.clone().removeTarget(primitive.listTargets()[1]!));
    if (invalid === 'weights') mesh.setWeights([1]);
    if (invalid === 'attribute')
      primitive.listTargets()[0]!.setAttribute('POSITION', attr([0, 1, 0]));
    await expect(loadGlbReviewScene(await write(doc))).rejects.toThrow(/morph/i);
  }
});

test('review extras retain indexed morph tracks beside unresolved author tracks', async () => {
  const { doc, scene } = documentFixture();
  scene.setExtras({
    kilnReviewClipsV1: {
      version: 2,
      clips: [
        {
          name: 'Shape',
          duration: 1,
          tracks: [
            {
              name: 'Actor.morphTargetInfluences[Lift]',
              times: [0, 1],
              values: [0, 0, 0, 0, 1, 0],
              interpolation: 'CUBICSPLINE',
            },
            {
              name: 'Missing.position',
              times: [0, 1],
              values: [0, 0, 0, 1, 1, 1],
              interpolation: 'LINEAR',
            },
          ],
        },
      ],
    },
  });
  const loaded = await loadGlbReviewScene(await write(doc));
  const prepared = prepareClip(loaded.root, loaded.clips[0]!);
  expect(prepared.unresolved).toEqual(['Missing.position']);
  poseSceneAtTime(loaded.root, prepared, 0.5);
  expect(meshes(loaded.root)[0]!.morphTargetInfluences).toEqual([0.5, 0.5]);
});

test('invalid weight samplers fail and unsupported target semantics remain explicit', async () => {
  const { doc, node, attr, primitive } = documentFixture();
  const sampler = doc
    .createAnimationSampler()
    .setInput(attr([0, 1], 'SCALAR'))
    .setOutput(attr([0, 1], 'SCALAR'));
  doc
    .createAnimation('Shape')
    .addSampler(sampler)
    .addChannel(
      doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(sampler),
    );
  await expect(loadGlbReviewScene(await write(doc))).rejects.toThrow(/morph.*sampler/i);
  sampler.setOutput(attr([0, 0, 1, 1], 'SCALAR'));
  primitive.setAttribute('_CUSTOM', attr([0, 0, 0, 0, 0, 0, 0, 0, 0]));
  primitive.listTargets()[0]!.setAttribute('_CUSTOM', attr([0, 0, 0, 0, 0, 0, 0, 0, 0]));
  expect((await loadGlbReviewScene(await write(doc))).reasonCodes).toContain(
    'GLB_FLAT_MORPH_TARGETS_UNSUPPORTED',
  );
});

test('source weight sampling resolves UUIDs and rejects malformed widths without mutation', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'Face';
  mesh.morphTargetInfluences = [0.2, 0.3];
  const clip = (name: string, values: number[]) =>
    new THREE.AnimationClip('Shape', 1, [new THREE.NumberKeyframeTrack(name, [0, 1], values)]);
  poseSceneAtTime(
    mesh,
    prepareClip(mesh, clip(`${mesh.uuid}.morphTargetInfluences[0]`, [0, 1])),
    0.5,
  );
  expect(mesh.morphTargetInfluences).toEqual([0.5, 0.3]);
  expect(() => prepareClip(mesh, clip('Face.morphTargetInfluences', [0, 1]))).toThrow(/morph/);
  const missing = prepareClip(mesh, clip('Face.morphTargetInfluences[9]', [0, 1]));
  expect(missing.unresolved).toEqual(['Face.morphTargetInfluences[9]']);
  poseSceneAtTime(mesh, missing, 1);
  expect(mesh.morphTargetInfluences).toEqual([0.5, 0.3]);
});
