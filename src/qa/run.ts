import type { AssetIntentV1 } from '../contracts';
import type { InstanceabilityReport } from '../metrics';
import { MATERIAL_QA_RULE } from './material';
import { ARCHITECTURE_QA_RULES } from './architecture';
import { CHARACTER_QA_RULE } from './character';
import { CHARACTER_ADVISORY_QA_RULE } from './character-advisory';
import { VEHICLE_QA_RULES } from './vehicle';
import { VEGETATION_QA_RULES } from './vegetation';
import { PROP_QA_RULES } from './prop';
import { PART_CONNECTIVITY_QA_RULE } from './part-connectivity';
import {
  REFERENCE_COMPARISON_QA_RULE,
  referenceComparisonFindings,
  type ReferenceComparisonEvidenceV1,
} from './reference-comparison';
import { SELF_INTERSECTION_QA_RULE } from './self-intersection';
import { SWEEP_QA_RULE } from './sweep';
import { ENVIRONMENT_QA_RULES } from './environment';
import { W7_BREADTH_QA_RULES } from './breadth';
import { withDerivedW7BreadthEvidence } from './breadth-evidence';
import { QaRegistry, type QaRuleMode, type QaRulePolicy } from './registry';
import {
  createAssetQaReportV1,
  type AssetQaReportV1,
  type AssetQaReport,
  type QaContext,
  type QaFinding,
} from './types';
import { UNIVERSAL_QA_RULES } from './universal';
import type { KhronosGltfValidationReport } from './gltf';
import type { KhronosGltfIssue } from './gltf';
import type { MaterialBudgetWarningV1, MaterialMetricsV1 } from '../material-metrics';

export const DETERMINISTIC_QA_REGISTRY = new QaRegistry([
  ...UNIVERSAL_QA_RULES,
  MATERIAL_QA_RULE,
  ...ARCHITECTURE_QA_RULES,
  CHARACTER_QA_RULE,
  CHARACTER_ADVISORY_QA_RULE,
  ...VEHICLE_QA_RULES,
  ...VEGETATION_QA_RULES,
  ...PROP_QA_RULES,
  ...ENVIRONMENT_QA_RULES,
  ...W7_BREADTH_QA_RULES,
  SELF_INTERSECTION_QA_RULE,
  SWEEP_QA_RULE,
  PART_CONNECTIVITY_QA_RULE,
  REFERENCE_COMPARISON_QA_RULE,
]);

export function runDeterministicSceneQa(
  context: QaContext,
  policy: QaRulePolicy = {},
): AssetQaReportV1 {
  const result = DETERMINISTIC_QA_REGISTRY.run(withDerivedW7BreadthEvidence(context), policy);
  return createAssetQaReportV1(context.intent, {
    findings: result.findings,
    evaluatedDimensions: ['exportIntegrity', 'categoryReadiness'],
  });
}

export function gltfReportFindings(
  report: KhronosGltfValidationReport,
  profile: string,
): QaFinding[] {
  return report.issues.messages
    .filter((issue) => issue.severity === 0 || issue.severity === 1)
    .filter((issue) => !isExpectedKtx2ValidatorLimitation(report, issue))
    .map((issue) => ({
      code: `GLTF_${issue.code}`.replace(/[^A-Z0-9_]/g, '_'),
      disposition: issue.severity === 0 ? ('block' as const) : ('warn' as const),
      dimension: 'exportIntegrity' as const,
      profile,
      message: issue.message,
      ...(issue.pointer ? { affected: { nodePath: issue.pointer } } : {}),
    }));
}

/** gltf-validator 2.0.0-dev.3.10 does not understand the image/ktx2 MIME used by
 * KHR_texture_basisu. Ignore only its exact, pointer-bound false warnings when
 * the artifact explicitly requires that extension; every other warning remains. */
function isExpectedKtx2ValidatorLimitation(
  report: KhronosGltfValidationReport,
  issue: KhronosGltfIssue,
): boolean {
  const required = report.info?.['extensionsRequired'];
  if (!Array.isArray(required) || !required.includes('KHR_texture_basisu')) return false;
  if (issue.code === 'VALUE_NOT_IN_LIST') {
    return (
      /^\/images\/\d+\/mimeType$/.test(issue.pointer ?? '') &&
      issue.message === "Invalid value 'image/ktx2'. Valid values are ('image/jpeg', 'image/png')."
    );
  }
  return (
    issue.code === 'IMAGE_UNRECOGNIZED_FORMAT' &&
    /^\/images\/\d+$/.test(issue.pointer ?? '') &&
    issue.message === 'Image format not recognized.'
  );
}

export function appendFinalGltfQa(
  intent: AssetIntentV1,
  sceneReport: AssetQaReportV1,
  gltfReport: KhronosGltfValidationReport,
): AssetQaReportV1 {
  const findings = Object.values(sceneReport.dimensions).flatMap((dimension) => dimension.findings);
  const gltfFindings = gltfReportFindings(gltfReport, intent.qaProfile);
  findings.push(...gltfFindings);
  return createAssetQaReportV1(intent, {
    findings,
    evaluatedDimensions: ['exportIntegrity', 'categoryReadiness'],
    metrics: {
      exportIntegrity: {
        gltfErrors: gltfReport.issues.numErrors,
        gltfWarnings: gltfFindings.filter((finding) => finding.disposition === 'warn').length,
      },
    },
  });
}

