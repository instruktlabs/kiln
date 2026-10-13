/**
 * Composed-scene rasterizer — the default implementation behind the composer's
 * host `SceneRenderPort` (which the engine defines in `composer/render-port.ts`
 * but does NOT implement, to stay decoupled from asset storage).
 *
 * Given a set of placed assets as { Kiln code, position, Y-rotation, scale }, it
 * executes each UNIQUE program once (cached), clones it per placement into a
 * single THREE scene, and rasterizes that scene from one or more view directions
 * into a labelled grid — the same CPU rasterizer the asset-gen six-view uses, so
 * the composer agent SEES exactly what the engine renders. No GLB round-trip and
 * no GLTFLoader (the rasterizer is duck-typed on THREE objects).
 *
 * The host wires it up: resolve each placement's generationId to its stored code,
 * then call this. Studio's `makeSceneRenderPort` is that wiring.
 */
import * as THREE from 'three';

import {
  resolveEvaluatorPortV2,
  type EvaluatorExecutionProfileV2,
  type EvaluatorPortV2,
} from '../evaluator';
import { loadGlbReviewScene } from './glb';
import { encodePng } from './png';
import { rasterizeView, type ViewSpec } from './raster';
import { cloneReviewScene } from './scene-copy';

const DEG = Math.PI / 180;
const PAD = 4;
const PAD_COLOR: readonly [number, number, number] = [10, 11, 13];

/** One placed asset: its Kiln program + the world transform to instance it at. */
export type ComposedPart = {
  /** World position [x, y, z] (kiln frame: +X forward, +Y up, +Z right). */
  pos: [number, number, number];
  /** Y-rotation in degrees. */
  rotYDeg: number;
  /** Uniform scale. */
  scale: number;
} & (
  | {
      /** Exact previously-evaluated GLB bytes. Preferred for production composition. */
      glb: Uint8Array;
      code?: never;
    }
  | {
      /** Trusted-local compatibility or source routed through `evaluatorPort`. */
      code: string;
      glb?: never;
    }
);

/** Three canonical scene angles (kiln frame): a hero 3/4, the reverse 3/4, and a
 *  top-down — enough to read spacing, facing, groupings, and overlaps at a glance. */
export const SCENE_VIEWS: ViewSpec[] = [
  { name: 'Hero 3/4', dir: [0.7, 0.45, 0.7] },
  { name: 'Reverse 3/4', dir: [-0.7, 0.45, -0.7] },
  { name: 'Top', dir: [0, 1, 0.0001] },
];

export interface ComposedSceneRasterResult {
  /** The assembled grid PNG (1..N cells, ≤3 columns). */
  png: Buffer;
  width: number;
  height: number;
  /** View names in grid order (row-major). */
  views: string[];
}

/**
 * Rasterize a composed scene from each view into one labelled grid. Each unique
 * `code` is executed once and cloned per placement (shared geometry, independent
 * transform); the rasterizer frames to the whole composed scene's bounds.
 */
export async function rasterizeComposedScene(
  parts: ComposedPart[],
  opts: {
    views?: ViewSpec[];
    size?: number;
    evaluatorPort?: EvaluatorPortV2;
    evaluatorProfile?: EvaluatorExecutionProfileV2;
  } = {},
): Promise<ComposedSceneRasterResult> {
  const views = opts.views?.length ? opts.views : SCENE_VIEWS;
  const size = opts.size ?? 320;

  const group = new THREE.Group();
  const baseByInput = new Map<string | Uint8Array, THREE.Object3D>();
  for (const part of parts) {
    if ((part.code === undefined) === (part.glb === undefined)) {
      throw new TypeError('Composed part must provide exactly one of code or glb.');
    }
    const key = part.glb ?? part.code!;
    let base = baseByInput.get(key);
    if (!base) {
      const glb = part.glb
        ? Uint8Array.from(part.glb)
        : (
            await resolveEvaluatorPortV2(
              opts.evaluatorPort,
              opts.evaluatorProfile ?? 'trusted-local',
            ).render(part.code!)
          ).glb;
      base = (await loadGlbReviewScene(glb)).root;
      baseByInput.set(key, base);
    }
    const inst = cloneReviewScene(base);
    inst.position.set(part.pos[0], part.pos[1], part.pos[2]);
    inst.rotation.set(0, part.rotYDeg * DEG, 0);
    inst.scale.setScalar(part.scale);
    group.add(inst);
  }
  group.updateMatrixWorld(true);

  const cols = Math.min(Math.max(views.length, 1), 3);
  const rows = Math.ceil(views.length / cols);
  const width = cols * size + (cols + 1) * PAD;
  const height = rows * size + (rows + 1) * PAD;
  const grid = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    grid[i * 3] = PAD_COLOR[0];
    grid[i * 3 + 1] = PAD_COLOR[1];
    grid[i * 3 + 2] = PAD_COLOR[2];
  }

  for (let vi = 0; vi < views.length; vi++) {
    const cell = rasterizeView(group, views[vi]!.dir, { size });
    const col = vi % cols;
    const row = Math.floor(vi / cols);
    const x0 = PAD + col * (size + PAD);
    const y0 = PAD + row * (size + PAD);
    for (let y = 0; y < size; y++) {
      const src = y * size * 3;
      const dst = ((y0 + y) * width + x0) * 3;
      grid.set(cell.subarray(src, src + size * 3), dst);
    }
  }

  return { png: encodePng(grid, width, height), width, height, views: views.map((v) => v.name) };
}
