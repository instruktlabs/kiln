import { describe, expect, test } from 'bun:test';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { executeKilnCode, renderGLB, renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';
import { poseSceneAtTime, prepareClip } from '../views/pose';
import { positionTrack } from '../primitives';

const SOURCE = `
const meta = { name: 'Stepped motion', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const joint = createPivot('Body', [0, 0.5, 0], root);
  createPart('Box', boxGeo(1, 1, 1), gameMaterial(0x8899aa), { parent: joint });
  return root;
}
function animate() {
  return [createClip('Step', 2, [
    positionTrack('Joint_Body', [
      {time: 0, position: [0, 0.5, 0]},
      {time: 1, position: [2, 0.5, 0]},
      {time: 2, position: [4, 0.5, 0]}
    ], 'STEP'),
    rotationTrack('Joint_Body', [
      {time: 0, rotation: [0, 0, 0]},
      {time: 1, rotation: [0, 90, 0]},
      {time: 2, rotation: [0, 180, 0]}
    ], 'STEP'),
    scaleTrack('Joint_Body', [
      {time: 0, scale: [1, 1, 1]},
      {time: 1, scale: [2, 2, 2]},
      {time: 2, scale: [3, 3, 3]}
    ], 'STEP')
  ])];
}`;

function assertPose(root: THREE.Object3D, key: number): void {
  const node = root.getObjectByName('Joint_Body')!;
  expect(node.position.x).toBe(key * 2);
  expect(node.position.y).toBe(0.5);
  expect(node.scale.x).toBe(key + 1);
  const expected = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    (key * Math.PI) / 2,
  );
  expect(node.quaternion.angleTo(expected)).toBeLessThan(0.001);
}

const samples = [
  [-0.1, 0],
  [0, 0],
  [0.5, 0],
  [0.99999, 0],
  [1, 1],
  [1.5, 1],
  [2, 2],
  [3, 2],
] as const;

