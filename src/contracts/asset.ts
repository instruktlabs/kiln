/**
 * Stable, browser-safe contracts shared by every Kiln asset-generation surface.
 *
 * Keep this module dependency-free: Studio, workers, CLI consumers, and the
 * engine must all be able to import the same values without pulling in Three,
 * Node APIs, or a model-provider SDK.
 */

import {
  ASSET_SCOPES,
  KILN_DEFAULT_MODULAR_GRID,
  VFX_SUBTYPES,
  validateVfxIntentV1,
  type AssetScopeIntentV1,
  type ModularIntentV1,
  type ModularIntentV1Input,
  type VfxIntentV1,
  type VfxIntentV1Input,
  type VfxSubtype,
} from './breadth';

export const KILN_ASSET_FRAME = Object.freeze({
  units: 'm',
  forward: '+X',
  up: '+Y',
  right: '+Z',
  groundY: 0,
} as const);

export type AssetFrameContract = typeof KILN_ASSET_FRAME;

export const ASSET_CATEGORIES = [
  'prop',
  'character',
  'vfx',
  'environment',
  'architecture',
  'vegetation',
  'vehicle',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === 'string' && (ASSET_CATEGORIES as readonly string[]).includes(value);
}

export const ASSET_CAPABILITIES = [
  'enterable',
  'articulated',
  'driveable',
  'tileable',
  'transparentSurface',
  'runtimeShader',
  'grounded',
  'openable',
  'navigable',
  'skinned',
  /** Trusted consumer requires TANGENT accessors instead of deriving them at load time. */
  'precomputedTangents',
] as const;

export type AssetCapability = (typeof ASSET_CAPABILITIES)[number];

export const MATERIAL_INTENT_MODES = [
  'flatOptimized',
  'pbrRecipe',
  'texturedHero',
  'runtimeTsl',
] as const;

export type MaterialIntentMode = (typeof MATERIAL_INTENT_MODES)[number];

export const MATERIAL_TRANSPARENCY_MODES = ['opaque', 'mask', 'blend'] as const;
export type MaterialTransparencyMode = (typeof MATERIAL_TRANSPARENCY_MODES)[number];

export interface AssetBoundsV1 {
  /** Requested width/length along the engine's forward axis, in meters. */
  x?: number;
  /** Requested height along the engine's up axis, in meters. */
  y?: number;
  /** Requested width along the engine's right axis, in meters. */
  z?: number;
  units: 'm';
}

export interface MaterialIntentV1 {
  /** Portable standard-glTF PBR is the default authoring path. */
  mode: MaterialIntentMode;
  recipeId?: string;
  paletteId?: string;
  transparency?: MaterialTransparencyMode;
}

export interface AnimationIntentV1 {
  /** Exact clip names required by trusted user/product intent. */
  clips: string[];
  locomotionDirection?: '+X';
  rootMotion?: 'inPlace' | 'forward';
  loop?: boolean;
  gait?: string;
}

export const CHARACTER_BODY_PLANS = [
  'biped',
  'quadruped',
  'avian',
  'serpentine',
  'multi-limb',
  'wheeled',
  'custom',
] as const;
export type CharacterBodyPlan = (typeof CHARACTER_BODY_PLANS)[number];

export const CHARACTER_LOCOMOTION_MODES = [
  'stationary',
  'walk',
  'run',
  'fly',
  'swim',
  'slither',
  'roll',
  'custom',
] as const;
export type CharacterLocomotionMode = (typeof CHARACTER_LOCOMOTION_MODES)[number];
export type CharacterClipPlayback = 'loop' | 'oneShot';

export interface CharacterClipIntentV1 {
  name: string;
  playback: CharacterClipPlayback;
}

export interface CharacterHeldItemIntentV1 {
  required: boolean;
  /** Semantic end-effector role, not a model-authored node name. */
  attachmentRole: string;
}

/** Trusted, body-plan-specific requirements for character generation and QA. */
export interface CharacterIntentV1 {
  bodyPlan: CharacterBodyPlan;
  grounded: boolean;
  locomotion: CharacterLocomotionMode;
  gait: string;
  rootMotion: 'inPlace' | 'forward';
  clips: CharacterClipIntentV1[];
  heldItem: CharacterHeldItemIntentV1;
}

export interface CharacterIntentV1Input {
  bodyPlan?: CharacterBodyPlan;
  grounded?: boolean;
  locomotion?: CharacterLocomotionMode;
  gait?: string;
  rootMotion?: 'inPlace' | 'forward';
  clips?: readonly CharacterClipIntentV1[];
  heldItem?: Partial<CharacterHeldItemIntentV1>;
}

export const VEHICLE_SUBTYPES = [
  'wheeled',
  'tracked',
  'rail',
  'watercraft',
  'fixed-wing',
  'rotorcraft',
  'hover',
  'walking',
  'custom',
] as const;
export type VehicleSubtype = (typeof VEHICLE_SUBTYPES)[number];

export const VEHICLE_STEERING_ARRANGEMENTS = [
  'none',
  'front',
  'rear',
  'all',
  'articulated',
  'custom',
] as const;
export type VehicleSteeringArrangement = (typeof VEHICLE_STEERING_ARRANGEMENTS)[number];

export const VEHICLE_SUPPORT_POLICIES = ['grounded', 'waterborne', 'airborne'] as const;
export type VehicleSupportPolicy = (typeof VEHICLE_SUPPORT_POLICIES)[number];

/** Trusted subtype requirements; non-wheeled subtypes deliberately normalize to zero wheels. */
export interface VehicleIntentV1 {
  subtype: VehicleSubtype;
  supportAssemblies: string[];
  propulsionAssemblies: string[];
  wheelCount: number;
  axleCount: number;
  steering: VehicleSteeringArrangement;
  supportPolicy: VehicleSupportPolicy;
  animationAssemblies: string[];
}

export interface VehicleIntentV1Input {
  subtype?: VehicleSubtype;
  supportAssemblies?: readonly string[];
  propulsionAssemblies?: readonly string[];
  wheelCount?: number;
  axleCount?: number;
  steering?: VehicleSteeringArrangement;
  supportPolicy?: VehicleSupportPolicy;
  animationAssemblies?: readonly string[];
}

export const ARCHITECTURE_ROOF_TYPES = [
  'gable',
  'shed',
  'hip',
  'dome',
  'flat',
  'none',
  'custom',
] as const;
export type ArchitectureRoofType = (typeof ARCHITECTURE_ROOF_TYPES)[number];

export const ARCHITECTURE_INTERIOR_MODES = ['none', 'shell', 'navigable'] as const;
export type ArchitectureInteriorMode = (typeof ARCHITECTURE_INTERIOR_MODES)[number];

export const ARCHITECTURE_ROOF_MODES = ['auto', 'fixed', 'removable', 'none'] as const;
export type ArchitectureRoofMode = (typeof ARCHITECTURE_ROOF_MODES)[number];

export const ARCHITECTURE_SCALE_MODES = ['realistic', 'stylized'] as const;
export type ArchitectureScaleMode = (typeof ARCHITECTURE_SCALE_MODES)[number];

export interface ArchitectureFootprintV1 {
  spanX: number;
  spanZ: number;
  units: 'm';
}

export interface ArchitecturePortalV1 {
  /** Clear opening width along the wall, in meters. */
  width: number;
  /** Clear opening height above its threshold, in meters. */
  height: number;
  /** Clear passage depth through the wall, in meters. */
  depth: number;
}

export interface ArchitectureRoofIntentV1 {
  type: ArchitectureRoofType;
  ridgeAxis: 'x' | 'z';
  /** Ridge rise above the wall bearing line, in meters. */
  rise: number;
  /** Pitch measured from horizontal, in degrees. */
  pitchDegrees: number;
  /** Horizontal projection beyond each footprint edge, in meters. */
  overhang: number;
  /** Whether roof end planes requested by the profile must be closed. */
  closedEnds: boolean;
}

/** Trusted, category-specific architecture requirements. */
export interface ArchitectureIntentV1 {
  subtype: string;
  /** Legacy compatibility projection; true exactly for navigable interiors. */
  enterable: boolean;
  /** Requested above-ground storeys. Deterministic architecture QA supports one through five. */
  storeyCount: number;
  /** Whether the asset has no interior, a visible shell, or a traversable interior. */
  interiorMode: ArchitectureInteriorMode;
  /** Roof ownership/removal policy, independent from the geometric roof profile. */
  roofMode: ArchitectureRoofMode;
  footprint: ArchitectureFootprintV1;
  wallHeight: number;
  scaleMode: ArchitectureScaleMode;
  roof: ArchitectureRoofIntentV1;
  /** Requested exterior-to-interior clearance when `enterable` is true. */
  portal?: ArchitecturePortalV1;
}

