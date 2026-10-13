/**
 * Bake in-memory textures to encoded PNG bytes before export — T2.2
 *
 * ## The problem this closes
 *
 * The GLB bridge (`render.ts` `bridgeTexture`) serializes a texture only if it
 * carries `userData.encoded` — the original bytes `loadTexture` stashed. A
 * texture built in code (a procedural `DataTexture`) has pixels but no encoded
 * bytes, so the bridge returned `null` and the slot was simply left off the
 * material.
 *
 * Measured, before this module existed: a `MeshStandardMaterial` with a
 * hand-built 8x8 checker `map` exported 1912 bytes of valid GLB with **zero
 * warnings**, no image in the file, and a QA disposition of `pass` under
 * `KILN_QA_MODE=off`. The asset shipped looking clean with its texture gone.
 * The scene QA gate does catch it at default settings
 * (`MAT_TEXTURE_DECODE_FAILED`), but that gate is downgradable and it is a
 * *block*, not a bake — it tells an author the texture is unexportable rather
 * than making it exportable.
 *
 * ## What this does
 *
 * Runs before scene QA, so QA judges what will actually be in the file. Every
 * texture reachable from a material slot that has readable 8-bit pixel data and
 * no encoded bytes is encoded to PNG and stamped with the same two `userData`
 * records `loadTexture` writes, so everything downstream — QA, the bridge,
 * provenance — treats a baked texture and a loaded one identically.
 *
 * Anything that cannot be baked gets a warning naming the material, the slot,
 * and the reason. That is the "loud" half: the bridge sees only a `THREE.Texture`
 * and cannot name where it came from, whereas this pass walks slots and can.
 *
 * ## What this deliberately does not do
 *
 * It never sets `texture.colorSpace`. QA requires sRGB for `map`/`emissiveMap`
 * and linear for the data maps, and a hand-built `DataTexture` defaults to
 * linear — but silently reinterpreting an author's pixels is the same class of
 * bug as the silent drop. A procedural albedo with the wrong color space still
 * blocks, with a message that now names the procedural fix.
 */

import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  collectAtlasProvenance,
  readAtlasEncodedTexture,
  readValidatedAtlasDelivery,
  type AtlasReferenceV1,
} from './atlas-provenance';
import type { EncodedTextureData, KilnTextureMetadata, TextureUsage } from './textures';

export interface BakedTextureBindingV1 {
  node: string;
  material: string;
  slot: string;
  usage: TextureUsage;
}

/** Provenance for one texture this pass encoded. Deterministic and sorted. */
export interface BakedTextureProvenanceV1 {
  schemaVersion: 1;
  /** `texture.name`, or `(unnamed texture)` — matches QA's `affected` naming. */
  texture: string;
  /** Owning material name, for locating it in the source. */
  material: string;
  /** Owning scene node name. This is a bounded semantic locator, never a host path. */
  node: string;
  /** glTF-facing slot the texture fills (`map`, `normalMap`, ...). */
  slot: string;
  usage: TextureUsage;
  /** Every scene binding of these encoded bytes, in deterministic traversal order. */
  bindings: BakedTextureBindingV1[];
  width: number;
  height: number;
  channels: 3 | 4;
  /** Encoded PNG size in bytes. */
  bytes: number;
  /** Encoding and interpretation of the exact embedded image bytes. */
  mime: 'image/png';
  colorSpace: 'srgb' | 'linear';
  /** SHA-256 identity of the encoded PNG bytes. */
  imageSha256: `sha256:${string}`;
  /** SHA-256 identity of the final GLB containing this binding. Filled after export. */
  artifactGlbSha256?: `sha256:${string}`;
  /**
   * Encoding of the image actually bound by the final GLB after downstream
   * packing/transcoding. Absent only while this record still describes the
   * first engine export.
   */
  finalMime?: string;
  /** SHA-256 identity of those exact final embedded image bytes. */
  finalImageSha256?: `sha256:${string}`;
  /** SHA-1 of the PNG bytes — the handle a determinism test compares. */
  sha1: string;
  /**
   * The layer stack, when this texture came from `proceduralTexture()`.
   *
   * Recorded so the manifest says what was generated rather than only that
   * something was: the spec is small, serializable, and sufficient to
   * regenerate the exact bytes. Absent for textures loaded from a file.
   */
  procedural?: ProceduralRecipeRecord;
  /** Compact atlas source identity; the export scene table owns its recipe/manifest. */
  atlas?: AtlasReferenceV1;
}

