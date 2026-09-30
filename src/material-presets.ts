/** Small offline starting points. These are editable recipes, not measured scan materials. */
import { z } from 'zod';
import {
  assertMaterialJson,
  materialLibraryIdSchema,
  materialSourceSchema,
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
] as const;
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
}
export function listMaterialPresets(): MaterialPresetSummary[] {
  return catalog.map((item) => ({
    ...item,
    physicalSizeMeters: { ...item.physicalSizeMeters },
    tags: [item.family, 'procedural'],
    recipeVersion: 1,
  }));
}
export function createMaterialPresetDraft(
  presetId: string,
  raw: MaterialPresetOptions,
): MaterialDraftV1 {
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
  return {
    materialId: options.materialId ?? preset.id,
    name: preset.name,
    tags: [preset.family, 'procedural'],
    tileable: true,
    physicalSizeMeters: { ...preset.physicalSizeMeters },
    parameters: { metalness: 1, roughness: 1 },
    sources: [
      {
        id: 'preset',
        kind: 'procedural',
        provider: 'Kiln material presets v1',
        creator: options.creator,
        assetId: preset.id,
        license: options.license,
        originalFiles: [],
      },
    ],
    maps: [
      { ...common, slot: 'baseColor', procedural: spec('albedo', color) },
      {
        ...common,
        slot: 'normal',
        procedural: spec('normal', height),
        derive: { kind: 'normal-from-height', strength },
      },
      {
        ...common,
        slot: 'metallicRoughness',
        procedural: spec('metallicRoughness', [
          noise(packed(roughnessLow), packed(roughnessHigh), 8),
        ]),
      },
    ],
  };
}