export interface ArchitectureIntentV1Input {
  subtype?: string;
  /** @deprecated Prefer interiorMode; retained for persisted/request compatibility. */
  enterable?: boolean;
  storeyCount?: number;
  interiorMode?: ArchitectureInteriorMode;
  roofMode?: ArchitectureRoofMode;
  footprint?: Partial<Omit<ArchitectureFootprintV1, 'units'>> & { units?: 'm' };
  wallHeight?: number;
  scaleMode?: ArchitectureScaleMode;
  roof?: Partial<ArchitectureRoofIntentV1>;
  portal?: Partial<ArchitecturePortalV1>;
}

export const VEGETATION_SUBTYPES = [
  'tree',
  'conifer',
  'shrub',
  'grass',
  'frond/palm',
  'vine',
  'crop/flower',
  'succulent',
  'cactus',
  'fungus',
  'aquatic',
  'bare/dead',
  'custom',
] as const;
export type VegetationSubtype = (typeof VEGETATION_SUBTYPES)[number];

export const VEGETATION_GROWTH_STATES = ['lush', 'sparse', 'bare'] as const;
export type VegetationGrowthState = (typeof VEGETATION_GROWTH_STATES)[number];

export const VEGETATION_CANOPY_PROFILES = ['broadleaf', 'conifer', 'topiary', 'bare/dead'] as const;
export type VegetationCanopyProfile = (typeof VEGETATION_CANOPY_PROFILES)[number];

/** Trusted vegetation construction choices resolved before model execution. */
export interface VegetationIntentV1 {
  subtype: VegetationSubtype;
  growthState: VegetationGrowthState;
  canopyProfile: VegetationCanopyProfile;
  /** Standalone assets own one ground contact and exclude unrequested dressing. */
  standalone: boolean;
  grounded: boolean;
}

export interface VegetationIntentV1Input {
  subtype?: VegetationSubtype;
  growthState?: VegetationGrowthState;
  canopyProfile?: VegetationCanopyProfile;
  standalone?: boolean;
  grounded?: boolean;
}

export interface AssetIntentV1 {
  schemaVersion: 1;
  /** Closure-owned; model-authored metadata cannot replace this value. */
  category: AssetCategory;
  /** Category-specific profile selector, without expanding the top-level taxonomy. */
  subtype?: string;
  /** Required normalized scope; defaults are explicit and never inferred from model source. */
  scope: AssetScopeIntentV1;
  capabilities: AssetCapability[];
  bounds?: AssetBoundsV1;
  frame: AssetFrameContract;
  requiredParts: string[];
  forbiddenExtras: string[];
  material: MaterialIntentV1;
  animation?: AnimationIntentV1;
  /** Present exactly when `category === 'architecture'`. */
  architecture?: ArchitectureIntentV1;
  /** Present exactly when `category === 'character'`. */
  character?: CharacterIntentV1;
  /** Present exactly when `category === 'vehicle'`. */
  vehicle?: VehicleIntentV1;
  /** Present exactly when `category === 'vegetation'`. */
  vegetation?: VegetationIntentV1;
  /** Present exactly when `category === 'vfx'`. */
  vfx?: VfxIntentV1;
  /** Present exactly when scope is modularSet; grid comes from trusted request/defaults. */
  modular?: ModularIntentV1;
  qaProfile: string;
}

export type AssetIntentV1Input = Omit<
  AssetIntentV1,
  | 'schemaVersion'
  | 'frame'
  | 'capabilities'
  | 'requiredParts'
  | 'forbiddenExtras'
  | 'material'
  | 'architecture'
  | 'character'
  | 'vehicle'
  | 'vegetation'
  | 'vfx'
  | 'modular'
  | 'scope'
  | 'qaProfile'
> & {
  capabilities?: readonly AssetCapability[];
  requiredParts?: readonly string[];
  forbiddenExtras?: readonly string[];
  material?: Partial<MaterialIntentV1>;
  architecture?: ArchitectureIntentV1Input;
  character?: CharacterIntentV1Input;
  vehicle?: VehicleIntentV1Input;
  vegetation?: VegetationIntentV1Input;
  vfx?: VfxIntentV1Input;
  modular?: ModularIntentV1Input;
  scope?: Partial<Omit<AssetScopeIntentV1, 'schemaVersion'>>;
  qaProfile?: string;
};

export interface ContractValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ContractValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ContractValidationIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isEnumValue = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

function pushStringArrayIssues(
  issues: ContractValidationIssue[],
  value: unknown,
  path: string,
): value is string[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'EXPECTED_ARRAY', path, message: `${path} must be an array.` });
    return false;
  }
  const seen = new Set<string>();
  let valid = true;
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isNonEmptyString(item)) {
      issues.push({
        code: 'EXPECTED_NONEMPTY_STRING',
        path: `${path}[${i}]`,
        message: `${path}[${i}] must be a non-empty string.`,
      });
      valid = false;
      continue;
    }
    if (seen.has(item)) {
      issues.push({
        code: 'DUPLICATE_VALUE',
        path: `${path}[${i}]`,
        message: `${path} contains duplicate value ${JSON.stringify(item)}.`,
      });
      valid = false;
    }
    seen.add(item);
  }
  return valid;
}

function validateFrame(
  value: unknown,
  issues: ContractValidationIssue[],
): value is AssetFrameContract {
  if (!isRecord(value)) {
    issues.push({ code: 'INVALID_FRAME', path: 'frame', message: 'frame must be an object.' });
    return false;
  }
  let valid = true;
  for (const [key, expected] of Object.entries(KILN_ASSET_FRAME)) {
    if (value[key] !== expected) {
      issues.push({
        code: 'FRAME_CONTRACT_MISMATCH',
        path: `frame.${key}`,
        message: `frame.${key} must be ${JSON.stringify(expected)}.`,
      });
      valid = false;
    }
  }
  return valid;
}

function validateBounds(value: unknown, issues: ContractValidationIssue[]): value is AssetBoundsV1 {
  if (!isRecord(value)) {
    issues.push({ code: 'INVALID_BOUNDS', path: 'bounds', message: 'bounds must be an object.' });
    return false;
  }
  let valid = true;
  if (value.units !== 'm') {
    issues.push({
      code: 'INVALID_UNITS',
      path: 'bounds.units',
      message: 'bounds.units must be "m".',
    });
    valid = false;
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    const extent = value[axis];
    if (
      extent !== undefined &&
      (typeof extent !== 'number' || !Number.isFinite(extent) || extent <= 0)
    ) {
      issues.push({
        code: 'INVALID_BOUND_EXTENT',
        path: `bounds.${axis}`,
        message: `bounds.${axis} must be a finite number greater than zero.`,
      });
      valid = false;
    }
  }
  return valid;
}

function validateScope(
  value: unknown,
  issues: ContractValidationIssue[],
): value is AssetScopeIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_ASSET_SCOPE',
      path: 'scope',
      message: 'scope must be a normalized AssetScopeIntentV1 object.',
    });
    return false;
  }
  let valid = true;
  if (value.schemaVersion !== 1) {
    issues.push({
      code: 'INVALID_ASSET_SCOPE_VERSION',
      path: 'scope.schemaVersion',
      message: 'scope.schemaVersion must be 1.',
    });
    valid = false;
  }
  if (!isEnumValue(ASSET_SCOPES, value.scope)) {
    issues.push({
      code: 'INVALID_ASSET_SCOPE_KIND',
      path: 'scope.scope',
      message: `scope.scope must be one of ${ASSET_SCOPES.join(', ')}.`,
    });
    valid = false;
  }
  if (typeof value.explicit !== 'boolean') {
    issues.push({
      code: 'INVALID_ASSET_SCOPE_EXPLICIT',
      path: 'scope.explicit',
      message: 'scope.explicit must be boolean.',
    });
    valid = false;
  }
  return valid;
}

function validateModularIntent(
  value: unknown,
  issues: ContractValidationIssue[],
): value is ModularIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_MODULAR_INTENT',
      path: 'modular',
      message: 'modular must be a trusted ModularIntentV1 object for modularSet scope.',
    });
    return false;
  }
  let valid = true;
  if (value.schemaVersion !== 1) {
    issues.push({
      code: 'INVALID_MODULAR_INTENT_VERSION',
      path: 'modular.schemaVersion',
      message: 'modular.schemaVersion must be 1.',
    });
    valid = false;
  }
  if (value.units !== 'm') {
    issues.push({
      code: 'INVALID_MODULAR_UNITS',
      path: 'modular.units',
      message: 'modular.units must be meters.',
    });
    valid = false;
  }
  if (
    !Array.isArray(value.grid) ||
    value.grid.length !== 3 ||
    value.grid.some(
      (component) => typeof component !== 'number' || !Number.isFinite(component) || component <= 0,
    )
  ) {
    issues.push({
      code: 'INVALID_MODULAR_GRID',
      path: 'modular.grid',
      message: 'modular.grid must contain three positive finite meter steps.',
    });
    valid = false;
  }
  return valid;
}

