import type { RequirementsContext } from '../requirements-context';
import {
  REQUIREMENTS_RULE_MAP,
  resolveRequirementsApplicability,
  sceneMeasurementGaps,
  type UnevaluatedRequirement,
} from './requirements-applicability';
import type { QaFinding, QaDimensionResult, QaRuleMode } from './index';
import { isQaFinding } from './types';
export const REQUIREMENTS_QA_DIMENSIONS = [
  'exportIntegrity',
  'requirementReadiness',
  'promptAlignment',
  'visualQuality',
  'runtimeCost',
] as const;
export type RequirementsQaDimension = (typeof REQUIREMENTS_QA_DIMENSIONS)[number];
export type RequirementsQaFinding = Omit<QaFinding, 'dimension'> & {
  dimension: RequirementsQaDimension;
};
export type RequirementsQaDimensionResult = Omit<QaDimensionResult, 'findings'> & {
  findings: RequirementsQaFinding[];
};
export interface AssetRequirementsQaReportV2 {
  kind: 'kiln.asset-qa-report';
  schemaVersion: 2;
  qaProfile: 'asset.requirements.v1';
  policyHash: `sha256:${string}`;
  adviceHash: `sha256:${string}`;
  acceptance: 'accepted' | 'incomplete' | 'blocked';
  disposition: 'pass' | 'warn' | 'block' | 'notEvaluated';
  dimensions: Record<RequirementsQaDimension, RequirementsQaDimensionResult>;
  rules: {
    id: string;
    mode: QaRuleMode;
    status: 'evaluated' | 'notEvaluated' | 'notRequested';
    reason?: string;
  }[];
  unevaluatedRequirements: UnevaluatedRequirement[];
}
export interface RequirementsQaReportOptions {
  findings?: readonly (QaFinding | RequirementsQaFinding)[];
  executedRules: readonly string[];
  modes?: Readonly<Record<string, QaRuleMode>>;
  evaluatedDimensions?: readonly RequirementsQaDimension[];
  metrics?: Partial<
    Record<RequirementsQaDimension, Record<string, number | string | boolean | null>>
  >;
}
export function createRequirementsQaReport(
  context: RequirementsContext,
  options: RequirementsQaReportOptions,
): AssetRequirementsQaReportV2 {
  const applicability = resolveRequirementsApplicability(context.requirements);
  const unevaluatedRequirements = [
    ...applicability.unevaluatedRequirements,
    ...sceneMeasurementGaps(context.requirements, options.findings ?? []),
  ];
  const executed = new Set(options.executedRules);
  const rules = applicability.rules.map((rule) => ({
    id: rule.id,
    mode: options.modes?.[rule.id] ?? rule.mode,
    status:
      rule.status === 'evaluate'
        ? executed.has(rule.id)
          ? ('evaluated' as const)
          : ('notEvaluated' as const)
        : rule.status,
    ...(rule.reason ? { reason: rule.reason } : {}),
  }));
  const incomplete =
    unevaluatedRequirements.length > 0 ||
    applicability.rules.some(
      (rule) =>
        rule.status === 'evaluate' &&
        // Unrequested geometry observations are not acceptance obligations.
        // Required advisory measurements still participate through their keys.
        !(rule.mode === 'observe' && rule.keys.length === 0) &&
        (!executed.has(rule.id) ||
          (options.modes?.[rule.id] ?? rule.mode) === 'off' ||
          (rule.mode === 'enforce' && (options.modes?.[rule.id] ?? rule.mode) !== 'enforce')),
    );
  const findings: RequirementsQaFinding[] = (options.findings ?? []).map((finding) => ({
    ...finding,
    dimension:
      finding.dimension === 'categoryReadiness' ? 'requirementReadiness' : finding.dimension,
  }));
  const evaluated = new Set<RequirementsQaDimension>(
    options.evaluatedDimensions ?? ['exportIntegrity', 'requirementReadiness'],
  );
  for (const finding of findings) evaluated.add(finding.dimension);
  const dimensions = Object.fromEntries(
    REQUIREMENTS_QA_DIMENSIONS.map((dimension) => {
      const selected = findings.filter((finding) => finding.dimension === dimension);
      // An acknowledged open shell still leaves overlap unmeasured: intent is not a measurement.
      const partialObservation = selected.some(
        (finding) =>
          finding.code === 'GEO_PART_SELF_INTERSECTION_UNMEASURED' ||
          finding.code === 'GEO_PART_SELF_INTERSECTION_TRUNCATED' ||
          finding.code === 'GEO_PART_SELF_INTERSECTION_ACKNOWLEDGED',
      );
      const status = selected.some((f) => f.disposition === 'block')
        ? 'block'
        : partialObservation ||
            !evaluated.has(dimension) ||
            (dimension === 'requirementReadiness' && incomplete)
          ? 'notEvaluated'
          : selected.some((f) => f.disposition === 'warn')
            ? 'warn'
            : 'pass';
      return [
        dimension,
        {
          status,
          findings: selected,
          ...(options.metrics?.[dimension] ? { metrics: options.metrics[dimension] } : {}),
        },
      ];
    }),
  ) as Record<RequirementsQaDimension, RequirementsQaDimensionResult>;
  const blocked = findings.some((f) => f.disposition === 'block');
  const warned = findings.some((f) => f.disposition === 'warn');
  return {
    kind: 'kiln.asset-qa-report',
    schemaVersion: 2,
    qaProfile: 'asset.requirements.v1',
    policyHash: context.policyHash,
    adviceHash: context.adviceHash,
    acceptance: blocked ? 'blocked' : incomplete ? 'incomplete' : 'accepted',
    disposition: blocked ? 'block' : incomplete ? 'notEvaluated' : warned ? 'warn' : 'pass',
    dimensions,
    rules,
    unevaluatedRequirements,
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : record(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);
/** Current evaluator reports are internally consistent and, when provided, bound to the host context. */
export function validateRequirementsQaReport(
  input: unknown,
  context?: RequirementsContext,
): AssetRequirementsQaReportV2 {
  const fail = (): never => {
    throw new TypeError('Invalid neutral requirements QA report.');
  };
  if (
    !record(input) ||
    input.kind !== 'kiln.asset-qa-report' ||
    input.schemaVersion !== 2 ||
    input.qaProfile !== 'asset.requirements.v1' ||
    !/^sha256:[a-f0-9]{64}$/.test(String(input.policyHash)) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(input.adviceHash)) ||
    !['accepted', 'incomplete', 'blocked'].includes(String(input.acceptance)) ||
    !['pass', 'warn', 'block', 'notEvaluated'].includes(String(input.disposition)) ||
    !record(input.dimensions) ||
    !Array.isArray(input.rules) ||
    !Array.isArray(input.unevaluatedRequirements)
  )
    return fail();
  if (
    Object.keys(input).sort().join(',') !==
    [
      'kind',
      'schemaVersion',
      'qaProfile',
      'policyHash',
      'adviceHash',
      'acceptance',
      'disposition',
      'dimensions',
      'rules',
      'unevaluatedRequirements',
    ]
      .sort()
      .join(',')
  )
    return fail();
  if (
    Object.keys(input.dimensions).sort().join(',') !==
    [...REQUIREMENTS_QA_DIMENSIONS].sort().join(',')
  )
    return fail();
  const findings: RequirementsQaFinding[] = [];
  const metrics: RequirementsQaReportOptions['metrics'] = {};
  const evaluated: RequirementsQaDimension[] = [];
  for (const dimension of REQUIREMENTS_QA_DIMENSIONS) {
    const value = input.dimensions[dimension];
    if (
      !record(value) ||
      !['pass', 'warn', 'block', 'notEvaluated'].includes(String(value.status)) ||
      !Array.isArray(value.findings) ||
      value.findings.length > 1000 ||
      Object.keys(value).some((key) => !['status', 'findings', 'metrics'].includes(key))
    )
      return fail();
    if (value.status !== 'notEvaluated') evaluated.push(dimension);
    for (const finding of value.findings) {
      if (
        !record(finding) ||
        finding.dimension !== dimension ||
        !isQaFinding({
          ...finding,
          dimension: dimension === 'requirementReadiness' ? 'categoryReadiness' : dimension,
        })
      )
        return fail();
      findings.push(finding as unknown as RequirementsQaFinding);
    }
    if (value.metrics !== undefined) {
      if (
        !record(value.metrics) ||
        !Object.values(value.metrics).every(
          (metric) =>
            metric === null ||
            typeof metric === 'string' ||
            typeof metric === 'boolean' ||
            (typeof metric === 'number' && Number.isFinite(metric)),
        )
      )
        return fail();
      metrics[dimension] = value.metrics as Record<string, number | string | boolean | null>;
    }
  }
  const known = new Set(REQUIREMENTS_RULE_MAP.map((rule) => rule.id));
  const ids = new Set<string>();
  for (const rule of input.rules) {
    if (
      !record(rule) ||
      typeof rule.id !== 'string' ||
      !known.has(rule.id) ||
      ids.has(rule.id) ||
      !['off', 'observe', 'warn', 'enforce'].includes(String(rule.mode)) ||
      !['evaluated', 'notEvaluated', 'notRequested'].includes(String(rule.status))
    )
      return fail();
    ids.add(rule.id);
  }
  if (ids.size !== known.size) return fail();
  for (const unmet of input.unevaluatedRequirements)
    if (
      !record(unmet) ||
      typeof unmet.key !== 'string' ||
      !Array.isArray(unmet.fields) ||
      !unmet.fields.every((x) => typeof x === 'string') ||
      typeof unmet.reason !== 'string'
    )
      return fail();
  const result = input as unknown as AssetRequirementsQaReportV2;
  if (context) {
    const expected = createRequirementsQaReport(context, {
      findings,
      executedRules: result.rules
        .filter((rule) => rule.status === 'evaluated')
        .map((rule) => rule.id),
      modes: Object.fromEntries(result.rules.map((rule) => [rule.id, rule.mode])),
      evaluatedDimensions: evaluated,
      metrics,
    });
    if (canonical(expected) !== canonical(result)) return fail();
  } else {
    const blocked = findings.some((finding) => finding.disposition === 'block');
    if (
      (result.acceptance === 'blocked') !== blocked ||
      (result.disposition === 'block') !== blocked ||
      (result.unevaluatedRequirements.length > 0 && result.acceptance === 'accepted')
    )
      return fail();
  }
  return result;
}
