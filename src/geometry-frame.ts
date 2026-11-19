/**
 * Position quantization shared by `geometryDiagnostics` and the print export, kept out of
 * `geometry.ts` so it does not join the authoring API that module re-exports.
 */
import * as THREE from 'three';

export function boundsScale(bounds: THREE.Box3): number {
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.hypot(size.x, size.y, size.z);
  if (!Number.isFinite(scale)) throw new Error('Geometry position extent must be finite');
  return scale;
}

/** Finite bounds only: malformed vertices are reported separately by the diagnostic caller. */
export function positionFrame(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): {
  origin: THREE.Vector3;
  scale: number;
} {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if ([point.x, point.y, point.z].every(Number.isFinite)) bounds.expandByPoint(point);
  }
  return {
    origin: bounds.isEmpty() ? new THREE.Vector3() : bounds.min,
    scale: boundsScale(bounds),
  };
}

export function positionTolerance(
  scale: number,
  supplied: number | undefined,
  relative: number,
): number {
  if (supplied === undefined) return scale * relative;
  if (!Number.isFinite(supplied) || supplied <= 0)
    throw new Error('Geometry tolerance must be positive and finite');
  if (scale / supplied > Number.MAX_SAFE_INTEGER)
    throw new Error('Geometry tolerance is too small to resolve the position extent safely');
  return supplied;
}

export function positionKey(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  tolerance: number,
): string {
  if (tolerance === 0) return point.toArray().join(',');
  return point
    .clone()
    .sub(origin)
    .toArray()
    .map((x) => Math.round(x / tolerance))
    .join(',');
}

/** The relative weld distance `geometryDiagnostics` uses when no tolerance is given. */
export const DIAGNOSTIC_RELATIVE_TOLERANCE = 1e-6;

export interface DiagnosticWeld {
  /** Effective weld distance in geometry units. */
  tolerance: number;
  /** Diagonal of the finite position bounds. */
  scale: number;
  /** Per-vertex welded id, in first-use order; a non-finite vertex gets an id of its own. */
  ids: number[];
  /** Per-vertex finiteness. */
  finite: boolean[];
  /** How many distinct ids there are. */
  count: number;
}

/**
 * Weld vertices that share a quantized position, exactly as `geometryDiagnostics` does: one
 * grid anchored at the finite bounds' minimum, cell size `tolerance` (by default 1e-6 of the
 * bounds diagonal). A consumer that keys edges on these ids sees the diagnostic's topology.
 */
export function diagnosticWeld(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  tolerance?: number,
): DiagnosticWeld {
  const frame = positionFrame(position);
  const distance = positionTolerance(frame.scale, tolerance, DIAGNOSTIC_RELATIVE_TOLERANCE);
  const points = new Map<string, number>();
  const ids: number[] = [];
  const finite: boolean[] = [];
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    finite[i] = [point.x, point.y, point.z].every(Number.isFinite);
    const key = finite[i] ? positionKey(point, frame.origin, distance) : `invalid:${i}`;
    if (!points.has(key)) points.set(key, points.size);
    ids.push(points.get(key)!);
  }
  return { tolerance: distance, scale: frame.scale, ids, finite, count: points.size };
}