function validateMaterial(
  value: unknown,
  issues: ContractValidationIssue[],
): value is MaterialIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_MATERIAL_INTENT',
      path: 'material',
      message: 'material must be an object.',
    });
    return false;
  }
  let valid = true;
  if (!isEnumValue(MATERIAL_INTENT_MODES, value.mode)) {
    issues.push({
      code: 'INVALID_MATERIAL_MODE',
      path: 'material.mode',
      message: `material.mode must be one of ${MATERIAL_INTENT_MODES.join(', ')}.`,
    });
    valid = false;
  }
  if (value.recipeId !== undefined && !isNonEmptyString(value.recipeId)) {
    issues.push({
      code: 'INVALID_RECIPE_ID',
      path: 'material.recipeId',
      message: 'material.recipeId must be a non-empty string.',
    });
    valid = false;
  }
  if (value.paletteId !== undefined && !isNonEmptyString(value.paletteId)) {
    issues.push({
      code: 'INVALID_PALETTE_ID',
      path: 'material.paletteId',
      message: 'material.paletteId must be a non-empty string.',
    });
    valid = false;
  }
  if (
    value.transparency !== undefined &&
    !isEnumValue(MATERIAL_TRANSPARENCY_MODES, value.transparency)
  ) {
    issues.push({
      code: 'INVALID_TRANSPARENCY_MODE',
      path: 'material.transparency',
      message: `material.transparency must be one of ${MATERIAL_TRANSPARENCY_MODES.join(', ')}.`,
    });
    valid = false;
  }
  return valid;
}

function validateAnimation(
  value: unknown,
  issues: ContractValidationIssue[],
): value is AnimationIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_ANIMATION_INTENT',
      path: 'animation',
      message: 'animation must be an object.',
    });
    return false;
  }
  let valid = pushStringArrayIssues(issues, value.clips, 'animation.clips');
  if (value.locomotionDirection !== undefined && value.locomotionDirection !== '+X') {
    issues.push({
      code: 'INVALID_LOCOMOTION_DIRECTION',
      path: 'animation.locomotionDirection',
      message: 'animation.locomotionDirection must be "+X".',
    });
    valid = false;
  }
  if (
    value.rootMotion !== undefined &&
    value.rootMotion !== 'inPlace' &&
    value.rootMotion !== 'forward'
  ) {
    issues.push({
      code: 'INVALID_ROOT_MOTION',
      path: 'animation.rootMotion',
      message: 'animation.rootMotion must be "inPlace" or "forward".',
    });
    valid = false;
  }
  if (value.loop !== undefined && typeof value.loop !== 'boolean') {
    issues.push({
      code: 'INVALID_LOOP_POLICY',
      path: 'animation.loop',
      message: 'animation.loop must be boolean.',
    });
    valid = false;
  }
  if (value.gait !== undefined && !isNonEmptyString(value.gait)) {
    issues.push({
      code: 'INVALID_GAIT',
      path: 'animation.gait',
      message: 'animation.gait must be a non-empty string.',
    });
    valid = false;
  }
  return valid;
}

function validateCharacter(
  value: unknown,
  issues: ContractValidationIssue[],
): value is CharacterIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_CHARACTER_INTENT',
      path: 'character',
      message: 'character must be an object for character assets.',
    });
    return false;
  }

  let valid = true;
  if (!isEnumValue(CHARACTER_BODY_PLANS, value.bodyPlan)) {
    issues.push({
      code: 'INVALID_CHARACTER_BODY_PLAN',
      path: 'character.bodyPlan',
      message: `character.bodyPlan must be one of ${CHARACTER_BODY_PLANS.join(', ')}.`,
    });
    valid = false;
  }
  if (typeof value.grounded !== 'boolean') {
    issues.push({
      code: 'INVALID_CHARACTER_GROUNDED',
      path: 'character.grounded',
      message: 'character.grounded must be boolean.',
    });
    valid = false;
  }
  if (!isEnumValue(CHARACTER_LOCOMOTION_MODES, value.locomotion)) {
    issues.push({
      code: 'INVALID_CHARACTER_LOCOMOTION',
      path: 'character.locomotion',
      message: `character.locomotion must be one of ${CHARACTER_LOCOMOTION_MODES.join(', ')}.`,
    });
    valid = false;
  }
  if (!isNonEmptyString(value.gait)) {
    issues.push({
      code: 'INVALID_CHARACTER_GAIT',
      path: 'character.gait',
      message: 'character.gait must be a non-empty string.',
    });
    valid = false;
  }
  if (value.rootMotion !== 'inPlace' && value.rootMotion !== 'forward') {
    issues.push({
      code: 'INVALID_CHARACTER_ROOT_MOTION',
      path: 'character.rootMotion',
      message: 'character.rootMotion must be "inPlace" or "forward".',
    });
    valid = false;
  }
  if (!Array.isArray(value.clips)) {
    issues.push({
      code: 'INVALID_CHARACTER_CLIPS',
      path: 'character.clips',
      message: 'character.clips must be an array.',
    });
    valid = false;
  } else {
    const names = new Set<string>();
    for (let i = 0; i < value.clips.length; i++) {
      const clip = value.clips[i];
      if (!isRecord(clip) || !isNonEmptyString(clip.name)) {
        issues.push({
          code: 'INVALID_CHARACTER_CLIP',
          path: `character.clips[${i}]`,
          message: 'Each character clip requires a non-empty name.',
        });
        valid = false;
        continue;
      }
      if (names.has(clip.name)) {
        issues.push({
          code: 'DUPLICATE_VALUE',
          path: `character.clips[${i}].name`,
          message: `character.clips contains duplicate name ${JSON.stringify(clip.name)}.`,
        });
        valid = false;
      }
      names.add(clip.name);
      if (clip.playback !== 'loop' && clip.playback !== 'oneShot') {
        issues.push({
          code: 'INVALID_CHARACTER_CLIP_PLAYBACK',
          path: `character.clips[${i}].playback`,
          message: 'Character clip playback must be "loop" or "oneShot".',
        });
        valid = false;
      }
    }
  }
  if (!isRecord(value.heldItem)) {
    issues.push({
      code: 'INVALID_CHARACTER_HELD_ITEM',
      path: 'character.heldItem',
      message: 'character.heldItem must be an object.',
    });
    valid = false;
  } else {
    if (typeof value.heldItem.required !== 'boolean') {
      issues.push({
        code: 'INVALID_CHARACTER_HELD_ITEM_REQUIRED',
        path: 'character.heldItem.required',
        message: 'character.heldItem.required must be boolean.',
      });
      valid = false;
    }
    if (!isNonEmptyString(value.heldItem.attachmentRole)) {
      issues.push({
        code: 'INVALID_CHARACTER_ATTACHMENT_ROLE',
        path: 'character.heldItem.attachmentRole',
        message: 'character.heldItem.attachmentRole must be a non-empty semantic role.',
      });
      valid = false;
    }
  }
  return valid;
}

function validateNonNegativeInteger(
  value: unknown,
  path: string,
  issues: ContractValidationIssue[],
): value is number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return true;
  issues.push({
    code: 'INVALID_NONNEGATIVE_INTEGER',
    path,
    message: `${path} must be a non-negative integer.`,
  });
  return false;
}

