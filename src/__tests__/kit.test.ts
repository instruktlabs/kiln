/**
 * T2.3 kit contract.
 *
 * The pass rewrites the bytes we persist and hand to users, so what matters is
 * not that it does something but that what it produces is still a valid glTF, is
 * still the same asset by default, and degrades honestly when the environment
 * cannot do part of the job.
 */
import { describe, expect, test } from 'bun:test';

import {
  Document,
  type Material,
  type Texture,
  type TextureInfo,
  WebIO,
} from '@gltf-transform/core';
import {
  KHRMaterialsEmissiveStrength,
  KHRMaterialsVariants,
  KHRTextureBasisu,
  KHRTextureTransform,
  type Transform,
} from '@gltf-transform/extensions';
import sharp from 'sharp';

import {
  applyKitContract,
  findKtxEncoder,
  resetKtxEncoderProbe,
  type KitVariantSpec,
} from '../kit';
import { hexToLinearRgb } from '../palette-snap';
import { packKitGlb, renderGLB } from '../render';
import { encodePng } from '../views/png';

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

/** One material whose occlusion and metallic-roughness maps are distinct PNGs of the
 *  same size, each read through the UV set given — so all a case varies is how the
 *  two maps are sampled. */
function occlusionBesideMetallicRoughness(occlusionUv: number, metallicRoughnessUv: number) {
  const doc = new Document();
  const png = (value: number): Uint8Array =>
    Uint8Array.from(encodePng(new Uint8Array(4 * 4 * 3).fill(value), 4, 4));
  const occlusion = doc.createTexture('Occlusion').setMimeType('image/png').setImage(png(200));
  const metallicRoughness = doc
    .createTexture('MetallicRoughness')
    .setMimeType('image/png')
    .setImage(png(90));
  const material = doc
    .createMaterial('Panel')
    .setOcclusionTexture(occlusion)
    .setMetallicRoughnessTexture(metallicRoughness);
  material.getOcclusionTextureInfo()!.setTexCoord(occlusionUv);
  material.getMetallicRoughnessTextureInfo()!.setTexCoord(metallicRoughnessUv);
  return { doc, material, occlusion, metallicRoughness };
}

async function sharedOrmFixture(reverse = false) {
  const doc = new Document();
  const texture = async (name: string, rgba: [number, number, number, number]) =>
    doc
      .createTexture(name)
      .setMimeType('image/png')
      .setImage(
        await sharp(Buffer.from(rgba), { raw: { width: 1, height: 1, channels: 4 } })
          .png()
          .toBuffer(),
      );
  const mr = await texture('Shared MR', [100, 130, 170, 60]);
  const a = await texture('AO A', [40, 0, 0, 255]);
  const b = await texture('AO B', [220, 0, 0, 255]);
  const materials = new Map<string, Material>();
  const entries: [string, Texture][] = [
    ['A', a],
    ['B', b],
    ['A again', a],
  ];
  for (const [name, ao] of reverse ? entries.reverse() : entries) {
    materials.set(
      name,
      doc.createMaterial(name).setOcclusionTexture(ao).setMetallicRoughnessTexture(mr),
    );
  }
  return { doc, mr, materials };
}

async function rgba(texture: Texture | null): Promise<number[]> {
  return Array.from(await sharp(texture!.getImage()!).ensureAlpha().raw().toBuffer());
}

function sampling(info: TextureInfo) {
  const transform = info.getExtension<Transform>('KHR_texture_transform');
  return {
    texCoord: info.getTexCoord(),
    magFilter: info.getMagFilter(),
    minFilter: info.getMinFilter(),
    wrapS: info.getWrapS(),
    wrapT: info.getWrapT(),
    transform: transform && {
      texCoord: transform.getTexCoord(),
      offset: transform.getOffset(),
      rotation: transform.getRotation(),
      scale: transform.getScale(),
    },
  };
}

