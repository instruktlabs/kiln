/** Host import/export. All bytes and dependency identities are verified before publication. */
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { AssetLibrary, AssetRecord } from './assets';
import { verifyAssetRecord } from './assets-node';
import type { FileWorkspace } from './workspace-node';
import {
  projectDraftSchema,
  projectIdSchema,
  ProjectExistsError,
  ProjectNotFoundError,
  type ProjectRevision,
} from './projects';
import {
  canonicalMaterialJson,
  MATERIAL_LIBRARY_LIMITS,
  type MaterialManifest,
  type MaterialRecord,
} from './material-library';
import { dependencyManifests, resolveSavedAssetMaterials } from './asset-materials-node';
import {
  createMaterialLibraryPayload,
  verifyMaterialRecord,
  resolveMaterialRecordClosure,
  validateMaterialManifestIdentityAny,
} from './material-library-node';
import {
  PROJECT_BUNDLE_LIMITS,
  decodeProjectBundle,
  encodeProjectBundle,
  projectBundleHash,
  type ProjectBundleAsset,
} from './project-bundle';

async function assetMaterials(
  workspace: FileWorkspace,
  asset: AssetRecord,
): Promise<MaterialRecord[]> {
  return resolveSavedAssetMaterials(asset, workspace.materials);
}
export async function resolveAssetMaterialPayload(workspace: FileWorkspace, asset: AssetRecord) {
  await verifyAssetRecord(asset);
  return createMaterialLibraryPayload(await assetMaterials(workspace, asset));
}

export async function exportWorkspaceProjectBundle(
  workspace: FileWorkspace,
  library: AssetLibrary,
  projectId: string,
  options: { revisionId?: string; profile?: 'editable' | 'runtime'; inventoryIds?: string[] } = {},
): Promise<Uint8Array> {
  const project = await workspace.projects.read(projectId, options.revisionId);
  const profile = options.profile ?? 'editable';
  const selection =
    options.inventoryIds ?? project.inventory.filter((item) => item.asset).map((item) => item.id);
  if (new Set(selection).size !== selection.length)
    throw new Error('Duplicate inventory selection');
  const assets: ProjectBundleAsset[] = [];
  for (const id of selection) {
    const item = project.inventory.find((item) => item.id === id);
    if (!item?.asset) throw new Error(`Selected inventory item has no saved asset: ${id}`);
    assets.push({
      inventoryId: id,
      collectionId: item.asset.collectionId,
      record: await library.read(
        item.asset.collectionId,
        item.asset.assetId,
        item.asset.revisionId,
      ),
    });
  }
  let materials: MaterialRecord[] = [];
  if (profile === 'editable') {
    const roots = new Map<string, MaterialManifest>();
    const assetRoots = new Set<string>();
    const embedded = new Map<
      string,
      { manifest: MaterialManifest; files: Record<string, string> }
    >();
    const addRoot = (manifest: MaterialManifest) => {
      const key = `${manifest.materialId}/${manifest.revisionId}`;
      const previous = roots.get(key);
      if (previous && canonicalMaterialJson(previous) !== canonicalMaterialJson(manifest))
        throw new Error('Conflicting project material identity');
      roots.set(key, manifest);
    };
    for (const dependency of project.materialDependencies) {
      if (dependency.sha256 !== dependency.revisionId)
        throw new Error(`Material lock hash mismatch: ${dependency.resourceId}`);
      let manifest: MaterialManifest;
      try {
        manifest = await workspace.materials.readManifest(
          dependency.resourceId,
          dependency.revisionId,
        );
      } catch (error) {
        throw new Error(
          `Locked project material unavailable: ${dependency.resourceId} at ${dependency.revisionId}`,
          { cause: error },
        );
      }
      addRoot(manifest);
    }
    for (const asset of assets) {
      for (const manifest of dependencyManifests(asset.record)) {
        addRoot(manifest);
        assetRoots.add(`${manifest.materialId}/${manifest.revisionId}`);
      }
      for (const wire of asset.record.materialResources?.records ?? []) {
        const manifest = validateMaterialManifestIdentityAny(wire.manifest);
        const key = `${manifest.materialId}/${manifest.revisionId}`;
        const previous = embedded.get(key);
        if (
          previous &&
          (canonicalMaterialJson(previous.manifest) !== canonicalMaterialJson(manifest) ||
            canonicalMaterialJson(previous.files) !== canonicalMaterialJson(wire.files))
        )
          throw new Error('Conflicting embedded material identity');
        embedded.set(key, { manifest, files: wire.files });
      }
    }
    const lockedRead = async <T>(
      id: string,
      revision: string,
      read: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await read();
      } catch (error) {
        throw new Error(
          `Locked ${assetRoots.has(`${id}/${revision}`) ? 'asset' : 'project'} material unavailable: ${id} at ${revision}`,
          { cause: error },
        );
      }
    };
    materials = await resolveMaterialRecordClosure(
      [...roots.values()],
      {
        readManifest: async (id, revision) =>
          embedded.get(`${id}/${revision}`)?.manifest ??
          lockedRead(id, revision, () => workspace.materials.readManifest(id, revision)),
        read: async (id, revision) => {
          const wire = embedded.get(`${id}/${revision}`);
          if (!wire)
            return lockedRead(id, revision, () =>
              workspace.materials.readRecordFiles(id, revision),
            );
          return {
            manifest: wire.manifest,
            files: Object.fromEntries(
              Object.entries(wire.files).map(([name, value]) => [
                name,
                new Uint8Array(Buffer.from(value, 'base64')),
              ]),
            ),
          } as MaterialRecord;
        },
      },
      {
        maxRecords: 1024,
        maxBytes: PROJECT_BUNDLE_LIMITS.maxBytes,
        maxPixels: 1024 * MATERIAL_LIBRARY_LIMITS.maxRecordPixels,
      },
    );
  }
  return encodeProjectBundle({ project, assets, materials }, profile);
}