/** The `userData.kilnProcedural` stamp `proceduralTexture()` leaves behind. */
interface ProceduralRecipeRecord {
  schemaVersion: 1 | 2;
  size: number;
  usage: TextureUsage;
  name?: string;
  layers: unknown[];
  /** V2 canonical identity; absent on historical V1 texture stamps. */
  canonicalJson?: string;
  recipeHash?: `sha256:${string}`;
}

/**
 * Material slots the GLB bridge can serialize, with the glTF usage each one
 * implies. Kept in the same order the bridge reads them so a warning list and a
 * material read the same way.
 *
 * `map` is read off every material type, not just `MeshStandardMaterial` — the
 * bridge's non-PBR path (`common.map`) bridges it too, and a Lambert or Basic
 * material with a dropped texture was just as silent.
 */
const SLOT_USAGE: ReadonlyArray<readonly [string, TextureUsage]> = [
  ['map', 'albedo'],
  ['normalMap', 'normal'],
  ['roughnessMap', 'roughness'],
  ['metalnessMap', 'metalness'],
  ['emissiveMap', 'emissive'],
  ['aoMap', 'occlusion'],
];

interface RawPixels {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 3 | 4;
}

/**
 * Read 8-bit pixels off a texture, or explain why they are unusable.
 *
 * Returns a string instead of throwing because every failure here is a warning
 * on an otherwise-valid asset, not an error that should lose the whole export.
 */
function readPixels(texture: THREE.Texture): RawPixels | string {
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  if (!image) return 'it has no image data';

  const { width, height } = image;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) {
    return 'its image has no usable width/height';
  }

  const data = image.data;
  if (!data) {
    // A texture from an <img>/ImageBitmap has pixels the CPU cannot read without
    // a canvas, which does not exist headlessly.
    return 'its pixels are not readable in Node (only DataTexture-style byte arrays can be baked)';
  }
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    return `its pixel data is ${data.constructor?.name ?? 'an unknown type'}, not 8-bit bytes (float/half-float textures cannot be baked to PNG)`;
  }

  const pixels = (width as number) * (height as number);
  const channels = data.length / pixels;
  if (channels !== 3 && channels !== 4) {
    return `its pixel data is ${data.length} bytes for ${width}x${height}, which is neither RGB nor RGBA`;
  }

  return {
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    width: width as number,
    height: height as number,
    channels,
  };
}

/**
 * Encode raw pixels to PNG.
 *
 * Options are pinned rather than left to sharp's defaults so the same pixels
 * produce the same bytes: T2.2's acceptance criterion is byte-level determinism
 * across runs, and a default that shifted between sharp releases would move the
 * output of every textured asset at once. `palette: false` matters most — sharp
 * may quantize to a palette when it thinks that is smaller, which is both
 * lossy and dependent on the encoder's own heuristics.
 */
async function encodePngFromRaw(raw: RawPixels): Promise<Uint8Array> {
  const sharp = (await import('sharp')).default;
  const out = await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.length), {
    raw: { width: raw.width, height: raw.height, channels: raw.channels },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return new Uint8Array(out);
}

function hasTranslucentPixel(raw: RawPixels): boolean {
  if (raw.channels !== 4) return false;
  for (let i = 3; i < raw.data.length; i += 4) {
    if ((raw.data[i] ?? 255) < 255) return true;
  }
  return false;
}

function isTexture(value: unknown): value is THREE.Texture {
  return (value as THREE.Texture | undefined)?.isTexture === true;
}

/**
 * Encode every bakeable texture in the scene in place, and report what happened.
 *
 * Mutates `texture.userData` (adding `encoded` + `kilnTexture`) rather than
 * cloning, because the scene graph is handed straight to the bridge afterwards
 * and a clone would have to be re-attached to every slot that referenced it —
 * including the shared-texture case, where two materials point at one texture
 * and must keep doing so for the bridge's texture cache to dedupe them.
 *
 * A texture reachable from several slots is encoded once. The first slot that
 * reaches it decides the recorded `usage`, and slots are walked in a fixed
 * order over a deterministically-sorted scene traversal, so the choice is
 * stable across runs.
 *
 * @param root Scene root, traversed for meshes and their materials.
 * @param warnings Appended to, one line per texture that could not be baked.
 * @returns Provenance for each baked texture, sorted by name/slot.
 */
