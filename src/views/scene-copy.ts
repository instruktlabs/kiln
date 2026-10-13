import {
  DoubleSide,
  Group,
  Skeleton,
  type Bone,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from 'three';

/** Owned review hierarchy and skeletons; immutable geometry/textures stay shared. */
export function cloneReviewScene(
  root: Object3D,
  options: { omitHidden?: boolean; doubleSided?: boolean } = {},
): Object3D {
  const visible = new Set<Object3D>();
  if (options.omitHidden) root.traverseVisible((node) => visible.add(node));
  else root.traverse((node) => visible.add(node));
  const retained = new Set(visible);
  const hierarchy = new Set<Object3D>();
  root.traverse((node) => hierarchy.add(node));

  // Visibility hides drawing, not the transforms used by another mesh's skeleton.
  for (const node of visible) {
    const mesh = node as SkinnedMesh;
    if (!mesh.isSkinnedMesh) continue;
    if (!mesh.skeleton) throw new Error(`Review skin ${mesh.name} has no skeleton.`);
    for (const bone of mesh.skeleton.bones) {
      if (!hierarchy.has(bone)) {
        throw new Error(
          `Skin bone ${bone?.name ?? '(missing)'} is outside the review hierarchy. Include its ancestors in the review root.`,
        );
      }
      for (let ancestor: Object3D | null = bone; ancestor; ancestor = ancestor.parent) {
        retained.add(ancestor);
        if (ancestor === root) break;
      }
    }
  }

  const copies = new Map<Object3D, Object3D>();
  const copyNode = (node: Object3D): Object3D => {
    // A hidden mesh/light can be a joint ancestor. Keep its transform as a group,
    // not its drawing payload. Referenced bones must retain their Bone identity.
    const copy =
      !visible.has(node) && !(node as Bone).isBone
        ? new Group().copy(node, false)
        : node.clone(false);
    copies.set(node, copy);
    if (options.omitHidden) copy.visible = true;
    for (const child of node.children) if (retained.has(child)) copy.add(copyNode(child));
    return copy;
  };
  if (!retained.has(root)) {
    const empty = new Group();
    empty.name = root.name;
    return empty;
  }
  const copy = copyNode(root);
  for (const [source, target] of copies) {
    const sourceSkin = source as SkinnedMesh;
    const targetSkin = target as SkinnedMesh;
    if (targetSkin.isSkinnedMesh) {
      // SkinnedMesh.copy already preserves bind mode/matrices and morph weights.
      // Reconnect only to copied bones, including detached skeletons. Keep inverse
      // matrices independent too, so later edits cannot mutate the retained source.
      targetSkin.skeleton = new Skeleton(
        sourceSkin.skeleton.bones.map((bone) => copies.get(bone) as Bone),
        sourceSkin.skeleton.boneInverses.map((matrix) => matrix.clone()),
      );
    }
    const mesh = target as Mesh;
    if (options.doubleSided && mesh.isMesh) {
      const prepare = (material: Material) => {
        const owned = material.clone();
        owned.side = DoubleSide;
        return owned;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(prepare)
        : prepare(mesh.material);
    }
  }
  return copy;
}
