/** Host-owned immutable material storage and byte-only evaluator delivery. No acquisition I/O. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { DataTexture } from 'three';
import {
  assertMaterialJson,
  canonicalMaterialJson,
  MATERIAL_LIBRARY_LIMITS,
  MATERIAL_LIBRARY_SLOTS,
  MATERIAL_LIBRARY_USAGE,
  materialLibraryHashSchema,
  materialLibraryIdSchema,
  materialLibraryResourceId,
  materialManifestSchema,
  materialNormalDerivationSchema,
  materialPngDimensions,
  validateMaterialRecordShape,
  validateMaterialManifest,
  type MaterialLibraryPayloadV1,
  type MaterialLibrarySlot,
  type MaterialManifestV1,
  type MaterialMapV1,
  type MaterialRecordV1,
  type MaterialSourceV1,
  type MaterialTransformV1,
} from './material-library';
import { compileProceduralTextureSpecV2, normalMapFromHeight } from './procedural-texture';
import type { ProceduralTextureSpecV2 } from './procedural-material-v2';
import { loadTexture } from './textures';
import { DEFAULT_TEXTURE_RESOLVER, type TextureResolver } from './texture-resolver';

const digest = (bytes: Uint8Array | string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encoder = { name: 'sharp' as const, version: sharp.versions.sharp! };
type MapDraftCommon = {
  slot: MaterialLibrarySlot;
  sourceId: string;
  transforms: MaterialTransformV1[];
  normalConvention?: 'opengl';
  channelPacking?: 'r-occlusion-g-roughness-b-metallic';
};
export type MaterialMapDraftV1 = MapDraftCommon &
  (
    | { bytes: Uint8Array; originalFile: string; procedural?: never }
    | {
        procedural: ProceduralTextureSpecV2;
        derive?: { kind: 'normal-from-height'; strength: number };
        bytes?: never;
        originalFile?: never;
      }
  );
export interface MaterialDraftV1 {
  materialId: string;
  name: string;
  tags?: string[];
  tileable: boolean;
  physicalSizeMeters?: { width: number; height: number };
  parameters?: Partial<MaterialManifestV1['parameters']>;
  sources: MaterialSourceV1[];
  maps: MaterialMapDraftV1[];
}
function revisionHash(manifest: MaterialManifestV1): `sha256:${string}` {
  const { revisionId: _, ...content } = manifest;
  return digest(canonicalMaterialJson(content));
}
export function validateMaterialManifestIdentity(value: unknown): MaterialManifestV1 {
  const manifest = validateMaterialManifest(value);
  if (revisionHash(manifest) !== manifest.revisionId)
    throw new Error('Material identity hash mismatch');
  return manifest;
}
function snapshot(record: MaterialRecordV1): MaterialRecordV1 {
  validateMaterialRecordShape(record);
  return {
    manifest: structuredClone(record.manifest),
    files: Object.fromEntries(
      Object.entries(record.files).map(([name, bytes]) => [name, Uint8Array.from(bytes)]),
    ),
  };
}
function exactKeys(value: object, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Unknown material draft field');
}
function materialPixels(
  spec: ProceduralTextureSpecV2,
  derive?: { kind: 'normal-from-height'; strength: number },
) {
  const compiled = compileProceduralTextureSpecV2(spec);
  if (!derive) return compiled;
  materialNormalDerivationSchema.parse(derive);
  if (compiled.spec.usage !== 'normal')
    throw new Error('Height derivation requires a normal map slot');
  const height = new DataTexture(compiled.pixels, compiled.spec.size, compiled.spec.size);
  const normal = normalMapFromHeight(height, { strength: derive.strength });
  if (!(normal.image.data instanceof Uint8Array))
    throw new Error('Normal derivation must produce RGBA8 pixels');
  const pixels = Uint8Array.from(normal.image.data);
  height.dispose();
  normal.dispose();
  return { ...compiled, pixels };
}
/** Bake existing bounded procedural recipes or accept normalized PNG bytes supplied by the host. */
export async function createMaterialRecordV1(draft: MaterialDraftV1): Promise<MaterialRecordV1> {
  assertMaterialJson(draft, true);
  exactKeys(draft, [
    'materialId',
    'name',
    'tags',
    'tileable',
    'physicalSizeMeters',
    'parameters',
    'sources',
    'maps',
  ]);
  if (!Array.isArray(draft.maps) || !draft.maps.length || draft.maps.length > 5)
    throw new Error('Material requires 1..5 maps');
  const files: Record<string, Uint8Array> = {};
  const maps: MaterialMapV1[] = [];
  let totalPixels = 0;
  for (const input of draft.maps) {
    exactKeys(input, [
      'slot',
      'sourceId',
      'transforms',
      'normalConvention',
      'channelPacking',
      'bytes',
      'originalFile',
      'procedural',
      'derive',
    ]);
    if (!MATERIAL_LIBRARY_SLOTS.includes(input.slot))
      throw new Error('Unsupported material map slot');
    if ((input.bytes !== undefined) === (input.procedural !== undefined))
      throw new Error('Supply exactly one map byte source or procedural recipe');
    let bytes: Uint8Array;
    let procedural: MaterialMapV1['procedural'];
    if (input.procedural) {
      const compiled = materialPixels(input.procedural, input.derive);
      if (compiled.spec.usage !== MATERIAL_LIBRARY_USAGE[input.slot])
        throw new Error('Procedural map usage mismatch');
      bytes = new Uint8Array(
        await sharp(compiled.pixels, {
          raw: { width: compiled.spec.size, height: compiled.spec.size, channels: 4 },
        })
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toBuffer(),
      );
      procedural = {
        compiler: 'kiln.procedural-texture.v2',
        spec: compiled.spec,
        ...(input.derive ? { derive: structuredClone(input.derive) } : {}),
        recipeHash: compiled.recipeHash,
        pixelHash: digest(compiled.pixels),
        encoder,
      };
    } else {
      if ('derive' in input)
        throw new Error('External maps cannot declare a procedural derivation');
      if (!(input.bytes instanceof Uint8Array))
        throw new Error('Material map bytes must be Uint8Array');
      bytes = Uint8Array.from(input.bytes);
    }
    if (bytes.length > MATERIAL_LIBRARY_LIMITS.maxMapBytes)
      throw new Error('Material map exceeds encoded byte limit');
    const dimensions = materialPngDimensions(bytes);
    totalPixels += dimensions.width * dimensions.height;
    if (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > MATERIAL_LIBRARY_LIMITS.maxMapEdge ||
      dimensions.height > MATERIAL_LIBRARY_LIMITS.maxMapEdge ||
      totalPixels > MATERIAL_LIBRARY_LIMITS.maxRecordPixels
    )
      throw new Error('Material maps exceed pixel budget');
    const file = `${input.slot}.png`;
    if (files[file]) throw new Error('Duplicate material map slot');
    files[file] = bytes;
    maps.push({
      slot: input.slot,
      file: file as MaterialMapV1['file'],
      ...dimensions,
      sha256: digest(bytes),
      bytes: bytes.length,
      usage: MATERIAL_LIBRARY_USAGE[input.slot],
      colorSpace: input.slot === 'baseColor' || input.slot === 'emissive' ? 'srgb' : 'linear',
      ...(input.slot === 'normal'
        ? { normalConvention: input.normalConvention ?? (procedural ? 'opengl' : undefined) }
        : {}),
      ...(input.slot === 'metallicRoughness'
        ? {
            channelPacking:
              input.channelPacking ??
              (procedural ? 'r-occlusion-g-roughness-b-metallic' : undefined),
          }
        : {}),
      sourceId: input.sourceId,
      ...(input.originalFile ? { originalFile: input.originalFile } : {}),
      transforms: structuredClone(input.transforms),
      ...(procedural ? { procedural } : {}),
    });
  }
  const manifest = materialManifestSchema.parse({
    schemaVersion: 1,
    materialId: draft.materialId,
    revisionId: `sha256:${'0'.repeat(64)}`,
    name: draft.name,
    tags: draft.tags ?? [],
    tileable: draft.tileable,
    ...(draft.physicalSizeMeters ? { physicalSizeMeters: draft.physicalSizeMeters } : {}),
    parameters: draft.parameters ?? {},
    sources: draft.sources,
    maps,
  });
  manifest.revisionId = revisionHash(manifest);
  const record = { manifest, files };
  await verifyMaterialRecordV1(record);
  return record;
}

