/**
 * Cross-asset texture sharing report (#287).
 *
 * Every delivered GLB embeds its own copy of the textures it uses, so a pack built on a
 * shared material family ships that family once per asset. The duplication is entirely
 * *between* assets: measured over 160 assets in four real worlds, within-asset duplicate
 * images were 0 every time, because the exporter already dedupes images inside one
 * document. A per-asset export receipt therefore cannot see any of it, and this report is
 * scoped to a set of delivered assets instead.
 *
 * It reads only the delivered bytes and rewrites nothing, so canonical and runtime exports
 * stay byte-identical. Acting on it is `--textures external`, which writes each image once
 * as `textures/<sha256>.<ext>`; `--textures manifest` carries the same identities in the
 * sidecar for a host that shares them itself.
 */
import { imageDimensions, sha256Hex } from './runtime-textures';

/** One distinct image, and every asset in the set that embeds those exact bytes. */
export interface TextureSharingImageV1 {
  /** `sha256:<64 lowercase hexadecimal characters>` of the exact embedded bytes. */
  sha256: string;
  bytes: number;
  mimeType: string;
  /** Pixel size from the image header, absent when the header is not one it reads. */
  width?: number;
  height?: number;
  /** Embedded copies across the set; `1` means no asset shares it. */
  copies: number;
  /** Names of the assets embedding it, sorted. */
  assets: string[];
}

export interface TextureSharingReportV1 {
  version: 'kiln.texture-sharing.v1';
  /** Assets read, excluding `skipped`. */
  assets: number;
  /** Total delivered bytes of those assets. */
  assetBytes: number;
  /** Embedded image occurrences across the set. */
  embeddedImages: number;
  distinctImages: number;
  embeddedImageBytes: number;
  distinctImageBytes: number;
  /** `embeddedImageBytes - distinctImageBytes`: what sharing each image once would save. */
  duplicateImageBytes: number;
  /** Distinct images, largest saving first, then by hash. */
  images: TextureSharingImageV1[];
  /** Inputs that are not readable GLBs, each with the reason, so one bad file is not fatal. */
  skipped: { name: string; reason: string }[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const index = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

/** The JSON and binary chunks of a GLB, or a reason it is not one. */
function readGlb(bytes: Uint8Array): { json: Record<string, unknown>; binary?: Uint8Array } {
  if (bytes.byteLength < 20) throw new Error('Not a GLB: shorter than a GLB header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB: bad magic');
  if (view.getUint32(4, true) !== 2) throw new Error('Not a GLB: unsupported version');
  if (view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('Not a GLB: first chunk is not JSON');
  const jsonEnd = 20 + view.getUint32(12, true);
  if (jsonEnd > bytes.byteLength) throw new Error('Invalid GLB chunk length');
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd)));
  if (!object(json)) throw new Error('Invalid glTF asset');
  if (jsonEnd + 8 > bytes.byteLength || view.getUint32(jsonEnd + 4, true) !== 0x004e4942)
    return { json };
  const length = view.getUint32(jsonEnd, true);
  if (jsonEnd + 8 + length > bytes.byteLength) throw new Error('Invalid GLB chunk length');
  return { json, binary: bytes.subarray(jsonEnd + 8, jsonEnd + 8 + length) };
}

const DATA_URI = /^data:([^;,]+);base64,(.*)$/s;

/**
 * Pixel size when the header is one Kiln reads. Byte identity is what sharing turns on, so
 * an image in some other format still counts; it just reports no size.
 */
function pixelSize(bytes: Uint8Array): { width?: number; height?: number } {
  try {
    return imageDimensions(bytes);
  } catch {
    return {};
  }
}

/**
 * The exact bytes of each image this GLB carries itself. An image referenced by a plain
 * URI is already shared with whatever hosts it, so it carries no duplication and is not
 * counted.
 */
