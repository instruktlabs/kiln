/** Host-owned immutable material storage and byte-only evaluator delivery. No acquisition I/O. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { DataTexture } from 'three';
import { renameDirectoryAtomically } from './atomic-directory';
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
  type MaterialManifest,
  type MaterialManifestV2,
  type MaterialMapV2,
  type MaterialRecord,
  type MaterialRecordV2,
  type MaterialLibraryPayload,
  validateMaterialManifestAny,
  validateMaterialRecordShapeAny,
  materialManifestV2Schema,
  materialRecordDependencyPins,
} from './material-library';
import { canonicalizePortableSamplerV1, type PortableSamplerV1 } from './portable-sampler';
import { applyPortableSamplerV1 } from './portable-sampler-runtime';
import { compileProceduralTextureSpecV3 } from './procedural-texture-v3';
import {
  admitProceduralTextureSpecV3,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
} from './procedural-texture-v3-contract';
import { admitTextureAtlasSpecV1, compileTextureAtlasSpecV1 } from './texture-atlas-pixels';
import type {
  MaterialMapPinV1,
  PinnedMaterialMapPortV1,
  VerifiedPinnedMaterialMapDescriptorV1,
} from './pinned-material-map';
import { compileProceduralTextureSpecV2, normalMapFromHeight } from './procedural-texture';
import {
  canonicalizeProceduralTextureSpecV2,
  type ProceduralTextureSpecV2,
} from './procedural-material-v2';
import { loadTexture } from './textures';
import { DEFAULT_TEXTURE_RESOLVER, type TextureResolver } from './texture-resolver';
import { PORTABLE_MATERIAL_V3_LIMITS } from './procedural-material-v3';

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
function revisionHash(manifest: MaterialManifest): `sha256:${string}` {
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
async function createMaterialLibraryPayloadV1(
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
async function decodeMaterialLibraryPayloadV1(value: unknown): Promise<MaterialRecordV1[]> {
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
  records: MaterialRecord[],
  fallback: TextureResolver = DEFAULT_TEXTURE_RESOLVER,
): Promise<TextureResolver> {
  const snapshots = await decodeMaterialLibraryPayload(await createMaterialLibraryPayload(records));
  const maps = new Map<string, { record: MaterialRecord; map: MaterialMapV1 | MaterialMapV2 }>();
  for (const record of snapshots)
    for (const map of record.manifest.maps)
      maps.set(materialLibraryResourceId(record.manifest, map.slot), { record, map });
  return Object.freeze({
    pinnedMaterialMaps: createPinnedMaterialMapPort(snapshots),
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
        schemaVersion: entry.record.manifest.schemaVersion,
        materialId: entry.record.manifest.materialId,
        revisionId: entry.record.manifest.revisionId,
        resourceId: id,
        map: structuredClone(entry.map),
        sources: structuredClone(entry.record.manifest.sources),
        ...(entry.record.manifest.physicalSizeMeters
          ? { physicalSizeMeters: { ...entry.record.manifest.physicalSizeMeters } }
          : {}),
      };
      if ('sampler' in entry.map) applyPortableSamplerV1(texture, entry.map.sampler);
      if ('recipe' in entry.map && entry.map.recipe?.kind === 'atlas')
        texture.userData['kilnAtlas'] = {
          spec: structuredClone(entry.map.recipe.spec),
          manifest: structuredClone(entry.map.recipe.manifest),
        };
      return texture;
    },
    async preparePortableTexture(id: unknown, context?: { signal?: AbortSignal }) {
      context?.signal?.throwIfAborted();
      const entry = typeof id === 'string' ? maps.get(id) : undefined;
      if (!entry) {
        if (!fallback.preparePortableTexture)
          throw new Error('Portable texture preparation unavailable');
        return fallback.preparePortableTexture(id, context);
      }
      const { record, map } = entry;
      return {
        descriptor: {
          resourceId: id as string,
          usage: map.usage,
          allowedSlots: [map.slot],
          colorSpace: map.colorSpace,
          width: map.width,
          height: map.height,
          encodedByteLength: map.bytes,
          imageSha256: map.sha256 as `sha256:${string}`,
        },
        bytes: record.files[map.file]!.slice(),
        userData: {
          ...('recipe' in map && map.recipe?.kind === 'atlas'
            ? {
                kilnAtlas: {
                  spec: structuredClone(map.recipe.spec),
                  manifest: structuredClone(map.recipe.manifest),
                },
              }
            : {}),
          kilnMaterialResource: {
            schemaVersion: record.manifest.schemaVersion,
            materialId: record.manifest.materialId,
            revisionId: record.manifest.revisionId,
            resourceId: id,
            map: structuredClone(map),
            sources: structuredClone(record.manifest.sources),
            ...(record.manifest.physicalSizeMeters
              ? { physicalSizeMeters: structuredClone(record.manifest.physicalSizeMeters) }
              : {}),
          },
        },
      };
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
  async readManifest(materialId: string, revisionId: string): Promise<MaterialManifest> {
    materialLibraryIdSchema.parse(materialId);
    materialLibraryHashSchema.parse(revisionId);
    const dir = await this.path(materialId, revisionId.slice(7));
    const manifest = validateMaterialManifestIdentityAny(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await this.file(dir, 'manifest.json', MATERIAL_LIBRARY_LIMITS.maxManifestBytes),
        ),
      ),
    );
    if (manifest.materialId !== materialId || manifest.revisionId !== revisionId)
      throw new Error('Material identity mismatch');
    return manifest;
  }
  /** Host-only file materialization after metadata admission; pixel/recipe verification is deferred. */
  async readRecordFiles(materialId: string, revisionId: string): Promise<MaterialRecord> {
    const manifest = await this.readManifest(materialId, revisionId);
    const dir = await this.path(materialId, revisionId.slice(7));
    const files: Record<string, Uint8Array> = {};
    for (const map of manifest.maps)
      files[map.file] = await this.file(dir, map.file, MATERIAL_LIBRARY_LIMITS.maxMapBytes);
    const record = { manifest, files } as MaterialRecord;
    validateMaterialRecordShapeAny(record);
    for (const map of manifest.maps)
      if (digest(files[map.file]!) !== map.sha256)
        throw new Error('Material integrity hash mismatch');
    return record;
  }
  async read(materialId: string, revisionId: string): Promise<MaterialRecord> {
    const root = await this.readManifest(materialId, revisionId);
    if (root.schemaVersion === 1) {
      const record = (await this.readRecordFiles(materialId, revisionId)) as MaterialRecordV1;
      await verifyMaterialRecordV1(record);
      return record;
    }
    const closure = await resolveMaterialRecordClosure([root], {
      readManifest: this.readManifest.bind(this),
      read: this.readRecordFiles.bind(this),
    });
    return closure.find(
      (record) =>
        record.manifest.materialId === materialId && record.manifest.revisionId === revisionId,
    )!;
  }
  async list(): Promise<MaterialManifest[]> {
    const manifests: MaterialManifest[] = [];
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
  async import(
    records: MaterialRecord[],
    options?: { materials?: readonly MaterialRecord[] },
  ): Promise<MaterialManifest[]> {
    if (!Array.isArray(records) || !records.length || records.length > 100)
      throw new Error('Material import requires 1..100 records');
    let snapshots: MaterialRecord[];
    if (records.every((record) => record.manifest.schemaVersion === 1) && !options?.materials) {
      snapshots = (records as MaterialRecordV1[]).map(snapshot);
      for (const record of snapshots) await verifyMaterialRecordV1(record as MaterialRecordV1);
    } else {
      const candidates = [...records, ...(options?.materials ?? [])];
      if (new Set(candidates.map((record) => identity(record.manifest))).size > 1024)
        throw new Error('Material import context count limit exceeded');
      const context = await resolveMaterialRecordClosure(
        records.map((r) => r.manifest),
        recordClosureReader(candidates, this),
        {
          maxRecords: 1024,
          maxBytes: 256 * 1024 * 1024,
          maxPixels: 1024 * MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
        },
      );
      const admitted = new Map(context.map((record) => [identity(record.manifest), record]));
      snapshots = records.map((record) => admitted.get(identity(record.manifest))!);
    }
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
          await renameDirectoryAtomically(stage, dest);
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

export function validateMaterialManifestIdentityAny(value: unknown): MaterialManifest {
  const manifest = validateMaterialManifestAny(value);
  if (revisionHash(manifest) !== manifest.revisionId)
    throw new Error('Material identity hash mismatch');
  return manifest;
}
function snapshotAny(record: MaterialRecord): MaterialRecord {
  validateMaterialRecordShapeAny(record);
  return {
    manifest: structuredClone(record.manifest),
    files: Object.fromEntries(
      Object.entries(record.files).map(([name, bytes]) => [name, bytes.slice()]),
    ),
  } as MaterialRecord;
}
const identity = (manifest: MaterialManifest) => `${manifest.materialId}/${manifest.revisionId}`;
export interface MaterialRecordClosureReader {
  readManifest(materialId: string, revisionId: string): Promise<MaterialManifest>;
  /** Return owned bytes after metadata admission; the walker verifies the complete closure. */
  read(materialId: string, revisionId: string): Promise<MaterialRecord>;
}
export interface MaterialRecordClosureLimits {
  maxRecords: number;
  maxBytes: number;
  maxPixels: number;
}
export async function resolveMaterialRecordClosure(
  roots: readonly MaterialManifest[],
  reader: MaterialRecordClosureReader,
  limits: MaterialRecordClosureLimits = {
    maxRecords: MATERIAL_LIBRARY_LIMITS.maxPayloadRecords,
    maxBytes: MATERIAL_LIBRARY_LIMITS.maxPayloadBytes,
    maxPixels: MATERIAL_LIBRARY_LIMITS.maxPayloadPixels,
  },
): Promise<MaterialRecord[]> {
  for (const n of Object.values(limits))
    if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid material closure limits');
  const manifests = new Map<string, MaterialManifest>(),
    active = new Set<string>();
  let bytes = 0,
    pixels = 0;
  const visit = async (value: MaterialManifest): Promise<void> => {
    const manifest = validateMaterialManifestIdentityAny(value),
      key = identity(manifest);
    if (active.has(key)) throw new Error('Material dependency cycle');
    const existing = manifests.get(key);
    if (existing) {
      if (canonicalMaterialJson(existing) !== canonicalMaterialJson(manifest))
        throw new Error('Conflicting material dependency identity');
      return;
    }
    manifests.set(key, structuredClone(manifest));
    active.add(key);
    for (const map of manifest.maps) {
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
    if (manifests.size > limits.maxRecords || bytes > limits.maxBytes || pixels > limits.maxPixels)
      throw new Error('Material closure count/byte/pixel limit exceeded');
    for (const pin of materialRecordDependencyPins(manifest)) {
      const child = await reader.readManifest(pin.resourceId, pin.revisionId);
      if (
        child.materialId !== pin.resourceId ||
        child.revisionId !== pin.revisionId ||
        pin.sha256 !== pin.revisionId
      )
        throw new Error('Material dependency pin mismatch');
      await visit(child);
    }
    active.delete(key);
  };
  for (const root of roots) await visit(root);
  const records: MaterialRecord[] = [];
  for (const [key, manifest] of manifests) {
    const record = snapshotAny(await reader.read(manifest.materialId, manifest.revisionId));
    if (
      identity(record.manifest) !== key ||
      canonicalMaterialJson(record.manifest) !== canonicalMaterialJson(manifest)
    )
      throw new Error('Material closure manifest changed during read');
    validateMaterialManifestIdentityAny(record.manifest);
    for (const map of record.manifest.maps)
      if (digest(record.files[map.file]!) !== map.sha256)
        throw new Error('Material integrity hash mismatch');
    records.push(record);
  }
  for (const record of records) await verifyMaterialRecordContents(record, { materials: records });
  return records;
}
function recordClosureReader(
  records: readonly MaterialRecord[],
  fallback?: FileMaterialLibrary,
): MaterialRecordClosureReader {
  const byId = new Map<string, MaterialRecord>();
  const duplicates = new Map<string, MaterialRecord[]>();
  for (const record of records) {
    const key = identity(record.manifest),
      existing = byId.get(key);
    if (
      existing &&
      canonicalMaterialJson(existing.manifest) !== canonicalMaterialJson(record.manifest)
    )
      throw new Error('Conflicting material record identity');
    if (!existing) byId.set(key, record);
    else if (existing !== record) duplicates.set(key, [...(duplicates.get(key) ?? []), record]);
  }
  return {
    async readManifest(id, revision) {
      const record = byId.get(`${id}/${revision}`);
      if (record) return record.manifest;
      if (fallback) return fallback.readManifest(id, revision);
      throw new Error(`Missing pinned material revision: ${id} at ${revision}`);
    },
    async read(id, revision) {
      const key = `${id}/${revision}`,
        record = byId.get(key);
      if (record) {
        // Deferred until the complete metadata graph is admitted, before dedup reuse.
        for (const candidate of [record, ...(duplicates.get(key) ?? [])]) {
          const manifest = validateMaterialRecordShapeAny(candidate);
          if (canonicalMaterialJson(manifest) !== canonicalMaterialJson(record.manifest))
            throw new Error('Conflicting material record identity');
          for (const map of manifest.maps)
            if (digest(candidate.files[map.file]!) !== map.sha256)
              throw new Error('Conflicting material record encoded integrity hash');
        }
        return record;
      }
      if (fallback) return fallback.readRecordFiles(id, revision);
      throw new Error(`Missing pinned material revision: ${id} at ${revision}`);
    },
  };
}

/** The input closure is admitted and encoded-verified before this capability is constructed. */
function createPinnedMaterialMapPort(records: readonly MaterialRecord[]): PinnedMaterialMapPortV1 {
  const entries = new Map<string, { record: MaterialRecord; map: MaterialMapV1 | MaterialMapV2 }>();
  for (const record of records) {
    validateMaterialRecordShapeAny(record);
    validateMaterialManifestIdentityAny(record.manifest);
    for (const map of record.manifest.maps) {
      if (digest(record.files[map.file]!) !== map.sha256)
        throw new Error('Material integrity hash mismatch');
      entries.set(
        `${identity(record.manifest)}/${materialLibraryResourceId(record.manifest, map.slot)}`,
        { record, map },
      );
    }
  }
  const find = (resourceId: unknown, pin: MaterialMapPinV1) => {
    if (typeof resourceId !== 'string' || pin.sha256 !== pin.revisionId) return undefined;
    return entries.get(`${pin.resourceId}/${pin.revisionId}/${resourceId}`);
  };
  const describe = (
    resourceId: unknown,
    pin: MaterialMapPinV1,
  ): VerifiedPinnedMaterialMapDescriptorV1 | undefined => {
    const entry = find(resourceId, pin);
    if (!entry) return undefined;
    const { record, map } = entry;
    return {
      materialId: record.manifest.materialId,
      revisionId: record.manifest.revisionId as `sha256:${string}`,
      resourceId: resourceId as string,
      slot: map.slot,
      usage: map.usage,
      colorSpace: map.colorSpace,
      width: map.width,
      height: map.height,
      encodedByteLength: map.bytes,
      imageSha256: map.sha256 as `sha256:${string}`,
      ...('pixelHash' in map ? { decodedPixelHash: map.pixelHash as `sha256:${string}` } : {}),
    };
  };
  return {
    describePinnedMaterialMap: describe,
    async resolvePinnedMaterialMapPixels(resourceId, pin, context) {
      context?.signal?.throwIfAborted();
      const descriptor = describe(resourceId, pin),
        entry = find(resourceId, pin);
      if (!descriptor || !entry)
        throw new Error(
          'Missing verified pinned-library map; approved resources cannot be atlas sources',
        );
      const { data, info } = await sharp(entry.record.files[entry.map.file]!, {
        limitInputPixels: MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
        failOn: 'warning',
      })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      context?.signal?.throwIfAborted();
      if (
        info.width !== descriptor.width ||
        info.height !== descriptor.height ||
        info.channels !== 4
      )
        throw new Error('Pinned material decoded dimensions mismatch');
      const decodedPixelHash = digest(data);
      if (descriptor.decodedPixelHash && descriptor.decodedPixelHash !== decodedPixelHash)
        throw new Error('Pinned material pixel hash mismatch');
      return { descriptor, pixels: Uint8Array.from(data), decodedPixelHash };
    },
  };
}

async function verifyMaterialRecordContents(
  record: MaterialRecord,
  options?: { materials?: readonly MaterialRecord[] },
): Promise<void> {
  if (record.manifest.schemaVersion === 1)
    return verifyMaterialRecordV1(record as MaterialRecordV1);
  const manifest = validateMaterialRecordShapeAny(record) as MaterialManifestV2;
  validateMaterialManifestIdentityAny(manifest);
  const pins = new Set(
    materialRecordDependencyPins(manifest).map((pin) => `${pin.resourceId}/${pin.revisionId}`),
  );
  pins.add(identity(manifest));
  const resources = createPinnedMaterialMapPort(
    (options?.materials ?? [record]).filter((candidate) => pins.has(identity(candidate.manifest))),
  );
  admitMaterialManifestRecipes(manifest, resources);
  for (const map of manifest.maps) {
    const bytes = record.files[map.file]!;
    if (digest(bytes) !== map.sha256) throw new Error('Material integrity hash mismatch');
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
      failOn: 'warning',
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      info.width !== map.width ||
      info.height !== map.height ||
      info.channels !== 4 ||
      digest(data) !== map.pixelHash
    )
      throw new Error('Material decoded pixel hash/dimensions mismatch');
    const recipe = map.recipe;
    if (!recipe) continue;
    if (recipe.kind === 'atlas') {
      const compiled = await compileTextureAtlasSpecV1(recipe.spec, { resources });
      if (
        canonicalMaterialJson(compiled.manifest) !== canonicalMaterialJson(recipe.manifest) ||
        digest(compiled.pixels) !== map.pixelHash
      )
        throw new Error('Atlas recipe/manifest/pixel hash mismatch');
    } else {
      const compiled =
        recipe.spec.schemaVersion === 3
          ? compileProceduralTextureSpecV3(recipe.spec)
          : materialPixels(recipe.spec, recipe.derive);
      if (compiled.recipeHash !== recipe.recipeHash || digest(compiled.pixels) !== recipe.pixelHash)
        throw new Error('Procedural recipe/pixel hash mismatch');
    }
  }
}

/** Verify the complete immutable dependency closure; admission precedes byte snapshots and PNG decode. */
export async function verifyMaterialRecord(
  record: MaterialRecord,
  options?: { materials?: readonly MaterialRecord[] },
): Promise<void> {
  if (record.manifest.schemaVersion === 1)
    return verifyMaterialRecordV1(record as MaterialRecordV1);
  await resolveMaterialRecordClosure(
    [record.manifest],
    recordClosureReader([record, ...(options?.materials ?? [])]),
  );
}
function admitMaterialManifestRecipes(
  manifest: MaterialManifestV2,
  resources: PinnedMaterialMapPortV1,
): void {
  let texels = 0,
    work = 0,
    allocation = 0,
    encoded = 0;
  for (const map of manifest.maps) {
    encoded += map.bytes;
    const recipe = map.recipe;
    if (recipe?.kind === 'procedural') {
      if (recipe.spec.schemaVersion === 3) {
        const a = admitProceduralTextureSpecV3(recipe.spec);
        texels += a.spec.width * a.spec.height;
        work += a.estimatedWorkUnits;
        allocation += a.conservativePixelAllocationBytes;
      } else {
        texels += recipe.spec.size ** 2;
        work += recipe.spec.size ** 2 * recipe.spec.layers.length * 16;
        allocation += recipe.spec.size ** 2 * 12;
      }
    } else if (recipe?.kind === 'atlas') {
      const a = admitTextureAtlasSpecV1(recipe.spec, { resources });
      texels += a.spec.width * a.spec.height + a.budget.sourceTexels;
      work += a.budget.workUnits;
      allocation += a.budget.conservativePixelAllocationBytes;
      encoded += a.budget.encodedBytes;
    } else {
      texels += map.width * map.height;
      work += map.width * map.height * 12 + map.bytes * 8;
      allocation += map.width * map.height * 12 + map.bytes * 2;
    }
  }
  if (
    texels > PORTABLE_MATERIAL_V3_LIMITS.maxTexels ||
    work > PORTABLE_MATERIAL_V3_LIMITS.maxWork ||
    allocation > PORTABLE_MATERIAL_V3_LIMITS.maxTransientBytes ||
    encoded > PORTABLE_MATERIAL_V3_LIMITS.maxEncodedBytes
  )
    throw new Error('Material recipe aggregate texel/work/allocation/encoded budget exceeded');
}

export function validateMaterialLibraryPayloadAny(value: unknown): MaterialLibraryPayload {
  assertMaterialJson(value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid material resource payload');
  if ((value as Record<string, unknown>)['schemaVersion'] === 1)
    return validateMaterialLibraryPayload(value);
  const payload = value as MaterialLibraryPayload;
  if (
    Object.keys(payload).some((k) => !['schemaVersion', 'records'].includes(k)) ||
    payload.schemaVersion !== 2 ||
    !Array.isArray(payload.records) ||
    payload.records.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords
  )
    throw new Error('Invalid material resource payload');
  let bytes = 0,
    pixels = 0;
  const seen = new Set<string>();
  for (const wire of payload.records) {
    if (
      !wire ||
      typeof wire !== 'object' ||
      Object.keys(wire).some((k) => !['manifest', 'files'].includes(k))
    )
      throw new Error('Invalid material resource record');
    const manifest = validateMaterialManifestIdentityAny(wire.manifest),
      key = identity(manifest);
    if (seen.has(key)) throw new Error('Duplicate material resource revision');
    seen.add(key);
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
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
  }
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Material resource payload exceeds byte/pixel budget');
  return payload;
}
export function createMaterialLibraryPayload(
  records: MaterialRecordV1[],
): Promise<MaterialLibraryPayloadV1>;
export function createMaterialLibraryPayload(
  records: MaterialRecord[],
): Promise<MaterialLibraryPayload>;
export async function createMaterialLibraryPayload(
  records: MaterialRecord[],
): Promise<MaterialLibraryPayload> {
  if (records.every((r) => r.manifest.schemaVersion === 1))
    return createMaterialLibraryPayloadV1(records as MaterialRecordV1[]);
  // Admit metadata before snapshots, encoding or recipe/pixel compilation.
  let bytes = 0,
    pixels = 0;
  if (records.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
    throw new Error('Material payload record limit exceeded');
  for (const record of records)
    for (const map of validateMaterialManifestIdentityAny(record.manifest).maps) {
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Material payload byte/pixel budget exceeded');
  const admitted = await resolveMaterialRecordClosure(
    records.map((r) => r.manifest),
    recordClosureReader(records),
  );
  const byIdentity = new Map(admitted.map((r) => [identity(r.manifest), r]));
  const snapshots = records.map((r) => byIdentity.get(identity(r.manifest))!);
  return validateMaterialLibraryPayloadAny({
    schemaVersion: 2,
    records: snapshots.map((r) => ({
      manifest: r.manifest,
      files: Object.fromEntries(
        Object.entries(r.files).map(([name, bytes]) => [
          name,
          Buffer.from(bytes).toString('base64'),
        ]),
      ),
    })),
  });
}
export async function decodeMaterialLibraryPayload(value: unknown): Promise<MaterialRecord[]> {
  const payload = validateMaterialLibraryPayloadAny(value);
  if (payload.schemaVersion === 1) return decodeMaterialLibraryPayloadV1(payload);
  const wires = payload.records.map((w) => ({
    manifest: validateMaterialManifestIdentityAny(w.manifest),
    files: { ...w.files },
  }));
  const byIdentity = new Map(wires.map((w) => [identity(w.manifest), w]));
  const reader: MaterialRecordClosureReader = {
    async readManifest(id, revision) {
      const wire = byIdentity.get(`${id}/${revision}`);
      if (!wire) throw new Error('Missing pinned material revision');
      return wire.manifest;
    },
    async read(id, revision) {
      const wire = byIdentity.get(`${id}/${revision}`);
      if (!wire) throw new Error('Missing pinned material revision');
      return {
        manifest: wire.manifest,
        files: Object.fromEntries(
          Object.entries(wire.files).map(([name, encoded]) => [
            name,
            new Uint8Array(Buffer.from(encoded, 'base64')),
          ]),
        ),
      } as MaterialRecord;
    },
  };
  const admitted = await resolveMaterialRecordClosure(
    wires.map((w) => w.manifest),
    reader,
  );
  const result = new Map(admitted.map((r) => [identity(r.manifest), r]));
  return wires.map((w) => result.get(identity(w.manifest))!);
}

export async function createMaterialRecordV2(
  draft: unknown,
  options?: { materials?: readonly MaterialRecord[] },
): Promise<MaterialRecordV2> {
  assertMaterialJson(draft, true);
  if (!draft || typeof draft !== 'object' || Array.isArray(draft))
    throw new Error('Invalid material draft');
  exactKeys(draft, [
    'schemaVersion',
    'materialId',
    'name',
    'tags',
    'tileable',
    'physicalSizeMeters',
    'parameters',
    'sources',
    'maps',
  ]);
  const input = draft as Record<string, unknown>;
  if (
    input['schemaVersion'] !== 2 ||
    !Array.isArray(input['maps']) ||
    input['maps'].length < 1 ||
    input['maps'].length > 5
  )
    throw new Error('V2 material requires schemaVersion2 and1..5 maps');
  const candidates = options?.materials ?? [];
  if (candidates.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
    throw new Error('Material source closure count limit exceeded');
  const records = candidates.length
    ? await resolveMaterialRecordClosure(
        candidates.map((r) => r.manifest),
        recordClosureReader(candidates),
      )
    : [];
  const resources = createPinnedMaterialMapPort(records),
    prepared: {
      raw: Record<string, unknown>;
      slot: MaterialLibrarySlot;
      sampler: PortableSamplerV1;
      procedural?: unknown;
      atlas?: unknown;
      bytes?: Uint8Array;
    }[] = [];
  let texels = 0,
    work = 0,
    allocation = 0,
    encoded = 0;
  for (const value of input['maps']) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid material map draft');
    exactKeys(value, [
      'slot',
      'sourceId',
      'transforms',
      'normalConvention',
      'channelPacking',
      'sampler',
      'bytes',
      'originalFile',
      'procedural',
      'derive',
      'atlas',
    ]);
    const raw = value as Record<string, unknown>,
      slot = raw['slot'] as MaterialLibrarySlot;
    if (!MATERIAL_LIBRARY_SLOTS.includes(slot)) throw new Error('Unsupported material map slot');
    const sampler = canonicalizePortableSamplerV1(raw['sampler']);
    if (['bytes', 'procedural', 'atlas'].filter((k) => raw[k] !== undefined).length !== 1)
      throw new Error('Supply exactly one map bytes/procedural/atlas source');
    if (raw['procedural'] !== undefined) {
      const spec = raw['procedural'] as { schemaVersion?: number };
      if (spec.schemaVersion === 3) {
        if (raw['derive'] !== undefined) throw new Error('V3 normal derivation is unsupported');
        const a = admitProceduralTextureSpecV3(spec);
        if (a.spec.usage !== MATERIAL_LIBRARY_USAGE[slot])
          throw new Error('Procedural usage mismatch');
        texels += a.spec.width * a.spec.height;
        work += a.estimatedWorkUnits;
        allocation += a.conservativePixelAllocationBytes;
        prepared.push({ raw, slot, sampler, procedural: a.spec });
      } else {
        const canonical = canonicalizeProceduralTextureSpecV2(spec);
        if (canonical.usage !== MATERIAL_LIBRARY_USAGE[slot])
          throw new Error('Procedural usage mismatch');
        texels += canonical.size ** 2;
        work += canonical.size ** 2 * canonical.layers.length * 16;
        allocation += canonical.size ** 2 * 12;
        prepared.push({ raw, slot, sampler, procedural: canonical });
      }
    } else if (raw['atlas'] !== undefined) {
      if (raw['derive'] !== undefined) throw new Error('Atlas derivation unsupported');
      const a = admitTextureAtlasSpecV1(raw['atlas'], { resources });
      if (
        a.spec.usage !== MATERIAL_LIBRARY_USAGE[slot] ||
        canonicalMaterialJson(a.spec.sampler) !== canonicalMaterialJson(sampler)
      )
        throw new Error('Atlas usage/sampler mismatch');
      texels += a.spec.width * a.spec.height + a.budget.sourceTexels;
      work += a.budget.workUnits;
      allocation += a.budget.conservativePixelAllocationBytes;
      encoded += a.budget.encodedBytes;
      prepared.push({ raw, slot, sampler, atlas: a.spec });
    } else {
      if (raw['derive'] !== undefined || !(raw['bytes'] instanceof Uint8Array))
        throw new Error('Invalid external map bytes/derivation');
      const bytes = raw['bytes'];
      if (bytes.length > MATERIAL_LIBRARY_LIMITS.maxMapBytes)
        throw new Error('Material map encoded byte limit');
      const d = materialPngDimensions(bytes);
      if (d.width < 1 || d.height < 1 || d.width > 4096 || d.height > 4096)
        throw new Error('Material map dimensions limit');
      texels += d.width * d.height;
      encoded += bytes.length;
      work += d.width * d.height * 12 + bytes.length * 8;
      allocation += d.width * d.height * 12 + bytes.length * 2;
      prepared.push({ raw, slot, sampler, bytes });
    }
  }
  if (
    texels > 4 * 1024 * 1024 ||
    work > PORTABLE_MATERIAL_V3_LIMITS.maxWork ||
    allocation > 64 * 1024 * 1024 ||
    encoded > 16 * 1024 * 1024
  )
    throw new Error('Material aggregate texel/work/allocation limit exceeded');
  const maps: MaterialMapV2[] = [],
    files: Record<string, Uint8Array> = {},
    pins = new Map<string, MaterialMapPinV1>();
  for (const item of prepared) {
    const { raw, slot, sampler } = item;
    let bytes: Uint8Array, pixelHash: `sha256:${string}`, recipe: MaterialMapV2['recipe'];
    if (item.procedural !== undefined) {
      const spec = item.procedural as ProceduralTextureSpecV2 | { schemaVersion: 3 };
      const compiled =
        spec.schemaVersion === 3
          ? compileProceduralTextureSpecV3(spec)
          : materialPixels(
              spec,
              raw['derive'] as { kind: 'normal-from-height'; strength: number } | undefined,
            );
      const d =
        compiled.spec.schemaVersion === 3
          ? { width: compiled.spec.width, height: compiled.spec.height }
          : { width: compiled.spec.size, height: compiled.spec.size };
      pixelHash = digest(compiled.pixels);
      bytes = new Uint8Array(
        await sharp(compiled.pixels, { raw: { ...d, channels: 4 } })
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toBuffer(),
      );
      recipe = {
        kind: 'procedural',
        compilerId:
          compiled.spec.schemaVersion === 3
            ? PROCEDURAL_TEXTURE_V3_COMPILER_ID
            : 'kiln.procedural-texture.v2',
        spec: compiled.spec,
        recipeHash: compiled.recipeHash,
        pixelHash,
        encoder,
        ...(raw['derive']
          ? {
              derive: structuredClone(raw['derive']) as {
                kind: 'normal-from-height';
                strength: number;
              },
            }
          : {}),
      };
    } else if (item.atlas !== undefined) {
      const compiled = await compileTextureAtlasSpecV1(item.atlas, { resources });
      pixelHash = compiled.manifest.decodedPixelHash;
      bytes = new Uint8Array(
        await sharp(compiled.pixels, {
          raw: { width: compiled.spec.width, height: compiled.spec.height, channels: 4 },
        })
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toBuffer(),
      );
      recipe = {
        kind: 'atlas',
        compilerId: compiled.manifest.compilerId,
        spec: compiled.spec,
        manifest: compiled.manifest,
        encoder,
      };
      for (const r of compiled.spec.regions)
        if (r.source.kind === 'resource')
          pins.set(`${r.source.pin.resourceId}/${r.source.pin.revisionId}`, r.source.pin);
    } else {
      bytes = item.bytes!.slice();
      const decoded = await sharp(bytes, {
        limitInputPixels: MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
        failOn: 'warning',
      })
        .ensureAlpha()
        .raw()
        .toBuffer();
      pixelHash = digest(decoded);
    }
    const d = materialPngDimensions(bytes),
      file = `${slot}.png` as MaterialMapV2['file'];
    if (files[file]) throw new Error('Duplicate material map slot');
    files[file] = bytes;
    maps.push({
      slot,
      file,
      ...d,
      sha256: digest(bytes),
      bytes: bytes.length,
      usage: MATERIAL_LIBRARY_USAGE[slot],
      colorSpace: slot === 'baseColor' || slot === 'emissive' ? 'srgb' : 'linear',
      sampler,
      pixelHash,
      sourceId: raw['sourceId'] as string,
      transforms: structuredClone(raw['transforms']) as MaterialTransformV1[],
      ...(slot === 'normal'
        ? {
            normalConvention: (raw['normalConvention'] ??
              (recipe ? 'opengl' : undefined)) as 'opengl',
          }
        : {}),
      ...(slot === 'metallicRoughness'
        ? {
            channelPacking: (raw['channelPacking'] ??
              (recipe
                ? 'r-occlusion-g-roughness-b-metallic'
                : undefined)) as 'r-occlusion-g-roughness-b-metallic',
          }
        : {}),
      ...(raw['originalFile'] ? { originalFile: raw['originalFile'] as string } : {}),
      ...(recipe ? { recipe } : {}),
    });
  }
  const manifest = materialManifestV2Schema.parse({
    ...input,
    schemaVersion: 2,
    revisionId: `sha256:${'0'.repeat(64)}`,
    tags: input['tags'] ?? [],
    parameters: input['parameters'] ?? {},
    maps,
    dependencies: [...pins.values()],
  });
  manifest.revisionId = revisionHash(manifest);
  const record = { manifest, files };
  await verifyMaterialRecord(record, { materials: [...records, record] });
  return record;
}
