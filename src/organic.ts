/** Higher-level organic authoring helpers built on sweeps, SDFs and mesh ops. */
import * as THREE from 'three';
import type { Point3 } from './geometry';
import { creaseNormals } from './geometry';
import { implicitSurface, type ImplicitSurfaceOptions } from './implicit';
import { circleProfile } from './profile';
import { subdivide } from './ops';
import { sweepProfile } from './sweep';
import { smoothUnionSpheres } from './sdf';

function assertSafePathCount(name: string, count: number): void {
  if (!Number.isSafeInteger(count))
    throw new Error(`${name} derived sample count must be a safe integer; reduce sample counts.`);
}

export interface MetaballSphere {
  center: Point3;
  radius: number;
}

export type MetaballSurfaceOptions = Omit<ImplicitSurfaceOptions, 'bounds'> & {
  bounds: ImplicitSurfaceOptions['bounds'];
  /** Shared smooth-union width. Default max(0.35 × smallest radius, 0.02 scene units). */
  blend?: number;
};

/**
 * Smooth union of spheres meshed through the experimental implicit pipeline.
 * Spheres use the same positive-inside convention as `implicitSurface`.
 * Uses the existing implicit-surface grid and field-callback limits unchanged.
 */
export async function metaballSurface(
  spheres: readonly MetaballSphere[],
  options: MetaballSurfaceOptions,
): Promise<THREE.BufferGeometry> {
  if (!spheres.length) throw new Error('metaballSurface needs at least one sphere');
  let minRadius = Infinity;
  for (const s of spheres) {
    if (s.center.length !== 3 || !s.center.every(Number.isFinite))
      throw new Error('metaballSurface sphere center must be three finite numbers');
    if (!Number.isFinite(s.radius) || s.radius <= 0)
      throw new Error('metaballSurface sphere radius must be positive and finite');
    minRadius = Math.min(minRadius, s.radius);
  }
  const blend = options.blend ?? Math.max(minRadius * 0.35, 0.02);
  if (!Number.isFinite(blend) || blend <= 0)
    throw new Error('metaballSurface blend must be positive and finite');
  const { bounds, ...rest } = options;
  const field = (p: Point3) => smoothUnionSpheres(p, spheres, blend);
  return implicitSurface(field, { bounds, ...rest });
}

/**
 * Sample a Catmull-Rom spline through arbitrary control points. Use the samples
 * as a `sweepProfile` or `taperedTube` path for smooth curvature. Open paths
 * include both endpoints; closed paths omit the repeated endpoint.
 * Derived sample counts must remain safe integers.
 */
export function catmullRomPath(
  controlPoints: readonly Point3[],
  samplesPerSpan = 8,
  closed = false,
): Point3[] {
  if (controlPoints.length < (closed ? 3 : 2))
    throw new Error('catmullRomPath needs at least two open or three closed control points');
  if (!Number.isSafeInteger(samplesPerSpan) || samplesPerSpan < 1)
    throw new Error('catmullRomPath samplesPerSpan must be a positive integer');
  const spans = closed ? controlPoints.length : controlPoints.length - 1;
  assertSafePathCount('catmullRomPath', spans * samplesPerSpan + 1);
  if (controlPoints.some((p) => p.length !== 3 || !p.every(Number.isFinite)))
    throw new Error('catmullRomPath control points must be finite [x,y,z] triples');
  const vectors = controlPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors, closed);
  const points = curve.getPoints(spans * samplesPerSpan);
  if (closed) points.pop();
  return points.map((v) => [v.x, v.y, v.z] as Point3);
}

export interface TaperedTubeOptions {
  radialSegments?: number;
  /** Degree crease for profile sides; 180 shades a round profile smoothly. Default 180. */
  creaseAngle?: number;
  cap?: boolean | 'start' | 'end';
  closed?: boolean;
  up?: Point3;
  twist?: number;
  /**
   * Per-station elliptical scale on the circular profile `[side, depth]`.
   * Values multiply the profile axes before the station radius is applied.
   */
  sectionScale?: readonly (readonly [number, number])[];
}

export interface SpiralPathOptions {
  center: Point3;
  /** Max radius of the spiral in the horizontal plane. */
  radius: number;
  /** Vertical rise while spiraling. */
  rise: number;
  /** Full turns (e.g. 1.75). */
  turns: number;
  /** World up axis. Default `[0, 1, 0]`. */
  axis?: Point3;
  /** Horizontal direction at the start of the spiral (belly / curl opening). Default `[0, 0, 1]`. */
  forward?: Point3;
  samples?: number;
}

