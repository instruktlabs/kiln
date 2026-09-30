import type { RequirementsContext } from '../requirements-context';
import { Object3D } from 'three';
import { analyzeVfxArtifactEvidenceV1, analyzeAssetScopeObservationV1 } from './breadth-evidence';
import {
  inspectEffectsExact,
  inspectEffectsAdvisory,
  VFX_EXACT_QA_RULE,
  VFX_ADVISORY_QA_RULE,
  inspectAssetScope,
  ASSET_SCOPE_QA_RULE,
} from './breadth';
import {
  analyzeFinalVfxGlbBytesV1,
  inspectFinalEffects,
  finalEffectsMetrics,
} from './breadth-final';
import { QaRegistry, type QaRulePolicy } from './registry';
import { UNIVERSAL_QA_KERNELS, UNIVERSAL_QA_RULES } from './universal';
import { MATERIAL_QA_RULE, inspectPortableSceneMaterials } from './material';
import {
  inspectPlacement,
  inspectArticulation,
  inspectContainerOpening,
  PROP_EXACT_QA_RULE,
  PROP_ADVISORY_QA_RULE,
} from './prop';
import { inspectPartConnectivity, PART_CONNECTIVITY_QA_RULE } from './part-connectivity';
import {
  analyzePartPenetration,
  inspectPartPenetration,
  SELF_INTERSECTION_QA_RULE,
  type PartPenetrationEvidenceV1,
} from './self-intersection';
import { inspectMobility, VEHICLE_QA_RULES } from './vehicle';
import { inspectMobilityAdvisory } from './vehicle-advisory';
import { inspectFoliageContact, inspectFoliageAdvisory, VEGETATION_QA_RULES } from './vegetation';
import { inspectRig, CHARACTER_QA_RULE } from './character';
import { inspectRigAdvisory, CHARACTER_ADVISORY_QA_RULE } from './character-advisory';
import { inspectStructure, ARCHITECTURE_QA_RULES } from './architecture';
import {
  inspectPlacementSockets,
  inspectTileEdges,
  inspectNavigationClearance,
  inspectSpatialSupport,
  ENVIRONMENT_QA_RULES,
} from './environment';
import { resolveRequirementsApplicability } from './requirements-applicability';
import {
  createRequirementsQaReport,
  type AssetRequirementsQaReportV2,
  type RequirementsQaReportOptions,
  type RequirementsQaFinding,
} from './requirements-report';
import type { QaFinding } from './types';
import { gltfReportFindings } from './run';
import type { KhronosGltfValidationReport } from './gltf';
import type { InstanceabilityReport } from '../metrics';
import type { MaterialMetricsV1, MaterialBudgetWarningV1 } from '../material-metrics';

const registry = new QaRegistry([
  ...UNIVERSAL_QA_RULES,
  MATERIAL_QA_RULE,
  PROP_EXACT_QA_RULE,
  PROP_ADVISORY_QA_RULE,
  PART_CONNECTIVITY_QA_RULE,
  SELF_INTERSECTION_QA_RULE,
  ...VEHICLE_QA_RULES,
  ...ARCHITECTURE_QA_RULES,
  ...ENVIRONMENT_QA_RULES,
  ...VEGETATION_QA_RULES,
  CHARACTER_QA_RULE,
  CHARACTER_ADVISORY_QA_RULE,
  VFX_EXACT_QA_RULE,
  VFX_ADVISORY_QA_RULE,
  ASSET_SCOPE_QA_RULE,
]);

interface RequirementsSceneEvidence {
  partPenetration?: PartPenetrationEvidenceV1;
  partPenetrationFailed?: true;
}

function sceneDecisions(context: RequirementsContext, policy: QaRulePolicy) {
  const applicable = new Set(
    resolveRequirementsApplicability(context.requirements)
      .rules.filter((rule) => rule.status === 'evaluate')
      .map((rule) => rule.id),
  );
  return new QaRegistry(registry.list().filter((rule) => applicable.has(rule.id))).describePolicy(
    policy,
  );
}