function validateVehicle(
  value: unknown,
  issues: ContractValidationIssue[],
): value is VehicleIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_VEHICLE_INTENT',
      path: 'vehicle',
      message: 'vehicle must be an object for vehicle assets.',
    });
    return false;
  }
  let valid = true;
  if (!isEnumValue(VEHICLE_SUBTYPES, value.subtype)) {
    issues.push({
      code: 'INVALID_VEHICLE_SUBTYPE',
      path: 'vehicle.subtype',
      message: `vehicle.subtype must be one of ${VEHICLE_SUBTYPES.join(', ')}.`,
    });
    valid = false;
  }
  valid =
    pushStringArrayIssues(issues, value.supportAssemblies, 'vehicle.supportAssemblies') && valid;
  valid =
    pushStringArrayIssues(issues, value.propulsionAssemblies, 'vehicle.propulsionAssemblies') &&
    valid;
  valid = validateNonNegativeInteger(value.wheelCount, 'vehicle.wheelCount', issues) && valid;
  valid = validateNonNegativeInteger(value.axleCount, 'vehicle.axleCount', issues) && valid;
  if (!isEnumValue(VEHICLE_STEERING_ARRANGEMENTS, value.steering)) {
    issues.push({
      code: 'INVALID_VEHICLE_STEERING',
      path: 'vehicle.steering',
      message: `vehicle.steering must be one of ${VEHICLE_STEERING_ARRANGEMENTS.join(', ')}.`,
    });
    valid = false;
  }
  if (!isEnumValue(VEHICLE_SUPPORT_POLICIES, value.supportPolicy)) {
    issues.push({
      code: 'INVALID_VEHICLE_SUPPORT_POLICY',
      path: 'vehicle.supportPolicy',
      message: `vehicle.supportPolicy must be one of ${VEHICLE_SUPPORT_POLICIES.join(', ')}.`,
    });
    valid = false;
  }
  valid =
    pushStringArrayIssues(issues, value.animationAssemblies, 'vehicle.animationAssemblies') &&
    valid;
  if (value.subtype === 'watercraft' && value.wheelCount !== 0) {
    issues.push({
      code: 'VEHICLE_WHEEL_POLICY_MISMATCH',
      path: 'vehicle.wheelCount',
      message: 'Watercraft must not inherit wheeled-vehicle wheel rules.',
    });
    valid = false;
  }
  if (value.subtype === 'wheeled' && value.wheelCount === 0) {
    issues.push({
      code: 'VEHICLE_WHEEL_POLICY_MISMATCH',
      path: 'vehicle.wheelCount',
      message: 'wheeled vehicles require a positive wheel count.',
    });
    valid = false;
  }
  if (typeof value.wheelCount === 'number' && typeof value.axleCount === 'number') {
    if (value.axleCount > value.wheelCount) {
      issues.push({
        code: 'VEHICLE_AXLE_COUNT_MISMATCH',
        path: 'vehicle.axleCount',
        message: 'vehicle.axleCount cannot exceed vehicle.wheelCount.',
      });
      valid = false;
    }
  }
  return valid;
}

function validateVegetation(
  value: unknown,
  issues: ContractValidationIssue[],
): value is VegetationIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_VEGETATION_INTENT',
      path: 'vegetation',
      message: 'vegetation must be an object for vegetation assets.',
    });
    return false;
  }
  let valid = true;
  if (!isEnumValue(VEGETATION_SUBTYPES, value.subtype)) {
    issues.push({
      code: 'INVALID_VEGETATION_SUBTYPE',
      path: 'vegetation.subtype',
      message: `vegetation.subtype must be one of ${VEGETATION_SUBTYPES.join(', ')}.`,
    });
    valid = false;
  }
  if (!isEnumValue(VEGETATION_GROWTH_STATES, value.growthState)) {
    issues.push({
      code: 'INVALID_VEGETATION_GROWTH_STATE',
      path: 'vegetation.growthState',
      message: `vegetation.growthState must be one of ${VEGETATION_GROWTH_STATES.join(', ')}.`,
    });
    valid = false;
  }
  if (!isEnumValue(VEGETATION_CANOPY_PROFILES, value.canopyProfile)) {
    issues.push({
      code: 'INVALID_VEGETATION_CANOPY_PROFILE',
      path: 'vegetation.canopyProfile',
      message: `vegetation.canopyProfile must be one of ${VEGETATION_CANOPY_PROFILES.join(', ')}.`,
    });
    valid = false;
  }
  for (const property of ['standalone', 'grounded'] as const) {
    if (typeof value[property] !== 'boolean') {
      issues.push({
        code: 'INVALID_VEGETATION_BOOLEAN',
        path: `vegetation.${property}`,
        message: `vegetation.${property} must be boolean.`,
      });
      valid = false;
    }
  }
  if (value.growthState === 'bare' && value.canopyProfile !== 'bare/dead') {
    issues.push({
      code: 'VEGETATION_BARE_PROFILE_MISMATCH',
      path: 'vegetation.canopyProfile',
      message: 'Bare vegetation must use the bare/dead canopy profile.',
    });
    valid = false;
  }
  return valid;
}

function validatePositiveMeter(
  value: unknown,
  path: string,
  issues: ContractValidationIssue[],
): value is number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return true;
  issues.push({
    code: 'INVALID_ARCHITECTURE_DIMENSION',
    path,
    message: `${path} must be a finite number greater than zero meters.`,
  });
  return false;
}

function validateArchitecture(
  value: unknown,
  issues: ContractValidationIssue[],
): value is ArchitectureIntentV1 {
  if (!isRecord(value)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_INTENT',
      path: 'architecture',
      message: 'architecture must be an object for architecture assets.',
    });
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(value.subtype)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_SUBTYPE',
      path: 'architecture.subtype',
      message: 'architecture.subtype must be a non-empty string.',
    });
    valid = false;
  }
  if (typeof value.enterable !== 'boolean') {
    issues.push({
      code: 'INVALID_ARCHITECTURE_ENTERABLE',
      path: 'architecture.enterable',
      message: 'architecture.enterable must be boolean.',
    });
    valid = false;
  }
  // These fields were added to schema v1 after the original architecture
  // contract shipped. Missing values retain legacy semantics at read time;
  // newly normalized intents always emit all three fields.
  if (
    value.storeyCount !== undefined &&
    (typeof value.storeyCount !== 'number' ||
      !Number.isInteger(value.storeyCount) ||
      value.storeyCount < 1 ||
      value.storeyCount > 5)
  ) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_STOREY_COUNT',
      path: 'architecture.storeyCount',
      message: 'architecture.storeyCount must be an integer from 1 through 5.',
    });
    valid = false;
  }
  if (
    value.interiorMode !== undefined &&
    !isEnumValue(ARCHITECTURE_INTERIOR_MODES, value.interiorMode)
  ) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_INTERIOR_MODE',
      path: 'architecture.interiorMode',
      message: `architecture.interiorMode must be one of ${ARCHITECTURE_INTERIOR_MODES.join(', ')}.`,
    });
    valid = false;
  }
  if (value.roofMode !== undefined && !isEnumValue(ARCHITECTURE_ROOF_MODES, value.roofMode)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_ROOF_MODE',
      path: 'architecture.roofMode',
      message: `architecture.roofMode must be one of ${ARCHITECTURE_ROOF_MODES.join(', ')}.`,
    });
    valid = false;
  }
  if (
    isEnumValue(ARCHITECTURE_INTERIOR_MODES, value.interiorMode) &&
    typeof value.enterable === 'boolean' &&
    value.enterable !== (value.interiorMode === 'navigable')
  ) {
    issues.push({
      code: 'ARCHITECTURE_INTERIOR_ENTERABLE_MISMATCH',
      path: 'architecture.enterable',
      message: 'architecture.enterable must be true exactly when interiorMode is "navigable".',
    });
    valid = false;
  }
  if (!isEnumValue(ARCHITECTURE_SCALE_MODES, value.scaleMode)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_SCALE_MODE',
      path: 'architecture.scaleMode',
      message: `architecture.scaleMode must be one of ${ARCHITECTURE_SCALE_MODES.join(', ')}.`,
    });
    valid = false;
  }
  valid = validatePositiveMeter(value.wallHeight, 'architecture.wallHeight', issues) && valid;

  if (!isRecord(value.footprint)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_FOOTPRINT',
      path: 'architecture.footprint',
      message: 'architecture.footprint must be an object.',
    });
    valid = false;
  } else {
    if (value.footprint.units !== 'm') {
      issues.push({
        code: 'INVALID_UNITS',
        path: 'architecture.footprint.units',
        message: 'architecture.footprint.units must be "m".',
      });
      valid = false;
    }
    valid =
      validatePositiveMeter(value.footprint.spanX, 'architecture.footprint.spanX', issues) && valid;
    valid =
      validatePositiveMeter(value.footprint.spanZ, 'architecture.footprint.spanZ', issues) && valid;
  }

  if (!isRecord(value.roof)) {
    issues.push({
      code: 'INVALID_ARCHITECTURE_ROOF',
      path: 'architecture.roof',
      message: 'architecture.roof must be an object.',
    });
    valid = false;
  } else {
    const roof = value.roof;
    if (!isEnumValue(ARCHITECTURE_ROOF_TYPES, roof.type)) {
      issues.push({
        code: 'INVALID_ARCHITECTURE_ROOF_TYPE',
        path: 'architecture.roof.type',
        message: `architecture.roof.type must be one of ${ARCHITECTURE_ROOF_TYPES.join(', ')}.`,
      });
      valid = false;
    }
    if (roof.ridgeAxis !== 'x' && roof.ridgeAxis !== 'z') {
      issues.push({
        code: 'INVALID_ARCHITECTURE_RIDGE_AXIS',
        path: 'architecture.roof.ridgeAxis',
        message: 'architecture.roof.ridgeAxis must be "x" or "z".',
      });
      valid = false;
    }
    const flat = roof.type === 'flat' || roof.type === 'none';
    const dome = roof.type === 'dome';
    if (
      typeof roof.rise !== 'number' ||
      !Number.isFinite(roof.rise) ||
      (flat ? roof.rise !== 0 : roof.rise <= 0)
    ) {
      issues.push({
        code: 'INVALID_ARCHITECTURE_ROOF_RISE',
        path: 'architecture.roof.rise',
        message: flat
          ? 'Flat or absent roofs must have zero rise.'
          : 'Pitched roofs must have a finite positive rise.',
      });
      valid = false;
    }
    if (
      typeof roof.pitchDegrees !== 'number' ||
      !Number.isFinite(roof.pitchDegrees) ||
      (flat || dome ? roof.pitchDegrees !== 0 : roof.pitchDegrees <= 0 || roof.pitchDegrees >= 89)
    ) {
      issues.push({
        code: 'INVALID_ARCHITECTURE_ROOF_PITCH',
        path: 'architecture.roof.pitchDegrees',
        message:
          flat || dome
            ? 'Flat, absent, or dome roofs must have zero planar pitch.'
            : 'Pitched roofs must have a pitch greater than 0 and less than 89 degrees.',
      });
      valid = false;
    }
    if (typeof roof.overhang !== 'number' || !Number.isFinite(roof.overhang) || roof.overhang < 0) {
      issues.push({
        code: 'INVALID_ARCHITECTURE_OVERHANG',
        path: 'architecture.roof.overhang',
        message: 'architecture.roof.overhang must be a finite non-negative number.',
      });
      valid = false;
    }
    if (typeof roof.closedEnds !== 'boolean') {
      issues.push({
        code: 'INVALID_ARCHITECTURE_CLOSED_ENDS',
        path: 'architecture.roof.closedEnds',
        message: 'architecture.roof.closedEnds must be boolean.',
      });
      valid = false;
    }

    if (
      !flat &&
      !dome &&
      isRecord(value.footprint) &&
      typeof value.footprint.spanX === 'number' &&
      typeof value.footprint.spanZ === 'number' &&
      Number.isFinite(roof.rise as number) &&
      Number.isFinite(roof.pitchDegrees as number) &&
      (roof.ridgeAxis === 'x' || roof.ridgeAxis === 'z')
    ) {
      const run = (roof.ridgeAxis === 'x' ? value.footprint.spanZ : value.footprint.spanX) / 2;
      const expectedRise = Math.tan(THREE_DEGREES * (roof.pitchDegrees as number)) * run;
      const tolerance = Math.max(1e-6, Math.abs(expectedRise) * 1e-6);
      if (Math.abs((roof.rise as number) - expectedRise) > tolerance) {
        issues.push({
          code: 'ARCHITECTURE_ROOF_GEOMETRY_MISMATCH',
          path: 'architecture.roof',
          message:
            'architecture.roof.rise and pitchDegrees disagree for the footprint and ridgeAxis.',
        });
        valid = false;
      }
    }
    if (
      isEnumValue(ARCHITECTURE_ROOF_MODES, value.roofMode) &&
      (value.roofMode === 'none') !== (roof.type === 'none')
    ) {
      issues.push({
        code: 'ARCHITECTURE_ROOF_MODE_TYPE_MISMATCH',
        path: 'architecture.roofMode',
        message: 'roofMode and roof.type must both be "none", or both describe a present roof.',
      });
      valid = false;
    }
  }

  if (value.portal !== undefined) {
    if (!isRecord(value.portal)) {
      issues.push({
        code: 'INVALID_ARCHITECTURE_PORTAL',
        path: 'architecture.portal',
        message: 'architecture.portal must be an object.',
      });
      valid = false;
    } else {
      for (const dimension of ['width', 'height', 'depth'] as const) {
        valid =
          validatePositiveMeter(
            value.portal[dimension],
            `architecture.portal.${dimension}`,
            issues,
          ) && valid;
      }
    }
  }

  return valid;
}

