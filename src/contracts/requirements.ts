/** Browser-safe, category-free authoring data. Host authority is deliberately external. */
import { z } from 'zod';
import {
  ARCHITECTURE_INTERIOR_MODES,
  ARCHITECTURE_ROOF_MODES,
  ARCHITECTURE_SCALE_MODES,
  CHARACTER_BODY_PLANS,
  CHARACTER_LOCOMOTION_MODES,
  KILN_ASSET_FRAME,
  MATERIAL_INTENT_MODES,
  MATERIAL_TRANSPARENCY_MODES,
  VEGETATION_CANOPY_PROFILES,
  VEGETATION_GROWTH_STATES,
  VEHICLE_STEERING_ARRANGEMENTS,
  VEHICLE_SUPPORT_POLICIES,
  type ContractValidationResult,
} from './asset';
import {
  ASSET_SCOPES,
  VFX_AXIS_DIRECTIONS,
  VFX_ENDPOINT_BEHAVIORS,
  VFX_FACING_MODES,
  VFX_PLAYBACK_POLICIES,
  VFX_PORTABILITY_MODES,
  VFX_RUNTIME_DRIVERS,
  VFX_SUBTYPES,
  validateVfxIntentV1,
} from './breadth';
import { ValidationProfileV1Schema } from './validation-profile';

const text = z
  .string()
  .refine((value) => value.trim().length > 0, { message: 'Must be non-empty.' });
const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const names = z.array(text).refine((values) => new Set(values).size === values.length, {
  message: 'Values must be unique.',
});
const marker = z.strictObject({});
const supportParts = z
  .array(text)
  .min(1)
  .max(256)
  .refine((values) => new Set(values).size === values.length, {
    message: 'Values must be unique.',
  });

/** An absent statement is unspecified. Inference is advice, never an enforced demand. */
export type RequirementStatement<T> =
  | { state: 'requested' | 'inferred'; value: T; reason?: string }
  | { state: 'unknown' | 'inapplicable'; reason?: string };

export function requestedRequirement<T>(
  value: T,
  reason?: string,
): {
  state: 'requested';
  value: T;
  reason?: string;
} {
  return { state: 'requested', value, ...(reason === undefined ? {} : { reason }) };
}

function statement<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('requested'), value, reason: text.optional() }),
    z.strictObject({ state: z.literal('inferred'), value, reason: text.optional() }),
    z.strictObject({ state: z.literal('unknown'), reason: text.optional() }),
    z.strictObject({ state: z.literal('inapplicable'), reason: text.optional() }),
  ]);
}

const roof = z.strictObject({
  // Shape names describe the request. An unfamiliar shape is not a schema error.
  type: text.optional(),
  ridgeAxis: z.enum(['x', 'z']).optional(),
  rise: nonnegative.optional(),
  pitchDegrees: z.number().min(0).max(90).optional(),
  overhang: nonnegative.optional(),
  closedEnds: z.boolean().optional(),
});

const structure = z
  .strictObject({
    subtype: text.optional(),
    enterable: z.boolean().optional(),
    storeyCount: count.min(1).optional(),
    interiorMode: z.enum(ARCHITECTURE_INTERIOR_MODES).optional(),
    roofMode: z.enum(ARCHITECTURE_ROOF_MODES).optional(),
    footprint: z
      .strictObject({ spanX: positive, spanZ: positive, units: z.literal('m') })
      .optional(),
    wallHeight: positive.optional(),
    scaleMode: z.enum(ARCHITECTURE_SCALE_MODES).optional(),
    roof: roof.optional(),
    portal: z.strictObject({ width: positive, height: positive, depth: positive }).optional(),
  })
  .refine(
    (value) =>
      value.enterable === undefined ||
      value.interiorMode === undefined ||
      value.enterable === (value.interiorMode === 'navigable'),
    {
      message: 'enterable and interiorMode must agree when both are specified.',
    },
  );

const effects = z
  .strictObject({
    schemaVersion: z.literal(1),
    subtype: z.enum(VFX_SUBTYPES),
    portability: z.enum(VFX_PORTABILITY_MODES),
    transparency: z.enum(MATERIAL_TRANSPARENCY_MODES),
    doubleSided: z.boolean(),
    facing: z.strictObject({
      source: z.enum(['explicit', 'inferred']),
      mode: z.enum(VFX_FACING_MODES),
      normalAxis: z.enum(VFX_AXIS_DIRECTIONS).optional(),
      directionAxis: z.enum(VFX_AXIS_DIRECTIONS).optional(),
    }),
    animation: z.strictObject({
      playback: z.enum(VFX_PLAYBACK_POLICIES),
      durationSeconds: nonnegative,
      endpointBehavior: z.enum(VFX_ENDPOINT_BEHAVIORS),
      driver: z.enum(VFX_RUNTIME_DRIVERS),
      clipName: text.optional(),
      timeUniformName: text.optional(),
    }),
    sidecar: z.strictObject({ kind: z.literal('tsl'), id: text, version: text }).optional(),
  })
  .superRefine((value, context) => {
    for (const issue of validateVfxIntentV1(value).issues) {
      context.addIssue({ code: 'custom', path: issue.path.split('.'), message: issue.message });
    }
  });

