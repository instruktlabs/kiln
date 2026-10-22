/**
 * Kiln higher-level ops — Wave 2B
 *
 * Array/mirror/subdivide/curve helpers that wrap the base primitives.
 * These expand the catalog toward Blender Geometry Nodes parity without
 * bloating primitives.ts.
 *
 * - `arrayLinear` / `arrayRadial` / `mirror` use createInstance under the
 *   hood so the GLB exports as true glTF mesh instances (single geometry,
 *   many transforms).
 * - `subdivide` runs Loop subdivision on a BufferGeometry.
 * - `curveToMesh` / `lathe` wrap Three.js TubeGeometry/LatheGeometry for
 *   curves-as-primitives.
 */

import * as THREE from 'three';
import { LoopSubdivision } from 'three-subdivide/build/index.module.js';
import { mergeVertices as threeMergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createInstance } from './primitives';
import {
  GEOMETRY_ALLOCATION_LIMITS,
  assertRepetitionCount,
  assertFiniteTriple,
  assertDimension,
} from './geometry-budget';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

function assertFiniteSourceFrame(name: string, source: THREE.Object3D): void {
  assertFiniteTriple(`${name} source position`, source.position.toArray());
  assertFiniteTriple(`${name} source scale`, source.scale.toArray());
  assertFiniteTriple(`${name} source rotation`, [
    source.rotation.x,
    source.rotation.y,
    source.rotation.z,
  ]);
}

// =============================================================================
// Array ops
// =============================================================================

/**
 * Linear array: place `count` copies of `source` along a constant offset.
 * Uses createInstance so all copies share geometry + material.
 *
 * @example
 * const postGeo = cylinderGeo(0.05, 0.05, 1.5, 6);
 * const postMat = gameMaterial(0x8b6f3d);
 * const first = createPart('Post0', postGeo, postMat, { position: [0, 0.75, 0], parent: root });
 * arrayLinear('Post', first, 10, [0.5, 0, 0], root);  // 10 posts, 0.5 apart on X
 */
export function arrayLinear(
  namePrefix: string,
  source: THREE.Object3D,
  count: number,
  offset: [number, number, number],
  parent?: THREE.Object3D,
): THREE.Object3D[] {
  assertRepetitionCount('arrayLinear', count);
  assertFiniteSourceFrame('arrayLinear', source);
  assertFiniteTriple('arrayLinear offset', offset);
  const last = source.position.toArray().map((value, axis) => value + offset[axis]! * (count - 1));
  assertFiniteTriple('arrayLinear resulting position', last);
  const out: THREE.Object3D[] = [];
  // Source is already at some position; clones start at offset 1.
  const base = source.position.toArray() as [number, number, number];
  // Orientation and scale travel with the copy. Reading position alone made a
  // "copy" that stood up straight however the source was laid down, which cost
  // two dispatched models a revision each -- and disagreed with `arrayRadial`
  // below, which has always set a rotation on every copy.
  const rotation = degreesOf(source.rotation);
  const scale = source.scale.toArray() as [number, number, number];
  for (let i = 1; i < count; i++) {
    const pos: [number, number, number] = [
      base[0] + offset[0] * i,
      base[1] + offset[1] * i,
      base[2] + offset[2] * i,
    ];
    out.push(
      createInstance(`${namePrefix}${i}`, source, { position: pos, rotation, scale, parent }),
    );
  }
  return out;
}

/** `createInstance` takes degrees; an Object3D holds radians. */
function degreesOf(euler: THREE.Euler): [number, number, number] {
  return [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];
}

/**
 * Radial array: place `count` copies of `source` around an axis at radius.
 * Source stays put; clones orbit `center` (the parent's origin by default) on
 * the given axis.
 * All positions/axes are in parent-local coordinates; a supplied different
 * parent receives those same coordinates, without a world-space conversion.
 * Scale is preserved. Default `outward` orientation retains the orbit-only
 * convention (the source rotation is ignored). `relative` composes the orbit
 * rotation with the source's complete authored orientation.
 *
 * `center` exists because the default could not be worked around: a ring of
 * rivets about a hub that is not at the parent's origin meant writing the
 * rotation matrix by hand. Omitting it is byte-identical to the old behavior.
 *
 * @example
 * const bolt = createPart('Bolt', cylinderGeo(0.02, 0.02, 0.1, 6), steel,
 *   { position: [1, 0, 0], parent: root });
 * arrayRadial('Bolt', bolt, 8, 'y', root);  // 8 bolts around Y axis
 * arrayRadial('Rivet', rivet, 6, 'y', hub, [2, 0, 0]);  // ring about the hub
 */
