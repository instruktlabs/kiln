import * as THREE from 'three/webgpu';
import { installReviewToneMapping } from '../lib/review-rig-three';

export type ViewerBackend = 'webgpu' | 'webgl2';

interface TextureManager {
  updateTexture(texture: THREE.Texture, options?: object): void;
  _destroyTexture(texture: THREE.Texture): void;
}

/**
 * r186's texture manager keeps its disposal listeners after `dispose()`, and a texture shared between renderers then
 * holds every closed viewer in memory. The scene kit found this (`scene-kit/src/renderer/texture-cleanup.ts`); the
 * same release is needed here, where a visitor can open and close a view many times on one page.
 */
function trackTextures(renderer: THREE.WebGPURenderer): () => void {
  const manager = (renderer as unknown as { _textures?: TextureManager })._textures;
  if (!manager) return () => {};
  const textures = new Set<THREE.Texture>();
  const { updateTexture: update, _destroyTexture: destroy } = manager;
  manager.updateTexture = function (texture, options) {
    textures.add(texture);
    return update.call(this, texture, options);
  };
  manager._destroyTexture = function (texture) {
    textures.delete(texture);
    return destroy.call(this, texture);
  };
  return () => {
    for (const texture of textures) destroy.call(manager, texture);
    textures.clear();
    manager.updateTexture = update;
    manager._destroyTexture = destroy;
  };
}

const releases = new WeakMap<THREE.WebGPURenderer, () => void>();

/**
 * The view's renderer: WebGPU where the browser has it, and three's own WebGL2 backend where it does not. Everything
 * drawn is three's node materials, so both backends run the same shaders. No power preference is passed: Chromium on
 * Windows ignores it and warns.
 */
export function viewerRendererFactory(options: { forceWebGL?: boolean } = {}) {
  return async ({ canvas }: { canvas: HTMLCanvasElement | OffscreenCanvas }) => {
    const renderer = new THREE.WebGPURenderer({
      canvas: canvas as HTMLCanvasElement,
      antialias: true,
      alpha: true,
      forceWebGL: options.forceWebGL ?? false,
    });
    installReviewToneMapping(renderer);
    await renderer.init();
    releases.set(renderer, trackTextures(renderer));
    (canvas as HTMLCanvasElement).dataset.viewerBackend = viewerBackend(renderer);
    return renderer;
  };
}

export function viewerBackend(renderer: THREE.WebGPURenderer): ViewerBackend {
  return (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2';
}

/**
 * Whether drawing something new makes the page wait for its shaders. WebGL2 compiles on the page's thread: through
 * Direct3D a skinned mech held the page for up to 2.9 s and first drew at 4.7 s. WebGPU builds pipelines in the GPU
 * process, and compiling there first only delayed the mech's first frame, by 1-2.7 s.
 */
export const compilesOnPageThread = (renderer: THREE.WebGPURenderer) =>
  viewerBackend(renderer) === 'webgl2';

/**
 * Where the page would wait on shaders, build every pipeline `object` needs before it is first drawn, culled parts
 * included. With it the WebGL2 mech first drew at 1.5-1.7 s, and nothing held the page longer than the unskinned
 * file's own 1 s. `compileAsync` reads everything it uses before its first wait, so culling is restored as soon as it
 * returns.
 */
export function compileAhead(
  renderer: THREE.WebGPURenderer,
  object: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
): Promise<void> {
  if (!compilesOnPageThread(renderer)) return Promise.resolve();
  const culled: THREE.Object3D[] = [];
  object.traverse((part) => {
    if (!part.frustumCulled) return;
    culled.push(part);
    part.frustumCulled = false;
  });
  try {
    return renderer.compileAsync(object, camera, scene);
  } finally {
    for (const part of culled) part.frustumCulled = true;
  }
}

/** Close a view's renderer and let go of what it uploaded. */
export function releaseViewerRenderer(renderer: THREE.WebGPURenderer) {
  releases.get(renderer)?.();
  releases.delete(renderer);
  return renderer.dispose();
}
