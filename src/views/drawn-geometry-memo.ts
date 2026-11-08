import { derivativeStateKey } from './derivative-memo';
import * as raster from './raster';

type DrawnGeometry = ReturnType<typeof raster.measureDrawnGeometry>;

const measured = new WeakMap<object, { key: string; result: DrawnGeometry }>();

const copy = (result: DrawnGeometry): DrawnGeometry => ({
  min: [...result.min],
  max: [...result.max],
  triangles: result.triangles,
});

/**
 * `measureDrawnGeometry`, walked once per node and scene state. Every shot of a call frames
 * against the subject's box and the scene's, and on a large asset each walk visits millions of
 * vertices. The answer depends only on what a `geometry` state key (views/derivative-memo.ts)
 * names: the tree, visibility, transforms, attributes, morphs, skins and instances. An unchanged
 * node answers from its last walk.
 * A scene that is not registered is walked every time.
 */
export function measuredDrawnGeometry(node: unknown): DrawnGeometry {
  const key = derivativeStateKey(node, {}, 'geometry');
  if (key === undefined) return raster.measureDrawnGeometry(node);
  const hit = measured.get(node as object);
  if (hit?.key === key) return copy(hit.result);
  const result = raster.measureDrawnGeometry(node);
  measured.set(node as object, { key, result: copy(result) });
  return result;
}