export function arrayRadial(
  namePrefix: string,
  source: THREE.Object3D,
  count: number,
  axis: 'x' | 'y' | 'z' = 'y',
  parent?: THREE.Object3D,
  center?: [number, number, number],
  options: { orientation?: 'outward' | 'relative' } = {},
): THREE.Object3D[] {
  assertRepetitionCount('arrayRadial', count);
  assertFiniteSourceFrame('arrayRadial', source);
  if (!['x', 'y', 'z'].includes(axis)) throw new RangeError('arrayRadial axis must be x, y or z.');
  if (options.orientation !== undefined && !['outward', 'relative'].includes(options.orientation))
    throw new RangeError('arrayRadial orientation must be outward or relative.');
  if (center) assertFiniteTriple('arrayRadial center', center);
  const out: THREE.Object3D[] = [];
  const pivot = center ? new THREE.Vector3(...center) : new THREE.Vector3();
  // Orbit in pivot-relative space, then translate back, so the default (pivot at
  // the origin) leaves the arithmetic it always did.
  const basePos = source.position.clone().sub(pivot);
  const axisVec =
    axis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : axis === 'z'
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);

  const positions: THREE.Vector3[] = [];
  for (let i = 1; i < count; i++) {
    const position = basePos
      .clone()
      .applyMatrix4(new THREE.Matrix4().makeRotationAxis(axisVec, (i / count) * Math.PI * 2))
      .add(pivot);
    assertFiniteTriple('arrayRadial resulting position', position.toArray());
    positions.push(position);
  }
  for (let i = 1; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const rotated = positions[i - 1]!;
    // Rotate local frame too so the copy faces outward consistently.
    const eulerDeg: [number, number, number] =
      axis === 'y'
        ? [0, (angle * 180) / Math.PI, 0]
        : axis === 'x'
          ? [(angle * 180) / Math.PI, 0, 0]
          : [0, 0, (angle * 180) / Math.PI];
    const copy = createInstance(`${namePrefix}${i}`, source, {
      position: [rotated.x, rotated.y, rotated.z],
      rotation: eulerDeg,
      scale: source.scale.toArray() as [number, number, number],
      parent,
    });
    if (options.orientation === 'relative') {
      copy.quaternion.setFromAxisAngle(axisVec, angle).multiply(source.quaternion);
    }
    out.push(copy);
  }
  return out;
}

export interface RepeatAlongCurveOptions {
  /** Copies placed along the curve, evenly spaced by arc length from `start` to `end`. */
  count: number;
  /** `tangent` (default) turns local +X along the curve; `none` keeps the source orientation. */
  align?: 'tangent' | 'none';
  /** Local +Y points toward this direction, made perpendicular to the tangent. Default [0,1,0]. */
  up?: [number, number, number];
  /** Uniform scale, or [attachment, tip] interpolated across the copies. Default 1. */
  scale?: number | [number, number];
  /** Degrees about the tangent, or [attachment, tip]. Default 0. */
  twist?: number | [number, number];
  /** Also place a copy twisted a further 180 degrees at each position: a frond's second row. */
  opposite?: boolean;
  /** Fractions of the curve's length where the first and last copy sit. Default 0 and 1. */
  start?: number;
  end?: number;
  /** true (default) returns one merged geometry; false returns shared-geometry mesh nodes. */
  merge?: boolean;
  /** Merged only: add a float `_along` attribute, 0 on the first copy and 1 on the last. */
  along?: boolean;
  /** Unmerged only: copies are named `${name}${i}` (createInstance adds `Mesh_`). */
  name?: string;
  /** Unmerged only: the parent that receives the copies. */
  parent?: THREE.Object3D;
}

/**
 * Copy one source along a sampled curve (`bezierCurve`, `catmullRomPath`), for leaflets on
 * a rachis, cards along a stem or studs along a rail. Each copy's local +X follows the curve
 * tangent (the outgoing segment at a sample point) and local +Y points toward `up`.
 *
 * With `merge` (the default) the copies become one BufferGeometry: one primitive per call,
 * UVs and other attributes copied unchanged per copy, positions/normals/tangents transformed.
 * Material groups are dropped, so the merged geometry takes one material.
 * Without it the copies are shared-geometry nodes like `arrayLinear`; the source is not moved.
 *
 * @example
 * const rachis = bezierCurve([[0,0,0],[0.6,0.5,0],[1.4,0.3,0]], 32);
 * const frond = repeatAlongCurve(leafletGeo, rachis,
 *   { count: 40, up: [0,0,1], scale: [1, 0.4], start: 0.1, opposite: true, along: true });
 */
