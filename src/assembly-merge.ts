/**
 * `merge: 'byMaterial'` for the assembly helpers (#412).
 *
 * Most saved pack assets are a few merged meshes rather than one part per piece; an assembly
 * helper that places one part per piece does not fit that style. With this option the helper
 * builds its pieces exactly as it would without it, then replaces them with one part per
 * material. The merged part holds the same triangles in the same places, so triangle count and
 * bounds do not change.
 *
 * - Rigid groups. A `Joint_` pivot moves at runtime, so the pieces under it merge only with
 *   each other, under the pivot. Everything else merges into the helper's container.
 * - Frames stay. Nodes that are not meshes (post frames, wall frames, pivots) keep their place,
 *   name and transform, so anchors and snap contracts survive the merge.
 * - Only the helper's own pieces merge; the helper names them, with a role, in `pieces`.
 * - Names. Each merged part takes the name the helper gives the role of its first piece, in
 *   build order. Part order is that first-piece order.
 * - Geometry is concatenated, not welded or unioned. Each piece stays a closed solid inside the
 *   merged part, but two pieces that share an edge make that edge non-manifold, so a merged
 *   part is one surface to `requireSolid` and to the part-overlap check.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type AssemblyMergeMode = 'byMaterial';

export function assertAssemblyMerge(helper: string, merge: unknown): void {
  if (merge === undefined || merge === 'byMaterial') return;
  throw new RangeError(
    `${helper}: merge must be 'byMaterial' when given (got ${JSON.stringify(merge)}); omit it to keep one part per piece.`,
  );
}

const isPivot = (node: THREE.Object3D) => node.name.startsWith('Joint_');

/** The piece's transform relative to `group`, from local TRS, without touching any node. */
function relativeMatrix(node: THREE.Object3D, group: THREE.Object3D): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  for (let at: THREE.Object3D | null = node; at && at !== group; at = at.parent)
    matrix.premultiply(new THREE.Matrix4().compose(at.position, at.quaternion, at.scale));
  return matrix;
}

function bake(mesh: THREE.Mesh, group: THREE.Object3D): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone();
  geometry.userData = {};
  geometry.clearGroups();
  const matrix = relativeMatrix(mesh, group);
  geometry.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    // A mirrored placement reverses winding; restore it so the merged part faces out.
    const index = geometry.getIndex();
    if (index)
      for (let i = 0; i < index.count; i += 3) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      }
  }
  return geometry;
}

/**
 * Replace the helper's pieces under `container` with one mesh per material and rigid group.
 * `name(role, group)` names the merged part; it is called once per part. Returns the merged
 * parts in order, and maps each piece to the part that now holds it.
 */
export function mergePiecesByMaterial(
  container: THREE.Object3D,
  pieces: ReadonlyMap<THREE.Mesh, string>,
  name: (role: string, group: THREE.Object3D) => string,
): { parts: THREE.Mesh[]; holder: Map<THREE.Mesh, THREE.Mesh> } {
  const groups = new Map<
    THREE.Object3D,
    Map<THREE.Material, { role: string; meshes: THREE.Mesh[] }>
  >();
  const visit = (node: THREE.Object3D, group: THREE.Object3D): void => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && pieces.has(mesh) && !Array.isArray(mesh.material)) {
      if (!groups.has(group)) groups.set(group, new Map());
      const buckets = groups.get(group)!;
      const bucket = buckets.get(mesh.material);
      if (bucket) bucket.meshes.push(mesh);
      else buckets.set(mesh.material, { role: pieces.get(mesh)!, meshes: [mesh] });
    }
    for (const child of node.children) visit(child, isPivot(child) ? child : group);
  };
  visit(container, container);

  const parts: THREE.Mesh[] = [];
  const holder = new Map<THREE.Mesh, THREE.Mesh>();
  for (const [group, buckets] of groups) {
    const used = new Set<string>();
    for (const [material, { role, meshes }] of buckets) {
      const geometries = meshes.map((mesh) => bake(mesh, group));
      if (geometries.some((g) => !g.index) && geometries.some((g) => g.index))
        for (let i = 0; i < geometries.length; i++)
          if (geometries[i]!.index) geometries[i] = geometries[i]!.toNonIndexed();
      const merged = mergeGeometries(geometries, false);
      if (!merged)
        throw new Error(
          `merge 'byMaterial': the ${role} pieces have different vertex attributes and cannot share one part.`,
        );
      let partName = name(role, group);
      for (let n = 2; used.has(partName); n++) partName = `${name(role, group)}${n}`;
      used.add(partName);
      const part = new THREE.Mesh(merged, material);
      part.name = `Mesh_${partName}`;
      for (const mesh of meshes) {
        mesh.removeFromParent();
        holder.set(mesh, part);
      }
      group.add(part);
      parts.push(part);
    }
  }
  return { parts, holder };
}

/** `wall` -> `Wall`, for part-name suffixes. */
export const roleSuffix = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
