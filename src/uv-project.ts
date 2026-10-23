/** Explicit UV0 projection in a rigid geometry-local frame. No preservation fallback. */
import * as THREE from 'three';
import { geometryFrameMatrix, type GeometryFrame } from './deform';

export interface ProjectUVOptions {
  projection: 'planar' | 'box' | 'cylindrical';
  frame?: GeometryFrame;
  /** Full-wrap U=0 direction in frame XZ, measured from +X toward +Z. Default 180. */
  seamDegrees?: number;
  /** Explicit [start angle, positive sweep <=360] in degrees. Cannot accompany seamDegrees. */
  angularRange?: readonly [number, number];
  /** Cylindrical cap triangles parallel to frame XZ use planar UVs by default. */
  caps?: 'planar' | 'side';
  /**
   * Physical length of one UV unit, in geometry units, measured from the frame origin so
   * pieces sharing a frame share density and phase. A full cylindrical wrap rounds to whole
   * tiles at the largest radius so its seam stays continuous. Default: fit extents to 0..1.
   */
  metersPerUnit?: number;
}

const MAX_CORNERS = 2_000_000;
const MAX_ATTRIBUTE_BYTES = 128 * 1024 * 1024;
/**
 * Cylindrical corners within this fraction of the largest radius lie on the axis (poles).
 * Relative, so Float32 and frame-rebasing noise on the axis of any size still counts.
 */
const POLE_RADIUS_FRACTION = 1e-6;