describe('STEP animation survives every review boundary', () => {
  test('LINEAR review honors small but distinct float32 key intervals', () => {
    const root = new THREE.Group();
    root.name = 'Body';
    const track = positionTrack(root.name, [
      { time: 0, position: [0, 0, 0] },
      { time: 1e-10, position: [2, 0, 0] },
    ]);
    const prepared = prepareClip(root, new THREE.AnimationClip('Fast', -1, [track]));
    poseSceneAtTime(root, prepared, track.times[1]! / 2);
    expect(root.position.x).toBeCloseTo(1);
  });

  test('source posing holds vectors and quaternions until the exact next key', async () => {
    const { root, clips } = await executeKilnCode(SOURCE);
    const prepared = prepareClip(root, clips[0]!);
    for (const [time, key] of samples) {
      poseSceneAtTime(root, prepared, time);
      assertPose(root, key);
    }
  });

  test('native GLB samplers and standard Three playback retain STEP', async () => {
    const rendered = await renderGLB(SOURCE);
    const doc = await new NodeIO().readBinary(rendered.glb);
    expect(
      doc
        .getRoot()
        .listAnimations()[0]!
        .listSamplers()
        .map((sampler) => sampler.getInterpolation()),
    ).toEqual(['STEP', 'STEP', 'STEP']);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(() => {
      throw new Error('Unexpected external resource request');
    });
    const loaded = await new GLTFLoader(manager).parseAsync(
      Uint8Array.from(rendered.glb).buffer,
      '',
    );
    const mixer = new THREE.AnimationMixer(loaded.scene);
    const action = mixer.clipAction(loaded.animations[0]!);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (const [time, key] of samples.filter(([time]) => time >= 0)) {
      // A completed LoopOnce action is paused; reset so every sample is independent.
      action.reset().play();
      mixer.setTime(time);
      assertPose(loaded.scene, key);
    }
  });

  test('editable review extras and native-only GLB reconstruction retain STEP', async () => {
    const rendered = await renderGLB(SOURCE);
    const io = new NodeIO();
    const doc = await io.readBinary(rendered.glb);
    const editable = await loadGlbReviewScene(rendered.glb);
    for (const scene of doc.getRoot().listScenes()) scene.setExtras({});
    const native = await loadGlbReviewScene(await io.writeBinary(doc));
    for (const loaded of [editable, native]) {
      expect(
        loaded.clips[0]!.tracks.every(
          (track) => track.getInterpolation() === THREE.InterpolateDiscrete,
        ),
      ).toBe(true);
      const prepared = prepareClip(loaded.root, loaded.clips[0]!);
      for (const [time, key] of samples) {
        poseSceneAtTime(loaded.root, prepared, time);
        assertPose(loaded.root, key);
      }
    }
  });

  test('unsupported interpolation cannot be silently treated as LINEAR by review', async () => {
    const root = new THREE.Group();
    const track = positionTrack('Body', [
      { time: 0, position: [0, 0, 0] },
      { time: 1, position: [1, 1, 1] },
    ]);
    track.setInterpolation(THREE.InterpolateSmooth);
    expect(() => prepareClip(root, new THREE.AnimationClip('Cubic', 1, [track]))).toThrow(
      /interpolation|cubic/i,
    );
    const rendered = await renderGLB(SOURCE);
    const io = new NodeIO();
    const doc = await io.readBinary(rendered.glb);
    for (const scene of doc.getRoot().listScenes()) scene.setExtras({});
    const sampler = doc
      .getRoot()
      .listAnimations()[0]!
      .listChannels()
      .find((channel) => channel.getTargetPath() === 'translation')!
      .getSampler()!;
    const output = sampler.getOutput()!;
    const values = Array.from(output.getArray()!);
    const stride = output.getElementSize();
    const cubic: number[] = [];
    for (let i = 0; i < values.length; i += stride)
      cubic.push(
        ...new Array(stride).fill(0),
        ...values.slice(i, i + stride),
        ...new Array(stride).fill(0),
      );
    output.setArray(Float32Array.from(cubic));
    sampler.setInterpolation('CUBICSPLINE');
    // A native cubic sampler is reviewed as the cubic spline it is: with zero tangents the
    // body eases from 0 to 2 (3s^2 - 2s^3), never LINEAR's 0.5 or STEP's 0 at a quarter.
    const reviewed = await loadGlbReviewScene(await io.writeBinary(doc));
    const prepared = prepareClip(reviewed.root, reviewed.clips[0]!);
    poseSceneAtTime(reviewed.root, prepared, 0.25);
    expect(reviewed.root.getObjectByName('Joint_Body')!.position.x).toBeCloseTo(
      2 * (3 * 0.25 ** 2 - 2 * 0.25 ** 3),
      6,
    );
  });
});

describe('explicit clip duration survives native export', () => {
  for (const gltfExporter of ['legacy', 'three'] as const) {
    for (const interpolation of ['STEP', 'LINEAR'] as const) {
      test(`${gltfExporter} retains a trailing ${interpolation} hold without changing authored tracks`, async () => {
        const source = SOURCE.replace("createClip('Step', 2", "createClip('Step', 3").replaceAll(
          "'STEP'",
          `'${interpolation}'`,
        );
        const { root, clips } = await executeKilnCode(source);
        const original = clips[0]!.tracks.map((track) => ({
          times: Array.from(track.times),
          values: Array.from(track.values),
        }));
        const rendered = await renderSceneToGLB(root, { clips, gltfExporter });
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(() => {
          throw new Error('Unexpected external resource request');
        });
        const loaded = await new GLTFLoader(manager).parseAsync(
          Uint8Array.from(rendered.bytes).buffer,
          '',
        );
        expect(loaded.animations[0]!.duration).toBe(3);
        const mixer = new THREE.AnimationMixer(loaded.scene);
        mixer.clipAction(loaded.animations[0]!).play();
        mixer.setTime(2.5);
        assertPose(loaded.scene, 2);
        expect(
          clips[0]!.tracks.map((track) => ({
            times: Array.from(track.times),
            values: Array.from(track.values),
          })),
        ).toEqual(original);
      });
    }
  }
});