/**
 * Attach the existing A–F instanceability result only to the runtime-cost
 * dimension. It is deliberately not promoted to a composite quality grade.
 */
export function appendRuntimeCostQa(
  intent: AssetIntentV1,
  report: AssetQaReportV1,
  instanceability?: InstanceabilityReport,
  metricsError?: string,
): AssetQaReportV1 {
  const findings = Object.values(report.dimensions).flatMap((dimension) => dimension.findings);
  if (metricsError) {
    findings.push({
      code: 'RUNTIME_COST_METRICS_FAILED',
      disposition: 'warn',
      dimension: 'runtimeCost',
      profile: intent.qaProfile,
      message: `Runtime-cost metrics could not be computed: ${metricsError}`,
    });
  }
  const evaluatedDimensions = Object.entries(report.dimensions)
    .filter(([, dimension]) => dimension.status !== 'notEvaluated')
    .map(([dimension]) => dimension as keyof AssetQaReportV1['dimensions']);
  evaluatedDimensions.push('runtimeCost');
  const metrics = Object.fromEntries(
    Object.entries(report.dimensions).flatMap(([dimension, result]) =>
      result.metrics ? [[dimension, result.metrics]] : [],
    ),
  ) as Partial<
    Record<keyof AssetQaReportV1['dimensions'], Record<string, number | string | boolean | null>>
  >;
  if (instanceability) {
    metrics.runtimeCost = {
      instanceabilityGrade: instanceability.grade,
      instanceabilitySummary: instanceability.summary,
      uniqueGeometries: instanceability.metrics.uniqueGeometries,
      uniqueMaterials: instanceability.metrics.uniqueMaterials,
      drawCalls: instanceability.metrics.drawCalls,
      textureCount: instanceability.metrics.textureCount,
      transparentMaterials: instanceability.metrics.transparentMaterials,
      triangles: instanceability.metrics.triangles,
      skinned: instanceability.metrics.skinned,
    };
  }

  return createAssetQaReportV1(intent, {
    findings,
    evaluatedDimensions,
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
  });
}

/** Attach portable material metrics and advisory budget findings to runtimeCost
 * without collapsing them into the independent instanceability grade. */
export function appendMaterialMetricsQa(
  intent: AssetIntentV1,
  report: AssetQaReportV1,
  materialMetrics: MaterialMetricsV1,
  budgetWarnings: readonly MaterialBudgetWarningV1[] = [],
): AssetQaReportV1 {
  const findings = Object.values(report.dimensions).flatMap((dimension) => dimension.findings);
  findings.push(
    ...budgetWarnings.map(
      (warning): QaFinding => ({
        code: warning.code,
        disposition: 'warn',
        dimension: 'runtimeCost',
        profile: `${warning.profile}.${warning.tier}`,
        message: `${warning.message} ${warning.advice}`,
        measurement: warning.measurement,
      }),
    ),
  );
  const evaluatedDimensions = Object.entries(report.dimensions)
    .filter(([, dimension]) => dimension.status !== 'notEvaluated')
    .map(([dimension]) => dimension as keyof AssetQaReportV1['dimensions']);
  if (!evaluatedDimensions.includes('runtimeCost')) evaluatedDimensions.push('runtimeCost');
  const metrics = Object.fromEntries(
    Object.entries(report.dimensions).flatMap(([dimension, result]) =>
      result.metrics ? [[dimension, result.metrics]] : [],
    ),
  ) as Partial<
    Record<keyof AssetQaReportV1['dimensions'], Record<string, number | string | boolean | null>>
  >;
  metrics.runtimeCost = {
    ...(metrics.runtimeCost ?? {}),
    materialCount: materialMetrics.materialCount,
    opaqueMaterials: materialMetrics.opaqueMaterials,
    maskedMaterials: materialMetrics.maskedMaterials,
    blendedMaterials: materialMetrics.blendedMaterials,
    singleSidedMaterials: materialMetrics.singleSidedMaterials,
    doubleSidedMaterials: materialMetrics.doubleSidedMaterials,
    texturedMaterials: materialMetrics.texturedMaterials,
    materialExtensionCount: materialMetrics.materialExtensionCount,
    materialExtensionsUsed: materialMetrics.materialExtensionsUsed.join(','),
    imageCount: materialMetrics.imageCount,
    maxImageDimension: materialMetrics.maxImageDimension,
    decodedImageBytesRgba8: materialMetrics.decodedImageBytesRgba8,
    estimatedGpuBytesWithMipmaps: materialMetrics.estimatedGpuBytesWithMipmaps,
    blendedSurfaceAreaRatio: materialMetrics.blendedSurfaceAreaRatio,
  };
  return createAssetQaReportV1(intent, { findings, evaluatedDimensions, metrics });
}

