import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createGltfIO } from '../gltf-io';
import { renderSceneToGLB, renderGLBInProcess } from '../render';
import { createEvaluatorRequestV2 } from '../evaluator/protocol';
import { Document } from '@gltf-transform/core';
import { applyIndexPolicy } from '../index-policy';
import { createLocalToolContext } from '../local-runtime';

function source() {
  const geometry = new THREE.PlaneGeometry(2, 2).toNonIndexed();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
}
function primitives(bytes: Uint8Array) {
  return createGltfIO()
    .readBinary(bytes)
    .then((doc) =>
      doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives()),
    );
}
for (const gltfExporter of ['legacy', 'three'] as const) {
  test(`unindexed export welds exact full vertices and reports bytes (${gltfExporter})`, async () => {
    const mesh = source();
    const result = await renderSceneToGLB(mesh, { gltfExporter });
    const [primitive] = await primitives(result.bytes);
    expect(primitive!.getIndices()?.getCount()).toBe(6);
    expect(primitive!.getAttribute('POSITION')!.getCount()).toBe(4);
    for (let i = 0; i < 6; i++)
      for (const [gltf, three] of [
        ['POSITION', 'position'],
        ['NORMAL', 'normal'],
        ['TEXCOORD_0', 'uv'],
      ]) {
        const actual = primitive!
          .getAttribute(gltf!)!
          .getElement(primitive!.getIndices()!.getScalar(i), [] as number[]);
        const original = mesh.geometry.getAttribute(three!);
        expect(actual).toEqual(
          Array.from({ length: original.itemSize }, (_, k) => original.getComponent(i, k)),
        );
      }
    expect(result.indexBuffers).toMatchObject({ policy: 'indexed', primitivesConverted: 1 });
    expect(result.indexBuffers.bufferBytesAfter).toBeLessThan(
      result.indexBuffers.bufferBytesBefore,
    );
    expect(mesh.geometry.index).toBeNull();
  });
  test(`asBuilt retains unindexed buffers and remains deterministic (${gltfExporter})`, async () => {
    const first = await renderSceneToGLB(source(), { gltfExporter, indexPolicy: 'asBuilt' });
    const second = await renderSceneToGLB(source(), { gltfExporter, indexPolicy: 'asBuilt' });
    expect((await primitives(first.bytes))[0]!.getIndices()).toBeNull();
    expect(first.bytes).toEqual(second.bytes);
    expect(first.indexBuffers.bufferBytesAfter).toBe(first.indexBuffers.bufferBytesBefore);
  });
}

test('index policy is explicit in worker requests and saved rebuild options', async () => {
  const code = `const meta={name:'Quad'}; function build(){return createPart('Quad',planeGeo(2,2),gameMaterial(0x888888));}`;
  const request = createEvaluatorRequestV2({
    requestId: 'index-policy',
    code,
    options: { indexPolicy: 'asBuilt' },
  });
  expect(request.request.options.indexPolicy).toBe('asBuilt');
  const result = await renderGLBInProcess(code, { indexPolicy: 'asBuilt' });
  expect(result.rebuildOptions?.indexPolicy).toBe('asBuilt');
});

test('asBuilt rejects consolidation that would rewrite the authored buffers', async () => {
  await expect(
    renderSceneToGLB(source(), { indexPolicy: 'asBuilt', optimize: 'full' }),
  ).rejects.toThrow(/asBuilt.*optimize/);
});

test('exact welding preserves morph seams, vertex order and signed-zero attribute bits', () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const attr = (values: number[]) =>
    doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(values));
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', attr([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]));
  primitive.setAttribute('NORMAL', attr([0, 0, 1, 0, 0, 1, 0, 0, 1, -0, 0, 1, 0, 0, 1, 0, 0, 1]));
  primitive.addTarget(
    doc
      .createPrimitiveTarget()
      .setAttribute('POSITION', attr([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0])),
  );
  doc.createMesh().addPrimitive(primitive);
  applyIndexPolicy(doc, 'indexed');
  expect(primitive.getAttribute('POSITION')!.getCount()).toBe(5);
  expect(Array.from(primitive.getIndices()!.getArray()!)).toEqual([0, 1, 2, 3, 4, 2]);
  expect(Object.is(primitive.getAttribute('NORMAL')!.getElement(3, [] as number[])[0], -0)).toBe(
    true,
  );
  expect(
    primitive
      .listTargets()[0]!
      .getAttribute('POSITION')!
      .getElement(4, [] as number[]),
  ).toEqual([1, 0, 0]);
});

test('local host policy reaches isolated evaluation and cache identity and rejects invalid values', async () => {
  const sourceCode = `function build(){return createPart('Panel',planeGeo(2,2).toNonIndexed(),gameMaterial('#888888'));}`;
  const local = createLocalToolContext({}, { KILN_INDEX_POLICY: 'asBuilt' });
  const rendered = await local.evaluatorPort!.render(sourceCode);
  expect(rendered.rebuildOptions?.indexPolicy).toBe('asBuilt');
  expect(rendered.meta.indexBuffers?.primitivesConverted).toBe(0);
  expect(local.evaluatorCacheIdentity).toContain('asBuilt');
  expect(() => createLocalToolContext({}, { KILN_INDEX_POLICY: 'approximate' })).toThrow(
    'KILN_INDEX_POLICY',
  );
});
