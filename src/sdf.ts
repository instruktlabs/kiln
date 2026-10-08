/** Signed-distance helpers for positive-inside implicit fields (experimental). */
import type { Point3 } from './geometry';

/** Sphere SDF: positive inside when `radius - distance(center, p) > 0`. */
export function sphereInside(point: Point3, center: Point3, radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0)
    throw new Error('sphereInside radius must be positive and finite');
  if (center.length !== 3 || !center.every(Number.isFinite))
    throw new Error('sphereInside center must be three finite numbers');
  return radius - Math.hypot(point[0] - center[0], point[1] - center[1], point[2] - center[2]);
}

/**
 * Polynomial smooth union (IQ smooth maximum). Both operands use the same
 * positive-inside convention as `implicitSurface`.
 */
export function smoothUnion(a: number, b: number, blend: number): number {
  if (!Number.isFinite(blend) || blend <= 0)
    throw new Error('smoothUnion blend must be positive and finite');
  const h = Math.max(blend - Math.abs(a - b), 0) / blend;
  return Math.max(a, b) + (h * h * blend) / 4;
}

/** Smooth union of many sphere fields with a shared blend width. */
export function smoothUnionSpheres(
  point: Point3,
  spheres: readonly { center: Point3; radius: number }[],
  blend: number,
): number {
  if (!spheres.length) throw new Error('smoothUnionSpheres needs at least one sphere');
  let value = sphereInside(point, spheres[0]!.center, spheres[0]!.radius);
  for (let i = 1; i < spheres.length; i++) {
    const s = spheres[i]!;
    value = smoothUnion(value, sphereInside(point, s.center, s.radius), blend);
  }
  return value;
}
