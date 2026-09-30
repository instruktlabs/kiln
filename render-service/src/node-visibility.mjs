// KHR_node_visibility for the service's GLTFLoader.
//
// three 0.186's GLTFLoader does not implement the extension, so it would draw every node. A node
// whose extension says `visible: false` is hidden here with its subtree, as a conforming loader
// draws it, and the legacy sheet frames what draws. The engine's viewer does the same in
// `src/viewer/visibility.ts`. No three import: the caller owns the Box3 instances.

/** Hide every node the extension marks `visible: false`; returns how many objects it hid. */
export function applyNodeVisibility(gltf) {
  const nodes = gltf?.parser?.json?.nodes ?? [];
  const hidden = new Set();
  nodes.forEach((node, index) => {
    if (node?.extensions?.KHR_node_visibility?.visible === false) hidden.add(index);
  });
  if (hidden.size === 0) return 0;
  let count = 0;
  for (const root of gltf.scenes?.length ? gltf.scenes : [gltf.scene]) {
    root?.traverse((object) => {
      const index = gltf.parser.associations.get(object)?.nodes;
      if (index === undefined || !hidden.has(index)) return;
      object.visible = false;
      count++;
    });
  }
  return count;
}

/**
 * `box.expandByObject(object)` (three's conservative, per-object bounding boxes) over what
 * draws: a hidden object adds neither itself nor its subtree. `scratch` is a second Box3.
 */
export function expandByDrawnObject(box, scratch, object) {
  if (object.visible === false) return box;
  object.updateWorldMatrix(false, false);
  const geometry = object.geometry;
  if (geometry !== undefined) {
    if (object.boundingBox !== undefined) {
      if (object.boundingBox === null) object.computeBoundingBox();
      scratch.copy(object.boundingBox);
    } else {
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      scratch.copy(geometry.boundingBox);
    }
    scratch.applyMatrix4(object.matrixWorld);
    box.union(scratch);
  }
  for (const child of object.children) expandByDrawnObject(box, scratch, child);
  return box;
}
