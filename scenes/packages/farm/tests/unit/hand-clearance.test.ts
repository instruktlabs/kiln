import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Box3, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import type { Mesh, Object3D } from 'three/webgpu';
import { createEmptyHandedPose } from '../../src/play/farmer-rig';

/** Saved component ranges let us measure actual hand vertices despite rigid draw consolidation. */
function componentBox(root: Object3D, names: RegExp): Box3 {
  const box = new Box3(), point = new Vector3();
  root.traverse(object => {
    const mesh = object as Mesh; if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position'), ranges = mesh.userData.rowanComponents?.ranges;
    if (ranges && !names.test(mesh.name)) for (const range of ranges) {
      if (!names.test(range.name)) continue;
      for (let i = range.firstVertex; i < range.firstVertex + range.vertexCount; i++) box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
    } else if (names.test(mesh.name)) for (let i = 0; i < positions.count; i++) box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  });
  if (box.isEmpty()) throw new Error('Missing component ' + names);
  return box;
}

for (const release of ['r34', 'r35-local-review']) test(`${release} saved farmer hands clear the hips throughout the scene empty-handed walking cycle`, async () => {
  const bytes = readFileSync(new URL(`../../staged/${release}/models/farmer.glb`, import.meta.url));
  const loader = new GLTFLoader();
  // Images do not affect this actual-vertex fit assertion and need no browser or GPU.
  loader.register(() => ({ name: 'fit-material', loadMaterial: async () => new MeshBasicMaterial() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = gltf.scene, pose = createEmptyHandedPose(root), mixer = new AnimationMixer(root);
  const clip = gltf.animations.find(c => c.name === 'Walk')!; expect(clip).toBeDefined(); mixer.clipAction(clip).play();
  let minimum = Infinity;
  for (let sample = 0; sample <= 120; sample++) {
    mixer.setTime(sample / 120 * clip.duration); pose.apply(); root.updateMatrixWorld(true);
    // Historical exports dropped component extras; the complete rigid forearm/hand and hip draws
    // give a conservative separation test that also works with those exact accepted bytes.
    const hip = componentBox(root, /Consolidated_Joint_(Left|Right)Hip/), left = componentBox(root, /Consolidated_Joint_LeftElbow_0/), right = componentBox(root, /Consolidated_Joint_RightHandToolAttachment/);
    minimum = Math.min(minimum, hip.min.z - left.max.z, right.min.z - hip.max.z);
  }
  console.log('minimum hand-to-hip lateral clearance', minimum);
  expect(minimum).toBeGreaterThan(.01);
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  root.traverse(object => { const mesh = object as Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach(m => m.dispose()); } });
});
