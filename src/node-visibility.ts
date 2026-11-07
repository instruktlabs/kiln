/**
 * Node visibility in the written GLB (R44).
 *
 * A source node with `visible = false` exports `KHR_node_visibility` `{ visible: false }`,
 * which hides the node and every descendant in a loader that implements it. The extension is
 * used, never required: a loader without it draws everything, as before. What a Kiln headline
 * counts (triangles, draw calls, bounds) is what draws; each hidden subtree is listed apart
 * with its own triangles, so hidden state costs no variant program.
 */
import type { Accessor, Document, Node as GltfNode, Scene } from '@gltf-transform/core';
import { KHRNodeVisibility, type InstancedMesh } from '@gltf-transform/extensions';
import * as THREE from 'three';
import type { HiddenNodeV1 } from './contracts/integration';
import { isHiddenGltfNode, nodeTriangles } from './metrics';
import { writtenNodeResolver } from './written-nodes';

export const KHR_NODE_VISIBILITY = 'KHR_node_visibility';

export { isHiddenGltfNode };

/** Every source node that does not draw, before any node leaves the scene. */
export function applyNodeVisibility(root: THREE.Object3D, doc: Document): void {
  const hidden: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.visible === false) hidden.push(node);
  });
  if (hidden.length === 0) return;
  const written = hidden.map(writtenNodeResolver(root, doc, 'Visibility export'));
  const extension = doc.createExtension(KHRNodeVisibility);
  for (const node of written)
    node.setExtension(KHR_NODE_VISIBILITY, extension.createVisibility().setVisible(false));
}

const segment = (name: string, occurrence: number) => `/${encodeURIComponent(name)}[${occurrence}]`;

/**
 * The outermost hidden nodes reachable from the default scene, in scene order (depth first,
 * a node before its children), each with the inspection path `kiln_inspect` lists and the
 * placed triangles of its subtree. A hidden node inside another is covered by the outer one.
 */
export function summarizeHiddenNodes(doc: Document): HiddenNodeV1[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return [];
  const found: HiddenNodeV1[] = [];
  const visit = (siblings: readonly GltfNode[], parentPath: string): void => {
    const seen = new Map<string, number>();
    for (const node of siblings) {
      const name = node.getName();
      const occurrence = seen.get(name) ?? 0;
      seen.set(name, occurrence + 1);
      const path = `${parentPath}${segment(name, occurrence)}`;
      if (isHiddenGltfNode(node)) found.push({ path, name, triangles: nodeTriangles(node) });
      else visit(node.listChildren(), path);
    }
  };
  visit(scene.listChildren(), segment(scene.getName() || 'Scene', 0));
  return found;
}

/** Each vertex a primitive's indices reach, once, in first-use order; every vertex without them. */
function referencedVertices(indices: Accessor | null, position: Accessor): Uint32Array {
  const vertexCount = position.getCount();
  if (!indices) return Uint32Array.from({ length: vertexCount }, (_, vertex) => vertex);
  const count = indices.getCount();
  const stored = indices.getNormalized() ? null : indices.getArray();
  const seen = new Uint8Array(vertexCount);
  const vertices = new Uint32Array(count);
  let unique = 0;
  for (let i = 0; i < count; i++) {
    const vertex = stored ? stored[i]! : indices.getScalar(i);
    if (seen[vertex]) continue;
    seen[vertex] = 1;
    vertices[unique++] = vertex;
  }
  return vertices.subarray(0, unique);
}

/**
 * World bounds of the geometry a loader draws: `getBounds` without hidden subtrees, each vertex a
 * triangle reaches once per placement so rotated geometry stays tight, including every GPU
 * instance placement.
 */
export function drawnSceneBounds(scene: Scene): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (node: GltfNode): void => {
    if (isHiddenGltfNode(node)) return;
    const mesh = node.getMesh();
    if (mesh) {
      const base = new THREE.Matrix4().fromArray(node.getWorldMatrix());
      const instances = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
      const translation = instances?.getAttribute('TRANSLATION');
      const rotation = instances?.getAttribute('ROTATION');
      const scale = instances?.getAttribute('SCALE');
      const countInstances =
        translation?.getCount() ?? rotation?.getCount() ?? scale?.getCount() ?? 1;
      const matrices: number[][] = [];
      for (let i = 0; i < countInstances; i++) {
        const t = translation?.getElement(i, []) ?? [0, 0, 0];
        const r = rotation?.getElement(i, []) ?? [0, 0, 0, 1];
        const s = scale?.getElement(i, []) ?? [1, 1, 1];
        const localMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(t),
          new THREE.Quaternion().fromArray(r),
          new THREE.Vector3().fromArray(s),
        );
        matrices.push(base.clone().multiply(localMatrix).toArray());
      }
      const local = [0, 0, 0];
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const vertices = referencedVertices(primitive.getIndices(), position);
        const stored = position.getNormalized() ? null : position.getArray();
        for (const m of matrices)
          for (let i = 0; i < vertices.length; i++) {
            const vertex = vertices[i]!;
            if (!stored) position.getElement(vertex, local);
            const x = stored ? stored[vertex * 3]! : local[0]!;
            const y = stored ? stored[vertex * 3 + 1]! : local[1]!;
            const z = stored ? stored[vertex * 3 + 2]! : local[2]!;
            const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
            const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
            const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
            if (wx < min[0]!) min[0] = wx;
            if (wy < min[1]!) min[1] = wy;
            if (wz < min[2]!) min[2] = wz;
            if (wx > max[0]!) max[0] = wx;
            if (wy > max[1]!) max[1] = wy;
            if (wz > max[2]!) max[2] = wz;
          }
      }
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const node of scene.listChildren()) visit(node);
  return { min, max };
}
