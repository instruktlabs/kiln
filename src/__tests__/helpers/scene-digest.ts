/**
 * A platform-independent digest of what a helper built: node names, kinds and local TRS, and for
 * each mesh its material (by first appearance) and the exact bytes of every geometry attribute
 * and the index. Fixtures pin it for default helper options so a change to their output is a
 * visible, reviewed change rather than drift.
 */
import { createHash } from 'node:crypto';
import * as THREE from 'three';

export function sceneDigest(root: THREE.Object3D): string {
  const hash = createHash('sha256');
  const materials: THREE.Material[] = [];
  const bytes = (
    array: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number },
  ) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const visit = (node: THREE.Object3D, depth: number): void => {
    hash.update(
      JSON.stringify([
        depth,
        node.type,
        node.name,
        node.position.toArray(),
        node.quaternion.toArray(),
        node.scale.toArray(),
        node.userData,
      ]),
    );
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      hash.update(
        JSON.stringify(
          list.map((material) => {
            if (!materials.includes(material)) materials.push(material);
            return materials.indexOf(material);
          }),
        ),
      );
      const geometry = mesh.geometry;
      for (const name of Object.keys(geometry.attributes).sort()) {
        const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
        hash.update(`${name}:${attribute.itemSize}:${attribute.array.constructor.name}`);
        hash.update(bytes(attribute.array as Float32Array));
      }
      const index = geometry.getIndex();
      if (index) {
        // Index width is an encoding choice; digest the values.
        hash.update(`index:${Array.from(index.array).join(',')}`);
      }
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return hash.digest('hex');
}

/** Triangles and world-space bounds of every mesh under `root`. */
export function sceneFacts(root: THREE.Object3D): {
  meshes: number;
  triangles: number;
  min: [number, number, number];
  max: [number, number, number];
} {
  root.updateWorldMatrix(true, true);
  let meshes = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    triangles += (geometry.index ? geometry.index.count : position.count) / 3;
    for (let i = 0; i < position.count; i++)
      box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  });
  return { meshes, triangles, min: box.min.toArray(), max: box.max.toArray() };
}

/**
 * The merged and unmerged forms hold the same triangles in the same places. Merging bakes each
 * piece's transform into Float32 positions, so bounds agree to Float32 precision, not exactly.
 */
export function sameFacts(merged: THREE.Object3D, pieces: THREE.Object3D, meshes: number): void {
  const a = sceneFacts(merged);
  const b = sceneFacts(pieces);
  if (a.meshes !== meshes) throw new Error(`expected ${meshes} merged parts, got ${a.meshes}`);
  if (a.triangles !== b.triangles)
    throw new Error(`triangles differ: merged ${a.triangles}, pieces ${b.triangles}`);
  const corners = [...a.min, ...a.max].map((v, i) => Math.abs(v - [...b.min, ...b.max][i]!));
  if (corners.some((d) => d > 1e-6))
    throw new Error(
      `bounds differ: ${JSON.stringify([a.min, a.max])} vs ${JSON.stringify([b.min, b.max])}`,
    );
}
