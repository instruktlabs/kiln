import { expect, test } from 'bun:test';
import * as THREE from 'three';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { renderSceneToGLB } from '../render';
import type { PortableSamplerV1 } from '../portable-sampler';
import { ApprovedTextureResourceCache } from '../material-resources';
import { createTextureResolver, type TextureResolver } from '../texture-resolver';
import { canonicalizePortableMaterialSpecV3 } from '../procedural-material-v3';
import {
  compilePortableMaterialSpecV2,
  compilePortableMaterialSpecV3,
} from '../portable-material-runtime';
const repeat = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'repeat',
  wrapT: 'repeat',
} as const;
const clamp = { ...repeat, wrapS: 'clamp-to-edge', wrapT: 'clamp-to-edge' } as const;
const spec = (usage = 'albedo', width = 8, height = 4) => ({
  schemaVersion: 3,
  width,
  height,
  usage,
  background: [0, 0, 0, 0],
  operations: [
    {
      op: 'paint',
      shape: { kind: 'rectangle', x: 0, y: 0, width: width / 2, height },
      rgba: [150, 80, 50, 255],
    },
  ],
});
const procedural = (usage = 'albedo') => ({
  kind: 'procedural',
  spec: spec(usage),
  sampler: repeat,
});
const resource = (sampler: PortableSamplerV1 = repeat) => ({
  kind: 'resource',
  resourceId: 'kiln.texture.bark-albedo.v1',
  sampler,
});
test('V3 canonical material admits rectangular typed recipes with explicit samplers and existing PBR semantics', async () => {
  const input = {
    schemaVersion: 3,
    model: 'pbrMetallicRoughness',
    name: 'a'.repeat(200),
    baseColor: 0xabcdef,
    roughness: 0.7,
    metalness: 0.4,
    emissive: 0xff0000,
    emissiveIntensity: 3,
    alphaMode: 'mask',
    alphaCutoff: 0.4,
    doubleSided: false,
    textures: {
      baseColor: procedural(),
      normal: procedural('normal'),
      metallicRoughness: procedural('metallicRoughness'),
      emissive: procedural('emissive'),
      occlusion: procedural('occlusion'),
    },
  };
  expect(canonicalizePortableMaterialSpecV3(input).textures.baseColor?.kind).toBe('procedural');
  const material = await compilePortableMaterialSpecV3(input);
  expect((material.map as THREE.DataTexture).image.width).toBe(8);
  expect((material.map as THREE.DataTexture).image.height).toBe(4);
  expect(material.map!.flipY).toBe(false);
  expect(material.map!.minFilter).toBe(THREE.NearestFilter);
  expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(material.emissiveMap!.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(material.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
  expect(material.roughnessMap).toBe(material.metalnessMap);
  expect(material.color.getHex()).toBe(0xabcdef);
  expect(material.alphaTest).toBe(0.4);
  expect(material.side).toBe(THREE.FrontSide);
  expect(material.emissiveIntensity).toBe(3);
  expect(material.name.length).toBe(200);
  expect(material.map!.userData.kilnPortableBinding.sampler).toEqual(repeat);
});
test('unknown data, missing samplers, wrong usages and V3 height derive fail before resource preparation', async () => {
  let calls = 0;
  const resolver = {
    ...createTextureResolver(),
    preparePortableTexture: async () => {
      calls++;
      throw Error('must not prepare');
    },
  } as TextureResolver;
  for (const input of [
    { textures: { baseColor: { kind: 'procedural', spec: spec() } } },
    { textures: { baseColor: resource(), normal: procedural() } },
    {
      textures: {
        baseColor: { ...procedural(), derive: { kind: 'normal-from-height', strength: 2 } },
      },
    },
    { shader: 'code' },
    { textures: { baseColor: { ...resource(), resourceId: 'https://invalid/texture.png' } } },
    { textures: { baseColor: { ...procedural(), sampler: { ...repeat, constructor: 'bad' } } } },
  ])
    await expect(
      compilePortableMaterialSpecV3(
        { schemaVersion: 3, model: 'pbrMetallicRoughness', ...input },
        { resolver },
      ),
    ).rejects.toThrow();
  expect(calls).toBe(0);
  let read = false;
  const getter = { schemaVersion: 3, model: 'pbrMetallicRoughness' };
  Object.defineProperty(getter, 'textures', {
    enumerable: true,
    get() {
      read = true;
      return {};
    },
  });
  expect(() => canonicalizePortableMaterialSpecV3(getter)).toThrow();
  expect(read).toBe(false);
});
test('all closed resource slots preflight before preparation; legacy-only resolver fails actionable', async () => {
  let preparations = 0;
  const resolver = {
    ...createTextureResolver(),
    preparePortableTexture: async () => {
      preparations++;
      throw Error('unreachable');
    },
  } as TextureResolver;
  await expect(
    compilePortableMaterialSpecV3(
      {
        schemaVersion: 3,
        model: 'pbrMetallicRoughness',
        textures: { baseColor: resource(), normal: resource() },
      },
      { resolver },
    ),
  ).rejects.toThrow(/slot|requires/);
  expect(preparations).toBe(0);
  const legacy = createTextureResolver();
  const { preparePortableTexture: _, ...oldOnly } = legacy;
  await expect(
    compilePortableMaterialSpecV3(
      { schemaVersion: 3, model: 'pbrMetallicRoughness', textures: { baseColor: resource() } },
      { resolver: oldOnly },
    ),
  ).rejects.toThrow(/verified|preparation/i);
});
test('V3 bindings deeply own source/pixels/encoded bytes without mutating cached V2 textures', async () => {
  const cache = new ApprovedTextureResourceCache(),
    resolver = createTextureResolver(cache);
  const old = await compilePortableMaterialSpecV2(
    {
      schemaVersion: 2,
      model: 'pbrMetallicRoughness',
      textures: { baseColor: { kind: 'resource', resourceId: 'kiln.texture.bark-albedo.v1' } },
    },
    { resolver },
  );
  const a = await compilePortableMaterialSpecV3(
    { schemaVersion: 3, model: 'pbrMetallicRoughness', textures: { baseColor: resource() } },
    { resolver },
  );
  const b = await compilePortableMaterialSpecV3(
    {
      schemaVersion: 3,
      model: 'pbrMetallicRoughness',
      textures: { baseColor: resource(clamp) },
    },
    { resolver },
  );
  expect(a.map).not.toBe(old.map);
  expect(a.map!.source).not.toBe(old.map!.source);
  expect((a.map as THREE.DataTexture).image.data).not.toBe(
    (old.map as THREE.DataTexture).image.data,
  );
  expect((a.map as THREE.DataTexture).image.data).not.toBe((b.map as THREE.DataTexture).image.data);
  expect(a.map!.userData.encoded.bytes).toBeInstanceOf(Uint8Array);
  expect(a.map!.userData.encoded.bytes).not.toBe(old.map!.userData.encoded.bytes);
  (a.map as THREE.DataTexture).image.data!.fill(0);
  a.map!.userData.encoded.bytes.fill(0);
  a.map!.userData.kilnTexture.approvedResource.usage = 'normal';
  a.map!.dispose();
  expect((b.map as THREE.DataTexture).image.data!.some((x: number) => x !== 0)).toBe(true);
  expect((old.map as THREE.DataTexture).image.data!.some((x: number) => x !== 0)).toBe(true);
  expect(old.map!.userData.kilnTexture.approvedResource.usage).toBe('albedo');
  expect(old.map!.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(old.map!.wrapS).toBe(THREE.RepeatWrapping);
  expect(b.map!.wrapS).toBe(THREE.ClampToEdgeWrapping);
  expect(b.map!.flipY).toBe(false);
});
test('aggregate V3 work/texels reject individually valid recipe combinations before compilation', () => {
  const huge = {
    ...spec('albedo', 1024, 1024),
    operations: [],
    palette: { colors: Array.from({ length: 32 }, (_, i) => i) },
  };
  const input = {
    schemaVersion: 3,
    model: 'pbrMetallicRoughness',
    textures: {
      baseColor: { kind: 'procedural', spec: huge, sampler: repeat },
      emissive: { kind: 'procedural', spec: { ...huge, usage: 'emissive' }, sampler: repeat },
    },
  };
  expect(() => canonicalizePortableMaterialSpecV3(input)).toThrow(/work|budget/i);
  const slots = ['baseColor', 'normal', 'metallicRoughness', 'emissive', 'occlusion'];
  const usage = ['albedo', 'normal', 'metallicRoughness', 'emissive', 'occlusion'];
  expect(() =>
    canonicalizePortableMaterialSpecV3({
      schemaVersion: 3,
      model: 'pbrMetallicRoughness',
      textures: Object.fromEntries(
        slots.map((slot, i) => [
          slot,
          {
            kind: 'procedural',
            spec: { ...spec(usage[i], 1024, 1024), operations: [] },
            sampler: repeat,
          },
        ]),
      ),
    }),
  ).toThrow(/texel|budget/i);
});
test('prepared resource copy/hash work is charged alongside a nearly full inline budget', async () => {
  const bytes = new Uint8Array(
    await sharp({ create: { width: 256, height: 256, channels: 4, background: '#804020' } })
      .png()
      .toBuffer(),
  );
  const resolver: TextureResolver = {
    ...createTextureResolver(),
    describeApprovedTexture: () => ({ usage: 'emissive', allowedSlots: ['emissive'] }),
    preparePortableTexture: async (id) => ({
      descriptor: {
        resourceId: id as string,
        usage: 'emissive',
        allowedSlots: ['emissive'],
        colorSpace: 'srgb',
        width: 256,
        height: 256,
        encodedByteLength: bytes.length,
        imageSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      },
      bytes,
      userData: {},
    }),
  };
  const paint = {
    op: 'paint',
    shape: { kind: 'rectangle', x: 0, y: 0, width: 1024, height: 1024 },
    rgba: [30, 40, 50, 255],
  };
  const input = {
    schemaVersion: 3,
    model: 'pbrMetallicRoughness',
    textures: {
      baseColor: {
        kind: 'procedural',
        sampler: repeat,
        spec: {
          schemaVersion: 3,
          width: 1024,
          height: 1024,
          usage: 'albedo',
          operations: Array.from({ length: 30 }, () => ({ ...paint })),
        },
      },
      emissive: { kind: 'resource', resourceId: 'kiln.texture.emissive-grid.v1', sampler: repeat },
    },
  };
  await expect(compilePortableMaterialSpecV3(input, { resolver })).rejects.toThrow(
    /aggregate.*work|work.*budget/i,
  );
});
test('prepared PNG hash/header/slot/size failures have closed V3 diagnostics before decoding', async () => {
  const resolver = createTextureResolver();
  const pristine = await resolver.preparePortableTexture!('kiln.texture.bark-albedo.v1');
  const variants = [
    (p: typeof pristine) => {
      p.bytes[0] = 0;
    },
    (p: typeof pristine) => {
      p.descriptor.imageSha256 = `sha256:${'0'.repeat(64)}`;
    },
    (p: typeof pristine) => {
      p.descriptor.width++;
    },
    (p: typeof pristine) => {
      p.descriptor.colorSpace = 'linear';
    },
    (p: typeof pristine) => {
      p.descriptor.width = 4097;
    },
    (p: typeof pristine) => {
      p.descriptor.encodedByteLength++;
    },
    (p: typeof pristine) => {
      p.descriptor.allowedSlots = [];
    },
  ];
  for (const mutate of variants) {
    const prepared = structuredClone(pristine);
    mutate(prepared);
    const custom = { ...resolver, preparePortableTexture: async () => prepared };
    await expect(
      compilePortableMaterialSpecV3(
        { schemaVersion: 3, model: 'pbrMetallicRoughness', textures: { baseColor: resource() } },
        { resolver: custom },
      ),
    ).rejects.toMatchObject({ diagnostic: 'PORTABLE_MATERIAL_V3_CONTRACT' });
  }
  const controller = new AbortController();
  controller.abort();
  await expect(
    compilePortableMaterialSpecV3(
      { schemaVersion: 3, model: 'pbrMetallicRoughness', textures: { baseColor: resource() } },
      { signal: controller.signal },
    ),
  ).rejects.toMatchObject({ diagnostic: 'PORTABLE_MATERIAL_V3_CONTRACT' });
});
test('a native decode failure releases already compiled owned textures', async () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const header = new DataView(bytes.buffer);
  header.setUint32(16, 4);
  header.setUint32(20, 4);
  const resolver: TextureResolver = {
    ...createTextureResolver(),
    describeApprovedTexture: () => ({ usage: 'normal', allowedSlots: ['normal'] }),
    preparePortableTexture: async (id) => ({
      descriptor: {
        resourceId: id as string,
        usage: 'normal',
        allowedSlots: ['normal'],
        colorSpace: 'linear',
        width: 4,
        height: 4,
        encodedByteLength: bytes.length,
        imageSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      },
      bytes,
      userData: {},
    }),
  };
  const original = THREE.DataTexture.prototype.dispose;
  let disposed = 0;
  THREE.DataTexture.prototype.dispose = function () {
    disposed++;
    original.call(this);
  };
  try {
    await expect(
      compilePortableMaterialSpecV3(
        {
          schemaVersion: 3,
          model: 'pbrMetallicRoughness',
          textures: {
            baseColor: procedural(),
            normal: {
              kind: 'resource',
              resourceId: 'kiln.texture.neutral-normal.v1',
              sampler: repeat,
            },
          },
        },
        { resolver },
      ),
    ).rejects.toThrow();
    expect(disposed).toBe(1);
  } finally {
    THREE.DataTexture.prototype.dispose = original;
  }
});
test('ordinary scalar-only V3 baseline and explicitly blended emission remain core PBR state', async () => {
  const ordinary = await compilePortableMaterialSpecV3({
    schemaVersion: 3,
    model: 'pbrMetallicRoughness',
  });
  expect(ordinary.map).toBeNull();
  expect(ordinary.transparent).toBe(false);
  expect(ordinary.roughness).toBe(1);
  expect(ordinary.metalness).toBe(0);
  expect(ordinary.side).toBe(THREE.FrontSide);
  const blend = await compilePortableMaterialSpecV3({
    schemaVersion: 3,
    model: 'pbrMetallicRoughness',
    alphaMode: 'blend',
    doubleSided: true,
    emissive: 0x803020,
    emissiveIntensity: 2,
  });
  expect(blend.transparent).toBe(true);
  expect(blend.alphaTest).toBe(0);
  expect(blend.side).toBe(THREE.DoubleSide);
  expect(blend.emissive.getHex()).toBe(0x803020);
});
for (const exporter of ['legacy', 'three'] as const)
  test(`V3 alpha and nearest repeat/clamp samplers survive ${exporter} export/reload`, async () => {
    const root = new THREE.Group();
    for (const [name, sampler] of [
      ['repeat', repeat],
      ['clamp', clamp],
    ] as const) {
      const material = await compilePortableMaterialSpecV3({
        schemaVersion: 3,
        model: 'pbrMetallicRoughness',
        name,
        alphaMode: 'mask',
        textures: { baseColor: { ...procedural(), sampler } },
      });
      root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    }
    const result = await renderSceneToGLB(root, { gltfExporter: exporter, optimize: 'full' });
    const document = await new NodeIO().readBinary(result.bytes);
    for (const material of document.getRoot().listMaterials()) {
      const info = material.getBaseColorTextureInfo()!;
      expect(info.getMinFilter()).toBe(9728);
      expect(info.getMagFilter()).toBe(9728);
      expect(info.getWrapS()).toBe(material.getName() === 'repeat' ? 10497 : 33071);
      expect(info.getWrapT()).toBe(material.getName() === 'repeat' ? 10497 : 33071);
      expect(material.getAlphaMode()).toBe('MASK');
    }
  });
