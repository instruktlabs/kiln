/**
 * Levels of detail in the local viewer.
 *
 * three's GLTFLoader does not implement `MSFT_lod`: it draws each chain's LOD0 and everything
 * outside the chains, which is the intended degrade. The viewer builds each chain's lower
 * levels through the same parser, node by node, and keeps them detached until the level
 * control asks for one; the chosen level then stands at LOD0's place among its siblings. A
 * chain with fewer levels than the chosen one shows its last level. Chains Kiln wrote and
 * chains another tool wrote load the same way. A lower level keeps its `KHR_node_visibility`
 * flags, and every count is of what draws.
 */
import type * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyNodeVisibility } from './visibility';

export interface ViewerLodChain {
  /** LOD0 first. LOD0 is in the scene as loaded; the lower levels start detached. */
  levels: THREE.Object3D[];
}

export interface ViewerLevels {
  chains: ViewerLodChain[];
  /** Triangles the whole model draws at each level, LOD0 first. */
  triangles: number[];
}

/** Triangles drawn by the meshes under `object`, instances counted; hidden subtrees draw none. */
export function countTriangles(object: THREE.Object3D): number {
  let triangles = 0;
  object.traverseVisible((node) => {
    const mesh = node as THREE.Mesh & Partial<THREE.InstancedMesh>;
    if (!mesh.isMesh) return;
    const vertices = mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0;
    triangles += (vertices / 3) * (mesh.isInstancedMesh ? mesh.count! : 1);
  });
  return triangles;
}

interface NodeJson {
  extensions?: { MSFT_lod?: { ids?: unknown } };
}

/**
 * Build the lower levels of every chain whose LOD0 the loaded scene holds, or `undefined`
 * when there is none. A chain that lists a node the scene already draws is skipped, as is a
 * chain inside another chain's LOD0, so each level swaps whole.
 */
export async function loadViewerLevels(gltf: GLTF): Promise<ViewerLevels | undefined> {
  const nodes = (gltf.parser.json as { nodes?: NodeJson[] }).nodes ?? [];
  const inScene = new Map<number, THREE.Object3D>();
  gltf.scene.traverse((object) => {
    const index = gltf.parser.associations.get(object)?.nodes;
    if (index !== undefined && !inScene.has(index)) inScene.set(index, object);
  });
  const bases = new Set<THREE.Object3D>();
  const chains: ViewerLodChain[] = [];
  for (const [index, base] of inScene) {
    const ids = nodes[index]?.extensions?.MSFT_lod?.ids;
    if (!Array.isArray(ids) || ids.length === 0) continue;
    if (
      ids.some((id) => !Number.isInteger(id) || !nodes[id as number] || inScene.has(id as number))
    )
      continue;
    let ancestor = base.parent;
    while (ancestor && !bases.has(ancestor)) ancestor = ancestor.parent;
    if (ancestor) continue;
    const levels: THREE.Object3D[] = [base];
    for (const id of ids as number[])
      levels.push((await gltf.parser.getDependency('node', id)) as THREE.Object3D);
    applyNodeVisibility(gltf, levels.slice(1));
    bases.add(base);
    chains.push({ levels });
  }
  if (chains.length === 0) return undefined;
  const outside =
    countTriangles(gltf.scene) -
    chains.reduce((sum, chain) => sum + countTriangles(chain.levels[0]!), 0);
  const depth = Math.max(...chains.map((chain) => chain.levels.length));
  const triangles = Array.from(
    { length: depth },
    (_, level) =>
      outside + chains.reduce((sum, chain) => sum + countTriangles(levelOf(chain, level)), 0),
  );
  return { chains, triangles };
}

const levelOf = (chain: ViewerLodChain, level: number) =>
  chain.levels[Math.min(Math.max(level, 0), chain.levels.length - 1)]!;

/** Show `level` in every chain, each at its LOD0's place among its siblings. */
export function showLevel(levels: ViewerLevels, level: number): void {
  for (const chain of levels.chains) {
    const wanted = levelOf(chain, level);
    const shown = chain.levels.find((candidate) => candidate.parent !== null);
    if (!shown || shown === wanted) continue;
    const parent = shown.parent!;
    parent.children[parent.children.indexOf(shown)] = wanted;
    wanted.parent = parent;
    shown.parent = null;
  }
}

/** Every level's object that is not in the scene now, for disposal and material toggles. */
export function detachedLevels(levels: ViewerLevels | undefined): THREE.Object3D[] {
  return (levels?.chains ?? []).flatMap((chain) =>
    chain.levels.filter((level) => level.parent === null),
  );
}

/** Level choices for the control: `LOD1 · 1,234 triangles`. */
export function levelLabels(triangles: readonly number[]): string[] {
  return triangles.map((count, level) => `LOD${level} · ${count.toLocaleString()} triangles`);
}

/** Every level's triangles on one line: `LOD0 1,200 · LOD1 450 triangles`. */
export function describeLevels(triangles: readonly number[]): string {
  return `${triangles.map((count, level) => `LOD${level} ${count.toLocaleString()}`).join(' · ')} triangles`;
}
