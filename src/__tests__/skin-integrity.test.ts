import { expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { createBoneChain } from '../character';
import { createSkinnedPart } from '../skin-binding';
import { renderSceneToGLB } from '../render';
import { AssetQaBlockedError } from '../qa/run';
import { inspectSkinIntegrity } from '../qa/skin-integrity';
import { evaluateEvaluatorRequestV2 } from '../evaluator/handler';
import { createEvaluatorRequestV2, createEvaluatorPortV2 } from '../evaluator/protocol';

function fixture(transformed = false) {
  const root = new THREE.Group();
  root.name = 'Creature';
  if (transformed) {
    root.position.set(0.3, 0.1, -0.2);
    root.rotation.y = 0.35;
    root.scale.set(1.1, 0.95, 0.9);
  }
  const chain = createBoneChain(
    'Arm',
    [
      { role: 'base', offset: [0, 0, 0] },
      { role: 'tip', offset: [0, 1, 0], endEffector: true },
    ],
    { parent: root },
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 2, 0], 3));
  const mesh = createSkinnedPart('Arm', geo, new THREE.MeshStandardMaterial(), {
    parent: root,
    bones: chain.nodes,
    indices: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  });
  return { root, mesh, chain };
}

test('affine inverse roundoff that serializes exactly to Float32 identity remains valid', async () => {
  const { root, mesh } = fixture(true);
  const inverse = mesh.skeleton.boneInverses[0]!;
  expect(inverse.elements[15]).not.toBe(1);
  expect(Math.fround(inverse.elements[15]!)).toBe(1);
  const before = [...inverse.elements];
  expect(inspectSkinIntegrity(root).findings).toEqual([]);
  expect([...inverse.elements]).toEqual(before);
  const exported = await renderSceneToGLB(root, { gltfExporter: 'three', optimize: 'off' });
  expect(exported.gltfValidation.issues.numErrors).toBe(0);
});

test('missing inverse bind matrix reports source skin context before bounds or export mutation', async () => {
  const { root, mesh } = fixture();
  mesh.skeleton.boneInverses.pop();
  const bounds = spyOn(mesh, 'computeBoundingBox');
  let failure: unknown;
  try {
    await renderSceneToGLB(root, { gltfExporter: 'three', optimize: 'off' });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AssetQaBlockedError);
  const error = failure as AssetQaBlockedError;
  expect(error.stage).toBe('scene');
  expect(error.message).toMatch(/SKIN_INVERSE_BIND.*Mesh_Arm/);
  expect(error.report.dimensions.exportIntegrity.findings[0]?.repairText).toMatch(/rest pose/);
  expect(bounds).not.toHaveBeenCalled();
  expect(mesh.geometry.getAttribute('normal')).toBeUndefined();
  expect(mesh.skeleton.boneInverses).toHaveLength(1);
  bounds.mockRestore();
});

test('source binding invariants are not bypassed by derivative or QA-warn export', async () => {
  const previous = process.env.KILN_QA_MODE;
  process.env.KILN_QA_MODE = 'warn';
  try {
    const { root, mesh } = fixture();
    mesh.geometry.getAttribute('skinIndex').setW(2, 99);
    await expect(
      renderSceneToGLB(root, { gltfExporter: 'three', derivative: true, optimize: 'off' }),
    ).rejects.toThrow(/SKIN_JOINT_INDEX.*vertex.*2/);
  } finally {
    if (previous === undefined) delete process.env.KILN_QA_MODE;
    else process.env.KILN_QA_MODE = previous;
  }
});

test('current posed bounds include morphs and transformed roots without mutating bind or pose caches', () => {
  const { root, mesh, chain } = fixture();
  root.position.set(2, 3, -1);
  root.scale.set(2, 1, 1);
  chain.end.rotation.z = Math.PI / 2;
  const morph = new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 2, 0], 3);
  mesh.geometry.morphAttributes.position = [morph];
  mesh.geometry.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences![0] = 0.5;
  const matrices = [
    root.matrix,
    root.matrixWorld,
    mesh.matrixWorld,
    mesh.bindMatrix,
    mesh.bindMatrixInverse,
    ...mesh.skeleton.boneInverses,
    ...chain.nodes.map((b) => b.matrixWorld),
  ];
  const before = matrices.map((m) => [...m.elements]);
  const report = inspectSkinIntegrity(root);
  expect(report.findings).toEqual([]);
  expect(report.verticesChecked).toBe(3);
  expect(report.bounds).toHaveLength(1);
  expect(report.bounds[0]!.min[0]).toBeCloseTo(-2, 10);
  expect(report.bounds[0]!.min[1]).toBeCloseTo(3, 10);
  [4, 4, -1].forEach((value, i) => {
    expect(report.bounds[0]!.max[i]).toBeCloseTo(value, 10);
  });
  expect(matrices.map((m) => [...m.elements])).toEqual(before);
  expect(mesh.boundingBox).toBeNull();
  expect(mesh.morphTargetInfluences).toEqual([0.5]);
});

