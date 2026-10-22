/** Small offline starting points. These are editable recipes, not measured scan materials. */
import { z } from 'zod';
import {
  assertMaterialJson,
  materialLibraryIdSchema,
  materialSourceSchema,
  type ProceduralMaterialDraftV2,
} from './material-library';
import type { MaterialDraftV1 } from './material-library-node';
import type { ProceduralLayer, ProceduralTextureSpecV2 } from './procedural-material-v2';

const catalog = [
  {
    id: 'warm-brick',
    name: 'Warm brick and mortar',
    family: 'architecture',
    physicalSizeMeters: { width: 2, height: 2 },
    description: 'Staggered masonry with warm clay variation and shallow mortar relief.',
  },
  {
    id: 'wood-grain',
    name: 'Warm straight wood grain',
    family: 'wood',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Directional grain for props and interior timber; no scanned knots or end grain.',
  },
  {
    id: 'brushed-metal',
    name: 'Brushed neutral metal',
    family: 'metal',
    physicalSizeMeters: { width: 1, height: 1 },
    description:
      'Fine directional relief and varied roughness, with a fully metallic packed channel.',
  },
  {
    id: 'woven-fabric',
    name: 'Neutral woven fabric',
    family: 'fabric',
    physicalSizeMeters: { width: 0.5, height: 0.5 },
    description:
      'Crossed threads with a matte dielectric response; no cloth simulation or anisotropy.',
  },
  {
    id: 'coarse-soil',
    name: 'Coarse brown soil',
    family: 'ground',
    physicalSizeMeters: { width: 2, height: 2 },
    description: 'Layered granular soil variation and subtle relief for terrain and planting beds.',
  },
  {
    id: 'beach-sand',
    name: 'Pale beach sand',
    family: 'ground',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Fine pale grains with shallow wind ripples; no shells, wet edge or footprints.',
  },
  {
    id: 'coral-limestone',
    name: 'Dry coral limestone',
    family: 'rock',
    physicalSizeMeters: { width: 2, height: 2 },
    description: 'Porous cream stone with pitted relief for coastal rocks and walls.',
  },
  {
    id: 'coral-limestone-wet',
    name: 'Wet coral limestone',
    family: 'rock',
    physicalSizeMeters: { width: 2, height: 2 },
    description:
      'The dry limestone darkened and smoothed by water; the same seed keeps identical relief.',
  },
  {
    id: 'palm-frond',
    name: 'Palm frond cutout',
    family: 'foliage',
    physicalSizeMeters: { width: 2, height: 2 },
    description:
      'Alpha-tested, double-sided frond card: a central rachis with tapering leaflets, base at the image bottom. Not tileable.',
  },
  {
    id: 'driftwood',
    name: 'Weathered driftwood',
    family: 'wood',
    physicalSizeMeters: { width: 1, height: 1 },
    description:
      'Sun-bleached silver-grey grain with deep weathered relief and a dry matte finish.',
  },
  {
    id: 'thatch',
    name: 'Straw thatch',
    family: 'fiber',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Vertical straw strands in horizontal courses for roofs and shelters.',
  },
  {
    id: 'lime-plaster',
    name: 'Lime plaster',
    family: 'architecture',
    physicalSizeMeters: { width: 2, height: 2 },
    description: 'Soft off-white lime render with trowel clouding and fine sand relief.',
  },
  {
    id: 'oak',
    name: 'Honey oak',
    family: 'wood',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Tight straight grain with open pores for furniture and floors; no knots or rays.',
  },
  {
    id: 'linen',
    name: 'Natural linen',
    family: 'fabric',
    physicalSizeMeters: { width: 0.5, height: 0.5 },
    description: 'Fine flax weave with occasional slubs; matte dielectric, no drape or sheen.',
  },
  {
    id: 'jute',
    name: 'Coarse jute weave',
    family: 'fiber',
    physicalSizeMeters: { width: 0.5, height: 0.5 },
    description: 'Open basket weave of twisted fibre for rugs, sacking and wrapped handles.',
  },
  {
    id: 'basalt',
    name: 'Dark basalt',
    family: 'rock',
    physicalSizeMeters: { width: 2, height: 2 },
    description: 'Fine-grained volcanic stone with subtle vesicles and a dry finish.',
  },
  {
    id: 'terracotta',
    name: 'Unglazed terracotta',
    family: 'architecture',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Warm fired clay with soft mottling for pots, tiles and planters; no glaze.',
  },
  {
    id: 'wicker',
    name: 'Woven wicker',
    family: 'fiber',
    physicalSizeMeters: { width: 0.5, height: 0.5 },
    description: 'Rattan strands passing over and under for chairs, baskets and screens.',
  },
  {
    id: 'brushed-brass',
    name: 'Brushed brass',
    family: 'metal',
    physicalSizeMeters: { width: 1, height: 1 },
    description: 'Warm yellow brass with fine directional brushing and a fully metallic channel.',
  },
] as const;
/** Presets whose output needs a schemaVersion 2 record (here, a V3 RGBA cutout). */
const RECORD_V2_PRESETS: ReadonlySet<string> = new Set(['palm-frond']);
export const materialPresetOptionsSchema = z
  .object({
    seed: z.number().int().min(-2147483648).max(2147483647),
    size: z.union([z.literal(64), z.literal(128), z.literal(256), z.literal(512)]).default(256),
    creator: z.string().min(1).max(1000),
    license: materialSourceSchema.shape.license,
    materialId: materialLibraryIdSchema.optional(),
  })
  .strict();
