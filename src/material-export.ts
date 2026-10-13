import { BackSide, type Mesh, type Object3D, type Sprite } from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** glTF has front-only or double-sided materials, but no back-only flag. Reject
 * that intent before baking/conversion instead of silently changing visibility.
 * Unused material slots do not describe an exported primitive. */
export function assertPortableMaterialSides(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh && !(node as Sprite).isSprite) return;
    const materials = mesh.material;
    const used = Array.isArray(materials)
      ? [...new Set(mesh.geometry.groups.map((group) => group.materialIndex ?? 0))].map(
          (index) => ({ material: materials[index], index }),
        )
      : [{ material: materials, index: 0 }];
    for (const { material, index } of used) {
      if (!material || material.side !== BackSide) continue;
      throw new AuthoringDiagnosticError(
        'EXPORT_MATERIAL_SIDE_UNSUPPORTED',
        `EXPORT_MATERIAL_SIDE_UNSUPPORTED ${node.name || '<unnamed part>'}: material ${material.name || `<slot ${index}>`} uses BackSide, which glTF cannot encode directly. Author inward-facing geometry with FrontSide, or choose DoubleSide when both faces are intended.`,
      );
    }
  });
}