test('detached skins, normalized interleaved weights and intentionally singular inverse matrices remain supported', async () => {
  const { root, mesh } = fixture();
  mesh.bindMode = THREE.DetachedBindMode;
  const data = new THREE.InterleavedBuffer(
    new Uint8Array([9, 255, 0, 0, 0, 9, 255, 0, 0, 0, 9, 255, 0, 0, 0]),
    5,
  );
  mesh.geometry.setAttribute('skinWeight', new THREE.InterleavedBufferAttribute(data, 4, 1, true));
  mesh.skeleton.boneInverses[0]!.makeScale(1, 0, 1);
  // glTF requires affine inverse-bind data; it does not mandate an invertible matrix.
  expect(inspectSkinIntegrity(root).findings).toEqual([]);
  const exported = await renderSceneToGLB(root, { gltfExporter: 'three', optimize: 'off' });
  expect(exported.gltfValidation.issues.numErrors).toBe(0);
});

const mutations: [string, string, (f: ReturnType<typeof fixture>) => void][] = [
  [
    'empty skeleton',
    'SKIN_SKELETON',
    (f) => {
      f.mesh.skeleton.bones = [];
    },
  ],
  [
    'missing joint',
    'SKIN_JOINT_MEMBERSHIP',
    (f) => {
      f.mesh.skeleton.bones[1] = undefined as unknown as THREE.Bone;
    },
  ],
  [
    'duplicate joint',
    'SKIN_JOINT_MEMBERSHIP',
    (f) => {
      f.mesh.skeleton.bones[1] = f.chain.root;
    },
  ],
  [
    'external joint',
    'SKIN_JOINT_MEMBERSHIP',
    (f) => {
      f.chain.root.removeFromParent();
    },
  ],
  [
    'nonfinite inverse',
    'SKIN_INVERSE_BIND',
    (f) => {
      f.mesh.skeleton.boneInverses[1]!.elements[0] = NaN;
    },
  ],
  [
    'projective inverse',
    'SKIN_INVERSE_BIND',
    (f) => {
      f.mesh.skeleton.boneInverses[1]!.elements[3] = 1;
    },
  ],
  [
    'nonfinite bind',
    'SKIN_BIND_MATRIX',
    (f) => {
      f.mesh.bindMatrix.elements[0] = Infinity;
    },
  ],
  [
    'singular bind',
    'SKIN_BIND_MATRIX',
    (f) => {
      f.mesh.bindMatrix.makeScale(0, 1, 1);
    },
  ],
  [
    'weight count mismatch',
    'SKIN_ATTRIBUTES',
    (f) => {
      f.mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    },
  ],
  [
    'missing indices',
    'SKIN_ATTRIBUTES',
    (f) => {
      f.mesh.geometry.deleteAttribute('skinIndex');
    },
  ],
  [
    'nonfinite joint transform',
    'SKIN_POSE_TRANSFORM',
    (f) => {
      f.chain.end.position.x = NaN;
    },
  ],
  [
    'nonfinite posed position',
    'SKIN_POSED_VERTEX',
    (f) => {
      f.mesh.geometry.getAttribute('position').setX(2, Infinity);
    },
  ],
];
for (const [name, code, mutate] of mutations)
  test(`skin integrity identifies ${name} without repairing source`, () => {
    const f = fixture();
    mutate(f);
    const report = inspectSkinIntegrity(f.root);
    expect(report.findings.map((r) => r.code)).toContain(code);
    expect(report.bounds).toHaveLength(0);
    expect(
      report.findings.every((r) =>
        /Creature\[0\]\/Mesh_Arm\[\d\]/.test(r.affected?.nodePath ?? ''),
      ),
    ).toBe(true);
  });

