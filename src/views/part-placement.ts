import * as THREE from 'three';
import { createPartBoundsReader } from './raster';

type Vec3 = [number, number, number];

/** World placement of one listed part (`kiln_inspect` `listParts`). */
export interface PartPlacementV1 {
  /** World translation. */
  position: Vec3;
  /** World rotation as a unit quaternion [x, y, z, w]. */
  quaternion: [number, number, number, number];
  /**
   * World scale decomposed from the world matrix. A mirrored matrix carries its
   * reflection on x, as three.js decomposes it; a sheared world matrix (a
   * non-uniformly scaled parent over a rotated child) has no exact TRS form.
   */
  scale: Vec3;
  /** The world matrix has a negative determinant: the part is mirrored. */
  mirrored: boolean;
  /** World bounds of the visible geometry below the node, null when there is none. */
  bounds: { min: Vec3; max: Vec3 } | null;
}

/** Micrometre precision keeps a listing page small; -0 prints as 0. */
const round = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};
const rounded = <T extends number[]>(values: T): T => values.map(round) as T;

/** Reads world placements for nodes of one scene; bounds reuse per-mesh work. */
export function createPartPlacementReader(
  root: THREE.Object3D,
): (node: THREE.Object3D) => PartPlacementV1 {
  const bounds = createPartBoundsReader(root);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  return (node) => {
    node.matrixWorld.decompose(position, quaternion, scale);
    const box = bounds(node);
    return {
      position: rounded(position.toArray()),
      quaternion: rounded(quaternion.toArray() as [number, number, number, number]),
      scale: rounded(scale.toArray()),
      mirrored: node.matrixWorld.determinant() < 0,
      bounds: box ? { min: rounded(box.min), max: rounded(box.max) } : null,
    };
  };
}
