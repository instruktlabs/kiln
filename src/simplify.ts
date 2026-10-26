/**
 * `simplifyGeometry`: an explicit lower-detail copy of one geometry, for authored LOD tiers.
 *
 * Backed by the pinned meshoptimizer simplifier (WASM, loaded lazily on the first call). The
 * simplifier keeps a subset of the input vertices and rewrites only the index buffer, so every
 * surviving vertex keeps its exact attribute values: UVs, normals, colours, skin data and morph
 * targets are copied, never interpolated. Kiln adds what the raw call lacks:
 *
 * - the input is never mutated; the result owns new buffers;
 * - vertices are welded only where every attribute is identical, so UV and normal seams stay
 *   split and the simplifier recognises them from the index data and keeps them;
 * - each material group (and each run of triangles outside a group) is simplified on its own,
 *   with vertices on a boundary between runs locked, so groups keep their triangles and edges;
 * - open borders are locked unless `lockBorder: false`;
 * - the achieved ratio, triangle counts and the simplifier's error are recorded on
 *   `userData.kilnSimplify`, and a target the simplifier could not reach is a build note.
 *
 * It never runs implicitly and never runs to meet a budget: authors call it per part and pass
 * the results to `defineLod` tiers.
 */
import * as THREE from 'three';
import { GEOMETRY_ALLOCATION_LIMITS } from './geometry-budget';

/** Options for {@link simplifyGeometry}. Exactly one of `ratio` or `targetTriangles`. */
export interface SimplifyGeometryOptions {
  /** Fraction of triangles to keep, greater than 0 and at most 1. */
  ratio?: number;
  /** Triangle count to aim for, a positive integer. */
  targetTriangles?: number;
  /**
   * Largest error the simplifier may introduce, as a fraction of the mesh extent (meshoptimizer's
   * relative metric). Default 1: no practical limit, so the ratio or target decides.
   */
  maxError?: number;
  /** Keep vertices on open borders in place. Default true. */
  lockBorder?: boolean;
}

/** `geometry.userData.kilnSimplify` on every {@link simplifyGeometry} result. */
export interface SimplifyReportV1 {
  schemaVersion: 1;
  /** What the caller asked for. */
  requested: { ratio: number } | { targetTriangles: number };
  trianglesBefore: number;
  trianglesAfter: number;
  /** Achieved ratio, trianglesAfter / trianglesBefore. */
  ratio: number;
  /** The simplifier's error estimate as a fraction of the mesh extent (`scale`). */
  error: number;
  /** The same error in scene units: error x scale. */
  errorAbsolute: number;
  /** The mesh extent meshoptimizer measures errors against, in scene units. */
  scale: number;
  maxError: number;
  lockBorder: boolean;
  /** Runs simplified separately: one per material group, plus any ungrouped runs. */
  runs: number;
  /** Vertices locked because they sit on a boundary between runs. */
  lockedVertices: number;
}

const OPTION_KEYS = new Set(['ratio', 'targetTriangles', 'maxError', 'lockBorder']);
/**
 * Attribute weights for attribute-aware simplification. Normals use meshoptimizer's suggested
 * scale for unit vectors, halved so geometry still leads; UVs are divided by the geometry's UV
 * extent so tiled (metric) and 0..1 UVs weigh the same.
 */
const NORMAL_WEIGHT = 0.5;
const UV_WEIGHT = 0.5;
/** Positions closer than this fraction of the extent are treated as one point. */
const POSITION_SNAP = 2 ** -20;

type Simplifier = typeof import('meshoptimizer/simplifier').MeshoptSimplifier;
type SimplifierFlags = NonNullable<Parameters<Simplifier['simplifyWithAttributes']>[9]>;

let simplifierReady: Promise<Simplifier> | undefined;
function loadSimplifier(): Promise<Simplifier> {
  simplifierReady ??= import('meshoptimizer/simplifier').then(async ({ MeshoptSimplifier }) => {
    await MeshoptSimplifier.ready;
    return MeshoptSimplifier;
  });
  return simplifierReady;
}

type AnyAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** The stored (not denormalized) value, so a copy is bit-exact for every array type. */
function raw(attribute: AnyAttribute, vertex: number, component: number): number {
  if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
    const interleaved = attribute as THREE.InterleavedBufferAttribute;
    return interleaved.data.array[
      vertex * interleaved.data.stride + interleaved.offset + component
    ] as number;
  }
  return (attribute as THREE.BufferAttribute).array[vertex * attribute.itemSize + component]!;
}

