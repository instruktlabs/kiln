/**
 * Runtime texture manifest (#213): one entry per glTF image naming its exact delivered bytes,
 * so a host can deduplicate shared library textures without decoding every GLB.
 *
 * Pure: reads the GLB JSON and binary chunk directly; no renderer, filesystem or network.
 */
import type { MaterialMapPinV1, MaterialMapSlotV1 } from './pinned-material-map';

/** One delivered image. Additive to `kiln.runtime-metadata.v1` as sidecar `textures[]`. */
export interface RuntimeTextureManifestEntryV1 {
  /** glTF image index in the delivered asset. */
  image: number;
  /** `sha256:<hex>` of the exact delivered bytes. */
  sha256: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  /** sRGB when a base colour or emissive slot uses the image, linear otherwise. */
  colorSpace: 'srgb' | 'linear';
  /** The bytes before KTX2 encoding, present only when encoding changed them. */
  sourceSha256?: string;
  /** Present only when the pre-encode bytes exactly equal a map of the saved material closure. */
  material?: { pin: MaterialMapPinV1; slot: MaterialMapSlotV1 };
  /** External layout only: the image file, relative to the `.gltf`. */
  uri?: string;
}

/** A library map the record's saved material closure declares, keyed by its exact bytes. */
export interface RuntimeTextureMaterialMapV1 {
  sha256: string;
  pin: MaterialMapPinV1;
  slot: MaterialMapSlotV1;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const index = (value: unknown): number | undefined =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The KTX 2.0 file identifier: <<KTX 20>>\r\n\x1A\n. */
export const KTX2_IDENTIFIER = Object.freeze([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const isKtx2 = (bytes: Uint8Array) =>
  bytes.byteLength >= 12 && KTX2_IDENTIFIER.every((value, at) => bytes[at] === value);

/** Pixel dimensions from the image header (PNG, JPEG, WebP or KTX2). */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (): never => {
    throw new Error('Texture manifest cannot read image dimensions');
  };
  const at = (offset: number, length: number) => {
    if (offset + length > bytes.byteLength) fail();
  };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    at(16, 8);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (isKtx2(bytes)) {
    at(20, 8);
    return { width: view.getUint32(20, true), height: view.getUint32(24, true) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.byteLength) {
      if (bytes[offset] !== 0xff) fail();
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      // Start-of-frame markers, excluding DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        at(offset + 5, 4);
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + length;
    }
    fail();
  }
  const text = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 4, bytes.byteLength)));
  if (text(0) === 'RIFF' && text(8) === 'WEBP') {
    at(12, 19);
    const chunk = text(12);
    if (chunk === 'VP8X')
      return {
        width: 1 + (view.getUint32(24, true) & 0xffffff),
        height: 1 + (view.getUint32(27, true) & 0xffffff),
      };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') {
      at(26, 4);
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
  }
  return fail();
}

/** Image indices a texture reads, including the compressed-image extensions' sources. */
function textureSource(texture: unknown): number | undefined {
  if (!object(texture)) return undefined;
  const extensions = object(texture.extensions) ? texture.extensions : {};
  for (const name of ['KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif']) {
    const extension = extensions[name];
    if (object(extension) && index(extension.source) !== undefined) return index(extension.source);
  }
  return index(texture.source);
}

/** sRGB image indices: those a base colour or emissive slot uses (the KTX2 encoder's rule). */
export function srgbImages(json: Record<string, unknown>): Set<number> {
  const textures = Array.isArray(json.textures) ? json.textures : [];
  const result = new Set<number>();
  for (const material of Array.isArray(json.materials) ? json.materials : []) {
    if (!object(material)) continue;
    const pbr = object(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
    for (const info of [pbr.baseColorTexture, material.emissiveTexture]) {
      const texture = object(info) ? index(info.index) : undefined;
      const image = texture === undefined ? undefined : textureSource(textures[texture]);
      if (image !== undefined) result.add(image);
    }
  }
  return result;
}

function base64(text: string): Uint8Array {
  const binary = atob(text);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** The exact bytes of each embedded image, in image index order. */
export function embeddedImages(
  json: Record<string, unknown>,
  binary: Uint8Array | undefined,
): { bytes: Uint8Array; mimeType: string }[] {
  const views = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  return (Array.isArray(json.images) ? json.images : []).map((image) => {
    if (!object(image)) throw new Error('Invalid glTF image');
    const view = index(image.bufferView);
    if (view !== undefined) {
      const def = views[view];
      if (!object(def) || index(def.buffer) !== 0 || !binary)
        throw new Error('Texture manifest requires images embedded in the GLB binary chunk');
      const offset = index(def.byteOffset) ?? 0;
      const length = index(def.byteLength);
      if (length === undefined || offset + length > binary.byteLength)
        throw new Error('Invalid glTF image buffer view');
      if (typeof image.mimeType !== 'string') throw new Error('Embedded image needs a mimeType');
      return { bytes: binary.subarray(offset, offset + length), mimeType: image.mimeType };
    }
    const match =
      typeof image.uri === 'string' ? /^data:([^;,]+);base64,(.*)$/s.exec(image.uri) : null;
    if (!match) throw new Error('Texture manifest requires embedded image bytes');
    return { bytes: base64(match[2]!), mimeType: match[1]! };
  });
}

/**
 * Build the manifest of a delivered asset. `sources` gives the pre-encode hash of each image
 * that KTX2 encoding changed; `maps` are the saved material closure's maps.
 */
export async function runtimeTextureManifest(
  json: Record<string, unknown>,
  binary: Uint8Array | undefined,
  options: {
    sources?: ReadonlyMap<number, string>;
    maps?: readonly RuntimeTextureMaterialMapV1[];
  } = {},
): Promise<RuntimeTextureManifestEntryV1[]> {
  const srgb = srgbImages(json);
  const entries: RuntimeTextureManifestEntryV1[] = [];
  for (const [image, { bytes, mimeType }] of embeddedImages(json, binary).entries()) {
    const sha256 = `sha256:${await sha256Hex(bytes)}`;
    const sourceSha256 = options.sources?.get(image);
    const original = sourceSha256 ?? sha256;
    const map = options.maps?.find((candidate) => candidate.sha256 === original);
    entries.push({
      image,
      sha256,
      bytes: bytes.byteLength,
      mimeType,
      ...imageDimensions(bytes),
      colorSpace: srgb.has(image) ? 'srgb' : 'linear',
      ...(sourceSha256 && sourceSha256 !== sha256 ? { sourceSha256 } : {}),
      ...(map ? { material: { pin: { ...map.pin }, slot: map.slot } } : {}),
    });
  }
  return entries;
}

/** File extension of a delivered image in the external layout. */
export function textureFileExtension(mimeType: string): string {
  const extension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/ktx2': 'ktx2',
  }[mimeType];
  if (!extension) throw new Error(`External textures do not support ${mimeType}`);
  return extension;
}
