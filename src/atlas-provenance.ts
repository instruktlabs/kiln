/** Internal atlas metadata owner. TextureInfo, rather than an image, owns each sampler use. */
import type { Document, Texture as GltfTexture, TextureInfo } from '@gltf-transform/core';
import * as THREE from 'three';
import { restoreGltfTextureBinding } from './gltf-texture-binding';
import {
  canonicalAtlasMetadataJsonV1,
  canonicalizeTextureAtlasSpecV1,
  validateTextureAtlasManifestV1,
  type CanonicalTextureAtlasSpecV1,
} from './texture-atlas-contract';
import type { TextureAtlasManifestV1 } from './texture-atlas-pixels';

export const ATLAS_PROVENANCE_VERSION = 'kiln.atlas-provenance.v1' as const;
const TABLE_ENVELOPE_BYTES = new TextEncoder().encode(
  JSON.stringify({ version: ATLAS_PROVENANCE_VERSION, atlases: [] }),
).length;
export const ATLAS_PROVENANCE_LIMITS = Object.freeze({
  atlases: 128,
  bytes: 4_194_304,
  bindings: 1024,
  entryBytes: 262_144,
  encodedBytes: 16_777_216,
  aggregateEncodedBytes: 67_108_864,
  bakeDecodedBytes: 67_108_864,
});
export interface AtlasProvenanceV1 {
  spec: CanonicalTextureAtlasSpecV1;
  manifest: TextureAtlasManifestV1;
}
export interface AtlasProvenanceTableV1 {
  version: typeof ATLAS_PROVENANCE_VERSION;
  atlases: (AtlasProvenanceV1 & { id: string })[];
}
export interface AtlasReferenceV1 {
  version: typeof ATLAS_PROVENANCE_VERSION;
  id: string;
  effectiveSampler?: {
    minFilter: number | null;
    magFilter: number | null;
    wrapS: number;
    wrapT: number;
  };
  finalMime?: string;
  finalImageSha256?: string;
}
export interface AtlasBindingV1 {
  version: typeof ATLAS_PROVENANCE_VERSION;
  atlasId: string;
  region: string;
  inputOrigin: 'top-left' | 'bottom-left';
  mode: 'content-boundary' | 'texel-center';
  /** Present only for a u-only column binding; absent means both components. */
  axes?: 'u-only';
}
function fail(message: string): never {
  throw new TypeError(`atlas provenance: ${message}`);
}
function field(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('plain metadata object required.');
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) fail('plain metadata prototype required.');
  const d = Object.getOwnPropertyDescriptor(input, key);
  if (!d) return undefined;
  if (!d.enumerable || !('value' in d)) fail('metadata accessors/hidden fields are unsupported.');
  return d.value;
}
function closed(input: unknown, keys: readonly string[]): Record<string, unknown> {
  for (const key of Reflect.ownKeys(input as object))
    if (typeof key !== 'string' || !keys.includes(key)) fail('unsupported metadata field.');
  for (const key of keys) field(input, key);
  return input as Record<string, unknown>;
}
function normalize(input: unknown): AtlasProvenanceV1 {
  canonicalAtlasMetadataJsonV1(input);
  const r = closed(input, ['spec', 'manifest']);
  const spec = canonicalizeTextureAtlasSpecV1(r['spec']);
  return { spec, manifest: validateTextureAtlasManifestV1(r['manifest'], spec) };
}
function textureCandidates(texture: THREE.Texture): unknown[] {
  const direct = field(texture.userData, 'kilnAtlas'),
    resource = field(texture.userData, 'kilnMaterialResource');
  const map = resource === undefined ? undefined : field(resource, 'map'),
    recipe = map === undefined ? undefined : field(map, 'recipe');
  const candidates: unknown[] = [];
  if (direct !== undefined) candidates.push(direct);
  if (recipe !== undefined && field(recipe, 'kind') === 'atlas')
    candidates.push({ spec: field(recipe, 'spec'), manifest: field(recipe, 'manifest') });
  return candidates;
}
function normalizeCandidates(candidates: unknown[]): AtlasProvenanceV1 | undefined {
  let result: AtlasProvenanceV1 | undefined;
  for (const candidate of candidates) {
    const p = normalize(candidate);
    if (result && canonicalAtlasMetadataJsonV1(result) !== canonicalAtlasMetadataJsonV1(p))
      fail('direct and saved atlas identities disagree.');
    result = p;
  }
  return result;
}
/** Reads only engine metadata data descriptors; author metadata and encoded arrays are not serialized. */
export function readAtlasTextureProvenance(texture: THREE.Texture): AtlasProvenanceV1 | undefined {
  return normalizeCandidates(textureCandidates(texture));
}
function admitTable(input: unknown): Record<string, unknown>[] {
  const r = closed(input, ['version', 'atlases']);
  if (r['version'] !== ATLAS_PROVENANCE_VERSION) fail('unsupported version.');
  const entries = r['atlases'];
  if (!Array.isArray(entries) || Object.getPrototypeOf(entries) !== Array.prototype)
    fail('dense atlas array required.');
  const n = Object.getOwnPropertyDescriptor(entries, 'length')!.value;
  if (n > ATLAS_PROVENANCE_LIMITS.atlases || Reflect.ownKeys(entries).length !== n + 1)
    fail('atlas count/density budget exceeded.');
  let bytes = TABLE_ENVELOPE_BYTES;
  const admitted: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const d = Object.getOwnPropertyDescriptor(entries, String(i));
    if (!d?.enumerable || !('value' in d)) fail('atlas array accessors are unsupported.');
    const json = canonicalAtlasMetadataJsonV1(d.value);
    bytes += new TextEncoder().encode(json).length + (i > 0 ? 1 : 0);
    if (bytes > ATLAS_PROVENANCE_LIMITS.bytes) fail('aggregate metadata byte budget exceeded.');
    admitted.push(closed(d.value, ['id', 'spec', 'manifest']));
  }
  return admitted;
}
export function validateAtlasProvenanceTable(input: unknown): AtlasProvenanceTableV1 {
  const admitted = admitTable(input),
    ids = new Set<string>(),
    atlases: AtlasProvenanceTableV1['atlases'] = [];
  for (const e of admitted) {
    const p = normalize({ spec: e['spec'], manifest: e['manifest'] });
    if (e['id'] !== p.manifest.manifestHash || ids.has(e['id'] as string))
      fail('duplicate or mismatched atlas identity.');
    ids.add(e['id'] as string);
    atlases.push({ id: e['id'] as string, ...p });
  }
  return { version: ATLAS_PROVENANCE_VERSION, atlases };
}
function lookup(table: AtlasProvenanceTableV1, id: unknown): AtlasProvenanceV1 {
  const found = table.atlases.find((a) => a.id === id);
  if (!found) fail('unknown atlas reference.');
  return found;
}
function derivedBinding(
  p: AtlasProvenanceV1,
  regionName: unknown,
  origin: unknown,
  mode: unknown,
  axes: unknown,
) {
  if (
    !['top-left', 'bottom-left'].includes(origin as string) ||
    !['content-boundary', 'texel-center'].includes(mode as string)
  )
    fail('explicit binding origin/mode required.');
  if (axes !== undefined && axes !== 'u-only') fail('unsupported binding axes.');
  const uOnly = axes === 'u-only';
  const r = p.manifest.regions.find((r) => r.name === regionName);
  if (!r) fail('unknown named region.');
  const { x, y, width: w, height: h } = r.content,
    center = mode === 'texel-center',
    bottom = origin === 'bottom-left';
  // Mirrors remapUVToAtlas: u-only passes V through, so it admits only a
  // top-left origin over a region that spans the whole atlas height.
  if (uOnly && (origin !== 'top-left' || y !== 0 || h !== p.manifest.height))
    fail('u-only binding requires a top-left origin over a full-height region.');
  return {
    manifestHash: p.manifest.manifestHash,
    specHash: p.manifest.specHash,
    layoutHash: p.manifest.layoutHash,
    region: r.name,
    content: structuredClone(r.content),
    allocation: structuredClone(r.allocation),
    inputOrigin: origin,
    mode,
    ...(uOnly ? { axes: 'u-only' as const } : {}),
    scale: [
      (w - (center ? 1 : 0)) / p.manifest.width,
      uOnly ? 1 : ((bottom ? -1 : 1) * (h - (center ? 1 : 0))) / p.manifest.height,
    ],
    offset: [
      (x + (center ? 0.5 : 0)) / p.manifest.width,
      uOnly ? 0 : (y + (bottom ? h - (center ? 0.5 : 0) : center ? 0.5 : 0)) / p.manifest.height,
    ],
  };
}
export function expandAtlasBinding(input: unknown, table: AtlasProvenanceTableV1) {
  canonicalAtlasMetadataJsonV1(input);
  const r = closed(input, ['version', 'atlasId', 'region', 'inputOrigin', 'mode', 'axes']);
  if (r['version'] !== ATLAS_PROVENANCE_VERSION) fail('unsupported binding version.');
  return derivedBinding(
    lookup(table, r['atlasId']),
    r['region'],
    r['inputOrigin'],
    r['mode'],
    r['axes'],
  );
}
/** A geometry-wide stamp can be associated only with the exact primary atlas supplied here. */
export function readAtlasGeometryBinding(
  geometry: THREE.BufferGeometry,
  provenance: AtlasProvenanceV1,
): AtlasBindingV1 | undefined {
  const stamp = field(geometry.userData, 'kilnAtlasBinding');
  if (stamp === undefined) return undefined;
  canonicalAtlasMetadataJsonV1(stamp);
  const r = stamp as Record<string, unknown>,
    derived = derivedBinding(provenance, r['region'], r['inputOrigin'], r['mode'], r['axes']);
  if (canonicalAtlasMetadataJsonV1(stamp) !== canonicalAtlasMetadataJsonV1(derived))
    fail('named binding identity or remap formula mismatch.');
  return {
    version: ATLAS_PROVENANCE_VERSION,
    atlasId: provenance.manifest.manifestHash,
    region: r['region'] as string,
    inputOrigin: r['inputOrigin'] as AtlasBindingV1['inputOrigin'],
    mode: r['mode'] as AtlasBindingV1['mode'],
    ...(r['axes'] === undefined ? {} : { axes: r['axes'] as AtlasBindingV1['axes'] }),
  };
}
export interface AtlasProvenanceCollection {
  table?: AtlasProvenanceTableV1;
  texture(texture: THREE.Texture): AtlasReferenceV1 | undefined;
  binding(geometry: THREE.BufferGeometry): AtlasBindingV1 | undefined;
}
export function collectAtlasProvenance(root: THREE.Object3D): AtlasProvenanceCollection {
  const textures = new Map<THREE.Texture, AtlasReferenceV1>(),
    geometries = new Map<THREE.BufferGeometry, AtlasBindingV1>(),
    candidates = new Map<THREE.Texture, unknown[]>(),
    sizes = new Map<string, number>(),
    pendingGeometry = new Map<THREE.BufferGeometry, string>();
  let total = TABLE_ENVELOPE_BYTES,
    pixelBytes = 0,
    bindings = 0;
  // Entire metadata graph admission comes before canonicalizers clone manifests or exporters clone scene state.
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh && !(node as THREE.Sprite).isSprite) return;
    const meshIds = new Set<string>(),
      mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats)
      for (const slot of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
        'aoMap',
      ]) {
        const texture = (mat as unknown as Record<string, unknown>)[slot];
        if (!(texture instanceof THREE.Texture)) continue;
        let ref = textures.get(texture);
        if (!ref) {
          const raw = textureCandidates(texture);
          if (!raw.length) continue;
          for (const candidate of raw) {
            canonicalAtlasMetadataJsonV1(candidate);
            const r = closed(candidate, ['spec', 'manifest']),
              id = field(r['manifest'], 'manifestHash');
            if (typeof id !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(id))
              fail('invalid atlas identity.');
            const bytes = new TextEncoder().encode(
              canonicalAtlasMetadataJsonV1({ ...r, id }),
            ).length;
            const prior = sizes.get(id) ?? 0;
            total += Math.max(0, bytes - prior) + (prior === 0 && sizes.size > 0 ? 1 : 0);
            sizes.set(id, Math.max(prior, bytes));
            if (
              total > ATLAS_PROVENANCE_LIMITS.bytes ||
              sizes.size > ATLAS_PROVENANCE_LIMITS.atlases
            )
              fail('aggregate metadata budget exceeded.');
            ref ??= { version: ATLAS_PROVENANCE_VERSION, id };
          }
          const spec = field(raw[0], 'spec'),
            width = field(spec, 'width'),
            height = field(spec, 'height');
          if (
            !Number.isSafeInteger(width) ||
            !Number.isSafeInteger(height) ||
            (width as number) < 1 ||
            (height as number) < 1
          )
            fail('invalid atlas image dimensions.');
          pixelBytes += (width as number) * (height as number) * 4;
          if (pixelBytes > ATLAS_PROVENANCE_LIMITS.bakeDecodedBytes)
            fail('aggregate atlas bake pixel budget exceeded.');
          candidates.set(texture, raw);
          textures.set(texture, ref!);
        }
        if (++bindings > ATLAS_PROVENANCE_LIMITS.bindings) fail('texture binding budget exceeded.');
        meshIds.add(ref!.id);
      }
    if (!mesh.isMesh) return;
    const stamp = field(mesh.geometry.userData, 'kilnAtlasBinding');
    if (stamp === undefined) return;
    if (++bindings > ATLAS_PROVENANCE_LIMITS.bindings) fail('primitive binding budget exceeded.');
    canonicalAtlasMetadataJsonV1(stamp);
    const id = field(stamp, 'manifestHash');
    if (typeof id !== 'string' || !meshIds.has(id))
      fail('named binding has no matching primary atlas texture on this mesh.');
    pendingGeometry.set(mesh.geometry, id);
  });
  const identities = new Map<string, AtlasProvenanceV1>();
  for (const [texture, raw] of candidates) {
    const p = normalizeCandidates(raw)!,
      id = p.manifest.manifestHash,
      prior = identities.get(id);
    if (prior && canonicalAtlasMetadataJsonV1(prior) !== canonicalAtlasMetadataJsonV1(p))
      fail('conflicting atlas identity.');
    identities.set(id, p);
    textures.set(texture, { version: ATLAS_PROVENANCE_VERSION, id });
  }
  for (const [geometry, id] of pendingGeometry)
    geometries.set(geometry, readAtlasGeometryBinding(geometry, identities.get(id)!)!);
  const table = identities.size
    ? {
        version: ATLAS_PROVENANCE_VERSION,
        atlases: [...identities].map(([id, p]) => ({ id, ...p })),
      }
    : undefined;
  return { table, texture: (t) => textures.get(t), binding: (g) => geometries.get(g) };
}
function rawDocumentTable(doc: Document): unknown {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return scene ? field(scene.getExtras(), 'kilnAtlasProvenance') : undefined;
}
export function atlasDocumentTable(doc: Document): AtlasProvenanceTableV1 | undefined {
  const raw = rawDocumentTable(doc);
  return raw === undefined ? undefined : validateAtlasProvenanceTable(raw);
}
export function atlasMaterialUses(doc: Document): { texture: GltfTexture; info: TextureInfo }[] {
  const uses: { texture: GltfTexture; info: TextureInfo }[] = [];
  for (const mat of doc.getRoot().listMaterials())
    for (const [texture, info] of [
      [mat.getBaseColorTexture(), mat.getBaseColorTextureInfo()],
      [mat.getNormalTexture(), mat.getNormalTextureInfo()],
      [mat.getMetallicRoughnessTexture(), mat.getMetallicRoughnessTextureInfo()],
      [mat.getEmissiveTexture(), mat.getEmissiveTextureInfo()],
      [mat.getOcclusionTexture(), mat.getOcclusionTextureInfo()],
    ] as const)
      if (texture && info && field(info.getExtras(), 'kilnAtlasReference') !== undefined) {
        if (uses.length >= ATLAS_PROVENANCE_LIMITS.bindings)
          fail('document binding budget exceeded.');
        uses.push({ texture, info });
      }
  return uses;
}
async function imageHash(texture: GltfTexture): Promise<string> {
  const bytes = texture.getImage();
  if (!bytes || bytes.byteLength > ATLAS_PROVENANCE_LIMITS.encodedBytes)
    fail('encoded image missing or over budget.');
  const result = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return `sha256:${[...new Uint8Array(result)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function sampler(info: TextureInfo) {
  const value = {
    minFilter: info.getMinFilter(),
    magFilter: info.getMagFilter(),
    wrapS: info.getWrapS(),
    wrapT: info.getWrapT(),
  };
  if (
    ![null, 9728, 9729, 9984, 9985, 9986, 9987].includes(value.minFilter) ||
    ![null, 9728, 9729].includes(value.magFilter) ||
    ![33071, 33648, 10497].includes(value.wrapS) ||
    ![33071, 33648, 10497].includes(value.wrapT)
  )
    fail('unsupported effective sampler.');
  return value;
}
function reference(input: unknown, table: AtlasProvenanceTableV1): AtlasReferenceV1 {
  canonicalAtlasMetadataJsonV1(input);
  const r = closed(input, ['version', 'id', 'effectiveSampler', 'finalMime', 'finalImageSha256']);
  if (r['version'] !== ATLAS_PROVENANCE_VERSION) fail('unsupported texture reference version.');
  lookup(table, r['id']);
  return r as unknown as AtlasReferenceV1;
}
function admitEncodedImages(uses: readonly { texture: GltfTexture; info: TextureInfo }[]): void {
  const seen = new Set<GltfTexture>();
  let total = 0;
  for (const { texture } of uses) {
    if (seen.has(texture)) continue;
    seen.add(texture);
    const bytes = texture.getImage();
    if (!bytes || bytes.byteLength > ATLAS_PROVENANCE_LIMITS.encodedBytes)
      fail('encoded image missing or over budget.');
    total += bytes.byteLength;
    if (total > ATLAS_PROVENANCE_LIMITS.aggregateEncodedBytes)
      fail('aggregate encoded image hash budget exceeded.');
  }
}
/** Export/optimization only: bind source identity to the final encoded bytes and actual per-use sampler. */
export async function refreshAtlasDocumentProvenance(doc: Document): Promise<void> {
  const table = atlasDocumentTable(doc),
    uses = atlasMaterialUses(doc);
  if (!uses.length) return;
  if (!table) fail('atlas table missing.');
  admitEncodedImages(uses);
  const hashes = new Map<GltfTexture, string>();
  for (const { texture, info } of uses) {
    const r = reference(field(info.getExtras(), 'kilnAtlasReference'), table);
    let hash = hashes.get(texture);
    if (!hash) {
      hash = await imageHash(texture);
      hashes.set(texture, hash);
    }
    info.setExtras({
      ...info.getExtras(),
      kilnAtlasReference: {
        version: ATLAS_PROVENANCE_VERSION,
        id: r.id,
        effectiveSampler: sampler(info),
        finalMime: texture.getMimeType(),
        finalImageSha256: hash,
      },
    });
  }
}
/** Import is validation, never a repair or identity refresh. */
export async function validateAtlasDocumentProvenance(doc: Document): Promise<void> {
  const table = atlasDocumentTable(doc),
    uses = atlasMaterialUses(doc);
  if (uses.length && !table) fail('atlas table missing.');
  if (!table) {
    for (const mesh of doc.getRoot().listMeshes())
      for (const primitive of mesh.listPrimitives())
        if (field(primitive.getExtras(), 'kilnAtlasBinding') !== undefined)
          fail('atlas table missing.');
    return;
  }
  admitEncodedImages(uses);
  const hashes = new Map<GltfTexture, string>();
  for (const { texture, info } of uses) {
    const r = reference(field(info.getExtras(), 'kilnAtlasReference'), table);
    let hash = hashes.get(texture);
    if (!hash) {
      hash = await imageHash(texture);
      hashes.set(texture, hash);
    }
    if (
      r.finalImageSha256 !== hash ||
      r.finalMime !== texture.getMimeType() ||
      canonicalAtlasMetadataJsonV1(r.effectiveSampler) !==
        canonicalAtlasMetadataJsonV1(sampler(info))
    )
      fail('final image or effective sampler identity mismatch.');
  }
  let bindings = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const binding = field(prim.getExtras(), 'kilnAtlasBinding');
      if (binding !== undefined) {
        if (++bindings > ATLAS_PROVENANCE_LIMITS.bindings) fail('primitive budget exceeded.');
        expandAtlasBinding(binding, table);
        const material = prim.getMaterial(),
          id = field(binding, 'atlasId');
        const infos = material
          ? [
              material.getBaseColorTextureInfo(),
              material.getNormalTextureInfo(),
              material.getMetallicRoughnessTextureInfo(),
              material.getEmissiveTextureInfo(),
              material.getOcclusionTextureInfo(),
            ]
          : [];
        if (
          !infos.some(
            (info) =>
              info &&
              field(info.getExtras(), 'kilnAtlasReference') !== undefined &&
              field(field(info.getExtras(), 'kilnAtlasReference'), 'id') === id,
          )
        )
          fail('named binding has no matching material atlas reference.');
      }
    }
}

const validatedDeliveries = new WeakMap<THREE.Texture, Readonly<AtlasReferenceV1>>();
/** Host-only owned identity established by the validated GLB loader; no serialized skip flag. */
export function readValidatedAtlasDelivery(
  texture: THREE.Texture,
): Readonly<AtlasReferenceV1> | undefined {
  const ref = validatedDeliveries.get(texture);
  return ref ? structuredClone(ref) : undefined;
}
export function readAtlasEncodedTexture(
  texture: THREE.Texture,
): { mime: 'image/png'; bytes: Uint8Array } | undefined {
  const encoded = field(texture.userData, 'encoded');
  if (encoded === undefined) return undefined;
  const r = closed(encoded, ['mime', 'bytes']);
  if (
    r['mime'] !== 'image/png' ||
    !(r['bytes'] instanceof Uint8Array) ||
    r['bytes'].byteLength > ATLAS_PROVENANCE_LIMITS.encodedBytes
  )
    fail('bounded PNG encoding required.');
  return { mime: 'image/png', bytes: r['bytes'] };
}
/** Called only after validateAtlasDocumentProvenance; each sampler use gets owned Three state. */
export function restoreAtlasTextureProvenance(
  texture: THREE.Texture,
  info: TextureInfo,
  table: AtlasProvenanceTableV1,
): void {
  const r = reference(field(info.getExtras(), 'kilnAtlasReference'), table),
    p = lookup(table, r.id);
  texture.userData.kilnAtlas = structuredClone({ spec: p.spec, manifest: p.manifest });
  validatedDeliveries.set(texture, Object.freeze(structuredClone(r)));
  restoreGltfTextureBinding(texture, info);
}

/** Compose before mergeDocuments copies image/geometry buffers or deletes the source scene. */
export async function mergeAtlasDocumentProvenance(
  target: Document,
  source: Document,
): Promise<void> {
  const sourceRaw = rawDocumentTable(source),
    targetRaw = rawDocumentTable(target);
  const union = new Map<unknown, Record<string, unknown>>();
  for (const raw of [targetRaw, sourceRaw])
    if (raw !== undefined)
      for (const entry of admitTable(raw)) {
        const prior = union.get(entry['id']);
        if (prior && canonicalAtlasMetadataJsonV1(prior) !== canonicalAtlasMetadataJsonV1(entry))
          fail('conflicting atlas identity during composition.');
        union.set(entry['id'], entry);
      }
  // The combined graph is admitted before any recipe/manifest cloning or source graph merge.
  const combined = union.size
    ? { version: ATLAS_PROVENANCE_VERSION, atlases: [...union.values()] }
    : undefined;
  if (combined) admitTable(combined);
  admitEncodedImages([...atlasMaterialUses(target), ...atlasMaterialUses(source)]);
  await validateAtlasDocumentProvenance(source);
  await validateAtlasDocumentProvenance(target);
  if (combined) {
    const table = validateAtlasProvenanceTable(combined),
      scene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0];
    if (!scene) fail('composition target scene missing.');
    scene.setExtras({ ...scene.getExtras(), kilnAtlasProvenance: table });
  }
}
