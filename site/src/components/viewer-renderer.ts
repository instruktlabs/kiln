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

/** The viewer's renderers, whose instanced parts are built to share shaders. */
const sharing = new WeakSet<object>();
let builderPatched = false;

/**
 * Let every GPU batch with the same material share one shader. Below 1,024 copies, r186's
 * `nodes/accessors/Instance.js` puts a batch's matrices in a uniform array named after that
 * batch's own node and sized to its count, so each `InstancedMesh` builds a shader of its own.
 * A cathedral exported with `--draws minimal` has 176 batches. On WebGL2 they cost 203 programs,
 * and it first drew at 52 s against 9 s for the plain file. On WebGPU they cost 399 modules and
 * held the page for 5 s. Above the limit, three reads the matrices as instanced attributes, which
 * are named by slot. With a limit of zero every batch does that: 29 programs and a first frame at
 * 10 s on WebGL2, and 55 modules with no task over 0.2 s on WebGPU.
 *
 * Skinning and `RangeNode` read the same limit, so the zero is reported only while an instanced
 * part is being built, and a skeleton keeps its bones in a uniform block as before. Only the
 * viewer's renderers are changed.
 */
export function shareInstancedShaders(renderer: THREE.WebGPURenderer): void {
  sharing.add(renderer);
  if (builderPatched) return;
  builderPatched = true;
  const prototype = THREE.NodeBuilder.prototype as unknown as {
    getUniformBufferLimit(this: {
      renderer: object;
      object?: { isInstancedMesh?: boolean };
    }): number;
  };
  const limit = prototype.getUniformBufferLimit;
  prototype.getUniformBufferLimit = function () {
    if (sharing.has(this.renderer) && this.object?.isInstancedMesh) return 0;
    return limit.call(this);
  };
}

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
    shareInstancedShaders(renderer);
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
 * GPU batches from which WebGPU builds ahead too. Each one is a node graph of its own, about 17 ms per pass on the
 * page's thread, and the view and its shadow bake are two passes: 16 batches hold the page for about half a second.
 */
const BATCHES_BUILT_AHEAD = 16;

function gpuBatches(object: THREE.Object3D): number {
  let batches = 0;
  object.traverse((part) => {
    if ((part as THREE.InstancedMesh).isInstancedMesh) batches += 1;
  });
  return batches;
}

/**
 * Whether drawing `object` for the first time makes the page wait for its shaders. WebGL2 compiles on the page's
 * thread: through Direct3D a skinned mech held the page for up to 2.9 s and first drew at 4.7 s. WebGPU builds
 * pipelines in the GPU process, and compiling there first only delayed the mech's first frame, by 1-2.7 s. Its node
 * graphs are built on the page's thread, though, and r186 builds each `InstancedMesh`'s alone: `RenderObject` adds
 * the object's uuid to the cache key. A cathedral with 176 batches held the page for 5.7 s in its first frame.
 */
export const compilesOnPageThread = (renderer: THREE.WebGPURenderer, object?: THREE.Object3D) =>
  viewerBackend(renderer) === 'webgl2' ||
  (object !== undefined && gpuBatches(object) >= BATCHES_BUILT_AHEAD);

/**
 * Where the page would wait on shaders, build every pipeline `object` needs before it is first drawn, culled parts
 * included. With it nothing held the page longer than about 0.9 s while the WebGL2 mech loaded, the unskinned file's
 * own figure, and it first drew at 3.6-4.5 s. `compileAsync` reads everything it uses before its first wait, so
 * culling is restored as soon as it returns.
 */
export function compileAhead(
  renderer: THREE.WebGPURenderer,
  object: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
): Promise<void> {
  if (!compilesOnPageThread(renderer, object)) return Promise.resolve();
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
