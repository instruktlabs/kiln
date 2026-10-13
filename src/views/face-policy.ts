/** Standard material sides, kept numeric for cross-realm and flat GLB inputs. */
export type SurfaceSide = 0 | 1 | 2;

/** Match Three's affine front-face convention; a singular transform does not flip.
 * Collapsed triangles are discarded by rasterization. No inverse is needed. */
export function worldWindingParity(m: ArrayLike<number>): 1 | -1 {
  const determinant =
    m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
    m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
    m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
  return determinant < 0 ? -1 : 1;
}

/** Facing uses deformed triangle winding corrected for the mesh world transform.
 * Zero means culled; +/-1 orients the visible flat lighting normal. Disabling
 * culling is a diagnostic two-sided override, matching GPU review derivatives. */
export function visibleNormalSign(facing: number, side: SurfaceSide, cull: boolean): -1 | 0 | 1 {
  if (cull && ((side === 0 && facing <= 0) || (side === 1 && facing >= 0))) return 0;
  return facing < 0 ? -1 : 1;
}
