/**
 * Fixes for the defects measured by the primitives audit
 * (docs/reviews/2026-11-18-primitives-audit.md, `scripts/audit-primitives.ts`).
 * Each block reproduces the audit's measurement for one issue.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { createStairs } from '../primitives';
import { analyzeFlushFaces } from '../qa/flush-faces';

/** A material with a texture: the flush-face check reports every depth tie between its faces. */
function textured(): THREE.Material {
  const texture = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) found.push(node as THREE.Mesh);
  });
  return found;
}

function bounds(object: THREE.Object3D): number[] {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return [...box.min.toArray(), ...box.max.toArray()].map((v) => Math.round(v * 1e6) / 1e6 + 0);
}

describe('createStairs risers stop under their treads (#403)', () => {
  test('an ascending flight with a textured material has no flush pair, and its bounds stay put', () => {
    const { root } = createStairs('S', textured(), { totalRise: 2, totalRun: 3, width: 1 });
    const report = analyzeFlushFaces(root);
    expect(report.pairs.map((pair) => pair.parts.join(' / '))).toEqual([]);
    expect(bounds(root)).toEqual([0, 0, -0.5, 3, 2, 0.5]);
    expect(meshes(root)).toHaveLength(16);
  });

  test('a single step reports no shared area, and each riser ends at its tread underside', () => {
    const { root } = createStairs('S', textured(), {
      steps: 1,
      totalRise: 0.2,
      totalRun: 0.3,
      width: 1,
    });
    expect(analyzeFlushFaces(root).pairs).toEqual([]);
    const riser = root.getObjectByName('Mesh_SRiser1')!;
    const tread = root.getObjectByName('Mesh_SStep1')!;
    const [, riserMinY, , , riserMaxY] = bounds(riser);
    const [, treadMinY] = bounds(tread);
    expect(riserMinY).toBe(0);
    expect(riserMaxY).toBeCloseTo(treadMinY!, 6);
    expect(bounds(root)).toEqual([0, 0, -0.5, 0.3, 0.2, 0.5]);
  });

  test('a step rise at or below treadThickness builds treads only', () => {
    for (const totalRise of [0.8, 0.4]) {
      const { root, steps } = createStairs('S', textured(), {
        steps: 10,
        totalRise,
        totalRun: 3,
        width: 1,
      });
      expect(steps).toHaveLength(10);
      expect(meshes(root).filter((mesh) => mesh.name.includes('Riser')).length).toBe(0);
      expect(analyzeFlushFaces(root).pairs.length).toBe(0);
    }
    // 0.54 / 9 - 0.06 rounds to 7e-18 above zero: no sliver riser either.
    const { root } = createStairs('S', textured(), {
      steps: 9,
      totalRise: 0.54,
      totalRun: 3,
      width: 1,
      treadThickness: 0.06,
    });
    expect(meshes(root).filter((mesh) => mesh.name.includes('Riser')).length).toBe(0);
  });

  test('descending flights and riser: false keep their full-height layout', () => {
    const down = createStairs('S', textured(), {
      totalRise: -2,
      totalRun: -3,
      width: 1,
      axis: 'z',
    }).root;
    const riser = down.getObjectByName('Mesh_SRiser1')!;
    const [, minY, , , maxY] = bounds(riser);
    expect(maxY! - minY!).toBeCloseTo(0.25, 6);
    expect(analyzeFlushFaces(down).pairs).toEqual([]);
    const plain = createStairs('S', textured(), {
      totalRise: 2,
      totalRun: 3,
      width: 1,
      riser: false,
    }).root;
    expect(meshes(plain)).toHaveLength(8);
  });
});
