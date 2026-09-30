/**
 * Browser-safe, provider-independent portable material recipe contract.
 *
 * Recipes resolve only to core glTF 2.0 metallic-roughness fields. Runtime
 * material construction and approved byte resolution live in sibling modules
 * so capability/SDK/UI consumers can import this file without Three, sharp,
 * filesystem access, or provider credentials.
 */

import {
  PRODUCTION_TEXTURE_RESOURCE_DESCRIPTORS_V1,
  PRODUCTION_TEXTURE_RESOURCE_IDS,
} from './material-texture-library.generated';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

export const MATERIAL_RECIPE_SCHEMA_VERSION = 1 as const;

export const MATERIAL_RECIPE_IDS = [
  'kiln.material.bark.v1',
  'kiln.material.leaf.v1',
  'kiln.material.wood.v1',
  'kiln.material.stone.v1',
  'kiln.material.rubber.v1',
  'kiln.material.painted-metal.v1',
  'kiln.material.cloth.v1',
  'kiln.material.skin.v1',
  'kiln.material.glass.v1',
  'kiln.material.emissive.v1',
] as const;

export type MaterialRecipeId = (typeof MATERIAL_RECIPE_IDS)[number];

export const MATERIAL_RECIPE_OVERRIDE_KEYS = [
  'baseColor',
  'roughness',
  'metalness',
  'opacity',
  'alphaCutoff',
  'doubleSided',
  'emissiveColor',
  'emissiveIntensity',
  'textureResources',
] as const;

export type MaterialRecipeOverrideKey = (typeof MATERIAL_RECIPE_OVERRIDE_KEYS)[number];

export const APPROVED_TEXTURE_RESOURCE_IDS = [
  'kiln.texture.bark-albedo.v1',
  'kiln.texture.leaf-mask-albedo.v1',
  'kiln.texture.neutral-normal.v1',
  'kiln.texture.neutral-metallic-roughness.v1',
  'kiln.texture.emissive-grid.v1',
  ...PRODUCTION_TEXTURE_RESOURCE_IDS,
] as const;

export type ApprovedTextureResourceId = (typeof APPROVED_TEXTURE_RESOURCE_IDS)[number];

export const MATERIAL_TEXTURE_SLOTS = [
  'baseColor',
  'normal',
  'metallicRoughness',
  'emissive',
  'occlusion',
] as const;

export type MaterialTextureSlot = (typeof MATERIAL_TEXTURE_SLOTS)[number];
export type PortableAlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';
export type PortableColorFactor = readonly [number, number, number, number];
export type PortableRgbFactor = readonly [number, number, number];

export interface MaterialRecipeOverridesV1 {
  /** Six-digit sRGB authoring color. */
  baseColor?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  alphaCutoff?: number;
  doubleSided?: boolean;
  emissiveColor?: string;
  /** Finite 0..1, baked into the core glTF emissive factor without an extension. */
  emissiveIntensity?: number;
  textureResources?: Partial<Record<MaterialTextureSlot, ApprovedTextureResourceId>>;
}

export interface MaterialRecipeRequestV1 {
  schemaVersion: 1;
  id: MaterialRecipeId;
  overrides?: MaterialRecipeOverridesV1;
}

export interface PortablePbrRecipeV1 {
  baseColorFactor: PortableColorFactor;
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor: PortableRgbFactor;
  alphaMode: PortableAlphaMode;
  alphaCutoff?: number;
  doubleSided: boolean;
  textureResources: Partial<Record<MaterialTextureSlot, ApprovedTextureResourceId>>;
}

export interface MaterialRecipeDescriptorV1 {
  schemaVersion: 1;
  id: MaterialRecipeId;
  version: 1;
  name: string;
  description: string;
  portable: true;
  gltfMaterialModel: 'pbrMetallicRoughness';
  allowedOverrides: readonly MaterialRecipeOverrideKey[];
  defaults: PortablePbrRecipeV1;
}

