/**
 * Wave 1B: instancing primitives + gltf-transform dedup end-to-end.
 *
 * Verifies that a 4-wheel vehicle built with createInstance produces a
 * meaningfully smaller GLB than the naive "4 separate createPart calls"
 * version, confirming geometry + material reuse survives the export path.
 */

import { describe, it, expect } from 'bun:test';
import type { InstancedMesh } from '@gltf-transform/extensions';
import * as THREE from 'three';
import {
  createRoot,
  createPart,
  createInstance,
  cylinderGeo,
  boxGeo,
  gameMaterial,
  planeGeo,
} from '../primitives';
import { createGltfIO } from '../gltf-io';
import { gradeGlbBytes, optimizeGlbBytes, renderSceneToGLB } from '../render';
import {
  REVIEW_DIRECTIONS,
  drawnFaces,
  facesDifference,
  loadThreeScene,
  wronglyWoundInstances,
} from './helpers/three-winding';

describe('Wave 1B: instancing primitives', () => {
  it('direct references share geometry and material between parts', () => {
    const geo = boxGeo(1, 1, 1);
    const mat = gameMaterial(0xff0000);
    const a = createPart('A', geo, mat) as THREE.Mesh;
    const b = createPart('B', geo, mat) as THREE.Mesh;
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).toBe(b.material);
  });

  it('createInstance reuses geometry and material of source', () => {
    const root = createRoot('Truck');
    const wheelGeo = cylinderGeo(0.4, 0.4, 0.2, 12);
    const rubber = gameMaterial(0x1a1a1a);
    const fl = createPart('WheelFL', wheelGeo, rubber, {
      position: [-0.8, 0.3, 1.2],
      parent: root,
    });
    const fr = createInstance('WheelFR', fl, {
      position: [0.8, 0.3, 1.2],
      parent: root,
    });

    expect(fr).toBeInstanceOf(THREE.Mesh);
    expect((fr as THREE.Mesh).geometry).toBe((fl as THREE.Mesh).geometry);
    expect((fr as THREE.Mesh).material).toBe((fl as THREE.Mesh).material);
    expect(fr.parent).toBe(root);
  });

  it('createInstance from a pivot reuses the first Mesh child', () => {
    const root = createRoot('Scene');
    const pivot = createPart('Head', boxGeo(0.5, 0.5, 0.5), gameMaterial(0xffcc66), {
      pivot: true,
      parent: root,
    });
    const copy = createInstance('Head2', pivot, { position: [2, 0, 0], parent: root });
    const sourceMesh = pivot.children[0] as THREE.Mesh;
    expect((copy as THREE.Mesh).geometry).toBe(sourceMesh.geometry);
  });

  it('createInstance throws when source has no Mesh', () => {
    const empty = new THREE.Object3D();
    expect(() => createInstance('Bad', empty)).toThrow(/no Mesh/);
  });

  // A 4-wheel vehicle built three ways:
  //   1. instanced  — one geometry shared via createInstance
  //   2. independent — four fresh createPart calls with identical geo/mat
  //   3. raw-indep   — same as (2) but with dedup disabled on export
  // Ref-sharing via createInstance produces an optimal GLB without needing
  // dedup. dedup() catches agents who forget to use createInstance and
  // reaches the same optimum post-hoc. Both confirm the instancing path
  // beats naive authoring when dedup is off.
  it('instancing + dedup cuts 4-wheel GLB to ~1/3.5 of naive', async () => {
    const buildInstanced = () => {
      const r = createRoot('Instanced');
      const wg = cylinderGeo(0.4, 0.4, 0.2, 16);
      const rm = gameMaterial(0x1a1a1a);
      const fl = createPart('WheelFL', wg, rm, { position: [-0.8, 0.3, 1.2], parent: r });
      createInstance('WheelFR', fl, { position: [0.8, 0.3, 1.2], parent: r });
      createInstance('WheelRL', fl, { position: [-0.8, 0.3, -1.2], parent: r });
      createInstance('WheelRR', fl, { position: [0.8, 0.3, -1.2], parent: r });
      return r;
    };
    const buildIndependent = () => {
      const r = createRoot('Independent');
      const coords: Array<[number, number]> = [
        [-0.8, 1.2],
        [0.8, 1.2],
        [-0.8, -1.2],
        [0.8, -1.2],
      ];
      coords.forEach(([x, z], i) => {
        createPart(`W${i}`, cylinderGeo(0.4, 0.4, 0.2, 16), gameMaterial(0x1a1a1a), {
          position: [x, 0.3, z],
          parent: r,
        });
      });
      return r;
    };

    const instanced = await renderSceneToGLB(buildInstanced());
    const rawIndep = await renderSceneToGLB(buildIndependent(), { dedup: false });
    const dedupedIndep = await renderSceneToGLB(buildIndependent());

    // Raw (no dedup, no instancing): ~4x the size.
    expect(instanced.bytes.byteLength).toBeLessThan(rawIndep.bytes.byteLength * 0.5);
    // Dedup catches the redundancy even without createInstance.
    expect(dedupedIndep.bytes.byteLength).toBeLessThan(rawIndep.bytes.byteLength * 0.5);
  });

  it('dedup: false disables the transform', async () => {
    const root = createRoot('R');
    // Two *separate* box geos with same shape — dedup should merge them,
    // dedup:false should preserve both.
    createPart('A', boxGeo(1, 1, 1), gameMaterial(0xff0000), {
      position: [0, 0, 0],
      parent: root,
    });
    createPart('B', boxGeo(1, 1, 1), gameMaterial(0xff0000), {
      position: [2, 0, 0],
      parent: root,
    });

    const withDedup = await renderSceneToGLB(root);
    const withoutDedup = await renderSceneToGLB(root, { dedup: false });
    expect(withDedup.bytes.byteLength).toBeLessThan(withoutDedup.bytes.byteLength);
  });
});

