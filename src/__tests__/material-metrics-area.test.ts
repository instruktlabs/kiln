import { expect, test } from 'bun:test';
import { Document } from '@gltf-transform/core';
import { collectMaterialMetricsV1 } from '../material-metrics';

/**
 * Surface area sums every triangle of every mesh node in world space. Reading each accessor
 * in place (issue #431) must give the exact same doubles as transforming a tuple per vertex,
 * including projective matrices, non-indexed and indexed primitives, a partial trailing
 * triangle, an index past the vertex buffer and non-triangle primitives.
 */
function metricsDocument(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = new Float32Array([
    0, 0, 0, 1.3, 0.1, 0, 0.2, 2.1, 0.3, 1.7, 1.9, -0.4, -0.6, 0.8, 1.1, 0.9, -1.2, 0.5,
  ]);
  const position = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer);
  const opaque = doc.createMaterial('Opaque');
  const glass = doc.createMaterial('Glass').setAlphaMode('BLEND');
  const indexed = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 2, 1, 3, 3, 4, 5, 0, 5]))
        .setBuffer(buffer),
    )
    .setMaterial(opaque);
  const flat = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(glass);
  const lines = doc.createPrimitive().setAttribute('POSITION', position).setMode(1);
  const mesh = doc.createMesh('Body').addPrimitive(indexed).addPrimitive(flat).addPrimitive(lines);
  const parent = doc
    .createNode('Parent')
    .setTranslation([0.3, -1.1, 2.4])
    .setRotation([0.1, 0.2, -0.3, 0.9273618495495703])
    .setScale([1.7, 0.6, -2.2]);
  parent.addChild(doc.createNode('Child').setMesh(mesh).setTranslation([-0.4, 0.25, 0.125]));
  const skewed = doc
    .createNode('Skewed')
    .setMesh(mesh)
    .setMatrix([
      1.1, 0.2, -0.3, 0.01, 0.4, 0.9, 0.05, -0.02, -0.2, 0.3, 1.4, 0.03, 0.5, -0.7, 0.2, 1.05,
    ]);
  const broken = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 9]))
        .setBuffer(buffer),
    )
    .setMaterial(opaque);
  const brokenNode = doc
    .createNode('Broken')
    .setMesh(doc.createMesh('Broken').addPrimitive(broken));
  doc.createScene('Scene').addChild(parent).addChild(skewed);
  doc.createScene('Other').addChild(brokenNode);
  return doc;
}

test('surface areas keep their exact values', () => {
  const metrics = collectMaterialMetricsV1(metricsDocument());
  expect([
    metrics.totalSurfaceArea,
    metrics.blendedSurfaceArea,
    metrics.blendedSurfaceAreaRatio,
    metrics.blendedMaterialAreas,
  ]).toEqual(EXPECTED);
});

test('a document without the broken primitive keeps exact finite areas', () => {
  const doc = metricsDocument();
  for (const scene of doc.getRoot().listScenes()) if (scene.getName() === 'Other') scene.dispose();
  const metrics = collectMaterialMetricsV1(doc);
  expect([metrics.totalSurfaceArea, metrics.blendedSurfaceArea]).toEqual(EXPECTED_FINITE);
});

// Recorded from the per-vertex tuple implementation before #431 changed it. The index past
// the vertex buffer makes one triangle, and so the total, NaN.
const EXPECTED = [
  Number.NaN,
  11.93609156298767,
  0,
  [{ name: 'Glass', area: 11.93609156298767, ratio: Number.NaN }],
];
const EXPECTED_FINITE = [27.517040492474607, 11.93609156298767];
