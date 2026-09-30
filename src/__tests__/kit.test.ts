/**
 * T2.3 kit contract.
 *
 * The pass rewrites the bytes we persist and hand to users, so what matters is
 * not that it does something but that what it produces is still a valid glTF, is
 * still the same asset by default, and degrades honestly when the environment
 * cannot do part of the job.
 */
import { describe, expect, test } from 'bun:test';

import { WebIO } from '@gltf-transform/core';
import {
  KHRMaterialsEmissiveStrength,
  KHRMaterialsVariants,
  KHRTextureBasisu,
} from '@gltf-transform/extensions';

import { findKtxEncoder, resetKtxEncoderProbe, type KitVariantSpec } from '../kit';
import { hexToLinearRgb } from '../palette-snap';
import { packKitGlb, renderGLB } from '../render';

const io = (): WebIO => new WebIO().registerExtensions([KHRMaterialsVariants, KHRTextureBasisu]);

/** Noisy, like a photographic scan. This is the case KTX2 wins decisively. */
const NOISY = `
const meta = { name: 'Rock', category: 'prop' };

async function build() {
  const root = createRoot('Rock');
  const albedo = proceduralTexture({
    size: 256,
    layers: [
      { op: 'solid', color: 0x8a5a2b },
      { op: 'noise', colorA: 0x5c3a1a, colorB: 0xa07040, octaves: 5, scale: 6, blend: 'multiply' },
      { op: 'noise', colorA: 0x2b1a0c, colorB: 0xd0b090, octaves: 4, scale: 20, blend: 'overlay' },
    ],
  });
  root.add(createPart('Body', boxGeo(1, 1, 1), pbrMaterial({ albedo, roughness: 0.9 }), {}));
  return root;
}
`;

/** Flat two-colour pattern. PNG entropy-codes this to almost nothing. */
const TEXTURED = `
const meta = { name: 'Crate', category: 'prop' };

async function build() {
  const root = createRoot('Crate');
  const albedo = proceduralTexture({
    size: 64,
    layers: [
      { op: 'solid', color: 0x8a5a2b },
      { op: 'bricks', brick: 0xc09050, mortar: 0x6a4020, rows: 4, cols: 4, blend: 'overlay' },
    ],
  });
  root.add(createPart('Body', boxGeo(1, 1, 1), pbrMaterial({ albedo, roughness: 0.8 }), {}));
  return root;
}
`;

const UNTEXTURED = `
const meta = { name: 'Blocks', category: 'prop' };

async function build() {
  const root = createRoot('Blocks');
  root.add(createPart('A', boxGeo(1, 1, 1), gameMaterial(0x3355aa), {}));
  root.add(createPart('B', boxGeo(1, 1, 1), gameMaterial(0xaa4433), { position: [1.2, 0, 0] }));
  return root;
}
`;

/** A flat texture plus an untextured part, so variants land and the file changes
 *  even when the KTX2 encode declines. */
const FLAT_MIXED = `
const meta = { name: 'Shelf', category: 'prop' };

async function build() {
  const root = createRoot('Shelf');
  const albedo = proceduralTexture({
    size: 64,
    layers: [
      { op: 'solid', color: 0x8a5a2b },
      { op: 'bricks', brick: 0xc09050, mortar: 0x6a4020, rows: 4, cols: 4, blend: 'overlay' },
    ],
  });
  root.add(createPart('Body', boxGeo(1, 1, 1), pbrMaterial({ albedo, roughness: 0.8 }), {}));
  root.add(createPart('Leg', boxGeo(0.2, 1, 0.2), gameMaterial(0x3355aa), { position: [1, 0, 0] }));
  return root;
}
`;

/** A packed metallic-roughness image beside a same-size occlusion image — the pair
 *  channel packing exists to merge. */
const ORM = `
const meta = { name: 'Panel', category: 'prop' };

async function build() {
  const root = createRoot('Panel');
  const mr = proceduralTexture({
    size: 64,
    usage: 'metallicRoughness',
    layers: [
      { op: 'solid', color: 0x008000 },
      { op: 'noise', colorA: 0x004000, colorB: 0x00c000, octaves: 3, scale: 8, blend: 'overlay' },
    ],
  });
  const ao = proceduralTexture({
    size: 64,
    usage: 'occlusion',
    layers: [
      { op: 'solid', color: 0xffffff },
      { op: 'stripes', colorA: 0x808080, colorB: 0xffffff, count: 6, blend: 'multiply' },
    ],
  });
  root.add(createPart('Body', boxGeo(1, 1, 1), pbrMaterial({ albedo: 0x8a5a2b, metallicRoughness: mr, aoMap: ao }), {}));
  return root;
}
`;

const PALETTES: KitVariantSpec[] = [
  { name: 'Rust', slots: [{ color: '#8a3b21' }, { color: '#c76a3a' }] },
  { name: 'Frost', slots: [{ color: '#9fc9d8' }, { color: '#e8f2f6' }] },
];

async function glbOf(code: string): Promise<Uint8Array> {
  return (await renderGLB(code, {})).glb;
}