export type MaterialPresetOptions = z.input<typeof materialPresetOptionsSchema>;
export interface MaterialPresetSummary {
  id: string;
  name: string;
  family: string;
  physicalSizeMeters: { width: number; height: number };
  description: string;
  tags: string[];
  recipeVersion: number;
  /** Material record version `create-preset` saves: 2 when the preset needs RGBA alpha. */
  recordSchemaVersion: 1 | 2;
}
export type MaterialPresetDraft = MaterialDraftV1 | ProceduralMaterialDraftV2;
export function listMaterialPresets(): MaterialPresetSummary[] {
  return catalog.map((item) => ({
    ...item,
    physicalSizeMeters: { ...item.physicalSizeMeters },
    tags: [item.family, 'procedural'],
    recipeVersion: 1,
    recordSchemaVersion: RECORD_V2_PRESETS.has(item.id) ? 2 : 1,
  }));
}
/** A preset draft for `createMaterialRecordV1`. Presets that need a V2 record are refused. */
export function createMaterialPresetDraft(
  presetId: string,
  raw: MaterialPresetOptions,
): MaterialDraftV1 {
  if (RECORD_V2_PRESETS.has(presetId))
    throw new Error(
      `${presetId} creates a schemaVersion 2 record; use createMaterialPresetDraftAny with createMaterialRecordV2.`,
    );
  return createMaterialPresetDraftAny(presetId, raw) as MaterialDraftV1;
}
/** Any preset's draft: schemaVersion 2 drafts go to `createMaterialRecordV2`, others to V1. */
export function createMaterialPresetDraftAny(
  presetId: string,
  raw: MaterialPresetOptions,
): MaterialPresetDraft {
  assertMaterialJson(raw);
  const options = materialPresetOptionsSchema.parse(raw);
  const preset = catalog.find((item) => item.id === presetId);
  if (!preset) throw new Error('Unknown material preset');
  const noise = (colorA: number, colorB: number, scale = 8, opacity = 1): ProceduralLayer => ({
    op: 'noise',
    colorA,
    colorB,
    scale,
    octaves: 3,
    seed: options.seed,
    opacity,
  });
  const stripes = (
    colorA: number,
    colorB: number,
    count: number,
    angleDeg = 0,
    opacity = 1,
  ): ProceduralLayer => ({
    op: 'stripes',
    colorA,
    colorB,
    count: Math.min(count, options.size / 4),
    angleDeg,
    opacity,
  });
  let color: ProceduralLayer[];
  let height: ProceduralLayer[];
  let roughnessLow = 180;
  let roughnessHigh = 235;
  let strength = 2;
  if (presetId === 'warm-brick') {
    const brick = (brick: number, mortar: number): ProceduralLayer => ({
      op: 'bricks',
      brick,
      mortar,
      rows: 12,
      cols: 4,
      mortarWidth: 0.07,
      stagger: 0.5,
    });
    color = [brick(0xa75c42, 0xb4aa96), noise(0x50392c, 0xeac09a, 16, 0.2)];
    height = [brick(0xb0b0b0, 0x404040), noise(0x303030, 0xd0d0d0, 16, 0.12)];
    strength = 3;
  } else if (presetId === 'wood-grain') {
    color = [noise(0x755137, 0xbc9460, 4), stripes(0x68452f, 0xcaa576, 40, 0, 0.3)];
    height = [noise(0x666666, 0x999999, 4), stripes(0x666666, 0xaaaaaa, 40, 0, 0.25)];
    roughnessLow = 130;
    roughnessHigh = 190;
    strength = 1.5;
  } else if (presetId === 'brushed-metal') {
    color = [noise(0xa7abad, 0xbcc0c2, 4), stripes(0x999c9e, 0xc4c7c9, 64, 0, 0.1)];
    height = [noise(0x707070, 0x909090, 8), stripes(0x666666, 0x999999, 64, 0, 0.3)];
    roughnessLow = 80;
    roughnessHigh = 130;
    strength = 1;
  } else if (presetId === 'woven-fabric') {
    color = [
      noise(0xa49a87, 0xbeb49f, 8),
      stripes(0x968c79, 0xd0c7b1, 32, 0, 0.3),
      stripes(0x968c79, 0xd0c7b1, 32, 90, 0.3),
    ];
    height = [
      noise(0x606060, 0x999999, 8),
      stripes(0x333333, 0xcccccc, 32, 0, 0.4),
      stripes(0x333333, 0xcccccc, 32, 90, 0.4),
    ];
    strength = 1;
  } else if (presetId === 'beach-sand') {
    color = [noise(0xcfb98f, 0xeadbb6, 32), noise(0xa8916a, 0xf6ecd4, 64, 0.25)];
    height = [noise(0x707070, 0x909090, 32), stripes(0x6c6c6c, 0x949494, 12, 15, 0.35)];
    roughnessLow = 215;
    roughnessHigh = 245;
    strength = 1.5;
  } else if (presetId === 'coral-limestone' || presetId === 'coral-limestone-wet') {
    // Both variants share the pitted height, so one seed gives identical relief wet or dry.
    height = [noise(0x606060, 0xa0a0a0, 8), noise(0x303030, 0xd0d0d0, 32, 0.6)];
    strength = 3;
    if (presetId === 'coral-limestone') {
      color = [noise(0xc9bea4, 0xe9e1cd, 8), noise(0x8a806b, 0xd9d0bb, 32, 0.3)];
      roughnessLow = 200;
      roughnessHigh = 240;
    } else {
      color = [noise(0x6f6553, 0x8f8670, 8), noise(0x4a4337, 0x7d7461, 32, 0.3)];
      roughnessLow = 70;
      roughnessHigh = 130;
    }
  } else if (presetId === 'palm-frond') {
    color = [];
    height = [noise(0x707070, 0x909090, 16), stripes(0x6a6a6a, 0x969696, 24, 45, 0.4)];
    roughnessLow = 140;
    roughnessHigh = 190;
    strength = 1;
  } else if (presetId === 'driftwood') {
    color = [noise(0x8b8376, 0xc9c1b2, 4), stripes(0x756d61, 0xd2cabb, 48, 0, 0.35)];
    height = [noise(0x5a5a5a, 0xa5a5a5, 4), stripes(0x404040, 0xc0c0c0, 48, 0, 0.45)];
    roughnessLow = 200;
    roughnessHigh = 245;
    strength = 2.5;
  } else if (presetId === 'thatch') {
    color = [
      stripes(0xa1843f, 0xd6bb7a, 64, 90),
      noise(0x6e5a32, 0xc8a868, 16, 0.35),
      stripes(0x5f4c27, 0xb89c5c, 8, 0, 0.25),
    ];
    height = [stripes(0x404040, 0xc0c0c0, 64, 90), stripes(0x505050, 0xb0b0b0, 8, 0, 0.4)];
    roughnessLow = 220;
    roughnessHigh = 250;
    strength = 2.5;
  } else if (presetId === 'lime-plaster') {
    color = [noise(0xd9d2c3, 0xeee9dd, 4), noise(0xb8ae9b, 0xf4f0e6, 32, 0.25)];
    height = [noise(0x707070, 0x909090, 4), noise(0x505050, 0xb0b0b0, 32, 0.3)];
    roughnessLow = 205;
    roughnessHigh = 240;
    strength = 1.5;
  } else if (presetId === 'oak') {
    color = [
      noise(0x8a6236, 0xb88d57, 4),
      stripes(0x7a5530, 0xc09460, 56, 0, 0.35),
      noise(0x5e4126, 0xa77d4a, 32, 0.15),
    ];
    height = [noise(0x666666, 0x999999, 4), stripes(0x5a5a5a, 0xa8a8a8, 56, 0, 0.35)];
    roughnessLow = 140;
    roughnessHigh = 200;
    strength = 1.8;
  } else if (presetId === 'linen') {
    color = [
      noise(0xc9bea8, 0xddd4c1, 8),
      stripes(0xb8ac94, 0xe4dccb, 48, 0, 0.25),
      stripes(0xb8ac94, 0xe4dccb, 48, 90, 0.25),
      noise(0xa89c84, 0xf0e9da, 64, 0.15),
    ];
    height = [
      noise(0x606060, 0x999999, 8),
      stripes(0x404040, 0xc0c0c0, 48, 0, 0.35),
      stripes(0x404040, 0xc0c0c0, 48, 90, 0.35),
    ];
    roughnessLow = 200;
    roughnessHigh = 235;
    strength = 1;
  } else if (presetId === 'jute' || presetId === 'wicker') {
    // Basket weaves: few thick strands crossing, jute rough and fibrous, wicker smoother.
    const jute = presetId === 'jute';
    const count = jute ? 16 : 24;
    color = jute
      ? [
          noise(0x9c7e4f, 0xbf9f68, 8),
          stripes(0x7d6238, 0xc8a873, count, 0, 0.4),
          stripes(0x7d6238, 0xc8a873, count, 90, 0.4),
        ]
      : [
          stripes(0xa98450, 0xd8b67c, count, 0),
          stripes(0x8e6a3c, 0xcfa96c, count, 90, 0.5),
          noise(0x6f5330, 0xc39d62, 16, 0.2),
        ];
    height = [
      stripes(0x404040, 0xc0c0c0, count, 0),
      stripes(0x404040, 0xc0c0c0, count, 90, 0.5),
      noise(0x606060, 0xa0a0a0, 16, jute ? 0.35 : 0.15),
    ];
    roughnessLow = jute ? 225 : 170;
    roughnessHigh = jute ? 250 : 215;
    strength = 2.5;
  } else if (presetId === 'basalt') {
    color = [noise(0x2e2f31, 0x4a4b4d, 8), noise(0x1d1e20, 0x5c5d60, 32, 0.3)];
    height = [noise(0x606060, 0xa0a0a0, 8), noise(0x404040, 0xc0c0c0, 32, 0.4)];
    roughnessLow = 160;
    roughnessHigh = 220;
    strength = 2.5;
  } else if (presetId === 'terracotta') {
    color = [noise(0xa65a3a, 0xc2734d, 8), noise(0x8a4a30, 0xd99a73, 32, 0.2)];
    height = [noise(0x505050, 0xb0b0b0, 8), noise(0x404040, 0xc0c0c0, 32, 0.35)];
    roughnessLow = 190;
    roughnessHigh = 235;
    strength = 2;
  } else if (presetId === 'brushed-brass') {
    color = [noise(0xb08d4c, 0xc9a862, 4), stripes(0xa07f42, 0xd4b46e, 64, 0, 0.12)];
    height = [noise(0x707070, 0x909090, 8), stripes(0x666666, 0x999999, 64, 0, 0.3)];
    roughnessLow = 70;
    roughnessHigh = 120;
    strength = 1;
  } else {
    color = [noise(0x4d3c2c, 0x887354, 4), noise(0x342a20, 0xa58f6b, 32, 0.25)];
    height = [noise(0x555555, 0xaaaaaa, 8), noise(0x222222, 0xdddddd, 32, 0.3)];
    strength = 1.5;
  }
  const spec = (
    usage: ProceduralTextureSpecV2['usage'],
    layers: ProceduralLayer[],
  ): ProceduralTextureSpecV2 => ({ schemaVersion: 2, size: options.size, usage, layers });
  const metallic = preset.family === 'metal' ? 255 : 0;
  const packed = (roughness: number) => (255 << 16) | (roughness << 8) | metallic;
  const common = {
    sourceId: 'preset',
    transforms: [
      {
        operation: 'preset',
        tool: 'kiln.material-presets',
        version: '1',
        parameters: { presetId, seed: options.seed },
      },
    ],
  };
  const identity = {
    materialId: options.materialId ?? preset.id,
    name: preset.name,
    tags: [preset.family, 'procedural'],
    physicalSizeMeters: { ...preset.physicalSizeMeters },
    sources: [
      {
        id: 'preset',
        kind: 'procedural' as const,
        provider: 'Kiln material presets v1',
        creator: options.creator,
        assetId: preset.id,
        license: options.license,
        originalFiles: [],
      },
    ],
  };
  const derive = { kind: 'normal-from-height' as const, strength };
  const roughnessMap = spec('metallicRoughness', [
    noise(packed(roughnessLow), packed(roughnessHigh), 8),
  ]);
  if (presetId === 'palm-frond') {
    const sampler = {
      minFilter: 'linear-mipmap-linear',
      magFilter: 'linear',
      wrapS: 'clamp-to-edge',
      wrapT: 'clamp-to-edge',
    } as const;
    return {
      schemaVersion: 2,
      ...identity,
      tileable: false,
      parameters: {
        metalness: 1,
        roughness: 1,
        alphaMode: 'mask',
        alphaCutoff: 0.5,
        doubleSided: true,
      },
      maps: [
        {
          ...common,
          slot: 'baseColor',
          sampler,
          procedural: frondCutout(options.size, options.seed),
        },
        { ...common, slot: 'normal', sampler, procedural: spec('normal', height), derive },
        { ...common, slot: 'metallicRoughness', sampler, procedural: roughnessMap },
      ],
    } as ProceduralMaterialDraftV2;
  }
  return {
    materialId: identity.materialId,
    name: identity.name,
    tags: identity.tags,
    tileable: true,
    physicalSizeMeters: identity.physicalSizeMeters,
    parameters: { metalness: 1, roughness: 1 },
    sources: identity.sources,
    maps: [
      { ...common, slot: 'baseColor', procedural: spec('albedo', color) },
      { ...common, slot: 'normal', procedural: spec('normal', height), derive },
      { ...common, slot: 'metallicRoughness', procedural: roughnessMap },
    ],
  };
}

