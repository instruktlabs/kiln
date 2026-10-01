/** The node builder method the hook overrides (three 0.186.0 `NodeBuilder.getUniformBufferLimit`, in bytes). */
export interface InstanceAttributeBuilder { getUniformBufferLimit(): number }
type BuilderCreated = (builder: InstanceAttributeBuilder, target: unknown) => void;
/** The part of three's renderer the hook uses: the documented `debug.onNodeBuilderCreated` callback, run after a node builder is created and before it builds. */
export interface InstanceAttributeRenderer { debug: { onNodeBuilderCreated: BuilderCreated | null } }

/** Whether a node builder's target is an instanced mesh whose matrices three would otherwise put in a uniform buffer. */
export function takesInstanceAttributes(target: unknown): boolean {
  const object = (target as { object?: { isInstancedMesh?: boolean; instanceMatrix?: { isStorageInstancedBufferAttribute?: boolean } | null } } | null)?.object;
  return !!object?.isInstancedMesh && !!object.instanceMatrix && object.instanceMatrix.isStorageInstancedBufferAttribute !== true;
}

/**
 * M4 item 1 (the WebGL2 hitches). three 0.186.0 puts the matrices of an instanced mesh that fit the backend's uniform
 * buffer limit (64 KB, 1,024 matrices, on both backends here) into a uniform buffer declared in that mesh's own vertex
 * shader (`uniform NodeBuffer_<node id> { mat4 buffer<node id>[<count>]; }`). So every such mesh compiles a program or
 * pipeline of its own, which is what linked lazily as batches first came into view, and its whole buffer is uploaded
 * again every frame it draws (the buffer belongs to the per-object uniform group): 70 uploads and 924 KB a frame on
 * the minimal tier here. Above the limit three reads the same matrices as an instanced vertex attribute (four vec4
 * columns of the same array): meshes with the same material and vertex layout then share programs, and the matrices
 * upload only when their version changes. The hook makes every instanced mesh's node builder report no uniform buffer
 * room, so all of them take the attribute path. Same matrices and the same transform: the look A/B at the 12 sealed views
 * on both backends (evidence/m4/instance-ab) found 13 of 24 captures identical and the rest within 1/255 in one channel
 * in at most 80 of 921,600 pixels, as much as a repeat of the same capture differs.
 * Chains any earlier callback; the returned function restores it.
 */
export function installInstanceAttributes(renderer: InstanceAttributeRenderer): () => void {
  const debug = renderer.debug, previous = debug.onNodeBuilderCreated;
  const hook: BuilderCreated = (builder, target) => {
    previous?.(builder, target);
    if (takesInstanceAttributes(target)) builder.getUniformBufferLimit = () => 0;
  };
  debug.onNodeBuilderCreated = hook;
  return () => { if (debug.onNodeBuilderCreated === hook) debug.onNodeBuilderCreated = previous; };
}