export function repeatAlongCurve(
  source: THREE.BufferGeometry | THREE.Object3D,
  points: readonly (readonly [number, number, number])[],
  options: RepeatAlongCurveOptions,
): THREE.BufferGeometry | THREE.Object3D[] {
  const name = 'repeatAlongCurve';
  if (!options || typeof options !== 'object')
    throw new TypeError(`${name} needs an options object with count.`);
  const { count, align = 'tangent', merge = true, opposite = false } = options;
  assertRepetitionCount(name, opposite ? count * 2 : count);
  if (opposite && align !== 'tangent')
    throw new RangeError(`${name} opposite needs align: tangent.`);
  if (align !== 'tangent' && align !== 'none')
    throw new RangeError(`${name} align must be tangent or none.`);
  if (!Array.isArray(points) || points.length < 2)
    throw new RangeError(`${name} needs at least two points; sample the curve first.`);
  if (points.length > GEOMETRY_ALLOCATION_LIMITS.parametricSamples)
    throw new RangeError(
      `${name} accepts at most ${GEOMETRY_ALLOCATION_LIMITS.parametricSamples} points.`,
    );
  for (const [i, point] of points.entries()) assertFiniteTriple(`${name} points[${i}]`, point);
  const up = options.up ?? [0, 1, 0];
  assertFiniteTriple(`${name} up`, up);
  const upVector = new THREE.Vector3(...up);
  if (upVector.lengthSq() === 0) throw new RangeError(`${name} up must not be zero.`);
  upVector.normalize();
  const span = (label: string, value: number | [number, number] | undefined, fallback: number) => {
    const [a, b] =
      value === undefined ? [fallback, fallback] : Array.isArray(value) ? value : [value, value];
    if (!Number.isFinite(a) || !Number.isFinite(b))
      throw new RangeError(`${name} ${label} must be finite.`);
    return [a, b] as const;
  };
  const scale = span('scale', options.scale, 1);
  if (scale[0] <= 0 || scale[1] <= 0) throw new RangeError(`${name} scale must be positive.`);
  const twist = span('twist', options.twist, 0);
  if (align === 'none' && (twist[0] !== 0 || twist[1] !== 0))
    throw new RangeError(`${name} twist needs align: tangent.`);
  const start = options.start ?? 0;
  const end = options.end ?? 1;
  if (!(start >= 0 && end <= 1 && start <= end))
    throw new RangeError(`${name} start and end must satisfy 0 <= start <= end <= 1.`);

  // Arc length per sample; a copy at length s uses the segment s falls in.
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, az] = points[i - 1]!;
    const [bx, by, bz] = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay, bz - az));
  }
  const length = cumulative.at(-1)!;
  if (!(length > 0) || !Number.isFinite(length))
    throw new RangeError(`${name} curve length must be positive and finite.`);

  // Each frame carries its position's t, so an opposite copy shares its partner's _along.
  const frames: { matrix: THREE.Matrix4; t: number }[] = [];
  let previousUp = upVector.clone();
  for (let copy = 0; copy < count; copy++) {
    const t = count === 1 ? 0 : copy / (count - 1);
    const s = (start + (end - start) * t) * length;
    let segment = 0;
    while (segment < points.length - 2 && !(s < cumulative[segment + 1]!)) segment++;
    // Skip zero-length segments so a repeated sample cannot erase the tangent.
    while (segment < points.length - 2 && cumulative[segment + 1] === cumulative[segment])
      segment++;
    const a = new THREE.Vector3(...points[segment]!);
    const b = new THREE.Vector3(...points[segment + 1]!);
    const segmentLength = cumulative[segment + 1]! - cumulative[segment]!;
    const local = segmentLength > 0 ? (s - cumulative[segment]!) / segmentLength : 0;
    const position = a.clone().lerp(b, Math.min(Math.max(local, 0), 1));
    const k = THREE.MathUtils.lerp(scale[0], scale[1], t);
    const rotation = new THREE.Matrix4();
    let angle = 0;
    if (align === 'tangent') {
      const tangent = b.clone().sub(a).normalize();
      // `up` parallel to the tangent leaves the previous copy's up, then any perpendicular.
      let side = upVector.clone().sub(tangent.clone().multiplyScalar(upVector.dot(tangent)));
      if (side.lengthSq() < 1e-12)
        side = previousUp.clone().sub(tangent.clone().multiplyScalar(previousUp.dot(tangent)));
      if (side.lengthSq() < 1e-12)
        side = new THREE.Vector3(
          Math.abs(tangent.x) < 0.9 ? 1 : 0,
          Math.abs(tangent.x) < 0.9 ? 0 : 1,
          0,
        ).sub(tangent.clone().multiplyScalar(Math.abs(tangent.x) < 0.9 ? tangent.x : tangent.y));
      side.normalize();
      previousUp = side;
      rotation.makeBasis(tangent, side, new THREE.Vector3().crossVectors(tangent, side));
      angle = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(twist[0], twist[1], t));
    }
    for (const extra of opposite ? [0, Math.PI] : [0]) {
      const turned = rotation.clone();
      if (angle + extra) turned.multiply(new THREE.Matrix4().makeRotationX(angle + extra));
      const matrix = new THREE.Matrix4()
        .makeTranslation(position.x, position.y, position.z)
        .multiply(turned)
        .multiply(new THREE.Matrix4().makeScale(k, k, k));
      if (!matrix.elements.every(Number.isFinite))
        throw new RangeError(`${name} produced a non-finite copy transform.`);
      frames.push({ matrix, t });
    }
  }

  if (!merge) {
    // Duck-typed: sandbox objects come from another module realm (see createInstance).
    const mesh = (source as { isMesh?: boolean }).isMesh
      ? source
      : (source as THREE.Object3D).children?.find((child) => (child as THREE.Mesh).isMesh);
    if (!mesh) throw new TypeError(`${name} with merge: false needs a Mesh source.`);
    const prefix = options.name ?? (source as THREE.Object3D).name ?? 'Copy';
    return frames.map((frame, i) => {
      const copy = createInstance(`${prefix}${i}`, source as THREE.Object3D, {
        parent: options.parent,
      });
      frame.matrix.decompose(copy.position, copy.quaternion, copy.scale);
      return copy;
    });
  }
  const copies = frames.length;

  const geometry = (source as { isBufferGeometry?: boolean }).isBufferGeometry
    ? (source as THREE.BufferGeometry)
    : (source as { isMesh?: boolean }).isMesh
      ? (source as THREE.Mesh).geometry
      : undefined;
  if (!geometry) throw new TypeError(`${name} needs a BufferGeometry or Mesh source.`);
  if (Object.keys(geometry.morphAttributes).length)
    throw new RangeError(`${name} does not copy morph targets.`);
  // Groups are not copied: the merged geometry renders with one material, as a single-material
  // mesh already ignores them (BoxGeometry carries one group per face).
  const positionAttribute = geometry.getAttribute('position');
  if (!positionAttribute) throw new RangeError(`${name} source has no position attribute.`);
  const perCopy = positionAttribute.count;
  const total = perCopy * copies;
  if (total > GEOMETRY_ALLOCATION_LIMITS.curveRepeatVertices)
    throw new RangeError(
      `${name} would produce ${total} vertices; the limit is ${GEOMETRY_ALLOCATION_LIMITS.curveRepeatVertices}. Reduce count, simplify the source, or use merge: false.`,
    );

  const merged = new THREE.BufferGeometry();
  const vector = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const [key, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const transformed = key === 'position' || key === 'normal' || key === 'tangent';
    const ArrayType = transformed
      ? Float32Array
      : (((attribute as THREE.BufferAttribute).array?.constructor as new (
          n: number,
        ) => THREE.TypedArray) ?? Float32Array);
    const out = new ArrayType(total * size);
    for (let copy = 0; copy < copies; copy++) {
      const frame = frames[copy]!.matrix;
      normalMatrix.getNormalMatrix(frame);
      for (let i = 0; i < perCopy; i++) {
        const target = (copy * perCopy + i) * size;
        if (key === 'position') {
          vector.fromBufferAttribute(attribute, i).applyMatrix4(frame);
          out.set([vector.x, vector.y, vector.z], target);
        } else if (key === 'normal' || key === 'tangent') {
          vector.set(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
          vector.applyMatrix3(normalMatrix).normalize();
          out.set(
            size === 4
              ? [vector.x, vector.y, vector.z, attribute.getW(i)]
              : [vector.x, vector.y, vector.z],
            target,
          );
        } else {
          for (let c = 0; c < size; c++) out[target + c] = attribute.getComponent(i, c);
        }
      }
    }
    merged.setAttribute(
      key,
      new THREE.BufferAttribute(out, size, transformed ? false : attribute.normalized),
    );
  }
  if (options.along) {
    const along = new Float32Array(total);
    for (let copy = 0; copy < copies; copy++)
      along.fill(frames[copy]!.t, copy * perCopy, (copy + 1) * perCopy);
    merged.setAttribute('_along', new THREE.BufferAttribute(along, 1));
  }
  const index = geometry.getIndex();
  if (index) {
    const indices =
      total > 65_535
        ? new Uint32Array(index.count * copies)
        : new Uint16Array(index.count * copies);
    for (let copy = 0; copy < copies; copy++)
      for (let i = 0; i < index.count; i++)
        indices[copy * index.count + i] = index.getX(i) + copy * perCopy;
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Mirror: create one mirrored instance of `source` across the given plane.
 * Plane is identified by its normal axis ('x' = mirror across YZ plane).
 *
 * The plane passes through the parent-local origin. Source local coordinates
 * are reflected, then placed under `parent` (no implicit world reparenting).
 * Preserves source rotation and nonuniform scale with shared mesh resources.
 * Reflection is represented by signed TRS; winding is not baked into geometry.
 * A manually authored local matrix with shear, a zero scale or nonfinite
 * entries is rejected because a glTF node TRS cannot represent it faithfully.
 */
export function mirror(
  name: string,
  source: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  parent?: THREE.Object3D,
): THREE.Object3D {
  if (source.matrixAutoUpdate) source.updateMatrix();
  const reflected = new THREE.Matrix4()
    .makeScale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1)
    .multiply(source.matrix);
  if (!reflected.elements.every(Number.isFinite) || reflected.determinant() === 0) {
    throw new RangeError(
      `mirror("${name}"): source requires a finite, nonsingular local transform.`,
    );
  }
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  reflected.decompose(position, quaternion, scale);
  const recomposed = new THREE.Matrix4().compose(position, quaternion, scale);
  if (
    reflected.elements.some(
      (value, i) => Math.abs(value - recomposed.elements[i]!) > 1e-8 * Math.max(1, Math.abs(value)),
    )
  ) {
    throw new RangeError(
      `mirror("${name}"): local shear cannot be represented by a reflected TRS.`,
    );
  }
  const copy = createInstance(name, source);
  copy.position.copy(position);
  copy.quaternion.copy(quaternion);
  copy.scale.copy(scale);
  if (parent) parent.add(copy);
  return copy;
}

// =============================================================================
// Mesh ops
// =============================================================================

/**
 * Weld coincident vertices into shared indexed ones.
 *
 * Three.js's built-in BoxGeometry / CylinderGeometry / SphereGeometry carry
 * 4 verts per face so per-face normals and UVs stay independent. That's
 * correct for rendering but breaks any op that depends on vertex adjacency
 * — subdivision, smooth shading, per-vertex deformation.
 *
 * By default Three's `mergeVertices` hashes position + normal + uv, so
 * face-adjacent verts with different normals (e.g. a cube corner touching
 * 3 faces) do NOT collapse. Pass `{ positionOnly: true }` to weld purely
 * by position — the other attributes get dropped; the caller is
 * responsible for recomputing normals / UVs afterward.
 *
 * @example
 * // Full weld (preserves seams where normals or UVs differ):
 * const welded = mergeVertices(boxGeo(1, 1, 1));   // stays 24 verts
 *
 * @example
 * // Position-only weld (collapses shared corners for subdivision):
 * const merged = mergeVertices(boxGeo(1, 1, 1), { positionOnly: true }); // 8 verts
 * const smoothed = subdivide(merged, 2);            // single connected blob
 */
export function mergeVertices(
  geometry: THREE.BufferGeometry,
  opts: { tolerance?: number; positionOnly?: boolean } | number = {},
): THREE.BufferGeometry {
  // Legacy numeric second-arg still works: mergeVertices(geo, 1e-4)
  const { tolerance = 1e-4, positionOnly = false } =
    typeof opts === 'number' ? { tolerance: opts } : opts;

  if (!positionOnly) return threeMergeVertices(geometry, tolerance);

  // Strip non-position attributes so the hash only keys on position.
  const stripped = new THREE.BufferGeometry();
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return geometry;
  stripped.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(pos.array), pos.itemSize, pos.normalized),
  );
  if (geometry.index) {
    stripped.setIndex(new THREE.BufferAttribute(new Uint32Array(geometry.index.array), 1));
  }
  return threeMergeVertices(stripped, tolerance);
}

