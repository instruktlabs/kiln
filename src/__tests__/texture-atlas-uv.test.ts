import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { textureAtlas, remapUVToAtlas } from '../texture-atlas';
import { renderSceneToGLB } from '../render';

const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
};
const spec = {
  schemaVersion: 1,
  width: 128,
  height: 128,
  usage: 'albedo',
  sampler,
  regions: [
    {
      name: 'corners',
      content: { x: 2, y: 2, width: 4, height: 4 },
      source: {
        kind: 'procedural',
        spec: {
          schemaVersion: 3,
          width: 4,
          height: 4,
          operations: [
            {
              op: 'paint',
              shape: { kind: 'rectangle', x: 0, y: 0, width: 2, height: 2 },
              rgba: [255, 0, 0, 255],
            },
            {
              op: 'paint',
              shape: { kind: 'rectangle', x: 2, y: 0, width: 2, height: 2 },
              rgba: [0, 255, 0, 255],
            },
            {
              op: 'paint',
              shape: { kind: 'rectangle', x: 0, y: 2, width: 2, height: 2 },
              rgba: [0, 0, 255, 255],
            },
            {
              op: 'paint',
              shape: { kind: 'rectangle', x: 2, y: 2, width: 2, height: 2 },
              rgba: [255, 255, 0, 255],
            },
          ],
        },
      },
    },
  ],
};

