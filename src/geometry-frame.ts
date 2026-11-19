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

const finitePoint = (point: THREE.Vector3): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

/** Finite bounds only: malformed vertices are reported separately by the diagnostic caller. */
export function positionFrame(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): {
  origin: THREE.Vector3;
  scale: number;
} {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (finitePoint(point)) bounds.expandByPoint(point);
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

/** String weld key for `creaseNormals`; {@link diagnosticWeld} keys the same cells by number. */
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
  ids: Int32Array;
  /** Per-vertex finiteness: 1 when all three coordinates are finite, else 0. */
  finite: Uint8Array;
  /** How many distinct ids there are. */
  count: number;
}

/**
 * Weld ids for quantized positions, keyed by numbers, never strings. A key is three doubles:
 * the grid cell `Math.round((p - origin) / tolerance)` per axis, or the raw coordinates when
 * the tolerance is zero. Two keys match when their numbers are equal, so -0 and 0 share a
 * cell, as they did when keys were joined decimal strings ("0" for both); every other pair of
 * distinct finite doubles printed differently. Ids are handed out in first-seen order.
 */
class PositionWeld {
  private readonly keys: Float64Array;
  private readonly slots: Int32Array;
  private readonly mask: number;
  private readonly bits = new Float64Array(1);
  private readonly words = new Uint32Array(this.bits.buffer);
  size = 0;

  constructor(capacity: number) {
    let slots = 16;
    while (slots < capacity * 2) slots *= 2;
    this.keys = new Float64Array(slots * 3);
    this.slots = new Int32Array(slots).fill(-1);
    this.mask = slots - 1;
  }

  private mix(hash: number, value: number): number {
    // `+ 0` folds -0 into 0 so equal keys hash alike.
    this.bits[0] = value + 0;
    hash = Math.imul(hash ^ this.words[0]!, 0x9e3779b1);
    hash = Math.imul(hash ^ this.words[1]!, 0x85ebca6b);
    return hash ^ (hash >>> 15);
  }

  /** The id of a key, assigning the next id when the key is new. */
  idOf(x: number, y: number, z: number): number {
    let slot = this.mix(this.mix(this.mix(0x2545f491, x), y), z) & this.mask;
    for (;;) {
      const id = this.slots[slot]!;
      if (id < 0) {
        this.slots[slot] = this.size;
        this.keys[slot * 3] = x;
        this.keys[slot * 3 + 1] = y;
        this.keys[slot * 3 + 2] = z;
        return this.size++;
      }
      const at = slot * 3;
      if (this.keys[at] === x && this.keys[at + 1] === y && this.keys[at + 2] === z) return id;
      slot = (slot + 1) & this.mask;
    }
  }
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
  const ids = new Int32Array(position.count);
  const finite = new Uint8Array(position.count);
  const weld = new PositionWeld(position.count);
  const { origin } = frame;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (!finitePoint(point)) {
      // Never welded: the vertex takes the next id for itself.
      ids[i] = weld.size++;
      continue;
    }
    finite[i] = 1;
    ids[i] =
      distance === 0
        ? weld.idOf(point.x, point.y, point.z)
        : weld.idOf(
            Math.round((point.x - origin.x) / distance),
            Math.round((point.y - origin.y) / distance),
            Math.round((point.z - origin.z) / distance),
          );
  }
  return { tolerance: distance, scale: frame.scale, ids, finite, count: weld.size };
}