function carriedImages(
  json: Record<string, unknown>,
  binary: Uint8Array | undefined,
): { bytes: Uint8Array; mimeType: string }[] {
  const views = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  const carried: { bytes: Uint8Array; mimeType: string }[] = [];
  for (const image of Array.isArray(json.images) ? json.images : []) {
    if (!object(image)) throw new Error('Invalid glTF image');
    const view = index(image.bufferView);
    if (view !== undefined) {
      const def = views[view];
      if (!object(def)) throw new Error('Invalid glTF image buffer view');
      // Buffer 0 is the GLB's own binary chunk; any other buffer is a separate file, so
      // reading the chunk at that offset would report bytes that are not the image.
      if ((index(def.buffer) ?? 0) !== 0)
        throw new Error('Image buffer view is not in this GLB binary chunk');
      const offset = index(def.byteOffset) ?? 0;
      const length = index(def.byteLength);
      if (length === undefined || !binary || offset + length > binary.byteLength)
        throw new Error('Invalid glTF image buffer view');
      if (typeof image.mimeType !== 'string') throw new Error('Embedded image needs a mimeType');
      carried.push({ bytes: binary.subarray(offset, offset + length), mimeType: image.mimeType });
      continue;
    }
    const match = typeof image.uri === 'string' ? DATA_URI.exec(image.uri) : null;
    if (match)
      carried.push({
        bytes: Uint8Array.from(atob(match[2]!), (character) => character.charCodeAt(0)),
        mimeType: match[1]!,
      });
  }
  return carried;
}

/**
 * Group the images a set of delivered assets carries by their exact bytes.
 *
 * @example
 * const report = await textureSharingReport([
 *   { name: 'palm.glb', bytes: palm },
 *   { name: 'fern.glb', bytes: fern },
 * ]);
 * report.duplicateImageBytes; // bytes a shared leaf atlas would save across the pack
 */
export async function textureSharingReport(
  assets: readonly { name: string; bytes: Uint8Array }[],
): Promise<TextureSharingReportV1> {
  const distinct = new Map<
    string,
    {
      bytes: number;
      mimeType: string;
      width?: number;
      height?: number;
      copies: number;
      assets: Set<string>;
    }
  >();
  const skipped: { name: string; reason: string }[] = [];
  let read = 0;
  let assetBytes = 0;
  let embeddedImages = 0;
  let embeddedImageBytes = 0;
  for (const asset of assets) {
    let carried: { bytes: Uint8Array; mimeType: string }[];
    try {
      const { json, binary } = readGlb(asset.bytes);
      carried = carriedImages(json, binary);
    } catch (error) {
      skipped.push({ name: asset.name, reason: (error as Error).message });
      continue;
    }
    read += 1;
    assetBytes += asset.bytes.byteLength;
    for (const image of carried) {
      embeddedImages += 1;
      embeddedImageBytes += image.bytes.byteLength;
      const sha256 = `sha256:${await sha256Hex(image.bytes)}`;
      const entry = distinct.get(sha256);
      if (entry) {
        entry.copies += 1;
        entry.assets.add(asset.name);
      } else
        distinct.set(sha256, {
          bytes: image.bytes.byteLength,
          mimeType: image.mimeType,
          ...pixelSize(image.bytes),
          copies: 1,
          assets: new Set([asset.name]),
        });
    }
  }
  const distinctImageBytes = [...distinct.values()].reduce(
    (total, image) => total + image.bytes,
    0,
  );
  const saving = (image: { bytes: number; copies: number }) => image.bytes * (image.copies - 1);
  return {
    version: 'kiln.texture-sharing.v1',
    assets: read,
    assetBytes,
    embeddedImages,
    distinctImages: distinct.size,
    embeddedImageBytes,
    distinctImageBytes,
    duplicateImageBytes: embeddedImageBytes - distinctImageBytes,
    images: [...distinct.entries()]
      .sort(
        ([sha, image], [otherSha, other]) =>
          saving(other) - saving(image) || (sha < otherSha ? -1 : sha > otherSha ? 1 : 0),
      )
      .map(([sha256, { bytes, mimeType, width, height, copies, assets: using }]) => ({
        sha256,
        bytes,
        mimeType,
        ...(width !== undefined ? { width, height } : {}),
        copies,
        assets: [...using].sort(),
      })),
    skipped,
  };
}
