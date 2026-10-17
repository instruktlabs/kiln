/**
 * Required solids (delivery contract item 4).
 *
 * `requireSolid(part)` is an opt-in authoring assertion: at export, every mesh in the marked
 * part must be closed (no boundary edges), manifold (no edge shared by more than two faces)
 * and outward (consistent winding with a positive signed volume), or the build fails with the
 * closed `REQUIRE_SOLID` repair message. It measures with `geometryDiagnostics`; it repairs
 * nothing. Hidden subtrees are not checked, because they do not draw.
 */
import type * as THREE from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import { geometryDiagnostics } from './geometry';
import {
  RequiredSolidError,
  MAX_SOLID_FAILURE_MESHES,
  MAX_SOLID_FAILURE_PATH,
  type SolidFailureMesh,
} from './evaluator/solid-diagnostic';

/** The engine-owned userData key a marked part carries. */
export const REQUIRE_SOLID_KEY = 'kilnRequireSolid';

/** Mark `part` (a mesh, or a group whose meshes it covers) as required to be solid. */
export function requireSolid<T extends THREE.Object3D>(part: T): T {
  if ((part as { isObject3D?: boolean } | null)?.isObject3D !== true)
    throw new AuthoringDiagnosticError(
      'REQUIRE_SOLID',
      'requireSolid(part): part must be a scene node, such as the mesh createPart returned or a group.',
    );
  part.userData[REQUIRE_SOLID_KEY] = { schemaVersion: 1 };
  return part;
}

const marked = (node: THREE.Object3D): boolean => {
  for (let at: THREE.Object3D | null = node; at; at = at.parent)
    if (at.userData?.[REQUIRE_SOLID_KEY] !== undefined) return true;
  return false;
};

/**
 * Throw `REQUIRE_SOLID` naming the first marked visible mesh that is not a closed, manifold,
 * outward solid. A no-op when nothing is marked.
 */
export function assertRequiredSolids(root: THREE.Object3D): void {
  const problems: string[] = [];
  const meshes: SolidFailureMesh[] = [];
  let total = 0;
  const visit = (node: THREE.Object3D, childPath: number[]): void => {
    if (node.visible === false) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && marked(mesh) && mesh.geometry?.getAttribute('position')) {
      const report = geometryDiagnostics(mesh.geometry);
      const { solid } = report;
      const reasons: string[] = [];
      if (!solid.closed) reasons.push(`not closed (${report.boundaryEdges} boundary edges)`);
      if (!solid.manifold)
        reasons.push(`not manifold (${report.nonManifoldEdges} edges shared by 3+ faces)`);
      if (solid.orientation !== 'outward')
        reasons.push(
          solid.orientation === 'mixed'
            ? `winding is mixed (${report.orientationConflicts} conflicting edges)`
            : `faces point inward (signed volume ${solid.signedVolume.toPrecision(4)})`,
        );
      if (reasons.length) {
        total++;
        if (meshes.length < MAX_SOLID_FAILURE_MESHES) {
          problems.push(`${mesh.name || '(unnamed mesh)'}: ${reasons.join(', ')}`);
          meshes.push({
            childPath: childPath.length <= MAX_SOLID_FAILURE_PATH ? childPath : null,
            closed: solid.closed,
            manifold: solid.manifold,
            orientation: solid.orientation,
            boundaryEdges: report.boundaryEdges,
            nonManifoldEdges: report.nonManifoldEdges,
            orientationConflicts: report.orientationConflicts,
          });
        }
      }
    }
    node.children.forEach((child, index) => {
      visit(child, [...childPath, index]);
    });
  };
  visit(root, []);
  if (total)
    throw new RequiredSolidError(
      { total, truncated: total > meshes.length, meshes },
      `requireSolid: ${total} marked mesh(es) are not closed, manifold, outward solids: ${problems.join('; ')}${total > meshes.length ? '; ...' : ''}.`,
    );
}
