/**
 * Saved-asset delivery profiles. No renderer, filesystem, or network dependencies; the
 * three.js runtime target loads its glTF passes and the meshopt encoder lazily.
 */
import {
  ASSET_LIMIT,
  assetMaterialRootManifests,
  validateRecordShape,
  type AssetRecord,
} from './assets';
import type { MaterialManifest } from './material-library';
import type {
  RuntimeThreeDeliveryV1,
  RuntimeThreeKtx2EncoderIdentityV1,
  RuntimeThreeKtx2EncoderV1,
  RuntimeThreeOptionsV1,
  RuntimeThreeResult,
} from './runtime-three';
import {
  runtimeTextureManifest,
  sha256Hex,
  textureFileExtension,
  type RuntimeTextureManifestEntryV1,
  type RuntimeTextureMaterialMapV1,
} from './runtime-textures';

export type {
  RuntimeThreeDeliveryV1,
  RuntimeThreeKtx2EncoderIdentityV1,
  RuntimeThreeKtx2EncoderV1,
  RuntimeThreeKtx2InputV1,
  RuntimeThreeKtx2SlotV1,
  RuntimeThreeOptionsV1,
} from './runtime-three';
export type { RuntimeTextureManifestEntryV1 } from './runtime-textures';
export type AssetExportProfile = 'editable' | 'runtime';
/**
 * Runtime only, opt-in. `manifest` adds sidecar `textures[]`; `external` (three target only)
 * also writes JSON glTF whose images are content-addressed files `textures/<sha256>.<ext>`.
 */
export type AssetExportTextures = 'manifest' | 'external';
/** Runtime delivery target; `three` adds meshopt, quantization, instancing and optional KTX2. */
export type AssetExportTarget = 'three';
export interface AssetGlbExportOptions extends RuntimeThreeOptionsV1 {
  /** Editable is the byte-preserving default. Runtime externalizes review-only data. */
  profile?: AssetExportProfile;
  /** A portable sibling filename, not a path or URL. Used only by runtime. */
  metadataFileName?: string;
  /** Runtime only: derive for a three.js application (see docs/export-profiles.md). */
  target?: AssetExportTarget;
  /** Runtime only, opt-in: a texture manifest, or external content-addressed textures. */
  textures?: AssetExportTextures;
  /** External textures only: a portable sibling `*.gltf` filename. */
  gltfFileName?: string;
}
export type AssetGlbExport =
  | { profile: 'editable'; glb: Uint8Array }
  | {
      profile: 'runtime';
      layout?: undefined;
      glb: Uint8Array;
      metadata: { name: string; bytes: Uint8Array };
    }
  | {
      profile: 'runtime';
      /** `textures: 'external'`: the delivery is `gltf`, `buffers`, `textures` and `metadata`. */
      layout: 'gltf';
      /** The same delivery embedded as GLB, for inspection; it is not part of the layout. */
      glb: Uint8Array;
      gltf: { name: string; bytes: Uint8Array };
      /** Buffers beside the `.gltf`, by relative URI. */
      buffers: { uri: string; bytes: Uint8Array }[];
      /** Content-addressed images, by relative URI `textures/<hex>.<ext>`, once each. */
      textures: { uri: string; sha256: string; bytes: Uint8Array }[];
      metadata: { name: string; bytes: Uint8Array };
    };

