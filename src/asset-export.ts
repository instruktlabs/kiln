/** Saved-asset delivery profiles. No renderer, filesystem, or network dependencies. */
import { ASSET_LIMIT, validateRecordShape, type AssetRecord } from './assets';

export type AssetExportProfile = 'editable' | 'runtime';
export interface AssetGlbExportOptions {
  /** Editable is the byte-preserving default. Runtime externalizes review-only data. */
  profile?: AssetExportProfile;
  /** A portable sibling filename, not a path or URL. Used only by runtime. */
  metadataFileName?: string;
}
export type AssetGlbExport =
  | { profile: 'editable'; glb: Uint8Array }
  | { profile: 'runtime'; glb: Uint8Array; metadata: { name: string; bytes: Uint8Array } };

export interface RuntimeMetadataV1 {
  version: 'kiln.runtime-metadata.v1';
  source: {
    assetId: string;
    revisionId: string;
    glbSha256: string;
    sourceSha256?: string;
  };
  scenes: { index: number; kilnReviewClipsV1: Record<string, unknown> }[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (value: object, key: string) => Object.hasOwn(value, key);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Validate before creating any output directories or writing any bytes. */
export function validateMetadataFileName(name: string): void {
  if (
    name.length > 200 ||
    !/^[a-z0-9][a-z0-9._-]*\.kiln-metadata\.json$/i.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(name)
  )
    throw new Error(
      'Runtime metadata filename must be a portable sibling *.kiln-metadata.json filename',
    );
}

/**
 * Derive a delivery GLB from a saved revision, never changing the canonical record.
 * The sidecar is informational: neither this helper nor standard glTF loaders fetch
 * it. Only the exact owned scene review field is moved; application extras survive.
 */
export async function exportAssetGlb(
  record: AssetRecord,
  options: AssetGlbExportOptions = {},
): Promise<AssetGlbExport> {
  const profile = options.profile ?? 'editable';
  if (profile !== 'editable' && profile !== 'runtime') throw new Error('Unknown export profile');
  validateRecordShape(record);
  const bytes = record.files['asset.glb']!;
  if (profile === 'editable') return { profile, glb: bytes };
  const name = options.metadataFileName ?? 'runtime.kiln-metadata.json';
  validateMetadataFileName(name);
  for (const [file, data] of Object.entries(record.files)) {
    if ((await sha256(data)) !== record.manifest.files[file]!.sha256)
      throw new Error(`Asset integrity mismatch: ${file}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = 12;
  while (end < bytes.length) {
    if (end + 8 > bytes.length) throw new Error('Invalid GLB chunk header');
    const length = view.getUint32(end, true);
    if (length % 4 || end + 8 + length > bytes.length) throw new Error('Invalid GLB chunk length');
    end += 8 + length;
  }
  const jsonEnd = 20 + view.getUint32(12, true);
  const json: unknown = JSON.parse(decoder.decode(bytes.subarray(20, jsonEnd)));
  if (!object(json) || !object(json.asset) || json.asset.version !== '2.0')
    throw new Error('Invalid glTF asset');
  const asset = json.asset;
  if (owns(asset, 'extras') && !object(asset.extras))
    throw new Error('Cannot add provenance to non-object asset extras');
  const extras = (asset.extras ?? {}) as Record<string, unknown>;
  if (owns(extras, 'kilnProvenanceV1'))
    throw new Error(
      'Asset extras already contain kilnProvenanceV1; export from the canonical revision',
    );
  const scenes: RuntimeMetadataV1['scenes'] = [];
  if (json.scenes !== undefined && !Array.isArray(json.scenes))
    throw new Error('Invalid glTF scenes');
  for (const [index, scene] of ((json.scenes ?? []) as unknown[]).entries()) {
    if (!object(scene) || !object(scene.extras) || !owns(scene.extras, 'kilnReviewClipsV1'))
      continue;
    const review = scene.extras.kilnReviewClipsV1;
    // Version 2 is the review copy of clips with a cubic-spline track.
    if (
      !object(review) ||
      (review.version !== 1 && review.version !== 2) ||
      !Array.isArray(review.clips)
    )
      throw new Error('Unsupported scenes[].extras.kilnReviewClipsV1');
    scenes.push({ index, kilnReviewClipsV1: review });
    delete scene.extras.kilnReviewClipsV1;
  }
  const metadata: RuntimeMetadataV1 = {
    version: 'kiln.runtime-metadata.v1',
    source: {
      assetId: record.manifest.assetId,
      revisionId: record.manifest.revisionId,
      glbSha256: record.manifest.files['asset.glb']!.sha256,
      ...(record.manifest.files['source.kiln.js']
        ? { sourceSha256: record.manifest.files['source.kiln.js'].sha256 }
        : {}),
    },
    scenes,
  };
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  asset.extras = {
    ...extras,
    kilnProvenanceV1: {
      version: 'kiln.provenance.v1',
      profile: 'runtime',
      metadata: { uri: name, sha256: await sha256(metadataBytes) },
    },
  };
  const jsonBytes = encoder.encode(JSON.stringify(json));
  const length = Math.ceil(jsonBytes.length / 4) * 4;
  const result = new Uint8Array(20 + length + bytes.length - jsonEnd);
  if (result.length > ASSET_LIMIT || metadataBytes.length > ASSET_LIMIT)
    throw new Error('Runtime export exceeds 64 MiB');
  result.set(bytes.subarray(0, 20));
  const header = new DataView(result.buffer);
  header.setUint32(8, result.length, true);
  header.setUint32(12, length, true);
  result.fill(32, 20, 20 + length);
  result.set(jsonBytes, 20);
  result.set(bytes.subarray(jsonEnd), 20 + length);
  return { profile, glb: result, metadata: { name, bytes: metadataBytes } };
}
