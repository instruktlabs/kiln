import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createAssetRequirementsV1, type AssetRequirementsV1 } from '../contracts/requirements';
import { createAssetRequirementsStore } from '../requirements-store';
import { resolveRequirementsContext } from '../requirements-context';
import { runRequirementsSceneQa } from './requirements-run';

function report(
  scene: THREE.Object3D,
  requirements: AssetRequirementsV1['requirements'] = {},
  policy = {},
) {
  const binding = createAssetRequirementsStore().host.bind(
    { taskId: 'placement', lineageId: 'one' },
    createAssetRequirementsV1({ labels: ['prop', 'architecture', 'environment'], requirements }),
    { actor: 'owner', source: 'brief', reason: 'Fixture requirement' },
  );
  return runRequirementsSceneQa(resolveRequirementsContext(binding), scene, [], policy);
}
function cube(y: number) {
  const root = new THREE.Group();
  root.name = 'Asset';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'Body';
  mesh.position.y = y;
  root.add(mesh);
  return root;
}
const findings = (r: ReturnType<typeof report>) =>
  Object.values(r.dimensions).flatMap((d) => d.findings);

test('floating geometry and disconnected pieces have no implied contact requirement', () => {
  const root = cube(4);
  const other = cube(9);
  other.name = 'Other';
  other.children[0]!.name = 'OtherBody';
  root.add(other);
  const result = report(root);
  expect(findings(result).some((f) => f.code.includes('GROUND'))).toBe(false);
  expect(result.rules.find((r) => r.id === 'PROP_ADVISORY_PROFILE')?.status).toBe('notRequested');
});

test('requested grounding measures the chosen local plane without promoting the existing advisory', () => {
  const root = cube(4);
  const ground = report(root, { grounding: { state: 'requested', value: { planeY: 3.5 } } });
  expect(ground.rules.find((r) => r.id === 'PROP_ADVISORY_PROFILE')?.status).toBe('evaluated');
  expect(ground.unevaluatedRequirements).toEqual([]);
  expect(findings(ground).some((f) => f.code === 'PROP_GROUND_MISMATCH')).toBe(false);
  const floating = report(root, { grounding: { state: 'requested', value: {} } });
  expect(findings(floating).find((f) => f.code === 'PROP_GROUND_MISMATCH')).toMatchObject({
    disposition: 'observe',
    measurement: { actual: 3.5, expected: 0, threshold: 0.02 },
  });
});

test('requested extents use asset-local measurements even when the root is transformed', () => {
  const root = cube(0.5);
  root.position.set(30, 10, 0);
  root.rotation.set(0.2, 0.4, 0.7);
  root.scale.setScalar(3);
  const good = report(root, {
    bounds: { state: 'requested', value: { units: 'm', x: 1, y: 1, z: 1 } },
  });
  expect(good.unevaluatedRequirements).toEqual([]);
  expect(findings(good).filter((f) => f.code === 'PROP_SCALE_BOUNDS_MISMATCH')).toEqual([]);
  const bad = report(root, { bounds: { state: 'requested', value: { units: 'm', z: 3 } } });
  expect(findings(bad).find((f) => f.code === 'PROP_SCALE_BOUNDS_MISMATCH')).toMatchObject({
    disposition: 'observe',
    measurement: { name: 'bounds.z', actual: 1, expected: 3 },
  });
});

test('inferred placement and disabled placement checks cannot become enforced or accepted obligations', () => {
  const root = cube(4);
  expect(
    report(root, { grounding: { state: 'inferred', value: {} } }).unevaluatedRequirements,
  ).toEqual([]);
  expect(
    findings(report(root, { grounding: { state: 'inferred', value: {} } })).some(
      (f) => f.code === 'PROP_GROUND_MISMATCH',
    ),
  ).toBe(false);
  const disabled = report(
    root,
    { grounding: { state: 'requested', value: {} } },
    { byRule: { PROP_ADVISORY_PROFILE: 'off' as const } },
  );
  expect(disabled.acceptance).toBe('incomplete');
});

test('instance matrices contribute to requested base and extents', () => {
  const root = new THREE.Group();
  root.name = 'Set';
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
    2,
  );
  mesh.name = 'Bodies';
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 0.5, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0.5, 0));
  root.add(mesh);
  const result = report(root, {
    grounding: { state: 'requested', value: {} },
    bounds: { state: 'requested', value: { units: 'm', x: 5, y: 1, z: 1 } },
  });
  expect(result.unevaluatedRequirements).toEqual([]);
  expect(
    findings(result).filter(
      (f) => f.code === 'PROP_GROUND_MISMATCH' || f.code === 'PROP_SCALE_BOUNDS_MISMATCH',
    ),
  ).toEqual([]);
});

test('rotated triangle extents use its vertices, not the empty corners of its local box', () => {
  const root = new THREE.Group();
  root.name = 'Triangle';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'Blade';
  mesh.rotation.z = Math.PI / 4;
  root.add(mesh);
  const result = report(root, {
    bounds: { state: 'requested', value: { units: 'm', x: Math.SQRT2, y: Math.SQRT1_2 } },
    grounding: { state: 'requested', value: {} },
  });
  expect(findings(result).filter((f) => /SCALE_BOUNDS|GROUND/.test(f.code))).toEqual([]);
});

test('rotated sparse geometry must not conceal a grounding gap behind empty box corners', () => {
  const root = new THREE.Group();
  root.name = 'Sparse';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
  );
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
  mesh.name = 'Copies';
  mesh.setMatrixAt(0, new THREE.Matrix4().makeRotationZ(Math.PI / 4));
  mesh.setMatrixAt(
    1,
    new THREE.Matrix4()
      .makeTranslation(3, 2, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 4)),
  );
  root.add(mesh);
  const result = report(root, { grounding: { state: 'requested', value: {} } });
  expect(findings(result).find((f) => f.code === 'PROP_GROUND_MISMATCH')).toMatchObject({
    disposition: 'observe',
    measurement: { actual: Math.round(Math.SQRT1_2 * 1e6) / 1e6, expected: 0 },
  });
});

test('unrequested placement has no promotion decision; requested placement retains its evidence ceiling', () => {
  const policy = {
    defaultMode: 'enforce' as const,
    byRule: {
      GEO_PART_CONNECTIVITY: 'observe' as const,
      GEO_PART_SELF_INTERSECTION: 'observe' as const,
      SWEEP_SELF_INTERSECTION: 'observe' as const,
    },
  };
  expect(() => report(cube(0.5), {}, policy)).not.toThrow();
  expect(() => report(cube(0.5), { grounding: { state: 'requested', value: {} } }, policy)).toThrow(
    'frozen promotion evidence',
  );
});