/**
 * Where a resource's bytes come from.
 *
 * `embedded` bytes ship inside the engine package. `runtime` bytes do not exist
 * in the tarball at all and are fetched through a host-registered resolver
 * against the pinned `contentHash`. The distinction is what keeps a photographic
 * library off the critical path of a package that is vendored as a tarball and
 * installed into two container images by two package managers.
 */
export type TextureResourceDelivery = 'embedded' | 'runtime';

/**
 * `placeholder` marks a resource that exists to prove a slot binds, not to look
 * like anything — the historical 4x4/2x2 swatches. Only `production` resources
 * are offered to a model, because naming a 4x4 bark swatch to a model that would
 * otherwise call `proceduralTexture()` makes the output worse, not better.
 */
export type TextureResourceQuality = 'placeholder' | 'production';

/** Recorded per resource so a shipped asset can state what it is allowed to be. */
export interface TextureResourceLicenseV1 {
  /** SPDX identifier, or `CC0-1.0` for public-domain scans. */
  spdx: string;
  /** Empty when the licence requires none; never omitted, so silence is a choice. */
  attribution: string;
  source: string;
}

export interface ApprovedTextureResourceDescriptorV1 {
  schemaVersion: 1;
  id: ApprovedTextureResourceId;
  version: 1;
  label: string;
  usage: 'albedo' | 'normal' | 'metallicRoughness' | 'emissive';
  colorSpace: 'srgb' | 'linear';
  mime: 'image/png';
  contentHash: string;
  delivery: TextureResourceDelivery;
  quality: TextureResourceQuality;
  /** Bytes the resolver must return. Checked before hashing so a truncated or
   *  wrong-object response fails on size rather than on an opaque hash mismatch. */
  byteLength: number;
  license: TextureResourceLicenseV1;
  allowedSlots: readonly MaterialTextureSlot[];
  recipeIds: readonly MaterialRecipeId[];
}

export interface MaterialRecipeValidationIssue {
  code:
    | 'EXPECTED_OBJECT'
    | 'UNSUPPORTED_SCHEMA_VERSION'
    | 'UNSUPPORTED_RECIPE_ID'
    | 'INVALID_OVERRIDES'
    | 'UNSUPPORTED_OVERRIDE'
    | 'INVALID_OVERRIDE_VALUE'
    | 'UNKNOWN_TEXTURE_SLOT'
    | 'UNSUPPORTED_RESOURCE_ID'
    | 'RESOURCE_SLOT_MISMATCH'
    | 'RESOURCE_RECIPE_MISMATCH';
  path: string;
  message: string;
}

export interface MaterialRecipeValidationResult {
  valid: boolean;
  value?: MaterialRecipeRequestV1;
  issues: MaterialRecipeValidationIssue[];
}

const srgbChannelToLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const rgba = (hex: string, alpha = 1): PortableColorFactor => {
  const normalized = hex.replace(/^#/, '');
  return Object.freeze([
    srgbChannelToLinear(Number.parseInt(normalized.slice(0, 2), 16) / 255),
    srgbChannelToLinear(Number.parseInt(normalized.slice(2, 4), 16) / 255),
    srgbChannelToLinear(Number.parseInt(normalized.slice(4, 6), 16) / 255),
    alpha,
  ]) as unknown as PortableColorFactor;
};

const rgb = (hex: string, intensity = 1): PortableRgbFactor => {
  const color = rgba(hex);
  return Object.freeze([
    color[0] * intensity,
    color[1] * intensity,
    color[2] * intensity,
  ]) as unknown as PortableRgbFactor;
};

const defaults = (
  baseColor: string,
  roughnessFactor: number,
  metallicFactor = 0,
  over: Partial<PortablePbrRecipeV1> = {},
): PortablePbrRecipeV1 =>
  Object.freeze({
    baseColorFactor: rgba(baseColor),
    metallicFactor,
    roughnessFactor,
    emissiveFactor: Object.freeze([0, 0, 0]) as PortableRgbFactor,
    alphaMode: 'OPAQUE',
    doubleSided: false,
    textureResources: Object.freeze({}),
    ...over,
  });

const commonSurface = Object.freeze([
  'baseColor',
  'roughness',
  'metalness',
  'doubleSided',
  'textureResources',
] satisfies MaterialRecipeOverrideKey[]);

const descriptor = (
  value: Omit<
    MaterialRecipeDescriptorV1,
    'schemaVersion' | 'version' | 'portable' | 'gltfMaterialModel'
  >,
): MaterialRecipeDescriptorV1 =>
  Object.freeze({
    schemaVersion: 1,
    version: 1,
    portable: true,
    gltfMaterialModel: 'pbrMetallicRoughness',
    ...value,
  });

export const MATERIAL_RECIPE_LIBRARY_V1: Readonly<
  Record<MaterialRecipeId, MaterialRecipeDescriptorV1>
> = Object.freeze({
  'kiln.material.bark.v1': descriptor({
    id: 'kiln.material.bark.v1',
    name: 'Bark',
    description: 'Rough, nonmetal tree bark with optional approved albedo and normal resources.',
    allowedOverrides: commonSurface,
    defaults: defaults('#6b4426', 0.93),
  }),
  'kiln.material.leaf.v1': descriptor({
    id: 'kiln.material.leaf.v1',
    name: 'Leaf',
    description: 'Alpha-tested, double-sided foliage using glTF MASK rather than blending.',
    allowedOverrides: Object.freeze([
      'baseColor',
      'roughness',
      'alphaCutoff',
      'doubleSided',
      'textureResources',
    ]),
    defaults: defaults('#3f7f3a', 0.86, 0, {
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
      doubleSided: true,
    }),
  }),
  'kiln.material.wood.v1': descriptor({
    id: 'kiln.material.wood.v1',
    name: 'Wood',
    description: 'Portable nonmetal wood with a warm authored base color.',
    allowedOverrides: commonSurface,
    defaults: defaults('#9a6a3a', 0.78),
  }),
  'kiln.material.stone.v1': descriptor({
    id: 'kiln.material.stone.v1',
    name: 'Stone',
    description: 'Dry rough stone with no runtime shader dependency.',
    allowedOverrides: commonSurface,
    defaults: defaults('#7d7a74', 0.95),
  }),
  'kiln.material.rubber.v1': descriptor({
    id: 'kiln.material.rubber.v1',
    name: 'Rubber',
    description: 'Dark, high-roughness rubber for tires, grips, and seals.',
    allowedOverrides: commonSurface,
    defaults: defaults('#202124', 0.88),
  }),
  'kiln.material.painted-metal.v1': descriptor({
    id: 'kiln.material.painted-metal.v1',
    name: 'Painted metal',
    description: 'Coated metal with restrained metallic response and a durable painted finish.',
    allowedOverrides: commonSurface,
    defaults: defaults('#b33a32', 0.38, 0.18),
  }),
  'kiln.material.cloth.v1': descriptor({
    id: 'kiln.material.cloth.v1',
    name: 'Cloth',
    description: 'Very rough, nonmetal woven cloth represented with core glTF PBR.',
    allowedOverrides: commonSurface,
    defaults: defaults('#6f7583', 1),
  }),
  'kiln.material.skin.v1': descriptor({
    id: 'kiln.material.skin.v1',
    name: 'Skin',
    description: 'Portable skin baseline without nonstandard subsurface extensions.',
    allowedOverrides: Object.freeze(['baseColor', 'roughness', 'doubleSided']),
    defaults: defaults('#b87962', 0.62),
  }),
  'kiln.material.glass.v1': descriptor({
    id: 'kiln.material.glass.v1',
    name: 'Glass',
    description: 'Portable alpha-blended glass fallback using core glTF fields only.',
    allowedOverrides: Object.freeze(['baseColor', 'roughness', 'opacity', 'doubleSided']),
    defaults: defaults('#a9d8e8', 0.12, 0, {
      baseColorFactor: rgba('#a9d8e8', 0.32),
      alphaMode: 'BLEND',
      doubleSided: true,
    }),
  }),
  'kiln.material.emissive.v1': descriptor({
    id: 'kiln.material.emissive.v1',
    name: 'Emissive',
    description: 'Core glTF emissive material with intensity baked into emissiveFactor.',
    allowedOverrides: Object.freeze([
      'baseColor',
      'roughness',
      'doubleSided',
      'emissiveColor',
      'emissiveIntensity',
      'textureResources',
    ]),
    defaults: defaults('#3a2410', 0.5, 0, {
      emissiveFactor: rgb('#ff8a22', 1),
    }),
  }),
});

export const APPROVED_TEXTURE_RESOURCES_V1: Readonly<
  Record<ApprovedTextureResourceId, ApprovedTextureResourceDescriptorV1>
> = Object.freeze({
  'kiln.texture.bark-albedo.v1': Object.freeze({
    schemaVersion: 1,
    id: 'kiln.texture.bark-albedo.v1',
    version: 1,
    label: 'Bark albedo reference',
    usage: 'albedo',
    colorSpace: 'srgb',
    mime: 'image/png',
    contentHash: 'ec74fd42fe317f578018a13a65d81a726e9baeade068ae016cff30c15507017f',
    delivery: 'embedded',
    quality: 'placeholder',
    byteLength: 100,
    license: Object.freeze({
      spdx: 'CC0-1.0',
      attribution: '',
      source: 'authored in-repo',
    }),
    allowedSlots: Object.freeze(['baseColor'] as const),
    recipeIds: Object.freeze(['kiln.material.bark.v1', 'kiln.material.wood.v1'] as const),
  }),
  'kiln.texture.leaf-mask-albedo.v1': Object.freeze({
    schemaVersion: 1,
    id: 'kiln.texture.leaf-mask-albedo.v1',
    version: 1,
    label: 'Leaf alpha-mask albedo reference',
    usage: 'albedo',
    colorSpace: 'srgb',
    mime: 'image/png',
    contentHash: 'ae9ad7f5389529a42fd9e63cb16aa7dc2c803739953242422b0ccc8003bd827c',
    delivery: 'embedded',
    quality: 'placeholder',
    byteLength: 119,
    license: Object.freeze({
      spdx: 'CC0-1.0',
      attribution: '',
      source: 'authored in-repo',
    }),
    allowedSlots: Object.freeze(['baseColor'] as const),
    recipeIds: Object.freeze(['kiln.material.leaf.v1'] as const),
  }),
  'kiln.texture.neutral-normal.v1': Object.freeze({
    schemaVersion: 1,
    id: 'kiln.texture.neutral-normal.v1',
    version: 1,
    label: 'Neutral tangent-space normal',
    usage: 'normal',
    colorSpace: 'linear',
    mime: 'image/png',
    contentHash: '2be025139faed13fb12ac50101f7d91f8a758ce6a668104a7e8003eccdab7db7',
    delivery: 'embedded',
    quality: 'placeholder',
    byteLength: 95,
    license: Object.freeze({
      spdx: 'CC0-1.0',
      attribution: '',
      source: 'authored in-repo',
    }),
    allowedSlots: Object.freeze(['normal'] as const),
    recipeIds: Object.freeze([
      'kiln.material.bark.v1',
      'kiln.material.wood.v1',
      'kiln.material.stone.v1',
      'kiln.material.rubber.v1',
      'kiln.material.painted-metal.v1',
      'kiln.material.cloth.v1',
    ] as const),
  }),
  'kiln.texture.neutral-metallic-roughness.v1': Object.freeze({
    schemaVersion: 1,
    id: 'kiln.texture.neutral-metallic-roughness.v1',
    version: 1,
    label: 'Packed roughness-metalness reference',
    usage: 'metallicRoughness',
    colorSpace: 'linear',
    mime: 'image/png',
    contentHash: '5e03d1e2863800c5f1a88411dd4447ccc0ec8470232129d8682db8f6ea76ad52',
    delivery: 'embedded',
    quality: 'placeholder',
    byteLength: 94,
    license: Object.freeze({
      spdx: 'CC0-1.0',
      attribution: '',
      source: 'authored in-repo',
    }),
    allowedSlots: Object.freeze(['metallicRoughness'] as const),
    recipeIds: Object.freeze([
      'kiln.material.rubber.v1',
      'kiln.material.painted-metal.v1',
    ] as const),
  }),
  'kiln.texture.emissive-grid.v1': Object.freeze({
    schemaVersion: 1,
    id: 'kiln.texture.emissive-grid.v1',
    version: 1,
    label: 'Emissive grid reference',
    usage: 'emissive',
    colorSpace: 'srgb',
    mime: 'image/png',
    contentHash: 'a0b2f4e243ec0ec914b80d4998cf4624ff68181aafc4b97a6bafa765a41e4814',
    delivery: 'embedded',
    quality: 'placeholder',
    byteLength: 100,
    license: Object.freeze({
      spdx: 'CC0-1.0',
      attribution: '',
      source: 'authored in-repo',
    }),
    allowedSlots: Object.freeze(['emissive'] as const),
    recipeIds: Object.freeze(['kiln.material.emissive.v1'] as const),
  }),
  ...PRODUCTION_TEXTURE_RESOURCE_DESCRIPTORS_V1,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recipeId = (value: unknown): value is MaterialRecipeId =>
  typeof value === 'string' && (MATERIAL_RECIPE_IDS as readonly string[]).includes(value);

const resourceId = (value: unknown): value is ApprovedTextureResourceId =>
  typeof value === 'string' && (APPROVED_TEXTURE_RESOURCE_IDS as readonly string[]).includes(value);

const finiteUnit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const hexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

export function validateMaterialRecipeRequestV1(value: unknown): MaterialRecipeValidationResult {
  const issues: MaterialRecipeValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ code: 'EXPECTED_OBJECT', path: '', message: 'materialRecipe must be an object.' }],
    };
  }
  if (value.schemaVersion !== 1) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: 'materialRecipe.schemaVersion must be 1.',
    });
  }
  if (!recipeId(value.id)) {
    issues.push({
      code: 'UNSUPPORTED_RECIPE_ID',
      path: 'id',
      message: `Unsupported material recipe ID ${JSON.stringify(value.id)}. Listed IDs: ${MATERIAL_RECIPE_IDS.join(', ')}.`,
    });
  }
  if (value.overrides !== undefined && !isRecord(value.overrides)) {
    issues.push({
      code: 'INVALID_OVERRIDES',
      path: 'overrides',
      message: 'materialRecipe.overrides must be an object.',
    });
  }
  if (recipeId(value.id) && isRecord(value.overrides)) {
    const allowed = new Set(MATERIAL_RECIPE_LIBRARY_V1[value.id].allowedOverrides);
    for (const [key, override] of Object.entries(value.overrides)) {
      if (!(MATERIAL_RECIPE_OVERRIDE_KEYS as readonly string[]).includes(key)) {
        issues.push({
          code: 'UNSUPPORTED_OVERRIDE',
          path: `overrides.${key}`,
          message: `Unknown material recipe override ${JSON.stringify(key)}; ${value.id} accepts ${[...allowed].join(', ')}.`,
        });
        continue;
      }
      if (!allowed.has(key as MaterialRecipeOverrideKey)) {
        issues.push({
          code: 'UNSUPPORTED_OVERRIDE',
          path: `overrides.${key}`,
          message: `${key} is not supported by ${value.id}; it accepts ${[...allowed].join(', ')}.`,
        });
        continue;
      }
      if ((key === 'baseColor' || key === 'emissiveColor') && !hexColor(override)) {
        issues.push({
          code: 'INVALID_OVERRIDE_VALUE',
          path: `overrides.${key}`,
          message: `${key} must be a six-digit #RRGGBB color.`,
        });
      } else if (
        (key === 'roughness' ||
          key === 'metalness' ||
          key === 'opacity' ||
          key === 'alphaCutoff') &&
        !finiteUnit(override)
      ) {
        issues.push({
          code: 'INVALID_OVERRIDE_VALUE',
          path: `overrides.${key}`,
          message: `${key} must be a finite number in [0,1].`,
        });
      } else if (key === 'doubleSided' && typeof override !== 'boolean') {
        issues.push({
          code: 'INVALID_OVERRIDE_VALUE',
          path: `overrides.${key}`,
          message: 'doubleSided must be boolean.',
        });
      } else if (
        key === 'emissiveIntensity' &&
        (typeof override !== 'number' || !Number.isFinite(override) || override < 0 || override > 1)
      ) {
        issues.push({
          code: 'INVALID_OVERRIDE_VALUE',
          path: `overrides.${key}`,
          message: 'emissiveIntensity must be a finite number in [0,1] for core glTF.',
        });
      } else if (key === 'textureResources') {
        if (!isRecord(override)) {
          issues.push({
            code: 'INVALID_OVERRIDE_VALUE',
            path: 'overrides.textureResources',
            message: 'textureResources must be an object keyed by portable material slot.',
          });
          continue;
        }
        for (const [slot, selected] of Object.entries(override)) {
          if (!(MATERIAL_TEXTURE_SLOTS as readonly string[]).includes(slot)) {
            issues.push({
              code: 'UNKNOWN_TEXTURE_SLOT',
              path: `overrides.textureResources.${slot}`,
              message: `Unknown portable texture slot ${JSON.stringify(slot)}.`,
            });
            continue;
          }
          if (!resourceId(selected)) {
            issues.push({
              code: 'UNSUPPORTED_RESOURCE_ID',
              path: `overrides.textureResources.${slot}`,
              message: `Unsupported approved texture resource ID ${JSON.stringify(selected)}.`,
            });
            continue;
          }
          const resource = APPROVED_TEXTURE_RESOURCES_V1[selected];
          if (!resource.allowedSlots.includes(slot as MaterialTextureSlot)) {
            issues.push({
              code: 'RESOURCE_SLOT_MISMATCH',
              path: `overrides.textureResources.${slot}`,
              message: `${selected} cannot be used in ${slot}.`,
            });
          }
          if (!resource.recipeIds.includes(value.id)) {
            issues.push({
              code: 'RESOURCE_RECIPE_MISMATCH',
              path: `overrides.textureResources.${slot}`,
              message: `${selected} is not approved for ${value.id}.`,
            });
          }
        }
      }
    }
  }

  if (issues.length > 0) return { valid: false, issues };
  return {
    valid: true,
    value: cloneMaterialRecipeRequestV1(value as unknown as MaterialRecipeRequestV1),
    issues,
  };
}