/**
 * Attach reference-image agreement to promptAlignment.
 *
 * A separate appender rather than evidence on the pre-export context, because
 * the rendered views this compares against do not exist until after the GLB is
 * written — the scene QA pass runs strictly earlier. The findings come from
 * {@link referenceComparisonFindings}, the same code the registered rule uses,
 * so the two paths cannot drift into different opinions about disagreement.
 *
 * Observe-only, so this can never turn a passing asset into a blocked one; the
 * dimension status it produces is at worst unchanged.
 */
export function appendReferenceComparisonQa(
  intent: AssetIntentV1,
  report: AssetQaReportV1,
  evidence: ReferenceComparisonEvidenceV1,
): AssetQaReportV1 {
  const findings = Object.values(report.dimensions).flatMap((dimension) => dimension.findings);
  findings.push(...referenceComparisonFindings(evidence, 'reference.comparison'));
  const evaluatedDimensions = Object.entries(report.dimensions)
    .filter(([, dimension]) => dimension.status !== 'notEvaluated')
    .map(([dimension]) => dimension as keyof AssetQaReportV1['dimensions']);
  if (!evaluatedDimensions.includes('promptAlignment')) evaluatedDimensions.push('promptAlignment');
  const metrics = Object.fromEntries(
    Object.entries(report.dimensions).flatMap(([dimension, result]) =>
      result.metrics ? [[dimension, result.metrics]] : [],
    ),
  ) as Partial<
    Record<keyof AssetQaReportV1['dimensions'], Record<string, number | string | boolean | null>>
  >;
  metrics.promptAlignment = {
    ...(metrics.promptAlignment ?? {}),
    referenceSilhouetteIoU: evidence.silhouetteIoU,
    referenceColorAgreement: evidence.colorAgreement,
    referenceCoverageRatio: evidence.coverageRatio,
    // Surfaced because a reference with no rejected shadow pixels is either a
    // cutout or flat-lit, and the coverage numbers mean something different then.
    referenceShadowPixels: evidence.reference.shadowPixels,
  };
  return createAssetQaReportV1(intent, { findings, evaluatedDimensions, metrics });
}

/**
 * Ops kill switch (H-40): `KILN_QA_MODE=observe|off` overrides every rule's
 * default mode, feeding the registry's otherwise-unfed {@link QaRulePolicy}.
 * DOWNGRADE-ONLY by design: 'observe'/'off' are always authorized, while
 * 'warn'/'enforce' would throw mid-render on rules whose promotion evidence
 * doesn't authorize them — promotion stays a code change, not an env flip.
 * Unset or an unrecognized value = ship defaults (exact rules at enforce).
 */
export function qaPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): QaRulePolicy {
  const mode = env['KILN_QA_MODE'];
  return mode === 'observe' || mode === 'off' ? { defaultMode: mode as QaRuleMode } : {};
}

/**
 * Whether a `disposition: 'block'` QA report may abort a render. False under
 * `KILN_QA_MODE=observe|off` — the emergency downgrade for a misfiring rule in
 * prod: reports still record block dispositions (telemetry stays honest), but
 * the render completes with a warning instead of throwing.
 */
export function qaBlockingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const mode = env['KILN_QA_MODE'];
  return mode !== 'observe' && mode !== 'off';
}

/** Blockers spelled out in full per message; the rest collapse to a count. */
const MAX_DETAILED_BLOCKERS = 6;

export class AssetQaBlockedError extends Error {
  readonly report: AssetQaReport;
  readonly stage: 'scene' | 'final-glb';
  readonly gltfValidation?: KhronosGltfValidationReport;

  constructor(
    report: AssetQaReport,
    stage: 'scene' | 'final-glb',
    gltfValidation?: KhronosGltfValidationReport,
  ) {
    const blockers = Object.values(report.dimensions)
      .flatMap((dimension) => dimension.findings)
      .filter((finding) => finding.disposition === 'block');
    // H-40(3): this message IS what the agent reads when a mid-loop render is
    // QA-blocked (kiln_render catches and returns { ok:false, error: message }),
    // Include the measured target as quoted data as well as repair advice.
    // Some messages (for example missing UVs) contain no part identity of their own.
    const detailed = blockers
      .slice(0, MAX_DETAILED_BLOCKERS)
      .map(
        (finding) =>
          `${finding.code}: ${finding.message}${finding.affected ? ` AFFECTED: ${JSON.stringify(finding.affected)}` : ''}${finding.repairText ? ` FIX: ${finding.repairText}` : ''}`,
      );
    const overflow =
      blockers.length > MAX_DETAILED_BLOCKERS
        ? ` (+${blockers.length - MAX_DETAILED_BLOCKERS} more blockers)`
        : '';
    super(`Asset QA blocked at ${stage}: ${detailed.join(' | ') || 'unknown blocker'}${overflow}`);
    this.name = 'AssetQaBlockedError';
    this.report = report;
    this.stage = stage;
    this.gltfValidation = gltfValidation;
  }
}
