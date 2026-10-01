import type { Texture, WebGPURenderer } from 'three/webgpu';
interface TextureManager {
  updateTexture(texture: Texture, options?: object): void;
  _destroyTexture(texture: Texture): void;
}
/**
 * r186 Textures inherits DataMap.dispose(), which drops its WeakMap without
 * detaching texture disposal listeners. Shared DFG_LUT then retains every old
 * renderer. Track this manager's uploads and release its own records before
 * renderer.dispose(). Never dispose the shared CPU Texture or another renderer.
 * Source evidence: evidence/m1/b05-investigation/retainer-paths-*.txt.
 */
export function installRendererTextureCleanup(renderer: WebGPURenderer): () => void {
  const manager = (renderer as unknown as { _textures?: TextureManager })._textures;
  if (!manager) return () => {};
  const textures = new Set<Texture>(), update = manager.updateTexture, destroy = manager._destroyTexture;
  let released = false;
  manager.updateTexture = function(texture, options) { textures.add(texture); return update.call(this, texture, options); };
  manager._destroyTexture = function(texture) { textures.delete(texture); return destroy.call(this, texture); };
  return () => {
    if (released) return; released = true;
    let failure: unknown;
    try { for (const texture of textures) try { destroy.call(manager, texture); } catch(error) { failure ??= error; } }
    finally { textures.clear(); manager.updateTexture = update; manager._destroyTexture = destroy; }
    if(failure)throw failure;
  };
}
