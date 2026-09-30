import type { AssetCategory, AssetIntentV1 } from '../contracts';

export const QA_DIMENSIONS = [
  'exportIntegrity',
  'categoryReadiness',
  'promptAlignment',
  'visualQuality',
  'runtimeCost',
] as const;

export type QaDimension = (typeof QA_DIMENSIONS)[number];
export type QaDimensionStatus = 'pass' | 'warn' | 'block' | 'notEvaluated';
export type QaFindingDisposition = 'observe' | 'warn' | 'block';
export type AssetQaDisposition = 'pass' | 'warn' | 'block' | 'notEvaluated' | 'legacy-unassessed';

export interface QaAffectedEntity {
  node?: string;
  nodePath?: string;
  material?: string;
  texture?: string;
  attribute?: string;
  clip?: string;
  track?: string;
}

export interface QaMeasurement {
  name: string;
  actual: number | string | boolean | null;
  expected?: number | string | boolean | null;
  threshold?: number;
  unit?: string;
  /** Named counts that explain `actual`, such as why some candidates were not measured. */
  breakdown?: Record<string, number>;
}

/** Stable, machine-readable finding returned by every new QA rule. */
export interface QaFinding {
  code: string;
  disposition: QaFindingDisposition;
  dimension: QaDimension;
  profile: string;
  message: string;
  affected?: QaAffectedEntity;
  measurement?: QaMeasurement;
  viewHints?: string[];
  repairText?: string;
}

export interface QaDimensionResult {
  status: QaDimensionStatus;
  findings: QaFinding[];
  /** Optional dimension-specific metrics. Never interpreted as an overall grade. */
  metrics?: Record<string, number | string | boolean | null>;
}

export interface AssetQaReportV1 {
  schemaVersion: 1;
  category: AssetCategory;
  qaProfile: string;
  disposition: AssetQaDisposition;
  dimensions: Record<QaDimension, QaDimensionResult>;
}

/**
 * Honest compatibility state for historical rows that predate trusted intent
 * and final-byte QA. It is neither a pass nor a failure and must never be used
 * to block ordinary view/download/reuse.
 */
export function createLegacyUnassessedQaReportV1(
  category: AssetCategory,
  qaProfile = `${category}.legacy`,
): AssetQaReportV1 {
  const dimensions = {} as Record<QaDimension, QaDimensionResult>;
  for (const dimension of QA_DIMENSIONS) {
    dimensions[dimension] = { status: 'notEvaluated', findings: [] };
  }
  return {
    schemaVersion: 1,
    category,
    qaProfile,
    disposition: 'legacy-unassessed',
    dimensions,
  };
}

export interface QaContext {
  intent: AssetIntentV1;
  /** Deliberately unknown here; concrete rules own their scene/runtime dependency. */
  scene?: unknown;
  clips?: readonly unknown[];
  source?: string;
  glbBytes?: Uint8Array;
  /** Engine-derived measurements. Callers cannot substitute model-authored metadata for this seam. */
  derivedEvidence?: {
    source: 'engine-scene-analysis';
    vfxArtifact?: unknown;
    assetScope?: unknown;
    modularKit?: unknown;
    modularJoin?: unknown;
    /** T4.1 part-vs-part boolean intersection volumes; computed async before QA runs. */
    partPenetration?: unknown;
    /** T4.3 reference-image agreement; computed by whichever tier holds both the
     *  decoded reference and a rendered view. Absent on every generation that had
     *  no reference image, which is most of them. */
    referenceComparison?: unknown;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isQaFinding(value: unknown): value is QaFinding {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    /^[A-Z][A-Z0-9_]*$/.test(value.code) &&
    (value.disposition === 'observe' ||
      value.disposition === 'warn' ||
      value.disposition === 'block') &&
    (QA_DIMENSIONS as readonly unknown[]).includes(value.dimension) &&
    typeof value.profile === 'string' &&
    value.profile.length > 0 &&
    typeof value.message === 'string' &&
    value.message.length > 0
  );
}

const statusForFindings = (
  findings: readonly QaFinding[],
): Exclude<QaDimensionStatus, 'notEvaluated'> => {
  if (findings.some((finding) => finding.disposition === 'block')) return 'block';
  if (findings.some((finding) => finding.disposition === 'warn')) return 'warn';
  return 'pass';
};

export interface CreateAssetQaReportOptions {
  findings?: readonly QaFinding[];
  evaluatedDimensions?: readonly QaDimension[];
  metrics?: Partial<Record<QaDimension, Record<string, number | string | boolean | null>>>;
}

/**
 * Build the five independent result dimensions. Unrun VLM or cost passes remain
 * explicitly `notEvaluated`; no synthetic score or composite letter is invented.
 */
export function createAssetQaReportV1(
  intent: AssetIntentV1,
  options: CreateAssetQaReportOptions = {},
): AssetQaReportV1 {
  const findings = [...(options.findings ?? [])];
  const evaluated = new Set(options.evaluatedDimensions ?? []);
  for (const finding of findings) evaluated.add(finding.dimension);

  const dimensions = Object.fromEntries(
    QA_DIMENSIONS.map((dimension) => {
      const dimensionFindings = findings.filter((finding) => finding.dimension === dimension);
      const result: QaDimensionResult = {
        status: evaluated.has(dimension) ? statusForFindings(dimensionFindings) : 'notEvaluated',
        findings: dimensionFindings,
        ...(options.metrics?.[dimension] ? { metrics: options.metrics[dimension] } : {}),
      };
      return [dimension, result];
    }),
  ) as unknown as Record<QaDimension, QaDimensionResult>;

  const statuses = QA_DIMENSIONS.map((dimension) => dimensions[dimension].status);
  const disposition: AssetQaDisposition = statuses.includes('block')
    ? 'block'
    : statuses.includes('warn')
      ? 'warn'
      : statuses.every((status) => status === 'notEvaluated')
        ? 'notEvaluated'
        : 'pass';

  return {
    schemaVersion: 1,
    category: intent.category,
    qaProfile: intent.qaProfile,
    disposition,
    dimensions,
  };
}

/** Historical V1 reports remain readable; current render execution emits V2. */
export type AssetQaReport =
  | AssetQaReportV1
  | import('./requirements-report').AssetRequirementsQaReportV2;