/**
 * Subdivide a geometry using Loop subdivision (via three-subdivide).
 * Returns a new BufferGeometry; the input is not mutated.
 *
 * Higher `iterations` = smoother but exponentially more triangles.
 * 1 iteration ~= 4x triangle count, 2 ~= 16x. Budget accordingly.
 *
 * Non-indexed inputs (Three's built-in primitives) are auto-welded via
 * `mergeVertices` first so shared corners subdivide as one surface, not
 * as disconnected face patches. Pass `opts.weld = false` to skip.
 *
 * @example
 * const smoothRock = subdivide(boxGeo(1, 1, 1), 2);
 */
export function subdivide(
  geometry: THREE.BufferGeometry,
  iterations = 1,
  opts: {
    split?: boolean;
    uvSmooth?: boolean;
    preserveEdges?: boolean;
    flatOnly?: boolean;
    weld?: boolean;
    /** Preserve per-corner UVs while smoothing positions across chart seams. */
    preserveUV?: boolean;
  } = {},
): THREE.BufferGeometry {
  if (geometry.hasAttribute('skinIndex') || geometry.hasAttribute('skinWeight'))
    throw new Error(
      'subdivide cannot interpolate skin joint indices safely; subdivide before skin binding.',
    );
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 0 ||
    iterations > GEOMETRY_ALLOCATION_LIMITS.subdivisionIterations
  )
    throw new RangeError(
      `subdivide iterations must be an integer from 0 to ${GEOMETRY_ALLOCATION_LIMITS.subdivisionIterations}.`,
    );
  const position = geometry.getAttribute('position');
  if (position?.itemSize !== 3) throw new TypeError('subdivide requires xyz positions.');
  const corners = geometry.index?.count ?? position.count;
  if (!Number.isSafeInteger(corners) || corners % 3 !== 0)
    throw new TypeError('subdivide requires complete triangles.');
  // edgeSplit allocates up to four triangles per source face even at zero iterations.
  const upperTriangles = (corners / 3) * (opts.split === false ? 1 : 4) * 4 ** iterations;
  if (
    !Number.isSafeInteger(upperTriangles) ||
    upperTriangles > GEOMETRY_ALLOCATION_LIMITS.subdivisionTriangles
  )
    throw new RangeError(
      `subdivide triangle budget exceeded: worst-case ${upperTriangles}, limit ${GEOMETRY_ALLOCATION_LIMITS.subdivisionTriangles}. Reduce iterations or subdivide a smaller mesh.`,
    );
  const attributes = [
    ...Object.values(geometry.attributes),
    ...Object.values(geometry.morphAttributes).flat(),
  ];
  for (const [name, attribute] of Object.entries(geometry.attributes))
    if (
      attribute.count !== position.count ||
      !Number.isInteger(attribute.itemSize) ||
      attribute.itemSize < 1 ||
      attribute.itemSize > 4
    )
      throw new Error(
        `subdivide ${name} must be a matching continuous per-vertex attribute with 1..4 components.`,
      );
  for (const targets of Object.values(geometry.morphAttributes))
    if (targets.some((attribute) => attribute.count !== position.count || attribute.itemSize !== 3))
      throw new Error(
        'subdivide morph targets currently require matching three-component attributes.',
      );
  const bytesPerCorner = attributes.reduce(
    (sum, attribute) => sum + attribute.itemSize * Math.max(4, attribute.array.BYTES_PER_ELEMENT),
    0,
  );
  const upperAttributeBytes =
    upperTriangles * 3 * (bytesPerCorner + (geometry.hasAttribute('normal') ? 0 : 12));
  if (
    !Number.isSafeInteger(upperAttributeBytes) ||
    upperAttributeBytes > GEOMETRY_ALLOCATION_LIMITS.subdivisionAttributeBytes
  )
    throw new RangeError(
      `subdivide attribute budget exceeded: worst-case ${upperAttributeBytes} bytes, limit ${GEOMETRY_ALLOCATION_LIMITS.subdivisionAttributeBytes}.`,
    );
  const { weld = true, preserveUV = false, ...subOpts } = opts;
  // Normalize every path before welding and upstream adjacency hashing. Otherwise
  // changing units changes the 1e-4 weld and upstream two-decimal topology decisions.
  const prepared = geometry.clone();
  prepared.computeBoundingBox();
  const center = prepared.boundingBox!.getCenter(new THREE.Vector3());
  const extent = prepared.boundingBox!.getSize(new THREE.Vector3());
  const size = Math.max(extent.x, extent.y, extent.z);
  const normalizationScale = size > 0 ? 10000 / size : 1;
  if (!Number.isFinite(normalizationScale) || !center.toArray().every(Number.isFinite))
    throw new Error('subdivide requires finite representable positions.');
  prepared
    .translate(-center.x, -center.y, -center.z)
    .scale(normalizationScale, normalizationScale, normalizationScale);
  const input = weld && !preserveUV ? mergeVertices(prepared, { positionOnly: true }) : prepared;
  // Upstream uses Vector3 temporaries even for four-component attributes. Scalar
  // channels receive the same linear weights without losing W. Decode normalized
  // storage too, because upstream does not propagate its normalized flag.
  const fourthComponents: Array<{ name: string; lanes: string[] }> = [];
  const reservedNames = new Set(Object.keys(input.attributes));
  let laneIndex = 0;
  for (const [name, attribute] of Object.entries(input.attributes)) {
    if (name === 'tangent') {
      input.deleteAttribute(name);
      continue;
    }
    const components = attribute.itemSize;
    const decoded = new Float32Array(attribute.count * components);
    for (let i = 0; i < attribute.count; i++)
      for (let component = 0; component < components; component++)
        decoded[i * components + component] = attribute.getComponent(i, component);
    if (components === 4) {
      const lanes: string[] = [];
      for (let component = 0; component < 4; component++) {
        let lane: string;
        do {
          lane = `__kiln_subdivision_lane_${laneIndex++}`;
        } while (reservedNames.has(lane) || input.hasAttribute(lane));
        const values = new Float32Array(attribute.count);
        for (let i = 0; i < attribute.count; i++) values[i] = decoded[i * 4 + component]!;
        input.setAttribute(lane, new THREE.BufferAttribute(values, 1));
        lanes.push(lane);
      }
      input.deleteAttribute(name);
      fourthComponents.push({ name, lanes });
    } else input.setAttribute(name, new THREE.BufferAttribute(decoded, components));
  }
  for (const targets of Object.values(input.morphAttributes))
    for (let target = 0; target < targets.length; target++) {
      const attribute = targets[target]!;
      const decoded = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; i++)
        for (let component = 0; component < 3; component++)
          decoded[i * 3 + component] = attribute.getComponent(i, component);
      targets[target] = new THREE.BufferAttribute(decoded, 3);
    }
  if (preserveUV) subOpts.uvSmooth = false;
  // `three-subdivide` builds each new vertex normal by SUMMING the normals of
  // the faces around it and never divides through, so the length comes out as
  // however many faces met there -- 2/3 after one iteration on a box, and 0.35
  // after two. A raster never shows this, because a shader normalises before it
  // lights, and the glTF validator rejects every one of them
  // (GLTF_ACCESSOR_VECTOR3_NON_UNIT). Found by a dispatched agent's printing
  // press: `subdivide(boxGeo(1.5, 0.6, 0.8), 2)` produced 1,104 bad normals out
  // of 1,152 and blocked the build at final-glb. Same repair as `lathe`.
  const output = normalizeSurfaceNormals(LoopSubdivision.modify(input, iterations, subOpts));
  for (const { name, lanes } of fourthComponents) {
    const count = output.getAttribute('position').count;
    const values = new Float32Array(count * 4);
    for (let component = 0; component < 4; component++) {
      const lane = output.getAttribute(lanes[component]!);
      for (let i = 0; i < count; i++) values[i * 4 + component] = lane.getX(i);
      output.deleteAttribute(lanes[component]!);
    }
    output.setAttribute(name, new THREE.BufferAttribute(values, 4));
  }
  output
    .scale(1 / normalizationScale, 1 / normalizationScale, 1 / normalizationScale)
    .translate(center.x, center.y, center.z);
  output.userData = structuredClone(geometry.userData);
  output.deleteAttribute('tangent');
  output.computeBoundingBox();
  output.computeBoundingSphere();
  if (geometry.getAttribute('uv') && !output.getAttribute('uv')) {
    output.userData.kilnAttributeWarnings = [
      ...(Array.isArray(output.userData.kilnAttributeWarnings)
        ? output.userData.kilnAttributeWarnings
        : []),
      {
        code: 'SUBDIVIDE_UV_DROPPED',
        message:
          'Position-only subdivision discarded UVs. Use preserveUV: true or unwrap the output.',
      },
    ];
  }
  const dropped = Object.keys(geometry.attributes).filter(
    (name) => name !== 'uv' && !output.hasAttribute(name),
  );
  if (dropped.length)
    output.userData.kilnAttributeWarnings = [
      ...(Array.isArray(output.userData.kilnAttributeWarnings)
        ? output.userData.kilnAttributeWarnings
        : []),
      {
        code: 'SUBDIVIDE_ATTRIBUTES_DROPPED',
        message: `Subdivision removed attributes: ${dropped.join(', ')}. Rebuild required shading attributes after subdivision.`,
      },
    ];
  if (geometry.groups.length && !output.groups.length)
    output.userData.kilnAttributeWarnings = [
      ...(Array.isArray(output.userData.kilnAttributeWarnings)
        ? output.userData.kilnAttributeWarnings
        : []),
      {
        code: 'SUBDIVIDE_GROUPS_DROPPED',
        message:
          'Position-only subdivision removed material groups. Use preserveUV: true to retain corner attributes and material boundaries.',
      },
    ];
  const retainedMorphs = new Set(
    Object.entries(output.morphAttributes)
      .filter(([, targets]) => targets.length > 0)
      .map(([name]) => name),
  );
  const droppedMorphs = Object.keys(geometry.morphAttributes).filter(
    (name) => !retainedMorphs.has(name),
  );
  if (droppedMorphs.length)
    output.userData.kilnAttributeWarnings = [
      ...(Array.isArray(output.userData.kilnAttributeWarnings)
        ? output.userData.kilnAttributeWarnings
        : []),
      {
        code: 'SUBDIVIDE_MORPHS_DROPPED',
        message: `Position-only subdivision removed morph attributes: ${droppedMorphs.join(', ')}. Use preserveUV: true to retain supported corner and morph attributes.`,
      },
    ];
  if (geometry.userData.kilnCsgProvenance || geometry.userData.kilnRanges) {
    delete output.userData.kilnCsgProvenance;
    delete output.userData.kilnRanges;
    output.userData.kilnAttributeWarnings = [
      ...(output.userData.kilnAttributeWarnings ?? []),
      {
        code: 'SUBDIVIDE_PROVENANCE_DROPPED',
        message:
          'Subdivision changed triangle topology. Source face/range provenance was discarded rather than guessed.',
      },
    ];
  }
  return output;
}