export interface RuntimeMetadataV1 {
  version: 'kiln.runtime-metadata.v1';
  source: {
    assetId: string;
    revisionId: string;
    glbSha256: string;
    sourceSha256?: string;
  };
  scenes: { index: number; kilnReviewClipsV1: Record<string, unknown> }[];
  /** Present when a runtime target derived the GLB. */
  target?: AssetExportTarget;
  /** Quantization, node-scale, attribute, instancing and extension facts of that target. */
  delivery?: RuntimeThreeDeliveryV1;
  /** Opt-in texture manifest: each delivered image's exact identity, by image index. */
  textures?: RuntimeTextureManifestEntryV1[];
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

/** Validate before writing: a portable sibling `*.gltf` filename. */
export function validateGltfFileName(name: string): void {
  if (
    name.length > 200 ||
    !/^[a-z0-9][a-z0-9._-]*\.gltf$/i.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(name)
  )
    throw new Error('External texture output must be a portable sibling *.gltf filename');
}

/** The GLB binary chunk's data, when present. */
function readGlbBinary(bytes: Uint8Array, jsonEnd: number): Uint8Array | undefined {
  if (jsonEnd + 8 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(jsonEnd + 4, true) !== 0x004e4942) return undefined;
  return bytes.subarray(jsonEnd + 8, jsonEnd + 8 + view.getUint32(jsonEnd, true));
}

/** Every map of the record's saved material closure, in a stable order, keyed by its bytes. */
function closureMaps(record: AssetRecord): RuntimeTextureMaterialMapV1[] {
  const manifests = new Map<string, MaterialManifest>();
  for (const manifest of [
    ...assetMaterialRootManifests(record),
    ...(record.materialResources?.records ?? []).map(({ manifest }) => manifest),
  ])
    manifests.set(`${manifest.materialId}/${manifest.revisionId}`, manifest);
  const order = (value: string, other: string) => (value < other ? -1 : value > other ? 1 : 0);
  return [...manifests.values()]
    .flatMap((manifest) =>
      manifest.maps.map((map) => ({
        sha256: map.sha256,
        pin: {
          resourceId: manifest.materialId,
          revisionId: manifest.revisionId,
          sha256: manifest.revisionId,
        },
        slot: map.slot,
      })),
    )
    .sort(
      (a, b) =>
        order(a.pin.resourceId, b.pin.resourceId) ||
        order(a.pin.revisionId, b.pin.revisionId) ||
        order(a.slot, b.slot),
    );
}

function readGlbJson(bytes: Uint8Array): { json: Record<string, unknown>; jsonEnd: number } {
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
  return { json, jsonEnd };
}
function writeGlbJson(bytes: Uint8Array, jsonEnd: number, json: unknown): Uint8Array {
  const jsonBytes = encoder.encode(JSON.stringify(json));
  const length = Math.ceil(jsonBytes.length / 4) * 4;
  const result = new Uint8Array(20 + length + bytes.length - jsonEnd);
  if (result.length > ASSET_LIMIT) throw new Error('Runtime export exceeds 64 MiB');
  result.set(bytes.subarray(0, 20));
  const header = new DataView(result.buffer);
  header.setUint32(8, result.length, true);
  header.setUint32(12, length, true);
  result.fill(32, 20, 20 + length);
  result.set(jsonBytes, 20);
  result.set(bytes.subarray(jsonEnd), 20 + length);
  return result;
}

/**
 * Library equivalent of `export --profile runtime --target three` for any Kiln GLB: returns
 * the derived GLB and its delivery facts. Deterministic for the same input bytes.
 */
export async function deliverThreeRuntimeGlb(
  glb: Uint8Array,
  options: RuntimeThreeOptionsV1 = {},
): Promise<{ glb: Uint8Array; delivery: RuntimeThreeDeliveryV1 }> {
  const { glb: derived, delivery } = await deriveThree(glb, options);
  return { glb: derived, delivery };
}
/**
 * A `ktx2Encoder` over the optional `ktx2-encoder@0.6.0` peer, which the caller installs:
 * ETC1S for base colour and emissive, UASTC for normal and other linear maps. Its identity
 * (name, version, Basis WebAssembly hash, settings) lands in `delivery.ktx2.encoder`. Loaded
 * lazily; a missing peer fails with the install command.
 */
export async function createKtx2Encoder(): Promise<
  RuntimeThreeKtx2EncoderV1 & { identity: RuntimeThreeKtx2EncoderIdentityV1 }
> {
  const { createKtx2Encoder: create } = await import('./ktx2-basis');
  return create();
}
async function deriveThree(
  glb: Uint8Array,
  options: RuntimeThreeOptionsV1,
  layout: { gltfBasename?: string } = {},
): Promise<RuntimeThreeResult> {
  const [{ deliverRuntimeThreeGlb }, { MeshoptEncoder }] = await Promise.all([
    import('./runtime-three'),
    import('meshoptimizer'),
  ]);
  await MeshoptEncoder.ready;
  const result = await deliverRuntimeThreeGlb(glb, MeshoptEncoder, options, layout);
  if (result.glb.byteLength > ASSET_LIMIT) throw new Error('Runtime export exceeds 64 MiB');
  return result;
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
  if (options.target !== undefined && options.target !== 'three')
    throw new Error('Unknown runtime export target');
  if (options.target !== undefined && profile !== 'runtime')
    throw new Error('A runtime export target requires the runtime profile');
  if (options.compression !== undefined && options.target !== 'three')
    throw new Error('Runtime compression requires the three runtime target');
  if (options.maxLod !== undefined && options.target !== 'three')
    throw new Error('Runtime maxLod requires the three runtime target');
  if (options.positionBits !== undefined && options.target !== 'three')
    throw new Error('Runtime positionBits requires the three runtime target');
  const textures = options.textures;
  if (textures !== undefined && textures !== 'manifest' && textures !== 'external')
    throw new Error('Unknown runtime texture option');
  if (textures !== undefined && profile !== 'runtime')
    throw new Error('A texture manifest requires the runtime profile');
  if (textures === 'external' && options.target !== 'three')
    throw new Error('External textures require target three');
  const gltfName = options.gltfFileName ?? 'runtime.gltf';
  if (textures === 'external') validateGltfFileName(gltfName);
  validateRecordShape(record);
  const bytes = record.files['asset.glb']!;
  if (profile === 'editable') return { profile, glb: bytes };
  const name = options.metadataFileName ?? 'runtime.kiln-metadata.json';
  validateMetadataFileName(name);
  for (const [file, data] of Object.entries(record.files)) {
    if ((await sha256(data)) !== record.manifest.files[file]!.sha256)
      throw new Error(`Asset integrity mismatch: ${file}`);
  }

  const { json, jsonEnd } = readGlbJson(bytes);
  const asset = json.asset as Record<string, unknown>;
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
  // The three target derives from the review-free GLB; provenance is stamped on its result.
  let base = bytes,
    baseJson: Record<string, unknown> = json,
    baseJsonEnd = jsonEnd,
    imageSources: ReadonlyMap<number, string> | undefined,
    gltf: RuntimeThreeResult['gltf'];
  if (options.target === 'three') {
    const derived = await deriveThree(
      writeGlbJson(bytes, jsonEnd, json),
      {
        ...(options.ktx2Encoder ? { ktx2Encoder: options.ktx2Encoder } : {}),
        ...(options.compression ? { compression: options.compression } : {}),
        ...(options.maxLod !== undefined ? { maxLod: options.maxLod } : {}),
        ...(options.positionBits !== undefined ? { positionBits: options.positionBits } : {}),
      },
      textures === 'external' ? { gltfBasename: gltfName.slice(0, -'.gltf'.length) } : {},
    );
    metadata.target = 'three';
    metadata.delivery = derived.delivery;
    base = derived.glb;
    imageSources = derived.imageSources;
    gltf = derived.gltf;
    ({ json: baseJson, jsonEnd: baseJsonEnd } = readGlbJson(base));
  }
  if (textures !== undefined)
    metadata.textures = await runtimeTextureManifest(baseJson, readGlbBinary(base, baseJsonEnd), {
      ...(imageSources ? { sources: imageSources } : {}),
      maps: closureMaps(record),
    });
  // Content addresses join the manifest before the sidecar is hashed into the provenance.
  const external = gltf ? await externalLayout(gltf, metadata.textures ?? []) : undefined;
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  if (metadataBytes.length > ASSET_LIMIT) throw new Error('Runtime export exceeds 64 MiB');
  const provenance = {
    version: 'kiln.provenance.v1',
    profile: 'runtime',
    ...(options.target ? { target: options.target } : {}),
    metadata: { uri: name, sha256: await sha256(metadataBytes) },
  };
  const baseAsset = baseJson.asset as Record<string, unknown>;
  baseAsset.extras = {
    ...((baseAsset.extras as Record<string, unknown> | undefined) ?? extras),
    kilnProvenanceV1: provenance,
  };
  const result = writeGlbJson(base, baseJsonEnd, baseJson);
  if (!external) return { profile, glb: result, metadata: { name, bytes: metadataBytes } };
  const gltfAsset = external.json.asset as Record<string, unknown>;
  gltfAsset.extras = {
    ...((gltfAsset.extras as Record<string, unknown> | undefined) ?? extras),
    kilnProvenanceV1: provenance,
  };
  const gltfBytes = encoder.encode(JSON.stringify(external.json));
  if (gltfBytes.length > ASSET_LIMIT) throw new Error('Runtime export exceeds 64 MiB');
  return {
    profile,
    layout: 'gltf',
    glb: result,
    gltf: { name: gltfName, bytes: gltfBytes },
    buffers: external.buffers,
    textures: external.textures,
    metadata: { name, bytes: metadataBytes },
  };
}

/**
 * Rename each image of the JSON glTF to its content address and add that `uri` to its manifest
 * entry. The writer's own image names are dropped; buffers keep the writer's `<basename>.bin`.
 */
async function externalLayout(
  gltf: NonNullable<RuntimeThreeResult['gltf']>,
  manifest: RuntimeTextureManifestEntryV1[],
): Promise<{
  json: Record<string, unknown>;
  buffers: { uri: string; bytes: Uint8Array }[];
  textures: { uri: string; sha256: string; bytes: Uint8Array }[];
}> {
  const json = structuredClone(gltf.json);
  const resources = new Map(Object.entries(gltf.resources));
  const images = (Array.isArray(json.images) ? json.images : []) as Record<string, unknown>[];
  if (images.length !== manifest.length) throw new Error('External texture layout mismatch');
  const textures = new Map<string, { uri: string; sha256: string; bytes: Uint8Array }>();
  for (const [index, image] of images.entries()) {
    const entry = manifest[index]!;
    const written = typeof image.uri === 'string' ? image.uri : '';
    const bytes = resources.get(written);
    if (!bytes || `sha256:${await sha256Hex(bytes)}` !== entry.sha256)
      throw new Error('External texture bytes differ from the delivered GLB');
    resources.delete(written);
    const uri = `textures/${entry.sha256.slice('sha256:'.length)}.${textureFileExtension(entry.mimeType)}`;
    image.uri = uri;
    entry.uri = uri;
    textures.set(uri, { uri, sha256: entry.sha256, bytes });
  }
  const buffers = [...resources].map(([uri, bytes]) => ({ uri, bytes }));
  for (const { uri } of buffers)
    if (!/^[a-z0-9][a-z0-9._-]*\.bin$/i.test(uri))
      throw new Error(`Unexpected external glTF resource ${uri}`);
  return { json, buffers, textures: [...textures.values()] };
}
