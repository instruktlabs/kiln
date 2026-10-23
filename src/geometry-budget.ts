/** Per-operation compute/allocation limits, independent of asset labels or style. */
export const GEOMETRY_ALLOCATION_LIMITS = Object.freeze({
  parametricSamples: 262_144,
  subdivisionTriangles: 1_000_000,
  subdivisionAttributeBytes: 128 * 1024 * 1024,
  subdivisionIterations: 10,
  repeatedMeshes: 10_000,
  // repeatAlongCurve merge: vertices in the one merged geometry it returns.
  curveRepeatVertices: 262_144,
  // simplifyGeometry: input triangles per call.
  simplifyTriangles: 1_000_000,
  primitiveSegments: 4096,
  primitiveGridVertices: 262_144,
  // xatlasjs 0.2 returns Uint16 indices and source-vertex correspondence.
  unwrapVertices: 65_536,
  unwrapTriangles: 1_000_000,
  unwrapAttributeBytes: 128 * 1024 * 1024,
  unwrapResolution: 4096,
  skinBones: 1024,
  skinVertices: 262_144,
  skinAttributeBytes: 128 * 1024 * 1024,
  // Delivery contract: colliderHull reads at most this many proxy vertices.
  colliderHullVertices: 65_536,
  // bakeSurfaceAttributes: welded vertices baked per call, occluder triangles, total
  // cavity rays (vertices x directions) and directions per vertex.
  surfaceBakeVertices: 262_144,
  surfaceBakeTriangles: 1_000_000,
  surfaceBakeRays: 8_388_608,
  surfaceBakeRayDirections: 256,
});
export function assertDimension(name: string, value: number, allowZero = false): void {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(Math.fround(value)) ||
    (allowZero ? value < 0 : Math.fround(value) <= 0)
  )
    throw new RangeError(
      `${name} must be finite, representable in Float32, and ${allowZero ? 'nonnegative' : 'positive'}.`,
    );
}
export function assertPrimitiveSegments(name: string, value: number, minimum: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > GEOMETRY_ALLOCATION_LIMITS.primitiveSegments
  )
    throw new RangeError(
      `${name} must be an integer from ${minimum} to ${GEOMETRY_ALLOCATION_LIMITS.primitiveSegments}.`,
    );
}
export function assertPrimitiveGrid(name: string, first: number, second: number): void {
  if ((first + 1) * (second + 1) > GEOMETRY_ALLOCATION_LIMITS.primitiveGridVertices)
    throw new RangeError(
      `${name} exceeds ${GEOMETRY_ALLOCATION_LIMITS.primitiveGridVertices} grid vertices; reduce segment counts.`,
    );
}
export function assertRepetitionCount(name: string, count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes
  )
    throw new RangeError(
      `${name} count must be an integer from 1 to ${GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes}, including the source. Split large repetitions into intentional bounded groups.`,
    );
}
export function assertFiniteTriple(name: string, values: readonly number[]): void {
  if (!Array.isArray(values) || values.length !== 3 || !values.every(Number.isFinite))
    throw new RangeError(`${name} must contain three finite numbers.`);
}