// =============================================================================
// Curve ops
// =============================================================================

function assertTubeRadius(radius: number): void {
  try {
    assertDimension('Tube radius', radius);
  } catch {
    throw new AuthoringDiagnosticError('TUBE_RADIUS');
  }
}

/**
 * Sweep a circular profile along a path of points to produce a tube mesh.
 * The simplest "curve to mesh" — matches Blender's Curve to Mesh node when
 * the profile is a circle.
 *
 * @param points — array of [x, y, z] waypoints defining the path
 * @param radius — tube radius
 * @param tubularSegments — segments along the path (default 32)
 * @param radialSegments — segments around the tube (default 8)
 * @param closed — loop the path back to start (default false)
 *
 * @example
 * const pipeGeo = curveToMesh([[0,0,0], [0,1,0], [1,1,0], [1,2,0]], 0.1);
 */
export function curveToMesh(
  points: Array<[number, number, number]>,
  radius: number,
  tubularSegments = 32,
  radialSegments = 8,
  closed = false,
): THREE.BufferGeometry {
  assertTubeRadius(radius);
  const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors, closed);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
}

/**
 * Construct a lathe (surface of revolution) by spinning a 2D profile
 * around the Y axis. Classic for bottles, vases, wheels, turned wood.
 *
 * @param profile — array of [x, y] points; x is radial distance, y is height
 * @param segments — radial segments (default 12)
 */
