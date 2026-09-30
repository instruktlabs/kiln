import type * as THREE from 'three';

/** An LOD level token such as `LOD0`, `lod1` or `Tree_LOD2`, delimited by the name's ends or non-alphanumerics. */
const LOD_TAG = /(^|[^a-z0-9])lod(\d+)([^a-z0-9]|$)/i;

/**
 * The LOD level named by a node or its nearest tagged ancestor, if any.
 *
 * Parts on different levels are alternates of one another, never parts that appear together,
 * so scene observations must not compare them or connect them. An untagged part belongs to
 * every level.
 */
export function lodLevel(node: THREE.Object3D): number | undefined {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    const match = LOD_TAG.exec(current.name);
    if (match) return Number(match[2]);
  }
  return undefined;
}
