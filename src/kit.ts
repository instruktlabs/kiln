/**
 * Kit packaging — the web-tier pass that turns a finished GLB into something you
 * can drop into a game.
 *
 * Three things happen here, deliberately in one pass so exported bytes change
 * once rather than three times:
 *
 * 1. **ORM channel packing.** A separate occlusion image is folded into the R
 *    channel of the metallic-roughness image, which is where glTF expects it.
 *    One fewer image to fetch, decode, and hold on the GPU — for a 512px pair
 *    that is a megabyte of VRAM. Note that it is NOT reliably a byte saving: a
 *    flat occlusion map that PNG compresses to nothing on its own costs real
 *    bytes once interleaved with a noisy metallic-roughness map.
 * 2. **Palette colourways** as `KHR_materials_variants`, so one file carries
 *    every look instead of one file per look.
 * 3. **KTX2 supercompression** via `KHR_texture_basisu`. Measured at -80% to
 *    -90% of texture bytes on real Kiln assets, and textures are ~97% of these
 *    files.
 *
 * It runs in the web tier for the same reason {@link optimizeGlbBytes} does: the
 * runtime returns an un-optimised GLB and this re-bakes before persisting, so
 * the whole contract reaches production with no wire bump and no runtime change.
 *
 * **KTX2 needs an encoder binary that is not a JavaScript dependency.** Its
 * absence is a capability fact, not an error — the pass reports `skipped` with a
 * reason and still returns the packed, varianted GLB. Failing the whole
 * packaging step because one machine lacks a CLI would make every offline test
 * and every developer checkout fail at a step that has nothing to do with them.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { Document, Material, Texture } from '@gltf-transform/core';
import { KHRMaterialsVariants, KHRTextureBasisu } from '@gltf-transform/extensions';

import { buildSlotIndex, chooseSlot, hexToLinearRgb, type SnapPaletteSlot } from './palette-snap';

const run = promisify(execFile);

/** Candidate names for the KTX-Software CLI, in the order they are tried. */
export const KTX_ENCODER_CANDIDATES: readonly string[] = Object.freeze(
  [
    process.env['KILN_KTX_BIN'] ?? '',
    'ktx',
    '/usr/bin/ktx',
    '/usr/local/bin/ktx',
    'C:/Program Files/KTX-Software/bin/ktx.exe',
  ].filter((value): value is string => value.length > 0),
);

/** ETC1S. UASTC is higher quality and several times larger; the size claim rests on this mode. */
const KTX_ENCODE_MODE = 'basis-lz';

export interface KitVariantSpec {
  /** Shown in a viewer's variant picker, so it is a name rather than an index. */
  name: string;
  slots: readonly SnapPaletteSlot[];
}

export interface KitPackOptions {
  /** Each becomes one `KHR_materials_variants` entry. Empty means no variants. */
  variants?: readonly KitVariantSpec[];
  /** Fold a separate occlusion image into metallic-roughness R. Default true. */
  packOrm?: boolean;
  /** Default true — encode when an encoder is present, skip with a reason when not. */
  ktx2?: boolean;
}

export interface KitKtx2Summary {
  applied: boolean;
  /** Present when `applied` is false: why, in words a human can act on. */
  skipped?: string;
  encoder?: string;
  texturesEncoded: number;
  bytesBefore: number;
  bytesAfter: number;
}

/**
 * Fraction of the PNG size KTX2 must beat for the encode to be kept.
 *
 * Not 1.0. A file that shrinks by a rounding error is not worth requiring a
 * transcoder for, and the KTX2 container plus mipmap chain costs a few hundred
 * bytes before any image data — so on a small flat texture it loses outright.
 */
export const KTX2_SIZE_ACCEPT_RATIO = 0.9;

export interface KitPackSummary {
  ormPacked: number;
  variantsAdded: readonly string[];
  variantMaterialsCreated: number;
  ktx2: KitKtx2Summary;
}

let cachedEncoder: string | null | undefined;

/**
 * Locate the KTX-Software CLI once per process.
 *
 * Cached including the negative result: this runs per generation, and a missing
 * binary would otherwise cost a failed process spawn every time forever.
 */
