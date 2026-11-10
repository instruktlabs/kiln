import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import type { Object3D, MeshPhysicalMaterial } from 'three/webgpu';
import type { CollisionWorld } from '@kiln-scenes/scene-kit/collision';
import { HIDDEN_PARTS, HIDDEN_PREFIX } from './layout';

const hidden = new Set<string>(HIDDEN_PARTS);

/** Structural batches retain their real apertures; decorative sculpture and glass do not become walls. */
export function isCathedralSolid(mesh: Mesh): boolean {
  if (hidden.has(mesh.name) || mesh.name.startsWith(HIDDEN_PREFIX)) return false;
  if (mesh.userData.collision === false || mesh.userData.kilnMerged || mesh.userData.kilnShadowStandIn || mesh.userData.kilnPassStandIn) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.some(material => {
    const m = material as MeshPhysicalMaterial;
    return m.transparent || (m.transmission ?? 0) > 0 || /Glass|Stained|Weathering/i.test(m.name);
  })) return false;
  return mesh.userData.collision === true || /_(?:Ashlar|Stone)(?:_\d+)?$/.test(mesh.name)
    || /^Mesh_(?:Paving|Ground_Steps|Sanctuary_Oak)$/.test(mesh.name)
    || /^Mesh_ChapelFigure_Plinth_\d+$/.test(mesh.name)
    || /^Mesh_WestEntrancePassage_Paving(?:_\d+)?$/.test(mesh.name)
    || /^Mesh_Portal_Transept_Oak(?:_\d+)?$/.test(mesh.name);
}

/**
 * Copy the walk-height triangles, not the cathedral's enormous ornament/roof mesh.
 * The highest accessible platform is below 1 m; 6 m retains ample capsule headroom.
 * Full triangles crossing that band are retained, so wall and doorway topology is unchanged.
 * matrixWorld includes the loaded model and every nested placement transform.
 */
export function addInteriorCollision(world: CollisionWorld, root: Object3D, key = 'cathedral', filter = isCathedralSolid): number {
  root.updateWorldMatrix(true, true);
  const positions: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  root.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !filter(mesh)) return;
    const p = mesh.geometry?.getAttribute('position');
    if (!p) return;
    const index = mesh.geometry.index;
    for (let i = 0, count = index?.count ?? p.count; i + 2 < count; i += 3) {
      a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      if (Math.min(a.y, b.y, c.y) > 6 || Math.max(a.y, b.y, c.y) < -1) continue;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  });
  if (!positions.length) return 0;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  const material = new MeshBasicMaterial();
  const proxy = new Mesh(geometry, material);
  const holder = new Group(); holder.add(proxy);
  try { world.addStatic(key, holder); }
  finally { holder.clear(); geometry.dispose(); material.dispose(); }
  return positions.length / 9;
}
