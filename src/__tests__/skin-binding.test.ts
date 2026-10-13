import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createBoneChain, createJointChain, readCharacterJointDescriptorV1 } from '../character';
import { createSkinnedPart } from '../skin-binding';
import { GEOMETRY_ALLOCATION_LIMITS } from '../geometry-budget';
import { renderSceneToGLB } from '../render';
import { loadGlbReviewScene } from '../views/glb';

const segments = [
  { role: 'limb.base', offset: [0, 0, 0] as [number, number, number] },
  { role: 'limb.tip', offset: [0, 1, 0] as [number, number, number], endEffector: true },
];
function fixture() {
  const root = new THREE.Group();
  root.name = 'Rig';
  root.position.set(2, -1, 3);
  root.rotation.set(0.1, 0.3, -0.2);
  root.scale.set(1.3, 0.8, 1.1);
  const chain = createBoneChain('Limb', segments, { parent: root });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 2, 0], 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 1, 1], 2));
  const material = new THREE.MeshStandardMaterial();
  const indices = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  const weights = [1, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 0, 0];
  return { root, chain, geometry, material, indices, weights };
}
function part(f: ReturnType<typeof fixture>, extra = {}) {
  return createSkinnedPart('Skin', f.geometry, f.material, {
    parent: f.root,
    bones: f.chain.nodes,
    indices: f.indices,
    weights: f.weights,
    ...extra,
  });
}
function worldVertex(mesh: THREE.Mesh, index: number) {
  return mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

describe('opt-in semantic bones', () => {
  test('rigid pivots keep their type while bones retain the same local rest descriptors', () => {
    const old = createJointChain('Limb', segments);
    const f = fixture();
    expect(old.nodes.every((n) => n.type === 'Object3D')).toBe(true);
    expect(f.chain.nodes.every((n) => n.isBone)).toBe(true);
    expect(f.chain.descriptors).toEqual(old.descriptors);
    expect(f.chain.byRole.get('limb.tip')).toBe(f.chain.end);
    expect(readCharacterJointDescriptorV1(f.chain.end)?.parentRole).toBe('limb.base');
    f.root.updateMatrixWorld(true);
    expect(
      f.chain.end
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(0, 1, 0).applyMatrix4(f.root.matrixWorld)),
    ).toBeLessThan(1e-12);
  });
  test('custom branching roles inherit a declared parent without a biped preset', () => {
    const f = fixture();
    const branch = createBoneChain(
      'Tendril',
      [
        {
          role: 'tendril.tip',
          offset: [0, 0, 1],
          localForwardAxis: [0, 0, 1],
          localBendAxis: [1, 0, 0],
        },
      ],
      { parent: f.chain.end },
    );
    expect(branch.descriptors[0]?.parentRole).toBe('limb.tip');
    expect(branch.descriptors[0]?.localBendAxis).toEqual([1, 0, 0]);
  });
  test('invalid descriptors, duplicate roles and sanitized name collisions are atomic', () => {
    const f = fixture(),
      count = f.root.children.length;
    for (const input of [
      [...segments, { role: 'bad', offset: [NaN, 0, 0] as [number, number, number] }],
      [
        { role: 'a.b', offset: [0, 0, 0] as [number, number, number] },
        { role: 'a_b', offset: [0, 1, 0] as [number, number, number] },
      ],
      [segments[0]!, segments[0]!],
    ])
      expect(() => createBoneChain('New', input, { parent: f.root })).toThrow();
    expect(() => createBoneChain('Other', segments, { parent: f.root })).toThrow('role');
    expect(() =>
      createBoneChain('New', [{ role: 'new', offset: [0, 0, 0] }], {
        parent: f.chain.end,
        parentRole: 'wrong',
      }),
    ).toThrow('parentRole');
    expect(f.root.children.length).toBe(count);
    expect(() =>
      createBoneChain('TooMany', Array(GEOMETRY_ALLOCATION_LIMITS.skinBones + 1).fill(segments[0])),
    ).toThrow('limit');
  });
});