export function cloneMaterialRecipeRequestV1(
  value: MaterialRecipeRequestV1,
): MaterialRecipeRequestV1 {
  return {
    schemaVersion: 1,
    id: value.id,
    ...(value.overrides
      ? {
          overrides: {
            ...value.overrides,
            ...(value.overrides.textureResources
              ? { textureResources: { ...value.overrides.textureResources } }
              : {}),
          },
        }
      : {}),
  };
}

function recipeValidationError(issues: MaterialRecipeValidationIssue[]): Error {
  const message = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  const fractionFields = ['roughness', 'metalness', 'opacity', 'alphaCutoff', 'emissiveIntensity'];
  if (
    issues.some(
      (issue) =>
        issue.code === 'INVALID_OVERRIDE_VALUE' &&
        fractionFields.some((field) => issue.path === `overrides.${field}`),
    )
  )
    return new AuthoringDiagnosticError('MATERIAL_FRACTION_RANGE', message);
  if (
    issues.some(
      (issue) =>
        [
          'UNKNOWN_TEXTURE_SLOT',
          'UNSUPPORTED_RESOURCE_ID',
          'RESOURCE_SLOT_MISMATCH',
          'RESOURCE_RECIPE_MISMATCH',
        ].includes(issue.code) ||
        (issue.code === 'INVALID_OVERRIDE_VALUE' && issue.path === 'overrides.textureResources'),
    )
  )
    return new AuthoringDiagnosticError('MATERIAL_RECIPE_TEXTURE_BINDING', message);
  if (
    issues.some((issue) =>
      [
        'UNSUPPORTED_RECIPE_ID',
        'UNSUPPORTED_OVERRIDE',
        'INVALID_OVERRIDES',
        'UNSUPPORTED_SCHEMA_VERSION',
      ].includes(issue.code),
    )
  )
    return new AuthoringDiagnosticError('MATERIAL_RECIPE_OVERRIDE', message);
  return new TypeError(message);
}

