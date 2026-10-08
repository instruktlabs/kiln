import type { AssetRequirementKey, AssetRequirementsV1 } from '../contracts/requirements';
import type { QaRuleMode } from './registry';
type RequirementKey = AssetRequirementKey | 'scope';
interface RuleMapping {
  id: string;
  mode: QaRuleMode;
  keys: readonly RequirementKey[];
  kernel?:
    | 'universal'
    | 'material'
    | 'placement'
    | 'mechanism'
    | 'mobility'
    | 'structure'
    | 'spatial'
    | 'effects'
    | 'foliage'
    | 'scope'
    | 'connectivity'
    | 'partVolume'
    | 'sweep'
    | 'rig';
  observation?: true;
}
/** Exhaustive migration inventory. Labels and source categories are deliberately absent. */
export const REQUIREMENTS_RULE_MAP: readonly RuleMapping[] = [
  ...[
    'UNIVERSAL_SCENE_CONTENT_RULE',
    'UNIVERSAL_FINITE_DATA_RULE',
    'UNIVERSAL_MESH_TOPOLOGY_RULE',
    'UNIVERSAL_INDEX_RULE',
    'UNIVERSAL_ZERO_SCALE_RULE',
    'UNIVERSAL_NODE_NAME_RULE',
    'UNIVERSAL_ANIMATION_TARGET_RULE',
  ].map((id) => ({ id, mode: 'enforce' as const, keys: [], kernel: 'universal' as const })),
  {
    id: 'MATERIAL_PORTABLE_PBR_RULE',
    mode: 'enforce',
    keys: ['material', 'representation'],
    kernel: 'material',
  },
  { id: 'ARCHITECTURE_PROFILE', mode: 'enforce', keys: ['structure'], kernel: 'structure' },
  {
    id: 'ARCHITECTURE_ADVISORY_PROFILE',
    mode: 'observe',
    keys: ['structure'],
    kernel: 'structure',
  },
  { id: 'CHARACTER_PROFILE', mode: 'enforce', keys: ['rig'], kernel: 'rig' },
  { id: 'CHARACTER_ADVISORY_PROFILE', mode: 'observe', keys: ['rig'], kernel: 'rig' },
  { id: 'VEHICLE_PROFILE', mode: 'enforce', keys: ['mobility'], kernel: 'mobility' },
  { id: 'VEHICLE_ADVISORY_PROFILE', mode: 'observe', keys: ['mobility'], kernel: 'mobility' },
  { id: 'VEHICLE_W6_ADVISORY_PROFILE', mode: 'observe', keys: ['mobility'], kernel: 'mobility' },
  { id: 'VEGETATION_CONTACT_PROFILE', mode: 'enforce', keys: ['foliage'], kernel: 'foliage' },
  { id: 'VEGETATION_ADVISORY_PROFILE', mode: 'observe', keys: ['foliage'], kernel: 'foliage' },
  {
    id: 'PROP_CAPABILITY_EXACT_PROFILE',
    mode: 'enforce',
    keys: ['articulation', 'opening'],
    kernel: 'mechanism',
  },
  {
    id: 'PROP_ADVISORY_PROFILE',
    mode: 'observe',
    keys: ['grounding', 'bounds'],
    kernel: 'placement',
  },
  {
    id: 'ENVIRONMENT_EXACT_PROFILE',
    mode: 'enforce',
    keys: ['spatialLayout', 'navigation', 'tiling', 'modular'],
    kernel: 'spatial',
  },
  {
    id: 'ENVIRONMENT_ADVISORY_PROFILE',
    mode: 'observe',
    keys: ['spatialLayout', 'navigation', 'tiling'],
    kernel: 'spatial',
  },
  { id: 'VFX_EXACT_PROFILE', mode: 'enforce', keys: ['effects'], kernel: 'effects' },
  { id: 'VFX_ADVISORY_PROFILE', mode: 'observe', keys: ['effects'], kernel: 'effects' },
  { id: 'MODULAR_JOIN_PROFILE', mode: 'enforce', keys: ['modular'] },
  { id: 'ASSET_SCOPE_PROFILE', mode: 'observe', keys: ['scope'], kernel: 'scope' },
  {
    id: 'GEO_PART_SELF_INTERSECTION',
    mode: 'observe',
    keys: [],
    observation: true,
    kernel: 'partVolume',
  },
  {
    id: 'GEO_PART_CONNECTIVITY',
    mode: 'observe',
    keys: [],
    observation: true,
    kernel: 'connectivity',
  },
  { id: 'REF_COMPARISON', mode: 'observe', keys: [], observation: true },
  { id: 'SWEEP_SELF_INTERSECTION', mode: 'observe', keys: [], observation: true, kernel: 'sweep' },
];
export interface UnevaluatedRequirement {
  key: RequirementKey;
  fields: string[];
  reason: string;
}

