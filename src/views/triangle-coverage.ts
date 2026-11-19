/** Pixel-centre coverage shared by the flat CPU renderers. No shading/culling policy. */

/** Per edge: origin x, y; delta dx, dy; sign; inclusive (1 or 0). */
const EDGE = 6;

/**
 * Store one edge in `edges` at slot `k`. Screen Y grows downward: for positive area, top/left
 * edges own exact ties. Both triangles evaluate a shared edge from the SAME endpoint; merely
 * reversing (B-A)x(P-A) can round differently from (A-B)x(P-B), causing cracks or overlap.
 */
function setEdge(
  edges: Float64Array,
  k: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  orientation: number,
): void {
  const dx = (bx - ax) * orientation;
  const dy = (by - ay) * orientation;
  const inclusive = dy < 0 || (dy === 0 && dx > 0);
  const forward = ax < bx || (ax === bx && ay <= by);
  const o = k * EDGE;
  if (forward) {
    edges[o] = ax;
    edges[o + 1] = ay;
    edges[o + 2] = bx - ax;
    edges[o + 3] = by - ay;
    edges[o + 4] = orientation;
  } else {
    edges[o] = bx;
    edges[o + 1] = by;
    edges[o + 2] = ax - bx;
    edges[o + 3] = ay - by;
    edges[o + 4] = -orientation;
  }
  edges[o + 5] = inclusive ? 1 : 0;
}

function edgeValue(edges: Float64Array, k: number, x: number, y: number): number {
  const o = k * EDGE;
  return (edges[o + 2]! * (y - edges[o + 1]!) - edges[o + 3]! * (x - edges[o]!)) * edges[o + 4]!;
}

/**
 * Reusable coverage state: one instance serves every triangle of a raster, so preparing a
 * triangle allocates nothing. `prepare` returns false where `prepareTriangleCoverage` returns
 * null; the bounds and `sample` are then valid until the next `prepare`.
 */
export class TriangleCoverage {
  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 0;
  private readonly edges = new Float64Array(3 * EDGE);

  prepare(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    size: number,
  ): boolean {
    if (
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy)
    )
      return false;
    const edges = this.edges;
    setEdge(edges, 0, ax, ay, bx, by, 1);
    const area = edgeValue(edges, 0, cx, cy);
    if (!Number.isFinite(area) || area === 0) return false;
    const orientation = area < 0 ? -1 : 1;
    setEdge(edges, 0, bx, by, cx, cy, orientation);
    setEdge(edges, 1, cx, cy, ax, ay, orientation);
    setEdge(edges, 2, ax, ay, bx, by, orientation);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) return false;
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    return true;
  }

  /** Writes A/B/C weights into caller-owned storage; no per-pixel allocations. */
  sample(x: number, y: number, weights: Float64Array): boolean {
    const edges = this.edges;
    const wa = edgeValue(edges, 0, x, y),
      wb = edgeValue(edges, 1, x, y),
      wc = edgeValue(edges, 2, x, y);
    if (
      wa < 0 ||
      wb < 0 ||
      wc < 0 ||
      (wa === 0 && edges[5] === 0) ||
      (wb === 0 && edges[EDGE + 5] === 0) ||
      (wc === 0 && edges[2 * EDGE + 5] === 0)
    )
      return false;
    // Evaluate all three edges directly. Deriving one as 1-wa-wb was the source
    // of false negative coverage. Tie ownership never biases interpolation.
    const sum = wa + wb + wc;
    if (!(sum > 0) || !Number.isFinite(sum)) return false;
    weights[0] = wa / sum;
    weights[1] = wb / sum;
    weights[2] = wc / sum;
    return true;
  }
}

export function prepareTriangleCoverage(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  size: number,
): TriangleCoverage | null {
  const coverage = new TriangleCoverage();
  return coverage.prepare(ax, ay, bx, by, cx, cy, size) ? coverage : null;
}