// ── M1c: the GPU-instancing pass (EXT_mesh_gpu_instancing) ────────────────────
// Perf/filesize only — the A–F grade keys on material count and must NOT move.

/** A fence run: `count` posts sharing one geometry/material via createInstance,
 *  plus a ground slab so the asset has a second, un-instanced mesh. */
function fenceScene(count: number, opts: { jointPivot?: boolean } = {}): THREE.Object3D {
  const r = createRoot('Fence');
  createPart('Ground', boxGeo(count * 1.2, 0.1, 2), gameMaterial(0x777788), {
    position: [0, -0.05, 0],
    parent: r,
  });
  const post = createPart('Post0', boxGeo(0.15, 1.2, 0.15), gameMaterial(0x8a5a2b), {
    position: [0, 0.6, 0],
    parent: r,
  });
  for (let i = 1; i < count; i++) {
    createInstance(`Post${i}`, post, { position: [i * 1.1, 0.6, 0], parent: r });
  }
  if (opts.jointPivot) {
    const j = new THREE.Object3D();
    j.name = 'Joint_Gate';
    r.add(j);
  }
  return r;
}

function glbJson(bytes: Uint8Array): { extensionsUsed?: string[] } {
  // GLB: 12-byte header, then chunk 0 header (length + 'JSON') + the JSON chunk.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
}

