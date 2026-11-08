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
 * same release is needed here, where a visitor can open and close a view many times on one page. r187's
 * `Textures.dispose()` releases the textures it tracked itself; this release runs first and stays until a browser
 * heap check on r187 shows a closed viewer is collected without it.
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
 *
 * GPU batches of one material share their shaders without help: three r187 binds an `InstancedMesh`'s matrices as an
 * instanced attribute wherever its geometry leaves a vertex buffer free. A cathedral exported with `--draws minimal`
 * (176 batches) costs 55 WebGPU modules and 29 WebGL2 programs; r186 built each batch alone, 399 modules and 203
 * programs, until the viewer reported a zero uniform limit for instanced parts. In r187 that zero would reach only the
 * per-object fallback for geometry with no vertex buffer to spare, and push the matrices onto one more.
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
 * graphs are built on the page's thread, though, and r186 built each `InstancedMesh`'s alone: `RenderObject` added
 * the object's uuid to the cache key. A cathedral with 176 batches held the page for 5.7 s in its first frame. r187
 * keys a batch by the kind of its instance data instead; the threshold stays until that is re-measured without it.
 */
export const compilesOnPageThread = (renderer: THREE.WebGPURenderer, object?: THREE.Object3D) =>
  viewerBackend(renderer) === 'webgl2' ||
  (object !== undefined && gpuBatches(object) >= BATCHES_BUILT_AHEAD);

/**
 * Where the page would wait on shaders, build every pipeline `object` needs before it is first drawn, culled parts
 * included. With it nothing held the page longer than about 0.9 s while the WebGL2 mech loaded, the unskinned file's
 * own figure, and it first drew at 3.6-4.5 s. `compileAsync` reads everything it uses before its first wait, so
 * culling is restored as soon as it returns. The model is built for the page's target, in its turn (`compileInTurn`).
 */
export function compileAhead(
  renderer: THREE.WebGPURenderer,
  object: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
): Promise<void> {
  if (!compilesOnPageThread(renderer, object)) return Promise.resolve();
  return compileInTurn(renderer, null, () => {
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
  });
}

/** The target a build holds current between the pieces of its work, and the page's own (see `compileInTurn`). */
const holds = new WeakMap<
  THREE.WebGPURenderer,
  { target: THREE.RenderTarget | null; page: THREE.RenderTarget | null }
>();
const turns = new WeakMap<THREE.WebGPURenderer, Promise<unknown>>();
const framesKeptOnPage = new WeakSet<THREE.WebGPURenderer>();

/** A frame drawn while a build holds its target current is drawn to the page's target, and the build's is put back. */
function keepFramesOnPage(renderer: THREE.WebGPURenderer) {
  if (framesKeptOnPage.has(renderer)) return;
  framesKeptOnPage.add(renderer);
  const render = renderer.render;
  renderer.render = function (
    this: THREE.WebGPURenderer,
    scene: THREE.Object3D,
    camera: THREE.Camera,
  ) {
    const hold = holds.get(this);
    if (hold === undefined || this.getRenderTarget() !== hold.target)
      return render.call(this, scene, camera);
    this.setRenderTarget(hold.page);
    try {
      render.call(this, scene, camera);
    } finally {
      this.setRenderTarget(hold.target);
    }
  };
}

/**
 * Run `start`, which asks three to build shaders with `target` current (null: the page's), once every build already
 * asked of this renderer has settled. three r187's `compileAsync` makes the target that was current when it began
 * current again after each piece of its later work, and leaves it current when it settles, though the caller put its
 * own back as soon as the call returned: once the shadow bake had built its shaders, every frame was drawn into the
 * bake's target and the model never reached the canvas. So a frame drawn while a build runs goes to the page's target,
 * the page's target is current again when the build settles, and builds take turns, since each would leave its target
 * behind for the other.
 */
export function compileInTurn(
  renderer: THREE.WebGPURenderer,
  target: THREE.RenderTarget | null,
  start: () => Promise<void>,
): Promise<void> {
  keepFramesOnPage(renderer);
  const run = (turns.get(renderer) ?? Promise.resolve()).then(async () => {
    const page = renderer.getRenderTarget();
    if (target !== page) holds.set(renderer, { target, page });
    try {
      await start();
    } finally {
      holds.delete(renderer);
      renderer.setRenderTarget(page);
    }
  });
  turns.set(
    renderer,
    run.catch(() => undefined),
  );
  return run;
}

/** Close a view's renderer and let go of what it uploaded. */
export function releaseViewerRenderer(renderer: THREE.WebGPURenderer) {
  releases.get(renderer)?.();
  releases.delete(renderer);
  return renderer.dispose();
}