test('owned atlas texture and both UV origin/mode choices use content rather than gutters', async () => {
  const atlas = await textureAtlas(spec);
  expect(atlas.flipY).toBe(false);
  expect(atlas.magFilter).toBe(THREE.NearestFilter);
  expect(atlas.generateMipmaps).toBe(false);
  const input = new THREE.PlaneGeometry(),
    before = input.getAttribute('uv').array.slice();
  for (const mode of ['content-boundary', 'texel-center'] as const) {
    const output = remapUVToAtlas(input, atlas, 'corners', { inputOrigin: 'bottom-left', mode });
    const start = mode === 'texel-center' ? 2.5 : 2;
    expect(output.getAttribute('uv').getX(0)).toBe(start / 128);
    expect(output.getAttribute('uv').getY(0)).toBe(start / 128);
    const top = remapUVToAtlas(input, atlas, 'corners', { inputOrigin: 'top-left', mode });
    expect(top.getAttribute('uv').getY(0)).toBe((mode === 'texel-center' ? 5.5 : 6) / 128);
  }
  expect(input.getAttribute('uv').array).toEqual(before);
  const one = await textureAtlas({
    ...spec,
    regions: [
      {
        ...spec.regions[0],
        content: { x: 2, y: 2, width: 1, height: 1 },
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  });
  expect([
    ...remapUVToAtlas(input, one, 'corners', {
      inputOrigin: 'bottom-left',
      mode: 'texel-center',
    }).getAttribute('uv').array,
  ]).toEqual(Array(8).fill(2.5 / 128));
});

test('UV mapping owns rich attribute buffers, keeps topology/morphs and diagnoses tangents', async () => {
  const atlas = await textureAtlas(spec),
    input = new THREE.PlaneGeometry();
  input.setAttribute(
    'color',
    new THREE.Uint8BufferAttribute(
      [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, 255, 255, 0, 32],
      4,
      true,
    ),
  );
  input.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(Array(4).fill([0, 1, 2, 3]).flat(), 4),
  );
  input.setAttribute(
    'skinWeight',
    new THREE.Uint8BufferAttribute(Array(4).fill([128, 64, 32, 31]).flat(), 4, true),
  );
  input.setAttribute(
    'tangent',
    new THREE.Float32BufferAttribute(Array(4).fill([1, 0, 0, 1]).flat(), 4),
  );
  const shared = new THREE.InterleavedBuffer(
    new Float32Array([0, 1, 10, 1, 1, 20, 0, 0, 30, 1, 0, 40]),
    3,
  );
  input.setAttribute('uv', new THREE.InterleavedBufferAttribute(shared, 2, 0));
  input.setAttribute('custom', new THREE.InterleavedBufferAttribute(shared, 1, 2));
  input.morphAttributes.position = [input.getAttribute('position').clone()];
  input.morphAttributes.normal = [input.getAttribute('normal').clone()];
  input.morphTargetsRelative = true;
  input.userData = { source: { keep: true } };
  input.setDrawRange(0, 3);
  input.addGroup(0, 3, 1);
  const before = JSON.stringify(input.toJSON()),
    output = remapUVToAtlas(input, atlas, 'corners', {
      inputOrigin: 'bottom-left',
      mode: 'texel-center',
    });
  expect(output.index!.array).toEqual(input.index!.array);
  expect(output.groups).toEqual(input.groups);
  expect(output.drawRange).toEqual(input.drawRange);
  expect(output.morphTargetsRelative).toBe(true);
  for (const key of ['color', 'skinIndex', 'skinWeight', 'custom']) {
    const a = output.getAttribute(key),
      b = input.getAttribute(key);
    expect(a.array).not.toBe(b.array);
    expect(a.array.constructor).toBe(b.array.constructor);
    expect(a.normalized).toBe(b.normalized);
    expect(a.array).toEqual(b.array);
  }
  expect(output.morphAttributes.position![0]!.array).not.toBe(
    input.morphAttributes.position![0]!.array,
  );
  expect(output.morphAttributes.normal![0]!.array).toEqual(input.morphAttributes.normal![0]!.array);
  expect(output.getAttribute('tangent')).toBeUndefined();
  expect(output.userData.kilnAttributeWarnings).toContainEqual(
    expect.objectContaining({ code: 'UV_REMAP_TANGENTS_DROPPED' }),
  );
  output.getAttribute('color').setX(0, 0);
  output.getAttribute('custom').setX(0, 0);
  output.morphAttributes.position![0]!.setX(0, 50);
  output.userData.source.keep = false;
  expect(JSON.stringify(input.toJSON())).toBe(before);
  const half = new THREE.Float16BufferAttribute(new Uint16Array(8), 2);
  for (let i = 0; i < 4; i++) half.setXY(i, i % 2, i < 2 ? 1 : 0);
  input.setAttribute('uv', half);
  expect(
    remapUVToAtlas(input, atlas, 'corners', {
      inputOrigin: 'bottom-left',
      mode: 'content-boundary',
    })
      .getAttribute('uv')
      .getY(0),
  ).toBe(2 / 128);
});

test('invalid unit UV, selectors and corrupt manifests fail before cloning', async () => {
  const atlas = await textureAtlas(spec),
    geo = new THREE.PlaneGeometry();
  let clones = 0;
  const clone = geo.clone.bind(geo);
  geo.clone = () => {
    clones++;
    return clone();
  };
  geo.getAttribute('uv').setX(0, 1.001);
  expect(() =>
    remapUVToAtlas(geo, atlas, 'corners', { inputOrigin: 'bottom-left', mode: 'content-boundary' }),
  ).toThrow(/unit|0.*1/);
  expect(clones).toBe(0);
  geo.getAttribute('uv').setX(0, 0);
  expect(() =>
    remapUVToAtlas(geo, atlas, 'missing', { inputOrigin: 'bottom-left', mode: 'content-boundary' }),
  ).toThrow(/region/);
  atlas.userData.kilnAtlas.manifest.regions[0].content.x++;
  expect(() =>
    remapUVToAtlas(geo, atlas, 'corners', { inputOrigin: 'bottom-left', mode: 'content-boundary' }),
  ).toThrow(/manifest|identity/);
  expect(clones).toBe(0);
});

test('clone admission charges ordinary attributes individually even when their input storage is shared', async () => {
  const atlas = await textureAtlas(spec),
    geometry = new THREE.PlaneGeometry();
  const shared = new Float32Array((3 * 1024 * 1024) / 4);
  for (let i = 0; i < 45; i++)
    geometry.setAttribute(`shared-${i}`, new THREE.BufferAttribute(shared, 1));
  let clones = 0;
  geometry.clone = () => {
    clones++;
    throw new Error('large clone must not allocate');
  };
  expect(() =>
    remapUVToAtlas(geometry, atlas, 'corners', {
      inputOrigin: 'top-left',
      mode: 'content-boundary',
    }),
  ).toThrow(/allocation budget/);
  expect(clones).toBe(0);
});

test('normalized UV getters and identity-scale tangent preservation remain supported', async () => {
  const atlas = await textureAtlas({
    ...spec,
    width: 4,
    height: 4,
    regions: [{ ...spec.regions[0], content: { x: 0, y: 0, width: 4, height: 4 }, gutter: 0 }],
  });
  const geometry = new THREE.PlaneGeometry();
  geometry.setAttribute(
    'uv',
    new THREE.Uint8BufferAttribute([0, 255, 255, 255, 0, 0, 255, 0], 2, true),
  );
  geometry.setAttribute(
    'tangent',
    new THREE.Float32BufferAttribute(Array(4).fill([1, 0, 0, 1]).flat(), 4),
  );
  const mapped = remapUVToAtlas(geometry, atlas, 'corners', {
    inputOrigin: 'top-left',
    mode: 'content-boundary',
  });
  expect([...mapped.getAttribute('uv').array]).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  expect(mapped.getAttribute('tangent').array).toEqual(geometry.getAttribute('tangent').array);
  geometry.setAttribute('uv', new THREE.InstancedBufferAttribute(new Float32Array(8), 2));
  expect(() =>
    remapUVToAtlas(geometry, atlas, 'corners', {
      inputOrigin: 'top-left',
      mode: 'content-boundary',
    }),
  ).toThrow(/per-instance/);
});

test('four colored corners and explicit UV orientation survive canonical GLB reload', async () => {
  const atlas = await textureAtlas(spec),
    geo = remapUVToAtlas(new THREE.PlaneGeometry(), atlas, 'corners', {
      inputOrigin: 'bottom-left',
      mode: 'texel-center',
    });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlas })));
  const rendered = await renderSceneToGLB(root, { optimize: 'off' });
  const doc = await new NodeIO().registerExtensions([KHRMaterialsUnlit]).readBinary(rendered.bytes);
  const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!,
    uv = primitive.getAttribute('TEXCOORD_0')!.getArray()!,
    image = primitive.getMaterial()!.getBaseColorTexture()!.getImage()!;
  expect([...uv]).toEqual([...geo.getAttribute('uv').array]);
  const rgba = await sharp(image).ensureAlpha().raw().toBuffer();
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
  ];
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(Number(uv[i * 2]) * 128),
      y = Math.floor(Number(uv[i * 2 + 1]) * 128),
      index = (y * 128 + x) * 4;
    expect([...rgba.slice(index, index + 4)]).toEqual(colors[i]!);
  }
  expect(rendered.gltfValidation.issues.numErrors).toBe(0);
});