describe('explicit owned skin binding', () => {
  test('rest and analytic bent positions agree under a transformed root; source buffers stay owned by source', () => {
    const f = fixture(),
      mesh = part(f);
    expect(mesh.isSkinnedMesh).toBe(true);
    expect(mesh.geometry).not.toBe(f.geometry);
    expect(mesh.geometry.getAttribute('position').array).not.toBe(
      f.geometry.getAttribute('position').array,
    );
    expect(f.geometry.getAttribute('skinIndex')).toBeUndefined();
    expect(mesh.material).toBe(f.material);
    expect(mesh.skeleton.bones).toEqual(f.chain.nodes);
    f.root.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++)
      expect(
        worldVertex(mesh, i).distanceTo(
          new THREE.Vector3(0, i, 0).applyMatrix4(f.root.matrixWorld),
        ),
      ).toBeLessThan(1e-12);
    f.chain.end.rotation.z = Math.PI / 2;
    f.root.updateMatrixWorld(true);
    expect(
      worldVertex(mesh, 2).distanceTo(new THREE.Vector3(-1, 1, 0).applyMatrix4(f.root.matrixWorld)),
    ).toBeLessThan(1e-12);
    expect(f.weights).toEqual([1, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 0, 0]);
  });
  test('local mesh placement and later whole-rig motion preserve the rest shape', () => {
    const f = fixture(),
      mesh = part(f, { position: [0.2, 0, 0], rotation: [0, 0, 15], scale: [0.8, 1, 1] });
    f.root.position.x += 3;
    f.root.rotation.y += 0.7;
    f.root.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++)
      expect(
        worldVertex(mesh, i).distanceTo(new THREE.Vector3(0, i, 0).applyMatrix4(mesh.matrixWorld)),
      ).toBeLessThan(1e-12);
  });
  test('normalization is explicit and typed index arrays are accepted', () => {
    const f = fixture(),
      weights = f.weights.map((v) => v * 2);
    expect(() => part(f, { weights })).toThrow('sum');
    const mesh = part(f, { weights, normalizeWeights: true, indices: new Uint16Array(f.indices) });
    expect([...mesh.geometry.getAttribute('skinWeight').array]).toEqual(f.weights);
    expect(weights).toEqual(f.weights.map((v) => v * 2));
    expect(() => part(f, { normalizeWeights: 'yes' })).toThrow('normalizeWeights');
  });
  test('invalid influences fail before parenting or cloning geometry', () => {
    const f = fixture(),
      count = f.root.children.length;
    const clone = f.geometry.clone;
    let clones = 0;
    f.geometry.clone = function () {
      clones++;
      return clone.call(this);
    };
    for (const patch of [
      { indices: [...f.indices.slice(0, 11)] },
      { indices: f.indices.map((v, i) => (i === 0 ? 2 : v)) },
      { indices: f.indices.map((v, i) => (i === 0 ? 0.5 : v)) },
      { weights: f.weights.map((v, i) => (i === 0 ? -1 : v)) },
      { weights: f.weights.map((v, i) => (i === 0 ? Infinity : v)) },
      { weights: f.weights.map((v, i) => (i < 4 ? 0 : v)) },
      { bones: [f.chain.root, f.chain.root] },
      { bones: [new THREE.Bone(), f.chain.end] },
      { scale: [0, 1, 1] },
    ])
      expect(() => part(f, patch)).toThrow();
    expect(f.root.children.length).toBe(count);
    expect(clones).toBe(0);
  });
  test('rich unchanged topology is preserved and separate bindings have independent inverse matrices', () => {
    const f = fixture();
    f.geometry.setAttribute(
      'color',
      new THREE.Uint8BufferAttribute([255, 0, 0, 0, 255, 0, 0, 0, 255], 3, true),
    );
    f.geometry.morphAttributes.position = [
      new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0.2, 0, 0], 3),
    ];
    f.geometry.morphTargetsRelative = true;
    f.geometry.addGroup(0, 3, 0);
    const a = part(f),
      b = part(f);
    expect(a.geometry.groups).toEqual(f.geometry.groups);
    expect(a.geometry.getAttribute('color').normalized).toBe(true);
    expect(a.geometry.morphAttributes.position?.[0]?.array).not.toBe(
      f.geometry.morphAttributes.position[0]!.array,
    );
    expect(a.skeleton).not.toBe(b.skeleton);
    expect(a.skeleton.boneInverses[0]).not.toBe(b.skeleton.boneInverses[0]);
    expect(a.morphTargetInfluences).not.toBe(b.morphTargetInfluences);
    a.geometry.getAttribute('color').setX(0, 0);
    expect(f.geometry.getAttribute('color').getX(0)).toBe(1);
  });
  test('allocation limits and existing bindings reject before geometry cloning', () => {
    const f = fixture();
    const position = f.geometry.getAttribute('position');
    Object.defineProperty(position, 'count', {
      value: GEOMETRY_ALLOCATION_LIMITS.skinVertices + 1,
    });
    expect(() => part(f)).toThrow('limit');
    const other = fixture();
    other.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(other.indices, 4));
    expect(() => part(other)).toThrow('already');
    const large = fixture();
    Object.defineProperty(large.geometry.getAttribute('position').array, 'byteLength', {
      value: GEOMETRY_ALLOCATION_LIMITS.skinAttributeBytes,
    });
    expect(() => part(large)).toThrow('allocation limit');
  });
  test('invalid skeleton identity and singular bone rest transforms are rejected', () => {
    const f = fixture();
    f.chain.end.scale.y = 0;
    expect(() => part(f)).toThrow('invertible');
    f.chain.end.scale.y = 1;
    const collision = new THREE.Object3D();
    collision.name = f.chain.root.name;
    f.root.add(collision);
    expect(() => part(f)).toThrow('ambiguous');
    f.root.remove(collision);
    f.chain.end.name = f.chain.root.name;
    expect(() => part(f)).toThrow('unique');
    expect(() =>
      createSkinnedPart('Empty', f.geometry, [], {
        parent: f.root,
        bones: f.chain.nodes,
        indices: f.indices,
        weights: f.weights,
      }),
    ).toThrow('material');
  });
  test('Three export and optimized review preserve bone roles and deformed positions', async () => {
    for (const optimize of ['off', 'full'] as const) {
      const f = fixture();
      // A nondegenerate triangle for export; all three influence samples stay distinct.
      f.geometry.getAttribute('position').setX(1, 0.2);
      const mesh = part(f, { position: [0.2, 0.1, 0], rotation: [0, 0, 15], scale: [0.8, 1, 1] }),
        track = new THREE.QuaternionKeyframeTrack(
          `${f.chain.end.name}.quaternion`,
          [0, 1],
          [0, 0, 0, 1, 0, 0, Math.sin(0.4), Math.cos(0.4)],
        );
      f.root.animations = [new THREE.AnimationClip('Bend', 1, [track])];
      const output = await renderSceneToGLB(f.root, {
        gltfExporter: 'three',
        optimize,
        geometryPolicy: 'strict',
        clips: f.root.animations,
      });
      expect(output.gltfValidation.issues.numErrors).toBe(0);
      const loaded = await new GLTFLoader().parseAsync(new Uint8Array(output.bytes).buffer, '');
      const reviewed = await loadGlbReviewScene(output.bytes);
      const sourceMixer = new THREE.AnimationMixer(f.root),
        importMixer = new THREE.AnimationMixer(loaded.scene);
      const sourceAction = sourceMixer.clipAction(f.root.animations[0]!).setLoop(THREE.LoopOnce, 1);
      const importAction = importMixer.clipAction(loaded.animations[0]!).setLoop(THREE.LoopOnce, 1);
      sourceAction.clampWhenFinished = true;
      importAction.clampWhenFinished = true;
      sourceAction.play();
      importAction.play();
      let imported: THREE.SkinnedMesh | undefined;
      loaded.scene.traverse((n) => {
        if ((n as THREE.SkinnedMesh).isSkinnedMesh) imported = n as THREE.SkinnedMesh;
      });
      expect(imported).toBeDefined();
      expect(readCharacterJointDescriptorV1(imported!.skeleton.bones[1]!)?.role).toBe('limb.tip');
      expect(reviewed.reasonCodes).not.toContain('GLB_FLAT_SKIN_DEFORMATION_UNSUPPORTED');
      for (const time of [0, 0.5, 1]) {
        sourceMixer.setTime(time);
        importMixer.setTime(time);
        f.root.updateMatrixWorld(true);
        loaded.scene.updateMatrixWorld(true);
        const actual = Array.from(
          { length: imported!.geometry.getAttribute('position').count },
          (_, i) => worldVertex(imported!, i),
        );
        for (let i = 0; i < 3; i++)
          expect(Math.min(...actual.map((v) => v.distanceTo(worldVertex(mesh, i))))).toBeLessThan(
            2e-6,
          );
      }
    }
  });
});