const requirements = z.strictObject({
  grounding: statement(z.strictObject({ planeY: z.number().finite().optional() })).optional(),
  articulation: statement(marker).optional(),
  opening: statement(marker).optional(),
  navigation: statement(
    z.strictObject({ minWidth: positive.optional(), minHeight: positive.optional() }),
  ).optional(),
  tiling: statement(marker).optional(),
  /** Independent optional obligations: requesting waterborne support never creates wheels. */
  mobility: statement(
    z.strictObject({
      subtype: text.optional(),
      supportAssemblies: names.optional(),
      propulsionAssemblies: names.optional(),
      frontFrame: z.literal('+X').optional(),
      wheelCount: count.optional(),
      axleCount: count.optional(),
      steering: z.enum(VEHICLE_STEERING_ARRANGEMENTS).optional(),
      supportPolicy: z.enum(VEHICLE_SUPPORT_POLICIES).optional(),
      animationAssemblies: names.optional(),
    }),
  ).optional(),
  structure: statement(structure).optional(),
  rig: statement(
    z.strictObject({
      bodyPlan: z.enum(CHARACTER_BODY_PLANS).optional(),
      grounded: z.boolean().optional(),
      locomotion: z.enum(CHARACTER_LOCOMOTION_MODES).optional(),
      gait: text.optional(),
      rootMotion: z.enum(['inPlace', 'forward']).optional(),
      clips: z
        .array(z.strictObject({ name: text, playback: z.enum(['loop', 'oneShot']) }))
        .optional(),
      heldItem: z.strictObject({ required: z.boolean(), attachmentRole: text }).optional(),
    }),
  ).optional(),
  foliage: statement(
    z.strictObject({
      subtype: text.optional(),
      growthState: z.enum(VEGETATION_GROWTH_STATES).optional(),
      canopyProfile: z.enum(VEGETATION_CANOPY_PROFILES).optional(),
      standalone: z.boolean().optional(),
      grounded: z.boolean().optional(),
    }),
  ).optional(),
  spatialLayout: statement(
    z.strictObject({
      subtype: text.optional(),
      tileable: z.boolean().optional(),
      navigable: z.boolean().optional(),
    }),
  ).optional(),
  effects: statement(effects).optional(),
  material: statement(
    z.strictObject({
      mode: z.enum(MATERIAL_INTENT_MODES).optional(),
      recipeId: text.optional(),
      paletteId: text.optional(),
      transparency: z.enum(MATERIAL_TRANSPARENCY_MODES).optional(),
    }),
  ).optional(),
  animation: statement(
    z.strictObject({
      clips: names,
      locomotionDirection: z.literal('+X').optional(),
      rootMotion: z.enum(['inPlace', 'forward']).optional(),
      loop: z.boolean().optional(),
      gait: text.optional(),
    }),
  ).optional(),
  bounds: statement(
    z.strictObject({
      units: z.literal('m'),
      x: positive.optional(),
      y: positive.optional(),
      z: positive.optional(),
    }),
  ).optional(),
  parts: statement(z.strictObject({ required: names, forbiddenExtras: names })).optional(),
  modular: statement(
    z.strictObject({
      schemaVersion: z.literal(1),
      units: z.literal('m'),
      grid: z.tuple([positive, positive, positive]),
    }),
  ).optional(),
  representation: statement(
    z.strictObject({
      transparentSurface: z.boolean().optional(),
      runtimeShader: z.boolean().optional(),
      precomputedTangents: z.boolean().optional(),
      skinned: z.boolean().optional(),
    }),
  ).optional(),
  /**
   * Named parts rest on a support composed outside this asset, such as cushions on a separate
   * seat module. A detached part whose bottom meets its plane is reported as information.
   */
  externalSupport: statement(
    z.strictObject({
      supports: z
        .array(
          z.strictObject({
            parts: supportParts,
            planeY: z.number().finite(),
            tolerance: nonnegative.max(0.5).optional(),
          }),
        )
        .min(1)
        .max(32),
    }),
  ).optional(),
  /** Preserve explicit functional capabilities without a semantic category. */
  access: statement(
    z.strictObject({ enterable: z.boolean().optional(), driveable: z.boolean().optional() }),
  ).optional(),
  /** Host-declared destination checks on the final GLB (#208); never model-authored. */
  validation: statement(ValidationProfileV1Schema).optional(),
});

