import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';

import { keyMaterialsByProjection } from '../src/projection-cache-key.mjs';

function scene() {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial();
  root.add(new THREE.Mesh(new THREE.BufferGeometry(), shared));
  root.add(new THREE.Mesh(new THREE.BufferGeometry(), [shared, new THREE.MeshBasicMaterial()]));
  return { root, materials: [shared, root.children[1].material[1]] };
}

const ortho = new THREE.OrthographicCamera();
const persp = new THREE.PerspectiveCamera();

describe('keyMaterialsByProjection', () => {
  // three's material cache key ignores the camera, and the node material compiles
  // positionViewDirection from the first camera that draws it: a constant for an orthographic
  // camera, per-fragment for a perspective one. A program cache key that names the projection
  // makes a perspective draw after an orthographic one compile its own program.
  it('gives each projection its own program cache key', () => {
    const { root, materials } = scene();
    const base = materials.map((m) => m.customProgramCacheKey());
    keyMaterialsByProjection(root, ortho);
    const orthoKeys = materials.map((m) => m.customProgramCacheKey());
    keyMaterialsByProjection(root, persp);
    const perspKeys = materials.map((m) => m.customProgramCacheKey());
    materials.forEach((_, i) => {
      assert.notEqual(orthoKeys[i], perspKeys[i]);
      assert.ok(orthoKeys[i].startsWith(base[i]));
      assert.ok(perspKeys[i].startsWith(base[i]));
    });
  });

  it('marks a material for update only when the projection changes', () => {
    const { root, materials } = scene();
    keyMaterialsByProjection(root, ortho);
    const afterFirst = materials.map((m) => m.version);
    keyMaterialsByProjection(root, new THREE.OrthographicCamera());
    assert.deepEqual(
      materials.map((m) => m.version),
      afterFirst,
    );
    keyMaterialsByProjection(root, persp);
    materials.forEach((m, i) => assert.ok(m.version > afterFirst[i]));
  });

  it('keys a perspective draw the same whether or not an orthographic one came first', () => {
    const a = scene();
    const b = scene();
    keyMaterialsByProjection(a.root, persp);
    keyMaterialsByProjection(b.root, ortho);
    keyMaterialsByProjection(b.root, persp);
    assert.deepEqual(
      a.materials.map((m) => m.customProgramCacheKey()),
      b.materials.map((m) => m.customProgramCacheKey()),
    );
  });
});
