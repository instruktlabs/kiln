/** Portable material-library records. Source URLs are provenance, never loading instructions. */
import { z } from 'zod';
import {
  canonicalizeProceduralTextureSpecV2,
  type CanonicalPortableMaterialSpecV2,
} from './procedural-material-v2';

export const MATERIAL_LIBRARY_LIMITS = Object.freeze({
  maxMapBytes: 8 * 1024 * 1024,
  maxRecordBytes: 32 * 1024 * 1024,
  maxManifestBytes: 256 * 1024,
  maxMapEdge: 4096,
  maxRecordPixels: 8 * 1024 * 1024,
  maxPayloadBytes: 16 * 1024 * 1024,
  maxPayloadPixels: 16 * 1024 * 1024,
  maxPayloadRecords: 16,
});
export const MATERIAL_LIBRARY_SLOTS = [
  'baseColor',
  'normal',
  'metallicRoughness',
  'emissive',
  'occlusion',
] as const;
export type MaterialLibrarySlot = (typeof MATERIAL_LIBRARY_SLOTS)[number];
export const MATERIAL_LIBRARY_USAGE = {
  baseColor: 'albedo',
  normal: 'normal',
  metallicRoughness: 'metallicRoughness',
  emissive: 'emissive',
  occlusion: 'occlusion',
} as const;
const slotNames = {
  baseColor: 'base-color',
  normal: 'normal',
  metallicRoughness: 'metallic-roughness',
  emissive: 'emissive',
  occlusion: 'occlusion',
} as const;
export const materialLibraryIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const materialLibraryHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const text = z.string().min(1).max(1000);
const url = z
  .string()
  .max(2000)
  .url()
  .refine((value) => /^https?:\/\//.test(value), 'Provenance URL must be HTTP(S)');
export const materialSourceSchema = z
  .object({
    id: materialLibraryIdSchema,
    kind: z.enum(['external', 'procedural']),
    provider: text,
    creator: text,
    assetId: text.optional(),
    assetUrl: url.optional(),
    accessedAt: z.string().datetime().optional(),
    license: z.object({ spdx: text, url, attribution: z.string().max(4000) }).strict(),
    originalFiles: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            sha256: materialLibraryHashSchema,
            bytes: z
              .number()
              .int()
              .positive()
              .max(1024 * 1024 * 1024),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.kind === 'external' && (!source.assetUrl || !source.originalFiles.length))
      context.addIssue({
        code: 'custom',
        message: 'External materials require a source URL and original file hashes',
      });
    if (new Set(source.originalFiles.map((file) => file.name)).size !== source.originalFiles.length)
      context.addIssue({ code: 'custom', message: 'Duplicate original filename' });
  });
export type MaterialSourceV1 = z.infer<typeof materialSourceSchema>;
export const materialTransformSchema = z
  .object({
    operation: text,
    tool: text,
    version: text,
    parameters: z
      .record(
        z.string().max(100),
        z.union([z.string().max(2000), z.number().finite(), z.boolean()]),
      )
      .optional(),
  })
  .strict();
