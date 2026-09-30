/** Local durable collections; immutable revisions become visible by directory rename. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, type Dirent } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { localWorkspaceRoot } from './workspace-location';
import {
  assetIdSchema,
  assetManifestSchema,
  ASSET_LIMIT,
  ASSET_MATERIAL_BYTES,
  ASSET_MATERIAL_FILE,
  encodeAssetBundle,
  validateRecordShape,
  type AssetDraft,
  type AssetLibrary,
  type AssetManifest,
  type AssetRecord,
} from './assets';
import type { MaterialLibrary, MaterialRecordV1 } from './material-library';
import { FileMaterialLibrary, createMaterialLibraryPayload } from './material-library-node';
import { dependencyManifests, resolveSavedAssetMaterials } from './asset-materials-node';

const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function assertMaterialAllocation(records: AssetRecord[]): void {
  let bytes = 0;
  for (const record of records)
    for (const manifest of dependencyManifests(record))
      for (const map of manifest.maps) {
        bytes += map.bytes;
        if (bytes > ASSET_LIMIT) throw new Error('Asset material batch exceeds allocation limit');
      }
}
export async function verifyAssetRecord(record: AssetRecord): Promise<void> {
  for (const [name, info] of Object.entries(record.manifest.files)) {
    const bytes = record.files[name];
    if (!bytes || bytes.length !== info.bytes || digest(bytes) !== info.sha256)
      throw new Error(`Asset integrity failure: ${name}`);
  }
  validateRecordShape(record);
  if (record.materialResources) await resolveSavedAssetMaterials(record);
}
export class FileAssetLibrary implements AssetLibrary {
  private readonly roots: Record<string, string>;
  constructor(
    roots: Record<string, string>,
    private readonly materials?: MaterialLibrary,
  ) {
    if (!Object.keys(roots).length) throw new Error('Configure at least one collection');
    this.roots = Object.fromEntries(
      Object.entries(roots).map(([id, path]) => [assetIdSchema.parse(id), resolve(path)]),
    );
  }
  collections() {
    return Object.keys(this.roots).map((id) => ({
      id,
      label:
        id === 'project' ? 'Workspace storage' : id === 'library' ? 'User library storage' : id,
    }));
  }
  directory(collection: string): string {
    const root = this.roots[collection];
    if (!root || !Object.hasOwn(this.roots, collection)) throw new Error('Unknown collection');
    return root;
  }
  private async path(collection: string, ...parts: string[]): Promise<string> {
    const root = this.directory(collection);
    await mkdir(root, { recursive: true });
    const canonical = await realpath(root);
    let path = root;
    for (const part of parts) {
      assetIdSchema.parse(part);
      path = join(path, part);
      try {
        const entry = await lstat(path);
        if (entry.isSymbolicLink()) throw new Error('Collection symlinks are not supported');
        const rel = relative(canonical, await realpath(path));
        if (rel === '..' || rel.startsWith(`..${sep}`))
          throw new Error('Collection path escapes root');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return path;
  }
  async list(collection: string): Promise<AssetManifest[]> {
    const root = await this.path(collection);
    const records: AssetManifest[] = [];
    for (const asset of await readdir(root, { withFileTypes: true })) {
      if (!asset.isDirectory() || !assetIdSchema.safeParse(asset.name).success) continue;
      const revisions = await this.path(collection, asset.name, 'revisions');
      let entries: Dirent[];
      try {
        entries = await readdir(revisions, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      for (const revision of entries) {
        if (!revision.isDirectory() || !revision.name.startsWith('r_')) continue;
        const dir = await this.path(collection, asset.name, 'revisions', revision.name);
        const manifest = assetManifestSchema.parse(
          JSON.parse(new TextDecoder().decode(await this.file(dir, 'manifest.json', 1024 * 1024))),
        );
        if (manifest.assetId !== asset.name || manifest.revisionId !== revision.name)
          throw new Error('Asset identity mismatch');
        records.push(manifest);
      }
    }
    return records.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.revisionId.localeCompare(b.revisionId),
    );
  }
  private async file(dir: string, name: string, limit = ASSET_LIMIT): Promise<Uint8Array> {
    const path = join(dir, name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
      throw new Error('Invalid collection file');
    return new Uint8Array(await readFile(path));
  }
  async read(collection: string, assetId: string, revisionId: string): Promise<AssetRecord> {
    const dir = await this.path(collection, assetId, 'revisions', revisionId);
    const original = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await this.file(dir, 'manifest.json', 1024 * 1024),
      ),
    );
    // Validate known fields without discarding unrecognized provenance. Explicit
    // migration must see those fields and stop, rather than unknowingly drop them.
    assetManifestSchema.parse(original);
    const manifest: AssetManifest = original;
    if (manifest.assetId !== assetId || manifest.revisionId !== revisionId)
      throw new Error('Asset identity mismatch');
    const files: Record<string, Uint8Array> = {};
    for (const name of Object.keys(manifest.files)) {
      if (!['asset.glb', 'source.kiln.js', 'preview.png'].includes(name))
        throw new Error('Invalid collection filename');
      files[name] = await this.file(dir, name);
    }
    const record: AssetRecord = { manifest, files };
    try {
      record.materialResources = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await this.file(dir, ASSET_MATERIAL_FILE, ASSET_MATERIAL_BYTES),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await verifyAssetRecord(record);
    return record;
  }
  async exportBundle(records: AssetRecord[]): Promise<Uint8Array> {
    if (!records.length || records.length > 100)
      throw new Error('Bundle requires 1..100 revisions');
    assertMaterialAllocation(records);
    const portable: AssetRecord[] = [];
    for (const record of records) {
      await verifyAssetRecord(record);
      const materials = await resolveSavedAssetMaterials(record, this.materials);
      portable.push({
        ...record,
        ...(materials.length
          ? { materialResources: await createMaterialLibraryPayload(materials) }
          : {}),
      });
    }
    return encodeAssetBundle(portable);
  }
  async save(collection: string, draft: AssetDraft): Promise<AssetManifest> {
    const assetId = draft.assetId ?? `a_${randomUUID().replaceAll('-', '')}`;
    if (draft.parentRevision) await this.read(collection, assetId, draft.parentRevision);
    if (
      draft.assetId &&
      !draft.parentRevision &&
      (await this.list(collection)).some((m) => m.assetId === assetId)
    )
      throw new Error('An existing asset requires parentRevision');
    const files: Record<string, Uint8Array> = { 'asset.glb': Uint8Array.from(draft.glb) };
    if (draft.code !== undefined) files['source.kiln.js'] = new TextEncoder().encode(draft.code);
    if (draft.preview) files['preview.png'] = Uint8Array.from(draft.preview);
    const manifest: AssetManifest = assetManifestSchema.parse({
      version: 'kiln.asset.v1',
      assetId,
      revisionId: `r_${randomUUID().replaceAll('-', '')}`,
      parentRevision: draft.parentRevision,
      name: draft.name,
      tags: draft.tags ?? [],
      createdAt: new Date().toISOString(),
      brief: draft.brief,
      description: draft.description,
      attribution: draft.attribution,
      editable: draft.code !== undefined,
      files: Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [
          name,
          { sha256: digest(bytes), bytes: bytes.length },
        ]),
      ),
      build: draft.build
        ? { ...draft.build, rebuild: draft.build.rebuild ?? 'engine-required' }
        : undefined,
      preview: draft.previewInfo,
    });
    await this.import(collection, [{ manifest, files }]);
    return manifest;
  }
  async import(collection: string, records: AssetRecord[]): Promise<AssetManifest[]> {
    if (!records.length || records.length > 100)
      throw new Error('Import requires 1..100 revisions');
    this.directory(collection);
    assertMaterialAllocation(
      records.filter(
        (record) =>
          record.materialResources ||
          record.manifest.build?.dependencies?.some(
            (raw) =>
              raw &&
              typeof raw === 'object' &&
              (raw as Record<string, unknown>).kind === 'kiln.material.v1',
          ),
      ),
    );
    let resourceBytes = 0;
    for (const record of records) {
      validateRecordShape(record);
      for (const wire of record.materialResources?.records ?? [])
        for (const map of wire.manifest.maps) resourceBytes += map.bytes;
    }
    if (resourceBytes > ASSET_LIMIT)
      throw new Error('Asset material import exceeds allocation limit');
    const prepared: AssetRecord[] = [];
    const resources = new Map<string, MaterialRecordV1>();
    // Validate the whole input before writing anything; per-revision commits are atomic.
    for (const record of records) {
      await verifyAssetRecord(record);
      if (Buffer.byteLength(`${JSON.stringify(record.manifest, null, 2)}\n`, 'utf8') > 1024 * 1024)
        throw new Error('Manifest exceeds 1 MiB; no revision was written.');
      if (
        record.materialResources ||
        (this.materials &&
          record.manifest.build?.dependencies?.some(
            (raw) =>
              raw &&
              typeof raw === 'object' &&
              (raw as Record<string, unknown>).kind === 'kiln.material.v1',
          ))
      ) {
        const materials = await resolveSavedAssetMaterials(record, this.materials);
        for (const material of materials) resources.set(material.manifest.revisionId, material);
        prepared.push({
          ...record,
          materialResources: await createMaterialLibraryPayload(materials),
        });
      } else prepared.push(record);
    }
    if (this.materials && resources.size) await this.materials.import([...resources.values()]);
    for (const record of prepared) {
      const { manifest, files } = record;
      const dest = await this.path(collection, manifest.assetId, 'revisions', manifest.revisionId);
      const parent = dirname(dest);
      await mkdir(parent, { recursive: true });
      const stage = join(parent, `.write-${randomUUID()}`);
      await mkdir(stage);
      try {
        for (const [name, bytes] of Object.entries(files))
          await writeFile(join(stage, name), bytes, { flag: 'wx' });
        if (record.materialResources)
          await writeFile(
            join(stage, ASSET_MATERIAL_FILE),
            JSON.stringify(record.materialResources),
            { flag: 'wx' },
          );
        await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
          flag: 'wx',
        });
        try {
          await rename(stage, dest);
        } catch (error) {
          const existing = await this.read(collection, manifest.assetId, manifest.revisionId).catch(
            () => undefined,
          );
          if (!existing || JSON.stringify(existing.manifest) !== JSON.stringify(manifest))
            throw error;
          // Supplemental closure can enrich a legacy revision without changing its
          // canonical manifest. A hard link publishes the complete file exclusively.
          if (record.materialResources && !existing.materialResources) {
            try {
              await link(join(stage, ASSET_MATERIAL_FILE), join(dest, ASSET_MATERIAL_FILE));
            } catch (enrichmentError) {
              if ((enrichmentError as NodeJS.ErrnoException).code !== 'EEXIST')
                throw enrichmentError;
              const enriched = await this.read(collection, manifest.assetId, manifest.revisionId);
              if (!enriched.materialResources)
                throw new Error('Asset material enrichment was not published');
            }
          }
        }
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    }
    return records.map((r) => r.manifest);
  }
}
export function collectionConfigPath(
  env: Record<string, string | undefined> = process.env,
): string {
  return join(localWorkspaceRoot(env), '.kiln', 'collections.json');
}

export function defaultUserLibraryRoot(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
  operatingSystem = platform(),
): string {
  const dataRoot = env.XDG_DATA_HOME?.trim();
  if (dataRoot) return join(dataRoot, 'kiln', 'library');
  if (operatingSystem === 'darwin')
    return join(home, 'Library', 'Application Support', 'Kiln', 'library');
  if (operatingSystem === 'win32')
    return join(env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local'), 'Kiln', 'library');
  return join(home, '.local', 'share', 'kiln', 'library');
}

export function localAssetLibrary(
  env: Record<string, string | undefined> = process.env,
): FileAssetLibrary {
  if (env.KILN_COLLECTIONS) {
    const value = JSON.parse(env.KILN_COLLECTIONS);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.values(value).some((v) => typeof v !== 'string' || !v)
    )
      throw new Error('KILN_COLLECTIONS must map collection names to directories');
    return new FileAssetLibrary(
      value,
      new FileMaterialLibrary(join(localWorkspaceRoot(env), '.kiln', 'materials')),
    );
  }
  const config = collectionConfigPath(env);
  try {
    const text = readFileSync(config, 'utf8');
    if (!text.trim()) throw new Error('Collection configuration is empty');
    return localAssetLibrary({ ...env, KILN_COLLECTIONS: text });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const workspace = dirname(dirname(config));
  return new FileAssetLibrary(
    {
      project: join(workspace, 'assets', 'kiln'),
      library: defaultUserLibraryRoot(env),
    },
    new FileMaterialLibrary(join(workspace, '.kiln', 'materials')),
  );
}
