/**
 * Instanceability metrics + grader (Phase 0/1).
 *
 * Covers: post-dedup metric extraction from a baked Document, the empirical
 * dedup-merges-value-identical-materials question, the grade rubric (advisory),
 * and that render.meta carries the report.
 */

import { describe, it, expect } from 'bun:test';
import {
  createRoot,
  createPart,
  createInstance,
  cylinderGeo,
  boxGeo,
  gameMaterial,
  glassMaterial,
} from '../primitives';
import { renderSceneToGLB, renderGLB, gradeGlbBytes } from '../render';
import { collectGlbMetrics, gradeInstanceability, type InstanceabilityMetrics } from '../metrics';
import { Document } from '@gltf-transform/core';
import { EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { countTriangles } from '../primitives';

const baseMetrics = (over: Partial<InstanceabilityMetrics> = {}): InstanceabilityMetrics => ({
  uniqueGeometries: 1,
  uniqueMaterials: 1,
  meshNodes: 1,
  meshInstances: 1,
  drawCalls: 1,
  textureCount: 0,
  skinned: false,
  transparentMaterials: 0,
  triangles: 100,
  ...over,
});

describe('collectGlbMetrics (post-dedup)', () => {
  it('distinguishes mesh nodes, instance copies, materials and estimated primitive draws', () => {
    const doc = new Document();
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const material = doc.createMaterial();
    const triangle = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
    const mesh = doc.createMesh().addPrimitive(triangle);
    const ordinary = doc.createNode().setMesh(mesh);
    const copies = doc.createAccessor().setType('VEC3').setArray(new Float32Array(9));
    const instances = doc
      .createExtension(EXTMeshGPUInstancing)
      .createInstancedMesh()
      .setAttribute('TRANSLATION', copies);
    const instanced = doc
      .createNode()
      .setMesh(mesh)
      .setExtension('EXT_mesh_gpu_instancing', instances);
    const points = doc
      .createNode()
      .setMesh(
        doc
          .createMesh()
          .addPrimitive(
            doc
              .createPrimitive()
              .setMode(0)
              .setAttribute('POSITION', position)
              .setMaterial(material),
          ),
      );
    doc.createScene().addChild(ordinary).addChild(instanced).addChild(points);
    expect(collectGlbMetrics(doc)).toMatchObject({
      meshNodes: 3,
      meshInstances: 5,
      drawCalls: 3,
      uniqueMaterials: 1,
      uniqueGeometries: 2,
      triangles: 4,
    });
  });

  it('source triangle counts include active InstancedMesh copies and zero-count batches', () => {
    const root = new THREE.Group();
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
      5,
    );
    root.add(mesh);
    mesh.count = 3;
    expect(countTriangles(root)).toBe(36);
    mesh.count = 0;
    expect(countTriangles(root)).toBe(0);
  });
  it('an instanced 4-wheel scene reports 1 geometry, 1 material, 4 draw calls', async () => {
    const r = createRoot('Truck');
    const wg = cylinderGeo(0.4, 0.4, 0.2, 16);
    const rubber = gameMaterial(0x1a1a1a);
    const fl = createPart('WheelFL', wg, rubber, { position: [-0.8, 0.3, 1.2], parent: r });
    createInstance('WheelFR', fl, { position: [0.8, 0.3, 1.2], parent: r });
    createInstance('WheelRL', fl, { position: [-0.8, 0.3, -1.2], parent: r });
    createInstance('WheelRR', fl, { position: [0.8, 0.3, -1.2], parent: r });

    const scene = await renderSceneToGLB(r);
    const m = scene.instanceability?.metrics;
    expect(m).toBeDefined();
    expect(m!.uniqueGeometries).toBe(1);
    expect(m!.uniqueMaterials).toBe(1);
    expect(m!.drawCalls).toBe(4);
    expect(scene.instanceability!.grade).toBe('A');
  });

  it('records whether dedup() merges value-identical-but-independent materials', async () => {
    // Two distinct THREE materials with identical values (separate gameMaterial
    // calls) on two distinct geometries. This empirically answers the watch-item.
    const r = createRoot('Pair');
    createPart('A', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [0, 0, 0], parent: r });
    createPart('B', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [2, 0, 0], parent: r });

    const scene = await renderSceneToGLB(r);
    const mats = scene.instanceability!.metrics.uniqueMaterials;
    // dedup() compares materials structurally, so value-identical materials
    // collapse to 1. If this ever regresses to 2, Phase-2-bake material
    // unification (palette()) becomes worth wiring.
    expect(mats).toBe(1);
  });

  it('distinct-color materials are NOT merged', async () => {
    const r = createRoot('TwoColor');
    createPart('A', boxGeo(1, 1, 1), gameMaterial(0xff0000), { position: [0, 0, 0], parent: r });
    createPart('B', boxGeo(1, 1, 1), gameMaterial(0x00ff00), { position: [2, 0, 0], parent: r });
    const scene = await renderSceneToGLB(r);
    expect(scene.instanceability!.metrics.uniqueMaterials).toBe(2);
    expect(scene.instanceability!.grade).toBe('B');
  });

  it('a blended (glass) material marks transparentMaterials', async () => {
    const r = createRoot('Glassy');
    createPart('Pane', boxGeo(1, 1, 0.05), glassMaterial(0x88ccff, { opacity: 0.4 }), {
      position: [0, 0, 0],
      parent: r,
    });
    const scene = await renderSceneToGLB(r);
    expect(scene.instanceability!.metrics.transparentMaterials).toBeGreaterThanOrEqual(1);
  });
});