const THREE_DEGREES = Math.PI / 180;

/** Validate untrusted JSON-like input without adding a runtime schema dependency. */
export function validateAssetIntentV1(value: unknown): ContractValidationResult<AssetIntentV1> {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ code: 'EXPECTED_OBJECT', path: '', message: 'AssetIntentV1 must be an object.' }],
    };
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: 'schemaVersion must be 1.',
    });
  }
  if (!isEnumValue(ASSET_CATEGORIES, value.category)) {
    issues.push({
      code: 'INVALID_CATEGORY',
      path: 'category',
      message: `category must be one of ${ASSET_CATEGORIES.join(', ')}.`,
    });
  }
  if (value.subtype !== undefined && !isNonEmptyString(value.subtype)) {
    issues.push({
      code: 'INVALID_SUBTYPE',
      path: 'subtype',
      message: 'subtype must be a non-empty string.',
    });
  }

  if (Array.isArray(value.capabilities)) {
    const seen = new Set<string>();
    for (let i = 0; i < value.capabilities.length; i++) {
      const capability = value.capabilities[i];
      if (!isEnumValue(ASSET_CAPABILITIES, capability)) {
        issues.push({
          code: 'INVALID_CAPABILITY',
          path: `capabilities[${i}]`,
          message: `Unknown capability ${JSON.stringify(capability)}.`,
        });
      } else if (seen.has(capability)) {
        issues.push({
          code: 'DUPLICATE_VALUE',
          path: `capabilities[${i}]`,
          message: `capabilities contains duplicate value ${JSON.stringify(capability)}.`,
        });
      }
      if (typeof capability === 'string') seen.add(capability);
    }
  } else {
    issues.push({
      code: 'EXPECTED_ARRAY',
      path: 'capabilities',
      message: 'capabilities must be an array.',
    });
  }

  const requiredOk = pushStringArrayIssues(issues, value.requiredParts, 'requiredParts');
  const forbiddenOk = pushStringArrayIssues(issues, value.forbiddenExtras, 'forbiddenExtras');
  if (requiredOk && forbiddenOk) {
    const forbidden = new Set(value.forbiddenExtras as string[]);
    for (let i = 0; i < (value.requiredParts as string[]).length; i++) {
      const part = (value.requiredParts as string[])[i]!;
      if (forbidden.has(part)) {
        issues.push({
          code: 'CONTRADICTORY_PART_REQUIREMENT',
          path: `requiredParts[${i}]`,
          message: `${JSON.stringify(part)} cannot be both required and forbidden.`,
        });
      }
    }
  }

  validateFrame(value.frame, issues);
  validateScope(value.scope, issues);
  if (isRecord(value.scope) && value.scope.scope === 'modularSet') {
    validateModularIntent(value.modular, issues);
  } else if (value.modular !== undefined) {
    issues.push({
      code: 'MODULAR_INTENT_SCOPE_MISMATCH',
      path: 'modular',
      message: 'modular intent is allowed only when scope.scope is "modularSet".',
    });
  }
  if (value.bounds !== undefined) validateBounds(value.bounds, issues);
  validateMaterial(value.material, issues);
  if (value.animation !== undefined) validateAnimation(value.animation, issues);
  if (value.category === 'architecture') {
    validateArchitecture(value.architecture, issues);
    if (
      isRecord(value.architecture) &&
      isNonEmptyString(value.subtype) &&
      isNonEmptyString(value.architecture.subtype) &&
      value.subtype !== value.architecture.subtype
    ) {
      issues.push({
        code: 'ARCHITECTURE_SUBTYPE_MISMATCH',
        path: 'architecture.subtype',
        message: 'architecture.subtype must match the top-level subtype.',
      });
    }
    if (
      isRecord(value.architecture) &&
      typeof value.architecture.enterable === 'boolean' &&
      Array.isArray(value.capabilities) &&
      value.capabilities.includes('enterable') !== value.architecture.enterable
    ) {
      issues.push({
        code: 'ARCHITECTURE_ENTERABLE_CAPABILITY_MISMATCH',
        path: 'capabilities',
        message: 'The enterable capability must exactly match architecture.enterable.',
      });
    }
    if (
      isRecord(value.architecture) &&
      isEnumValue(ARCHITECTURE_INTERIOR_MODES, value.architecture.interiorMode) &&
      Array.isArray(value.capabilities) &&
      value.capabilities.includes('navigable') !== (value.architecture.interiorMode === 'navigable')
    ) {
      issues.push({
        code: 'ARCHITECTURE_NAVIGABLE_CAPABILITY_MISMATCH',
        path: 'capabilities',
        message: 'The navigable capability must exactly match architecture.interiorMode.',
      });
    }
  } else if (value.architecture !== undefined) {
    issues.push({
      code: 'ARCHITECTURE_INTENT_CATEGORY_MISMATCH',
      path: 'architecture',
      message: 'architecture intent is allowed only when category is "architecture".',
    });
  }
  if (value.category === 'character') {
    validateCharacter(value.character, issues);
    if (
      isRecord(value.character) &&
      typeof value.character.grounded === 'boolean' &&
      Array.isArray(value.capabilities) &&
      value.capabilities.includes('grounded') !== value.character.grounded
    ) {
      issues.push({
        code: 'CHARACTER_GROUNDED_CAPABILITY_MISMATCH',
        path: 'capabilities',
        message: 'The grounded capability must exactly match character.grounded.',
      });
    }
  } else if (value.character !== undefined) {
    issues.push({
      code: 'CHARACTER_INTENT_CATEGORY_MISMATCH',
      path: 'character',
      message: 'character intent is allowed only when category is "character".',
    });
  }
  if (value.category === 'vehicle') {
    validateVehicle(value.vehicle, issues);
    if (
      isRecord(value.vehicle) &&
      isNonEmptyString(value.subtype) &&
      isEnumValue(VEHICLE_SUBTYPES, value.vehicle.subtype) &&
      value.subtype !== value.vehicle.subtype
    ) {
      issues.push({
        code: 'VEHICLE_SUBTYPE_MISMATCH',
        path: 'vehicle.subtype',
        message: 'vehicle.subtype must match the top-level subtype.',
      });
    }
    if (
      isRecord(value.vehicle) &&
      value.vehicle.supportPolicy === 'grounded' &&
      Array.isArray(value.capabilities) &&
      !value.capabilities.includes('grounded')
    ) {
      issues.push({
        code: 'VEHICLE_SUPPORT_CAPABILITY_MISMATCH',
        path: 'capabilities',
        message: 'Grounded vehicle support requires the grounded capability.',
      });
    }
  } else if (value.vehicle !== undefined) {
    issues.push({
      code: 'VEHICLE_INTENT_CATEGORY_MISMATCH',
      path: 'vehicle',
      message: 'vehicle intent is allowed only when category is "vehicle".',
    });
  }
  if (value.category === 'vegetation') {
    validateVegetation(value.vegetation, issues);
    if (
      isRecord(value.vegetation) &&
      isNonEmptyString(value.subtype) &&
      isEnumValue(VEGETATION_SUBTYPES, value.vegetation.subtype) &&
      value.subtype !== value.vegetation.subtype
    ) {
      issues.push({
        code: 'VEGETATION_SUBTYPE_MISMATCH',
        path: 'vegetation.subtype',
        message: 'vegetation.subtype must match the top-level subtype.',
      });
    }
    if (
      isRecord(value.vegetation) &&
      value.vegetation.grounded === true &&
      Array.isArray(value.capabilities) &&
      !value.capabilities.includes('grounded')
    ) {
      issues.push({
        code: 'VEGETATION_GROUNDED_CAPABILITY_MISMATCH',
        path: 'capabilities',
        message: 'Grounded vegetation requires the grounded capability.',
      });
    }
  } else if (value.vegetation !== undefined) {
    issues.push({
      code: 'VEGETATION_INTENT_CATEGORY_MISMATCH',
      path: 'vegetation',
      message: 'vegetation intent is allowed only when category is "vegetation".',
    });
  }
  if (value.category === 'vfx') {
    const result = validateVfxIntentV1(value.vfx);
    if (!result.valid) {
      issues.push(
        ...result.issues.map((issue) => ({
          code: issue.code,
          path: issue.path ? `vfx.${issue.path}` : 'vfx',
          message: issue.message,
        })),
      );
    }
    if (
      isRecord(value.vfx) &&
      isNonEmptyString(value.subtype) &&
      isEnumValue(VFX_SUBTYPES, value.vfx.subtype) &&
      value.subtype !== value.vfx.subtype
    ) {
      issues.push({
        code: 'VFX_SUBTYPE_MISMATCH',
        path: 'vfx.subtype',
        message: 'vfx.subtype must match the top-level subtype.',
      });
    }
    if (isRecord(value.vfx) && Array.isArray(value.capabilities)) {
      const transparent = value.vfx.transparency !== 'opaque';
      if (value.capabilities.includes('transparentSurface') !== transparent) {
        issues.push({
          code: 'VFX_TRANSPARENCY_CAPABILITY_MISMATCH',
          path: 'capabilities',
          message: 'transparentSurface must exactly match the normalized VFX transparency mode.',
        });
      }
      const sidecar = value.vfx.portability === 'sidecar';
      if (value.capabilities.includes('runtimeShader') !== sidecar) {
        issues.push({
          code: 'VFX_RUNTIME_CAPABILITY_MISMATCH',
          path: 'capabilities',
          message: 'runtimeShader must exactly match the normalized VFX portability mode.',
        });
      }
    }
    if (isRecord(value.vfx) && isRecord(value.material)) {
      if (value.material.transparency !== value.vfx.transparency) {
        issues.push({
          code: 'VFX_MATERIAL_TRANSPARENCY_MISMATCH',
          path: 'material.transparency',
          message: 'material.transparency must exactly match vfx.transparency.',
        });
      }
      if ((value.vfx.portability === 'sidecar') !== (value.material.mode === 'runtimeTsl')) {
        issues.push({
          code: 'VFX_MATERIAL_PORTABILITY_MISMATCH',
          path: 'material.mode',
          message: 'runtimeTsl is required exactly for sidecar VFX intent.',
        });
      }
    }
  } else if (value.vfx !== undefined) {
    issues.push({
      code: 'VFX_INTENT_CATEGORY_MISMATCH',
      path: 'vfx',
      message: 'vfx intent is allowed only when category is "vfx".',
    });
  }
  if (!isNonEmptyString(value.qaProfile)) {
    issues.push({
      code: 'INVALID_QA_PROFILE',
      path: 'qaProfile',
      message: 'qaProfile must be a non-empty string.',
    });
  }

  return issues.length === 0
    ? { valid: true, value: value as unknown as AssetIntentV1, issues }
    : { valid: false, issues };
}

