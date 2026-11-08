import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { lathe, revolveGeo } from '../ops';

/**
 * Regression: three.js LatheGeometry before r187 left the final profile ring's
 * normals un-normalised at the length of the last profile segment, which the
 * glTF validator rejects (GLTF_ACCESSOR_VECTOR3_NON_UNIT). Found by a
 * dispatched agent's espresso machine: 15 of 105 vertices per saucer, length
 * 0.030017. three r187 normalises that ring; `lathe` and `revolveGeo` keep
 * their own pass, so their guarantee does not depend on the three version.
 */
function nonUnitNormals(geo: THREE.BufferGeometry): number {
  const n = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) throw new Error('geometry has no normal attribute');
  let bad = 0;
  for (let i = 0; i < n.count; i++) {
    const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    if (!Number.isFinite(len) || Math.abs(len - 1) > 1e-4) bad++;
  }
  return bad;
}

// The saucer that actually failed, to the millimetre.
const SAUCER: Array<[number, number]> = [
  [0.0, 0.0],
  [0.055, 0.0],
  [0.058, 0.004],
  [0.056, 0.009],
  [0.03, 0.009],
];

describe('lathe normals', () => {
  test('raw LatheGeometry returns unit normals since three r187', () => {
    const points = SAUCER.map((p) => new THREE.Vector2(p[0], p[1]));
    expect(nonUnitNormals(new THREE.LatheGeometry(points, 14))).toBe(0);
  });

  test('lathe returns unit normals', () => {
    expect(nonUnitNormals(lathe(SAUCER, 14))).toBe(0);
  });

  test('revolveGeo returns unit normals, on a partial sweep and an off-Y axis', () => {
    expect(nonUnitNormals(revolveGeo(SAUCER, { segments: 14 }))).toBe(0);
    expect(nonUnitNormals(revolveGeo(SAUCER, { segments: 14, angle: Math.PI }))).toBe(0);
    expect(nonUnitNormals(revolveGeo(SAUCER, { segments: 14, axis: [1, 0, 0] }))).toBe(0);
  });
});
