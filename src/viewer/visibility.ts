/**
 * `KHR_node_visibility` in the local viewer (R44).
 *
 * three's GLTFLoader (0.186) does not implement the extension, so it would draw every node. The
 * viewer hides each node the extension marks `visible: false`, and with it the node's subtree,
 * in the loaded scene and in the lower levels of detail it builds. The camera frames what draws.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

interface NodeJson {
  extensions?: { KHR_node_visibility?: { visible?: unknown } };
}

/** Hide every flagged node the parser built under `roots`; returns how many objects it hid. */
export function applyNodeVisibility(gltf: GLTF, roots: readonly THREE.Object3D[]): number {
  const nodes = (gltf.parser.json as { nodes?: NodeJson[] }).nodes ?? [];
  const hidden = new Set<number>();
  nodes.forEach((node, index) => {
    if (node?.extensions?.KHR_node_visibility?.visible === false) hidden.add(index);
  });
  if (hidden.size === 0) return 0;
  let count = 0;
  for (const root of roots)
    root.traverse((object) => {
      const index = gltf.parser.associations.get(object)?.nodes;
      if (index === undefined || !hidden.has(index)) return;
      object.visible = false;
      count++;
    });
  return count;
}

/**
 * Precise world bounds of what draws under `root`: `Box3.setFromObject(root, true)` when nothing
 * is hidden, else the same per-vertex measure over the objects that draw. A model that draws
 * nothing is framed whole.
 */
export function drawnBounds(root: THREE.Object3D): THREE.Box3 {
  let hidden = false;
  root.traverse((object) => {
    if (!object.visible) hidden = true;
  });
  if (!hidden) return new THREE.Box3().setFromObject(root, true);
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const point = new THREE.Vector3();
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh & Partial<THREE.InstancedMesh>;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    const position = geometry.getAttribute('position');
    if (position && mesh.isInstancedMesh !== true) {
      for (let i = 0; i < position.count; i++) {
        if (mesh.isMesh) mesh.getVertexPosition(i, point);
        else point.fromBufferAttribute(position, i);
        box.expandByPoint(point.applyMatrix4(object.matrixWorld));
      }
      return;
    }
    const own = object as { boundingBox?: THREE.Box3 | null; computeBoundingBox?: () => void };
    if (own.boundingBox !== undefined) {
      if (own.boundingBox === null) own.computeBoundingBox!();
      part.copy(own.boundingBox!);
    } else {
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      part.copy(geometry.boundingBox!);
    }
    box.union(part.applyMatrix4(object.matrixWorld));
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(root, true) : box;
}