export async function bakeSceneTextures(
  root: THREE.Object3D,
  warnings: string[],
): Promise<BakedTextureProvenanceV1[]> {
  const atlas = collectAtlasProvenance(root);
  // Collect first, encode second: traversal is sync, encoding is not, and doing
  // them together would interleave awaits with a mutating walk.
  const pending = new Map<
    THREE.Texture,
    {
      texture: THREE.Texture;
      bindings: Array<{
        node: string;
        material: string;
        slot: string;
        usage: TextureUsage;
      }>;
    }
  >();

  root.traverse((node) => {
    const material = (node as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of materials) {
      const bag = item as unknown as Record<string, unknown>;
      for (const [slot, usage] of SLOT_USAGE) {
        const texture = bag[slot];
        if (!isTexture(texture)) continue;
        if ((texture.userData as Record<string, unknown>)['encoded'] && !atlas.texture(texture))
          continue;
        const existing = pending.get(texture) ?? { texture, bindings: [] };
        existing.bindings.push({
          node: node.name || '(unnamed node)',
          material: item.name || '(unnamed material)',
          slot,
          usage,
        });
        pending.set(texture, existing);
      }
    }
  });

  const baked: BakedTextureProvenanceV1[] = [];
  for (const entry of pending.values()) {
    const name = entry.texture.name || '(unnamed texture)';
    const atlasRef = atlas.texture(entry.texture);
    const atlasRecord = atlasRef && atlas.table!.atlases.find((a) => a.id === atlasRef.id)!;
    const encoded = atlasRef ? readAtlasEncodedTexture(entry.texture) : undefined;
    if (
      encoded &&
      (encoded.mime !== 'image/png' ||
        !(encoded.bytes instanceof Uint8Array) ||
        encoded.bytes.length > 16_777_216)
    )
      throw new TypeError('Atlas baked encoding must be bounded PNG bytes.');
    const raw =
      encoded && atlasRecord
        ? {
            width: atlasRecord.spec.width,
            height: atlasRecord.spec.height,
            channels: 4 as const,
            data: new Uint8Array(0),
          }
        : readPixels(entry.texture);
    const firstBinding = entry.bindings[0]!;
    const bindingSummary = `material ${JSON.stringify(firstBinding.material)} (${firstBinding.slot})${entry.bindings.length > 1 ? ` and ${entry.bindings.length - 1} other binding(s)` : ''}`;
    if (typeof raw === 'string') {
      if (atlasRef)
        throw new TypeError(
          `Atlas has stale compiled provenance: ${raw}; rebuild with textureAtlas() or remove atlas metadata for a manual texture.`,
        );
      warnings.push(
        `Texture ${JSON.stringify(name)} on ${bindingSummary} was dropped from the GLB: ${raw}.`,
      );
      continue;
    }

    if (atlasRecord) {
      const stale = () =>
        new TypeError(
          'Atlas has stale compiled provenance: rebuild with textureAtlas() after editing pixels, or remove atlas metadata for a manual texture.',
        );
      if (encoded) {
        const delivery = readValidatedAtlasDelivery(entry.texture);
        if (delivery) {
          if (
            delivery.id !== atlasRef!.id ||
            delivery.finalMime !== encoded.mime ||
            delivery.finalImageSha256 !==
              `sha256:${createHash('sha256').update(encoded.bytes).digest('hex')}`
          )
            throw stale();
        } else {
          const sharp = (await import('sharp')).default;
          const image = sharp(encoded.bytes, {
            limitInputPixels: atlasRecord.spec.width * atlasRecord.spec.height,
          });
          const metadata = await image.metadata();
          if (
            metadata.width !== atlasRecord.spec.width ||
            metadata.height !== atlasRecord.spec.height
          )
            throw stale();
          const decoded = await image.ensureAlpha().raw().toBuffer();
          if (
            `sha256:${createHash('sha256').update(decoded).digest('hex')}` !==
            atlasRecord.manifest.decodedPixelHash
          )
            throw stale();
        }
      } else if (
        raw.width !== atlasRecord.spec.width ||
        raw.height !== atlasRecord.spec.height ||
        raw.channels !== 4 ||
        `sha256:${createHash('sha256').update(raw.data).digest('hex')}` !==
          atlasRecord.manifest.decodedPixelHash
      )
        throw stale();
    }

    let bytes: Uint8Array;
    try {
      bytes = encoded?.bytes ?? (await encodePngFromRaw(raw));
    } catch (err) {
      warnings.push(
        `Texture ${JSON.stringify(name)} on ${bindingSummary} was dropped from the GLB: PNG encoding failed (${err instanceof Error ? err.message : String(err)}).`,
      );
      continue;
    }

    (entry.texture.userData as Record<string, unknown>)['encoded'] = {
      mime: 'image/png',
      bytes,
    } satisfies EncodedTextureData;
    // Describe what the texture IS, not what the slot wants — QA compares this
    // against `texture.colorSpace`, and reporting the slot's expectation here
    // would make a mismatched color space pass by asserting itself.
    const colorSpace = entry.texture.colorSpace === THREE.SRGBColorSpace ? 'srgb' : 'linear';
    const recipe = (entry.texture.userData as Record<string, unknown>)['kilnProcedural'] as
      | ProceduralRecipeRecord
      | undefined;
    // Prefer the authored portable usage over incidental slot order. A packed
    // metallic-roughness map occupies both Three.js slots, where choosing the
    // first (`roughnessMap`) loses the authored combined-channel meaning.
    const primaryUsage =
      atlasRecord?.spec.usage ??
      recipe?.usage ??
      (entry.bindings.some(({ slot }) => slot === 'roughnessMap') &&
      entry.bindings.some(({ slot }) => slot === 'metalnessMap')
        ? 'metallicRoughness'
        : (entry.bindings[0]?.usage ?? 'albedo'));
    if (!encoded)
      (entry.texture.userData as Record<string, unknown>)['kilnTexture'] = {
        usage: primaryUsage,
        colorSpace,
        width: raw.width,
        height: raw.height,
        hasAlpha: hasTranslucentPixel(raw),
      } satisfies KilnTextureMetadata;

    const sha1 = createHash('sha1').update(bytes).digest('hex');
    const imageSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;
    baked.push({
      schemaVersion: 1,
      texture: name,
      node: firstBinding.node,
      material: firstBinding.material,
      slot: firstBinding.slot,
      usage: primaryUsage,
      bindings: entry.bindings,
      width: raw.width,
      height: raw.height,
      channels: raw.channels,
      bytes: bytes.length,
      mime: 'image/png',
      colorSpace,
      imageSha256,
      sha1,
      ...(recipe ? { procedural: recipe } : {}),
      ...(atlasRef ? { atlas: atlasRef } : {}),
    });
  }

  return baked.sort((a, b) =>
    `${a.node}:${a.material}:${a.texture}:${a.slot}`.localeCompare(
      `${b.node}:${b.material}:${b.texture}:${b.slot}`,
    ),
  );
}