/**
 * Circular tube with per-station radius along a polyline path. For smooth paths,
 * sample a spline first with `catmullRomPath`.
 */
export function taperedTube(
  path: readonly Point3[],
  radii: readonly number[],
  options: TaperedTubeOptions = {},
): THREE.BufferGeometry {
  const closed = options.closed ?? false;
  const stations = path;
  if (stations.length < (closed ? 3 : 2))
    throw new Error('taperedTube needs at least two open or three closed path points');
  if (radii.length !== stations.length)
    throw new Error('taperedTube radii must have one entry per path point');
  for (const r of radii) {
    if (!Number.isFinite(r) || r <= 0)
      throw new Error('taperedTube radii must be positive and finite');
  }
  const radialSegments = options.radialSegments ?? 20;
  const profile = circleProfile(1, radialSegments).map(([x, y]) => [x, y] as [number, number]);
  const scale = radii.map((r, i) => {
    const [side, depth] = options.sectionScale?.[i] ?? [1, 1];
    return [r * side, r * depth] as [number, number];
  });
  if (options.sectionScale && options.sectionScale.length !== stations.length)
    throw new Error('taperedTube sectionScale needs one [side, depth] pair per path point');
  const geo = sweepProfile(profile, [...stations], {
    cap: options.cap ?? true,
    closed,
    up: options.up,
    twist: options.twist ?? 0,
    scale,
    creaseAngle: options.creaseAngle ?? 180,
  });
  return geo;
}

/**
 * Rising, shrinking spiral for prehensile tails. Starts `radius` from center in
 * the projected forward direction; ends `rise` higher at 42% of the start radius.
 * Returns samples + 1 stations over the requested number of turns.
 * Derived sample counts must remain safe integers.
 */
export function spiralPath(options: SpiralPathOptions): Point3[] {
  const {
    center,
    radius,
    rise,
    turns,
    axis = [0, 1, 0],
    forward = [0, 0, 1],
    samples = 24,
  } = options;
  if (![radius, rise, turns].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('spiralPath radius, rise and turns must be positive and finite');
  if (!Number.isSafeInteger(samples) || samples < 4)
    throw new Error('spiralPath samples must be an integer >= 4');
  assertSafePathCount('spiralPath', samples + 1);
  if (center.length !== 3 || !center.every(Number.isFinite))
    throw new Error('spiralPath center must be a finite [x,y,z] triple');
  if (axis.length !== 3 || forward.length !== 3 || ![...axis, ...forward].every(Number.isFinite))
    throw new Error('spiralPath axis and forward must be finite [x,y,z] triples');
  const up = new THREE.Vector3(...axis);
  const fwd = new THREE.Vector3(...forward);
  if (up.lengthSq() < 1e-12 || fwd.lengthSq() < 1e-12)
    throw new Error('spiralPath axis and forward must be nonzero');
  up.normalize();
  const horiz = fwd.clone().addScaledVector(up, -fwd.dot(up));
  if (horiz.lengthSq() < 1e-12) throw new Error('spiralPath forward must not be parallel to axis');
  horiz.normalize();
  const right = new THREE.Vector3().crossVectors(up, horiz).normalize();
  const out: Point3[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const theta = u * turns * Math.PI * 2;
    const r = radius * (1 - u * 0.58);
    const offset = horiz
      .clone()
      .multiplyScalar(r * Math.cos(theta))
      .add(right.clone().multiplyScalar(r * Math.sin(theta)));
    const lift = up.clone().multiplyScalar(u * rise);
    out.push([
      center[0] + offset.x + lift.x,
      center[1] + offset.y + lift.y,
      center[2] + offset.z + lift.z,
    ]);
  }
  return out;
}

export interface SmoothOrganicOptions {
  iterations?: number;
  creaseAngle?: number;
  preserveUV?: boolean;
}

/** Subdivide then angle-limit normals — common finish for organic sweeps and lofts. */
export function smoothOrganic(
  geometry: THREE.BufferGeometry,
  options: SmoothOrganicOptions = {},
): THREE.BufferGeometry {
  const iterations = options.iterations ?? 1;
  const preserveUV = options.preserveUV ?? false;
  const subdivided = subdivide(geometry, iterations, preserveUV ? { preserveUV: true } : undefined);
  return creaseNormals(subdivided, { angle: options.creaseAngle ?? 55 });
}
