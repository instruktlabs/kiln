import type { ArtifactStore } from './artifact-store';
import { HttpFailure } from './http';

const id = /^[a-z][a-z0-9_-]{0,79}(?![\s\S])/;
const revision = /^sha256:[a-f0-9]{64}(?![\s\S])/;
const cursor = /^materials\/[a-z][a-z0-9_-]{0,79}\/[a-f0-9]{64}(?![\s\S])/;
const fileId = /^[a-f0-9]{32}(?![\s\S])/;
const allowedFiles = new Set([
  'manifest.json',
  'baseColor.png',
  'normal.png',
  'metallicRoughness.png',
  'emissive.png',
  'occlusion.png',
]);
const invalid = () => new HttpFailure(400, 'Invalid saved material');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function key(materialId: unknown, revisionId: unknown): string {
  if (
    typeof materialId !== 'string' ||
    !id.test(materialId) ||
    typeof revisionId !== 'string' ||
    !revision.test(revisionId)
  )
    throw invalid();
  return `materials/${materialId}/${revisionId.slice(7)}`;
}

/** Tenant ownership and immutable pins; the native SDK verifies material contents. */
export class MaterialIndex {
  constructor(private readonly artifacts: ArtifactStore) {}

  commit(input: unknown) {
    const value = object(input);
    if (Object.keys(value).some((name) => !['materialId', 'revisionId', 'files'].includes(name)))
      throw invalid();
    const logicalKey = key(value.materialId, value.revisionId);
    const entries = Object.entries(object(value.files));
    if (
      entries.length < 2 ||
      entries.length > 6 ||
      !entries.some(([name]) => name === 'manifest.json') ||
      entries.some(
        ([name, value]) =>
          !allowedFiles.has(name) || typeof value !== 'string' || !fileId.test(value),
      )
    )
      throw invalid();
    const files = Object.fromEntries(entries) as Record<string, string>;
    this.artifacts.assertFileNames(files);
    return this.artifacts.save({
      key: logicalKey,
      files,
      metadata: {
        kind: 'kiln.hosted-material.v1',
        materialId: value.materialId,
        revisionId: value.revisionId,
      },
    });
  }

  read(materialId: unknown, revisionId: unknown) {
    return this.artifacts.groupByKey(key(materialId, revisionId));
  }

  list(input: unknown) {
    const value = object(input);
    const after = value.after ?? '';
    if (
      Object.keys(value).some((name) => name !== 'after') ||
      typeof after !== 'string' ||
      (after !== '' && !cursor.test(after))
    )
      throw invalid();
    return this.artifacts.groupPage('materials/', after);
  }
}
