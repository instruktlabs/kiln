import {
  ASSET_LIMIT,
  ASSET_MATERIAL_BYTES,
  ASSET_MATERIAL_FILE,
  assetIdSchema,
  assetManifestSchema,
  encodeAssetBundle,
  validateRecordShape,
  type AssetDraft,
  type AssetLibrary,
  type AssetManifest,
  type AssetRecord,
} from '@instruktlabs/kiln/assets';
import { verifyAssetRecord, resolveSavedAssetMaterials } from '@instruktlabs/kiln/assets/node';
import { createMaterialLibraryPayload } from '@instruktlabs/kiln/material-library/node';
import type { MaterialLibrary, MaterialRecordV1 } from '../../src/material-library';
import { programReference } from '../../src/program-store';
import { NativeHttpClient, StorageFailure, type NativeStorageOptions } from './native-http';
import { DOWNLOAD_FILES, DOWNLOAD_TOKEN } from './download-path';

type Group = {
  id: string;
  key: string;
  files: Record<string, string>;
  metadata: {
    kind: string;
    collection: string;
    assetId: string;
    revisionId: string;
    parentRevision?: string;
  };
};
const text = (bytes: Uint8Array) =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const failure = () => new Error('Saved asset integrity check failed');
const fileId = /^[a-f0-9]{32}(?![\s\S])/;
const media: Record<string, string> = {
  'asset.glb': 'model/gltf-binary',
  'source.kiln.js': 'application/javascript',
  'preview.png': 'image/png',
  'manifest.json': 'application/json',
  [ASSET_MATERIAL_FILE]: 'application/json',
};
function identity(raw: string): string {
  const value = assetIdSchema.parse(raw);
  if (!/^[a-z][a-z0-9_-]{0,79}(?![\s\S])/.test(value)) throw new Error('Invalid asset identity');
  return value;
}
function collection(value: string): string {
  if (value !== 'project' && value !== 'library') throw new Error('Unknown collection');
  return value;
}
function path(target: string, assetId: string, revisionId: string): string {
  return `/internal/assets/${collection(target)}/${identity(assetId)}/${identity(revisionId)}`;
}
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Canonical engine records with durable tenant storage; no local workspace or provider credentials. */
export class NativeAssetLibrary implements AssetLibrary {
  private readonly http: NativeHttpClient;
  constructor(
    private readonly options: NativeStorageOptions & { materials?: MaterialLibrary } = {},
  ) {
    this.http = new NativeHttpClient(
      { ...options, timeoutMs: options.timeoutMs ?? 60_000 },
      'Asset storage',
    );
  }
  collections() {
    return [
      { id: 'project', label: 'Workspace storage' },
      { id: 'library', label: 'User library storage' },
    ];
  }
  private async json(route: string, input?: unknown, limit = 4096): Promise<unknown> {
    const bytes = await this.http.bytes(route, {
      method: input === undefined ? 'GET' : 'POST',
      body: input === undefined ? undefined : jsonBytes(input),
      limit,
      statuses: [200, 201],
      headers: input === undefined ? undefined : { 'content-type': 'application/json' },
    });
    try {
      return JSON.parse(text(bytes));
    } catch {
      throw failure();
    }
  }
  private group(raw: unknown, target: string, assetId?: string, revisionId?: string): Group {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure();
    const value = raw as Group;
    const meta = value.metadata;
    if (
      typeof value.id !== 'string' ||
      !fileId.test(value.id) ||
      !meta ||
      meta.kind !== 'kiln.hosted-asset.v1' ||
      meta.collection !== target ||
      (assetId !== undefined && meta.assetId !== assetId) ||
      (revisionId !== undefined && meta.revisionId !== revisionId) ||
      value.key !==
        `assets/${collection(target)}/${identity(meta.assetId)}/${identity(meta.revisionId)}` ||
      !value.files ||
      typeof value.files !== 'object' ||
      Array.isArray(value.files) ||
      !value.files['manifest.json'] ||
      !value.files['asset.glb'] ||
      Object.entries(value.files).some(
        ([name, id]) => !Object.hasOwn(media, name) || typeof id !== 'string' || !fileId.test(id),
      )
    )
      throw failure();
    return value;
  }
  private async find(
    target: string,
    assetId: string,
    revisionId: string,
  ): Promise<Group | undefined> {
    try {
      return this.group(
        await this.json(path(target, assetId, revisionId)),
        target,
        assetId,
        revisionId,
      );
    } catch (error) {
      if (error instanceof StorageFailure && error.status === 404) return undefined;
      throw error;
    }
  }
  private async download(id: string, limit: number): Promise<Uint8Array> {
    if (!fileId.test(id)) throw failure();
    return this.http.bytes(`/mcp/artifacts/${id}`, { limit });
  }
  private async manifest(group: Group): Promise<AssetManifest> {
    const raw = JSON.parse(text(await this.download(group.files['manifest.json']!, 1024 * 1024)));
    assetManifestSchema.parse(raw);
    if (
      raw.assetId !== group.metadata.assetId ||
      raw.revisionId !== group.metadata.revisionId ||
      raw.parentRevision !== group.metadata.parentRevision
    )
      throw failure();
    // Preserve unknown provenance exactly as the Node library does; parsing validates only.
    return raw as AssetManifest;
  }
  async list(target: string): Promise<AssetManifest[]> {
    collection(target);
    const records: AssetManifest[] = [];
    let after: string | undefined;
    let bytes = 0;
    for (;;) {
      const page = (await this.json(
        '/internal/assets/list',
        { collection: target, ...(after ? { after } : {}) },
        2 * 1024 * 1024,
      )) as { records: unknown[]; next: string | null };
      if (
        !page ||
        !Array.isArray(page.records) ||
        page.records.length > 32 ||
        (page.next !== null &&
          (typeof page.next !== 'string' ||
            !page.next.startsWith(`assets/${target}/`) ||
            page.next <= (after ?? '')))
      )
        throw failure();
      for (const raw of page.records) {
        const manifest = await this.manifest(this.group(raw, target));
        bytes += jsonBytes(manifest).length;
        if (bytes > ASSET_LIMIT || records.length >= 10_000)
          throw new Error('Asset catalogue exceeds host response limits');
        records.push(manifest);
      }
      if (page.next === null) break;
      after = page.next;
    }
    return records.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.revisionId.localeCompare(b.revisionId),
    );
  }
  async read(target: string, assetId: string, revisionId: string): Promise<AssetRecord> {
    const group = await this.find(target, assetId, revisionId);
    if (!group) throw new Error('Saved asset not found in this collection');
    const manifest = await this.manifest(group);
    let total = 0;
    const files: Record<string, Uint8Array> = {};
    for (const [name, info] of Object.entries(manifest.files)) {
      if (!['asset.glb', 'source.kiln.js', 'preview.png'].includes(name) || !group.files[name])
        throw failure();
      total += info.bytes;
      if (total > ASSET_LIMIT) throw failure();
      files[name] = await this.download(
        group.files[name]!,
        name === 'source.kiln.js' ? 1024 * 1024 : ASSET_LIMIT,
      );
    }
    const allowed = new Set([...Object.keys(files), 'manifest.json', ASSET_MATERIAL_FILE]);
    if (Object.keys(group.files).some((name) => !allowed.has(name))) throw failure();
    const record: AssetRecord = { manifest, files };
    if (group.files[ASSET_MATERIAL_FILE])
      record.materialResources = JSON.parse(
        text(await this.download(group.files[ASSET_MATERIAL_FILE]!, ASSET_MATERIAL_BYTES)),
      );
    await verifyAssetRecord(record);
    // Saved hosted records always retain a complete editable material closure.
    await resolveSavedAssetMaterials(record);
    return record;
  }
  private async prepare(input: AssetRecord[]): Promise<AssetRecord[]> {
    if (!input.length || input.length > 100) throw new Error('Import requires 1..100 revisions');
    let bytes = 0;
    const keys = new Set<string>();
    for (const record of input) {
      validateRecordShape(record);
      const key = `${identity(record.manifest.assetId)}/${identity(record.manifest.revisionId)}`;
      if (keys.has(key)) throw new Error('Duplicate asset revision');
      keys.add(key);
      const manifestBytes = jsonBytes(record.manifest).length;
      if (manifestBytes > 1024 * 1024) throw new Error('Manifest exceeds 1 MiB');
      bytes +=
        manifestBytes + Object.values(record.files).reduce((sum, file) => sum + file.length, 0);
      if (record.materialResources) bytes += jsonBytes(record.materialResources).length;
      if (bytes > ASSET_LIMIT) throw new Error('Asset batch exceeds 64 MiB');
    }
    const records = structuredClone(input);
    let preparedBytes = 0;
    for (const record of records) {
      await verifyAssetRecord(record);
      if (record.files['source.kiln.js'])
        await programReference(text(record.files['source.kiln.js']));
      const materials = await resolveSavedAssetMaterials(record, this.options.materials);
      if (materials.length)
        record.materialResources = await createMaterialLibraryPayload(materials);
      else delete record.materialResources;
      preparedBytes += Object.values(this.inventory(record)).reduce(
        (sum, file) => sum + file.length,
        0,
      );
      if (preparedBytes > ASSET_LIMIT) throw new Error('Asset batch exceeds 64 MiB');
    }
    return records;
  }
  private inventory(record: AssetRecord): Record<string, Uint8Array> {
    const files: Record<string, Uint8Array> = {
      ...record.files,
      'manifest.json': jsonBytes(record.manifest),
    };
    if (record.materialResources) {
      const bytes = jsonBytes(record.materialResources);
      if (bytes.length > ASSET_MATERIAL_BYTES)
        throw new Error('Asset material payload exceeds byte limit');
      files[ASSET_MATERIAL_FILE] = bytes;
    }
    return files;
  }
  private same(a: AssetRecord, b: AssetRecord): boolean {
    return (
      JSON.stringify(a.manifest) === JSON.stringify(b.manifest) &&
      JSON.stringify(a.materialResources) === JSON.stringify(b.materialResources)
    );
  }
  private async publish(
    target: string,
    record: AssetRecord,
    mode: 'save' | 'import',
  ): Promise<void> {
    const { assetId, revisionId, parentRevision } = record.manifest;
    if (await this.find(target, assetId, revisionId)) {
      if (!this.same(await this.read(target, assetId, revisionId), record))
        throw new Error('Saved revision is immutable');
      return;
    }
    const files: Record<string, string> = {};
    let committed = false;
    try {
      for (const [name, data] of Object.entries(this.inventory(record))) {
        const bytes = Uint8Array.from(data);
        const digest = await hash(bytes);
        const response = await this.http.bytes('/internal/artifacts', {
          method: 'POST',
          body: bytes,
          limit: 2048,
          statuses: [201],
          headers: {
            'content-type': media[name]!,
            'x-artifact-name': name,
            'x-artifact-sha256': digest,
          },
        });
        const receipt = JSON.parse(text(response));
        if (
          !receipt ||
          typeof receipt.id !== 'string' ||
          !fileId.test(receipt.id) ||
          receipt.bytes !== bytes.length ||
          receipt.sha256 !== digest
        )
          throw failure();
        files[name] = receipt.id;
      }
      try {
        const result = await this.json('/internal/assets/commit', {
          collection: target,
          assetId,
          revisionId,
          parentRevision,
          files,
          mode,
        });
        this.group(result, target, assetId, revisionId);
        committed = true;
      } catch (error) {
        if (!(error instanceof StorageFailure) || error.status !== 409) throw error;
        const existing = await this.find(target, assetId, revisionId);
        if (!existing || !this.same(await this.read(target, assetId, revisionId), record))
          throw new Error('Saved revision is immutable or requires parentRevision');
      }
    } finally {
      if (!committed && Object.keys(files).length) {
        // Cleanup is independently bounded even when the triggering request was
        // cancelled. The tenant checks pins atomically, including a lost commit ack.
        const cleanup = new NativeHttpClient(
          { ...this.options, signal: undefined, timeoutMs: 5000 },
          'Asset cleanup',
        );
        await cleanup
          .bytes('/internal/artifacts/discard', {
            method: 'POST',
            body: jsonBytes(Object.values(files)),
            headers: { 'content-type': 'application/json' },
            limit: 1024,
          })
          .catch(() => {});
        // Failed cleanup stays charged to quota and expires through tenant recovery.
      }
    }
  }
  async import(target: string, input: AssetRecord[]): Promise<AssetManifest[]> {
    collection(target);
    const records = await this.prepare(input);
    if (this.options.materials) {
      const resources = new Map<string, MaterialRecordV1>();
      for (const record of records)
        for (const material of await resolveSavedAssetMaterials(record))
          resources.set(
            `${material.manifest.materialId}/${material.manifest.revisionId}`,
            material,
          );
      if (resources.size) await this.options.materials.import([...resources.values()]);
    }
    for (const record of records) await this.publish(target, record, 'import');
    return records.map((record) => record.manifest);
  }
  async save(target: string, draft: AssetDraft): Promise<AssetManifest> {
    collection(target);
    const assetId = identity(draft.assetId ?? `a_${crypto.randomUUID().replaceAll('-', '')}`);
    if (draft.parentRevision) await this.read(target, assetId, draft.parentRevision);
    if (draft.code !== undefined) await programReference(draft.code);
    const files: Record<string, Uint8Array> = { 'asset.glb': Uint8Array.from(draft.glb) };
    if (draft.code !== undefined) files['source.kiln.js'] = new TextEncoder().encode(draft.code);
    if (draft.preview) files['preview.png'] = Uint8Array.from(draft.preview);
    const inventory: AssetManifest['files'] = {};
    for (const [name, bytes] of Object.entries(files))
      inventory[name] = { bytes: bytes.length, sha256: `sha256:${await hash(bytes)}` };
    const manifest = assetManifestSchema.parse({
      version: 'kiln.asset.v1',
      assetId,
      revisionId: `r_${crypto.randomUUID().replaceAll('-', '')}`,
      parentRevision: draft.parentRevision,
      name: draft.name,
      tags: draft.tags ?? [],
      createdAt: new Date().toISOString(),
      description: draft.description,
      brief: draft.brief,
      attribution: draft.attribution,
      editable: draft.code !== undefined,
      files: inventory,
      build: draft.build
        ? { ...draft.build, rebuild: draft.build.rebuild ?? 'engine-required' }
        : undefined,
      preview: draft.previewInfo,
    });
    const [record] = await this.prepare([{ manifest, files }]);
    await this.publish(target, record!, 'save');
    return manifest;
  }
  async exportBundle(input: AssetRecord[]): Promise<Uint8Array> {
    return encodeAssetBundle(await this.prepare(input));
  }
  /** Browser delivery uses the current Kiln account; links never embed a tenant or bearer credential. */
  async downloadUrls(
    publicOrigin: string,
    target: string,
    assetId: string,
    revisionId: string,
  ): Promise<Record<string, string>> {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== publicOrigin)
      throw new Error('Invalid public origin');
    const raw = await this.json('/internal/downloads', {
      collection: collection(target),
      assetId: identity(assetId),
      revisionId: identity(revisionId),
    });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure();
    const value = raw as { ticket: string; expiresAt: number; files: string[] };
    if (
      typeof value.ticket !== 'string' ||
      !DOWNLOAD_TOKEN.test(value.ticket) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      !Array.isArray(value.files) ||
      !value.files.length ||
      value.files.length > DOWNLOAD_FILES.size ||
      new Set(value.files).size !== value.files.length ||
      value.files.some((name) => typeof name !== 'string' || !DOWNLOAD_FILES.has(name))
    )
      throw failure();
    return Object.fromEntries(
      value.files.map((name) => [name, `${publicOrigin}/downloads/${value.ticket}/${name}`]),
    );
  }
  /** Host UI/account operation; the engine's MCP registry defines no extra delete tool. */
  async deleteRevision(target: string, assetId: string, revisionId: string): Promise<void> {
    const group = await this.find(target, assetId, revisionId);
    if (!group) throw new Error('Saved asset not found in this collection');
    await this.http.bytes(`/internal/groups/${group.id}`, { method: 'DELETE', limit: 1024 });
  }
}
