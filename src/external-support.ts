/**
 * Requirements-declared external support (`requirements.externalSupport`): named parts rest
 * on something composed outside this asset, such as cushions on a separate seat module.
 * The declaration is the host's statement; the part's measured bottom must still meet the
 * stated plane before a floating observation is reported as information.
 */
import type * as THREE from 'three';

export interface ExternalSupportV1 {
  /** Part or group names; a mesh matches by its name, its `Mesh_`-less name or an ancestor. */
  parts: string[];
  /** Asset-frame height of the external contact plane, in metres. */
  planeY: number;
  /** Allowed distance between a part's bottom and planeY. Default 0.02 m. */
  tolerance?: number;
}

/** Matches the floating-parts and connectivity adjacency tolerance. */
export const EXTERNAL_SUPPORT_TOLERANCE = 0.02;

/** The support whose parts name this mesh and whose plane its world bottom meets. */
export function restingSupport(
  mesh: THREE.Object3D,
  bottomY: number,
  supports: readonly ExternalSupportV1[] | undefined,
): ExternalSupportV1 | undefined {
  return declaredSupports(mesh, supports).find(
    (support) =>
      Math.abs(bottomY - support.planeY) <= (support.tolerance ?? EXTERNAL_SUPPORT_TOLERANCE),
  );
}

/** Every support that names this mesh or one of its ancestors. */
export function declaredSupports(
  mesh: THREE.Object3D,
  supports: readonly ExternalSupportV1[] | undefined,
): ExternalSupportV1[] {
  if (!supports?.length) return [];
  const names = new Set<string>();
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    if (!node.name) continue;
    names.add(node.name);
    if (node.name.startsWith('Mesh_')) names.add(node.name.slice(5));
  }
  return supports.filter((support) => support.parts.some((part) => names.has(part)));
}