export interface LegacyAssetIntentScopeMigrationResult
  extends ContractValidationResult<AssetIntentV1> {
  migratedScope: boolean;
}

/**
 * Add only the new scope default to a trusted legacy v1 request/persistence
 * payload. This does not invent category-specific contracts: an old VFX row
 * without `vfx` remains invalid for new-generation QA and should be surfaced as
 * legacy-unassessed by its persistence reader.
 */
export function migrateLegacyAssetIntentV1Scope(
  value: unknown,
): LegacyAssetIntentScopeMigrationResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isEnumValue(ASSET_CATEGORIES, value.category) ||
    value.scope !== undefined
  ) {
    return { ...validateAssetIntentV1(value), migratedScope: false };
  }
  const candidate = {
    ...value,
    scope: normalizeAssetScope({
      category: value.category,
      ...(isNonEmptyString(value.subtype) ? { subtype: value.subtype } : {}),
    }),
  };
  return { ...validateAssetIntentV1(candidate), migratedScope: true };
}

export function isAssetIntentV1(value: unknown): value is AssetIntentV1 {
  return validateAssetIntentV1(value).valid;
}

function normalizeArchitectureIntent(input: AssetIntentV1Input): ArchitectureIntentV1 | undefined {
  if (input.category !== 'architecture' && input.architecture === undefined) return undefined;

  const architecture = input.architecture ?? {};
  const spanX = architecture.footprint?.spanX ?? input.bounds?.x ?? 4;
  const spanZ = architecture.footprint?.spanZ ?? input.bounds?.z ?? 4;
  const ridgeAxis = architecture.roof?.ridgeAxis ?? 'x';
  const roofType = architecture.roof?.type ?? 'gable';
  const flat = roofType === 'flat' || roofType === 'none';
  const dome = roofType === 'dome';
  const halfRun = (ridgeAxis === 'x' ? spanZ : spanX) / 2;
  const suppliedRise = architecture.roof?.rise;
  const suppliedPitch = architecture.roof?.pitchDegrees;
  const pitchDegrees =
    flat || dome
      ? (suppliedPitch ?? 0)
      : (suppliedPitch ??
        (suppliedRise !== undefined && halfRun > 0
          ? Math.atan2(suppliedRise, halfRun) / THREE_DEGREES
          : 30));
  const rise = flat
    ? (suppliedRise ?? 0)
    : dome
      ? (suppliedRise ?? Math.min(spanX, spanZ) / 2)
      : (suppliedRise ?? Math.tan(pitchDegrees * THREE_DEGREES) * halfRun);
  const interiorMode =
    architecture.interiorMode ?? (architecture.enterable === false ? 'none' : 'navigable');
  const enterable = architecture.enterable ?? interiorMode === 'navigable';
  const roofMode = architecture.roofMode ?? (roofType === 'none' ? 'none' : 'auto');

  return {
    subtype: architecture.subtype ?? input.subtype ?? 'building',
    enterable,
    storeyCount: architecture.storeyCount ?? 1,
    interiorMode,
    roofMode,
    footprint: { spanX, spanZ, units: 'm' },
    wallHeight: architecture.wallHeight ?? input.bounds?.y ?? 2.8,
    scaleMode: architecture.scaleMode ?? 'realistic',
    roof: {
      type: roofType,
      ridgeAxis,
      rise,
      pitchDegrees,
      overhang: architecture.roof?.overhang ?? 0.3,
      closedEnds: architecture.roof?.closedEnds ?? true,
    },
    ...(architecture.portal || enterable
      ? {
          portal: {
            width: architecture.portal?.width ?? 1.1,
            height: architecture.portal?.height ?? 2.1,
            depth: architecture.portal?.depth ?? 0.15,
          },
        }
      : {}),
  };
}

