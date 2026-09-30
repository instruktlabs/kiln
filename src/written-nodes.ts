import type { Document, Node as GltfNode } from '@gltf-transform/core';
import type * as THREE from 'three';

/** The one root node both exporters write for the source root. */
function exportedRoot(doc: Document, purpose: string): GltfNode {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const top = scene?.listChildren() ?? [];
  if (top.length !== 1) throw new Error(`${purpose} expects the exporter to write one root node.`);
  return top[0]!;
}

/**
 * Find the node an exporter wrote for a source object.
 *
 * Both exporters write the source hierarchy one node per object in child order, so a node is
 * found by its child-index path from the root and confirmed by name. Resolve every node a
 * pass needs before it moves any: a node leaving the scene shifts its later siblings.
 */
export function writtenNodeResolver(
  root: THREE.Object3D,
  doc: Document,
  purpose: string,
): (node: THREE.Object3D) => GltfNode {
  const top = exportedRoot(doc, purpose);
  return (node) => {
    const path: number[] = [];
    for (let current = node; current !== root; current = current.parent!) {
      if (!current.parent) throw new Error(`${purpose}: ${node.name} is outside the asset root.`);
      path.unshift(current.parent.children.indexOf(current));
    }
    let target: GltfNode | undefined = top;
    for (const index of path) target = target?.listChildren()[index];
    if (!target || (target.getName() || '') !== (node.name || ''))
      throw new Error(
        `${purpose} could not find the written node for ${JSON.stringify(node.name)}.`,
      );
    return target;
  };
}
