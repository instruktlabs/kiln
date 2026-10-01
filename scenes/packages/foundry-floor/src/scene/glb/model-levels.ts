// Resolve declared lower levels without adding them to the plain LOD0 scene or changing source node names.
import { Matrix4 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
interface Levels { objects: Object3D[]; parents: Map<Object3D, Object3D | null>; worlds: Map<Object3D, Matrix4>; lods: Map<Object3D, number>; indices: Map<Object3D, number> }
const ready = new WeakMap<GLTF, Levels>(), pending = new WeakMap<GLTF, Promise<void>>();
const declared = (gltf: GLTF, data: Levels, obj: Object3D): number[] => {
  const index = data.indices.get(obj);
  const ids = index === undefined ? undefined : gltf.parser.json.nodes?.[index]?.extensions?.MSFT_lod?.ids;
  return Array.isArray(ids) ? ids : [];
};
function baseLevels(gltf: GLTF): Levels {
  gltf.scene.updateMatrixWorld(true);
  const data: Levels = { objects: [], parents: new Map(), worlds: new Map(), lods: new Map(), indices: new Map() };
  gltf.scene.traverse(obj => {
    data.objects.push(obj); data.parents.set(obj, obj.parent); data.worlds.set(obj, obj.matrixWorld.clone()); data.lods.set(obj, 0);
    const index = gltf.parser.associations.get(obj)?.nodes; if (index !== undefined) data.indices.set(obj, index);
  });
  return data;
}
export function modelLevels(gltf: GLTF): Levels {
  const result = ready.get(gltf);
  if (result) return result;
  const data = baseLevels(gltf);
  if (data.objects.some(obj => declared(gltf, data, obj).length)) throw new Error('Call prepareModelLevels before baking declared LODs');
  return data;
}
export async function prepareModelLevels(gltf: GLTF): Promise<void> {
  if (ready.has(gltf)) return;
  const existing = pending.get(gltf); if (existing) return existing;
  const work = (async () => {
    const data = baseLevels(gltf);
    // Animated off-scene nodes may already be cached when GLTFLoader prunes its associations to the default scene.
    // Recover their source indices from dependency identities, without renaming or attaching the lower subtree.
    const indexed = new Set<number>();
    const indexBranch = async (id: number): Promise<Object3D> => {
      const obj = await gltf.parser.getDependency('node', id) as Object3D;
      if (!indexed.has(id)) {
        indexed.add(id); data.indices.set(obj, id);
        for (const child of gltf.parser.json.nodes[id]?.children ?? []) await indexBranch(child);
      }
      return obj;
    };
    const attach = (obj: Object3D, parent: Object3D | null, level: number) => {
      if (data.parents.has(obj)) throw new Error('Declared LOD is also reachable through another scene path');
      obj.updateMatrix();
      data.objects.push(obj); data.parents.set(obj, parent); data.lods.set(obj, level);
      data.worlds.set(obj, new Matrix4().multiplyMatrices(parent ? data.worlds.get(parent)! : new Matrix4(), obj.matrix));
      for (const child of obj.children) attach(child, obj, level);
    };
    for (let i = 0; i < data.objects.length; i++) {
      const owner = data.objects[i]!, parent = data.parents.get(owner) ?? null;
      for (const [level, id] of declared(gltf, data, owner).entries()) {
        if (!Number.isInteger(id) || id < 0 || id >= gltf.parser.json.nodes.length) throw new Error('Invalid declared LOD node index');
        attach(await indexBranch(id), parent, (data.lods.get(owner) ?? 0) + level + 1);
      }
    }
    ready.set(gltf, data);
  })();
  pending.set(gltf, work);
  try { await work; } finally { pending.delete(gltf); }
}