const ONE_SHOT_CLIP = /(?:death|die|impact|hit|attack|jump|land|spawn|despawn|emote)/i;

function normalizeCharacterIntent(input: AssetIntentV1Input): CharacterIntentV1 | undefined {
  if (input.category !== 'character' && input.character === undefined) return undefined;
  const character = input.character ?? {};
  const requestedSubtype = input.subtype;
  const bodyPlan =
    character.bodyPlan ??
    (isEnumValue(CHARACTER_BODY_PLANS, requestedSubtype)
      ? requestedSubtype
      : requestedSubtype
        ? 'custom'
        : 'biped');
  const grounded = character.grounded ?? input.capabilities?.includes('grounded') ?? true;
  const defaultLocomotion: Record<CharacterBodyPlan, CharacterLocomotionMode> = {
    biped: 'walk',
    quadruped: 'walk',
    avian: grounded ? 'walk' : 'fly',
    serpentine: 'slither',
    'multi-limb': 'walk',
    wheeled: 'roll',
    custom: 'custom',
  };
  const rootMotion = character.rootMotion ?? input.animation?.rootMotion ?? 'inPlace';
  const gait = character.gait ?? input.animation?.gait ?? defaultLocomotion[bodyPlan];
  const clips = character.clips
    ? character.clips.map((clip) => ({ name: clip.name, playback: clip.playback }))
    : (input.animation?.clips ?? []).map((name) => ({
        name,
        playback:
          input.animation?.loop === false || ONE_SHOT_CLIP.test(name)
            ? ('oneShot' as const)
            : ('loop' as const),
      }));
  return {
    bodyPlan,
    grounded,
    locomotion: character.locomotion ?? defaultLocomotion[bodyPlan],
    gait,
    rootMotion,
    clips,
    heldItem: {
      required: character.heldItem?.required ?? false,
      attachmentRole: character.heldItem?.attachmentRole ?? 'grip',
    },
  };
}

function inferVehicleSubtype(value: string | undefined): VehicleSubtype {
  if (isEnumValue(VEHICLE_SUBTYPES, value)) return value;
  if (value && /(?:car|truck|jeep|wagon|bike|bicycle|scooter|rover|buggy)/i.test(value)) {
    return 'wheeled';
  }
  return value ? 'custom' : 'wheeled';
}

const VEHICLE_DEFAULTS: Record<
  VehicleSubtype,
  Pick<
    VehicleIntentV1,
    | 'supportAssemblies'
    | 'propulsionAssemblies'
    | 'wheelCount'
    | 'axleCount'
    | 'steering'
    | 'supportPolicy'
  >