describe('ORM channel packing', () => {
  test('the occlusion image is folded in AND removed from the file', async () => {
    const original = await glbOf(ORM);
    const packed = await packKitGlb(original, { ktx2: false });

    expect(packed).toBeDefined();
    expect(packed!.summary.ormPacked).toBe(1);
    expect(packed!.gltfValidation.issues.numErrors).toBe(0);

    const before = await io().readBinary(original);
    const after = await io().readBinary(packed!.bytes);
    // The load-bearing half. gltf-transform's writer does not prune, so re-pointing the
    // material without disposing the old image leaves both in the binary chunk — the
    // material reads one texture, the file still ships two, and packing saved nothing.
    expect(before.getRoot().listTextures().length).toBe(2);
    expect(after.getRoot().listTextures().length).toBe(1);

    // Deliberately NOT a byte assertion, and this is the interesting part. The payoff
    // here is one fewer image to fetch, decode, and hold on the GPU — for a 512px pair
    // that is a megabyte of VRAM — not a smaller file. Merging a low-entropy occlusion
    // map into a noisy metallic-roughness map can cost bytes: PNG compresses flat
    // stripes to almost nothing on their own and to real bytes once interleaved with
    // noise. Measured on this 64px pair, 7032 unpacked against 7232 packed. Anyone who
    // adds a "keep the smaller" guard here the way the KTX2 step has one will decline
    // the glTF ORM convention to save 200 bytes and lose the VRAM win that motivates it.

    // Both slots now name the same image, which is what glTF's ORM convention means.
    const material = after.getRoot().listMaterials()[0];
    expect(material?.getOcclusionTexture()).toBe(material?.getMetallicRoughnessTexture() ?? null);
  });

  test('nothing to pack means no rewrite', async () => {
    // TEXTURED has one albedo image and no occlusion/metallic-roughness pair.
    const packed = await packKitGlb(await glbOf(TEXTURED), { ktx2: false });

    expect(packed).toBeUndefined();
  });
});

describe('palette colourways as KHR_materials_variants', () => {
  test('one file carries every palette, and the default look is unchanged', async () => {
    const original = await glbOf(UNTEXTURED);
    const packed = await packKitGlb(original, { variants: PALETTES, ktx2: false });

    expect(packed).toBeDefined();
    expect(packed!.summary.variantsAdded).toEqual(['Rust', 'Frost']);
    expect(packed!.gltfValidation.issues.numErrors).toBe(0);

    const doc = await io().readBinary(packed!.bytes);
    const extension = doc
      .getRoot()
      .listExtensionsUsed()
      .map((value) => value.extensionName);
    expect(extension).toContain('KHR_materials_variants');

    // The material a primitive resolves to with NO variant selected must still be
    // the authored one. A viewer that ignores the extension has to show exactly
    // what it showed before this pass existed.
    const before = await new WebIO().readBinary(original);
    const beforeColors = before
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives().map((p) => p.getMaterial()?.getBaseColorFactor()));
    const afterColors = doc
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives().map((p) => p.getMaterial()?.getBaseColorFactor()));
    expect(afterColors).toEqual(beforeColors);
  });

  test('a textured material is left alone, exactly as the palette snap leaves it', async () => {
    const packed = await packKitGlb(await glbOf(TEXTURED), { variants: PALETTES, ktx2: false });

    // A textured material carries its own colour. Recolouring the factor would
    // multiply against the texture and mud it, which is why snapGlbToPalette
    // makes the same exception.
    expect(packed?.summary.variantMaterialsCreated ?? 0).toBe(0);
    expect(packed?.summary.variantsAdded ?? []).toEqual([]);
  });

  test('a glow slot sets the variant emission without the authored strength', async () => {
    const lamp = `
const meta = { name: 'Lamp', category: 'prop' };

async function build() {
  const root = createRoot('Lamp');
  root.add(createPart('Post', boxGeo(0.2, 1, 0.2), gameMaterial(0x333333), {}));
  const bulb = gameMaterial(0x222222, { emissive: 0xffaa33, emissiveIntensity: 6 });
  root.add(createPart('Bulb', boxGeo(0.3, 0.3, 0.3), bulb, { position: [0, 0.7, 0] }));
  return root;
}
`;
    const glow = '#ffd9a0';
    const packed = await packKitGlb(await glbOf(lamp), {
      variants: [{ name: 'Warm', slots: [{ color: '#444444' }, { color: glow, kind: 'glow' }] }],
      ktx2: false,
    });
    const kitIO = new WebIO().registerExtensions([
      KHRMaterialsVariants,
      KHRMaterialsEmissiveStrength,
    ]);
    const json = (await kitIO.writeJSON(await kitIO.readBinary(packed!.bytes))).json;
    const emitted = (index: number): number[] => {
      const material = json.materials![index]!;
      const strength =
        (
          material.extensions?.['KHR_materials_emissive_strength'] as
            | { emissiveStrength: number }
            | undefined
        )?.emissiveStrength ?? 1;
      return (material.emissiveFactor ?? [0, 0, 0]).map((channel) => channel * strength);
    };
    const bulb = json
      .meshes!.flatMap((mesh) => mesh.primitives)
      .find((primitive) => emitted(primitive.material!).some((channel) => channel > 0))!;
    const mapping = bulb.extensions!['KHR_materials_variants'] as {
      mappings: { material: number }[];
    };

    // The default look keeps the authored emission; the variant emits its slot colour.
    const authored = hexToLinearRgb('#ffaa33').map((channel) => channel * 6);
    for (const [i, channel] of emitted(bulb.material!).entries()) {
      expect(channel).toBeCloseTo(authored[i]!, 4);
    }
    const slot = hexToLinearRgb(glow);
    for (const [i, channel] of emitted(mapping.mappings[0]!.material).entries()) {
      expect(channel).toBeCloseTo(slot[i]!, 5);
    }
  });

  test('no variants requested means no extension is declared', async () => {
    const packed = await packKitGlb(await glbOf(UNTEXTURED), { ktx2: false });

    // Nothing to do and nothing done: returning bytes here would persist a
    // rewrite that changed only the file's hash.
    expect(packed).toBeUndefined();
  });
});

