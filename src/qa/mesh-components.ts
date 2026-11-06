/**
 * Split one drawn mesh into its connected components, in world space (#304).
 *
 * Both structural checks compare bounding boxes, and one mesh is one box, so two
 * primitives merged into one geometry were never compared with each other. This is
 * the walk that gives each its own box.
 *
 * Vertices join through triangles and through shared positions on the same relative
 * grid `geometryDiagnostics` uses, because a box's faces own separate vertices. Only
 * vertices a triangle uses count. That is topology, not attachment: primitives that
 * overlap without sharing a vertex are two components, and the callers' box adjacency
 * decides whether those two touch.
 *
 * ## What stays one box
 *
 * Instanced and skinned meshes carry their own bounds and have no single rest
 * arrangement to split. LOD alternates are not parts shown with level 0. Names the
 * connectivity rule exempts stay whole: a merged frond is one part by the helper contract,
 * and its leaflets are meant to stand apart. A mesh over a budget stays whole and is named
 * in `budget.unsplit`.
 */

import * as THREE from 'three';
import { lodLevel } from './lod';

/** The most welded vertices a Kiln merge helper produces, so an authored merge is walked. */
export const MAX_SPLIT_VERTICES = 262_144;
/** Past this a mesh is a scatter rather than parts, and comparing every pair stops paying. */
export const MAX_MESH_COMPONENTS = 256;
/** Both callers compare every pair of boxes, so the whole scene is bounded too. */
export const MAX_SCENE_COMPONENTS = 4096;

/**
 * Names expected to stand apart from the body. Matched against the mesh name, which
 * Kiln's own helpers control, so this keys off declared structure rather than shape.
 */
export const STANDS_APART_NAME = /(?:^|_)(?:leaf|leaves|foliage|frond|card|decal|billboard|petal)/i;

export interface SplitBudget {
  components: number;
  /** Meshes left as one box because they went over a budget, in traversal order. */
  unsplit: string[];
}

export const splitBudget = (): SplitBudget => ({ components: 0, unsplit: [] });

/** Vertex labels by component, or the budget that stopped the walk. */
interface GeometryComponents {
  version: number;
  count: number;
  /** Component of each vertex; -1 for one no triangle uses or that is not finite. */
  labels?: Int32Array;
}
const cache = new WeakMap<THREE.BufferGeometry, GeometryComponents>();

function find(parent: Int32Array, start: number): number {
  let root = start;
  while (parent[root] !== root) root = parent[root]!;
  for (let at = start; parent[at] !== root; ) {
    const next = parent[at]!;
    parent[at] = root;
    at = next;
  }
  return root;
}

function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  // The smaller index stays the root, so labels follow vertex order.
  if (ra < rb) parent[rb] = ra;
  else parent[ra] = rb;
}

function walkComponents(geometry: THREE.BufferGeometry): GeometryComponents {
  const position = geometry.getAttribute('position');
  const version = (position as { version?: number } | undefined)?.version ?? 0;
  const cached = cache.get(geometry);
  if (cached && cached.version === version) return cached;
  const store = (result: GeometryComponents) => {
    cache.set(geometry, result);
    return result;
  };
  if (position?.itemSize !== 3 || position.count > MAX_SPLIT_VERTICES)
    return store({ version, count: 0 });

  const parent = new Int32Array(position.count);
  const used = new Uint8Array(position.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  const finite = new Uint8Array(position.count);
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
      finite[i] = 1;
      bounds.expandByPoint(point);
    }
  }
  const index = geometry.getIndex();
  const triangles = (index?.count ?? position.count) - ((index?.count ?? position.count) % 3);
  const corner = (at: number) => (index ? index.getX(at) : at);
  for (let at = 0; at < triangles; at += 3) {
    const a = corner(at);
    const b = corner(at + 1);
    const c = corner(at + 2);
    if (!finite[a] || !finite[b] || !finite[c]) continue;
    used[a] = used[b] = used[c] = 1;
    union(parent, a, b);
    union(parent, b, c);
  }

  const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  const tolerance = Math.max(size.x, size.y, size.z) * 1e-6 || 1;
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    if (!used[i]) continue;
    point.fromBufferAttribute(position, i).sub(bounds.min).divideScalar(tolerance);
    const key = `${Math.round(point.x)},${Math.round(point.y)},${Math.round(point.z)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else union(parent, first, i);
  }

  const labels = new Int32Array(position.count).fill(-1);
  const byRoot = new Map<number, number>();
  for (let i = 0; i < position.count; i++) {
    if (!used[i]) continue;
    const root = find(parent, i);
    let label = byRoot.get(root);
    if (label === undefined) {
      label = byRoot.size;
      byRoot.set(root, label);
      if (byRoot.size > MAX_MESH_COMPONENTS) return store({ version, count: byRoot.size });
    }
    labels[i] = label;
  }
  return store({ version, count: byRoot.size, labels });
}

/**
 * World-space boxes of a mesh's components, in order of each one's first vertex.
 *
 * Returns undefined for a mesh that is not split (see the module header), and the mesh's
 * world matrix must be current. A mesh with one component returns one box, which callers
 * ignore in favour of the bounds they already measure, so nothing moves for it.
 */
export function meshComponentBoxes(
  mesh: THREE.Mesh,
  budget: SplitBudget,
): THREE.Box3[] | undefined {
  const flagged = mesh as THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
  if (
    flagged.isInstancedMesh ||
    flagged.isSkinnedMesh ||
    STANDS_APART_NAME.test(mesh.name) ||
    (lodLevel(mesh) ?? 0) > 0
  )
    return undefined;
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute('position');
  if (!position) return undefined;
  const walked = walkComponents(geometry);
  if (
    !walked.labels ||
    (walked.count > 1 && budget.components + walked.count > MAX_SCENE_COMPONENTS)
  ) {
    budget.unsplit.push(mesh.name || '(unnamed mesh)');
    return undefined;
  }
  if (walked.count < 1) return undefined;
  if (walked.count > 1) budget.components += walked.count;
  const boxes = Array.from({ length: walked.count }, () => new THREE.Box3());
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const label = walked.labels[i]!;
    if (label < 0) continue;
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    boxes[label]!.expandByPoint(point);
  }
  return boxes;
}
