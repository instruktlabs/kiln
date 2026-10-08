import { expect, test } from 'bun:test';
import { createAssetRequirementsV1, requestedRequirement } from '../contracts/requirements';
import { DETERMINISTIC_QA_REGISTRY } from './run';
import {
  REQUIREMENTS_RULE_MAP,
  resolveRequirementsApplicability,
} from './requirements-applicability';
test('the migration map covers each of the 29 actual registered rules and preserves modes', () => {
  const rules = DETERMINISTIC_QA_REGISTRY.list();
  expect(rules).toHaveLength(29);
  expect(REQUIREMENTS_RULE_MAP).toHaveLength(29);
  expect(new Set(REQUIREMENTS_RULE_MAP.map((rule) => rule.id)).size).toBe(29);
  expect(REQUIREMENTS_RULE_MAP.map((rule) => [rule.id, rule.mode]).sort()).toEqual(
    rules.map((rule) => [rule.id, rule.defaultMode]).sort(),
  );
});
test('labels never select a domain and empty requirements do not imply prop or grounding', () => {
  const neutral = resolveRequirementsApplicability(createAssetRequirementsV1());
  const labeled = resolveRequirementsApplicability(
    createAssetRequirementsV1({ labels: ['vehicle', 'architecture'] }),
  );
  expect(labeled).toEqual(neutral);
  expect(neutral.unevaluatedRequirements).toEqual([]);
  expect(neutral.rules.filter((rule) => rule.status === 'evaluate')).toHaveLength(11);
  expect(neutral.rules.find((rule) => rule.id === 'GEO_PART_SELF_INTERSECTION')).toMatchObject({
    mode: 'observe',
    status: 'evaluate',
  });
  expect(neutral.rules.find((rule) => rule.id === 'PROP_CAPABILITY_EXACT_PROFILE')?.status).toBe(
    'notRequested',
  );
});
test('requested unsupported domains remain explicit and cannot establish completed acceptance', () => {
  const result = resolveRequirementsApplicability(
    createAssetRequirementsV1({
      requirements: {
        structure: requestedRequirement({
          storeyCount: 6,
          roof: { type: 'hyperbolic-paraboloid' },
        }),
        navigation: requestedRequirement({}),
        tiling: requestedRequirement({}),
      },
    }),
  );
  expect(result.unevaluatedRequirements.map((x) => x.key).sort()).toEqual(['structure']);
  expect(result.rules.find((rule) => rule.id === 'ARCHITECTURE_PROFILE')?.status).toBe('evaluate');
  expect(result.rules.find((rule) => rule.id === 'ENVIRONMENT_EXACT_PROFILE')?.status).toBe(
    'evaluate',
  );
});
test('inferred advice does not create an obligation or enforce decision', () => {
  const result = resolveRequirementsApplicability(
    createAssetRequirementsV1({
      requirements: {
        mobility: { state: 'inferred', value: { wheelCount: 4 } },
        grounding: { state: 'unknown' },
        tiling: { state: 'inapplicable' },
      },
    }),
  );
  expect(result.unevaluatedRequirements).toEqual([]);
  expect(result.rules.find((rule) => rule.id === 'VEHICLE_PROFILE')?.status).toBe('notRequested');
});
test('field-level coverage distinguishes clip existence from unmeasured animation behavior', () => {
  const clips = resolveRequirementsApplicability(
    createAssetRequirementsV1({
      requirements: { animation: requestedRequirement({ clips: ['Wave'] }) },
    }),
  );
  expect(clips.unevaluatedRequirements).toEqual([]);
  const rootMotion = resolveRequirementsApplicability(
    createAssetRequirementsV1({
      requirements: { animation: requestedRequirement({ clips: ['Walk'], rootMotion: 'forward' }) },
    }),
  );
  expect(rootMotion.unevaluatedRequirements).toEqual([
    { key: 'animation', fields: ['rootMotion'], reason: expect.any(String) },
  ]);
});