/**
 * three.js `LatheGeometry` emits one ring of NON-UNIT normals.
 *
 * Its meridian pre-pass copies the running normal into `prevNormal` *before*
 * normalising it, and the final profile point then pushes `prevNormal`
 * verbatim -- so every vertex on the last ring carries a normal whose length is
 * the length of the last profile segment rather than 1. Nothing shows in a
 * raster, because a shader normalises before it lights; it is fatal on export,
 * because the glTF validator rejects it with GLTF_ACCESSOR_VECTOR3_NON_UNIT and
 * the asset never ships.
 *
 * Found by an agent dispatched through `scripts/dispatch-asset.mjs`: eight
 * lathed saucers with a 0.03 m final profile segment produced 15 of 105
 * vertices at length 0.030017 each, and blocked the build at final-glb.
 *
 * Only the broken ring is touched. Rebuilding the whole attribute with
 * `computeVertexNormals` would throw away the smooth meridian shading that is
 * the entire reason to lathe a profile in the first place.
 */
function normalizeSurfaceNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!normal) return geo;
  let repaired = false;
  for (let i = 0; i < normal.count; i++) {
    const x = normal.getX(i);
    const y = normal.getY(i);
    const z = normal.getZ(i);
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len < 1e-12) {
      // A profile that touches the axis can degenerate entirely. Any unit
      // vector satisfies the validator; +Y is the least surprising.
      normal.setXYZ(i, 0, 1, 0);
      repaired = true;
      continue;
    }
    if (Math.abs(len - 1) <= 1e-6) continue;
    normal.setXYZ(i, x / len, y / len, z / len);
    repaired = true;
  }
  if (repaired) normal.needsUpdate = true;
  return geo;
}

