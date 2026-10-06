import type { ArtifactStore } from './artifact-store';
import { HttpFailure } from './http';

const id = /^[a-z][a-z0-9_-]{0,79}(?![\s\S])/;
const filesAllowed = new Set([
  'asset.glb',
  'source.kiln.js',
  'preview.png',
  'manifest.json',
  'materials.kiln.json',
]);
const invalid = () => new HttpFailure(400, 'Invalid saved asset');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function collection(value: unknown): string {
  if (value !== 'project' && value !== 'library') throw invalid();
  return value;
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || !id.test(value)) throw invalid();
  return value;
}
const key = (collection: string, assetId: string, revisionId: string) =>
  `assets/${collection}/${assetId}/${revisionId}`;

/** Storage ownership/indexing only. Native engine code verifies the actual asset records. */
export class AssetIndex {
  constructor(private readonly artifacts: ArtifactStore) {}

  commit(input: unknown) {
    const value = object(input);
    const target = collection(value.collection);
    const assetId = identity(value.assetId);
    const revisionId = identity(value.revisionId);
    const parentRevision =
      value.parentRevision === undefined ? undefined : identity(value.parentRevision);
    if (parentRevision === revisionId || !['save', 'import'].includes(String(value.mode)))
      throw invalid();
    const entries = Object.entries(object(value.files));
    if (
      !entries.some(([name]) => name === 'manifest.json') ||
      !entries.some(([name]) => name === 'asset.glb') ||
      entries.some(
        ([name, fileId]) =>
          !filesAllowed.has(name) ||
          typeof fileId !== 'string' ||
          !/^[a-f0-9]{32}(?![\s\S])/.test(fileId),
      )
    )
      throw invalid();
    const files = Object.fromEntries(entries) as Record<string, string>;
    this.artifacts.assertFileNames(files);
    return this.artifacts.save(
      {
        key: key(target, assetId, revisionId),
        files,
        metadata: {
          kind: 'kiln.hosted-asset.v1',
          collection: target,
          assetId,
          revisionId,
          ...(parentRevision ? { parentRevision } : {}),
        },
      },
      value.mode === 'save'
        ? parentRevision
          ? { parentKey: key(target, assetId, parentRevision) }
          : { absentPrefix: `assets/${target}/${assetId}/` }
        : {},
    );
  }

  read(target: unknown, assetId: unknown, revisionId: unknown) {
    return this.artifacts.groupByKey(
      key(collection(target), identity(assetId), identity(revisionId)),
    );
  }

  list(input: unknown) {
    const value = object(input);
    const prefix = `assets/${collection(value.collection)}/`;
    const after = value.after ?? '';
    if (
      typeof after !== 'string' ||
      (after !== '' &&
        (!after.startsWith(prefix) || !/^[A-Za-z0-9_./-]{1,240}(?![\s\S])/.test(after)))
    )
      throw invalid();
    return this.artifacts.groupPage(prefix, after);
  }
}
