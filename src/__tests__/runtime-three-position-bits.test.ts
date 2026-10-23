/**
 * #197: the three runtime target quantizes positions to 14 bits per mesh by default, which on
 * a 10 m mesh is a grid of about 0.61 mm. `positionBits` chooses 8 to 16 bits or `float`, and
 * the sidecar reports the resulting grid step in metres for every quantized mesh node and the
 * largest one, so the effect is visible before shipping. The default bytes are unchanged.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Document as GltfDocument, Node } from '@gltf-transform/core';
import { deliverThreeRuntimeGlb, exportAssetGlb } from '../asset-export';
import type { AssetRecord } from '../assets';
import { createGltfIO } from '../gltf-io';
import { validateFinalGlbBytes } from '../qa/gltf';
import { renderGLBInProcess } from '../render';
import * as THREE from 'three';

const PROGRAM = `const meta={name:'Long Hull'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#777777');
  createPart('Hull',boxGeo(10,1,1),m,{parent:root,position:[0,0.5,0]});
  const nested=new THREE.Group(); nested.name='Doubled'; nested.scale.set(2,2,2); root.add(nested);
  createPart('Fin',boxGeo(1,1,0.1),m,{parent:nested,position:[0,2,0]});
  return root;
}`;

let source: Uint8Array;
beforeAll(async () => {
  source = new Uint8Array((await renderGLBInProcess(PROGRAM)).glb);
});

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const derive = (options: Record<string, unknown> = {}) =>
  deliverThreeRuntimeGlb(source, { compression: 'none', ...options });
const read = async (glb: Uint8Array) => createGltfIO().readBinary(glb);

/** The part node by name: both exporters name it, while only one names its mesh. */
const partNode = (doc: GltfDocument, name: string): Node =>
  doc
    .getRoot()
    .listNodes()
    .find((candidate: Node) => candidate.getName() === name && candidate.getMesh())!;
/** World-space positions of a part, decoded the way a loader decodes them. */
function worldPositions(doc: GltfDocument, part: string): THREE.Vector3[] {
  const node = partNode(doc, part);
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const position = node.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
  return Array.from({ length: position.getCount() }, (_, i) =>
    new THREE.Vector3().fromArray(position.getElement(i, [])).applyMatrix4(matrix),
  );
}
/** The export reorders vertices, so each one is matched to its nearest authored vertex. */
const largestError = (actual: THREE.Vector3[], expected: THREE.Vector3[]) =>
  Math.max(...actual.map((point) => Math.min(...expected.map((other) => point.distanceTo(other)))));

describe('three runtime positionBits', () => {
  test('the default reports a 14-bit grid step per node and the largest one', async () => {
    const { delivery } = await derive();
    expect(delivery.quantization.bits.position).toBe(14);
    const steps = Object.fromEntries(
      delivery.quantization.positionSteps.map(({ node, step }) => [
        node
          .split('/')
          .pop()!
          .replace(/\[\d+\]$/, ''),
        step,
      ]),
    );
    // Half-extent over 2^13 - 1 levels, times the node's world scale.
    expect(steps['Mesh_Hull']).toBeCloseTo(5 / 8191, 12);
    expect(steps['Mesh_Fin']).toBeCloseTo((0.5 * 2) / 8191, 12);
    expect(delivery.quantization.maxPositionStep).toBeCloseTo(5 / 8191, 12);
  });

  test('16 bits shrinks the step and the measured error stays within half of it', async () => {
    const authored = worldPositions(await read(source), 'Mesh_Hull');
    const fine = await derive({ positionBits: 16 });
    expect(fine.delivery.quantization.bits.position).toBe(16);
    expect(fine.delivery.quantization.maxPositionStep).toBeCloseTo(5 / 32767, 12);
    const fineError = largestError(worldPositions(await read(fine.glb), 'Mesh_Hull'), authored);
    expect(fineError).toBeLessThanOrEqual(fine.delivery.quantization.maxPositionStep / 2 + 1e-9);
    const coarse = await derive();
    const coarseError = largestError(worldPositions(await read(coarse.glb), 'Mesh_Hull'), authored);
    expect(fineError).toBeLessThan(coarseError);
  });

  test('float leaves positions unquantized and moves no node scale', async () => {
    const authored = worldPositions(await read(source), 'Mesh_Hull');
    const exact = await derive({ positionBits: 'float' });
    const { quantization, nodeScale } = exact.delivery;
    expect(quantization.bits.position).toBe('float32');
    expect(quantization.positionSteps).toEqual([]);
    expect(quantization.maxPositionStep).toBe(0);
    expect(nodeScale).toEqual([]);
    const doc = await read(exact.glb);
    const accessor = partNode(doc, 'Mesh_Hull')
      .getMesh()!
      .listPrimitives()[0]!
      .getAttribute('POSITION')!;
    expect(accessor.getComponentType()).toBe(5126);
    expect(largestError(worldPositions(doc, 'Mesh_Hull'), authored)).toBe(0);
    // Normals and texture coordinates are still quantized, so the extension stays required
    // and the file is valid glTF.
    expect(exact.delivery.extensionsRequired).toContain('KHR_mesh_quantization');
    expect((await validateFinalGlbBytes(exact.glb)).issues.numErrors).toBe(0);
  });

  test('the default bytes do not change, and positionBits is validated', async () => {
    expect(sha((await derive({ positionBits: 14 })).glb)).toBe(sha((await derive()).glb));
    for (const bad of [7, 17, 12.5, 'half', Number.NaN])
      await expect(derive({ positionBits: bad })).rejects.toThrow('positionBits');
    const record: AssetRecord = {
      manifest: {
        version: 'kiln.asset.v1',
        assetId: 'a_bits',
        revisionId: 'r_bits',
        name: 'Long Hull',
        tags: [],
        createdAt: '2026-10-23T00:00:00.000Z',
        editable: false,
        files: {
          'asset.glb': { bytes: source.length, sha256: sha(source) as `sha256:${string}` },
        },
      },
      files: { 'asset.glb': source },
    };
    await expect(
      exportAssetGlb(record, { profile: 'runtime', positionBits: 'float' }),
    ).rejects.toThrow('requires the three runtime target');
  });
});