export function lathe(profile: Array<[number, number]>, segments = 12): THREE.BufferGeometry {
  return revolveGeo(profile, { segments });
}

/**
 * Surface of revolution with explicit axis + sweep angle. Generalises
 * `lathe` (which is locked to a full revolution around +Y) for cases where
 * you need a partial sweep (e.g. half a dome, a 90° wedge of a wheel) or
 * a non-Y axis of revolution (e.g. a fan blade revolved around +X).
 *
 * The 2D `profile` is in the same convention as `lathe`: x = radial
 * distance from the axis, y = position along the axis. Then:
 *   - `angle` controls the sweep (default `2π` = full revolution).
 *   - `axis` reorients the resulting Y-up surface to point along the
 *     supplied unit vector (defaults to `[0, 1, 0]` = no reorientation).
 *
 * Pattern adapted from chili3d's `revolve(profile, axis: Line, angle)` —
 * the parameter shape is the same, but the implementation is mesh-only
 * (Three.js LatheGeometry + a quaternion reorientation) rather than B-rep.
 *
 * @example
 * // Half-dome: profile traces a quarter circle, sweep 180°.
 * const dome = revolveGeo(
 *   [...Array(8)].map((_, i) => {
 *     const t = (i / 7) * Math.PI / 2;
 *     return [Math.cos(t), Math.sin(t)] as [number, number];
 *   }),
 *   { angle: Math.PI }
 * );
 */
