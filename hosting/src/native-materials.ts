import {
  canonicalMaterialJson,
  MATERIAL_LIBRARY_LIMITS,
  validateMaterialRecordShape,
  type MaterialLibrary,
  type MaterialManifestV1,
  type MaterialRecordV1,
} from '@instruktlabs/kiln/material-library';
import {
  validateMaterialManifestIdentity,
  verifyMaterialRecordV1,
} from '@instruktlabs/kiln/material-library/node';
import { NativeHttpClient, StorageFailure, type NativeStorageOptions } from './native-http';

const BATCH_BYTES = 64 * 1024 * 1024;
const id = /^[a-z][a-z0-9_-]{0,79}(?![\s\S])/;
const revision = /^sha256:[a-f0-9]{64}(?![\s\S])/;
const fileId = /^[a-f0-9]{32}(?![\s\S])/;
const cursor = /^materials\/[a-z][a-z0-9_-]{0,79}\/[a-f0-9]{64}(?![\s\S])/;
const filesAllowed = new Set([
  'manifest.json',
  'baseColor.png',
  'normal.png',
  'metallicRoughness.png',
  'emissive.png',
  'occlusion.png',
]);
const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const jsonBytes = (value: unknown) => new TextEncoder().encode(canonicalMaterialJson(value));
const failure = () => new Error('Saved material integrity check failed');
type Group = {
  id: string;
  key: string;
  files: Record<string, string>;
  metadata: { kind: string; materialId: string; revisionId: string };
};
function identity(materialId: string, revisionId: string): string {
  if (
    typeof materialId !== 'string' ||
    !id.test(materialId) ||
    typeof revisionId !== 'string' ||
    !revision.test(revisionId)
  )
    throw new Error('Invalid material identity');
  return `materials/${materialId}/${revisionId.slice(7)}`;
}
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Durable per-tenant materials using the installed engine's verification contract. */
export class NativeMaterialLibrary implements MaterialLibrary {
  private readonly http: NativeHttpClient;
  constructor(private readonly options: NativeStorageOptions = {}) {
    this.http = new NativeHttpClient(
      { ...options, timeoutMs: options.timeoutMs ?? 60_000 },
      'Material storage',
    );
  }
  private async json(path: string, input?: unknown, limit = 4096): Promise<unknown> {
    const bytes = await this.http.bytes(path, {
      method: input === undefined ? 'GET' : 'POST',
      body: input === undefined ? undefined : jsonBytes(input),
      headers: input === undefined ? undefined : { 'content-type': 'application/json' },
      limit,
      statuses: [200, 201],
    });
    try {
      return JSON.parse(text(bytes));
    } catch {
      throw failure();
    }
  }
  private group(raw: unknown, materialId?: string, revisionId?: string): Group {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure();
    const value = raw as Group;
    const meta = value.metadata;
    if (
      typeof value.id !== 'string' ||
      !fileId.test(value.id) ||
      !meta ||
      typeof meta !== 'object' ||
      Array.isArray(meta) ||
      Object.keys(meta).some((name) => !['kind', 'materialId', 'revisionId'].includes(name)) ||
      meta.kind !== 'kiln.hosted-material.v1' ||
      (materialId !== undefined && meta.materialId !== materialId) ||
      (revisionId !== undefined && meta.revisionId !== revisionId) ||
      value.key !== identity(meta.materialId, meta.revisionId) ||
      !value.files ||
      typeof value.files !== 'object' ||
      Array.isArray(value.files) ||
      !value.files['manifest.json'] ||
      Object.keys(value.files).length < 2 ||
      Object.entries(value.files).some(
        ([name, value]) =>
          !filesAllowed.has(name) || typeof value !== 'string' || !fileId.test(value),
      )
    )
      throw failure();
    return value;
  }
  private async find(materialId: string, revisionId: string): Promise<Group | undefined> {
    const path = `/internal/${identity(materialId, revisionId)}`;
    try {
      return this.group(await this.json(path), materialId, revisionId);
    } catch (error) {
      if (error instanceof StorageFailure && error.status === 404) return undefined;
      throw error;
    }
  }
  private download(id: string, limit: number): Promise<Uint8Array> {
    if (!fileId.test(id)) throw failure();
    return this.http.bytes(`/mcp/artifacts/${id}`, { limit });
  }
  private async manifest(group: Group): Promise<MaterialManifestV1> {
    const manifest = validateMaterialManifestIdentity(
      JSON.parse(
        text(
          await this.download(
            group.files['manifest.json']!,
            MATERIAL_LIBRARY_LIMITS.maxManifestBytes,
          ),
        ),
      ),
    );
    if (
      manifest.materialId !== group.metadata.materialId ||
      manifest.revisionId !== group.metadata.revisionId ||
      Object.keys(group.files).length !== manifest.maps.length + 1 ||
      manifest.maps.some((map) => !group.files[map.file])
    )
      throw failure();
    return manifest;
  }
  async read(materialId: string, revisionId: string): Promise<MaterialRecordV1> {
    const group = await this.find(materialId, revisionId);
    if (!group) throw new Error('Saved material not found');
    const manifest = await this.manifest(group);
    const files: Record<string, Uint8Array> = {};
    for (const map of manifest.maps)
      files[map.file] = await this.download(group.files[map.file]!, map.bytes);
    const record = { manifest, files };
    await verifyMaterialRecordV1(record);
    return record;
  }
  async list(): Promise<MaterialManifestV1[]> {
    const records: MaterialManifestV1[] = [];
    let after = '';
    let bytes = 0;
    for (;;) {
      const page = (await this.json(
        '/internal/materials/list',
        after ? { after } : {},
        128 * 1024,
      )) as { records: unknown[]; next: string | null };
      if (
        !page ||
        !Array.isArray(page.records) ||
        page.records.length > 32 ||
        (page.next !== null &&
          (typeof page.next !== 'string' || !cursor.test(page.next) || page.next <= after))
      )
        throw failure();
      let previous = after;
      for (const raw of page.records) {
        const group = this.group(raw);
        if (group.key <= previous) throw failure();
        previous = group.key;
        const manifest = await this.manifest(group);
        bytes += jsonBytes(manifest).length;
        if (bytes > BATCH_BYTES || records.length >= 10_000)
          throw new Error('Material catalogue exceeds host response limits');
        records.push(manifest);
      }
      if (page.next === null) break;
      if (page.records.length !== 32 || page.next !== previous) throw failure();
      after = page.next;
    }
    return records;
  }
  private async prepare(input: MaterialRecordV1[]): Promise<MaterialRecordV1[]> {
    if (!Array.isArray(input) || !input.length || input.length > 100)
      throw new Error('Import requires 1..100 material revisions');
    let bytes = 0;
    let pixels = 0;
    const keys = new Set<string>();
    for (const record of input) {
      const manifest = validateMaterialRecordShape(record);
      const key = identity(manifest.materialId, manifest.revisionId);
      if (keys.has(key)) throw new Error('Duplicate material revision');
      keys.add(key);
      bytes += jsonBytes(manifest).length;
      for (const map of manifest.maps) {
        bytes += map.bytes;
        pixels += map.width * map.height;
      }
      if (bytes > BATCH_BYTES || pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels)
        throw new Error('Material batch exceeds host byte or pixel limits');
    }
    // Copy all caller-owned buffers before the first asynchronous verification.
    const records = input.map((record) => ({
      manifest: structuredClone(record.manifest),
      files: Object.fromEntries(
        Object.entries(record.files).map(([name, bytes]) => [name, Uint8Array.from(bytes)]),
      ),
    }));
    for (const record of records) await verifyMaterialRecordV1(record);
    return records;
  }
  private async same(record: MaterialRecordV1): Promise<boolean> {
    const existing = await this.read(record.manifest.materialId, record.manifest.revisionId);
    return canonicalMaterialJson(existing.manifest) === canonicalMaterialJson(record.manifest);
  }
  private async publish(record: MaterialRecordV1): Promise<void> {
    const { materialId, revisionId } = record.manifest;
    if (await this.find(materialId, revisionId)) {
      if (!(await this.same(record))) throw new Error('Saved material revision is immutable');
      return;
    }
    const files: Record<string, string> = {};
    let committed = false;
    try {
      for (const [name, data] of Object.entries({
        ...record.files,
        'manifest.json': jsonBytes(record.manifest),
      })) {
        const bytes = Uint8Array.from(data);
        const digest = await hash(bytes);
        const receipt = JSON.parse(
          text(
            await this.http.bytes('/internal/artifacts', {
              method: 'POST',
              body: bytes,
              limit: 2048,
              statuses: [201],
              headers: {
                'content-type': name === 'manifest.json' ? 'application/json' : 'image/png',
                'x-artifact-name': name,
                'x-artifact-sha256': digest,
              },
            }),
          ),
        );
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
        this.group(
          await this.json('/internal/materials/commit', { materialId, revisionId, files }),
          materialId,
          revisionId,
        );
        committed = true;
      } catch (error) {
        if (!(error instanceof StorageFailure) || error.status !== 409) throw error;
        if (!(await this.same(record))) throw new Error('Saved material revision is immutable');
      }
    } finally {
      if (!committed && Object.keys(files).length) {
        // Pins protect committed data even when its acknowledgement was lost.
        // Failed cleanup stays quota-counted until normal unsaved-work expiry.
        const cleanup = new NativeHttpClient(
          { ...this.options, signal: undefined, timeoutMs: 5000 },
          'Material cleanup',
        );
        await cleanup
          .bytes('/internal/artifacts/discard', {
            method: 'POST',
            body: jsonBytes(Object.values(files)),
            headers: { 'content-type': 'application/json' },
            limit: 1024,
          })
          .catch(() => {});
      }
    }
  }
  async import(input: MaterialRecordV1[]): Promise<MaterialManifestV1[]> {
    const records = await this.prepare(input);
    for (const record of records) await this.publish(record);
    return records.map((record) => record.manifest);
  }
}