// -----------------------------------------------------------------------------
// Tangents for normal-mapped meshes
// -----------------------------------------------------------------------------

/**
 * Give every normal-mapped mesh a TANGENT attribute.
 *
 * A glTF material with a normal texture is supposed to ship tangents. Without
 * them the Khronos validator raises `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`
 * and each runtime invents its own tangent basis, so the same asset lights
 * differently in different engines — the exact failure mode that makes a normal
 * map look right in one viewer and subtly wrong in another.
 *
 * Measured on a procedural crate with a derived normal map: the GLB validated
 * with that warning and no TANGENT accessor until this pass existed. The bridge
 * already exports `geometry.attributes.tangent` when it is present; nothing was
 * ever computing it.
 *
 * Runs only where it is needed — a mesh with no normal map does not pay for it,
 * and the attribute changes the exported bytes, so computing it unconditionally
 * would move every existing textured asset for no benefit.
 *
 * MikkTSpace is the gold standard and glTF's reference basis, but it is a
 * separate WASM package. This engine is vendored into Studio as a tarball and
 * installed into two container images by two different package managers, so a
 * new native/WASM dependency is a real cost there — `computeTangentBasis` below
 * implements the standard per-triangle formulation directly instead. three's
 * own `computeTangents` used the same method before it was removed. If tangent
 * seams ever show on a shipped asset, MikkTSpace is the upgrade path.
 *
 * @param root Scene root, traversed for meshes.
 * @param warnings Appended to for each mesh that needs tangents but cannot get them.
 * @returns Number of geometries that received a tangent attribute.
 */
/**
 * Per-vertex tangent basis (Lengyel's method).
 *
 * Accumulates a tangent and bitangent per vertex from each triangle's position
 * and UV deltas, then orthonormalizes the tangent against the vertex normal.
 * The fourth component is the handedness the shader needs to rebuild the
 * bitangent as `cross(normal, tangent.xyz) * tangent.w`.
 *
 * Triangles with degenerate UVs (zero area in texture space) contribute
 * nothing rather than poisoning the accumulation with infinities.
 *
 * Non-indexed geometry is handled directly. A triangle soup is just an index
 * buffer that happens to read 0, 1, 2, ... so the same accumulation is exactly
 * right for it: every vertex belongs to one face and comes out holding that
 * face's tangent. Flat-shaded parts, anything merged from several geometries,
 * and anything through `.toNonIndexed()` all land here, which is most of what a
 * hand-built asset is made of -- refusing them would have meant no portable
 * tangents on the majority of normal-mapped meshes.
 */