export function createMaterialRecipeRequestV1(
  id: MaterialRecipeId,
  overrides?: MaterialRecipeOverridesV1,
): MaterialRecipeRequestV1 {
  const candidate = { schemaVersion: 1 as const, id, ...(overrides ? { overrides } : {}) };
  const result = validateMaterialRecipeRequestV1(candidate);
  if (!result.valid || !result.value) {
    throw recipeValidationError(result.issues);
  }
  return result.value;
}

export function resolveMaterialRecipeV1(value: MaterialRecipeRequestV1): PortablePbrRecipeV1 {
  const validation = validateMaterialRecipeRequestV1(value);
  if (!validation.valid || !validation.value) {
    throw recipeValidationError(validation.issues);
  }
  const recipe = MATERIAL_RECIPE_LIBRARY_V1[validation.value.id];
  const over = validation.value.overrides ?? {};
  const baseAlpha = over.opacity ?? recipe.defaults.baseColorFactor[3];
  const baseColorFactor = over.baseColor
    ? rgba(over.baseColor, baseAlpha)
    : (Object.freeze([
        recipe.defaults.baseColorFactor[0],
        recipe.defaults.baseColorFactor[1],
        recipe.defaults.baseColorFactor[2],
        baseAlpha,
      ]) as PortableColorFactor);
  const emissiveIntensity = over.emissiveIntensity;
  const emissiveFactor = over.emissiveColor
    ? rgb(over.emissiveColor, over.emissiveIntensity ?? 1)
    : emissiveIntensity !== undefined
      ? (Object.freeze(
          recipe.defaults.emissiveFactor.map((component) => component * emissiveIntensity),
        ) as unknown as PortableRgbFactor)
      : recipe.defaults.emissiveFactor;
  return Object.freeze({
    baseColorFactor,
    metallicFactor: over.metalness ?? recipe.defaults.metallicFactor,
    roughnessFactor: over.roughness ?? recipe.defaults.roughnessFactor,
    emissiveFactor,
    alphaMode: recipe.defaults.alphaMode,
    ...(recipe.defaults.alphaMode === 'MASK'
      ? { alphaCutoff: over.alphaCutoff ?? recipe.defaults.alphaCutoff ?? 0.5 }
      : {}),
    doubleSided: over.doubleSided ?? recipe.defaults.doubleSided,
    textureResources: Object.freeze({
      ...recipe.defaults.textureResources,
      ...(over.textureResources ?? {}),
    }),
  });
}

