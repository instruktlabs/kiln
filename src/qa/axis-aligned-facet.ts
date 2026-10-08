import * as THREE from 'three';

import type { QaFinding } from './types';

/** Fraction of mesh area in one axis-aligned direction above which clipping is suspected. */
export const AXIS_ALIGNED_FACET_AREA_FRACTION = 0.1;

const AXIS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

const AXIS_LABEL = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

export interface AxisAlignedFacetSummary {
  node: string;
  axis: string;
  areaFraction: number;
  totalArea: number;
}

export function summarizeAxisAlignedFacets(
  geometry: THREE.BufferGeometry,
  areaFractionThreshold = AXIS_ALIGNED_FACET_AREA_FRACTION,
): AxisAlignedFacetSummary | undefined {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return undefined;

  const index = geometry.getIndex();
  const areas = new Array(AXIS.length).fill(0);
  let total = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const triCount = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3)! : t * 3;
    const i1 = index ? index.getX(t * 3 + 1)! : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2)! : t * 3 + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    const area = normal.length() * 0.5;
    if (!(area > 0)) continue;
    normal.divideScalar(area * 2);
    total += area;
    for (let k = 0; k < AXIS.length; k++) {
      const axis = AXIS[k]!;
      const dot = Math.abs(normal.x * axis[0] + normal.y * axis[1] + normal.z * axis[2]);
      if (dot > 0.985) areas[k] += area;
    }
  }

  if (!(total > 0)) return undefined;
  let best = 0;
  let bestIdx = -1;
  for (let k = 0; k < areas.length; k++) {
    if (areas[k]! > best) {
      best = areas[k]!;
      bestIdx = k;
    }
  }
  const fraction = best / total;
  if (bestIdx < 0 || fraction < areaFractionThreshold) return undefined;
  return {
    node: '',
    axis: AXIS_LABEL[bestIdx]!,
    areaFraction: fraction,
    totalArea: total,
  };
}

export function inspectAxisAlignedFacets(scene: unknown): QaFinding[] {
  const findings: QaFinding[] = [];
  if (!(scene instanceof THREE.Object3D)) return findings;

  scene.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    const summary = summarizeAxisAlignedFacets(node.geometry);
    if (!summary) return;
    findings.push({
      code: 'IMPLICIT_BOUNDS_CLIP_SUSPECT',
      disposition: 'warn',
      dimension: 'exportIntegrity',
      profile: 'geometry.implicit',
      affected: { node: node.name || node.type },
      message:
        `${Math.round(summary.areaFraction * 100)}% of mesh area faces ${summary.axis}; ` +
        'large axis-aligned facets often indicate an implicit/metaball field clipped by its bounds box.',
      measurement: {
        name: 'axisAlignedAreaFraction',
        actual: summary.areaFraction,
        threshold: AXIS_ALIGNED_FACET_AREA_FRACTION,
      },
    });
  });
  return findings;
}