describe('M1c: GPU-instancing pass (instance option)', () => {
  it('instance:"on" emits EXT_mesh_gpu_instancing, cuts bytes+draws, keeps tris+grade', async () => {
    const plain = await renderSceneToGLB(fenceScene(10));
    const inst = await renderSceneToGLB(fenceScene(10), { instance: 'on' });

    expect(inst.instancing).toBeDefined();
    expect(inst.instancing!.batches).toBe(1);
    expect(inst.instancing!.instances).toBe(10);
    expect(inst.instancing!.drawsAfter).toBeLessThan(inst.instancing!.drawsBefore);
    expect(glbJson(inst.bytes).extensionsUsed).toContain('EXT_mesh_gpu_instancing');
    expect(glbJson(plain.bytes).extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing');
    // Smaller on the wire (10 node TRS records -> 1 batch + accessors).
    expect(inst.bytes.byteLength).toBeLessThan(plain.bytes.byteLength);
    // PERF ONLY: rendered-triangle total and the material-count grade are unchanged.
    expect(inst.instanceability!.metrics.triangles).toBe(plain.instanceability!.metrics.triangles);
    expect(inst.instanceability!.grade).toBe(plain.instanceability!.grade);
  });

  it('instance:"auto" acts only for role:"fill"', async () => {
    const fill = await renderSceneToGLB(fenceScene(10), { instance: 'auto', role: 'fill' });
    const prop = await renderSceneToGLB(fenceScene(10), { instance: 'auto', role: 'prop' });
    const none = await renderSceneToGLB(fenceScene(10), { instance: 'auto' });
    expect(fill.instancing).toBeDefined();
    expect(prop.instancing).toBeUndefined();
    expect(none.instancing).toBeUndefined();
  });

  it('below the min-node threshold nothing is batched', async () => {
    const few = await renderSceneToGLB(fenceScene(3), { instance: 'on' });
    expect(few.instancing).toBeUndefined();
    expect(glbJson(few.bytes).extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing');
  });

  it('animated docs and Joint_* pivots are never instanced', async () => {
    const spin = new THREE.VectorKeyframeTrack(
      'Mesh_Post0.position',
      [0, 1],
      [0, 0.6, 0, 0, 0.8, 0],
    );
    const clip = new THREE.AnimationClip('bob', 1, [spin]);
    const animated = await renderSceneToGLB(fenceScene(10), { instance: 'on', clips: [clip] });
    expect(animated.instancing).toBeUndefined();

    const rigged = await renderSceneToGLB(fenceScene(10, { jointPivot: true }), {
      instance: 'on',
    });
    expect(rigged.instancing).toBeUndefined();
  });

  it('an instanced GLB round-trips through gradeGlbBytes and optimizeGlbBytes', async () => {
    const inst = await renderSceneToGLB(fenceScene(10), { instance: 'on' });
    // Re-grade from bytes (the studio web-side path) — must read the extension,
    // not drop it, so tris match the logical (instanced-out) total.
    const report = await gradeGlbBytes(inst.bytes);
    expect(report).toBeDefined();
    expect(report!.metrics.triangles).toBe(inst.instanceability!.metrics.triangles);
  });

  it('optimizeGlbBytes can instance from bytes (web-tier finalize seam)', async () => {
    const plain = await renderSceneToGLB(fenceScene(10));
    const out = await optimizeGlbBytes(plain.bytes, {
      mode: 'off',
      instance: 'auto',
      role: 'fill',
    });
    expect(out).toBeDefined();
    expect(out!.instancing).toBeDefined();
    expect(out!.instancing!.instances).toBe(10);
    expect(out!.summary).toBeUndefined();
    expect(glbJson(out!.bytes).extensionsUsed).toContain('EXT_mesh_gpu_instancing');
    // And a NO-op call (off + non-fill role) keeps the original bytes.
    expect(
      await optimizeGlbBytes(plain.bytes, { mode: 'off', instance: 'auto', role: 'prop' }),
    ).toBeUndefined();
  });
});

// three.js picks the winding per object from matrixWorld, so one batch cannot hold both hands.
describe('M1c: mirrored copies under the GPU-instancing pass', () => {
  /** Single-sided panes: rotated, non-uniformly scaled, half of them mirrored on Z. */
  function paneScene(plain: number, mirrored: number): THREE.Object3D {
    const r = createRoot('Panes');
    const pane = createPart('Pane0', planeGeo(1, 2), gameMaterial(0x445566), {
      position: [0, 0, 0],
      parent: r,
    });
    for (let i = 1; i < plain; i++)
      createInstance(`Pane${i}`, pane, {
        position: [i * 2, 0, 0],
        rotation: [0, i * 20, 0],
        parent: r,
      });
    for (let i = 0; i < mirrored; i++)
      createInstance(`Mirror${i}`, pane, {
        position: [i * 2, 5, 1],
        rotation: [0, 180 + i * 15, i * 10],
        scale: [1.5, 0.75, -1],
        parent: r,
      });
    return r;
  }

  async function expectDrawnLikeUninstanced(build: () => THREE.Object3D) {
    const plain = await renderSceneToGLB(build(), { instance: 'off' });
    const inst = await renderSceneToGLB(build(), { instance: 'on' });
    expect(inst.instancing).toBeDefined();
    const plainScene = await loadThreeScene(plain.bytes);
    const instScene = await loadThreeScene(inst.bytes);
    expect(wronglyWoundInstances(instScene)).toBe(0);
    let compared = 0;
    for (const direction of REVIEW_DIRECTIONS) {
      const expected = drawnFaces(plainScene, direction);
      compared += expected.length;
      expect(facesDifference(drawnFaces(instScene, direction), expected)).toEqual({
        extra: 0,
        missing: 0,
      });
    }
    expect(compared).toBeGreaterThan(0);
    return inst;
  }

  it('a mirrored single-sided copy draws the same faces with instancing on and off', async () => {
    await expectDrawnLikeUninstanced(() => paneScene(6, 6));
  });

  it('too few mirrored copies to batch still draw the same', async () => {
    const inst = await expectDrawnLikeUninstanced(() => paneScene(6, 2));
    expect(inst.instancing!.instances).toBe(6);
  });

  it('handedness counts the whole world matrix, not the node scale alone', async () => {
    const build = () => {
      const r = paneScene(6, 0);
      const pane = r.children[0]!;
      const flipped = new THREE.Group();
      flipped.name = 'Flipped';
      flipped.scale.set(-1, 1, 1);
      flipped.position.set(0, 10, 0);
      r.add(flipped);
      // Mirrored through the parent alone, and mirrored twice back to right-handed.
      for (let i = 0; i < 6; i++)
        createInstance(`Parent${i}`, pane, { position: [i * 2, 0, 0], parent: flipped });
      for (let i = 0; i < 6; i++)
        createInstance(`Twice${i}`, pane, {
          position: [i * 2, 4, 0],
          scale: [1, 1, -1],
          parent: flipped,
        });
      return r;
    };
    await expectDrawnLikeUninstanced(build);
  });

  it('a copy that TRS cannot represent stays a plain node', async () => {
    const build = () => {
      const r = paneScene(6, 0);
      const pane = r.children[0]!;
      const stretched = new THREE.Group();
      stretched.name = 'Stretched';
      stretched.scale.set(1, 3, 1);
      stretched.position.set(0, 10, 0);
      r.add(stretched);
      // A rotated child under a non-uniform parent shears: instance TRS would straighten it.
      createInstance('Sheared', pane, { rotation: [0, 0, 40], parent: stretched });
      return r;
    };
    const inst = await expectDrawnLikeUninstanced(build);
    expect(inst.instancing!.instances).toBe(6);
  });

  // three r186's WebGPU instance node moves positions and normals but not TANGENT, so a turned
  // copy keeps its source tangent. At 90 degrees that lies along the normal and shades black.
  // A batch node's transform does reach the tangent, so it carries what the copies share.
  it('tangent-bearing copies batch per shared rotation, with the rotation on the node', async () => {
    const build = () => {
      const r = createRoot('Tangents');
      const geo = planeGeo(1, 2);
      geo.computeTangents();
      const source = createPart('Moved0', geo, gameMaterial(0x667788), { parent: r });
      for (let i = 1; i < 6; i++)
        createInstance(`Moved${i}`, source, {
          position: [i * 2, 0, 0],
          scale: i % 2 ? [2, 2, 2] : [1, 1, 1],
          parent: r,
        });
      for (let i = 0; i < 6; i++)
        createInstance(`Turned${i}`, source, {
          position: [i * 2, 4, 3],
          rotation: [0, 90, 0],
          scale: i % 2 ? [2, 2, 2] : [1, 1, 1],
          parent: r,
        });
      for (let i = 0; i < 6; i++)
        createInstance(`Stretched${i}`, source, {
          position: [i * 2, 8, 0],
          scale: [3, 1, 1],
          parent: r,
        });
      for (let i = 0; i < 6; i++)
        createInstance(`Mirrored${i}`, source, {
          position: [i * 2, 12, 0],
          rotation: [0, 30, 0],
          scale: [1, 1, -1],
          parent: r,
        });
      for (let i = 0; i < 4; i++)
        createInstance(`Varied${i}`, source, {
          position: [i * 2, 16, 0],
          rotation: [0, i * 40 + 15, 0],
          parent: r,
        });
      return r;
    };
    const inst = await expectDrawnLikeUninstanced(build);
    expect(inst.instancing).toMatchObject({ batches: 4, instances: 24 });
    const doc = await createGltfIO().readBinary(inst.bytes);
    for (const node of doc.getRoot().listNodes()) {
      const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
      if (!batch) continue;
      expect(batch.getAttribute('ROTATION')).toBeNull();
      const scale = batch.getAttribute('SCALE');
      for (let i = 0; i < (scale?.getCount() ?? 0); i++) {
        const [x, y, z] = scale!.getElement(i, [0, 0, 0]);
        expect(y).toBeCloseTo(x!, 5);
        expect(z).toBeCloseTo(x!, 5);
      }
    }
  });

  it('requires the extension, so a viewer without it refuses rather than drawing one copy', async () => {
    const inst = await renderSceneToGLB(paneScene(6, 6), { instance: 'on' });
    const json = glbJson(inst.bytes) as { extensionsRequired?: string[] };
    expect(json.extensionsRequired).toContain('EXT_mesh_gpu_instancing');
  });

  it('an optimizeGlbBytes pass honours handedness too', async () => {
    const plain = await renderSceneToGLB(paneScene(6, 6));
    const out = await optimizeGlbBytes(plain.bytes, { mode: 'off', instance: 'on' });
    const before = await loadThreeScene(plain.bytes);
    const after = await loadThreeScene(out!.bytes);
    expect(wronglyWoundInstances(after)).toBe(0);
    for (const direction of REVIEW_DIRECTIONS)
      expect(facesDifference(drawnFaces(after, direction), drawnFaces(before, direction))).toEqual({
        extra: 0,
        missing: 0,
      });
  });
});