/** Deterministic 32-bit generator for preset geometry; never Math.random. */
function presetRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * V3 RGBA frond silhouette: a rachis up the image centre from the bottom edge, with paired
 * leaflets that shorten and narrow toward the tip. Everything else is fully transparent.
 */
function frondCutout(size: number, seed: number) {
  const random = presetRandom(seed);
  const unit = size / 64;
  const centre = Math.round(size / 2);
  const inside = (value: number) => Math.min(size - 2, Math.max(1, Math.round(value)));
  const shade = (base: number, spread: number) =>
    Math.min(255, Math.max(0, Math.round(base + (random() - 0.5) * spread)));
  const operations: object[] = [];
  const leaflets = 12;
  for (let i = 0; i < leaflets; i++) {
    const along = (i + 0.5) / leaflets;
    const y = size - 3 * unit - along * (size - 8 * unit);
    const width = Math.max(1, Math.round((2.4 - 1.4 * along) * unit));
    for (const side of [-1, 1]) {
      const reach = (0.44 - 0.3 * along) * size * (0.9 + 0.2 * random());
      const rise = (0.08 + 0.06 * random()) * size;
      operations.push({
        op: 'paint',
        shape: {
          kind: 'line',
          from: [centre, inside(y)],
          to: [inside(centre + side * reach), inside(y - rise)],
          width,
        },
        rgba: [shade(64, 24), shade(116, 30), shade(44, 18), 255],
      });
    }
  }
  operations.push({
    op: 'paint',
    shape: {
      kind: 'line',
      from: [centre, size - 1],
      to: [centre, inside(2 * unit)],
      width: Math.max(1, Math.round(1.5 * unit)),
    },
    rgba: [104, 98, 46, 255],
  });
  return {
    schemaVersion: 3 as const,
    width: size,
    height: size,
    usage: 'albedo' as const,
    background: [0, 0, 0, 0],
    operations,
  };
}