/** Running a checker is not coverage when its required scene evidence is absent. */
export function sceneMeasurementGaps(
  requirements: AssetRequirementsV1,
  findings: readonly { code: string }[],
): UnevaluatedRequirement[] {
  const codes = new Set(findings.map((finding) => finding.code));
  const gaps: UnevaluatedRequirement[] = [];
  const needs = requirements.requirements;
  for (const [code, marker, field] of [
    ['ENV_NAV_CLEARANCE_UNASSESSED', 'navigation', 'navigable'],
    ['ENV_TILE_EDGE_EVIDENCE_SPARSE', 'tiling', 'tileable'],
  ] as const) {
    if (!codes.has(code)) continue;
    const reason = `${code}: required scene measurements could not be established.`;
    if (needs[marker]?.state === 'requested') gaps.push({ key: marker, fields: ['*'], reason });
    if (needs.spatialLayout?.state === 'requested' && needs.spatialLayout.value[field] === true)
      gaps.push({ key: 'spatialLayout', fields: [field], reason });
  }
  return gaps;
}
export interface RequirementsApplicability {
  rules: {
    id: string;
    mode: QaRuleMode;
    status: 'evaluate' | 'notRequested' | 'notEvaluated';
    keys: readonly RequirementKey[];
    reason?: string;
  }[];
  unevaluatedRequirements: UnevaluatedRequirement[];
}
export function resolveRequirementsApplicability(
  requirements: AssetRequirementsV1,
): RequirementsApplicability {
  const requested = (key: RequirementKey) =>
    (key === 'scope' ? requirements.scope : requirements.requirements[key])?.state === 'requested';
  const rules = REQUIREMENTS_RULE_MAP.map((rule) => ({
    id: rule.id,
    mode: rule.mode,
    keys: rule.keys,
    status:
      rule.kernel &&
      (rule.kernel === 'universal' ||
        rule.kernel === 'material' ||
        rule.observation ||
        rule.keys.some(requested))
        ? ('evaluate' as const)
        : rule.observation || rule.keys.some(requested)
          ? ('notEvaluated' as const)
          : ('notRequested' as const),
    ...(!rule.kernel && (rule.observation || rule.keys.some(requested))
      ? {
          reason:
            'Neutral measurement adapter remains to be qualified; no category fallback is used.',
        }
      : {}),
  }));
  const unevaluatedRequirements: UnevaluatedRequirement[] = [];
  const supportedFields: Partial<Record<AssetRequirementKey, readonly string[]>> = {
    rig: ['bodyPlan', 'grounded', 'clips', 'heldItem'],
    foliage: ['grounded', 'standalone', 'canopyProfile'],
    effects: [
      'schemaVersion',
      'subtype',
      'portability',
      'transparency',
      'doubleSided',
      'facing',
      'animation',
      'sidecar',
    ],
    spatialLayout: ['tileable', 'navigable'],
    structure: ['storeyCount', 'interiorMode', 'roofMode', 'enterable', 'portal', 'scaleMode'],
    mobility: [
      'wheelCount',
      'axleCount',
      'steering',
      'supportPolicy',
      'supportAssemblies',
      'frontFrame',
    ],
    grounding: ['planeY'],
    bounds: ['units', 'x', 'y', 'z'],
    animation: ['clips'],
    representation: ['precomputedTangents'],
  };
  for (const [key, statement] of Object.entries(requirements.requirements)) {
    if (statement?.state !== 'requested') continue;
    if (key === 'navigation' || key === 'tiling') continue;
    if (key === 'articulation' || key === 'opening') {
      unevaluatedRequirements.push({
        key,
        fields: ['*'],
        reason:
          key === 'articulation'
            ? 'Declared rigid pivots, subtrees and clearance prisms are checked. They do not establish the requested motion range, animated collisions or other articulation types; acceptance remains incomplete.'
            : 'Declared container opening markers are checked without an inferred minimum size. They do not establish usable access, interior occupancy, moving closures or other opening types; acceptance remains incomplete.',
      });
      continue;
    }
    const supported = [...(supportedFields[key as AssetRequirementKey] ?? [])];
    if (
      key === 'foliage' &&
      requirements.requirements.foliage?.state === 'requested' &&
      requirements.requirements.foliage.value.canopyProfile !== undefined
    )
      supported.push('growthState');
    if (key === 'mobility') {
      const mobility = requirements.requirements.mobility;
      if (mobility?.state === 'requested') {
        if (
          mobility.value.propulsionAssemblies?.every(
            (kind) => kind === 'rotor' || kind === 'propeller',
          )
        )
          supported.push('propulsionAssemblies');
        if (mobility.value.animationAssemblies?.length === 0) supported.push('animationAssemblies');
      }
    }
    const fields = Object.keys(statement.value).filter((field) => !supported.includes(field));
    if (supported.length === 0 || fields.length > 0)
      unevaluatedRequirements.push({
        key: key as AssetRequirementKey,
        fields: fields.length ? fields : ['*'],
        reason:
          'Requested measurement is not yet evaluated by the neutral checker; acceptance remains incomplete.',
      });
  }
  if (requirements.scope?.state === 'requested')
    unevaluatedRequirements.push({
      key: 'scope',
      fields: ['*'],
      reason:
        'Scope has advisory member/dressing measurements only; they do not certify semantic scope, modular reusability, or pack membership. Acceptance remains incomplete.',
    });
  return { rules, unevaluatedRequirements };
}
