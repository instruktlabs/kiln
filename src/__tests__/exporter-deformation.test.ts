import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { renderSceneToGLB, optimizeGlbBytes } from '../render';
import { autoUnwrap } from '../uv';

async function deformingScene(unwrap = false) {
  const root = new THREE.Group();
  root.name = 'Rig';
  root.position.set(0.3, 0.2, -0.4);
  let geometry: THREE.BufferGeometry = new THREE.PlaneGeometry(1, 2, 1, 2);
  const positions = geometry.getAttribute('position');
  const indices: number[] = [];
  const weights: number[] = [];
  const morph = positions.clone();
  for (let i = 0; i < positions.count; i++) {
    const weight = (positions.getY(i) + 1) / 2;
    indices.push(0, 1, 0, 0);
    weights.push(1 - weight, weight, 0, 0);
    morph.setZ(i, 0.4 * weight);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.morphAttributes.position = [morph];
  if (unwrap) geometry = await autoUnwrap(geometry, { resolution: 128, useNormals: true });
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'Sail';
  const base = new THREE.Bone();
  base.name = 'Base';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  tip.position.y = 1;
  base.add(tip);
  mesh.add(base);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([base, tip]));
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.6);
  const clip = new THREE.AnimationClip('Bend', 1, [
    new THREE.QuaternionKeyframeTrack(
      'Tip.quaternion',
      [0, 1],
      [0, 0, 0, 1, ...quaternion.toArray()],
    ),
    new THREE.NumberKeyframeTrack('Sail.morphTargetInfluences[0]', [0, 1], [0, 0.8]),
  ]);
  return { root, clip };
}

function sampledVertices(root: THREE.Object3D, clip: THREE.AnimationClip, time: number) {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  mixer.setTime(time);
  root.updateMatrixWorld(true);
  const mesh = root.getObjectByName('Sail') as THREE.SkinnedMesh;
  mesh.skeleton.update();
  const vertices = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) =>
    mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray(),
  );
  mixer.stopAllAction();
  return vertices.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!);
}

for (const unwrap of [false, true]) {
  test(`community export and full optimization preserve sampled combined skin and morph motion (unwrap: ${unwrap})`, async () => {
    const { root, clip } = await deformingScene(unwrap);
    const exported = await renderSceneToGLB(root, {
      gltfExporter: 'three',
      clips: [clip],
      optimize: 'off',
      derivative: true,
    });
    const optimized = await optimizeGlbBytes(exported.bytes, { mode: 'full' });
    if (!optimized) throw new Error('Expected the requested optimization to produce an artifact');
    for (const bytes of [exported.bytes, optimized.bytes]) {
      const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
      expect(loaded.animations).toHaveLength(1);
      const first = sampledVertices(loaded.scene, loaded.animations[0]!, 0);
      const last = sampledVertices(loaded.scene, loaded.animations[0]!, 0.75);
      expect(last).not.toEqual(first);
      for (const time of [0, 0.25, 0.5, 0.75]) {
        const expected = sampledVertices(root, clip, time);
        const actual = sampledVertices(loaded.scene, loaded.animations[0]!, time);
        expect(actual).toHaveLength(expected.length);
        for (let i = 0; i < expected.length; i++) {
          for (let axis = 0; axis < 3; axis++)
            expect(actual[i]![axis]).toBeCloseTo(expected[i]![axis]!, 5);
        }
      }
    }
  });
}