export const AssetRequirementsV1Schema = z
  .strictObject({
    kind: z.literal('kiln.asset-requirements'),
    schemaVersion: z.literal(1),
    labels: names,
    frame: z.strictObject({
      units: z.literal('m'),
      forward: z.literal('+X'),
      up: z.literal('+Y'),
      right: z.literal('+Z'),
      groundY: z.literal(0),
    }),
    scope: statement(z.enum(ASSET_SCOPES)).optional(),
    requirements,
  })
  .superRefine((record, context) => {
    const requests = record.requirements;
    // All statements currently address the same asset lineage. Preserve duplicated
    // domain data during migration, but never let two explicit meanings disagree.
    const facts = new Map<string, { value: boolean; path: string }>();
    const fact = (name: string, value: boolean | undefined, path: string) => {
      if (value === undefined) return;
      const previous = facts.get(name);
      if (previous && previous.value !== value) {
        context.addIssue({
          code: 'custom',
          path: ['requirements', ...path.split('.')],
          message: `Contradictory ${name} obligations at requirements.${previous.path} and requirements.${path}.`,
        });
      } else facts.set(name, { value, path });
    };
    for (const name of ['grounding', 'navigation', 'tiling'] as const) {
      const value = requests[name];
      if (value?.state === 'requested') fact(name, true, name);
      if (value?.state === 'inapplicable') fact(name, false, name);
    }
    if (requests.rig?.state === 'requested')
      fact('grounding', requests.rig.value.grounded, 'rig.value.grounded');
    if (requests.foliage?.state === 'requested')
      fact('grounding', requests.foliage.value.grounded, 'foliage.value.grounded');
    if (
      requests.mobility?.state === 'requested' &&
      requests.mobility.value.supportPolicy !== undefined
    ) {
      fact(
        'grounding',
        requests.mobility.value.supportPolicy === 'grounded',
        'mobility.value.supportPolicy',
      );
    }
    if (requests.spatialLayout?.state === 'requested') {
      fact('tiling', requests.spatialLayout.value.tileable, 'spatialLayout.value.tileable');
      fact('navigation', requests.spatialLayout.value.navigable, 'spatialLayout.value.navigable');
    }
    if (requests.access?.state === 'requested')
      fact('enterable', requests.access.value.enterable, 'access.value.enterable');
    if (requests.structure?.state === 'requested') {
      const structure = requests.structure.value;
      fact('enterable', structure.enterable, 'structure.value.enterable');
      if (structure.interiorMode !== undefined)
        fact('enterable', structure.interiorMode === 'navigable', 'structure.value.interiorMode');
      // Outdoor navigation can coexist with no enterable interior. Only a requested
      // navigable interior necessarily establishes global navigation applicability.
      if (structure.interiorMode === 'navigable')
        fact('navigation', true, 'structure.value.interiorMode');
    }
    if (requests.representation?.state === 'requested')
      fact(
        'runtimeShader',
        requests.representation.value.runtimeShader,
        'representation.value.runtimeShader',
      );
    if (requests.effects?.state === 'requested')
      fact(
        'runtimeShader',
        requests.effects.value.portability === 'sidecar',
        'effects.value.portability',
      );
    if (requests.material?.state === 'requested' && requests.material.value.mode === 'runtimeTsl')
      fact('runtimeShader', true, 'material.value.mode');
    if (requests.parts?.state === 'requested') {
      const forbidden = new Set(requests.parts.value.forbiddenExtras);
      for (const name of requests.parts.value.required) {
        if (forbidden.has(name))
          context.addIssue({
            code: 'custom',
            path: ['requirements', 'parts'],
            message: `Part ${JSON.stringify(name)} is both required and forbidden.`,
          });
      }
    }
  });

export type AssetRequirementsV1 = z.infer<typeof AssetRequirementsV1Schema>;
export type AssetRequirementsV1Input = Pick<
  Partial<AssetRequirementsV1>,
  'labels' | 'scope' | 'requirements'
>;
export type AssetRequirementKey = keyof AssetRequirementsV1['requirements'];

export function validateAssetRequirementsV1(
  value: unknown,
): ContractValidationResult<AssetRequirementsV1> {
  const result = AssetRequirementsV1Schema.safeParse(value);
  if (result.success) return { valid: true, value: result.data, issues: [] };
  return {
    valid: false,
    issues: result.error.issues.map((issue) => ({
      code: 'INVALID_ASSET_REQUIREMENTS',
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function createAssetRequirementsV1(
  input: AssetRequirementsV1Input = {},
): AssetRequirementsV1 {
  // Spreading preserves unknown input keys so the strict schema reports them instead of ignoring them.
  return AssetRequirementsV1Schema.parse({
    kind: 'kiln.asset-requirements',
    schemaVersion: 1,
    frame: KILN_ASSET_FRAME,
    labels: [],
    requirements: {},
    ...input,
  });
}