/** Async engine measurements; no authored declarations, images or category policy are read. */
export async function collectRequirementsSceneEvidence(
  context: RequirementsContext,
  scene: unknown,
  policy: QaRulePolicy = {},
): Promise<RequirementsSceneEvidence> {
  if (
    !(scene instanceof Object3D) ||
    !sceneDecisions(context, policy).some(
      (d) => d.ruleId === SELF_INTERSECTION_QA_RULE.id && d.mode !== 'off',
    )
  )
    return {};
  try {
    return { partPenetration: await analyzePartPenetration(scene) };
  } catch {
    // An optional observation can be unavailable; it cannot become a clean measurement.
    return { partPenetrationFailed: true };
  }
}

export function runRequirementsSceneQa(
  context: RequirementsContext,
  scene: unknown,
  clips: readonly unknown[],
  policy: QaRulePolicy = {},
  evidence: RequirementsSceneEvidence = {},
): AssetRequirementsQaReportV2 {
  const needs = context.requirements.requirements;
  const parts = needs.parts?.state === 'requested' ? needs.parts.value.required : [];
  const animation = needs.animation?.state === 'requested' ? needs.animation.value : undefined;
  const rig = needs.rig?.state === 'requested' ? needs.rig.value : undefined;
  const requiredClips = [
    ...new Set([...(animation?.clips ?? []), ...(rig?.clips?.map((clip) => clip.name) ?? [])]),
  ];
  const tangents =
    needs.representation?.state === 'requested' &&
    needs.representation.value.precomputedTangents === true;
  const findings: QaFinding[] = [];
  const decisions = sceneDecisions(context, policy);
  const geometryMetrics: Record<string, number | string | boolean | null> = {};
  const mobilityInput = {
    scene,
    mobility: needs.mobility?.state === 'requested' ? needs.mobility.value : undefined,
    groundPlaneY: needs.grounding?.state === 'requested' ? needs.grounding.value.planeY : undefined,
  };
  // One measurement pass feeds the exact and advisory modes without re-deriving policy.
  const mobilityFindings =
    mobilityInput.mobility &&
    decisions.some(
      (d) =>
        (d.ruleId === 'VEHICLE_PROFILE' || d.ruleId === 'VEHICLE_ADVISORY_PROFILE') &&
        d.mode !== 'off',
    )
      ? inspectMobility(mobilityInput)
      : [];
  const executedRules: string[] = [];
  const rigInput = {
    scene,
    clips,
    rig,
    groundPlaneY: needs.grounding?.state === 'requested' ? needs.grounding.value.planeY : undefined,
  };
  const foliageInput = {
    scene,
    foliage: needs.foliage?.state === 'requested' ? needs.foliage.value : undefined,
    materialMode: needs.material?.state === 'requested' ? needs.material.value.mode : undefined,
    groundPlaneY: needs.grounding?.state === 'requested' ? needs.grounding.value.planeY : undefined,
  };
  const effects = needs.effects?.state === 'requested' ? needs.effects.value : undefined;
  const scope = context.requirements.scope;
  const scopeObservation =
    scope?.state === 'requested' &&
    scene instanceof Object3D &&
    decisions.some((d) => d.ruleId === ASSET_SCOPE_QA_RULE.id && d.mode !== 'off')
      ? analyzeAssetScopeObservationV1(scene)
      : undefined;
  const effectsInput = {
    effects,
    derivedEvidence: {
      source: 'engine-scene-analysis' as const,
      ...(effects &&
      scene instanceof Object3D &&
      decisions.some((d) => d.ruleId.startsWith('VFX_') && d.mode !== 'off')
        ? { vfxArtifact: analyzeVfxArtifactEvidenceV1(effects, scene, clips) }
        : {}),
    },
  };
  const spatialInput = {
    scene,
    tileable:
      needs.tiling?.state === 'requested' ||
      (needs.spatialLayout?.state === 'requested' && needs.spatialLayout.value.tileable === true),
    navigable:
      needs.navigation?.state === 'requested' ||
      (needs.spatialLayout?.state === 'requested' && needs.spatialLayout.value.navigable === true),
    navigation: needs.navigation?.state === 'requested' ? needs.navigation.value : undefined,
    groundPlaneY:
      needs.grounding?.state === 'requested' ? (needs.grounding.value.planeY ?? 0) : undefined,
  };
  const spatialFindings = decisions.some(
    (d) => d.ruleId.startsWith('ENVIRONMENT_') && d.mode !== 'off',
  )
    ? [
        ...inspectPlacementSockets(spatialInput),
        ...inspectTileEdges(spatialInput),
        ...inspectNavigationClearance(spatialInput),
        ...inspectSpatialSupport(spatialInput),
      ]
    : [];
  const structureFindings =
    needs.structure?.state === 'requested' &&
    decisions.some((d) => d.ruleId.startsWith('ARCHITECTURE_') && d.mode !== 'off')
      ? inspectStructure({
          scene,
          structure: needs.structure.value,
          opening: needs.opening?.state === 'requested',
        })
      : [];
  for (const decision of decisions) {
    if (decision.mode === 'off') continue;
    if (decision.ruleId === SELF_INTERSECTION_QA_RULE.id) {
      const volume = evidence.partPenetration;
      if (volume) {
        const acknowledged = volume.acknowledged?.length ?? 0;
        // An acknowledged open shell leaves its pairs unmeasured as surely as a skipped part.
        const partial = volume.truncated || volume.skipped.length > 0 || acknowledged > 0;
        if (!partial) executedRules.push(decision.ruleId);
        findings.push(...inspectPartPenetration(volume));
        Object.assign(geometryMetrics, {
          partVolumeCoverage: partial ? 'partial' : 'complete-static-pairs',
          partVolumeScope:
            'Visible static closed mesh pairs, except alternates on different LOD levels; excludes intra-mesh intersections, motion, open surfaces and usable passage space. Positive overlap may be intentional.',
          partVolumeEligibleParts: volume.partsAnalyzed,
          partVolumeCandidatePairs: volume.candidatePairs,
          partVolumeCandidatesLowerBound: volume.broadPhaseTruncated === true,
          partVolumePairsTested: volume.pairsTested,
          partVolumeUnmeasurablePairs: volume.pairsUnmeasurable,
          partVolumePairsNotReached: volume.pairsNotReached,
          partVolumeLodAlternatePairs: volume.pairsLodAlternates,
          partVolumeSkipped: volume.skipped.length,
          ...(acknowledged > 0
            ? {
                partVolumeAcknowledgedParts: acknowledged,
                partVolumeAcknowledgedPairs: volume.pairsUnmeasurableAcknowledged ?? 0,
              }
            : {}),
        });
      } else if (evidence.partPenetrationFailed) {
        findings.push({
          code: 'GEO_PART_SELF_INTERSECTION_UNMEASURED',
          disposition: 'observe',
          dimension: 'visualQuality',
          profile: 'geometry.selfIntersection',
          message:
            'Part-volume analysis could not complete. Overlap and clearance remain unmeasured.',
        });
        geometryMetrics.partVolumeCoverage = 'unavailable';
      }
      continue;
    }
    if (decision.ruleId === ASSET_SCOPE_QA_RULE.id && !scopeObservation) continue;
    if (decision.ruleId === PART_CONNECTIVITY_QA_RULE.id && !(scene instanceof Object3D)) continue;
    executedRules.push(decision.ruleId);
    if (decision.ruleId === PROP_EXACT_QA_RULE.id) {
      const measured = [
        ...(needs.articulation?.state === 'requested' ? inspectArticulation({ scene }) : []),
        ...(needs.opening?.state === 'requested' ? inspectContainerOpening({ scene }) : []),
      ];
      for (const finding of measured)
        findings.push(
          decision.mode === 'observe' || decision.mode === 'warn'
            ? { ...finding, disposition: decision.mode }
            : finding,
        );
      continue;
    }
    const measured =
      decision.ruleId === PART_CONNECTIVITY_QA_RULE.id
        ? inspectPartConnectivity(scene)
        : decision.ruleId === ASSET_SCOPE_QA_RULE.id && scope?.state === 'requested'
          ? inspectAssetScope({
              profile: 'asset.requirements.v1',
              scope: { schemaVersion: 1, scope: scope.value, explicit: true },
              derivedEvidence: { source: 'engine-scene-analysis', assetScope: scopeObservation },
            })
          : decision.ruleId === 'CHARACTER_PROFILE'
            ? inspectRig(rigInput)
            : decision.ruleId === 'CHARACTER_ADVISORY_PROFILE'
              ? inspectRigAdvisory(rigInput)
              : decision.ruleId === 'VEGETATION_CONTACT_PROFILE'
                ? inspectFoliageContact(foliageInput)
                : decision.ruleId === 'VEGETATION_ADVISORY_PROFILE'
                  ? inspectFoliageAdvisory(foliageInput)
                  : decision.ruleId === MATERIAL_QA_RULE.id
                    ? inspectPortableSceneMaterials(scene, tangents)
                    : decision.ruleId === 'VFX_EXACT_PROFILE'
                      ? inspectEffectsExact(effectsInput)
                      : decision.ruleId === 'VFX_ADVISORY_PROFILE'
                        ? inspectEffectsAdvisory(effectsInput)
                        : decision.ruleId === 'ARCHITECTURE_PROFILE'
                          ? structureFindings.filter((f) => f.disposition === 'block')
                          : decision.ruleId === 'ARCHITECTURE_ADVISORY_PROFILE'
                            ? structureFindings.filter((f) => f.disposition !== 'block')
                            : decision.ruleId === 'ENVIRONMENT_EXACT_PROFILE'
                              ? spatialFindings.filter((f) => f.disposition === 'block')
                              : decision.ruleId === 'ENVIRONMENT_ADVISORY_PROFILE'
                                ? spatialFindings.filter((f) => f.disposition !== 'block')
                                : decision.ruleId === 'VEHICLE_PROFILE'
                                  ? mobilityFindings.filter((f) => f.disposition === 'block')
                                  : decision.ruleId === 'VEHICLE_ADVISORY_PROFILE'
                                    ? mobilityFindings.filter((f) => f.disposition !== 'block')
                                    : decision.ruleId === 'VEHICLE_W6_ADVISORY_PROFILE'
                                      ? inspectMobilityAdvisory(mobilityInput)
                                      : decision.ruleId === PROP_ADVISORY_QA_RULE.id
                                        ? inspectPlacement({
                                            scene,
                                            bounds:
                                              needs.bounds?.state === 'requested'
                                                ? needs.bounds.value
                                                : undefined,
                                            groundPlaneY:
                                              needs.grounding?.state === 'requested'
                                                ? (needs.grounding.value.planeY ?? 0)
                                                : undefined,
                                          })
                                        : UNIVERSAL_QA_KERNELS[decision.ruleId]!({
                                            scene,
                                            clips,
                                            requiredParts: parts,
                                            animation: { clips: requiredClips },
                                          });
    for (const finding of measured)
      findings.push(
        decision.mode === 'observe' || decision.mode === 'warn'
          ? { ...finding, disposition: decision.mode }
          : finding,
      );
  }
  return createRequirementsQaReport(context, {
    findings,
    executedRules,
    modes: Object.fromEntries(decisions.map((x) => [x.ruleId, x.mode])),
    metrics: {
      ...(Object.keys(geometryMetrics).length ? { visualQuality: geometryMetrics } : {}),
      ...(scopeObservation
        ? {
            promptAlignment: {
              scopeTopLevelAssetRoots: scopeObservation.topLevelAssetRoots,
              scopeReusableMemberCount: scopeObservation.reusableMemberCount,
              scopeDressingSignalCount: scopeObservation.sceneDressingRoles.length,
            },
          }
        : {}),
    },
    ...(scopeObservation
      ? {
          evaluatedDimensions: ['exportIntegrity', 'requirementReadiness', 'promptAlignment'],
        }
      : {}),
  });
}

