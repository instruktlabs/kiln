import { expect, test } from 'bun:test';
import * as qa from '@instruktlabs/kiln/qa';
import { resolveRequirementsContext } from '../requirements-context';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

test('the public QA entrypoint exposes current requirements evaluation, not the retired category pipeline', () => {
  for (const name of [
    'DETERMINISTIC_QA_REGISTRY',
    'runDeterministicSceneQa',
    'appendFinalGltfQa',
    'appendRuntimeCostQa',
    'appendMaterialMetricsQa',
    'appendReferenceComparisonQa',
  ])
    expect(qa).not.toHaveProperty(name);
  for (const name of [
    'collectRequirementsSceneEvidence',
    'runRequirementsSceneQa',
    'appendRequirementsQa',
    'appendRequirementsFinalQa',
    'validateRequirementsQaReport',
  ])
    expect(qa).toHaveProperty(name);
});

test('the public neutral runner evaluates a scene with the host policy identity', async () => {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const context = resolveRequirementsContext();
  const evidence = await qa.collectRequirementsSceneEvidence(context, root);
  const report = qa.runRequirementsSceneQa(context, root, [], {}, evidence);
  expect(report).toMatchObject({
    kind: 'kiln.asset-qa-report',
    schemaVersion: 2,
    qaProfile: 'asset.requirements.v1',
    policyHash: context.policyHash,
    acceptance: 'accepted',
  });
  expect(report.rules.find((rule) => rule.id === 'VEHICLE_PROFILE')?.status).toBe('notRequested');
});
