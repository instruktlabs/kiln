/** Portable project packages. ZIP paths are closed data, never extraction destinations. */
import { z } from 'zod';
import { zipSync, unzipSync } from 'three/addons/libs/fflate.module.js';
import {
  assetIdSchema,
  assetManifestSchema,
  validateRecordShape,
  validateAssetGlb,
  type AssetRecord,
  type AssetManifest,
} from './assets';
import { exportAssetGlb } from './asset-export';
import { MAX_PROJECT_REVISIONS, projectRevisionSchema, type ProjectRevision } from './projects';
import {
  canonicalMaterialJson,
  materialManifestSchema,
  validateMaterialRecordShape,
  type MaterialRecordV1,
} from './material-library';

export const PROJECT_BUNDLE_LIMITS = Object.freeze({
  maxBytes: 256 * 1024 * 1024,
  maxArchiveBytes: 264 * 1024 * 1024,
  maxEntries: 8192,
  maxManifestBytes: 2 * 1024 * 1024,
});
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = '[a-z][a-z0-9_-]{0,79}';
const pathSchema = z
  .string()
  .regex(
    new RegExp(
      `^(project\\.json|materials/${id}/[a-f0-9]{64}/(manifest\\.json|baseColor\\.png|normal\\.png|metallicRoughness\\.png|emissive\\.png|occlusion\\.png)|assets/${id}/${id}/${id}/(manifest\\.json|asset\\.glb|source\\.kiln\\.js|preview\\.png|runtime\\.glb|runtime\\.kiln-metadata\\.json))$`,
    ),
  );
const identitySchema = z
  .object({
    inventoryId: assetIdSchema,
    collectionId: assetIdSchema,
    assetId: assetIdSchema,
    revisionId: assetIdSchema,
    canonicalGlbSha256: hashSchema,
  })
  .strict();
export const projectBundleManifestSchema = z
  .object({
    version: z.literal('kiln.project-bundle.v1'),
    profile: z.enum(['editable', 'runtime']),
    editable: z.boolean(),
    resourceClosure: z.enum(['normalized-maps-and-procedural-recipes', 'embedded-runtime-only']),
    referenceMediaIncluded: z.literal(false),
    originalAcquisitionFilesIncluded: z.literal(false),
    assets: z.array(identitySchema).max(1000),
    materials: z
      .array(z.object({ materialId: assetIdSchema, revisionId: hashSchema }).strict())
      .max(1024),
    files: z.record(
      pathSchema,
      z
        .object({
          sha256: hashSchema,
          bytes: z
            .number()
            .int()
            .nonnegative()
            .max(64 * 1024 * 1024),
        })
        .strict(),
    ),
  })
  .strict();
