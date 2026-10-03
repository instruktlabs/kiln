import type { Camera, Layers, Material, Object3D, Scene } from 'three/webgpu';

/** The part of three's WebGPURenderer (WebGPU and WebGL2 backends alike) that the warm pass uses. */
export interface WarmPassRenderer { compileAsync(object: Object3D, camera: Camera, targetScene?: Scene | null): Promise<unknown> }
export type WarmPhase = 'compiling' | 'drawing' | 'done';
export interface WarmPassStats {
  /** Visible drawables plus explicitly registered pose variants on the main camera layers. */
  renderables: number;
  /** Compile chains; renderables that share a material and vertex layout share a chain. */
  chains: number;
  /** Chains compiled at once (at most WARM_CONCURRENCY by default, never more than the chains). */
  concurrency: number;
  /** compileAsync calls that rejected; their objects compile on first draw instead, as before the pass. */
  failed: number;
  /** Frames rendered while the pass compiled. */
  compileFrames: number;
  /** Whether the world was hidden while compiling and revealed after (the first world of a mount; a rebuilt world stays visible). */
  revealed: boolean;
}
export interface WarmPass {
  readonly phase: WarmPhase;
  readonly stats: WarmPassStats;
  /** Call once per frame before the render; true once the pass is complete (the caller may then declare the world built). */
  step(): boolean;
  /** Restores culling and registered-pose visibility, and shows the world it hid; pending compiles finish without effect. */
  dispose(): void;
}

/**
 * Chains compiled at once by default. three 0.186.0's compileAsync builds each node material in slices, yielding to the
 * main thread between shader stages, so every concurrent build keeps its temporaries alive across the others' slices:
 * with all of the Farm's chains at once (221 on minimal, 165 on balanced and high) about 210 to 230 MB of them outlived
 * the young generation and one major collection of that size followed ready by seconds (17 to 26 ms here, M4). A few
 * builds at a time still overlap one build's CPU work with another's program link or pipeline creation, and were also
 * faster to ready: cold loads at 1, 2, 4, 6, 8, 12, 16 and all chains on both backends (evidence/m4/hitches/README.md),
 * 8 was at or near the shortest time to ready in every case and left about 100 to 140 MB, collected by one major
 * collection of 3.6 to 4.4 ms here.
 */
export const WARM_CONCURRENCY = 8;
export interface WarmPassOptions {
  /** Hide the world while compiling and show it after (the first world of a mount; a rebuilt world stays visible). */
  reveal: boolean;
  /** Chains compiled at once; defaults to WARM_CONCURRENCY. */
  concurrency?: number;
  /** Called once as the drawing frame starts, with the world shown and culling off (S5: the cached shadow's prime). */
  onDraw?(): void;
}

// Explicit Farm consumer variants only; ordinary hidden model branches stay excluded.
const poseVariants = new WeakSet<Object3D>();
export function registerWarmPoseVariant(object: Object3D): () => void {
  poseVariants.add(object); return () => { poseVariants.delete(object); };
}

const drawable = (object: Object3D) => { const o = object as unknown as Record<string, unknown>; return !!(o.isMesh || o.isLine || o.isPoints || o.isSprite); };

/** Collect visible branches plus explicitly registered hidden pose roots. A registration
 * never pierces an unrelated hidden ancestor or makes ordinary hidden children visible. */
