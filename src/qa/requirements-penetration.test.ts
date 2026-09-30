import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../render';
import { validateRequirementsQaReport } from './requirements-report';
import { resolveRequirementsContext } from '../requirements-context';
import { collectRequirementsSceneEvidence, runRequirementsSceneQa } from './requirements-run';
import { markOpenShell } from '../open-shell';

function box(name: string, x: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.position.x = x;
  return mesh;
}
function scene(...children: THREE.Object3D[]) {
  const root = new THREE.Group();
  root.name = 'Root';
  root.add(...children);
  return root;
}
const ruleId = 'GEO_PART_SELF_INTERSECTION';
const findings = (qa: Awaited<ReturnType<typeof renderSceneToGLB>>['qaReport']) =>
  qa.dimensions.visualQuality.findings.filter((f) => f.code.startsWith(ruleId));

test('ordinary neutral export includes actual reflected solid-overlap observations', async () => {
  const b = box('B', 0.5);
  b.scale.x = -1;
  const root = scene(box('A', 0), b);
  root.userData.partPenetration = { penetrations: [] }; // Authored data is not evidence.
  const { qaReport: qa } = await renderSceneToGLB(root);
  expect(qa.rules.find((r) => r.id === ruleId)).toMatchObject({
    mode: 'observe',
    status: 'evaluated',
  });
  expect(findings(qa)).toHaveLength(1);
  expect(findings(qa)[0]!.measurement?.actual).toBeCloseTo(0.5, 6);
  expect(findings(qa)[0]!.disposition).toBe('observe');
  expect(qa.acceptance).toBe('accepted');
  expect(validateRequirementsQaReport(qa, resolveRequirementsContext())).toEqual(qa);
});

test('contact and separated floating parts stay valid, with a completed bounded measurement', async () => {
  for (const x of [1, 3]) {
    const root = scene(box('A', 0), box('B', x));
    root.position.y = 5;
    const { qaReport: qa } = await renderSceneToGLB(root);
    expect(qa.acceptance).toBe('accepted');
    expect(findings(qa)).toEqual([]);
    expect(qa.rules.find((r) => r.id === ruleId)?.status).toBe('evaluated');
    expect(qa.dimensions.visualQuality.metrics?.partVolumeCoverage).toBe('complete-static-pairs');
  }
});

test('open sheets remain exportable and their incomplete volume coverage cannot look checked', async () => {
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial());
  sheet.name = 'Sheet';
  const { qaReport: qa } = await renderSceneToGLB(scene(box('Box', 0), sheet));
  expect(qa.acceptance).toBe('accepted');
  expect(findings(qa).some((f) => f.code === `${ruleId}_UNMEASURED`)).toBe(true);
  expect(qa.rules.find((r) => r.id === ruleId)?.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.metrics?.partVolumeCoverage).toBe('partial');
  expect(qa.dimensions.visualQuality.metrics).toMatchObject({
    partVolumeCandidatePairs: 1,
    partVolumePairsTested: 0,
    partVolumeUnmeasurablePairs: 1,
    partVolumePairsNotReached: 0,
  });
  // Open parts leave pairs unmeasured; that is not a truncated budget.
  expect(findings(qa).some((f) => f.code === `${ruleId}_TRUNCATED`)).toBe(false);
  // Without a mark nothing is acknowledged, and the metrics keep their earlier keys.
  expect(qa.dimensions.visualQuality.metrics?.partVolumeAcknowledgedParts).toBeUndefined();
  expect(validateRequirementsQaReport(qa, resolveRequirementsContext())).toEqual(qa);
});

test('a marked open sheet is acknowledged, and its volume coverage still reads as partial', async () => {
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial());
  sheet.name = 'Sheet';
  markOpenShell(sheet, 'A single-sided sign face');
  const { qaReport: qa } = await renderSceneToGLB(scene(box('Box', 0), sheet));
  expect(qa.acceptance).toBe('accepted');
  expect(findings(qa).map((f) => f.code)).toEqual([`${ruleId}_ACKNOWLEDGED`]);
  expect(findings(qa)[0]!.message).toContain('"A single-sided sign face"');
  // The mark records intent; the pair with the sheet is still unmeasured, not clear.
  expect(qa.rules.find((r) => r.id === ruleId)?.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.metrics).toMatchObject({
    partVolumeCoverage: 'partial',
    partVolumeUnmeasurablePairs: 1,
    partVolumeSkipped: 0,
    partVolumeAcknowledgedParts: 1,
    partVolumeAcknowledgedPairs: 1,
  });
  expect(validateRequirementsQaReport(qa, resolveRequirementsContext())).toEqual(qa);
});

test('truncated pair coverage is visible without rejecting intentional overlaps', async () => {
  const root = scene(...Array.from({ length: 13 }, (_, i) => box(`P${i}`, 0)));
  const { qaReport: qa } = await renderSceneToGLB(root);
  expect(qa.acceptance).toBe('accepted');
  expect(qa.rules.find((r) => r.id === ruleId)?.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.metrics).toMatchObject({
    partVolumeCandidatePairs: 78,
    partVolumePairsTested: 64,
    partVolumeUnmeasurablePairs: 0,
    partVolumePairsNotReached: 14,
    partVolumeLodAlternatePairs: 0,
  });
  expect(findings(qa).some((f) => f.code === `${ruleId}_TRUNCATED`)).toBe(true);
});

test('disabled QA does not run or fabricate volume measurements', async () => {
  const prior = process.env.KILN_QA_MODE;
  process.env.KILN_QA_MODE = 'off';
  try {
    const { qaReport: qa } = await renderSceneToGLB(scene(box('A', 0), box('B', 0.5)));
    expect(qa.rules.find((r) => r.id === ruleId)).toMatchObject({
      mode: 'off',
      status: 'notEvaluated',
    });
    expect(findings(qa)).toEqual([]);
    expect(qa.dimensions.visualQuality.metrics?.partVolumeCoverage).toBeUndefined();
  } finally {
    if (prior === undefined) delete process.env.KILN_QA_MODE;
    else process.env.KILN_QA_MODE = prior;
  }
});

test('an unavailable observation retains findings but cannot report a successful measurement', async () => {
  const root = scene(box('A', 0), box('B', 0.5));
  const traverseVisible = root.traverseVisible;
  root.traverseVisible = () => {
    throw new Error('Injected analyzer failure');
  };
  const context = resolveRequirementsContext();
  const evidence = await collectRequirementsSceneEvidence(context, root);
  // Only the volume pre-pass fails; the synchronous observations read the scene normally.
  root.traverseVisible = traverseVisible;
  const qa = runRequirementsSceneQa(context, root, [], {}, evidence);
  expect(qa.acceptance).toBe('accepted');
  expect(qa.rules.find((r) => r.id === ruleId)?.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.status).toBe('notEvaluated');
  expect(qa.dimensions.visualQuality.metrics?.partVolumeCoverage).toBe('unavailable');
  expect(findings(qa).some((f) => f.code === `${ruleId}_UNMEASURED`)).toBe(true);
  expect(validateRequirementsQaReport(qa, context)).toEqual(qa);
  expect(
    await collectRequirementsSceneEvidence(context, root, { byRule: { [ruleId]: 'off' } }),
  ).toEqual({});
  await expect(
    collectRequirementsSceneEvidence(context, root, {
      byRule: { [ruleId]: 'enforce' },
    }),
  ).rejects.toThrow('cannot enter enforce');
});
