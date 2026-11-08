import { describe, expect, spyOn, test } from 'bun:test';
import { Accessor, Document, Primitive, WebIO } from '@gltf-transform/core';
import type { Mesh } from 'three';
import { loadGlbReviewScene } from '..';

/** One triangle-list primitive per requested mode, every attribute kind the review scene reads. */
async function glb(options: {
  mode?: number;
  indices?: number[] | null;
  positions?: number[];
  normalizedUv?: boolean;
}): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = options.positions ?? [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
  const count = positions.length / 3;
  const primitive = doc
    .createPrimitive()
    .setMode((options.mode ?? Primitive.Mode.TRIANGLES) as never)
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(Array.from({ length: count }, () => [0, 0, 1]).flat()))
        .setBuffer(buffer),
    )
    .setAttribute(
      'COLOR_0',
      doc
        .createAccessor()
        .setType('VEC4')
        .setArray(new Uint8Array(Array.from({ length: count }, () => [255, 128, 0, 51]).flat()))
        .setNormalized(true)
        .setBuffer(buffer),
    );
  for (const channel of [0, 2, 3]) {
    const uv = Array.from({ length: count }, (_, i) => [i / count, channel / 4]).flat();
    primitive.setAttribute(
      `TEXCOORD_${channel}`,
      options.normalizedUv
        ? doc
            .createAccessor()
            .setType('VEC2')
            .setArray(new Uint16Array(uv.map((value) => Math.round(value * 65535))))
            .setNormalized(true)
            .setBuffer(buffer)
        : doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer),
    );
  }
  if (options.indices !== null)
    primitive.setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array(options.indices ?? [0, 1, 2, 2, 1, 3]))
        .setBuffer(buffer),
    );
  const scene = doc.createScene('Scene');
  scene.addChild(doc.createNode('Part').setMesh(doc.createMesh('Part').addPrimitive(primitive)));
  doc.getRoot().setDefaultScene(scene);
  return new WebIO().writeBinary(doc);
}

const firstMesh = async (bytes: Uint8Array): Promise<Mesh> => {
  const { root } = await loadGlbReviewScene(bytes);
  let mesh: Mesh | undefined;
  root.traverse((node) => {
    if ((node as Mesh).isMesh && !mesh) mesh = node as Mesh;
  });
  return mesh!;
};
const values = (mesh: Mesh, name: string) => Array.from(mesh.geometry.getAttribute(name)!.array);
const indices = (mesh: Mesh) => Array.from(mesh.geometry.index!.array);

describe('review scene accessor decode', () => {
  test('unnormalized geometry is copied without an element-by-element read', async () => {
    const bytes = await glb({});
    const spy = spyOn(Accessor.prototype, 'getElement');
    try {
      const mesh = await firstMesh(bytes);
      const elementReads = spy.mock.calls.length;
      expect(mesh.geometry.getAttribute('position')!.count).toBe(4);
      // Only the normalized COLOR_0 accessor (4 vertices) goes through the element path.
      expect(elementReads).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });

  test('values and array types match what the element read produces', async () => {
    const mesh = await firstMesh(await glb({}));
    expect(values(mesh, 'position')).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    expect(mesh.geometry.getAttribute('position')!.array).toBeInstanceOf(Float32Array);
    expect(values(mesh, 'normal')).toEqual(Array.from({ length: 4 }, () => [0, 0, 1]).flat());
    expect(values(mesh, 'uv2')).toEqual(
      Array.from(new Float32Array([0, 0.5, 0.25, 0.5, 0.5, 0.5, 0.75, 0.5])),
    );
    expect(values(mesh, 'uv3')).toEqual(
      Array.from(new Float32Array([0, 0.75, 0.25, 0.75, 0.5, 0.75, 0.75, 0.75])),
    );
    expect(mesh.geometry.index!.array).toBeInstanceOf(Uint32Array);
    expect(indices(mesh)).toEqual([0, 1, 2, 2, 1, 3]);
  });

  test('normalized data decodes to floats, as a loader reads it', async () => {
    const mesh = await firstMesh(await glb({ normalizedUv: true }));
    const color = mesh.geometry.getAttribute('color')!;
    expect(color.itemSize).toBe(4);
    expect(color.getX(0)).toBeCloseTo(1, 6);
    expect(color.getY(0)).toBeCloseTo(128 / 255, 6);
    expect(color.getZ(0)).toBe(0);
    expect(color.getW(0)).toBeCloseTo(51 / 255, 6);
    const uv2 = mesh.geometry.getAttribute('uv2')!;
    expect(uv2.getX(1)).toBeCloseTo(0.25, 4);
    expect(uv2.getY(1)).toBeCloseTo(0.5, 4);
  });

  test('unindexed, strip and fan primitives keep their triangle lists', async () => {
    const unindexed = await firstMesh(
      await glb({ indices: null, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] }),
    );
    expect(indices(unindexed)).toEqual([0, 1, 2]);
    const strip = await firstMesh(
      await glb({ mode: Primitive.Mode.TRIANGLE_STRIP, indices: [0, 1, 2, 3] }),
    );
    expect(indices(strip)).toEqual([0, 1, 2, 1, 3, 2]);
    const fan = await firstMesh(
      await glb({ mode: Primitive.Mode.TRIANGLE_FAN, indices: [0, 1, 2, 3] }),
    );
    expect(indices(fan)).toEqual([1, 2, 0, 2, 3, 0]);
  });
});