export async function findKtxEncoder(): Promise<string | undefined> {
  if (cachedEncoder !== undefined) return cachedEncoder ?? undefined;
  for (const candidate of KTX_ENCODER_CANDIDATES) {
    try {
      await run(candidate, ['--version'], { timeout: 10_000 });
      cachedEncoder = candidate;
      return candidate;
    } catch {
      // Not at this path, or not executable. Try the next.
    }
  }
  cachedEncoder = null;
  return undefined;
}

/** Test seam: forget a probe result so a test can simulate either environment. */
export function resetKtxEncoderProbe(): void {
  cachedEncoder = undefined;
}

const isPng = (texture: Texture): boolean => texture.getMimeType() === 'image/png';

/**
 * Drop a texture nothing points at any more.
 *
 * gltf-transform's writer does NOT prune unreferenced properties — an image left
 * behind by a re-point is still serialized into the binary chunk. Without this the
 * whole point of channel packing is lost: the material would read one image while
 * the FILE still carried two, so the saving would be a claim rather than a fact.
 *
 * `listParents()` always includes the document Root, which is bookkeeping and not a
 * reference; anything else means something still uses the texture.
 */
function disposeIfOrphaned(texture: Texture): void {
  const stillUsed = texture.listParents().some((parent) => parent.propertyType !== 'Root');
  if (!stillUsed) texture.dispose();
}

/**
 * Fold occlusion into metallic-roughness R.
 *
 * Only when the two are genuinely distinct images of identical size — a
 * mismatched pair would need resampling, and silently resampling an author's
 * occlusion map is a bigger change than leaving one extra image in the file.
 */