export function revolveGeo(
  profile: Array<[number, number]>,
  options: {
    angle?: number;
    axis?: [number, number, number];
    segments?: number;
  } = {},
): THREE.BufferGeometry {
  const { angle = Math.PI * 2, axis = [0, 1, 0], segments = 12 } = options;
  const points2d = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  // LatheGeometry signature: (points, segments, phiStart, phiLength).
  const geo = normalizeSurfaceNormals(new THREE.LatheGeometry(points2d, segments, 0, angle));

  const n = new THREE.Vector3(axis[0], axis[1], axis[2]);
  if (n.lengthSq() < 1e-12) {
    throw new Error(`revolveGeo: axis must be a non-zero vector (got [${axis.join(',')}]).`);
  }
  n.normalize();
  if (n.x !== 0 || n.y !== 1 || n.z !== 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    geo.applyQuaternion(q);
  }
  return geo;
}

/**
 * Path-driven swept circle. Generalises `beamBetween` (point-to-point) and
 * `curveToMesh` (raw catmull-rom) into a single helper that accepts a path
 * of waypoints plus an optional bend-radius for smoothing sharp corners.
 *
 * Compared to `curveToMesh`:
 *   - Same TubeGeometry/CatmullRomCurve3 backbone, so the visual result is
 *     identical for unsmoothed paths.
 *   - `bendRadius > 0` inserts interpolated waypoints near each interior
 *     turn so the spline reads as a rounded corner instead of a single
 *     control point yanking the curve.
 *   - `closed` loops the path end back to start.
 *
 * Pattern adapted from chili3d's PipeNode (`bendRadius` + path interpolation
 * for sharp turns) — implementation is original Three.js mesh-side code.
 *
 * @example
 * // Cable run along the gunwale of a boat:
 * const cable = pipeAlongPath(
 *   [[0, 0.5, 0], [1, 0.5, 0], [1, 0.5, 2]],
 *   0.02,
 *   { bendRadius: 0.1 }
 * );
 */
export function pipeAlongPath(
  points: Array<[number, number, number]>,
  radius: number,
  options: {
    bendRadius?: number;
    closed?: boolean;
    tubularSegments?: number;
    radialSegments?: number;
  } = {},
): THREE.BufferGeometry {
  const { bendRadius = 0, closed = false, tubularSegments = 32, radialSegments = 8 } = options;
  assertTubeRadius(radius);

  if (points.length < 2) {
    throw new Error(`pipeAlongPath: need at least 2 points (got ${points.length}).`);
  }

  let pathPoints = points;

  // Bend smoothing: at each interior corner, replace the corner point with
  // two points offset along the incoming/outgoing edges by `bendRadius`.
  // The Catmull-Rom spline then curves smoothly between them instead of
  // pinching tightly to the corner. Skipped for endpoints (or always for a
  // closed path's first/last, since they're not corners).
  if (bendRadius > 0 && points.length >= 3) {
    const smoothed: Array<[number, number, number]> = [];
    smoothed.push(points[0]!);
    for (let i = 1; i < points.length - 1; i++) {
      const prev = new THREE.Vector3(...points[i - 1]!);
      const cur = new THREE.Vector3(...points[i]!);
      const next = new THREE.Vector3(...points[i + 1]!);
      const inDir = cur.clone().sub(prev);
      const outDir = next.clone().sub(cur);
      const inLen = inDir.length();
      const outLen = outDir.length();
      // Cap the offset so adjacent segments don't overlap.
      const inOffset = Math.min(bendRadius, inLen / 2);
      const outOffset = Math.min(bendRadius, outLen / 2);
      const before = cur.clone().sub(inDir.clone().normalize().multiplyScalar(inOffset));
      const after = cur.clone().add(outDir.clone().normalize().multiplyScalar(outOffset));
      smoothed.push([before.x, before.y, before.z]);
      smoothed.push([after.x, after.y, after.z]);
    }
    smoothed.push(points[points.length - 1]!);
    pathPoints = smoothed;
  }

  return curveToMesh(pathPoints, radius, tubularSegments, radialSegments, closed);
}

/**
 * Quadratic or cubic Bézier curve sampled into a point list for curveToMesh.
 * 3 points = quadratic, 4 points = cubic.
 *
 * @example
 * const path = bezierCurve([[0,0,0], [1,2,0], [3,2,0], [4,0,0]], 24);
 * const geo = curveToMesh(path, 0.1);
 */
export function bezierCurve(
  controlPoints: Array<[number, number, number]>,
  samples = 32,
): Array<[number, number, number]> {
  const vecs = controlPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  let curve: THREE.Curve<THREE.Vector3>;
  if (vecs.length === 3) {
    curve = new THREE.QuadraticBezierCurve3(vecs[0]!, vecs[1]!, vecs[2]!);
  } else if (vecs.length === 4) {
    curve = new THREE.CubicBezierCurve3(vecs[0]!, vecs[1]!, vecs[2]!, vecs[3]!);
  } else {
    throw new Error(`bezierCurve: need 3 or 4 control points, got ${vecs.length}`);
  }
  return curve.getPoints(samples).map((v) => [v.x, v.y, v.z] as [number, number, number]);
}
