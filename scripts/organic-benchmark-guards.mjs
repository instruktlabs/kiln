/**
 * Guards for organic benchmark after-lane programs (deterministic mesh checks).
 */
import * as THREE from 'three';

import { executeKilnCode } from '../src/render.ts';
import { summarizeAxisAlignedFacets } from '../src/qa/axis-aligned-facet.ts';

/** World-space bounds for seahorse after @ 60e8bf9 (pre-metaball-bloat regression). */
export const SEAHORSE_REFERENCE_BBOX = Object.freeze({
  min: [-0.02927674725651741, 0.030552510172128677, -0.041600871831178665],
  max: [0.029542306438088417, 0.3931913375854492, 0.15709881484508514],
});

const BBOX_GROWTH_LIMIT = 1.15;
const PLANAR_AREA_FRACTION_LIMIT = 0.1;

export function worldBounds(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
  });
  return box;
}

export function assertBboxWithinReference(actual, reference, limit = BBOX_GROWTH_LIMIT) {
  const aSize = actual.getSize(new THREE.Vector3());
  const rMin = new THREE.Vector3(...reference.min);
  const rMax = new THREE.Vector3(...reference.max);
  const rSize = rMax.clone().sub(rMin);
  for (const axis of ['x', 'y', 'z']) {
    const ratio = aSize[axis] / rSize[axis];
    if (ratio > limit) {
      throw new Error(
        `bounding box ${axis} grew ${(ratio * 100).toFixed(1)}% of reference (limit ${limit * 100}%)`,
      );
    }
  }
}

const IMPLICIT_LIKE_PART = /Head|Snout|metaball|implicit/i;

export function assertNoLargeAxisAlignedFacets(root, fraction = PLANAR_AREA_FRACTION_LIMIT) {
  const hits = [];
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    if (!IMPLICIT_LIKE_PART.test(node.name || '')) return;
    const summary = summarizeAxisAlignedFacets(node.geometry, fraction);
    if (summary) hits.push({ name: node.name, axis: summary.axis, fraction: summary.areaFraction });
  });
  if (hits.length) {
    const detail = hits
      .map((h) => `${h.name} ${h.axis} ${(h.fraction * 100).toFixed(1)}%`)
      .join('; ');
    throw new Error(`large axis-aligned facets (implicit clip suspect): ${detail}`);
  }
}

export async function assertSeahorseAfterGuards(kilnSource) {
  const { root } = await executeKilnCode(kilnSource);
  assertBboxWithinReference(worldBounds(root), SEAHORSE_REFERENCE_BBOX);
  assertNoLargeAxisAlignedFacets(root);
  return root;
}