function computeTangentBasis(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!position || !normal || !uv) {
    throw new Error('position, normal, and uv are all required');
  }

  const vertexCount = position.count;
  const triangleIndices = index ? index.count : vertexCount;
  const at = index ? (i: number) => index.getX(i) : (i: number) => i;
  const tan1 = new Float32Array(vertexCount * 3);
  const tan2 = new Float32Array(vertexCount * 3);

  for (let i = 0; i + 2 < triangleIndices; i += 3) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);

    const x1 = position.getX(b) - position.getX(a);
    const y1 = position.getY(b) - position.getY(a);
    const z1 = position.getZ(b) - position.getZ(a);
    const x2 = position.getX(c) - position.getX(a);
    const y2 = position.getY(c) - position.getY(a);
    const z2 = position.getZ(c) - position.getZ(a);

    const s1 = uv.getX(b) - uv.getX(a);
    const t1 = uv.getY(b) - uv.getY(a);
    const s2 = uv.getX(c) - uv.getX(a);
    const t2 = uv.getY(c) - uv.getY(a);

    const det = s1 * t2 - s2 * t1;
    if (det === 0 || !Number.isFinite(det)) continue;
    const r = 1 / det;

    const sdx = (t2 * x1 - t1 * x2) * r;
    const sdy = (t2 * y1 - t1 * y2) * r;
    const sdz = (t2 * z1 - t1 * z2) * r;
    const tdx = (s1 * x2 - s2 * x1) * r;
    const tdy = (s1 * y2 - s2 * y1) * r;
    const tdz = (s1 * z2 - s2 * z1) * r;

    for (const v of [a, b, c]) {
      const o = v * 3;
      tan1[o] = (tan1[o] ?? 0) + sdx;
      tan1[o + 1] = (tan1[o + 1] ?? 0) + sdy;
      tan1[o + 2] = (tan1[o + 2] ?? 0) + sdz;
      tan2[o] = (tan2[o] ?? 0) + tdx;
      tan2[o + 1] = (tan2[o + 1] ?? 0) + tdy;
      tan2[o + 2] = (tan2[o + 2] ?? 0) + tdz;
    }
  }

  const out = new Float32Array(vertexCount * 4);
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  for (let v = 0; v < vertexCount; v++) {
    n.set(normal.getX(v), normal.getY(v), normal.getZ(v));
    t.set(tan1[v * 3]!, tan1[v * 3 + 1]!, tan1[v * 3 + 2]!);

    // A vertex touched only by degenerate triangles has no tangent to
    // orthogonalize; give it any vector perpendicular to the normal so the
    // attribute stays well-formed instead of holding NaN.
    if (t.lengthSq() === 0) {
      t.set(1, 0, 0);
      if (Math.abs(n.x) > 0.9) t.set(0, 1, 0);
    }

    // Gram-Schmidt: remove the component along the normal, then normalize.
    tmp.copy(t).sub(tmp2.copy(n).multiplyScalar(n.dot(t)));
    if (tmp.lengthSq() === 0) tmp.set(1, 0, 0);
    tmp.normalize();

    tmp2.set(tan2[v * 3]!, tan2[v * 3 + 1]!, tan2[v * 3 + 2]!);
    const w = n.clone().cross(t).dot(tmp2) < 0 ? -1 : 1;

    out[v * 4] = tmp.x;
    out[v * 4 + 1] = tmp.y;
    out[v * 4 + 2] = tmp.z;
    out[v * 4 + 3] = w;
  }

  geometry.setAttribute('tangent', new THREE.BufferAttribute(out, 4));
}

export function ensureNormalMapTangents(root: THREE.Object3D, warnings: string[]): number {
  let count = 0;
  const done = new Set<THREE.BufferGeometry>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const needsTangents = materials.some(
      (m) => (m as THREE.MeshStandardMaterial | undefined)?.normalMap,
    );
    if (!needsTangents) return;

    const geometry = mesh.geometry;
    if (!geometry || done.has(geometry) || geometry.getAttribute('tangent')) return;
    done.add(geometry);

    const name = mesh.name || '(unnamed mesh)';
    if (!geometry.getAttribute('uv')) {
      warnings.push(
        `Mesh ${JSON.stringify(name)} uses a normal map but has no UV coordinates, so tangents could not be computed — and the normal map cannot be sampled either. Unwrap it first: mesh.geometry = await autoUnwrap(mesh.geometry).`,
      );
      return;
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

    try {
      computeTangentBasis(geometry);
      count++;
    } catch (err) {
      warnings.push(
        `Mesh ${JSON.stringify(name)} uses a normal map but tangents could not be computed (${err instanceof Error ? err.message : String(err)}). Each runtime will generate its own tangent basis.`,
      );
    }
  });

  return count;
}