/** Verify identity, normalized PNG contents, and the complete procedural recipe/output relation. */
export async function verifyMaterialRecordV1(record: MaterialRecordV1): Promise<void> {
  const manifest = validateMaterialRecordShape(record);
  if (revisionHash(manifest) !== manifest.revisionId)
    throw new Error('Material identity hash mismatch');
  for (const map of manifest.maps) {
    const bytes = record.files[map.file]!;
    if (digest(bytes) !== map.sha256)
      throw new Error(`Material integrity hash mismatch: ${map.file}`);
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
      failOn: 'warning',
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== map.width || info.height !== map.height || info.channels !== 4)
      throw new Error('Material decoded image mismatch');
    if (map.procedural) {
      const compiled = materialPixels(map.procedural.spec, map.procedural.derive);
      if (
        compiled.recipeHash !== map.procedural.recipeHash ||
        digest(compiled.pixels) !== map.procedural.pixelHash ||
        digest(data) !== map.procedural.pixelHash
      )
        throw new Error('Procedural material recipe or pixel hash mismatch');
    }
  }
}

export function validateMaterialLibraryPayload(value: unknown): MaterialLibraryPayloadV1 {
  assertMaterialJson(value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid material resource payload');
  const payload = value as MaterialLibraryPayloadV1;
  if (
    Object.keys(payload).some((key) => !['schemaVersion', 'records'].includes(key)) ||
    payload.schemaVersion !== 1 ||
    !Array.isArray(payload.records) ||
    payload.records.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords
  )
    throw new Error('Invalid material resource payload');
  let total = 0;
  let pixels = 0;
  const identities = new Set<string>();
  for (const wire of payload.records) {
    if (
      !wire ||
      typeof wire !== 'object' ||
      Object.keys(wire).some((key) => !['manifest', 'files'].includes(key))
    )
      throw new Error('Invalid material resource record');
    const manifest = materialManifestSchema.parse(wire.manifest);
    if (identities.has(manifest.revisionId))
      throw new Error('Duplicate material resource revision');
    identities.add(manifest.revisionId);
    if (
      !wire.files ||
      typeof wire.files !== 'object' ||
      Array.isArray(wire.files) ||
      Object.keys(wire.files).length !== manifest.maps.length
    )
      throw new Error('Material payload inventory mismatch');
    for (const map of manifest.maps) {
      const encoded = wire.files[map.file];
      if (
        typeof encoded !== 'string' ||
        encoded.length !== Math.ceil(map.bytes / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
      )
        throw new Error('Invalid material map base64');
      total += map.bytes;
      pixels += map.width * map.height;
    }
  }
  if (
    total > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Material resource payload exceeds byte or pixel budget');
  return payload;
}
export async function createMaterialLibraryPayload(
  records: MaterialRecordV1[],
): Promise<MaterialLibraryPayloadV1> {
  const snapshots = records.map(snapshot);
  for (const record of snapshots) await verifyMaterialRecordV1(record);
  return validateMaterialLibraryPayload({
    schemaVersion: 1,
    records: snapshots.map((record) => ({
      manifest: record.manifest,
      files: Object.fromEntries(
        Object.entries(record.files).map(([name, bytes]) => [
          name,
          Buffer.from(bytes).toString('base64'),
        ]),
      ),
    })),
  });
}
export async function decodeMaterialLibraryPayload(value: unknown): Promise<MaterialRecordV1[]> {
  const payload = validateMaterialLibraryPayload(value);
  const records = payload.records.map((wire) => ({
    manifest: structuredClone(wire.manifest),
    files: Object.fromEntries(
      Object.entries(wire.files).map(([name, encoded]) => [
        name,
        new Uint8Array(Buffer.from(encoded, 'base64')),
      ]),
    ),
  }));
  for (const record of records) await verifyMaterialRecordV1(record);
  return records;
}
export async function createMaterialLibraryTextureResolver(
  records: MaterialRecordV1[],
  fallback: TextureResolver = DEFAULT_TEXTURE_RESOLVER,
): Promise<TextureResolver> {
  const snapshots = await decodeMaterialLibraryPayload(await createMaterialLibraryPayload(records));
  const maps = new Map<string, { record: MaterialRecordV1; map: MaterialMapV1 }>();
  for (const record of snapshots)
    for (const map of record.manifest.maps)
      maps.set(materialLibraryResourceId(record.manifest, map.slot), { record, map });
  return Object.freeze({
    describeApprovedTexture(id: unknown) {
      const entry = typeof id === 'string' ? maps.get(id) : undefined;
      return entry
        ? { usage: entry.map.usage, allowedSlots: [entry.map.slot] }
        : fallback.describeApprovedTexture?.(id);
    },
    async loadApprovedTexture(id: unknown) {
      const entry = typeof id === 'string' ? maps.get(id) : undefined;
      if (!entry) return fallback.loadApprovedTexture(id);
      // Each caller receives independent mutable Three state and encoded bytes.
      const texture = await loadTexture(entry.record.files[entry.map.file]!.slice(), {
        usage: entry.map.usage,
        name: id as string,
      });
      texture.userData['kilnMaterialResource'] = {
        schemaVersion: 1,
        materialId: entry.record.manifest.materialId,
        revisionId: entry.record.manifest.revisionId,
        resourceId: id,
        map: structuredClone(entry.map),
        sources: structuredClone(entry.record.manifest.sources),
        ...(entry.record.manifest.physicalSizeMeters
          ? { physicalSizeMeters: { ...entry.record.manifest.physicalSizeMeters } }
          : {}),
      };
      return texture;
    },
    materialRecipe: (id: unknown, overrides?: unknown) => fallback.materialRecipe(id, overrides),
  });
}

/** Files live under a trusted host root; every path component and map name is closed data. */
export class FileMaterialLibrary {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private async path(...parts: string[]): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const canonical = await realpath(this.root);
    let current = canonical;
    for (const part of parts) {
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(part))
        throw new Error('Invalid material path identity');
      current = join(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          throw new Error('Material library requires real directories');
        const rel = relative(canonical, await realpath(current));
        if (rel === '..' || rel.startsWith(`..${sep}`))
          throw new Error('Material path escapes library');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return current;
  }
  private async file(dir: string, name: string, limit: number): Promise<Uint8Array> {
    const path = join(dir, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
      throw new Error('Invalid material library file');
    return new Uint8Array(await readFile(path));
  }
  async read(materialId: string, revisionId: string): Promise<MaterialRecordV1> {
    materialLibraryIdSchema.parse(materialId);
    materialLibraryHashSchema.parse(revisionId);
    const dir = await this.path(materialId, revisionId.slice(7));
    const manifest = materialManifestSchema.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await this.file(dir, 'manifest.json', MATERIAL_LIBRARY_LIMITS.maxManifestBytes),
        ),
      ),
    );
    if (manifest.materialId !== materialId || manifest.revisionId !== revisionId)
      throw new Error('Material identity mismatch');
    const files: Record<string, Uint8Array> = {};
    for (const map of manifest.maps)
      files[map.file] = await this.file(dir, map.file, MATERIAL_LIBRARY_LIMITS.maxMapBytes);
    const record = { manifest, files };
    await verifyMaterialRecordV1(record);
    return record;
  }
  async list(): Promise<MaterialManifestV1[]> {
    const manifests: MaterialManifestV1[] = [];
    for (const material of await readdir(await this.path(), { withFileTypes: true })) {
      if (!material.isDirectory() || !materialLibraryIdSchema.safeParse(material.name).success)
        continue;
      for (const revision of await readdir(await this.path(material.name), {
        withFileTypes: true,
      })) {
        if (!revision.isDirectory() || !/^[a-f0-9]{64}$/.test(revision.name)) continue;
        manifests.push((await this.read(material.name, `sha256:${revision.name}`)).manifest);
      }
    }
    return manifests.sort(
      (a, b) =>
        a.materialId.localeCompare(b.materialId) || a.revisionId.localeCompare(b.revisionId),
    );
  }
  async import(records: MaterialRecordV1[]): Promise<MaterialManifestV1[]> {
    if (!Array.isArray(records) || !records.length || records.length > 100)
      throw new Error('Material import requires 1..100 records');
    const snapshots = records.map(snapshot);
    for (const record of snapshots) await verifyMaterialRecordV1(record);
    for (const record of snapshots) {
      const { manifest, files } = record;
      const dest = await this.path(manifest.materialId, manifest.revisionId.slice(7));
      const parent = dirname(dest);
      await mkdir(parent, { recursive: true });
      const stage = join(parent, `.stage-${randomUUID()}`);
      await mkdir(stage);
      try {
        for (const [name, bytes] of Object.entries(files))
          await writeFile(join(stage, name), bytes, { flag: 'wx' });
        await writeFile(join(stage, 'manifest.json'), canonicalMaterialJson(manifest), {
          flag: 'wx',
        });
        try {
          await rename(stage, dest);
        } catch (error) {
          const existing = await this.read(manifest.materialId, manifest.revisionId).catch(
            () => undefined,
          );
          if (
            !existing ||
            canonicalMaterialJson(existing.manifest) !== canonicalMaterialJson(manifest)
          )
            throw error;
        }
      } finally {
        const rel = relative(parent, resolve(stage));
        if (rel.startsWith('.stage-') && !rel.includes(sep))
          await rm(stage, { recursive: true, force: true });
      }
    }
    return snapshots.map((record) => record.manifest);
  }
}
