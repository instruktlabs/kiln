import { expect, test } from 'bun:test';
import { Document, type Material, type Primitive } from '@gltf-transform/core';
import { KHRNodeVisibility } from '@gltf-transform/extensions';
import { analyzeDrawDiagnostics, inspectDrawDiagnostics } from '../draw-diagnostics';
import { createGltfIO } from '../gltf-io';

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const material = doc.createMaterial('M');
  const primitive = (count = 3, mat: Material = material) => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      positions.set([Math.floor(i / 3) * 2 + (i % 3 === 1 ? 1 : 0), i % 3 === 2 ? 1 : 0, 0], i * 3);
    return doc
      .createPrimitive()
      .setMaterial(mat)
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
      )
      .setIndices(
        doc
          .createAccessor()
          .setType('SCALAR')
          .setArray(Uint16Array.from({ length: count }, (_, i) => i))
          .setBuffer(buffer),
      );
  };
  const node = (name: string, p: Primitive = primitive()) => {
    const n = doc.createNode(name).setMesh(doc.createMesh().addPrimitive(p));
    scene.addChild(n);
    return n;
  };
  return { doc, scene, material, primitive, node, buffer };
}

test('draw estimates use actual rigid groups, layouts and locks and never change the input', async () => {
  const f = fixture();
  f.node('A');
  f.node('B').setTranslation([2, 0, 0]);
  const different = f
    .primitive()
    .setAttribute(
      'TEXCOORD_0',
      f.doc.createAccessor().setType('VEC2').setArray(new Float32Array(6)).setBuffer(f.buffer),
    );
  f.node('DifferentLayout', different);
  const pivot = f.doc.createNode('Joint_Hinge');
  f.scene.addChild(pivot);
  pivot.addChild(f.node('HingeChild'));
  f.node('Glass', f.primitive(3, f.doc.createMaterial('Glass').setAlphaMode('BLEND')));
  const io = createGltfIO();
  const bytes = await io.writeBinary(f.doc);

  const report = analyzeDrawDiagnostics(f.doc);

  expect(report.status).toBe('assessed');
  expect(report.currentDraws).toBe(5);
  expect(report.mergeEstimate).toMatchObject({ draws: 4, saved: 1 });
  expect(report.anchors?.items.find((a) => a.name === 'Joint_Hinge')).toMatchObject({
    draws: 1,
    afterRigidMerge: 1,
  });
  expect(report.scope).toMatch(/shadow.*reflection/i);
  expect(report.mergeEstimate?.method).toMatch(/existing materials/i);
  expect(analyzeDrawDiagnostics(f.doc, { keep: ['A'] }).mergeEstimate?.draws).toBe(5);
  expect(await io.writeBinary(f.doc)).toEqual(bytes);
  expect(await inspectDrawDiagnostics(bytes)).toEqual(report);
});

test('estimates include the shared-byte budget and the 65,534-vertex split', () => {
  const shared = fixture();
  const p = shared.primitive(900);
  shared.node('A', p);
  shared.node('B', p.clone());
  expect(analyzeDrawDiagnostics(shared.doc).mergeEstimate).toMatchObject({ draws: 2, saved: 0 });

  const split = fixture();
  for (let i = 0; i < 3; i++) split.node(String(i), split.primitive(24_000));
  expect(analyzeDrawDiagnostics(split.doc).mergeEstimate).toMatchObject({ draws: 2, saved: 1 });
});

test('flags sampled overlapping coplanar parts and mirrored tangents without claiming visual defects', () => {
  const f = fixture();
  f.node('A');
  f.node('Overlap').setTranslation([0.1, 0.1, 0]);
  f.node('Separated').setTranslation([5, 0, 0]);
  const p = f.primitive().setAttribute(
    'TANGENT',
    f.doc
      .createAccessor()
      .setType('VEC4')
      .setArray(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]))
      .setBuffer(f.buffer),
  );
  f.node('Mirrored', p).setScale([-1, 1, 1]).setTranslation([10, 0, 0]);
  const hidden = f.node('Hidden', p.clone()).setScale([-1, 1, 1]);
  hidden.setExtension(
    'KHR_node_visibility',
    f.doc.createExtension(KHRNodeVisibility).createVisibility().setVisible(false),
  );

  const report = analyzeDrawDiagnostics(f.doc);

  expect(report.currentDraws).toBe(4);
  expect(report.observations?.mirroredTangents.count).toBe(1);
  expect(report.observations?.coplanarParts.candidates).toHaveLength(1);
  expect(report.observations?.coplanarParts.evidence).toMatch(/sampled.*not.*z-fighting/i);
  expect(report.observations?.mirroredTangents.evidence).toMatch(/not.*shading/i);
});

test('large inputs explicitly skip estimates and bounded output reports omitted anchors', async () => {
  const f = fixture();
  for (let i = 0; i < 60; i++) f.node(`Joint_${i}_${'x'.repeat(400)}`);
  const report = analyzeDrawDiagnostics(f.doc);
  expect(report.anchors!.total).toBeGreaterThan(16);
  expect(report.anchors!.omitted).toBe(report.anchors!.total - report.anchors!.items.length);
  expect(JSON.stringify(report).length).toBeLessThan(8000);
  const large = new Document();
  for (let i = 0; i < 2049; i++) large.createNode();
  expect(analyzeDrawDiagnostics(large)).toMatchObject({ status: 'skipped', reason: 'input-limit' });
  expect(analyzeDrawDiagnostics(large).mergeEstimate).toBeUndefined();
  expect(await inspectDrawDiagnostics(new Uint8Array([1, 2, 3]))).toMatchObject({
    status: 'skipped',
    reason: 'unreadable-glb',
  });
});

test('coplanar candidates exclude adjacent triangles and geometry in different scenes', () => {
  const f = fixture();
  f.node('First');
  const adjacent = f.primitive();
  adjacent.getAttribute('POSITION')!.setArray(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 0]));
  f.node('Adjacent', adjacent);
  const alternative = f.doc.createScene('Alternative');
  const alternateNode = f.node('Same coordinates in another scene');
  f.scene.removeChild(alternateNode);
  alternative.addChild(alternateNode);

  const report = analyzeDrawDiagnostics(f.doc);

  expect(report.currentDraws).toBe(3);
  expect(report.observations?.coplanarParts.candidatePairs).toBe(0);
});

test('draw estimates count each scene placement without moving geometry across shared entry points', () => {
  const f = fixture();
  const shared = f.node('Shared');
  shared.addChild(f.node('DetailA').setTranslation([0, 2, 0]));
  shared.addChild(f.node('DetailB').setTranslation([0, 4, 0]));
  f.node('OnlyFirstScene').setTranslation([4, 0, 0]);
  f.doc.createScene('Alternative').addChild(shared);

  const report = analyzeDrawDiagnostics(f.doc);

  expect(report.currentDraws).toBe(7);
  expect(report.mergeEstimate).toMatchObject({ draws: 5, saved: 2 });
  const anchors = report.anchors!.items.filter((a) => a.name === 'Shared');
  expect(anchors).toHaveLength(2);
  expect(new Set(anchors.map((a) => a.id)).size).toBe(2);
  for (const anchor of anchors) expect(anchor).toMatchObject({ draws: 3, afterRigidMerge: 2 });
});