describe('ORM channel packing', () => {
  test('shared metallic-roughness retains each occlusion independently of material order', async () => {
    for (const reverse of [false, true]) {
      const { doc, materials } = await sharedOrmFixture(reverse);
      const summary = await applyKitContract(doc, { ktx2: false });

      for (const [name, red] of [
        ['A', 40],
        ['B', 220],
        ['A again', 40],
      ] as const) {
        const material = materials.get(name)!;
        expect(await rgba(material.getOcclusionTexture())).toEqual([red, 130, 170, 255]);
        expect(material.getOcclusionTexture()).toBe(material.getMetallicRoughnessTexture());
      }
      expect(materials.get('A')!.getOcclusionTexture()).toBe(
        materials.get('A again')!.getOcclusionTexture(),
      );
      expect(doc.getRoot().listTextures()).toHaveLength(2);
      expect(summary.ormPacked).toBe(3);
      expect(summary.ormSkipped).toBeUndefined();
      doc.createBuffer();
      const serialized = await io().writeBinary(doc);
      expect((await applyKitContract(doc, { ktx2: false })).ormPacked).toBe(0);
      expect(await io().writeBinary(doc)).toEqual(serialized);
    }
  });

  test('packing keeps already-packed, unpaired and other-slot consumers unchanged', async () => {
    const { doc, mr, materials } = await sharedOrmFixture();
    const original = Uint8Array.from(mr.getImage()!);
    const packed = doc
      .createMaterial('Already packed')
      .setOcclusionTexture(mr)
      .setMetallicRoughnessTexture(mr);
    const unpaired = doc.createMaterial('MR only').setMetallicRoughnessTexture(mr);
    // The same material can use the image in multiple slots: counting parents alone
    // would miss the base-color/alpha dependency after the other MR users move.
    const baseColor = materials.get('A')!.setBaseColorTexture(mr).setAlphaMode('BLEND');
    const normal = doc.createMaterial('Normal').setNormalTexture(mr);

    await applyKitContract(doc, { ktx2: false });

    expect(mr.getImage()).toEqual(original);
    expect(await rgba(packed.getOcclusionTexture())).toEqual([100, 130, 170, 60]);
    expect(unpaired.getMetallicRoughnessTexture()).toBe(mr);
    expect(baseColor.getBaseColorTexture()).toBe(mr);
    expect(normal.getNormalTexture()).toBe(mr);
    expect(await rgba(baseColor.getOcclusionTexture())).toEqual([40, 130, 170, 255]);
    expect(doc.getRoot().listTextures()).toHaveLength(3);
  });

  test('a sole material using MR as base color keeps its original pixels and alpha', async () => {
    const { doc, material, metallicRoughness } = occlusionBesideMetallicRoughness(0, 0);
    const original = await sharp(
      Buffer.from(Array.from({ length: 16 }, () => [100, 130, 170, 60]).flat()),
      { raw: { width: 4, height: 4, channels: 4 } },
    )
      .png()
      .toBuffer();
    metallicRoughness.setImage(original);
    material.setBaseColorTexture(metallicRoughness).setAlphaMode('BLEND');

    await applyKitContract(doc, { ktx2: false });

    expect(material.getBaseColorTexture()!.getImage()).toEqual(original);
    expect(material.getOcclusionTexture()).not.toBe(metallicRoughness);
    expect((await rgba(material.getOcclusionTexture())).slice(0, 4)).toEqual([200, 130, 170, 255]);
  });

  test('serialized shared ORM pairs keep pixels, slot sampling and material factors', async () => {
    const { doc, mr, materials } = await sharedOrmFixture();
    const transforms = doc.createExtension(KHRTextureTransform);
    const a = materials.get('A')!;
    a.setOcclusionStrength(0.4).setRoughnessFactor(0.6).setMetallicFactor(0.8);
    const aoInfo = a.getOcclusionTextureInfo()!;
    const mrInfo = a.getMetallicRoughnessTextureInfo()!;
    for (const [index, info] of [aoInfo, mrInfo].entries()) {
      info
        .setTexCoord(index)
        .setMagFilter(index === 0 ? 9728 : 9729)
        .setMinFilter(index === 0 ? 9984 : 9987)
        .setWrapS(index === 0 ? 33071 : 10497)
        .setWrapT(index === 0 ? 33648 : 10497)
        .setExtension(
          'KHR_texture_transform',
          transforms
            .createTransform()
            .setTexCoord(1)
            .setOffset([0.25, 0.5])
            .setScale([2, 3])
            .setRotation(0.2),
        );
    }
    const expectedSampling = [sampling(aoInfo), sampling(mrInfo)];
    a.setBaseColorTexture(mr).setAlphaMode('BLEND');
    const buffer = doc.createBuffer();
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const uv = doc
      .createAccessor()
      .setType('VEC2')
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
    const scene = doc.createScene();
    for (const material of materials.values()) {
      scene.addChild(
        doc
          .createNode()
          .setMesh(
            doc
              .createMesh()
              .addPrimitive(
                doc
                  .createPrimitive()
                  .setAttribute('POSITION', position)
                  .setAttribute('TEXCOORD_0', uv)
                  .setAttribute('TEXCOORD_1', uv)
                  .setMaterial(material),
              ),
          ),
      );
    }
    const serializer = io().registerExtensions([KHRTextureTransform]);
    const result = await packKitGlb(await serializer.writeBinary(doc), { ktx2: false });
    expect(result!.gltfValidation.issues.numErrors).toBe(0);
    expect(result!.summary.ormPacked).toBe(3);
    const after = await serializer.readBinary(result!.bytes);
    const byName = new Map(
      after
        .getRoot()
        .listMaterials()
        .map((m) => [m.getName(), m]),
    );
    const afterA = byName.get('A')!;
    expect(await rgba(afterA.getOcclusionTexture())).toEqual([40, 130, 170, 255]);
    expect(await rgba(byName.get('B')!.getOcclusionTexture())).toEqual([220, 130, 170, 255]);
    expect(await rgba(afterA.getBaseColorTexture())).toEqual([100, 130, 170, 60]);
    expect([
      sampling(afterA.getOcclusionTextureInfo()!),
      sampling(afterA.getMetallicRoughnessTextureInfo()!),
    ]).toEqual(expectedSampling);
    expect([
      afterA.getOcclusionStrength(),
      afterA.getRoughnessFactor(),
      afterA.getMetallicFactor(),
    ]).toEqual([0.4, 0.6, 0.8]);
    expect(afterA.getOcclusionTexture()).toBe(byName.get('A again')!.getOcclusionTexture());
    expect(await packKitGlb(result!.bytes, { ktx2: false })).toBeUndefined();
  });

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

  test('an occlusion map on another UV set keeps its own image and UV set', async () => {
    // A baked AO map usually lives on TEXCOORD_1 while metallic-roughness uses
    // TEXCOORD_0. Their pixels describe different layouts, so folding the AO into
    // the metallic-roughness image would sample it through the wrong UV set.
    const { doc, material, occlusion, metallicRoughness } = occlusionBesideMetallicRoughness(1, 0);
    const occlusionBytes = occlusion.getImage();
    const metallicRoughnessBytes = metallicRoughness.getImage();

    const summary = await applyKitContract(doc, { ktx2: false });

    expect(material.getOcclusionTexture()).toBe(occlusion);
    expect(material.getOcclusionTextureInfo()?.getTexCoord()).toBe(1);
    expect(occlusion.getImage()).toEqual(occlusionBytes);
    expect(metallicRoughness.getImage()).toEqual(metallicRoughnessBytes);
    expect(doc.getRoot().listTextures()).toHaveLength(2);
    expect(summary.ormPacked).toBe(0);
    expect(summary.ormSkipped).toHaveLength(1);
    expect(summary.ormSkipped?.[0]).toMatch(/"Panel".*TEXCOORD_1.*TEXCOORD_0/);
  });

  test('an occlusion map under a different texture transform keeps its own image', async () => {
    // Same UV set, but KHR_texture_transform tiles metallic-roughness four times, so
    // the two images still map different pixels to the same point on the surface.
    const { doc, material, occlusion } = occlusionBesideMetallicRoughness(0, 0);
    const transforms = doc.createExtension(KHRTextureTransform);
    material
      .getMetallicRoughnessTextureInfo()!
      .setExtension('KHR_texture_transform', transforms.createTransform().setScale([4, 4]));

    const summary = await applyKitContract(doc, { ktx2: false });

    expect(material.getOcclusionTexture()).toBe(occlusion);
    expect(summary.ormPacked).toBe(0);
    expect(summary.ormSkipped).toHaveLength(1);
    expect(summary.ormSkipped?.[0]).toMatch(/"Panel".*KHR_texture_transform/);
  });

  test('an occlusion map on the same UV set as metallic-roughness still packs', async () => {
    // Both on UV set 1: packing names one image for both slots and leaves the
    // occlusion reading the UV set it was authored for.
    const { doc, material, metallicRoughness } = occlusionBesideMetallicRoughness(1, 1);

    const summary = await applyKitContract(doc, { ktx2: false });

    expect(summary.ormPacked).toBe(1);
    expect(summary.ormSkipped).toBeUndefined();
    expect(material.getOcclusionTexture()).toBe(metallicRoughness);
    expect(material.getOcclusionTextureInfo()?.getTexCoord()).toBe(1);
    expect(doc.getRoot().listTextures()).toHaveLength(1);
  });

  test('equal texture transforms held in separate objects still pack', async () => {
    // The pass compares the transforms' values, not their identity.
    const { doc, material, metallicRoughness } = occlusionBesideMetallicRoughness(0, 0);
    const transforms = doc.createExtension(KHRTextureTransform);
    for (const info of [
      material.getOcclusionTextureInfo()!,
      material.getMetallicRoughnessTextureInfo()!,
    ]) {
      info.setExtension('KHR_texture_transform', transforms.createTransform().setScale([2, 2]));
    }

    const summary = await applyKitContract(doc, { ktx2: false });

    expect(summary.ormPacked).toBe(1);
    expect(summary.ormSkipped).toBeUndefined();
    expect(material.getOcclusionTexture()).toBe(metallicRoughness);
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
