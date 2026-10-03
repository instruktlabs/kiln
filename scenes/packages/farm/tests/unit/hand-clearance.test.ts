import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
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
    const hip = componentBox(root, /Consolidated_Joint_(Left|Right)Hip/), left = componentBox(root, /Consolidated_Joint_LeftElbow_0/), right = componentBox(root, /Mesh_EmptyHandedRightArm/);
    minimum = Math.min(minimum, hip.min.z - left.max.z, right.min.z - hip.max.z);
  }
  console.log('minimum hand-to-hip lateral clearance', minimum);
  expect(minimum).toBeGreaterThan(.01);
  mixer.stopAllAction(); mixer.uncacheRoot(root); pose.dispose();
  root.traverse(object => { const mesh = object as Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach(m => m.dispose()); } });
});


test('exact r36 released farmer preserves relaxed shoulders on substep and normal rendered frames', async () => {
  await import('three');
  const { createFarmSim } = await import('../../src/play/sim');
  const { buildFarmColliders } = await import('../../src/world/colliders');
  const { FARM_WALK } = await import('../../src/constants');
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'fit-material', loadMaterial: async () => new MeshBasicMaterial() }));
  const expected = { farmer: 'b6c49161d0627c26e3cc7ea07e88f58c2726fe2c8b15773afcb621d3ab21b829', tractor: '8185aea55248ec02eb49de46eb04d85c2cdd9a9f9a1d485d649d79009c3f1117' };
  const instances: import('../../src/world/types').FarmInstance[] = [];
  for (const id of ['farmer', 'tractor'] as const) {
    const bytes = readFileSync(new URL(`../../../../.cache/site-inputs/farm/standalone/assets/models/${id}.glb`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected[id]);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const wrapper = new Group(); wrapper.name = id === 'farmer' ? 'farmer-yard-0' : 'tractor-0'; wrapper.add(gltf.scene);
    if (id === 'tractor') wrapper.position.set(20, 0, 20);
    instances.push({ id: wrapper.name, asset: { id }, object: wrapper, mixer: new AnimationMixer(gltf.scene), clips: gltf.animations, action: null, clipIndex: '' });
  }
  const geometryHash = (mesh: Mesh) => {
    const hash = createHash('sha256'), geometry = mesh.geometry;
    const arrays = [...Object.values(geometry.attributes).map(attribute => 'data' in attribute ? attribute.data.array : attribute.array), ...(geometry.index ? [geometry.index.array] : [])];
    for (const array of arrays) hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    return hash.digest('hex');
  };
  const originalBuffers = new Map<Mesh, string>();
  for (const instance of instances) instance.object.traverse(node => { const mesh = node as Mesh; if (mesh.isMesh) originalBuffers.set(mesh, geometryHash(mesh)); });
  const ground = new Mesh(new BoxGeometry(100, 1, 100), new MeshBasicMaterial()); ground.position.y = -.5;
  const colliders = buildFarmColliders({ ground, bridge: null, instances }), sim = createFarmSim({ instances, colliders });
  const input = { move: { x: 0, y: 1 }, run: false }, forward = new Vector3(0, 0, -1);
  try {
    sim.start(); sim.update(FARM_WALK.step, input, forward);
    sim.updateAnimation(FARM_WALK.step); sim.update(FARM_WALK.step, input, forward);
    expect(sim.currentClip).toBe('Walk');
    expect(sim.player.object.getObjectByName('Joint_Pitchfork')!.visible).toBe(false);
    const left = sim.player.object.getObjectByName('Joint_LeftShoulder')!, right = sim.player.object.getObjectByName('Joint_RightShoulder')!;
    const originalLeft = sim.player.object.getObjectByName('Mesh_Consolidated_Joint_LeftElbow_0') as Mesh;
    const derivedRight = sim.player.object.getObjectByName('Mesh_EmptyHandedRightArm') as Mesh;
    expect(derivedRight).toBeDefined(); expect(derivedRight.visible).toBe(true);
    expect(derivedRight.geometry).toBe(originalLeft.geometry);
    expect(sim.player.object.getObjectByName('Joint_RightHandToolAttachment')!.visible).toBe(false);
    expect(sim.player.object.getObjectByName('Mesh_Consolidated_Joint_RightElbow_0')!.visible).toBe(false);
    expect(sim.player.object.getObjectByName('Joint_RightElbow')!.quaternion.angleTo(new Quaternion())).toBe(0);
    // Source component ranges identify the actual relaxed wrist overlap; no guessed split.
    const localBox = (name: string) => {
      const range = originalLeft.userData.rowanComponents.ranges.find((r: { name: string }) => r.name === name)!;
      const box = new Box3(), position = originalLeft.geometry.getAttribute('position'), index = originalLeft.geometry.index, point = new Vector3();
      // The runtime export deduplicates vertices; saved triangle ranges address its index stream.
      for (let i = range.firstTriangle * 3; i < (range.firstTriangle + range.triangleCount) * 3; i++) box.expandByPoint(point.fromBufferAttribute(position, index ? index.getX(i) : i));
      return box;
    };
    const overlap = localBox('Mesh_LeftForearm').intersect(localBox('Mesh_LeftHand')).getSize(new Vector3());
    expect(overlap.x).toBeGreaterThan(.01); expect(overlap.y).toBeGreaterThan(.01); expect(overlap.z).toBeGreaterThan(.01);
    expect(derivedRight.scale.toArray()).toEqual([1, 1, -1]);
    const before = sim.player.object.position.clone();
    for (const [i, dt] of [1 / 240, 1 / 240, 1 / 121, 1 / 119, 0, 1 / 120, 1 / 60].entries()) {
      sim.updateAnimation(dt); sim.update(dt, input, forward);
      if (i === 0) expect(sim.player.object.position.equals(before)).toBe(true);
      if (i === 1) expect(sim.player.object.position.equals(before)).toBe(false);
      expect(left.rotation.x).toBeCloseTo(.28, 12);
      expect(right.rotation.z).toBeCloseTo(-left.rotation.z, 12);
    }
    // Actual authored Idle→Walk right hip and Walk→Idle shoulders/chest must blend,
    // including non-overlapping track sets; selecting a clip must not restore rest mid-frame.
    const idle = { move: { x: 0, y: 0 }, run: false };
    for (let i = 0; i < 30; i++) { sim.updateAnimation(1 / 120); sim.update(1 / 120, idle, forward); }
    const hip = rootJoint('Joint_RightHip');
    sim.updateAnimation(1 / 120); sim.update(1 / 120, input, forward);
    const hipBefore = hip.quaternion.clone(); sim.updateAnimation(1 / 120); sim.update(1 / 120, input, forward);
    expect(hipBefore.angleTo(hip.quaternion) * 180 / Math.PI).toBeLessThan(5);
    for (let i = 0; i < 17; i++) { sim.updateAnimation(1 / 120); sim.update(1 / 120, input, forward); }
    sim.updateAnimation(1 / 120);
    const shoulderBefore = left.rotation.z, chestBefore = rootJoint('Joint_Chest').quaternion.clone();
    sim.update(1 / 120, idle, forward);
    expect(left.rotation.z).toBeCloseTo(shoulderBefore, 10);
    expect(chestBefore.angleTo(rootJoint('Joint_Chest').quaternion)).toBeLessThan(1e-7);
    function rootJoint(name: string) { return sim.player.object.getObjectByName(name)!; }
    // Retain the actual-vertex hip-clearance contract for the current sealed revision.
    for (let i = 0; i < 24; i++) { sim.updateAnimation(1 / 120); sim.update(1 / 120, input, forward); }
    sim.player.action!.timeScale = 1; // Sample exactly one full authored Walk cycle below.
    const root = sim.player.object, walk = sim.player.clips.find(clip => clip.name === 'Walk')!;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    let minimum = Infinity;
    for (let sample = 0; sample <= 120; sample++) {
      sim.player.mixer.setTime(sample / 120 * walk.duration); sim.update(0, input, forward); root.updateMatrixWorld(true);
      const hip = componentBox(root, /Consolidated_Joint_(Left|Right)Hip/), leftHand = componentBox(root, /Consolidated_Joint_LeftElbow_0/), rightHand = componentBox(root, /Mesh_EmptyHandedRightArm/);
      minimum = Math.min(minimum, hip.min.z - leftHand.max.z, rightHand.min.z - hip.max.z);
    }
    expect(minimum).toBeGreaterThan(.01);
  } finally {
    sim.dispose(); colliders.dispose();
    for (const [mesh, before] of originalBuffers) expect(geometryHash(mesh)).toBe(before);
    for (const instance of instances) {
      instance.mixer.stopAllAction(); instance.mixer.uncacheRoot(instance.mixer.getRoot());
      instance.object.traverse(object => { const mesh = object as Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); } });
    }
    ground.geometry.dispose(); ground.material.dispose();
  }
});
