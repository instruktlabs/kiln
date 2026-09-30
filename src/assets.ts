/** Portable asset records. No filesystem, renderer, or server dependencies. */
import { z } from 'zod';
import { BACKDROP_IDS, type BackdropId } from './views/background';
import { zipSync, unzipSync } from 'three/addons/libs/fflate.module.js';
import {
  assertMaterialJson,
  canonicalMaterialJson,
  materialLibraryPayloadSchema,
  validateMaterialManifest,
  MATERIAL_LIBRARY_LIMITS,
  type MaterialLibraryPayloadV1,
} from './material-library';

export const ASSET_LIMIT = 64 * 1024 * 1024;
export const assetIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const assetManifestSchema = z.object({
  version: z.literal('kiln.asset.v1'),
  assetId: assetIdSchema,
  revisionId: assetIdSchema,
  parentRevision: assetIdSchema.optional(),
  name: z.string().min(1).max(200),
  tags: z.array(z.string().max(80)).max(30),
  createdAt: z.string().datetime(),
  description: z.string().max(4000).optional(),
  brief: z.string().max(8000).optional(),
  attribution: z
    .object({
      model: z.string().max(200).optional(),
      harness: z.string().max(200).optional(),
      author: z.string().max(200).optional(),
    })
    .optional(),
  editable: z.boolean(),
  files: z.record(
    z.string(),
    z.object({ sha256: hash, bytes: z.number().int().nonnegative().max(ASSET_LIMIT) }),
  ),
  build: z
    .object({
      engine: z.string(),
      options: z.record(z.string(), z.unknown()),
      warnings: z.array(z.string()),
      integration: z.unknown().optional(),
      qa: z.unknown().optional(),
      dependencies: z.array(z.unknown()).optional(),
      rebuild: z.enum(['engine-required', 'external-dependencies-required']),
    })
    .optional(),
  preview: z
    .object({
      fidelity: z.unknown().optional(),
      error: z.string().optional(),
      /** The named backdrop the preview was painted on; a reader must never guess it. */
      backdrop: z.enum(BACKDROP_IDS as [BackdropId, ...BackdropId[]]).optional(),
    })
    .optional(),
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export interface AssetRecord {
  manifest: AssetManifest;
  files: Record<string, Uint8Array>;
  /** Editable delivery closure; not part of the canonical asset manifest or revision identity. */
  materialResources?: MaterialLibraryPayloadV1;
}
export interface AssetDraft {
  name: string;
  tags?: string[];
  assetId?: string;
  parentRevision?: string;
  code?: string;
  glb: Uint8Array;
  preview?: Uint8Array;
  description?: string;
  brief?: string;
  attribution?: AssetManifest['attribution'];
  build?: Omit<NonNullable<AssetManifest['build']>, 'rebuild'> & {
    rebuild?: NonNullable<AssetManifest['build']>['rebuild'];
  };
  previewInfo?: AssetManifest['preview'];
}
export interface AssetLibrary {
  collections(): { id: string; label: string }[];
  list(collection: string): Promise<AssetManifest[]>;
  save(collection: string, draft: AssetDraft): Promise<AssetManifest>;
  read(collection: string, assetId: string, revisionId: string): Promise<AssetRecord>;
  import(collection: string, records: AssetRecord[]): Promise<AssetManifest[]>;
  /** Hosts can resolve exact saved dependencies before making an editable ZIP. */
  exportBundle?(records: AssetRecord[]): Promise<Uint8Array>;
}
export const ASSET_MATERIAL_FILE = 'materials.kiln.json';
export const ASSET_MATERIAL_BYTES = 24 * 1024 * 1024;
/** Shape and closure checks are portable; hosts verify hashes and PNG/recipe bytes before import. */
export function validateAssetMaterialClosure(record: AssetRecord, required = false): void {
  const dependencies = (record.manifest.build?.dependencies ?? []).filter(
    (raw) =>
      raw &&
      typeof raw === 'object' &&
      (raw as Record<string, unknown>).kind === 'kiln.material.v1',
  ) as { manifest: unknown; delivery: unknown }[];
  const expected = new Map(
    dependencies.map((dependency) => {
      if (dependency.delivery !== 'runtime') throw new Error('Invalid saved material dependency');
      const manifest = validateMaterialManifest(dependency.manifest);
      return [`${manifest.materialId}/${manifest.revisionId}`, canonicalMaterialJson(manifest)];
    }),
  );
  if (!record.materialResources) {
    if (required && expected.size) throw new Error('Editable asset material closure unavailable');
    return;
  }
  assertMaterialJson(record.materialResources);
  const payload = materialLibraryPayloadSchema.parse(record.materialResources);
  let bytes = 0;
  let pixels = 0;
  const seen = new Set<string>();
  for (const wire of payload.records) {
    const key = `${wire.manifest.materialId}/${wire.manifest.revisionId}`;
    if (seen.has(key) || expected.get(key) !== canonicalMaterialJson(wire.manifest))
      throw new Error('Asset material closure mismatch');
    seen.add(key);
    if (Object.keys(wire.files).length !== wire.manifest.maps.length)
      throw new Error('Asset material map inventory mismatch');
    for (const map of wire.manifest.maps) {
      if (wire.files[map.file]?.length !== Math.ceil(map.bytes / 3) * 4)
        throw new Error('Asset material map size mismatch');
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
  }
  if (seen.size !== expected.size) throw new Error('Asset material closure incomplete');
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Asset material closure exceeds allocation limits');
}
const allowedFiles = new Set(['asset.glb', 'source.kiln.js', 'preview.png']);
export function validateRecordShape(record: AssetRecord): void {
  const manifest = assetManifestSchema.parse(record.manifest);
  const names = Object.keys(record.files);
  if (names.length !== Object.keys(manifest.files).length || !names.includes('asset.glb'))
    throw new Error('Asset file inventory mismatch');
  let total = 0;
  for (const name of names) {
    if (
      !allowedFiles.has(name) ||
      !manifest.files[name] ||
      manifest.files[name].bytes !== record.files[name]!.length
    )
      throw new Error('Invalid asset file inventory');
    total += record.files[name]!.length;
  }
  if (total > ASSET_LIMIT || manifest.editable !== names.includes('source.kiln.js'))
    throw new Error('Invalid asset size or source inventory');
  if ((record.files['source.kiln.js']?.length ?? 0) > 1024 * 1024)
    throw new Error('Source exceeds 1 MiB');
  validateAssetGlb(record.files['asset.glb']!);
  validateAssetMaterialClosure(record);
}
/** A viewer must not fetch external URLs embedded in a purported standalone GLB. */
export function validateAssetGlb(bytes: Uint8Array): void {
  if (bytes.length < 20 || bytes.length > ASSET_LIMIT) throw new Error('Invalid GLB size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Invalid GLB header');
  const end = 20 + view.getUint32(12, true);
  if (end > bytes.length) throw new Error('Invalid GLB JSON length');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, end)));
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !String(resource.uri).startsWith('data:'))
      throw new Error('GLB must embed its resources');
  }
}
export function encodeAssetBundle(records: AssetRecord[]): Uint8Array {
  if (!records.length || records.length > 100) throw new Error('Bundle requires 1..100 revisions');
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  for (const record of records) {
    validateRecordShape(record);
    validateAssetMaterialClosure(record, true);
    const prefix = `${record.manifest.assetId}/${record.manifest.revisionId}/`;
    if (files[`${prefix}manifest.json`]) throw new Error('Duplicate bundle revision');
    files[`${prefix}manifest.json`] = new TextEncoder().encode(
      JSON.stringify(record.manifest, null, 2),
    );
    for (const [name, bytes] of Object.entries(record.files)) files[prefix + name] = bytes;
    if (record.materialResources) {
      const bytes = new TextEncoder().encode(JSON.stringify(record.materialResources));
      if (bytes.length > ASSET_MATERIAL_BYTES)
        throw new Error('Asset material payload exceeds byte limit');
      files[prefix + ASSET_MATERIAL_FILE] = bytes;
    }
  }
  for (const bytes of Object.values(files)) total += bytes.length;
  if (total > ASSET_LIMIT) throw new Error('Bundle exceeds 64 MiB');
  return zipSync(files, { level: 0 });
}
export function decodeAssetBundle(bytes: Uint8Array): AssetRecord[] {
  if (bytes.length > ASSET_LIMIT + 1024 * 1024) throw new Error('Bundle exceeds 64 MiB');
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      total += entry.originalSize;
      count++;
      if (
        total > ASSET_LIMIT ||
        count > 500 ||
        (entry.name.endsWith(`/${ASSET_MATERIAL_FILE}`) &&
          entry.originalSize > ASSET_MATERIAL_BYTES) ||
        !/^[a-z][a-z0-9_-]{0,79}\/[a-z][a-z0-9_-]{0,79}\/(manifest\.json|asset\.glb|source\.kiln\.js|preview\.png|materials\.kiln\.json)$/.test(
          entry.name,
        )
      )
        throw new Error('Unsafe or oversized asset bundle');
      return true;
    },
  });
  const records: AssetRecord[] = [];
  const used = new Set<string>();
  for (const [path, data] of Object.entries(files)) {
    if (!path.endsWith('/manifest.json')) continue;
    if (data.length > 1024 * 1024) throw new Error('Manifest exceeds 1 MiB');
    const manifest = assetManifestSchema.parse(JSON.parse(new TextDecoder().decode(data)));
    const prefix = `${manifest.assetId}/${manifest.revisionId}/`;
    if (path !== `${prefix}manifest.json`) throw new Error('Bundle identity mismatch');
    const record: AssetRecord = { manifest, files: {} };
    used.add(path);
    for (const name of Object.keys(manifest.files)) {
      if (!files[prefix + name]) throw new Error('Bundle file missing');
      record.files[name] = files[prefix + name]!;
      used.add(prefix + name);
    }
    if (files[prefix + ASSET_MATERIAL_FILE]) {
      record.materialResources = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(files[prefix + ASSET_MATERIAL_FILE]!),
      );
      used.add(prefix + ASSET_MATERIAL_FILE);
    }
    validateRecordShape(record);
    records.push(record);
  }
  if (!records.length || used.size !== Object.keys(files).length)
    throw new Error('Incomplete asset bundle');
  return records;
}
