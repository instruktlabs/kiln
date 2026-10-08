import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { createAssetIntentV1 } from '../contracts';
import { createUniversalQaRegistry } from './universal';

function validRoot(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Root';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'Body';
  root.add(mesh);
  return root;
}

const codes = (root: THREE.Object3D, overrides: Record<string, unknown> = {}): string[] => {
  const context = {
    intent: createAssetIntentV1({ category: 'prop' }),
    scene: root,
    ...overrides,
  };
  return createUniversalQaRegistry()
    .run(context)
    .findings.map((finding) => finding.code);
};

describe('universal scene QA', () => {
  test('valid control is finding-free', () => {
    expect(codes(validRoot())).toEqual([]);
  });

  test('blocks empty output', () => {
    const root = new THREE.Group();
    root.name = 'Root';
    expect(codes(root)).toContain('UNIVERSAL_EMPTY_OUTPUT');
  });

  test('localizes non-finite transforms and attributes', () => {
    const root = validRoot();
    const mesh = root.getObjectByName('Body') as THREE.Mesh;
    mesh.position.x = Number.NaN;
    const position = mesh.geometry.getAttribute('position');
    position.setX(0, Number.POSITIVE_INFINITY);

    expect(codes(root)).toEqual(
      expect.arrayContaining(['UNIVERSAL_NONFINITE_TRANSFORM', 'UNIVERSAL_NONFINITE_ATTRIBUTE']),
    );
  });

  test('blocks open kilnSolidRock meshes', () => {
    const root = new THREE.Group();
    root.name = 'Root';
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.userData.kilnSolidRock = true;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'Shard';
    root.add(mesh);
    expect(codes(root)).toContain('UNIVERSAL_MESH_TOPOLOGY');
  });

  test('blocks an out-of-range geometry index', () => {
    const root = new THREE.Group();
    root.name = 'Root';
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    geometry.setIndex([0, 1, 99]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'Broken';
    root.add(mesh);
    expect(codes(root)).toContain('UNIVERSAL_INVALID_INDEX');
  });

  test('blocks zero scale on renderable/required nodes but only warns on empty organization', () => {
    const root = validRoot();
    const mesh = root.getObjectByName('Body')!;
    mesh.scale.x = 0;
    const organization = new THREE.Group();
    organization.name = 'DisabledBucket';
    organization.scale.y = 0;
    root.add(organization);

    const findings = createUniversalQaRegistry().run({
      intent: createAssetIntentV1({ category: 'prop', requiredParts: ['Body'] }),
      scene: root,
    }).findings;
    expect(
      findings.find((finding) => finding.code === 'UNIVERSAL_ZERO_SCALE_RENDERABLE')?.disposition,
    ).toBe('block');
    expect(
      findings.find((finding) => finding.code === 'UNIVERSAL_ZERO_SCALE_ORGANIZATIONAL')
        ?.disposition,
    ).toBe('warn');
  });

  test('warns on ordinary duplicate names and blocks required duplicates', () => {
    const root = validRoot();
    const duplicate = new THREE.Group();
    duplicate.name = 'Body';
    root.add(duplicate);

    const warning = createUniversalQaRegistry().run({
      intent: createAssetIntentV1({ category: 'prop' }),
      scene: root,
    }).findings;
    expect(
      warning.find((finding) => finding.code === 'UNIVERSAL_DUPLICATE_NODE_NAME')?.disposition,
    ).toBe('warn');

    const blocker = createUniversalQaRegistry().run({
      intent: createAssetIntentV1({ category: 'prop', requiredParts: ['Body'] }),
      scene: root,
    }).findings;
    expect(
      blocker.find((finding) => finding.code === 'UNIVERSAL_DUPLICATE_REQUIRED_NODE_NAME')
        ?.disposition,
    ).toBe('block');
  });

  test('blocks missing required clips and unresolved targets', () => {
    const root = validRoot();
    const intent = createAssetIntentV1({
      category: 'character',
      animation: { clips: ['walk'], locomotionDirection: '+X' },
    });
    const unresolved = new THREE.AnimationClip('walk', 1, [
      new THREE.VectorKeyframeTrack('MissingJoint.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const registry = createUniversalQaRegistry();

    expect(
      registry.run({ intent, scene: root, clips: [] }).findings.map((item) => item.code),
    ).toContain('UNIVERSAL_REQUIRED_CLIP_MISSING');
    expect(
      registry.run({ intent, scene: root, clips: [unresolved] }).findings.map((item) => item.code),
    ).toContain('UNIVERSAL_REQUIRED_ANIMATION_TARGET_UNRESOLVED');
  });

  test('rule modes can demote objective blockers to observe during rollout', () => {
    const root = new THREE.Group();
    const result = createUniversalQaRegistry().run(
      { intent: createAssetIntentV1({ category: 'prop' }), scene: root },
      { byRule: { UNIVERSAL_SCENE_CONTENT_RULE: 'observe' } },
    );
    expect(
      result.findings.find((finding) => finding.code === 'UNIVERSAL_EMPTY_OUTPUT')?.disposition,
    ).toBe('observe');
  });
});