export function projectUV(
  geometry: THREE.BufferGeometry,
  options: ProjectUVOptions,
): THREE.BufferGeometry {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    !['planar', 'box', 'cylindrical'].includes(options.projection) ||
    Object.keys(options).some(
      (key) =>
        !['projection', 'frame', 'seamDegrees', 'angularRange', 'caps', 'metersPerUnit'].includes(
          key,
        ),
    )
  )
    throw new Error(
      'projectUV: select an explicit planar, box or cylindrical projection with documented options.',
    );
  const cylinder = options.projection === 'cylindrical';
  if (
    !cylinder &&
    [options.seamDegrees, options.angularRange, options.caps].some((value) => value !== undefined)
  )
    throw new Error(
      'projectUV: seamDegrees, angularRange and caps apply only to cylindrical projection.',
    );
  if (
    options.seamDegrees !== undefined &&
    (!Number.isFinite(options.seamDegrees) || options.angularRange !== undefined)
  )
    throw new Error('projectUV: seamDegrees must be finite and cannot accompany angularRange.');
  if (
    options.angularRange !== undefined &&
    (!Array.isArray(options.angularRange) ||
      options.angularRange.length !== 2 ||
      !options.angularRange.every(Number.isFinite) ||
      options.angularRange[1] <= 0 ||
      options.angularRange[1] > 360)
  )
    throw new Error(
      'projectUV: angularRange must be [finite start degrees, positive sweep <=360].',
    );
  if (options.caps !== undefined && options.caps !== 'planar' && options.caps !== 'side')
    throw new Error('projectUV: caps must be planar or side.');
  const metric = options.metersPerUnit;
  if (
    metric !== undefined &&
    !(typeof metric === 'number' && Number.isFinite(metric) && metric > 0)
  )
    throw new Error('projectUV: metersPerUnit must be a positive finite length.');
  const inverse = geometryFrameMatrix(options.frame).invert();
  const positions = geometry.getAttribute('position');
  if (positions?.itemSize !== 3 || positions.count < 1 || positions.count > MAX_CORNERS)
    throw new Error(`projectUV: position requires 1..${MAX_CORNERS} xyz samples.`);
  if (Object.keys(geometry.morphAttributes).length)
    throw new Error('projectUV: morph targets need a separate mapping contract.');
  const index = geometry.index;
  const corners = index?.count ?? positions.count;
  if (!Number.isSafeInteger(corners) || corners < 3 || corners % 3 !== 0 || corners > MAX_CORNERS)
    throw new Error(
      `projectUV: triangle corner count must be divisible by three and <=${MAX_CORNERS}.`,
    );
  let bytes = corners * 8;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (
      attribute.count !== positions.count ||
      !Number.isInteger(attribute.itemSize) ||
      attribute.itemSize < 1 ||
      attribute.itemSize > 16 ||
      (attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute
    )
      throw new Error(
        `projectUV: ${name} must be a matching per-vertex attribute of 1..16 components.`,
      );
    bytes += corners * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
  }
  if (bytes > MAX_ATTRIBUTE_BYTES)
    throw new Error('projectUV: expanded attributes exceed 128 MiB.');
  if (index)
    for (let i = 0; i < corners; i++) {
      const value = index.getX(i);
      if (!Number.isSafeInteger(value) || value < 0 || value >= positions.count)
        throw new Error('projectUV: index contains an invalid vertex reference.');
    }
  const points: THREE.Vector3[] = [];
  const bounds = new THREE.Box3();
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(inverse);
    if (![point.x, point.y, point.z].every(Number.isFinite))
      throw new Error('projectUV: frame-local positions must be finite.');
    points.push(point);
    bounds.expandByPoint(point);
  }
  const extent = bounds.getSize(new THREE.Vector3());
  const fit = (point: THREE.Vector3, axis: 'x' | 'y' | 'z') =>
    metric !== undefined
      ? point[axis] / metric
      : extent[axis] > 0
        ? (point[axis] - bounds.min[axis]) / extent[axis]
        : 0.5;
  // Mirrored faces keep their reading direction: 1 - u when fitted, -u when metric.
  const flip = (point: THREE.Vector3, axis: 'x' | 'y' | 'z') =>
    metric !== undefined ? -point[axis] / metric : 1 - fit(point, axis);
  const outputUVs = new Float32Array(corners * 2);
  const startDegrees = options.angularRange?.[0] ?? options.seamDegrees ?? 180;
  const start = ((startDegrees % 360) * Math.PI) / 180;
  const sweep = ((options.angularRange?.[1] ?? 360) * Math.PI) / 180;
  const fullWrap = options.angularRange === undefined || options.angularRange[1] === 360;
  const wrap = (angle: number) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // U per unit of angular fraction: 1 when fitted; metric arc length at the largest radius,
  // rounded to whole tiles on a full wrap so the seam meets itself.
  const radius = cylinder
    ? points.reduce((max, point) => Math.max(max, Math.hypot(point.x, point.z)), 0)
    : 0;
  const poleRadius = radius * POLE_RADIUS_FRACTION;
  let uScale = 1;
  if (metric !== undefined) {
    uScale = fullWrap
      ? Math.max(1, Math.round((2 * Math.PI * radius) / metric))
      : (sweep * radius) / metric;
  }
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  for (let i = 0; i < corners; i += 3) {
    const triangle = [0, 1, 2].map(
      (offset) => points[index ? index.getX(i + offset) : i + offset]!,
    );
    normal
      .subVectors(triangle[1]!, triangle[0]!)
      .cross(edge.subVectors(triangle[2]!, triangle[0]!))
      .normalize();
    const cap = cylinder && options.caps !== 'side' && Math.abs(normal.y) >= 1 - 1e-6;
    let pairs: [number, number][];
    if (cylinder && !cap) {
      // A corner on the axis (a pole: a cone apex, or the centre of a revolved profile
      // that touches x = 0) has no angle of its own. It takes the mean of the other corners'
      // unwrapped angles below, as sphere and cylinder UV generators treat poles. Corners are
      // already split per triangle, so each fan triangle gets its own pole U (#178).
      const poles = triangle.map((point) => Math.hypot(point.x, point.z) <= poleRadius);
      const angles = triangle.map((point, j) => {
        if (poles[j]) return 0;
        let angle = wrap(Math.atan2(point.z, point.x) - start);
        // Float32 positions and frame rebasing introduce angular boundary roundoff.
        if (angle > 2 * Math.PI - 1e-6) angle = 0;
        if (!fullWrap && angle > sweep + 1e-6)
          throw new Error(
            'projectUV: side vertex lies outside angularRange; choose a range covering the profile.',
          );
        return (fullWrap ? angle : Math.min(angle, sweep)) / sweep;
      });
      const sided = [0, 1, 2].filter((j) => !poles[j]);
      const span = () =>
        sided.length
          ? Math.max(...sided.map((j) => angles[j]!)) - Math.min(...sided.map((j) => angles[j]!))
          : 0;
      if (fullWrap && span() > 0.5) for (const j of sided) if (angles[j]! < 0.5) angles[j]! += 1;
      if (fullWrap && span() > 0.5 + 1e-6)
        throw new Error(
          'projectUV: side triangle spans more than half a revolution; add profile segments to resolve the mapping.',
        );
      // A triangle lying entirely on the axis is degenerate: every corner takes U 0.
      const pole = sided.length ? sided.reduce((sum, j) => sum + angles[j]!, 0) / sided.length : 0;
      for (let j = 0; j < 3; j++) if (poles[j]) angles[j] = pole;
      pairs = triangle.map((point, j) => [angles[j]! * uScale, fit(point, 'y')]);
    } else if (cap) {
      pairs = triangle.map((point) => [fit(point, 'x'), fit(point, 'z')]);
    } else if (options.projection === 'box') {
      const axis =
        Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)
          ? 'x'
          : Math.abs(normal.y) >= Math.abs(normal.z)
            ? 'y'
            : 'z';
      pairs = triangle.map((point) => {
        if (axis === 'x')
          return [normal.x > 0 ? flip(point, 'z') : fit(point, 'z'), fit(point, 'y')];
        if (axis === 'y')
          return [fit(point, 'x'), normal.y > 0 ? flip(point, 'z') : fit(point, 'z')];
        return [normal.z < 0 ? flip(point, 'x') : fit(point, 'x'), fit(point, 'y')];
      });
    } else pairs = triangle.map((point) => [fit(point, 'x'), fit(point, 'y')]);
    for (let j = 0; j < 3; j++) {
      const pair = pairs[j]!;
      if (!pair.every((value) => Number.isFinite(Math.fround(value))))
        throw new Error('projectUV: projected UVs must fit finite Float32.');
      outputUVs[(i + j) * 2] = pair[0];
      outputUVs[(i + j) * 2 + 1] = pair[1];
    }
  }
  const out = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  out.userData = structuredClone(geometry.userData);
  out.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outputUVs, 2));
  if (out.hasAttribute('tangent')) {
    out.deleteAttribute('tangent');
    const previous = out.userData.kilnAttributeWarnings;
    out.userData.kilnAttributeWarnings = [
      ...(Array.isArray(previous) ? previous : []),
      {
        code: 'UV_PROJECTION_TANGENTS_DROPPED',
        message:
          'UV projection invalidated tangents; regenerate them when needed for normal mapping.',
      },
    ];
  }
  return out;
}