test('dilated transparent RGB survives encoded PNG and canonical GLB without alpha growth', async () => {
  const atlas = await textureAtlas({
    ...spec,
    regions: [
      {
        ...spec.regions[0],
        edgeMode: 'mask-rgb-dilate',
        source: {
          kind: 'procedural',
          spec: {
            schemaVersion: 3,
            width: 4,
            height: 4,
            operations: [
              {
                op: 'paint',
                shape: { kind: 'rectangle', x: 1, y: 1, width: 1, height: 1 },
                rgba: [191, 31, 7, 255],
              },
            ],
          },
        },
      },
    ],
  });
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide }),
    ),
  );
  const rendered = await renderSceneToGLB(root, { optimize: 'off' });
  const doc = await new NodeIO().registerExtensions([KHRMaterialsUnlit]).readBinary(rendered.bytes);
  const image = doc.getRoot().listTextures()[0]!.getImage()!,
    rgba = await sharp(image).ensureAlpha().raw().toBuffer();
  expect([...rgba.slice(0, 4)]).toEqual([191, 31, 7, 0]);
  const seed = (3 * 128 + 3) * 4;
  expect([...rgba.slice(seed, seed + 4)]).toEqual([191, 31, 7, 255]);
  expect(atlas.image.data![3]).toBe(0);
});
