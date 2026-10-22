import { expect, test } from 'bun:test';
import { createAssetRequirementsV1, requestedRequirement } from './contracts/requirements';
import { createAssetRequirementsStore } from './requirements-store';
import {
  resolveRequirementsContext,
  readRequirementsCheckpoint,
  createRequirementsCheckpoint,
} from './requirements-context';
const authority = { actor: 'fixture-host', reason: 'user brief', source: 'brief' as const };
function binding(requirements = createAssetRequirementsV1()) {
  return createAssetRequirementsStore().host.bind(
    { taskId: 'task-a', lineageId: 'asset-a' },
    requirements,
    authority,
  );
}
test('the unbound default is neutral and contains no historical intent', () => {
  const context = resolveRequirementsContext();
  expect(context.requirements.requirements).toEqual({});
  expect(context.binding).toBeUndefined();
  expect(context).not.toHaveProperty('category');
  expect(context).not.toHaveProperty('intent');
  expect(context.policyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
});
test('requested policy and inferred advice are independently hashed', () => {
  const base = resolveRequirementsContext(binding());
  const requested = resolveRequirementsContext(
    binding(createAssetRequirementsV1({ requirements: { grounding: requestedRequirement({}) } })),
  );
  const inferred = resolveRequirementsContext(
    binding(
      createAssetRequirementsV1({ requirements: { grounding: { state: 'inferred', value: {} } } }),
    ),
  );
  expect(requested.policyHash).not.toBe(base.policyHash);
  expect(requested.adviceHash).toBe(base.adviceHash);
  expect(inferred.policyHash).toBe(base.policyHash);
  expect(inferred.adviceHash).not.toBe(base.adviceHash);
});
test('labels, prose and lineage do not alter equivalent enforcement identity', () => {
  const requirements = createAssetRequirementsV1({
    labels: ['architecture'],
    requirements: { grounding: requestedRequirement({}, 'explicit brief') },
  });
  const first = resolveRequirementsContext(binding(requirements));
  requirements.labels = ['spaceship'];
  requirements.requirements.grounding!.reason = 'other prose';
  const secondBinding = createAssetRequirementsStore().host.bind(
    { taskId: 'other-task', lineageId: 'other-asset' },
    requirements,
    authority,
  );
  const second = resolveRequirementsContext(secondBinding);
  expect(second.policyHash).toBe(first.policyHash);
  expect(second.adviceHash).toBe(first.adviceHash);
  expect(second.binding!.taskId).toBe('other-task');
});
test('a resolved context is detached from mutable caller input', () => {
  const source = binding(
    createAssetRequirementsV1({
      requirements: { animation: requestedRequirement({ clips: ['Wave'] }) },
    }),
  );
  const resolved = resolveRequirementsContext(source);
  source.requirements.requirements.animation = { state: 'inapplicable' };
  expect(resolved.requirements.requirements.animation).toEqual(
    requestedRequirement({ clips: ['Wave'] }),
  );
  expect(resolved.binding!.requirements).toEqual(resolved.requirements);
});
test('forged snapshot hash, revision, lineage, and historical chain are rejected', () => {
  const source = binding();
  for (const corrupt of [
    { ...source, policyHash: '0'.repeat(64) },
    { ...source, revision: 2 },
    { ...source, taskId: '' },
    { ...source, history: [] },
    { ...source, history: [{ ...source.history[0]!, revision: 2 }] },
    { ...source, unexpected: true },
  ])
    expect(() => resolveRequirementsContext(corrupt)).toThrow(/binding|requirements/i);
});
test('valid revision history survives a checkpoint without activating host authority', () => {
  const store = createAssetRequirementsStore();
  const initial = store.host.bind(
    { taskId: 't', lineageId: 'a' },
    createAssetRequirementsV1(),
    authority,
  );
  const revised = store.host.replace(
    { taskId: 't', lineageId: 'a' },
    initial.revision,
    createAssetRequirementsV1({ requirements: { grounding: requestedRequirement({}) } }),
    { ...authority, reason: 'changed brief' },
  );
  const checkpoint = createRequirementsCheckpoint(`sha256:${'a'.repeat(64)}`, revised);
  const decoded = readRequirementsCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  expect(decoded.status).toBe('host-binding-required');
  expect(decoded.checkpoint.binding.history).toHaveLength(2);
  expect(decoded.checkpoint.binding).toEqual(revised);
  expect(() => createAssetRequirementsStore().reader.get({ taskId: 't', lineageId: 'a' })).toThrow(
    /not bound/,
  );
});
test('checkpoint decoding rejects legacy policy and inconsistent hashes', () => {
  expect(() => readRequirementsCheckpoint({ intent: { category: 'prop' } })).toThrow(/migration/i);
  const checkpoint = createRequirementsCheckpoint(`sha256:${'a'.repeat(64)}`, binding());
  checkpoint.binding.requirements.requirements.grounding = requestedRequirement({});
  expect(() => readRequirementsCheckpoint(checkpoint)).toThrow(/binding|requirements/i);
});
test('a validation profile is host policy: replacing it changes both policy hashes', () => {
  const profile = (doubleSided: boolean) => ({
    version: 'kiln.validation-profile.v1' as const,
    profileId: 'holodeck.palm',
    mode: 'enforce' as const,
    checks: [{ id: 'frond', select: { names: ['frond_*'] }, material: { doubleSided } }],
  });
  const store = createAssetRequirementsStore();
  const key = { taskId: 'palm', lineageId: 'palm-a' };
  const first = store.host.bind(
    key,
    createAssetRequirementsV1({
      requirements: { validation: requestedRequirement(profile(false)) },
    }),
    authority,
  );
  const second = store.host.replace(
    key,
    first.revision,
    createAssetRequirementsV1({
      requirements: { validation: requestedRequirement(profile(true)) },
    }),
    { ...authority, reason: 'stricter destination' },
  );
  expect(second.policyHash).not.toBe(first.policyHash);
  expect(second.history.map((change) => change.policyHash)).toEqual([
    first.policyHash,
    second.policyHash,
  ]);
  const before = resolveRequirementsContext(first);
  const after = resolveRequirementsContext(second);
  expect(after.policyHash).not.toBe(before.policyHash);
  expect(after.adviceHash).toBe(before.adviceHash);
  // Only a requested profile is policy; an inferred one is advice and never evaluates.
  const inferred = resolveRequirementsContext(
    binding(
      createAssetRequirementsV1({
        requirements: { validation: { state: 'inferred', value: profile(true) } },
      }),
    ),
  );
  expect(inferred.policyHash).toBe(resolveRequirementsContext(binding()).policyHash);
});