describe('KTX2 supercompression', () => {
  test('a missing encoder is reported as a capability, not a failure', async () => {
    resetKtxEncoderProbe();
    const previous = process.env['KILN_KTX_BIN'];
    process.env['KILN_KTX_BIN'] = '';
    try {
      // Simulated by asking for an encoder that cannot exist. The real point is
      // that offline CI and a fresh checkout have no KTX-Software, and failing
      // the whole packaging step there would break work unrelated to textures.
      const packed = await packKitGlb(await glbOf(UNTEXTURED), {
        variants: PALETTES,
        ktx2: true,
      });

      expect(packed).toBeDefined();
      // Variants still landed. Only the texture step is conditional.
      expect(packed!.summary.variantsAdded).toEqual(['Rust', 'Frost']);
      if (!packed!.summary.ktx2.applied) {
        expect(packed!.summary.ktx2.skipped).toBeTruthy();
      }
    } finally {
      if (previous === undefined) delete process.env['KILN_KTX_BIN'];
      else process.env['KILN_KTX_BIN'] = previous;
      resetKtxEncoderProbe();
    }
  });

  test('encoding shrinks textures and the result still validates', async () => {
    // Gated at run time, not at collection time: CI has no KTX-Software and the
    // developer machine that produced the size measurement does.
    if (!(await findKtxEncoder())) return;
    {
      const original = await glbOf(NOISY);
      const packed = await packKitGlb(original, { ktx2: true });

      expect(packed).toBeDefined();
      expect(packed!.summary.ktx2.applied).toBe(true);
      expect(packed!.summary.ktx2.texturesEncoded).toBeGreaterThan(0);
      // The measurement this whole task rests on. Anything short of a large win
      // would not justify a binary in a container image.
      expect(packed!.summary.ktx2.bytesAfter).toBeLessThan(packed!.summary.ktx2.bytesBefore * 0.5);
      expect(packed!.bytes.byteLength).toBeLessThan(original.byteLength);
      // Khronos, not our own opinion of validity.
      expect(packed!.gltfValidation.issues.numErrors).toBe(0);

      const doc = await io().readBinary(packed!.bytes);
      expect(
        doc
          .getRoot()
          .listExtensionsUsed()
          .map((value) => value.extensionName),
      ).toContain('KHR_texture_basisu');
      // Required, not merely used: a consumer that cannot transcode must be told
      // it cannot open this file rather than silently showing it untextured.
      expect(
        doc
          .getRoot()
          .listExtensionsRequired()
          .map((value) => value.extensionName),
      ).toContain('KHR_texture_basisu');
      for (const texture of doc.getRoot().listTextures()) {
        expect(texture.getMimeType()).toBe('image/ktx2');
      }
    }
  });

  test('a texture PNG already compresses better is left as PNG', async () => {
    if (!(await findKtxEncoder())) return;
    {
      // ETC1S is fixed-rate with a container and a mipmap chain; PNG is
      // entropy-coded. On a flat two-colour pattern PNG wins outright, and
      // encoding anyway would inflate the file AND require a transcoder to open
      // it. Both costs, none of the benefit.
      const original = await glbOf(FLAT_MIXED);
      const packed = await packKitGlb(original, { variants: PALETTES, ktx2: true });

      expect(packed).toBeDefined();
      expect(packed!.summary.ktx2.applied).toBe(false);
      expect(packed!.summary.ktx2.skipped).toMatch(/KTX2 was not smaller/);
      // Measured, so the decision is visible rather than inferred.
      expect(packed!.summary.ktx2.bytesAfter).toBeGreaterThan(packed!.summary.ktx2.bytesBefore);

      const doc = await io().readBinary(packed!.bytes);
      expect(
        doc
          .getRoot()
          .listExtensionsRequired()
          .map((value) => value.extensionName),
      ).not.toContain('KHR_texture_basisu');
      for (const texture of doc.getRoot().listTextures()) {
        expect(texture.getMimeType()).toBe('image/png');
      }
    }
  });
});