export type MaterialTransformV1 = z.infer<typeof materialTransformSchema>;
const color = z.number().int().min(0).max(0xffffff);
const count = z.number().int().min(1).max(256);
const layerCommon = {
  blend: z.enum(['normal', 'multiply', 'screen', 'overlay']).default('normal'),
  opacity: z.number().min(0).max(1).default(1),
};
/** Advertisable MCP schema; the existing compiler remains the canonical recipe authority. */
export const materialProceduralSpecSchema = z
  .object({
    schemaVersion: z.literal(2),
    size: z.number().int().min(4).max(1024).default(256),
    usage: z
      .enum([
        'albedo',
        'normal',
        'roughness',
        'metalness',
        'metallicRoughness',
        'emissive',
        'occlusion',
      ])
      .default('albedo'),
    name: z.string().min(1).max(80).optional(),
    layers: z
      .array(
        z.discriminatedUnion('op', [
          z.object({ op: z.literal('solid'), color, ...layerCommon }).strict(),
          z
            .object({
              op: z.literal('checker'),
              colorA: color,
              colorB: color,
              squares: count.default(8),
              ...layerCommon,
            })
            .strict(),
          z
            .object({
              op: z.literal('stripes'),
              colorA: color,
              colorB: color,
              count: count.default(8),
              angleDeg: z.number().min(-36000).max(36000).default(0),
              ...layerCommon,
            })
            .strict(),
          z
            .object({
              op: z.literal('gradient'),
              from: color,
              to: color,
              angleDeg: z.number().min(-36000).max(36000).default(0),
              ...layerCommon,
            })
            .strict(),
          z
            .object({
              op: z.literal('bricks'),
              brick: color,
              mortar: color,
              rows: count.default(8),
              cols: count.default(4),
              mortarWidth: z.number().min(0).max(1).default(0.06),
              stagger: z.number().min(0).max(1).default(0.5),
              ...layerCommon,
            })
            .strict(),
          z
            .object({
              op: z.literal('noise'),
              colorA: color,
              colorB: color,
              scale: count.default(8),
              octaves: z.number().int().min(1).max(6).default(3),
              seed: z.number().int().min(-2147483648).max(2147483647).default(0),
              ...layerCommon,
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const materialNormalDerivationSchema = z
  .object({
    kind: z.literal('normal-from-height'),
    strength: z.number().finite().positive().max(64),
  })
  .strict();
const proceduralSchema = z
  .object({
    compiler: z.literal('kiln.procedural-texture.v2'),
    spec: materialProceduralSpecSchema,
    derive: materialNormalDerivationSchema.optional(),
    recipeHash: materialLibraryHashSchema,
    pixelHash: materialLibraryHashSchema,
    encoder: z.object({ name: z.literal('sharp'), version: text }).strict(),
  })
  .strict();
const parametersSchema = z
  .object({
    baseColor: z.number().int().min(0).max(0xffffff).optional(),
    roughness: z.number().min(0).max(1).default(1),
    metalness: z.number().min(0).max(1).default(0),
    emissive: z.number().int().min(0).max(0xffffff).optional(),
    emissiveIntensity: z.number().min(0).max(64).default(1),
    alphaMode: z.enum(['opaque', 'mask', 'blend']).default('opaque'),
    alphaCutoff: z.number().min(0).max(1).default(0.5),
    doubleSided: z.boolean().default(false),
  })
  .strict();
export const materialManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    materialId: materialLibraryIdSchema,
    revisionId: materialLibraryHashSchema,
    name: z.string().min(1).max(200),
    tags: z.array(z.string().min(1).max(80)).max(30),
    tileable: z.boolean(),
    physicalSizeMeters: z
      .object({
        width: z.number().finite().positive().max(100000),
        height: z.number().finite().positive().max(100000),
      })
      .strict()
      .optional(),
    parameters: parametersSchema,
    sources: z.array(materialSourceSchema).min(1).max(20),
    maps: z
      .array(
        z
          .object({
            slot: z.enum(MATERIAL_LIBRARY_SLOTS),
            file: z.enum([
              'baseColor.png',
              'normal.png',
              'metallicRoughness.png',
              'emissive.png',
              'occlusion.png',
            ]),
            sha256: materialLibraryHashSchema,
            bytes: z.number().int().positive().max(MATERIAL_LIBRARY_LIMITS.maxMapBytes),
            width: z.number().int().positive().max(MATERIAL_LIBRARY_LIMITS.maxMapEdge),
            height: z.number().int().positive().max(MATERIAL_LIBRARY_LIMITS.maxMapEdge),
            usage: z.enum(['albedo', 'normal', 'metallicRoughness', 'emissive', 'occlusion']),
            colorSpace: z.enum(['srgb', 'linear']),
            normalConvention: z.literal('opengl').optional(),
            channelPacking: z.literal('r-occlusion-g-roughness-b-metallic').optional(),
            sourceId: materialLibraryIdSchema,
            originalFile: z.string().min(1).max(200).optional(),
            transforms: z.array(materialTransformSchema).max(30),
            procedural: proceduralSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type MaterialManifestV1 = z.infer<typeof materialManifestSchema>;
export type MaterialMapV1 = MaterialManifestV1['maps'][number];
/** JSON-only creation surface. External files enter through verified record import instead. */
export const proceduralMaterialDraftSchema = z
  .object({
    materialId: materialLibraryIdSchema,
    name: z.string().min(1).max(200),
    tags: z.array(z.string().min(1).max(80)).max(30).optional(),
    tileable: z.boolean(),
    physicalSizeMeters: z
      .object({
        width: z.number().finite().positive().max(100000),
        height: z.number().finite().positive().max(100000),
      })
      .strict()
      .optional(),
    parameters: parametersSchema.partial().optional(),
    sources: z.array(materialSourceSchema).min(1).max(20),
    maps: z
      .array(
        z
          .object({
            slot: z.enum(MATERIAL_LIBRARY_SLOTS),
            sourceId: materialLibraryIdSchema,
            transforms: z.array(materialTransformSchema).max(30),
            normalConvention: z.literal('opengl').optional(),
            channelPacking: z.literal('r-occlusion-g-roughness-b-metallic').optional(),
            procedural: materialProceduralSpecSchema,
            derive: materialNormalDerivationSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export interface MaterialRecordV1 {
  manifest: MaterialManifestV1;
  files: Record<string, Uint8Array>;
}
export interface MaterialLibraryPayloadV1 {
  schemaVersion: 1;
  records: { manifest: MaterialManifestV1; files: Record<string, string> }[];
}
export interface MaterialLibrary {
  list(): Promise<MaterialManifestV1[]>;
  read(materialId: string, revisionId: string): Promise<MaterialRecordV1>;
  import(records: MaterialRecordV1[]): Promise<MaterialManifestV1[]>;
}
export const materialLibraryPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    records: z
      .array(
        z
          .object({
            manifest: materialManifestSchema,
            files: z.record(
              z.string().regex(/^(baseColor|normal|metallicRoughness|emissive|occlusion)\.png$/),
              z.string().max(Math.ceil(MATERIAL_LIBRARY_LIMITS.maxMapBytes / 3) * 4),
            ),
          })
          .strict(),
      )
      .max(MATERIAL_LIBRARY_LIMITS.maxPayloadRecords),
  })
  .strict();

/** Reject executable or inherited fields before any schema accesses their values. */
export function assertMaterialJson(value: unknown, allowBytes = false, depth = 0): void {
  if (depth > 30) throw new Error('Material JSON exceeds nesting limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (allowBytes && value instanceof Uint8Array) return;
  if (!value || typeof value !== 'object')
    throw new Error('Material values must be plain JSON data');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
    throw new Error('Material values must have plain JSON prototypes');
  if (array && value.length > 10000) throw new Error('Material JSON array exceeds limit');
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('Material JSON contains a forbidden key');
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
      throw new Error('Material arrays must contain only indexed data');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Material JSON accessors or hidden fields are not allowed');
    assertMaterialJson(descriptor.value, allowBytes, depth + 1);
  }
  if (array && Object.keys(value).length !== value.length)
    throw new Error('Material JSON arrays must be dense');
}
export function canonicalMaterialJson(value: unknown): string {
  assertMaterialJson(value);
  const canonical = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry !== null && typeof entry === 'object'
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : entry;
  return JSON.stringify(canonical(value));
}
export function validateMaterialManifest(value: unknown): MaterialManifestV1 {
  assertMaterialJson(value);
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
    MATERIAL_LIBRARY_LIMITS.maxManifestBytes
  )
    throw new Error('Material manifest exceeds size limit');
  const manifest = materialManifestSchema.parse(value);
  if (new Set(manifest.sources.map((source) => source.id)).size !== manifest.sources.length)
    throw new Error('Duplicate material source identity');
  if (new Set(manifest.maps.map((map) => map.slot)).size !== manifest.maps.length)
    throw new Error('Duplicate material map slot');
  let bytes = 0;
  let pixels = 0;
  for (const map of manifest.maps) {
    const srgb = map.slot === 'baseColor' || map.slot === 'emissive';
    if (
      map.file !== `${map.slot}.png` ||
      map.usage !== MATERIAL_LIBRARY_USAGE[map.slot] ||
      map.colorSpace !== (srgb ? 'srgb' : 'linear')
    )
      throw new Error('Material map filename, usage or color convention mismatch');
    if (
      (map.slot === 'normal') !== (map.normalConvention === 'opengl') ||
      (map.slot === 'metallicRoughness') !==
        (map.channelPacking === 'r-occlusion-g-roughness-b-metallic')
    )
      throw new Error('Material map convention is missing or invalid');
    const source = manifest.sources.find((item) => item.id === map.sourceId);
    if (!source) throw new Error('Material map source is missing');
    if (map.procedural) {
      if (map.procedural.derive && map.slot !== 'normal')
        throw new Error('Height derivation requires a normal map slot');
      if (
        canonicalMaterialJson(map.procedural.spec) !==
        canonicalMaterialJson(canonicalizeProceduralTextureSpecV2(map.procedural.spec))
      )
        throw new Error('Stored procedural material recipe must be canonical');
      if (
        source.kind !== 'procedural' ||
        map.originalFile ||
        map.procedural.spec.usage !== map.usage ||
        map.procedural.spec.size !== map.width ||
        map.width !== map.height
      )
        throw new Error('Procedural material source or map convention mismatch');
    } else if (
      source.kind !== 'external' ||
      !source.originalFiles.some((file) => file.name === map.originalFile)
    ) {
      throw new Error('Material map must reference an original source file');
    }
    bytes += map.bytes;
    pixels += map.width * map.height;
  }
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxRecordBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxRecordPixels
  )
    throw new Error('Material record exceeds byte or pixel budget');
  return manifest;
}
export function materialPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR'
  )
    throw new Error('Material map must be a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
export function validateMaterialRecordShape(record: MaterialRecordV1): MaterialManifestV1 {
  assertMaterialJson(record, true);
  if (Object.keys(record).some((key) => key !== 'manifest' && key !== 'files'))
    throw new Error('Invalid material record');
  const manifest = validateMaterialManifest(record.manifest);
  if (!record.files || Object.keys(record.files).length !== manifest.maps.length)
    throw new Error('Material file inventory mismatch');
  for (const map of manifest.maps) {
    const bytes = record.files[map.file];
    if (!(bytes instanceof Uint8Array) || bytes.length !== map.bytes)
      throw new Error('Material file inventory mismatch');
    const size = materialPngDimensions(bytes);
    if (size.width !== map.width || size.height !== map.height)
      throw new Error('Material map dimensions mismatch');
  }
  return manifest;
}
export function materialLibraryResourceId(
  manifest: MaterialManifestV1,
  slot: MaterialLibrarySlot,
): string {
  materialLibraryHashSchema.parse(manifest.revisionId);
  if (!MATERIAL_LIBRARY_SLOTS.includes(slot)) throw new Error('Unknown material slot');
  return `kiln.library.${manifest.revisionId.slice(7)}.${slotNames[slot]}`;
}
export function materialLibraryPortableSpec(
  manifest: MaterialManifestV1,
): CanonicalPortableMaterialSpecV2 {
  manifest = validateMaterialManifest(manifest);
  return {
    schemaVersion: 2,
    model: 'pbrMetallicRoughness',
    name: manifest.name,
    ...manifest.parameters,
    textures: Object.fromEntries(
      manifest.maps.map((map) => [
        map.slot,
        { kind: 'resource' as const, resourceId: materialLibraryResourceId(manifest, map.slot) },
      ]),
    ),
  };
}