describe('gradeInstanceability (advisory rubric)', () => {
  it('1 material -> A', () => {
    expect(gradeInstanceability(baseMetrics()).grade).toBe('A');
  });
  it('2-3 materials -> B', () => {
    expect(gradeInstanceability(baseMetrics({ uniqueMaterials: 3 })).grade).toBe('B');
  });
  it('many materials -> F', () => {
    expect(gradeInstanceability(baseMetrics({ uniqueMaterials: 20 })).grade).toBe('F');
  });
  it('transparency caps an otherwise-A asset at C', () => {
    const r = gradeInstanceability(baseMetrics({ transparentMaterials: 1 }));
    expect(r.grade).toBe('C');
    expect(r.reasons.join(' ')).toMatch(/transparent/i);
  });
  it('skinned is NOT an automatic F and is noted', () => {
    const r = gradeInstanceability(baseMetrics({ skinned: true, uniqueMaterials: 1 }));
    expect(r.grade).toBe('A');
    expect(r.summary).toMatch(/skinned/);
    expect(r.reasons.join(' ')).toMatch(/clone-rendered/i);
  });
  it('texture sprawl demotes toward C', () => {
    const r = gradeInstanceability(baseMetrics({ uniqueMaterials: 1, textureCount: 6 }));
    expect(['C', 'D', 'F']).toContain(r.grade);
  });
  it('the summary is informational and names what set the grade', () => {
    // Nine materials set D; the glass does not, so it must not read as the cause.
    const r = gradeInstanceability(
      baseMetrics({
        uniqueMaterials: 9,
        transparentMaterials: 1,
        uniqueGeometries: 20,
        drawCalls: 30,
      }),
    );
    expect(r.grade).toBe('D');
    expect(r.summary).toBe(
      'D (informational, not a QA verdict), set by 9 distinct materials (D at 7-12). Also: 1 transparent material (lowers only A/B to C); 20 geometries; 30 draw calls.',
    );
    expect(r.reasons[0]).toBe('grade D set by 9 distinct materials (D at 7-12)');
  });
  it('a grade lowered by transparency or textures names that driver', () => {
    expect(gradeInstanceability(baseMetrics({ transparentMaterials: 1 })).summary).toBe(
      'C (informational, not a QA verdict), set by 1 transparent material (lowers A/B to C). Also: 1 distinct material (A at 0-1); 1 geometry; 1 draw call.',
    );
    const both = gradeInstanceability(
      baseMetrics({ uniqueMaterials: 2, transparentMaterials: 2, textureCount: 6, skinned: true }),
    );
    expect(both.summary).toBe(
      'C (informational, not a QA verdict), set by 2 transparent materials (lowers A/B to C) and 6 textures (over 4 lowers A/B to C). Also: 2 distinct materials (B at 2-3); 1 geometry; 1 draw call; skinned (clone-rendered, not penalized).',
    );
    expect(both.reasons[0]).toBe(
      'grade C set by 2 transparent materials (lowers A/B to C) and 6 textures (over 4 lowers A/B to C)',
    );
    expect(gradeInstanceability(baseMetrics({ uniqueMaterials: 5, textureCount: 6 })).summary).toBe(
      'C (informational, not a QA verdict), set by 5 distinct materials (C at 4-6). Also: 6 textures (over 4 lowers only A/B to C); 1 geometry; 1 draw call.',
    );
    expect(gradeInstanceability(baseMetrics({ uniqueMaterials: 13 })).summary).toStartWith(
      'F (informational, not a QA verdict), set by 13 distinct materials (F at 13+).',
    );
  });
});

describe('render.meta carries the instanceability report', () => {
  it('renderGLB merges instanceability into meta', async () => {
    const code = `
      const meta = { name: 'Box', category: 'prop' };
      function build() {
        const root = createRoot('Box');
        createPart('B', boxGeo(1, 1, 1), gameMaterial(0xff0000), { parent: root });
        return root;
      }
    `;
    const res = await renderGLB(code);
    expect(res.meta.instanceability).toBeDefined();
    expect(res.meta.instanceability!.grade).toBe('A');
    // tier is auto-filled to mirror the grade (M1d).
    expect(res.meta.tier).toBe('A');
    expect(res.meta.metricsError).toBeUndefined();
  });
});

describe('gradeGlbBytes (web-side path)', () => {
  it('grades a finished GLB from its bytes and derives triangles', async () => {
    const r = createRoot('Truck');
    const wg = cylinderGeo(0.4, 0.4, 0.2, 16);
    const rubber = gameMaterial(0x1a1a1a);
    const fl = createPart('WheelFL', wg, rubber, { position: [-0.8, 0.3, 1.2], parent: r });
    createInstance('WheelFR', fl, { position: [0.8, 0.3, 1.2], parent: r });
    const scene = await renderSceneToGLB(r);

    const report = await gradeGlbBytes(scene.bytes, { category: 'vehicle' });
    expect(report).toBeDefined();
    expect(report!.grade).toBe('A');
    expect(report!.metrics.triangles).toBeGreaterThan(0);
    expect(report!.metrics.drawCalls).toBe(2);
  });

  it('returns undefined on unparseable bytes', async () => {
    expect(await gradeGlbBytes(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });
});
