/**
 * Release the GPU resources one request's parse allocated: geometry, materials and their textures, and instanced
 * meshes' instance buffers. `keep` holds what every request shares, the environment maps, which must survive:
 * disposing one would break every later render, so it is seeded into the visited set; pooled render targets are never
 * reached from here for the same reason. three removes its own dispose listener on the first call, so re-disposing a
 * shared texture is a no-op. No three import, so the policy is testable without a GPU.
 */
export function disposeGltf(gltf, keep = []) {
  const seen = new Set(keep);
  const dispose = (r) => {
    if (!r || seen.has(r)) return;
    seen.add(r);
    r.dispose();
  };
  for (const root of gltf.scenes?.length ? gltf.scenes : [gltf.scene]) {
    root?.traverse((o) => {
      dispose(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (seen.has(mat)) continue;
        for (const v of Object.values(mat)) if (v?.isTexture) dispose(v);
        dispose(mat);
      }
      // three r187's InstancedMesh.dispose() releases the instance matrix and colour buffers, which r186 left to
      // garbage collection; a batched GLB (EXT_mesh_gpu_instancing) can hold hundreds.
      if (o.isInstancedMesh) dispose(o);
    });
  }
}