/** Copy the listed source vertices into a new attribute of the same storage type. */
function gather(attribute: AnyAttribute, vertices: Uint32Array): THREE.BufferAttribute {
  const source = (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
    ? (attribute as THREE.InterleavedBufferAttribute).data.array
    : (attribute as THREE.BufferAttribute).array;
  const Ctor = source.constructor as new (length: number) => THREE.TypedArray;
  const values = new Ctor(vertices.length * attribute.itemSize);
  for (let i = 0; i < vertices.length; i++)
    for (let c = 0; c < attribute.itemSize; c++)
      values[i * attribute.itemSize + c] = raw(attribute, vertices[i]!, c);
  const out = new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized);
  out.name = attribute.name;
  return out;
}

function fail(message: string): never {
  throw new TypeError(`simplifyGeometry: ${message}`);
}

function readOptions(options: unknown): {
  requested: SimplifyReportV1['requested'];
  maxError: number;
  lockBorder: boolean;
} {
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    fail(
      'pass exactly one of ratio or targetTriangles, e.g. simplifyGeometry(geo, { ratio: 0.25 }).',
    );
  const record = options as Record<string, unknown>;
  for (const key of Object.keys(record))
    if (!OPTION_KEYS.has(key))
      fail(`unknown option "${key}". Options are ratio, targetTriangles, maxError and lockBorder.`);
  const hasRatio = record.ratio !== undefined;
  const hasTarget = record.targetTriangles !== undefined;
  if (hasRatio === hasTarget)
    fail(
      'pass exactly one of ratio or targetTriangles, e.g. simplifyGeometry(geo, { ratio: 0.25 }).',
    );
  let requested: SimplifyReportV1['requested'];
  if (hasRatio) {
    const ratio = record.ratio;
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio > 1)
      fail(`ratio must be a number greater than 0 and at most 1, but got ${String(ratio)}.`);
    requested = { ratio };
  } else {
    const target = record.targetTriangles;
    if (typeof target !== 'number' || !Number.isSafeInteger(target) || target < 1)
      fail(`targetTriangles must be a positive integer, but got ${String(target)}.`);
    requested = { targetTriangles: target };
  }
  const maxError = record.maxError ?? 1;
  if (typeof maxError !== 'number' || !Number.isFinite(maxError) || maxError < 0)
    fail(
      `maxError must be a finite number of at least 0 (a fraction of the mesh extent), but got ${String(maxError)}.`,
    );
  const lockBorder = record.lockBorder ?? true;
  if (typeof lockBorder !== 'boolean')
    fail(`lockBorder must be a boolean, but got ${String(lockBorder)}.`);
  return { requested, maxError, lockBorder };
}

interface Run {
  start: number;
  count: number;
  materialIndex?: number;
}

/** Group ranges plus the ungrouped gaps between them, in index order. */
function readRuns(geometry: THREE.BufferGeometry, corners: number): Run[] {
  if (!geometry.groups.length) return [{ start: 0, count: corners }];
  const groups = [...geometry.groups].sort((a, b) => a.start - b.start);
  const runs: Run[] = [];
  let next = 0;
  for (const group of groups) {
    const start = group.start;
    const count = Math.min(group.count, corners - start);
    if (
      !Number.isSafeInteger(start) ||
      start < next ||
      start % 3 !== 0 ||
      !Number.isFinite(count) ||
      count < 0 ||
      count % 3 !== 0
    )
      fail('material groups must start on a triangle, cover whole triangles and not overlap.');
    if (start > next) runs.push({ start: next, count: start - next });
    if (count > 0) runs.push({ start, count, materialIndex: group.materialIndex ?? 0 });
    next = start + count;
  }
  if (next < corners) runs.push({ start: next, count: corners - next });
  return runs;
}

function remapRanges(
  value: unknown,
  trianglesBefore: number,
  runs: readonly Run[],
  runOut: ReadonlyArray<{ start: number; count: number }>,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const mapped: Record<string, unknown>[] = [];
  const total = runOut.reduce((sum, run) => sum + run.count, 0) / 3;
  for (const range of value) {
    if (!range || typeof range !== 'object') return undefined;
    const { start, count } = range as { start?: unknown; count?: unknown };
    if (start === 0 && count === trianglesBefore) {
      mapped.push({ ...range, start: 0, count: total });
      continue;
    }
    const r = runs.findIndex(
      (run) => run.start === Number(start) * 3 && run.count === Number(count) * 3,
    );
    if (r === -1) return undefined;
    mapped.push({ ...range, start: runOut[r]!.start / 3, count: runOut[r]!.count / 3 });
  }
  return mapped;
}

