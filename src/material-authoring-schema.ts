/** Advertisable field shapes only. Existing canonicalizers own semantics and budgets. */
import { z } from 'zod';
import {
  type CanonicalProceduralTextureSpecV2,
  MIN_PROCEDURAL_SIZE,
  MAX_PROCEDURAL_SIZE,
  MAX_PROCEDURAL_LAYERS,
  MAX_PROCEDURAL_PATTERN_COUNT,
  MAX_NOISE_OCTAVES,
} from './procedural-material-v2';
import {
  MAX_PROCEDURAL_V3_EDGE,
  MAX_PROCEDURAL_V3_OPERATIONS,
  MAX_PROCEDURAL_V3_VERTICES,
  MAX_PROCEDURAL_V3_STAMPS,
  MAX_PROCEDURAL_V3_PALETTE,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
} from './procedural-texture-v3-contract';
import { TEXTURE_ATLAS_COMPILER_ID, TEXTURE_ATLAS_LIMITS } from './texture-atlas-contract';
import {
  PORTABLE_MIN_FILTERS_V1,
  PORTABLE_MAG_FILTERS_V1,
  PORTABLE_WRAPS_V1,
} from './portable-sampler';
import { TEXTURE_USAGES } from './texture-contract';

/** Persisted V2 shape: all canonical fields required, no author defaults or transforms. */
export const canonicalLegacyV2FieldSchema = (() => {
  const color = z.number().int().min(0).max(0xffffff);
  const count = z.number().int().min(1).max(MAX_PROCEDURAL_PATTERN_COUNT);
  const angleDeg = z.number().min(-36000).max(36000);
  const unit = z.number().min(0).max(1);
  const common = { blend: z.enum(['normal', 'multiply', 'screen', 'overlay']), opacity: unit };
  return z
    .object({
      schemaVersion: z.literal(2),
      size: z.number().int().min(MIN_PROCEDURAL_SIZE).max(MAX_PROCEDURAL_SIZE),
      usage: z.enum(TEXTURE_USAGES),
      name: z.string().min(1).max(80).optional(),
      layers: z
        .array(
          z.discriminatedUnion('op', [
            z.object({ op: z.literal('solid'), color, ...common }).strict(),
            z
              .object({
                op: z.literal('checker'),
                colorA: color,
                colorB: color,
                squares: count,
                ...common,
              })
              .strict(),
            z
              .object({
                op: z.literal('stripes'),
                colorA: color,
                colorB: color,
                count,
                angleDeg,
                ...common,
              })
              .strict(),
            z
              .object({ op: z.literal('gradient'), from: color, to: color, angleDeg, ...common })
              .strict(),
            z
              .object({
                op: z.literal('bricks'),
                brick: color,
                mortar: color,
                rows: count,
                cols: count,
                mortarWidth: unit,
                stagger: unit,
                ...common,
              })
              .strict(),
            z
              .object({
                op: z.literal('noise'),
                colorA: color,
                colorB: color,
                scale: count,
                octaves: z.number().int().min(1).max(MAX_NOISE_OCTAVES),
                seed: z.number().int().min(-2147483648).max(2147483647),
                ...common,
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(MAX_PROCEDURAL_LAYERS),
    })
    .strict();
})();

/** Inject author V2 without a circular import. Optional persisted leaf must have no defaults. */
export function makeMaterialAuthoringSchemas<S extends z.ZodType<CanonicalProceduralTextureSpecV2>>(
  legacyV2Schema: S,
  canonicalLegacyV2Schema: z.ZodType<CanonicalProceduralTextureSpecV2> = canonicalLegacyV2FieldSchema,
) {
  const integer = (min: number, max: number) => z.number().int().min(min).max(max);
  const byte = integer(0, 255);
  const coordinate = integer(-4096, 4096);
  const point = z.tuple([coordinate, coordinate]);
  const rgba = z.tuple([byte, byte, byte, byte]);
  const usage = z.enum(TEXTURE_USAGES);
  const hash = z.templateLiteral(['sha256:', z.string().regex(/^[a-f0-9]{64}$/)]);
  const name = z.string().min(1).max(80);
  const stableId = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
  const mapId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/);
  const dimensions = { width: integer(1, 4096), height: integer(1, 4096) };
  const pixelRectangleSchema = z
    .object({ x: coordinate, y: coordinate, width: integer(1, 2048), height: integer(1, 2048) })
    .strict();
  const atlasRectangleSchema = z
    .object({ x: integer(0, 4096), y: integer(0, 4096), ...dimensions })
    .strict();
  const shape = z.discriminatedUnion('kind', [
    pixelRectangleSchema.extend({ kind: z.literal('rectangle') }).strict(),
    pixelRectangleSchema.extend({ kind: z.literal('ellipse') }).strict(),
    z
      .object({
        kind: z.literal('polygon'),
        points: z.array(point).min(3).max(MAX_PROCEDURAL_V3_VERTICES),
      })
      .strict(),
    z.object({ kind: z.literal('line'), from: point, to: point, width: integer(1, 2048) }).strict(),
  ]);
  const paint = z.object({ op: z.literal('paint'), shape, rgba, opacity: byte }).strict();
  const mask = z
    .object({ op: z.literal('mask'), shape, alpha: byte, invert: z.boolean() })
    .strict();
  const stamps = z
    .object({
      op: z.literal('stamps'),
      shape,
      rgba,
      opacity: byte,
      count: integer(1, MAX_PROCEDURAL_V3_STAMPS),
      seed: integer(0, 0xffffffff),
      area: pixelRectangleSchema,
      periodic: z.boolean(),
    })
    .strict();
  const legacy = z
    .object({ op: z.literal('legacy-v2'), spec: legacyV2Schema, alpha: byte, opacity: byte })
    .strict();
  const palette = z
    .object({
      colors: z.array(integer(0, 0xffffff)).min(1).max(MAX_PROCEDURAL_V3_PALETTE),
      dither: z.enum(['none', 'bayer4']),
    })
    .strict();
  const proceduralBase = {
    schemaVersion: z.literal(3),
    width: integer(4, MAX_PROCEDURAL_V3_EDGE),
    height: integer(4, MAX_PROCEDURAL_V3_EDGE),
    usage,
    name: name.optional(),
    background: rgba,
  };
  const canonicalProceduralTextureSpecV3Schema = z
    .object({
      ...proceduralBase,
      operations: z
        .array(
          z.discriminatedUnion('op', [
            paint,
            mask,
            stamps,
            legacy.extend({ spec: canonicalLegacyV2Schema }),
          ]),
        )
        .max(MAX_PROCEDURAL_V3_OPERATIONS),
      palette: palette.optional(),
    })
    .strict();
  const proceduralTextureSpecV3Schema = z
    .object({
      ...proceduralBase,
      usage: usage.optional(),
      background: rgba.optional(),
      operations: z
        .array(
          z.discriminatedUnion('op', [
            paint.partial({ opacity: true }),
            mask.partial({ alpha: true, invert: true }),
            stamps.partial({ opacity: true, periodic: true }),
            legacy.partial({ alpha: true, opacity: true }),
          ]),
        )
        .max(MAX_PROCEDURAL_V3_OPERATIONS),
      palette: palette.partial({ dither: true }).optional(),
    })
    .strict();
  const portableSamplerSchema = z
    .object({
      minFilter: z.enum(PORTABLE_MIN_FILTERS_V1),
      magFilter: z.enum(PORTABLE_MAG_FILTERS_V1),
      wrapS: z.enum(PORTABLE_WRAPS_V1),
      wrapT: z.enum(PORTABLE_WRAPS_V1),
    })
    .strict();
  const materialMapPinSchema = z
    .object({ resourceId: stableId, revisionId: hash, sha256: hash })
    .strict();
  const resourceSource = z
    .object({
      kind: z.literal('resource'),
      resourceId: mapId,
      pin: materialMapPinSchema,
      expected: z
        .object({ ...dimensions, imageSha256: hash, decodedPixelHash: hash })
        .partial()
        .strict()
        .optional(),
    })
    .strict();
  const region = z
    .object({
      name: stableId,
      content: atlasRectangleSchema,
      gutter: integer(0, 32),
      edgeMode: z.enum(['copy-edge', 'mask-rgb-dilate']),
      source: z.discriminatedUnion('kind', [
        z
          .object({ kind: z.literal('procedural'), spec: canonicalProceduralTextureSpecV3Schema })
          .strict(),
        resourceSource,
      ]),
      crop: atlasRectangleSchema.optional(),
    })
    .strict();
  const atlasBase = {
    schemaVersion: z.literal(1),
    width: integer(4, TEXTURE_ATLAS_LIMITS.edge),
    height: integer(4, TEXTURE_ATLAS_LIMITS.edge),
    usage,
    sampler: portableSamplerSchema,
  };
  const canonicalTextureAtlasSpecV1Schema = z
    .object({ ...atlasBase, regions: z.array(region).min(1).max(TEXTURE_ATLAS_LIMITS.regions) })
    .strict();
  const textureAtlasSpecV1Schema = z
    .object({
      ...atlasBase,
      sampler: portableSamplerSchema.optional(),
      regions: z
        .array(
          region
            .extend({
              source: z.discriminatedUnion('kind', [
                z
                  .object({ kind: z.literal('procedural'), spec: proceduralTextureSpecV3Schema })
                  .strict(),
                resourceSource,
              ]),
            })
            .partial({ gutter: true, edgeMode: true }),
        )
        .min(1)
        .max(TEXTURE_ATLAS_LIMITS.regions),
    })
    .strict();
  const verifiedPinnedMaterialMapDescriptorSchema = z
    .object({
      materialId: stableId,
      revisionId: hash,
      resourceId: mapId,
      slot: z.enum(['baseColor', 'normal', 'metallicRoughness', 'emissive', 'occlusion']),
      usage,
      colorSpace: z.enum(['srgb', 'linear']),
      ...dimensions,
      encodedByteLength: integer(1, TEXTURE_ATLAS_LIMITS.encodedSourceBytes),
      imageSha256: hash,
      decodedPixelHash: hash.optional(),
    })
    .strict();
  const sourceManifestBase = {
    id: z.string().min(1).max(1024),
    ...dimensions,
    decodedPixelHash: hash,
  };
  const sourceManifest = z.discriminatedUnion('kind', [
    z
      .object({
        ...sourceManifestBase,
        kind: z.literal('procedural'),
        recipeHash: hash,
        compilerId: z.literal(PROCEDURAL_TEXTURE_V3_COMPILER_ID),
      })
      .strict(),
    z
      .object({
        ...sourceManifestBase,
        kind: z.literal('resource'),
        descriptor: verifiedPinnedMaterialMapDescriptorSchema,
      })
      .strict(),
  ]);
  const textureAtlasManifestV1Schema = z
    .object({
      version: z.literal('kiln.atlas-manifest.v1'),
      compilerId: z.literal(TEXTURE_ATLAS_COMPILER_ID),
      width: atlasBase.width,
      height: atlasBase.height,
      usage,
      origin: z.literal('top-left'),
      sampler: portableSamplerSchema,
      specHash: hash,
      layoutHash: hash,
      decodedPixelHash: hash,
      atlasPixelHash: hash,
      sources: z.array(sourceManifest).min(1).max(TEXTURE_ATLAS_LIMITS.sources),
      regions: z
        .array(
          z
            .object({
              name: stableId,
              content: atlasRectangleSchema,
              allocation: atlasRectangleSchema,
              crop: atlasRectangleSchema,
              sourceId: z.string().min(1).max(1024),
            })
            .strict(),
        )
        .min(1)
        .max(TEXTURE_ATLAS_LIMITS.regions),
      manifestHash: hash,
    })
    .strict();
  return {
    portableSamplerSchema,
    proceduralTextureSpecV3Schema,
    canonicalProceduralTextureSpecV3Schema,
    textureAtlasSpecV1Schema,
    canonicalTextureAtlasSpecV1Schema,
    textureAtlasManifestV1Schema,
    materialMapPinSchema,
    verifiedPinnedMaterialMapDescriptorSchema,
  };
}