test('weight and index findings aggregate affected vertex ranges with bounded diagnostics', () => {
  const { root, mesh } = fixture();
  mesh.geometry.getAttribute('skinWeight').setXYZW(0, 0, 0, 0, 0);
  mesh.geometry.getAttribute('skinWeight').setXYZW(2, -1, 0, 0, 0);
  mesh.geometry.getAttribute('skinIndex').setW(2, 99);
  const report = inspectSkinIntegrity(root);
  const sum = report.findings.find((r) => r.code === 'SKIN_WEIGHT_SUM')!;
  expect(sum.measurement).toMatchObject({
    actual: 2,
    expected: 0,
    breakdown: { firstVertex: 0, lastVertex: 2 },
  });
  expect(report.findings.map((r) => r.code)).toContain('SKIN_WEIGHT_VALUE');
  expect(report.findings.map((r) => r.code)).toContain('SKIN_JOINT_INDEX');
  const many = new THREE.Group();
  for (let i = 0; i < 100; i++) {
    const f = fixture();
    f.mesh.skeleton.boneInverses = [];
    many.add(f.root);
  }
  const bounded = inspectSkinIntegrity(many);
  expect(bounded.findings).toHaveLength(64);
  expect(bounded.truncated).toBe(true);
  expect(bounded.meshesChecked).toBeLessThan(100);
});

test('rigid controls and non-skin geometries do not acquire body-plan or closure requirements', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial()));
  expect(inspectSkinIntegrity(root)).toMatchObject({
    findings: [],
    meshesChecked: 0,
    verticesChecked: 0,
    bounds: [],
    truncated: false,
  });
});

test('worker protocol preserves actionable source skin findings and their partial QA scope', async () => {
  const code = `function build(){const r=createRoot('Root');const b=createBoneChain('Tail',[{role:'base',offset:[0,0,0]}],{parent:r});const g=boxGeo(1,1,1);const n=g.getAttribute('position').count;const w=Array.from({length:n*4},(_,i)=>i%4===0?1:0);const m=createSkinnedPart('Tail',g,gameMaterial(0x999999),{parent:r,bones:b.nodes,indices:Array(n*4).fill(0),weights:w});m.skeleton.boneInverses=[];return r;}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'skin', code }).json,
  );
  const result = JSON.parse(wire);
  expect(result.error.code).toBe('QA_BLOCKED');
  expect(JSON.stringify(result)).toMatch(/SKIN_INVERSE_BIND.*Mesh_Tail/);
  const port = createEvaluatorPortV2((request) => evaluateEvaluatorRequestV2(request));
  let failure: unknown;
  try {
    await port.render(code);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AssetQaBlockedError);
  expect((failure as AssetQaBlockedError).report.dimensions.exportIntegrity.status).toBe('block');
  expect((failure as AssetQaBlockedError).report.dimensions.visualQuality.status).toBe(
    'notEvaluated',
  );
});

test('explicit local/world matrices are respected and stale computed bounds are not treated as pose evidence', () => {
  const { root, mesh, chain } = fixture();
  root.matrixAutoUpdate = false;
  root.matrix.makeTranslation(3, 0, 0);
  chain.end.matrixWorldAutoUpdate = false;
  chain.end.matrixWorld.makeTranslation(3, 2, 0);
  mesh.boundingBox = new THREE.Box3(
    new THREE.Vector3(-99, -99, -99),
    new THREE.Vector3(99, 99, 99),
  );
  const report = inspectSkinIntegrity(root);
  expect(report.findings).toEqual([]);
  expect(report.bounds[0]!.min).toEqual([3, 0, 0]);
  expect(report.bounds[0]!.max).toEqual([4, 3, 0]);
  expect(mesh.boundingBox.max.x).toBe(99);
});

test('invalid buffer backing and normalized joint indices fail before a vertex walk', () => {
  const f = fixture();
  const indices = f.mesh.geometry.getAttribute('skinIndex');
  indices.normalized = true;
  expect(inspectSkinIntegrity(f.root).findings[0]?.code).toBe('SKIN_ATTRIBUTES');
  indices.normalized = false;
  const weights = f.mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
  weights.array = new Float32Array(4);
  const read = spyOn(weights, 'getComponent');
  expect(inspectSkinIntegrity(f.root).findings[0]?.code).toBe('SKIN_ATTRIBUTES');
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
});
