// SPDX-License-Identifier: MIT
// The campus structures in the scene (FF-C1 item 2). Each accepted export, as the kit's loader parsed it from the pack
// (fetched with its size and SHA-256 checked), is merged once by material: every mesh's node transform baked into one
// indexed geometry per exported material, the exported material objects themselves kept (materials exactly as
// exported; the day look only dims `edge-lit` as the contract's materials table asks). A placement is a group at its
// campus position and yaw holding one mesh per material of its full model and, where the contract gives one, of its
// far shell; the scene shows one of the two by the camera's distance to the placement (the tier's fullWithin, times the
// live lodBias, with 5 % hysteresis). No LOD<n> groups are read (the contract has none).
import { BufferAttribute, BufferGeometry, Group, Matrix3, Matrix4, Mesh, Vector3 } from 'three/webgpu';
import type { Camera, Material, MeshStandardMaterial, Object3D } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { CampusData, CampusLook, CampusPlacement } from '../data';
import { boxDistance, placementMatrix } from '../data';

export interface MergedPart { material: Material; geometry: BufferGeometry; triangles: number }

/** One export merged by material, in the order the materials first appear (deterministic). */
export function mergeByMaterial(gltf: GLTF): MergedPart[] {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const lists = new Map<Material, { mesh: Mesh; matrix: Matrix4 }[]>();
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as Material;
    if (Array.isArray(material)) throw new Error(`${mesh.name}: multi-material meshes are not merged`);
    let list = lists.get(material);
    if (!list) lists.set(material, (list = []));
    list.push({ mesh, matrix: new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld) });
  });
  const parts: MergedPart[] = [], p = new Vector3(), n = new Vector3(), normalMatrix = new Matrix3();
  for (const [material, list] of lists) {
    let vertices = 0, indices = 0;
    for (const { mesh } of list) {
      const g = mesh.geometry;
      vertices += g.attributes.position!.count;
      indices += g.index ? g.index.count : g.attributes.position!.count;
    }
    const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let v0 = 0, i0 = 0;
    for (const { mesh, matrix } of list) {
      const g = mesh.geometry, pos = g.attributes.position!, nor = g.attributes.normal;
      normalMatrix.getNormalMatrix(matrix);
      for (let k = 0; k < pos.count; k++) {
        p.fromBufferAttribute(pos, k).applyMatrix4(matrix);
        positions[(v0 + k) * 3] = p.x; positions[(v0 + k) * 3 + 1] = p.y; positions[(v0 + k) * 3 + 2] = p.z;
        if (nor) {
          n.fromBufferAttribute(nor, k).applyMatrix3(normalMatrix).normalize();
          normals[(v0 + k) * 3] = n.x; normals[(v0 + k) * 3 + 1] = n.y; normals[(v0 + k) * 3 + 2] = n.z;
        }
      }
      // A mirroring node would flip the winding; none of the exports has one (build-campus negative-scale check), but
      // the merge keeps faces front-facing either way.
      const flip = matrix.determinant() < 0, src = g.index;
      const count = src ? src.count : pos.count;
      for (let k = 0; k < count; k += 3) {
        const a = src ? src.getX(k) : k, b = src ? src.getX(k + 1) : k + 1, c = src ? src.getX(k + 2) : k + 2;
        index[i0 + k] = v0 + a; index[i0 + k + 1] = v0 + (flip ? c : b); index[i0 + k + 2] = v0 + (flip ? b : c);
      }
      v0 += pos.count; i0 += count;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    parts.push({ material, geometry, triangles: indices / 3 });
  }
  return parts;
}

export interface PlacedStructure {
  placement: CampusPlacement;
  group: Group;
  full: Group;
  far: Group | null;
  fullTriangles: number;
  farTriangles: number;
  /** Which tier is shown now. */
  showing: 'full' | 'far';
}
export interface StructureStats { full: number; far: number; meshes: number; triangles: number }
export interface CampusStructures {
  root: Group;
  placed: PlacedStructure[];
  /** Picks full or far per placement for this camera (fullWithin in metres, already scaled by the live lodBias). */
  update(camera: Camera, fullWithin: number): void;
  /** Forces every placement to one tier (captures and counts), or null to return to distance switching. */
  force(tier: 'full' | 'far' | null): void;
  stats(): StructureStats;
  /** Scales the exported emissive of the named materials (1 = as exported); the scale is undone on dispose. */
  applyLook(look: CampusLook): void;
  dispose(): void;
}