function warmTargets(root: Object3D, layers?: Layers) {
  const drawables: Object3D[] = [], variants: Object3D[] = [];
  const visit = (object: Object3D) => {
    if (!object.visible) { if (!poseVariants.has(object)) return; variants.push(object); }
    if (drawable(object) && (!layers || object.layers.test(layers))) drawables.push(object);
    for (const child of object.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return { drawables, variants };
}
/** Drawables below root (root visibility ignored), including registered pose variants.
 * With layers, only nodes drawn by that camera are returned; shadow proxies remain draw-only. */
export function warmRenderables(root: Object3D, layers?: Layers): Object3D[] {
  return warmTargets(root, layers).drawables;
}

/**
 * Compile chains. three keys node builds per material structure and vertex layout, but per object for instanced
 * meshes (0.186.0 puts an instanced mesh's own id in its render-object cache key), so each instanced mesh is its own
 * chain (on the Farm's instanced-attribute path those builds produce shared shader code, and three compiles each
 * distinct program or pipeline once; instance-attributes.ts); other drawables that share material instances and vertex
 * layout are compiled one after another, so the first builds the shaders and the rest reuse them instead of building the
 * same shaders concurrently.
 */
export function warmChainKey(object: Object3D): string {
  const o = object as unknown as { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean; count?: number; material?: Material | Material[];
    geometry?: { attributes: Record<string, unknown>; morphAttributes?: Record<string, unknown>; index: unknown }; skeleton?: { bones: unknown[] } };
  if (o.isInstancedMesh || o.isBatchedMesh || (o.count ?? 1) > 1) return `own:${object.uuid}`;
  const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(material => material?.uuid ?? '-').join(',');
  const g = o.geometry, layout = g ? `${Object.keys(g.attributes).sort().join(',')}|${Object.keys(g.morphAttributes ?? {}).sort().join(',')}|${g.index ? 'indexed' : ''}` : '';
  return [materials, layout, o.isSkinnedMesh ? `skin${o.skeleton?.bones.length ?? 0}` : '', object.receiveShadow ? 'receive' : ''].join('#');
}

/**
 * Owner decision 2026-09-29 22:05 (SPEC 6.4): before the scene declares ready it compiles every render pipeline its
 * world needs, whatever the camera sees, so no pipeline is compiled on a later frame (the M4 WebGL2 hitches were
 * programs linked when batches first came into view).
 *
 * 1. compiling: three's compileAsync for every drawable below root, one call per drawable with frustum culling off for
 *    that call, a few chains at a time (WARM_CONCURRENCY), so that WebGPU creates pipelines with
 *    createRenderPipelineAsync and WebGL2 links programs through KHR_parallel_shader_compile beside the next node
 *    builds rather than one after another inside a frame. With
 *    reveal (the first world of a mount) the world stays hidden meanwhile, so no frame compiles synchronously, and is
 *    shown when the compiles are done; the lights are outside the world, so the pipelines match the lit frame.
 * 2. drawing: the world is shown and one frame is drawn with frustum culling off for every drawable, which compiles
 *    what compileAsync does not (shadow-map pipelines, which three skips while pre-compiling) and makes every
 *    first-draw driver variant happen before ready. Drawables off the camera's layers (shadow stand-ins) are not compiled
 *    but draw unculled here too; `onDraw` runs as this frame starts (the cached shadow re-arms at the reveal).
 * Registered hidden pose variants compile individually and are shown only for the warm drawing
 * frame, including their shadow proxies. Ordinary hidden branches stay hidden.
 * 3. done: culling and pose visibility are restored; the next frame is the first complete frame.
 */
export function startWarmPass(renderer: WarmPassRenderer, scene: Scene, camera: Camera, root: Object3D, options: WarmPassOptions): WarmPass {
  const { drawables, variants } = warmTargets(root), renderables = drawables.filter(o => o.layers.test(camera.layers)), chains = new Map<string, Object3D[]>();
  for (const object of renderables) { const key = warmChainKey(object); (chains.get(key) ?? chains.set(key, []).get(key)!).push(object); }
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? WARM_CONCURRENCY), chains.size));
  const stats: WarmPassStats = { renderables: renderables.length, chains: chains.size, concurrency: chains.size ? concurrency : 0, failed: 0, compileFrames: 0, revealed: options.reveal };
  let phase: WarmPhase = 'compiling', compiled = false, disposed = false, unculled: Object3D[] = [], revealedVariants: Object3D[] = [];
  const restoreDrawing = () => {
    for (const object of unculled) object.frustumCulled = true;
    for (const object of revealedVariants) object.visible = false;
    unculled = []; revealedVariants = [];
  };
  if (options.reveal) root.visible = false;
  // compileAsync collects its render items synchronously, from the object and its descendants; each drawable is its own
  // unit here, so its children are hidden and its culling is off for exactly that synchronous part.
  const compileOne = (object: Object3D) => {
    const children = object.children.filter(child => child.visible), culled = object.frustumCulled, visible = object.visible;
    for (const child of children) child.visible = false;
    object.frustumCulled = false; object.visible = true;
    try { return renderer.compileAsync(object, camera, scene); }
    finally { object.frustumCulled = culled; object.visible = visible; for (const child of children) child.visible = true; }
  };
  // Each slot takes the next chain in first-seen order and compiles its drawables one after another.
  const queue = [...chains.values()];
  const slot = async () => {
    for (let list = queue.shift(); list; list = queue.shift()) {
      for (const object of list) {
        if (disposed) return;
        try { await compileOne(object); } catch { stats.failed++; }
      }
    }
  };
  void Promise.all(Array.from({ length: chains.size ? concurrency : 0 }, slot)).then(() => { compiled = true; });
  return {
    get phase() { return phase; },
    stats,
    step() {
      if (disposed) return false;
      if (phase === 'compiling') {
        if (!compiled) { stats.compileFrames++; return false; }
        if (options.reveal) root.visible = true;
        unculled = drawables.filter(object => object.frustumCulled);
        for (const object of unculled) object.frustumCulled = false;
        revealedVariants = variants.filter(object => !object.visible);
        for (const object of revealedVariants) object.visible = true;
        phase = 'drawing';
        try { options.onDraw?.(); } catch (error) { restoreDrawing(); disposed = true; throw error; }
        return false;
      }
      if (phase === 'drawing') {
        restoreDrawing(); phase = 'done';
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (phase === 'compiling' && options.reveal) root.visible = true;
      restoreDrawing();
    },
  };
}