async function retainArchive(workspace: FileWorkspace, bytes: Uint8Array, digest: string) {
  const root = resolve(workspace.root);
  await mkdir(root, { recursive: true });
  const canonical = await realpath(root);
  let directory = root;
  for (const part of ['.kiln', 'imports']) {
    directory = join(directory, part);
    await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const info = await lstat(directory);
    const rel = relative(canonical, await realpath(directory));
    if (!info.isDirectory() || info.isSymbolicLink() || rel === '..' || rel.startsWith(`..${sep}`))
      throw new Error('Unsafe project import directory');
  }
  const file = join(directory, `${digest.slice(7)}.zip`);
  const temporary = join(directory, `.import-${randomUUID()}.tmp`);
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  try {
    try {
      await link(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await lstat(file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== bytes.length ||
        (await projectBundleHash(new Uint8Array(await readFile(file)))) !== digest
      )
        throw new Error('Imported archive integrity mismatch');
    }
  } finally {
    await unlink(temporary);
  }
}

/** Imports immutable resources first; only then publishes the new explicitly named project. */
export async function importWorkspaceProjectBundle(
  workspace: FileWorkspace,
  library: AssetLibrary,
  bytes: Uint8Array,
  options: { projectId: string; collectionId: string; name?: string },
): Promise<ProjectRevision> {
  projectIdSchema.parse(options.projectId);
  projectIdSchema.parse(options.collectionId);
  if (!(bytes instanceof Uint8Array) || bytes.length > PROJECT_BUNDLE_LIMITS.maxArchiveBytes)
    throw new Error('Project archive exceeds byte limit');
  const snapshot = Uint8Array.from(bytes);
  const decoded = await decodeProjectBundle(snapshot);
  if (!decoded.manifest.editable)
    throw new Error('Project import requires an editable bundle, not a runtime derivative');
  if (options.projectId === decoded.project.projectId)
    throw new Error(
      `Import requires a new project ID: ${options.projectId} is the packaged project's own id. Pass a different --id for the imported copy; the packaged id stays with the original.`,
    );
  if (!library.collections().some((collection) => collection.id === options.collectionId))
    throw new Error('Unknown import asset collection');
  try {
    await workspace.projects.read(options.projectId);
    throw new ProjectExistsError(options.projectId);
  } catch (error) {
    if (!(error instanceof ProjectNotFoundError)) throw error;
  }
  const resources = new Map(
    decoded.materials.map((record) => [
      `${record.manifest.materialId}/${record.manifest.revisionId}`,
      record,
    ]),
  );
  for (const record of decoded.materials)
    await verifyMaterialRecord(record, { materials: decoded.materials });
  for (const asset of decoded.assets) {
    await verifyAssetRecord(asset.record);
    for (const manifest of dependencyManifests(asset.record)) {
      const included = resources.get(`${manifest.materialId}/${manifest.revisionId}`);
      if (!included || canonicalMaterialJson(included.manifest) !== canonicalMaterialJson(manifest))
        throw new Error(`Missing exact saved-asset material dependency: ${manifest.materialId}`);
    }
  }
  const destinationRecords = new Map<string, AssetRecord>();
  for (const { record } of decoded.assets) {
    const identity = `${record.manifest.assetId}/${record.manifest.revisionId}`;
    const previous = destinationRecords.get(identity);
    if (
      previous &&
      canonicalMaterialJson(previous.manifest) !== canonicalMaterialJson(record.manifest)
    )
      throw new Error('Asset identity collision across source collections');
    destinationRecords.set(identity, record);
  }
  const digest = await projectBundleHash(snapshot);
  const selected = new Set(decoded.assets.map((asset) => asset.inventoryId));
  const {
    version: _,
    projectId: originalId,
    revisionId: originalRevision,
    parentRevision: __,
    createdAt: ___,
    ...content
  } = decoded.project;
  const draft = projectDraftSchema.parse({
    ...content,
    projectId: options.projectId,
    name: options.name ?? content.name,
    reviews: [],
    inventory: content.inventory.map((item) => {
      const { asset, ...rest } = item;
      return {
        ...rest,
        ...(asset && selected.has(item.id)
          ? { asset: { ...asset, collectionId: options.collectionId } }
          : {}),
      };
    }),
    references: [
      ...content.references,
      {
        id: `import-${digest.slice(7)}`,
        title: 'Original imported project and review provenance',
        uri: `kiln-import:${digest}#project.json`,
        sha256: digest,
        description: `Exact original ${originalId} at ${originalRevision}, including its review annotations, retained in .kiln/imports/${digest.slice(7)}.zip. Working-project review acceptance is not transferred. Reference media and original acquisition archives are not embedded; normalized maps and procedural recipes are included.`,
      },
    ],
  });
  // Nothing above performs writes. Verified immutable resources can safely survive a
  // later disk failure or project-ID conflict; imports never overwrite other revisions.
  await retainArchive(workspace, snapshot, digest);
  const newMaterialContext = decoded.materials.some(
    (record) => record.manifest.schemaVersion === 2,
  );
  for (let i = 0; i < decoded.materials.length; i += 100) {
    const batch = decoded.materials.slice(i, i + 100);
    if (newMaterialContext)
      await workspace.materials.import(batch, { materials: decoded.materials });
    else await workspace.materials.import(batch);
  }
  const records = [...destinationRecords.values()];
  for (let i = 0; i < records.length; i += 100)
    await library.import(options.collectionId, records.slice(i, i + 100));
  return workspace.projects.create(draft);
}