> = {
  wheeled: {
    supportAssemblies: ['wheel'],
    propulsionAssemblies: ['wheel'],
    wheelCount: 4,
    axleCount: 2,
    steering: 'front',
    supportPolicy: 'grounded',
  },
  tracked: {
    supportAssemblies: ['track'],
    propulsionAssemblies: ['track'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'none',
    supportPolicy: 'grounded',
  },
  rail: {
    supportAssemblies: ['rail-wheel'],
    propulsionAssemblies: ['rail-wheel'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'none',
    supportPolicy: 'grounded',
  },
  watercraft: {
    supportAssemblies: ['hull'],
    propulsionAssemblies: ['propeller'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'rear',
    supportPolicy: 'waterborne',
  },
  'fixed-wing': {
    supportAssemblies: ['landing-gear'],
    propulsionAssemblies: ['propeller'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'front',
    supportPolicy: 'airborne',
  },
  rotorcraft: {
    supportAssemblies: ['landing-gear'],
    propulsionAssemblies: ['rotor'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'none',
    supportPolicy: 'airborne',
  },
  hover: {
    supportAssemblies: ['hover-pad'],
    propulsionAssemblies: ['thruster'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'custom',
    supportPolicy: 'airborne',
  },
  walking: {
    supportAssemblies: ['leg'],
    propulsionAssemblies: ['leg'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'custom',
    supportPolicy: 'grounded',
  },
  custom: {
    supportAssemblies: ['support'],
    propulsionAssemblies: ['propulsion'],
    wheelCount: 0,
    axleCount: 0,
    steering: 'custom',
    supportPolicy: 'grounded',
  },
};

function normalizeVehicleIntent(input: AssetIntentV1Input): VehicleIntentV1 | undefined {
  if (input.category !== 'vehicle' && input.vehicle === undefined) return undefined;
  const vehicle = input.vehicle ?? {};
  const subtype = vehicle.subtype ?? inferVehicleSubtype(input.subtype);
  const defaults = VEHICLE_DEFAULTS[subtype];
  return {
    subtype,
    supportAssemblies: [...(vehicle.supportAssemblies ?? defaults.supportAssemblies)],
    propulsionAssemblies: [...(vehicle.propulsionAssemblies ?? defaults.propulsionAssemblies)],
    wheelCount: vehicle.wheelCount ?? defaults.wheelCount,
    axleCount: vehicle.axleCount ?? defaults.axleCount,
    steering: vehicle.steering ?? defaults.steering,
    supportPolicy: vehicle.supportPolicy ?? defaults.supportPolicy,
    animationAssemblies: [...(vehicle.animationAssemblies ?? [])],
  };
}

function inferVegetationSubtype(value: string | undefined): VegetationSubtype {
  if (isEnumValue(VEGETATION_SUBTYPES, value)) return value;
  if (!value) return 'tree';
  if (/(?:palm|frond|fern)/i.test(value)) return 'frond/palm';
  if (/(?:flower|crop|grain|wheat|corn)/i.test(value)) return 'crop/flower';
  if (/(?:dead|bare|snag)/i.test(value)) return 'bare/dead';
  if (/(?:pine|fir|spruce|conifer)/i.test(value)) return 'conifer';
  if (/(?:oak|tree|broadleaf)/i.test(value)) return 'tree';
  if (/(?:shrub|bush|hedge|topiary)/i.test(value)) return 'shrub';
  if (/(?:grass|reed|sedge)/i.test(value)) return 'grass';
  if (/(?:vine|ivy|liana)/i.test(value)) return 'vine';
  if (/(?:cactus|cacti|saguaro|cholla|opuntia)/i.test(value)) return 'cactus';
  if (/(?:succulent|agave)/i.test(value)) return 'succulent';
  if (/(?:fungus|mushroom)/i.test(value)) return 'fungus';
  if (/(?:aquatic|lily|kelp|lotus)/i.test(value)) return 'aquatic';
  return 'custom';
}

function normalizeVegetationIntent(input: AssetIntentV1Input): VegetationIntentV1 | undefined {
  if (input.category !== 'vegetation' && input.vegetation === undefined) return undefined;
  const vegetation = input.vegetation ?? {};
  const subtype = vegetation.subtype ?? inferVegetationSubtype(input.subtype);
  const growthState = vegetation.growthState ?? (subtype === 'bare/dead' ? 'bare' : 'lush');
  const canopyProfile =
    growthState === 'bare'
      ? 'bare/dead'
      : (vegetation.canopyProfile ??
        (subtype === 'conifer'
          ? 'conifer'
          : /topiary/i.test(input.qaProfile ?? '')
            ? 'topiary'
            : 'broadleaf'));
  return {
    subtype,
    growthState,
    canopyProfile,
    standalone: vegetation.standalone ?? true,
    grounded: vegetation.grounded ?? true,
  };
}

function inferVfxSubtype(value: string | undefined): VfxSubtype {
  if (isEnumValue(VFX_SUBTYPES, value)) return value;
  if (!value) return 'billboard';
  if (/(?:beam|laser|ray)/i.test(value)) return 'beam';
  if (/(?:trail|streak)/i.test(value)) return 'trail';
  if (/(?:aura|halo|shield)/i.test(value)) return 'aura';
  if (/(?:portal|rift|gateway)/i.test(value)) return 'portal';
  if (/(?:impact|burst|hit|explosion)/i.test(value)) return 'impact';
  if (/(?:volume|fog|cloud)/i.test(value)) return 'volume-like';
  if (/(?:shader|tsl|procedural)/i.test(value)) return 'runtimeShader';
  return 'billboard';
}

function stableVfxSidecarId(subtype: VfxSubtype): string {
  return `kiln.vfx.${subtype.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.tsl.v1`;
}

function normalizeVfxIntent(input: AssetIntentV1Input): VfxIntentV1 | undefined {
  if (input.category !== 'vfx' && input.vfx === undefined) return undefined;
  const source = input.vfx ?? {};
  const subtype = source.subtype ?? inferVfxSubtype(input.subtype);
  const portability =
    source.portability ??
    (subtype === 'runtimeShader' ||
    input.material?.mode === 'runtimeTsl' ||
    input.capabilities?.includes('runtimeShader')
      ? 'sidecar'
      : 'portable');
  const transparency = source.transparency ?? input.material?.transparency ?? 'blend';
  // THREE.Sprite is Kiln's portable billboard primitive and implements full
  // spherical camera-facing. A Y-axis-only billboard requires an explicit
  // runtime contract; defaulting to it would make the normalized request
  // impossible for the canonical portable export path to satisfy.
  const facingMode =
    source.facing?.mode ?? (subtype === 'billboard' ? 'camera-spherical' : 'fixed');
  const requestedDriver = source.animation?.driver;
  const hasTopLevelClip = (input.animation?.clips.length ?? 0) > 0;
  const playback =
    source.animation?.playback ??
    (requestedDriver === 'clip' || requestedDriver === 'timeUniform' || hasTopLevelClip
      ? input.animation?.loop === false
        ? 'oneShot'
        : 'loop'
      : portability === 'sidecar'
        ? 'loop'
        : 'static');
  const driver =
    source.animation?.driver ??
    (playback === 'static' ? 'none' : portability === 'sidecar' ? 'timeUniform' : 'clip');
  const durationSeconds = source.animation?.durationSeconds ?? (playback === 'static' ? 0 : 1);
  const endpointBehavior =
    source.animation?.endpointBehavior ??
    (playback === 'static' ? 'none' : playback === 'loop' ? 'matchStart' : 'holdLast');
  const sidecar =
    portability === 'sidecar'
      ? {
          kind: 'tsl' as const,
          id: source.sidecar?.id ?? stableVfxSidecarId(subtype),
          version: source.sidecar?.version ?? '1.0.0',
        }
      : undefined;
  return {
    schemaVersion: 1,
    subtype,
    portability,
    transparency,
    doubleSided: source.doubleSided ?? true,
    facing: {
      source: source.facing?.source ?? (source.facing ? 'explicit' : 'inferred'),
      mode: facingMode,
      ...(source.facing?.normalAxis || facingMode !== 'none'
        ? { normalAxis: source.facing?.normalAxis ?? '+X' }
        : {}),
      ...(source.facing?.directionAxis || subtype === 'beam' || subtype === 'trail'
        ? { directionAxis: source.facing?.directionAxis ?? '+X' }
        : {}),
    },
    animation: {
      playback,
      durationSeconds,
      endpointBehavior,
      driver,
      ...(driver === 'clip'
        ? {
            clipName:
              source.animation?.clipName ??
              input.animation?.clips[0] ??
              `${subtype}.${playback === 'loop' ? 'loop' : 'one-shot'}`,
          }
        : {}),
      ...(driver === 'timeUniform'
        ? { timeUniformName: source.animation?.timeUniformName ?? 'kilnTimeSeconds' }
        : {}),
    },
    ...(sidecar ? { sidecar } : {}),
  };
}

function normalizeAssetScope(input: AssetIntentV1Input): AssetScopeIntentV1 {
  const inferred = /(?:^|[-_ ])modular(?:$|[-_ ])/i.test(input.subtype ?? '')
    ? 'modularSet'
    : input.category === 'environment' && /(?:cluster|set[-_ ]?dressing)/i.test(input.subtype ?? '')
      ? 'cluster'
      : 'single';
  return {
    schemaVersion: 1,
    scope: input.scope?.scope ?? inferred,
    explicit: input.scope?.explicit ?? false,
  };
}

function normalizeModularIntent(
  input: AssetIntentV1Input,
  scope: AssetScopeIntentV1,
): ModularIntentV1 | undefined {
  if (scope.scope !== 'modularSet' && input.modular === undefined) return undefined;
  const grid = input.modular?.grid ?? KILN_DEFAULT_MODULAR_GRID;
  return {
    schemaVersion: 1,
    units: 'm',
    grid: [grid[0], grid[1], grid[2]],
  };
}

/**
 * Create and validate closure-owned intent. Arrays are copied so callers cannot
 * mutate the trusted contract after it has entered an agent/tool closure.
 */
export function createAssetIntentV1(input: AssetIntentV1Input): AssetIntentV1 {
  const architecture = normalizeArchitectureIntent(input);
  const character = normalizeCharacterIntent(input);
  const vehicle = normalizeVehicleIntent(input);
  const vegetation = normalizeVegetationIntent(input);
  const vfx = normalizeVfxIntent(input);
  const scope = normalizeAssetScope(input);
  const modular = normalizeModularIntent(input, scope);
  const capabilities = [...(input.capabilities ?? [])];
  if (architecture?.enterable && !capabilities.includes('enterable'))
    capabilities.push('enterable');
  if (architecture?.interiorMode === 'navigable' && !capabilities.includes('navigable'))
    capabilities.push('navigable');
  if (character?.grounded && !capabilities.includes('grounded')) capabilities.push('grounded');
  if (vehicle?.supportPolicy === 'grounded' && !capabilities.includes('grounded')) {
    capabilities.push('grounded');
  }
  if (vegetation?.grounded && !capabilities.includes('grounded')) capabilities.push('grounded');
  if (vfx && vfx.transparency !== 'opaque' && !capabilities.includes('transparentSurface')) {
    capabilities.push('transparentSurface');
  }
  if (vfx?.portability === 'sidecar' && !capabilities.includes('runtimeShader')) {
    capabilities.push('runtimeShader');
  }
  const intent: AssetIntentV1 = {
    schemaVersion: 1,
    category: input.category,
    ...(input.subtype ||
    architecture?.subtype ||
    vehicle?.subtype ||
    character?.bodyPlan ||
    vegetation?.subtype ||
    vfx?.subtype
      ? {
          subtype:
            (input.category === 'vehicle' ? vehicle?.subtype : undefined) ??
            (input.category === 'vegetation' ? vegetation?.subtype : undefined) ??
            (input.category === 'vfx' ? vfx?.subtype : undefined) ??
            input.subtype ??
            architecture?.subtype ??
            character?.bodyPlan,
        }
      : {}),
    scope,
    capabilities,
    ...(input.bounds
      ? {
          bounds: {
            ...(input.bounds.x !== undefined ? { x: input.bounds.x } : {}),
            ...(input.bounds.y !== undefined ? { y: input.bounds.y } : {}),
            ...(input.bounds.z !== undefined ? { z: input.bounds.z } : {}),
            units: 'm',
          },
        }
      : {}),
    frame: KILN_ASSET_FRAME,
    requiredParts: [...(input.requiredParts ?? [])],
    forbiddenExtras: [...(input.forbiddenExtras ?? [])],
    material: {
      mode: input.material?.mode ?? (vfx?.portability === 'sidecar' ? 'runtimeTsl' : 'pbrRecipe'),
      ...(input.material?.recipeId ? { recipeId: input.material.recipeId } : {}),
      ...(input.material?.paletteId ? { paletteId: input.material.paletteId } : {}),
      ...(input.material?.transparency || vfx?.transparency
        ? { transparency: input.material?.transparency ?? vfx?.transparency }
        : {}),
    },
    ...(input.animation
      ? {
          animation: {
            clips: [...input.animation.clips],
            ...(input.animation.locomotionDirection
              ? { locomotionDirection: input.animation.locomotionDirection }
              : {}),
            ...(input.animation.rootMotion ? { rootMotion: input.animation.rootMotion } : {}),
            ...(input.animation.loop !== undefined ? { loop: input.animation.loop } : {}),
            ...(input.animation.gait ? { gait: input.animation.gait } : {}),
          },
        }
      : {}),
    ...(architecture ? { architecture } : {}),
    ...(character ? { character } : {}),
    ...(vehicle ? { vehicle } : {}),
    ...(vegetation ? { vegetation } : {}),
    ...(vfx ? { vfx } : {}),
    ...(modular ? { modular } : {}),
    qaProfile: input.qaProfile ?? `${input.category}.default`,
  };

  const result = validateAssetIntentV1(intent);
  if (!result.valid) {
    const summary = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new TypeError(`Invalid AssetIntentV1: ${summary}`);
  }
  return intent;
}