/**
 * Derive a lower-detail copy of `geometry`. Returns a new BufferGeometry and never mutates the
 * input. See {@link SimplifyReportV1} for what `userData.kilnSimplify` records.
 */
export async function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  options: SimplifyGeometryOptions,
): Promise<THREE.BufferGeometry> {
  if ((geometry as { isBufferGeometry?: boolean } | null)?.isBufferGeometry !== true)
    fail('the first argument must be a BufferGeometry, such as sphereGeo(1, 32, 16).');
  const { requested, maxError, lockBorder } = readOptions(options);

  const position = geometry.getAttribute('position') as AnyAttribute | undefined;
  if (position?.itemSize !== 3 || position.count === 0)
    fail('the geometry needs a nonempty three-component position attribute.');
  const vertexCount = position.count;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if ((attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)
      fail(`${name} is per-instance data; simplify the base geometry before instancing.`);
    if (attribute.count !== vertexCount)
      fail(`${name} must have one value per vertex (${vertexCount}), but has ${attribute.count}.`);
  }
  for (const [name, targets] of Object.entries(geometry.morphAttributes))
    for (const target of targets)
      if (target.count !== vertexCount)
        fail(`morph ${name} must have one value per vertex (${vertexCount}).`);
  const { start: drawStart, count: drawCount } = geometry.drawRange;
  if (
    drawStart !== 0 ||
    (Number.isFinite(drawCount) && drawCount < (geometry.index?.count ?? vertexCount))
  )
    fail('the draw range must cover the whole geometry; simplify the full mesh.');

  const index = geometry.index;
  const corners = index ? index.count : vertexCount;
  if (corners % 3 !== 0) fail('the geometry must be a triangle list.');
  const trianglesBefore = corners / 3;
  if (trianglesBefore > GEOMETRY_ALLOCATION_LIMITS.simplifyTriangles)
    throw new RangeError(
      `simplifyGeometry: ${trianglesBefore} triangles exceed the limit of ${GEOMETRY_ALLOCATION_LIMITS.simplifyTriangles}. Split the mesh first.`,
    );
  const corner = (i: number): number => {
    const vertex = index ? index.getX(i) : i;
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount)
      fail(`index ${i} is outside the position attribute.`);
    return vertex;
  };

  // Extent, for position snapping and the error scale.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v++)
    for (let c = 0; c < 3; c++) {
      const value = position.getComponent(v, c);
      if (!Number.isFinite(value)) fail('positions must be finite.');
      if (value < min[c]!) min[c] = value;
      if (value > max[c]!) max[c] = value;
    }
  const extent = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  const cell = extent > 0 ? extent * POSITION_SNAP : 1;

  // Snap near-identical positions to one representative, so seams the primitive generators
  // leave a rounding error apart (sin(2 pi) is not 0) read as seams rather than open borders.
  const positionKey = new Uint32Array(vertexCount);
  const snapped: number[] = [];
  {
    const byKey = new Map<string, number>();
    for (let v = 0; v < vertexCount; v++) {
      const key = [0, 1, 2]
        .map((c) => Math.round((position.getComponent(v, c) - min[c]!) / cell))
        .join(',');
      let id = byKey.get(key);
      if (id === undefined) {
        id = byKey.size;
        byKey.set(key, id);
        snapped.push(
          position.getComponent(v, 0),
          position.getComponent(v, 1),
          position.getComponent(v, 2),
        );
      }
      positionKey[v] = id;
    }
  }

  // Weld vertices whose every attribute (after snapping) is identical. Seams stay split.
  const others = Object.entries(geometry.attributes)
    .filter(([name]) => name !== 'position')
    .map(([, attribute]) => attribute as AnyAttribute);
  for (const targets of Object.values(geometry.morphAttributes))
    others.push(...(targets as AnyAttribute[]));
  const weldOf = new Int32Array(vertexCount).fill(-1);
  const representative: number[] = [];
  {
    const byKey = new Map<string, number>();
    const parts: number[] = [];
    for (let i = 0; i < corners; i++) {
      const v = corner(i);
      if (weldOf[v] !== -1) continue;
      parts.length = 0;
      parts.push(positionKey[v]!);
      for (const attribute of others)
        for (let c = 0; c < attribute.itemSize; c++) parts.push(raw(attribute, v, c));
      const key = parts.join(',');
      let id = byKey.get(key);
      if (id === undefined) {
        id = representative.length;
        byKey.set(key, id);
        representative.push(v);
      }
      weldOf[v] = id;
    }
  }
  const weldedCount = representative.length;
  const weldedIndex = new Uint32Array(corners);
  for (let i = 0; i < corners; i++) weldedIndex[i] = weldOf[corner(i)]!;

  const positions = new Float32Array(weldedCount * 3);
  for (let w = 0; w < weldedCount; w++) {
    const p = positionKey[representative[w]!]! * 3;
    positions[w * 3] = snapped[p]!;
    positions[w * 3 + 1] = snapped[p + 1]!;
    positions[w * 3 + 2] = snapped[p + 2]!;
  }

  // Attribute-aware simplification: normals and UV0 steer collapses away from shading and
  // texture distortion. Seams themselves are kept by topology, not by these weights.
  const normal = geometry.getAttribute('normal') as AnyAttribute | undefined;
  const uv = geometry.getAttribute('uv') as AnyAttribute | undefined;
  const weights: number[] = [];
  const channels: Array<(vertex: number) => number> = [];
  if (normal?.itemSize === 3)
    for (let c = 0; c < 3; c++) {
      weights.push(NORMAL_WEIGHT);
      channels.push((v) => normal.getComponent(v, c));
    }
  if (uv?.itemSize === 2) {
    let uvExtent = 0;
    for (let c = 0; c < 2; c++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let v = 0; v < vertexCount; v++) {
        const value = uv.getComponent(v, c);
        if (!Number.isFinite(value)) fail('uv values must be finite.');
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
      uvExtent = Math.max(uvExtent, hi - lo);
    }
    if (uvExtent > 0)
      for (let c = 0; c < 2; c++) {
        weights.push(UV_WEIGHT / uvExtent);
        channels.push((v) => uv.getComponent(v, c));
      }
  }
  const stride = weights.length;
  const attributes = new Float32Array(weldedCount * stride);
  for (let w = 0; w < weldedCount; w++)
    for (let c = 0; c < stride; c++) {
      const value = channels[c]!(representative[w]!);
      if (!Number.isFinite(value)) fail('normal values must be finite.');
      attributes[w * stride + c] = value;
    }

  // Runs and the vertices on their boundaries.
  const runs = readRuns(geometry, corners);
  const lock = new Uint8Array(weldedCount);
  let lockedVertices = 0;
  if (runs.length > 1) {
    const firstRun = new Int32Array(snapped.length / 3).fill(-1);
    const shared = new Uint8Array(snapped.length / 3);
    runs.forEach((run, r) => {
      for (let i = run.start; i < run.start + run.count; i++) {
        const p = positionKey[representative[weldedIndex[i]!]!]!;
        if (firstRun[p] === -1) firstRun[p] = r;
        else if (firstRun[p] !== r) shared[p] = 1;
      }
    });
    for (let w = 0; w < weldedCount; w++)
      if (shared[positionKey[representative[w]!]!]) {
        lock[w] = 1;
        lockedVertices++;
      }
  }

  const simplifier = await loadSimplifier();
  const scale = simplifier.getScale(positions, 3);
  const flags: SimplifierFlags = ['ErrorAbsolute'] as SimplifierFlags;
  if (lockBorder) flags.push('LockBorder' as SimplifierFlags[number]);
  if (runs.length > 1) flags.push('Sparse' as SimplifierFlags[number]);
  const ratio =
    'ratio' in requested
      ? requested.ratio
      : Math.min(1, requested.targetTriangles / trianglesBefore);

  const outIndex: number[] = [];
  const outGroups: Run[] = [];
  const runOut: Array<{ start: number; count: number }> = [];
  let errorAbsolute = 0;
  let targetTotal = 0;
  for (const run of runs) {
    const runIndex = weldedIndex.subarray(run.start, run.start + run.count);
    const runTriangles = run.count / 3;
    const target = Math.min(runTriangles, Math.max(1, Math.round(runTriangles * ratio)));
    targetTotal += target;
    let kept: Uint32Array = runIndex;
    if (target < runTriangles) {
      const [result, error] = simplifier.simplifyWithAttributes(
        runIndex.slice(),
        positions,
        3,
        attributes,
        stride,
        weights,
        lock,
        target * 3,
        maxError * scale,
        flags,
      );
      kept = result;
      errorAbsolute = Math.max(errorAbsolute, error);
    }
    runOut.push({ start: outIndex.length, count: kept.length });
    if (run.materialIndex !== undefined)
      outGroups.push({
        start: outIndex.length,
        count: kept.length,
        materialIndex: run.materialIndex,
      });
    for (let i = 0; i < kept.length; i++) outIndex.push(kept[i]!);
  }

  // Compact: keep used vertices in first-use order and copy their original values.
  const remap = new Int32Array(weldedCount).fill(-1);
  const used: number[] = [];
  const indexValues =
    weldedCount > 65535 ? new Uint32Array(outIndex.length) : new Uint16Array(outIndex.length);
  for (let i = 0; i < outIndex.length; i++) {
    const w = outIndex[i]!;
    if (remap[w] === -1) {
      remap[w] = used.length;
      used.push(w);
    }
    indexValues[i] = remap[w]!;
  }
  const sources = Uint32Array.from(used, (w) => representative[w]!);

  const out = new THREE.BufferGeometry();
  out.name = geometry.name;
  const outPosition = new Float32Array(sources.length * 3);
  for (let i = 0; i < used.length; i++)
    outPosition.set(positions.subarray(used[i]! * 3, used[i]! * 3 + 3), i * 3);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (name === 'position') {
      const attr = new THREE.BufferAttribute(outPosition, 3);
      attr.name = attribute.name;
      out.setAttribute(name, attr);
    } else out.setAttribute(name, gather(attribute as AnyAttribute, sources));
  }
  for (const [name, targets] of Object.entries(geometry.morphAttributes))
    (out.morphAttributes as Record<string, THREE.BufferAttribute[]>)[name] = targets.map((target) =>
      gather(target as AnyAttribute, sources),
    );
  out.morphTargetsRelative = geometry.morphTargetsRelative;
  out.setIndex(new THREE.BufferAttribute(indexValues, 1));
  for (const group of outGroups) out.addGroup(group.start, group.count, group.materialIndex);
  out.computeBoundingBox();
  out.computeBoundingSphere();

  const trianglesAfter = outIndex.length / 3;
  const userData = structuredClone(geometry.userData) as Record<string, unknown>;
  const warnings: Array<{ code: string; message: string }> = [];
  const previous = userData.kilnGeometryWarnings;
  if (Array.isArray(previous)) warnings.push(...previous);
  // Source ranges (in triangles) survive when each covers the whole geometry, as the sandbox
  // stamps primitives, or exactly one simplified run. Per-face provenance cannot be remapped.
  const ranges = remapRanges(userData.kilnRanges, trianglesBefore, runs, runOut);
  if (ranges) userData.kilnRanges = ranges;
  if (userData.kilnCsgProvenance || (userData.kilnRanges !== undefined && !ranges)) {
    delete userData.kilnCsgProvenance;
    delete userData.kilnRanges;
    warnings.push({
      code: 'SIMPLIFY_PROVENANCE_DROPPED',
      message:
        'Simplification changed triangle topology. Source face/range provenance was discarded rather than guessed.',
    });
  }
  if (trianglesAfter > Math.ceil(targetTotal * 1.05))
    warnings.push({
      code: 'SIMPLIFY_TARGET_NOT_REACHED',
      message: `simplifyGeometry kept ${trianglesAfter} of ${trianglesBefore} triangles against a target of ${targetTotal}: maxError ${maxError}, locked borders, seams or group boundaries stopped it. Raise maxError, pass lockBorder: false, or accept the result.`,
    });
  if (warnings.length) userData.kilnGeometryWarnings = warnings;
  const report: SimplifyReportV1 = {
    schemaVersion: 1,
    requested,
    trianglesBefore,
    trianglesAfter,
    ratio: trianglesAfter / trianglesBefore,
    error: scale > 0 ? errorAbsolute / scale : 0,
    errorAbsolute,
    scale,
    maxError,
    lockBorder,
    runs: runs.length,
    lockedVertices,
  };
  userData.kilnSimplify = report;
  out.userData = userData;
  return out;
}
