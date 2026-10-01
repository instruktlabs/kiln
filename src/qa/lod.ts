import type * as THREE from 'three';
import { LOD_TOKEN, lodName } from '../lod';

/**
 * The LOD level named by a node or its nearest tagged ancestor, if any.
 *
 * This is a level label, not a chain identity. Different chains can draw different levels
 * together; use lodMembership when deciding whether two parts are mutually exclusive.
 */
export function lodLevel(node: THREE.Object3D): number | undefined {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    const match = LOD_TOKEN.exec(current.name);
    if (match) return Number(match[2]);
  }
  return undefined;
}

/** The outermost named tier owns the part, matching the export chain grouping. */
export function lodMembership(
  node: THREE.Object3D,
): { parent: THREE.Object3D | null; stem: string; level: number } | undefined {
  let membership: ReturnType<typeof lodMembership>;
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    const tier = lodName(current.name);
    if (tier) membership = { parent: current.parent, stem: tier.stem, level: tier.level };
  }
  return membership;
}
