import type * as THREE from 'three';
import { LOD_TOKEN } from '../lod';

/**
 * The LOD level named by a node or its nearest tagged ancestor, if any.
 *
 * Parts on different levels are alternates of one another, never parts that appear together,
 * so scene observations must not compare them or connect them. An untagged part belongs to
 * every level.
 */
export function lodLevel(node: THREE.Object3D): number | undefined {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    const match = LOD_TOKEN.exec(current.name);
    if (match) return Number(match[2]);
  }
  return undefined;
}