async function packOcclusionIntoMetallicRoughness(doc: Document): Promise<number> {
  const sharp = (await import('sharp')).default;
  let packed = 0;

  for (const material of doc.getRoot().listMaterials()) {
    const occlusion = material.getOcclusionTexture();
    const metallicRoughness = material.getMetallicRoughnessTexture();
    if (!occlusion || !metallicRoughness || occlusion === metallicRoughness) continue;
    if (!isPng(occlusion) || !isPng(metallicRoughness)) continue;

    const occlusionBytes = occlusion.getImage();
    const mrBytes = metallicRoughness.getImage();
    if (!occlusionBytes || !mrBytes) continue;

    try {
      const [occImage, mrImage] = await Promise.all([
        sharp(Buffer.from(occlusionBytes))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
        sharp(Buffer.from(mrBytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      if (
        occImage.info.width !== mrImage.info.width ||
        occImage.info.height !== mrImage.info.height
      ) {
        continue;
      }

      // R <- occlusion R, G/B (roughness/metalness) untouched, and NO alpha channel.
      //
      // Three channels, not four, is the difference between this pass saving bytes and
      // costing them. glTF's ORM convention uses R/G/B only, so the alpha `ensureAlpha`
      // added for a uniform stride is pure padding once merged — and a fourth constant
      // channel plus default PNG compression made the merged image larger than the two
      // separate images it replaced. Measured on a 64px pair: 7512 bytes at RGBA/level 6
      // against 7032 for the unpacked original.
      const { width, height } = mrImage.info;
      const merged = Buffer.allocUnsafe(width * height * 3);
      for (let i = 0, o = 0; o < merged.length; i += 4, o += 3) {
        merged[o] = occImage.data[i] ?? 255;
        merged[o + 1] = mrImage.data[i + 1] ?? 255;
        merged[o + 2] = mrImage.data[i + 2] ?? 255;
      }
      const png = await sharp(merged, { raw: { width, height, channels: 3 } })
        .png({ compressionLevel: 9 })
        .toBuffer();

      metallicRoughness.setImage(new Uint8Array(png));
      material.setOcclusionTexture(metallicRoughness);
      const info = material.getOcclusionTextureInfo();
      const mrInfo = material.getMetallicRoughnessTextureInfo();
      if (info && mrInfo) info.setTexCoord(mrInfo.getTexCoord());
      disposeIfOrphaned(occlusion);
      packed += 1;
    } catch {
      // A texture we cannot decode stays as it is. The file is still valid.
    }
  }

  return packed;
}

/** A palette-snapped clone of one material, or undefined when the palette does not cover it. */
function recolorForPalette(
  doc: Document,
  material: Material,
  slots: readonly SnapPaletteSlot[],
  variantName: string,
): { material: Material; changed: boolean } {
  const clone = doc.createMaterial(`${material.getName()}__${variantName}`).copy(material);
  // A textured material carries its own colour; recolouring it would fight the
  // texture. Same hero exception snapGlbToPalette makes.
  if (material.getBaseColorTexture()) return { material: clone, changed: false };

  const index = buildSlotIndex(slots);
  const base = material.getBaseColorFactor();
  const emissive = material.getEmissiveFactor();
  const slot = chooseSlot(index, {
    baseLinear: [base[0], base[1], base[2]],
    emissiveLinear: [emissive[0], emissive[1], emissive[2]],
    transparent: material.getAlphaMode() === 'BLEND' || material.getAlpha() < 0.98,
  });
  if (slot === undefined) return { material: clone, changed: false };

  const chosen = slots[slot];
  if (!chosen) return { material: clone, changed: false };
  const [r, g, b] = hexToLinearRgb(chosen.color);
  if (chosen.kind === 'glow') {
    // The slot colour is the whole emission, as in snapGlbToPalette.
    clone.setEmissiveFactor([r, g, b]);
    clone.setExtension('KHR_materials_emissive_strength', null);
  } else {
    clone.setBaseColorFactor([r, g, b, base[3]]);
    if (typeof chosen.roughness === 'number') clone.setRoughnessFactor(chosen.roughness);
    if (typeof chosen.metalness === 'number') clone.setMetallicFactor(chosen.metalness);
    if (chosen.kind === 'glass' && typeof chosen.opacity === 'number') {
      clone.setBaseColorFactor([r, g, b, chosen.opacity]);
    }
  }
  return { material: clone, changed: true };
}

/**
 * Attach one `KHR_materials_variants` entry per palette.
 *
 * The default (no variant selected) stays the material the asset was authored
 * with, so a viewer that ignores the extension shows exactly what it showed
 * before this pass existed.
 */
function addPaletteVariants(
  doc: Document,
  specs: readonly KitVariantSpec[],
): { names: string[]; materialsCreated: number } {
  const extension = doc.createExtension(KHRMaterialsVariants);
  const names: string[] = [];
  let materialsCreated = 0;

  const variants = specs.map((spec) => {
    names.push(spec.name);
    return { spec, variant: extension.createVariant(spec.name) };
  });

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const base = primitive.getMaterial();
      if (!base) continue;

      const mappings = variants
        .map(({ spec, variant }) => {
          const { material, changed } = recolorForPalette(doc, base, spec.slots, spec.name);
          if (!changed) {
            material.dispose();
            return undefined;
          }
          materialsCreated += 1;
          return extension.createMapping().addVariant(variant).setMaterial(material);
        })
        .filter((value): value is NonNullable<typeof value> => value !== undefined);

      if (mappings.length === 0) continue;
      const list = extension.createMappingList();
      for (const mapping of mappings) list.addMapping(mapping);
      primitive.setExtension('KHR_materials_variants', list);
    }
  }

  if (names.length === 0 || materialsCreated === 0) extension.dispose();
  return { names: materialsCreated > 0 ? names : [], materialsCreated };
}

/**
 * Encode every PNG texture to KTX2 ETC1S, then keep the result only if the file
 * actually got smaller.
 *
 * **KTX2 is not universally smaller, and assuming it is would inflate real Kiln
 * assets.** ETC1S is a fixed-rate block codec with a container and a mipmap
 * chain; PNG is entropy-coded. On a noisy photographic-style texture KTX2 wins
 * by 80-90%. On a flat two-colour procedural pattern PNG can be a few hundred
 * bytes and KTX2 several times that. Kiln generates both.
 *
 * The comparison is per file rather than per texture, so the output stays
 * homogeneous: a mixed file would still force `KHR_texture_basisu` as required
 * and lock out consumers that cannot transcode, while only banking part of the
 * win.
 */
async function encodeTexturesToKtx2(
  doc: Document,
  encoder: string,
): Promise<{ encoded: number; before: number; after: number }> {
  const textures = doc.getRoot().listTextures().filter(isPng);
  if (textures.length === 0) return { encoded: 0, before: 0, after: 0 };

  const dir = await mkdtemp(join(tmpdir(), 'kiln-ktx2-'));
  const staged: { texture: Texture; original: Uint8Array; encodedBytes: Uint8Array }[] = [];
  let encoded = 0;
  let before = 0;
  let after = 0;
  try {
    for (const [index, texture] of textures.entries()) {
      const bytes = texture.getImage();
      if (!bytes) continue;
      const src = join(dir, `t${index}.png`);
      const dst = join(dir, `t${index}.ktx2`);
      await writeFile(src, bytes);
      // The transfer function has to match the slot's colour space or the
      // encoder rejects it, and a wrongly-tagged texture would light wrong.
      const srgb = doc
        .getRoot()
        .listMaterials()
        .some(
          (material) =>
            material.getBaseColorTexture() === texture || material.getEmissiveTexture() === texture,
        );
      await run(
        encoder,
        [
          'create',
          '--format',
          srgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM',
          '--encode',
          KTX_ENCODE_MODE,
          '--generate-mipmap',
          src,
          dst,
        ],
        { timeout: 120_000 },
      );
      const out = await readFile(dst);
      before += bytes.byteLength;
      after += out.byteLength;
      staged.push({ texture, original: bytes, encodedBytes: new Uint8Array(out) });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (staged.length === 0) return { encoded: 0, before, after };
  if (after >= before * KTX2_SIZE_ACCEPT_RATIO) {
    // Nothing was mutated yet, so declining costs only the encode time.
    return { encoded: 0, before, after };
  }

  for (const entry of staged) {
    entry.texture.setImage(entry.encodedBytes).setMimeType('image/ktx2');
    encoded += 1;
  }
  // Required, not merely used: a consumer that cannot transcode must be told it
  // cannot open this file rather than silently rendering it untextured.
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return { encoded, before, after };
}

/**
 * Run the kit contract over a parsed document, in place.
 *
 * Exposed separately from the bytes-level entry point so the render path can
 * apply it without a parse/serialise round trip.
 */
export async function applyKitContract(
  doc: Document,
  options: KitPackOptions = {},
): Promise<KitPackSummary> {
  const ormPacked = options.packOrm === false ? 0 : await packOcclusionIntoMetallicRoughness(doc);

  const specs = options.variants ?? [];
  const { names, materialsCreated } = specs.length
    ? addPaletteVariants(doc, specs)
    : { names: [] as string[], materialsCreated: 0 };

  // Last: it rewrites the images the two passes above just produced, and an
  // encoder cannot read a PNG that does not exist yet.
  let ktx2: KitKtx2Summary = {
    applied: false,
    skipped: 'disabled by caller',
    texturesEncoded: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
  if (options.ktx2 !== false) {
    const encoder = await findKtxEncoder();
    if (!encoder) {
      ktx2 = {
        applied: false,
        skipped: 'no KTX-Software encoder on PATH (set KILN_KTX_BIN to override)',
        texturesEncoded: 0,
        bytesBefore: 0,
        bytesAfter: 0,
      };
    } else {
      try {
        const result = await encodeTexturesToKtx2(doc, encoder);
        ktx2 = {
          applied: result.encoded > 0,
          ...(result.encoded > 0
            ? {}
            : {
                skipped:
                  result.before === 0
                    ? 'no PNG textures to encode'
                    : `KTX2 was not smaller (${result.after} vs ${result.before} bytes); kept PNG`,
              }),
          encoder,
          texturesEncoded: result.encoded,
          bytesBefore: result.before,
          bytesAfter: result.after,
        };
      } catch (error) {
        // A GLB with PNG textures is worth far more than no GLB at all.
        ktx2 = {
          applied: false,
          skipped: `encoder failed: ${error instanceof Error ? error.message : String(error)}`,
          encoder,
          texturesEncoded: 0,
          bytesBefore: 0,
          bytesAfter: 0,
        };
      }
    }
  }

  return { ormPacked, variantsAdded: names, variantMaterialsCreated: materialsCreated, ktx2 };
}