const HYSTERESIS = 0.05;

export function buildCampusStructures(data: CampusData, models: ReadonlyMap<string, GLTF>): CampusStructures {
  const merged = new Map<string, MergedPart[]>();
  const partsOf = (id: string) => {
    let parts = merged.get(id);
    if (!parts) {
      const gltf = models.get(id);
      if (!gltf) throw new Error(`The scene pack has no model ${id} (campus data names it)`);
      merged.set(id, (parts = mergeByMaterial(gltf)));
    }
    return parts;
  };
  const root = new Group();
  root.name = 'campus-structures';
  const meshGroup = (id: string, name: string) => {
    const g = new Group();
    g.name = name;
    let triangles = 0;
    for (const part of partsOf(id)) {
      const mesh = new Mesh(part.geometry, part.material);
      mesh.name = `${id}:${part.material.name}`;
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
      triangles += part.triangles;
    }
    g.matrixAutoUpdate = false;
    return { group: g, triangles };
  };
  const placed: PlacedStructure[] = data.placements.map(placement => {
    const group = new Group();
    group.name = placement.id;
    group.matrixAutoUpdate = false;
    group.matrix.fromArray(placementMatrix(placement.position, placement.yawDeg));
    const full = meshGroup(placement.model, `${placement.id}:full`), far = placement.far ? meshGroup(placement.far, `${placement.id}:far`) : null;
    group.add(full.group);
    if (far) { group.add(far.group); far.group.visible = false; }
    root.add(group);
    return { placement, group, full: full.group, far: far?.group ?? null, fullTriangles: full.triangles, farTriangles: far?.triangles ?? 0, showing: 'full' as const };
  });
  root.updateMatrixWorld(true);

  let forced: 'full' | 'far' | null = null;
  const show = (s: PlacedStructure, tier: 'full' | 'far') => {
    if (!s.far) tier = 'full';
    if (s.showing === tier) return;
    s.showing = tier;
    s.full.visible = tier === 'full';
    if (s.far) s.far.visible = tier === 'far';
  };
  const emissiveBase = new Map<MeshStandardMaterial, number>();
  return {
    root, placed,
    update(camera, fullWithin) {
      const c = camera.position;
      for (const s of placed) {
        if (forced) { show(s, forced); continue; }
        if (!s.far) continue;
        const d = boxDistance(s.placement.bounds, c.x, c.y, c.z);
        if (s.showing === 'full' && d > fullWithin * (1 + HYSTERESIS)) show(s, 'far');
        else if (s.showing === 'far' && d < fullWithin * (1 - HYSTERESIS)) show(s, 'full');
      }
    },
    force(tier) { forced = tier; if (tier) for (const s of placed) show(s, tier); },
    stats() {
      let full = 0, far = 0, meshes = 0, triangles = 0;
      for (const s of placed) {
        if (s.showing === 'full' || !s.far) { full++; meshes += s.full.children.length; triangles += s.fullTriangles; }
        else { far++; meshes += s.far.children.length; triangles += s.farTriangles; }
      }
      return { full, far, meshes, triangles };
    },
    applyLook(look) {
      for (const parts of merged.values()) for (const part of parts) {
        const material = part.material as MeshStandardMaterial;
        const scale = look.emissive[material.name];
        if (scale === undefined || !('emissiveIntensity' in material)) continue;
        if (!emissiveBase.has(material)) emissiveBase.set(material, material.emissiveIntensity);
        material.emissiveIntensity = emissiveBase.get(material)! * scale;
      }
    },
    dispose() {
      root.removeFromParent();
      for (const [material, base] of emissiveBase) material.emissiveIntensity = base;
      emissiveBase.clear();
      // The merged geometries are this scene's; the exported materials belong to the pack (the kit disposes them).
      for (const parts of merged.values()) for (const part of parts) part.geometry.dispose();
      merged.clear();
    },
  };
}
