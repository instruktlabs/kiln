/**
 * The first frame of a town would otherwise create every render pipeline it needs inside itself, one after another:
 * several seconds in which the page shows a finished scene and nothing moves. Compiled ahead through the renderer's
 * async path, the driver builds them side by side while frames keep drawing, and the town appears when it can be
 * drawn. The sun's shadow pass is outside this: three's compileAsync walks the camera's pass only, and it restores the
 * render target it was called with at every yield, so compiling against the shadow map sends the scene's own frames
 * there. Those pipelines are still created in the first frame that shows the town.
 */
import type { Camera, Object3D, Scene } from 'three/webgpu';

/** The part of three's WebGPURenderer the warm-up uses. */
export interface WarmRenderer { compileAsync(object: Object3D, camera: Camera, targetScene?: Scene | null): Promise<unknown> }

/** Whether `object` hangs under `scene`: the lights must be in the scene before pipelines are compiled against them. */
export function inScene(object: Object3D | null | undefined, scene: Object3D): boolean {
  for (let node = object ?? null; node; node = node.parent) if (node === scene) return true;
  return false;
}

/** A warm-up that has waited this many frames for the sun starts without it. */
export const WARM_WAIT_FRAMES = 30;

/**
 * Whether the warm-up can start: the renderer can compile, and the sun is in the scene or has kept it waiting long
 * enough. Without the sun the pipelines would be compiled for other lights and made again on the first frame.
 */
export function warmDue(initialized: boolean, lit: boolean, waited: number): boolean {
  return initialized && (lit || waited >= WARM_WAIT_FRAMES);
}

/**
 * Compile `root`'s pipelines while it stays hidden. three collects what to compile synchronously inside the call, so the
 * root is shown for exactly that long; no frame draws it before the returned promise settles. The promise never rejects:
 * a failed warm-up leaves the pipelines to the first frame, as before.
 */
export function warmHidden(renderer: WarmRenderer, root: Object3D, camera: Camera, scene: Scene): Promise<boolean> {
  let compiled: Promise<unknown>;
  root.visible = true;
  try { compiled = renderer.compileAsync(root, camera, scene); }
  catch (error) { compiled = Promise.reject(error); }
  finally { root.visible = false; }
  return compiled.then(() => true, () => false);
}
