import { describe, expect, spyOn, test } from 'bun:test';
import { Accessor, Document } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, KHRNodeVisibility } from '@gltf-transform/extensions';
import { drawnSceneBounds } from '../node-visibility';

const POSITIONS = [0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 100, 100, 100];

function part(doc: Document, positions: Accessor, indices?: number[]) {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const primitive = doc.createPrimitive().setAttribute('POSITION', positions);
  if (indices)
    primitive.setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer),
    );
  return doc.createMesh().addPrimitive(primitive);
}

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(POSITIONS))
    .setBuffer(buffer);
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  return { doc, buffer, positions, scene };
}

describe('drawnSceneBounds', () => {
  test('counts referenced vertices only and reads the stored array directly', () => {
    const { doc, positions, scene } = fixture();
    // Vertex 4 sits at (100,100,100) and no triangle uses it; repeats add nothing.
    scene.addChild(doc.createNode().setMesh(part(doc, positions, [0, 1, 2, 2, 1, 3, 0, 1, 2])));
    const spy = spyOn(Accessor.prototype, 'getElement');
    try {
      expect(drawnSceneBounds(scene)).toEqual({ min: [0, 0, 0], max: [1, 2, 3] });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('an unindexed primitive counts every vertex', () => {
    const { doc, positions, scene } = fixture();
    scene.addChild(doc.createNode().setMesh(part(doc, positions)));
    expect(drawnSceneBounds(scene)).toEqual({ min: [0, 0, 0], max: [100, 100, 100] });
  });

  test('rotation stays tight, hidden subtrees are left out, every instance is placed', () => {
    const { doc, buffer, positions, scene } = fixture();
    const quarterTurnZ = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number];
    const parent = doc.createNode().setRotation(quarterTurnZ).setTranslation([10, 0, 0]);
    parent.addChild(doc.createNode().setMesh(part(doc, positions, [0, 1, 2])));
    scene.addChild(parent);

    const visibility = doc.createExtension(KHRNodeVisibility);
    const hidden = doc.createNode().setMesh(part(doc, positions, [4, 0, 1]));
    hidden.setExtension('KHR_node_visibility', visibility.createVisibility().setVisible(false));
    scene.addChild(hidden);

    const instancing = doc.createExtension(EXTMeshGPUInstancing);
    const placed = doc.createNode().setMesh(part(doc, positions, [0, 1, 2]));
    placed.setExtension(
      'EXT_mesh_gpu_instancing',
      instancing.createInstancedMesh().setAttribute(
        'TRANSLATION',
        doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 50, 0, 0, -50]))
          .setBuffer(buffer),
      ),
    );
    scene.addChild(placed);

    const { min, max } = drawnSceneBounds(scene);
    // The rotated part runs from x 8 to 10 and y 0 to 1; instances span z -50 to 50.
    expect(min[0]!).toBeCloseTo(0, 5);
    expect(max[0]!).toBeCloseTo(10, 5);
    expect(min[1]!).toBeCloseTo(0, 5);
    expect(max[1]!).toBeCloseTo(2, 5);
    expect(min[2]!).toBeCloseTo(-50, 5);
    expect(max[2]!).toBeCloseTo(50, 5);
  });

  test('normalized positions decode through the accessor', () => {
    const { doc, buffer, scene } = fixture();
    const quantized = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 16384, 0]))
      .setNormalized(true)
      .setBuffer(buffer);
    scene.addChild(doc.createNode().setMesh(part(doc, quantized, [0, 1, 2])));
    const { min, max } = drawnSceneBounds(scene);
    expect(min).toEqual([0, 0, 0]);
    expect(max[0]!).toBeCloseTo(1, 5);
    expect(max[1]!).toBeCloseTo(0.5, 3);
    expect(max[2]!).toBe(0);
  });

  test('an index past the last vertex is ignored, and nothing drawn stays unbounded', () => {
    const { doc, positions, scene } = fixture();
    scene.addChild(doc.createNode().setMesh(part(doc, positions, [0, 1, 2, 2, 1, 900])));
    expect(drawnSceneBounds(scene)).toEqual({ min: [0, 0, 0], max: [1, 2, 0] });
    const empty = fixture();
    expect(drawnSceneBounds(empty.scene)).toEqual({
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    });
  });
});