/** Rebuild the same report without losing applicability, modes or unmet obligations. */
export function appendRequirementsQa(
  context: RequirementsContext,
  report: AssetRequirementsQaReportV2,
  findings: readonly (QaFinding | RequirementsQaFinding)[],
  metrics: RequirementsQaReportOptions['metrics'] = {},
): AssetRequirementsQaReportV2 {
  const priorMetrics = Object.fromEntries(
    Object.entries(report.dimensions).flatMap(([dimension, value]) =>
      value.metrics ? [[dimension, value.metrics]] : [],
    ),
  );
  const merged = { ...priorMetrics };
  for (const [dimension, value] of Object.entries(metrics ?? {}))
    merged[dimension] = { ...priorMetrics[dimension], ...value };
  return createRequirementsQaReport(context, {
    findings: [...Object.values(report.dimensions).flatMap((x) => x.findings), ...findings],
    executedRules: report.rules.filter((x) => x.status === 'evaluated').map((x) => x.id),
    modes: Object.fromEntries(report.rules.map((x) => [x.id, x.mode])),
    evaluatedDimensions: [
      ...new Set([
        ...Object.entries(report.dimensions)
          .filter(([, value]) => value.status !== 'notEvaluated')
          .map(([key]) => key),
        ...Object.keys(metrics ?? {}),
      ]),
    ] as RequirementsQaReportOptions['evaluatedDimensions'],
    metrics: merged,
  });
}
/** Final-byte and runtime measurements remain separate from acceptance obligations. */
export async function appendRequirementsFinalQa(
  context: RequirementsContext,
  report: AssetRequirementsQaReportV2,
  gltf: KhronosGltfValidationReport,
  bytes: Uint8Array,
  instanceability?: InstanceabilityReport,
  metricsError?: string,
  material?: MaterialMetricsV1,
  warnings: readonly MaterialBudgetWarningV1[] = [],
): Promise<AssetRequirementsQaReportV2> {
  const gltfFindings = gltfReportFindings(gltf, report.qaProfile);
  const findings: QaFinding[] = [
    ...gltfFindings,
    ...warnings.map((w) => ({
      code: w.code,
      disposition: 'warn' as const,
      dimension: 'runtimeCost' as const,
      profile: `${w.profile}.${w.tier}`,
      message: `${w.message} ${w.advice}`,
      measurement: w.measurement,
    })),
  ];
  if (metricsError)
    findings.push({
      code: 'RUNTIME_COST_METRICS_FAILED',
      disposition: 'warn',
      dimension: 'runtimeCost',
      profile: report.qaProfile,
      message: `Runtime-cost metrics could not be computed: ${metricsError}`,
    });
  const cost: Record<string, number | string | boolean | null> = {};
  if (instanceability)
    Object.assign(cost, {
      instanceabilityGrade: instanceability.grade,
      instanceabilitySummary: instanceability.summary,
      ...instanceability.metrics,
    });
  if (material)
    Object.assign(cost, {
      materialCount: material.materialCount,
      opaqueMaterials: material.opaqueMaterials,
      maskedMaterials: material.maskedMaterials,
      blendedMaterials: material.blendedMaterials,
      singleSidedMaterials: material.singleSidedMaterials,
      doubleSidedMaterials: material.doubleSidedMaterials,
      texturedMaterials: material.texturedMaterials,
      materialExtensionCount: material.materialExtensionCount,
      materialExtensionsUsed: material.materialExtensionsUsed.join(','),
      imageCount: material.imageCount,
      maxImageDimension: material.maxImageDimension,
      decodedImageBytesRgba8: material.decodedImageBytesRgba8,
      estimatedGpuBytesWithMipmaps: material.estimatedGpuBytesWithMipmaps,
      blendedSurfaceAreaRatio: material.blendedSurfaceAreaRatio,
    });
  let result = appendRequirementsQa(context, report, findings, {
    exportIntegrity: {
      gltfErrors: gltf.issues.numErrors,
      gltfWarnings: gltfFindings.filter((x) => x.disposition === 'warn').length,
    },
    runtimeCost: cost,
  });
  const effects = context.requirements.requirements.effects;
  const rule = report.rules.find((r) => r.id === 'VFX_EXACT_PROFILE');
  if (effects?.state === 'requested' && rule?.status === 'evaluated' && rule.mode !== 'off') {
    const evidence = await analyzeFinalVfxGlbBytesV1(bytes);
    const measured = inspectFinalEffects(effects.value, evidence);
    const findings =
      rule.mode === 'enforce'
        ? measured
        : measured.map((f) => ({
            ...f,
            disposition: rule.mode as 'observe' | 'warn',
          }));
    result = appendRequirementsQa(context, result, findings, {
      exportIntegrity: finalEffectsMetrics(evidence),
    });
  }
  return result;
}
