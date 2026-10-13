/** Pixel-centre coverage shared by the flat CPU renderers. No shading/culling policy. */
interface Edge {
  x: number;
  y: number;
  dx: number;
  dy: number;
  sign: number;
  inclusive: boolean;
}

function edge(ax: number, ay: number, bx: number, by: number, orientation: number): Edge {
  const dx = (bx - ax) * orientation;
  const dy = (by - ay) * orientation;
  // Screen Y grows downward. For positive area, top/left edges own exact ties.
  const inclusive = dy < 0 || (dy === 0 && dx > 0);
  // Both triangles evaluate a shared edge from the SAME endpoint. Merely reversing
  // (B-A)x(P-A) can round differently from (A-B)x(P-B), causing cracks/overlap.
  const forward = ax < bx || (ax === bx && ay <= by);
  return forward
    ? { x: ax, y: ay, dx: bx - ax, dy: by - ay, sign: orientation, inclusive }
    : { x: bx, y: by, dx: ax - bx, dy: ay - by, sign: -orientation, inclusive };
}

function value(e: Edge, x: number, y: number): number {
  return (e.dx * (y - e.y) - e.dy * (x - e.x)) * e.sign;
}

export function prepareTriangleCoverage(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  size: number,
) {
  if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) return null;
  const area = value(edge(ax, ay, bx, by, 1), cx, cy);
  if (!Number.isFinite(area) || area === 0) return null;
  const orientation = area < 0 ? -1 : 1;
  const a = edge(bx, by, cx, cy, orientation);
  const b = edge(cx, cy, ax, ay, orientation);
  const c = edge(ax, ay, bx, by, orientation);
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) return null;
  return {
    minX,
    maxX,
    minY,
    maxY,
    /** Writes A/B/C weights into caller-owned storage; no per-pixel allocations. */
    sample(x: number, y: number, weights: Float64Array): boolean {
      const wa = value(a, x, y),
        wb = value(b, x, y),
        wc = value(c, x, y);
      if (
        wa < 0 ||
        wb < 0 ||
        wc < 0 ||
        (wa === 0 && !a.inclusive) ||
        (wb === 0 && !b.inclusive) ||
        (wc === 0 && !c.inclusive)
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
    },
  };
}
