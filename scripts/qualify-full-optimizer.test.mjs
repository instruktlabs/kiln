import { describe, expect, test } from 'bun:test';
import { Document } from '@gltf-transform/core';
import { createGltfIO, MSFT_LOD, MSFTLod } from '../src/gltf-io';
import { optimizeGlbBytes } from '../src/render';
import { compareOptimizerEvidence, optimizerEvidence } from './qualify-full-optimizer.mjs';

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mat = doc.createMaterial('paint');
  const scene = doc.createScene();
  const pivot = doc.createNode('Joint_Door');
  scene.addChild(pivot);
  const parts = [0, 1].map((index) => {
    const position = doc
      .createAccessor()
      .setBuffer(buffer)
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const mesh = doc
      .createMesh()
      .addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', position));
    const node = doc
      .createNode(`Part_${index}`)
      .setTranslation([index * 2, 0, 0])
      .setMesh(mesh);
    pivot.addChild(node);
    return node;
  });
  return { doc, pivot, parts };
}

describe('full optimizer corpus evidence', () => {
  test('accepts intentional topology changes while preserving world geometry and named pivots', async () => {
    const { doc } = fixture();
    const io = createGltfIO();
    const result = await optimizeGlbBytes(await io.writeBinary(doc), {
      mode: 'full',
      instance: 'off',
    });
    expect(result.summary.drawsAfter).toBe(1);
    expect(
      compareOptimizerEvidence(
        optimizerEvidence(doc),
        optimizerEvidence(await io.readBinary(result.bytes)),
      ),
    ).toEqual([]);
  });

  test('detects a same-bounds geometry change, material change and named transform change', () => {
    const { doc, parts, pivot } = fixture();
    const before = optimizerEvidence(doc);
    const pos = parts[0].getMesh().listPrimitives()[0].getAttribute('POSITION');
    pos.setElement(1, [0.5, 0, 0]);
    expect(
      compareOptimizerEvidence(before, optimizerEvidence(doc)).some((item) =>
        item.startsWith('geometry'),
      ),
    ).toBe(true);
    pos.setElement(1, [1, 0, 0]);
    doc.getRoot().listMaterials()[0].setRoughnessFactor(0.25);
    expect(compareOptimizerEvidence(before, optimizerEvidence(doc))).toContain('materials');
    doc.getRoot().listMaterials()[0].setRoughnessFactor(1);
    pivot.setTranslation([1, 0, 0]);
    expect(compareOptimizerEvidence(before, optimizerEvidence(doc))).toContain('nodes');
  });

  test('checks off-scene LOD geometry and references with the engine IO', async () => {
    const { doc, parts } = fixture();
    const low = parts[1];
    low.getParentNode().removeChild(low);
    parts[0].setExtension(MSFT_LOD, doc.createExtension(MSFTLod).createLod().addLevel(low));
    const io = createGltfIO();
    const reloaded = await io.readBinary(await io.writeBinary(doc));
    const before = optimizerEvidence(reloaded);
    expect(compareOptimizerEvidence(optimizerEvidence(doc), before)).toEqual([]);
    const lod = reloaded
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === 'Part_0')
      .getExtension(MSFT_LOD);
    lod
      .listLevels()[0]
      .getMesh()
      .listPrimitives()[0]
      .getAttribute('POSITION')
      .setElement(1, [0.25, 0, 0]);
    expect(
      compareOptimizerEvidence(before, optimizerEvidence(reloaded)).some((item) =>
        item.startsWith('geometry'),
      ),
    ).toBe(true);
  });

  test('detects flipped visible winding even when vertex moments and bounds are unchanged', () => {
    const { doc, parts } = fixture();
    const buffer = doc.getRoot().listBuffers()[0];
    for (const node of parts) {
      const normal = doc
        .createAccessor()
        .setBuffer(buffer)
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
      node.getMesh().listPrimitives()[0].setAttribute('NORMAL', normal);
    }
    const before = optimizerEvidence(doc);
    parts[0]
      .getMesh()
      .listPrimitives()[0]
      .setIndices(
        doc
          .createAccessor()
          .setBuffer(buffer)
          .setType('SCALAR')
          .setArray(new Uint16Array([0, 2, 1])),
      );
    const changes = compareOptimizerEvidence(before, optimizerEvidence(doc));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toStartWith('geometry.face:');
  });
});