export type ProjectBundleManifest = z.infer<typeof projectBundleManifestSchema>;
export interface ProjectBundleAsset {
  inventoryId: string;
  collectionId: string;
  record: AssetRecord;
}
export interface ProjectBundleInput {
  project: ProjectRevision;
  materials: MaterialRecordV1[];
  assets: ProjectBundleAsset[];
}
export interface DecodedProjectBundle extends ProjectBundleInput {
  manifest: ProjectBundleManifest;
  runtimeAssets: {
    identity: ProjectBundleManifest['assets'][number];
    glb: Uint8Array;
    metadata: unknown;
  }[];
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const bytesOf = (value: unknown) => encoder.encode(JSON.stringify(value));
export async function projectBundleHash(bytes: Uint8Array): Promise<string> {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
  return `sha256:${Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function verifyProjectBundleSnapshot(value: unknown): Promise<ProjectRevision> {
  const project = projectRevisionSchema.parse(value);
  const { revisionId, ...payload } = project;
  const sequence = Number(revisionId.slice(2, 12));
  if (
    sequence < 1 ||
    sequence > MAX_PROJECT_REVISIONS ||
    (sequence === 1 && project.parentRevision) ||
    (sequence > 1 &&
      (!project.parentRevision || Number(project.parentRevision.slice(2, 12)) !== sequence - 1))
  )
    throw new Error('Invalid project snapshot revision sequence');
  if (`sha256:${revisionId.slice(13)}` !== (await projectBundleHash(bytesOf(payload))))
    throw new Error('Project snapshot hash mismatch');
  return project;
}
async function verifyAsset(record: AssetRecord) {
  validateRecordShape(record);
  for (const [name, file] of Object.entries(record.files))
    if ((await projectBundleHash(file)) !== record.manifest.files[name]!.sha256)
      throw new Error('Asset file hash mismatch');
}
async function verifyMaterial(record: MaterialRecordV1) {
  const manifest = validateMaterialRecordShape(record);
  const { revisionId, ...payload } = manifest;
  if ((await projectBundleHash(encoder.encode(canonicalMaterialJson(payload)))) !== revisionId)
    throw new Error('Material revision hash mismatch');
  for (const map of manifest.maps)
    if ((await projectBundleHash(record.files[map.file]!)) !== map.sha256)
      throw new Error('Material file hash mismatch');
}
const assetPrefix = (entry: { collectionId: string; assetId: string; revisionId: string }) =>
  `assets/${entry.collectionId}/${entry.assetId}/${entry.revisionId}/`;
const materialPrefix = (entry: { materialId: string; revisionId: string }) =>
  `materials/${entry.materialId}/${entry.revisionId.slice(7)}/`;
function assertAssetSelection(project: ProjectRevision, entries: ProjectBundleManifest['assets']) {
  if (new Set(entries.map((entry) => entry.inventoryId)).size !== entries.length)
    throw new Error('Duplicate bundle inventory selection');
  for (const entry of entries) {
    const item = project.inventory.find((item) => item.id === entry.inventoryId);
    if (
      !item?.asset ||
      item.asset.collectionId !== entry.collectionId ||
      item.asset.assetId !== entry.assetId ||
      item.asset.revisionId !== entry.revisionId
    )
      throw new Error('Bundle inventory asset binding mismatch');
  }
}
function assertMaterialClosure(project: ProjectRevision, records: MaterialRecordV1[]) {
  const identities = records.map(
    (record) => `${record.manifest.materialId}/${record.manifest.revisionId}`,
  );
  if (new Set(identities).size !== identities.length)
    throw new Error('Duplicate material revision');
  for (const dependency of project.materialDependencies)
    if (
      dependency.sha256 !== dependency.revisionId ||
      !identities.includes(`${dependency.resourceId}/${dependency.revisionId}`)
    )
      throw new Error(`Missing locked material: ${dependency.resourceId}`);
}

/** Editable includes normalized rebuild resources; runtime intentionally excludes source/recipes. */
export async function encodeProjectBundle(
  input: ProjectBundleInput,
  profile: 'editable' | 'runtime' = 'editable',
): Promise<Uint8Array> {
  if (profile !== 'editable' && profile !== 'runtime')
    throw new Error('Unknown project bundle profile');
  const project = await verifyProjectBundleSnapshot(input.project);
  if (input.assets.length > 1000 || input.materials.length > 1024)
    throw new Error('Project bundle record limit exceeded');
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  const add = (name: string, bytes: Uint8Array) => {
    pathSchema.parse(name);
    if (files[name]) {
      if (
        files[name]!.length !== bytes.length ||
        !files[name]!.every((byte, index) => byte === bytes[index])
      )
        throw new Error('Conflicting duplicate bundle path');
      return;
    }
    total += bytes.length;
    if (
      total > PROJECT_BUNDLE_LIMITS.maxBytes ||
      Object.keys(files).length >= PROJECT_BUNDLE_LIMITS.maxEntries - 1
    )
      throw new Error('Project bundle exceeds byte or entry limit');
    files[name] = Uint8Array.from(bytes);
  };
  add('project.json', bytesOf(project));
  const assets: ProjectBundleManifest['assets'] = [];
  for (const entry of input.assets) {
    await verifyAsset(entry.record);
    const identity = identitySchema.parse({
      inventoryId: entry.inventoryId,
      collectionId: entry.collectionId,
      assetId: entry.record.manifest.assetId,
      revisionId: entry.record.manifest.revisionId,
      canonicalGlbSha256: entry.record.manifest.files['asset.glb']!.sha256,
    });
    assets.push(identity);
    const prefix = assetPrefix(identity);
    if (profile === 'editable') {
      if (!entry.record.manifest.editable || !entry.record.files['source.kiln.js'])
        throw new Error('Editable bundle requires source for every selected asset');
      add(`${prefix}manifest.json`, bytesOf(entry.record.manifest));
      for (const [name, bytes] of Object.entries(entry.record.files)) add(prefix + name, bytes);
    } else {
      const runtime = await exportAssetGlb(entry.record, { profile: 'runtime' });
      if (runtime.profile !== 'runtime') throw new Error('Runtime profile mismatch');
      add(`${prefix}runtime.glb`, runtime.glb);
      add(prefix + runtime.metadata.name, runtime.metadata.bytes);
    }
  }
  assertAssetSelection(project, assets);
  const materials: ProjectBundleManifest['materials'] = [];
  if (profile === 'editable') {
    assertMaterialClosure(project, input.materials);
    for (const record of input.materials) {
      await verifyMaterial(record);
      materials.push({
        materialId: record.manifest.materialId,
        revisionId: record.manifest.revisionId,
      });
      const prefix = materialPrefix(record.manifest);
      add(`${prefix}manifest.json`, bytesOf(record.manifest));
      for (const [name, bytes] of Object.entries(record.files)) add(prefix + name, bytes);
    }
  }
  const manifest = projectBundleManifestSchema.parse({
    version: 'kiln.project-bundle.v1',
    profile,
    editable: profile === 'editable',
    resourceClosure:
      profile === 'editable' ? 'normalized-maps-and-procedural-recipes' : 'embedded-runtime-only',
    referenceMediaIncluded: false,
    originalAcquisitionFilesIncluded: false,
    assets,
    materials,
    files: Object.fromEntries(
      await Promise.all(
        Object.entries(files).map(async ([name, bytes]) => [
          name,
          { sha256: await projectBundleHash(bytes), bytes: bytes.length },
        ]),
      ),
    ),
  });
  const manifestBytes = bytesOf(manifest);
  if (
    manifestBytes.length > PROJECT_BUNDLE_LIMITS.maxManifestBytes ||
    total + manifestBytes.length > PROJECT_BUNDLE_LIMITS.maxBytes
  )
    throw new Error('Project bundle manifest exceeds byte limit');
  files['bundle.json'] = manifestBytes;
  // ZIP timestamps describe packaging, not project history; fix them for repeatable bytes.
  return zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
}

/** Validate the complete archive before consumers can perform any filesystem writes. */
export async function decodeProjectBundle(bytes: Uint8Array): Promise<DecodedProjectBundle> {
  if (bytes.length > PROJECT_BUNDLE_LIMITS.maxArchiveBytes)
    throw new Error('Project archive exceeds byte limit');
  let total = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (entry) => {
      if (
        (entry.name !== 'bundle.json' && !pathSchema.safeParse(entry.name).success) ||
        names.has(entry.name)
      )
        throw new Error('Unsafe or duplicate project ZIP path');
      names.add(entry.name);
      total += entry.originalSize;
      if (names.size > PROJECT_BUNDLE_LIMITS.maxEntries || total > PROJECT_BUNDLE_LIMITS.maxBytes)
        throw new Error('Project archive exceeds expanded byte or entry limit');
      return true;
    },
  });
  const json = (name: string, limit = 1024 * 1024): unknown => {
    const data = files[name];
    if (!data || data.length > limit) throw new Error(`Missing or oversized bundle JSON: ${name}`);
    const value: unknown = JSON.parse(decoder.decode(data));
    const pending = [{ value, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const item = pending.pop()!;
      if (++nodes > 100000 || item.depth > 64)
        throw new Error('Bundle JSON exceeds structural bounds');
      if (item.value && typeof item.value === 'object')
        for (const child of Object.values(item.value))
          pending.push({ value: child, depth: item.depth + 1 });
    }
    return value;
  };
  const manifest = projectBundleManifestSchema.parse(
    json('bundle.json', PROJECT_BUNDLE_LIMITS.maxManifestBytes),
  );
  if (
    manifest.editable !== (manifest.profile === 'editable') ||
    manifest.resourceClosure !==
      (manifest.editable ? 'normalized-maps-and-procedural-recipes' : 'embedded-runtime-only')
  )
    throw new Error('Inconsistent bundle delivery profile');
  if (Object.keys(manifest.files).length !== names.size - 1)
    throw new Error('Bundle file inventory mismatch');
  for (const [name, info] of Object.entries(manifest.files)) {
    const data = files[name];
    if (!data || data.length !== info.bytes || (await projectBundleHash(data)) !== info.sha256)
      throw new Error(`Bundle file hash mismatch: ${name}`);
  }
  const project = await verifyProjectBundleSnapshot(json('project.json'));
  assertAssetSelection(project, manifest.assets);
  const used = new Set(['bundle.json', 'project.json']);
  const assets: ProjectBundleAsset[] = [];
  const materials: MaterialRecordV1[] = [];
  const runtimeAssets: DecodedProjectBundle['runtimeAssets'] = [];
  for (const identity of manifest.assets) {
    const prefix = assetPrefix(identity);
    if (manifest.editable) {
      const original = json(`${prefix}manifest.json`);
      assetManifestSchema.parse(original);
      // Preserve unknown provenance exactly; validation must not silently migrate it.
      const assetManifest = original as AssetManifest;
      used.add(`${prefix}manifest.json`);
      if (
        assetManifest.assetId !== identity.assetId ||
        assetManifest.revisionId !== identity.revisionId ||
        assetManifest.files['asset.glb']?.sha256 !== identity.canonicalGlbSha256 ||
        !assetManifest.editable
      )
        throw new Error('Bundle asset identity mismatch');
      const record: AssetRecord = { manifest: assetManifest, files: {} };
      for (const name of Object.keys(assetManifest.files)) {
        const bytes = files[prefix + name];
        if (!bytes) throw new Error('Missing bundle asset file');
        record.files[name] = bytes;
        used.add(prefix + name);
      }
      await verifyAsset(record);
      assets.push({
        inventoryId: identity.inventoryId,
        collectionId: identity.collectionId,
        record,
      });
    } else {
      const glb = files[`${prefix}runtime.glb`];
      if (!glb) throw new Error('Missing runtime GLB');
      validateAssetGlb(glb);
      const metadata = json(`${prefix}runtime.kiln-metadata.json`);
      used.add(`${prefix}runtime.glb`);
      used.add(`${prefix}runtime.kiln-metadata.json`);
      const source = (
        metadata as { source?: { assetId?: string; revisionId?: string; glbSha256?: string } }
      ).source;
      if (
        source?.assetId !== identity.assetId ||
        source?.revisionId !== identity.revisionId ||
        source?.glbSha256 !== identity.canonicalGlbSha256
      )
        throw new Error('Runtime provenance mismatch');
      runtimeAssets.push({ identity, glb, metadata });
    }
  }
  if (!manifest.editable && manifest.materials.length)
    throw new Error('Runtime profile contains editable material records');
  for (const identity of manifest.materials) {
    const prefix = materialPrefix(identity);
    const materialManifest = materialManifestSchema.parse(
      json(`${prefix}manifest.json`, 256 * 1024),
    );
    used.add(`${prefix}manifest.json`);
    if (
      materialManifest.materialId !== identity.materialId ||
      materialManifest.revisionId !== identity.revisionId
    )
      throw new Error('Bundle material identity mismatch');
    const record: MaterialRecordV1 = { manifest: materialManifest, files: {} };
    for (const map of materialManifest.maps) {
      const bytes = files[prefix + map.file];
      if (!bytes) throw new Error('Missing material map');
      record.files[map.file] = bytes;
      used.add(prefix + map.file);
    }
    await verifyMaterial(record);
    materials.push(record);
  }
  if (manifest.editable) assertMaterialClosure(project, materials);
  if (used.size !== names.size) throw new Error('Unreferenced files in project bundle');
  return { manifest, project, materials, assets, runtimeAssets };
}
