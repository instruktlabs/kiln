import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createAssetRequirementsV1, type AssetRequirementsV1 } from '../contracts/requirements';
import { renderSceneToGLB, inspectSceneStructure } from '../render';
import { createAssetRequirementsStore } from '../requirements-store';
import { resolveRequirementsContext } from '../requirements-context';
import { runRequirementsSceneQa } from './requirements-run';

/** Cushions authored to rest on the seat of a separate structure module, as in the Cove pass. */
function cushions() {
  const root = new THREE.Group();
  root.name = 'SofaSoft';
  const box = (name: string, x: number, bottom: number, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.15, 0.5),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = name;
    mesh.position.set(x, bottom + 0.075, 0);
    parent.add(mesh);
    return mesh;
  };
  box('Throw', 0, 0); // on the floor: the main body of this module
  box('Mesh_Cushion_L', -1, 0.45); // createPart('Cushion_L') names its mesh Mesh_Cushion_L
  const back = new THREE.Group();
  back.name = 'BackCushions';
  root.add(back);
  box('Back_A', 1, 0.45, back);
  box('Pillow', 2, 0.6); // declared, but not at the declared seat height
  box('Lamp', -2, 1.6); // not declared
  return root;
}
const SUPPORT: AssetRequirementsV1['requirements'] = {
  externalSupport: {
    state: 'requested',
    value: { supports: [{ parts: ['Cushion_L', 'BackCushions', 'Pillow'], planeY: 0.45 }] },
    reason: 'Seat structure is a separate module',
  },
};
function bind(requirements: AssetRequirementsV1['requirements']) {
  return createAssetRequirementsStore().host.bind(
    { taskId: 'cove', lineageId: 'sofa' },
    createAssetRequirementsV1({ labels: ['prop'], requirements }),
    { actor: 'owner', source: 'brief', reason: 'Fixture requirement' },
  );
}
/** The parts a floating-parts warning reports, not the siblings its fixes point toward. */
const floaterNames = (warning: string | undefined) =>
  (warning ?? '')
    .slice(warning!.indexOf(': ') + 2)
    .split(' | ')
    .map((entry) => entry.split(' —')[0])
    .sort();
const findings = (requirements: AssetRequirementsV1['requirements']) => {
  const report = runRequirementsSceneQa(
    resolveRequirementsContext(bind(requirements)),
    cushions(),
    [],
    {},
  );
  return { report, all: Object.values(report.dimensions).flatMap((d) => d.findings) };
};

test('a declared external support makes those parts informational and leaves the rest alone', () => {
  const { report, all } = findings(SUPPORT);
  expect(report.unevaluatedRequirements).toEqual([]);
  const supported = all.filter((f) => f.code === 'GEO_PART_EXTERNAL_SUPPORT');
  expect(supported.map((f) => f.affected?.node).sort()).toEqual(['Back_A', 'Mesh_Cushion_L']);
  for (const finding of supported) {
    expect(finding.disposition).toBe('observe');
    expect(finding.message).toContain('requirements.externalSupport');
    expect(finding.measurement).toMatchObject({ name: 'bottomToSupportPlane', expected: 0.45 });
  }
  const floating = all.filter((f) => f.code === 'GEO_PART_CONNECTIVITY');
  expect(floating.map((f) => f.affected?.node).sort()).toEqual(['Lamp', 'Pillow']);
  // Without the declaration every detached part keeps the existing observation.
  const plain = findings({}).all.filter((f) => f.code === 'GEO_PART_CONNECTIVITY');
  expect(plain.map((f) => f.affected?.node).sort()).toEqual([
    'Back_A',
    'Lamp',
    'Mesh_Cushion_L',
    'Pillow',
  ]);
});

test('the floating-parts warning names declared support as information, not as a defect', () => {
  const supports = [{ parts: ['Cushion_L', 'BackCushions', 'Pillow'], planeY: 0.45 }];
  const warnings = inspectSceneStructure(cushions(), { externalSupport: supports });
  const floating = warnings.find((w) => w.startsWith('Floating parts'))!;
  expect(floating).toContain('Lamp');
  expect(floating).toContain('Pillow');
  expect(floating).toContain('declared external support at Y=0.450');
  expect(floaterNames(floating)).toEqual(['Lamp', 'Pillow', 'Throw']);
  const declared = warnings.find((w) => w.startsWith('Declared external support'))!;
  expect(declared).toContain('requirements.externalSupport');
  expect(declared).toContain('Mesh_Cushion_L');
  expect(declared).toContain('Back_A');
  expect(declared).toContain('no action needed');
  const plain = inspectSceneStructure(cushions());
  expect(plain.some((w) => w.startsWith('Declared external support'))).toBe(false);
  expect(floaterNames(plain.find((w) => w.startsWith('Floating parts')))).toEqual([
    'Back_A',
    'Lamp',
    'Mesh_Cushion_L',
    'Pillow',
    'Throw',
  ]);
});

test('render reads the declaration from the bound requirements', async () => {
  const result = await renderSceneToGLB(cushions(), { requirements: bind(SUPPORT) });
  expect(result.warnings.find((w) => w.startsWith('Declared external support'))).toContain(
    'Mesh_Cushion_L',
  );
  expect(floaterNames(result.warnings.find((w) => w.startsWith('Floating parts')))).toEqual([
    'Lamp',
    'Pillow',
    'Throw',
  ]);
});

test('the declaration is part of the requirements policy and validated strictly', () => {
  const hash = (planeY: number, reason: string) =>
    bind({
      externalSupport: {
        state: 'requested',
        value: { supports: [{ parts: ['Cushion_L'], planeY }] },
        reason,
      },
    }).policyHash;
  expect(hash(0.45, 'one')).toBe(hash(0.45, 'another wording'));
  expect(hash(0.45, 'one')).not.toBe(hash(0.5, 'one'));
  expect(hash(0.45, 'one')).not.toBe(bind({}).policyHash);
  for (const value of [
    { supports: [] },
    { supports: [{ parts: [], planeY: 0 }] },
    { supports: [{ parts: ['A', 'A'], planeY: 0 }] },
    { supports: [{ parts: ['A'], planeY: Number.NaN }] },
    { supports: [{ parts: ['A'], planeY: 0, tolerance: -1 }] },
    { supports: [{ parts: ['A'], planeY: 0, height: 1 }] },
  ])
    expect(() =>
      createAssetRequirementsV1({
        labels: ['prop'],
        requirements: { externalSupport: { state: 'requested', value: value as never } },
      }),
    ).toThrow();
});