export function listMaterialRecipeCapabilitiesV1(): {
  schemaVersion: 1;
  requestShape: string;
  recipes: MaterialRecipeDescriptorV1[];
  resources: ApprovedTextureResourceDescriptorV1[];
} {
  return {
    schemaVersion: 1,
    requestShape: 'materialRecipe: { schemaVersion: 1, id, overrides? }',
    recipes: MATERIAL_RECIPE_IDS.map((id) => MATERIAL_RECIPE_LIBRARY_V1[id]),
    resources: APPROVED_TEXTURE_RESOURCE_IDS.map((id) => APPROVED_TEXTURE_RESOURCES_V1[id]),
  };
}

/** Stable JSON-ready snapshot used by engine, SDK, MCP, Studio, and starter parity tests. */
export function materialRecipeSnapshotV1(): Array<{
  id: MaterialRecipeId;
  name: string;
  allowedOverrides: readonly MaterialRecipeOverrideKey[];
  defaults: PortablePbrRecipeV1;
}> {
  return MATERIAL_RECIPE_IDS.map((id) => {
    const recipe = MATERIAL_RECIPE_LIBRARY_V1[id];
    return {
      id,
      name: recipe.name,
      allowedOverrides: recipe.allowedOverrides,
      defaults: recipe.defaults,
    };
  });
}
