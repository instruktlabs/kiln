/**
 * Move 1 — bake-time material consolidation (the opt-in `optimize` pass).
 *
 * Covers the pass's load-bearing guarantees:
 *   - palette collapses many distinct flat materials -> ~1 and lifts the grade
 *   - the grade is recomputed on the OPTIMIZED document
 *   - `full` auto-degrades to `palette` when the asset is animated (rig-safe)
 *   - transparency is never flattened into opaque (glass stays its own material)
 *   - prune keeps named pivots (Kiln City behaviors target createPivot Joint_ by name)
 *   - `optimize='off'` is byte-stable (deterministic, no consolidation)
 *   - optimizeGlbBytes() does the same pass web-side from finished bytes
 */
import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  createRoot,
  createPart,
  createInstance,
  createPivot,
  boxGeo,
  gameMaterial,
  glassMaterial,
} from '../primitives';
import { renderSceneToGLB, optimizeGlbBytes } from '../render';
import { WebIO } from '@gltf-transform/core';

/** A distinct flat color per index (HSL hue sweep — guaranteed unique materials). */
const hue = (i: number, n: number): number => new THREE.Color().setHSL(i / n, 0.7, 0.5).getHex();

/** A scene with N distinct flat-color opaque materials on N boxes. */
function manyColorScene(n: number): THREE.Object3D {
  const root = createRoot('Palette');
  for (let i = 0; i < n; i++) {
    createPart(`Box${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, n)), {
      position: [i * 1.5, 0, 0],
      parent: root,
    });
  }
  return root;
}

async function nodeNamesOf(bytes: Uint8Array): Promise<Set<string>> {
  const doc = await new WebIO().readBinary(bytes);
  return new Set(
    doc
      .getRoot()
      .listNodes()
      .map((nd) => nd.getName())
      .filter(Boolean),
  );
}

describe('optimize=off (byte-stable)', () => {
  it('omitting optimize and optimize:"off" are byte-identical, and deterministic', async () => {
    const a = await renderSceneToGLB(manyColorScene(6));
    const b = await renderSceneToGLB(manyColorScene(6), { optimize: 'off' });
    expect(a.optimize).toBeUndefined();
    expect(b.optimize).toBeUndefined();
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});

describe('optimize=palette (material collapse)', () => {
  it('collapses many distinct flat materials to ~1 and lifts the grade', async () => {
    const before = await renderSceneToGLB(manyColorScene(14));
    expect(before.instanceability!.grade).toBe('F'); // 14 materials

    const after = await renderSceneToGLB(manyColorScene(14), { optimize: 'palette' });
    expect(after.optimize).toBeDefined();
    expect(after.optimize!.mode).toBe('palette');
    expect(after.optimize!.materialsBefore).toBe(14);
    expect(after.optimize!.materialsAfter).toBeLessThan(after.optimize!.materialsBefore);
    expect(after.optimize!.materialsAfter).toBeLessThanOrEqual(2);
    // The recorded grade reflects the OPTIMIZED document.
    expect(['A', 'B']).toContain(after.instanceability!.grade);
    expect(after.instanceability!.metrics.uniqueMaterials).toBe(after.optimize!.materialsAfter);
  });

  it('keeps transparency separate — glass is never merged into opaque', async () => {
    const root = createRoot('Glassy');
    for (let i = 0; i < 8; i++) {
      createPart(`Wall${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, 8)), {
        position: [i * 1.5, 0, 0],
        parent: root,
      });
    }
    createPart('Window', boxGeo(1, 1, 0.05), glassMaterial(0x88ccff, { opacity: 0.4 }), {
      position: [0, 2, 0],
      parent: root,
    });

    const after = await renderSceneToGLB(root, { optimize: 'palette' });
    // At least one transparent material survives (opaque palette + the glass slot).
    expect(after.instanceability!.metrics.transparentMaterials).toBeGreaterThanOrEqual(1);
  });

  it('keeps named pivots (Kiln City behaviors target createPivot Joint_ by name)', async () => {
    const root = createRoot('Rig');
    // A named pivot carrying a moving part (the realistic Kiln City case)...
    const lid = createPivot('Lid', [0, 1, 0], root);
    createPart('LidPanel', boxGeo(0.9, 0.1, 0.9), gameMaterial(0x886644), {
      position: [0, 0.2, 0],
      parent: lid,
    });
    // ...and a named empty pivot (a leaf the behavior could still reference).
    createPivot('Marker', [0, 2, 0], root);
    // Pad with distinct materials so palette actually runs.
    for (let i = 0; i < 8; i++) {
      createPart(`Body${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, 8)), {
        position: [i * 1.5, -2, 0],
        parent: root,
      });
    }

    const after = await renderSceneToGLB(root, { optimize: 'palette' });
    const names = await nodeNamesOf(after.bytes);
    expect(names.has('Joint_Lid')).toBe(true);
    expect(names.has('Joint_Marker')).toBe(true);
  });
});

describe('optimize=full (static-only; auto-degrade on animation)', () => {
  it('auto-degrades to palette when the asset is animated', async () => {
    const root = createRoot('Spinner');
    const hub = createPivot('Spin', [0, 1, 0], root);
    for (let i = 0; i < 8; i++) {
      createPart(`Blade${i}`, boxGeo(0.2, 0.05, 1.2), gameMaterial(hue(i, 8)), {
        position: [0, 0, 0],
        parent: hub,
      });
    }
    // Identity, then a quarter turn about Y: (0, sin 45deg, 0, cos 45deg). `Math.SQRT1_2`
    // rather than 0.7071 -- exact, and it says which angle this is.
    const track = new THREE.QuaternionKeyframeTrack(
      'Joint_Spin.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
    );
    const clip = new THREE.AnimationClip('spin', 1, [track]);

    const after = await renderSceneToGLB(root, { optimize: 'full', clips: [clip] });
    expect(after.optimize).toBeDefined();
    // full requested, but animated -> degrades to palette (rig stays intact).
    expect(after.optimize!.mode).toBe('palette');
    const names = await nodeNamesOf(after.bytes);
    expect(names.has('Joint_Spin')).toBe(true);
  });
});

describe('optimizeGlbBytes (web-side path)', () => {
  it('consolidates a finished GLB from its bytes and re-grades it', async () => {
    const baked = await renderSceneToGLB(manyColorScene(14)); // un-optimized, grade F
    expect(baked.instanceability!.grade).toBe('F');

    const opt = await optimizeGlbBytes(baked.bytes, { mode: 'palette', category: 'prop' });
    expect(opt).toBeDefined();
    expect(opt!.summary!.materialsAfter).toBeLessThan(opt!.summary!.materialsBefore);
    expect(['A', 'B']).toContain(opt!.report!.grade);
    // The returned bytes are a valid GLB.
    const names = await nodeNamesOf(opt!.bytes);
    expect(names.size).toBeGreaterThan(0);
  });

  it('returns undefined on unparseable bytes (caller keeps the original)', async () => {
    expect(await optimizeGlbBytes(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });

  it('an instanced scene keeps shared geometry through consolidation', async () => {
    const root = createRoot('Fence');
    const post = createPart('Post0', boxGeo(0.1, 1, 0.1), gameMaterial(0x8a5a2b), {
      position: [0, 0.5, 0],
      parent: root,
    });
    for (let i = 1; i < 10; i++)
      createInstance(`Post${i}`, post, { position: [i * 0.5, 0.5, 0], parent: root });
    const baked = await renderSceneToGLB(root);
    expect(baked.instanceability!.metrics.uniqueGeometries).toBe(1);
    const opt = await optimizeGlbBytes(baked.bytes, { mode: 'palette' });
    expect(opt!.report!.metrics.uniqueGeometries).toBe(1); // instancing preserved
  });
});

describe('optimize=auto (grade-aware, the default grade-lift lever)', () => {
  it('consolidates a material-sprawl asset (>= PALETTE_MIN) and lifts the grade', async () => {
    const after = await renderSceneToGLB(manyColorScene(14), { optimize: 'auto' });
    expect(after.optimize).toBeDefined();
    expect(after.optimize!.mode).toBe('palette');
    expect(after.optimize!.materialsAfter).toBeLessThanOrEqual(2);
    expect(['A', 'B']).toContain(after.instanceability!.grade);
  });

  it('consolidates a 4-material asset (grade C floor) to grade B or better', async () => {
    const before = await renderSceneToGLB(manyColorScene(4));
    expect(before.instanceability!.grade).toBe('C'); // 4 materials — first C count

    const after = await renderSceneToGLB(manyColorScene(4), { optimize: 'auto' });
    expect(after.optimize).toBeDefined();
    expect(after.optimize!.mode).toBe('palette');
    expect(after.optimize!.materialsBefore).toBe(4);
    expect(after.optimize!.materialsAfter).toBeLessThanOrEqual(3);
    expect(['A', 'B']).toContain(after.instanceability!.grade);
  });

  it('is a byte-stable no-op on a lean asset (< PALETTE_MIN materials)', async () => {
    const off = await renderSceneToGLB(manyColorScene(3), { optimize: 'off' });
    const auto = await renderSceneToGLB(manyColorScene(3), { optimize: 'auto' });
    expect(auto.optimize).toBeUndefined();
    expect(Buffer.from(off.bytes).equals(Buffer.from(auto.bytes))).toBe(true);
  });

  it('optimizeGlbBytes mode:auto consolidates a heavy GLB and skips a lean one', async () => {
    const heavy = await renderSceneToGLB(manyColorScene(14));
    const opt = await optimizeGlbBytes(heavy.bytes, { mode: 'auto' });
    expect(opt).toBeDefined();
    expect(['A', 'B']).toContain(opt!.report!.grade);

    const lean = await renderSceneToGLB(manyColorScene(3));
    expect(await optimizeGlbBytes(lean.bytes, { mode: 'auto' })).toBeUndefined();
  });
});
