/** Corresponding-profile lofts and polyline sweeps with parallel-transport frames. */
import * as THREE from 'three';
import { meshGeo, type Point3 } from './geometry';
import { geometryFrameMatrix, type GeometryFrame } from './deform';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import { recordSweepAnalysis } from './sweep-analysis';

export type ProfilePoint = readonly [number, number];
export interface LoftSection {
  profile: readonly ProfilePoint[];
  frame?: GeometryFrame;
}
export interface LoftOptions {
  cap?: boolean;
}
export interface SweepOptions {
  /** Cap both ends (default true), neither, or only the `'start'` or `'end'` of an open path. */
  cap?: boolean | 'start' | 'end';
  /**
   * Degrees. Side faces meeting at more than this angle, across a profile corner or
   * a path corner, get separate vertices and a hard shading edge. Default 60: squares,
   * triangles and pentagons stay faceted, hexagons and finer profiles shade smooth.
   * 180 smooths every edge.
   */
  creaseAngle?: number;
  closed?: boolean;
  /** Reference for the first profile's +Z axis, projected perpendicular to the path. */
  up?: Point3;
  /** Total twist along path, in degrees. Closed paths require a multiple of 360. */
  twist?: number;
  /** Uniform scale or one positive [profile X, profile Z] scale per path station. */
  scale?: number | readonly (readonly [number, number])[];
}

function rejectHoles(value: object, label: string): void {
  if ('holes' in value && value.holes !== undefined)
    throw new AuthoringDiagnosticError(
      'PROFILE_HOLES_UNSUPPORTED',
      `${label}: holes are unsupported. Use extrudeProfile for a holed cross-section with optional twist/taper; independently varying contours need explicit geometry or solid subtraction.`,
    );
}

function profilePoints(profile: readonly ProfilePoint[]): THREE.Vector2[] {
  if (profile.length < 3 || profile.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
    throw new Error('profile requires at least three finite xy points');
  const points = profile.map((p) => new THREE.Vector2(...p));
  // Validate shape in profile-relative units. Absolute cutoffs reject the same
  // valid profile when authored in small units, and raw area loses translation precision.
  const bounds = new THREE.Box2().setFromPoints(points);
  const extent = bounds.getSize(new THREE.Vector2()).length();
  if (!(extent > 0) || !Number.isFinite(extent))
    throw new Error('profile requires a finite nonzero extent');
  const normalized = points.map((p) => p.clone().sub(bounds.min).divideScalar(extent));
  if (normalized[0]!.distanceTo(normalized[normalized.length - 1]!) < 1e-10) {
    points.pop();
    normalized.pop();
  }
  if (points.length < 3) throw new Error('profile requires three distinct points');
  const cross = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < points.length; i++) {
    const a = normalized[i]!,
      b = normalized[(i + 1) % points.length]!;
    if (a.distanceToSquared(b) < 1e-20) throw new Error('profile has duplicate adjacent points');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = normalized[j]!,
        d = normalized[(j + 1) % points.length]!;
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + 1e-10 &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + 1e-10
      )
        throw new Error('profile self-intersects or touches itself');
    }
  }
  const area = THREE.ShapeUtils.area(normalized);
  if (Math.abs(area) < 1e-12) throw new Error('profile area must be nonzero');
  // Keep the first correspondence point fixed when normalizing winding.
  if (area < 0) points.splice(1, points.length - 1, ...points.slice(1).reverse());
  return points;
}

/** Which ends of an open loft or sweep are capped. */
interface CapEnds {
  start: boolean;
  end: boolean;
}

/** Slack so a regular hexagon's exact 60 degree corners stay smooth at the default. */
const CREASE_TOLERANCE_DEGREES = 1e-2;

/** Normal of the side panel a-b over c-d, matching its (a, c, b), (b, c, d) winding. */
function panelNormal(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
): THREE.Vector3 {
  return d.clone().sub(a).cross(b.clone().sub(c));
}

function isCrease(first: THREE.Vector3, second: THREE.Vector3, creaseAngle: number): boolean {
  if (!(first.lengthSq() > 0 && second.lengthSq() > 0)) return false;
  const angle = Math.atan2(first.clone().cross(second).length(), first.dot(second));
  return THREE.MathUtils.radToDeg(angle) > creaseAngle + CREASE_TOLERANCE_DEGREES;
}

function buildLoft(
  rings: THREE.Vector3[][],
  profiles: THREE.Vector2[][],
  closed: boolean,
  cap: CapEnds,
  firstFrameForward?: THREE.Vector3,
  creaseAngle?: number,
): THREE.BufferGeometry {
  const n = rings[0]!.length,
    positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const centers = rings.map((r) =>
    r.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / n),
  );
  const lengths = [0];
  for (let i = 1; i < centers.length; i++)
    lengths.push(lengths[i - 1]! + centers[i]!.distanceTo(centers[i - 1]!));
  const total = lengths[lengths.length - 1]!;
  if (!(total > 0) || !Number.isFinite(total))
    throw new Error('loft section centers must progress along a finite nonzero path');
  // Side panels that meet at more than creaseAngle, across a profile corner
  // (column) or a path station (ring), get their own vertex copies so the
  // shading edge stays hard. Without an angle every edge is shared and smooth.
  const panels = rings
    .slice(0, -1)
    .map((ring, i) =>
      ring.map((origin, j) =>
        panelNormal(origin, ring[(j + 1) % n]!, rings[i + 1]![j]!, rings[i + 1]![(j + 1) % n]!),
      ),
    );
  const hardColumn = Array.from(
    { length: n },
    (_, j) =>
      creaseAngle !== undefined &&
      panels.some((row) => isCrease(row[(j - 1 + n) % n]!, row[j]!, creaseAngle)),
  );
  const hardRing = rings.map(
    (_, i) =>
      creaseAngle !== undefined &&
      i > 0 &&
      i < rings.length - 1 &&
      panels[i - 1]!.some((panel, j) => isCrease(panel, panels[i]![j]!, creaseAngle)),
  );
  const hardClosure =
    closed &&
    creaseAngle !== undefined &&
    panels[panels.length - 1]!.some((panel, j) => isCrease(panel, panels[0]![j]!, creaseAngle));
  // A block is one ring's vertices: slots 0..n (slot n repeats vertex 0 for the
  // UV seam), then one slot per creased interior column for the panel ending there.
  const extraSlot = new Map<number, number>();
  for (let j = 1; j < n; j++) if (hardColumn[j]) extraSlot.set(j, n + 1 + extraSlot.size);
  const endSlot = (j: number) => (j === n ? n : (extraSlot.get(j) ?? j));
  const blockSize = n + 1 + extraSlot.size,
    blockRing: number[] = [],
    nearBlock: number[] = [],
    farBlock: number[] = [];
  for (let i = 0; i < rings.length; i++) {
    farBlock.push(blockRing.length);
    blockRing.push(i);
    if (hardRing[i]) blockRing.push(i);
    nearBlock.push(blockRing.length - 1);
  }
  for (const i of blockRing) {
    const ring = rings[i]!,
      distance = [0];
    for (let j = 1; j <= n; j++)
      distance.push(distance[j - 1]! + ring[j % n]!.distanceTo(ring[j - 1]!));
    for (const j of [...Array.from({ length: n + 1 }, (_, j) => j), ...extraSlot.keys()]) {
      positions.push(...ring[j % n]!.toArray());
      uvs.push(distance[j]! / distance[n]!, lengths[i]! / total);
    }
  }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const near = nearBlock[i]! * blockSize,
        far = farBlock[i + 1]! * blockSize;
      const a = near + j,
        b = near + endSlot(j + 1),
        c = far + j,
        d = far + endSlot(j + 1);
      const origin = rings[i]![j]!,
        ab = rings[i]![(j + 1) % n]!.clone().sub(origin),
        ac = rings[i + 1]![j]!.clone().sub(origin),
        ad = rings[i + 1]![(j + 1) % n]!.clone().sub(origin);
      // The edge at an intermediate section is lerp(ab, ad-ac, t). If it
      // collapses inside this interval, correspondence folds the side panel.
      // Normalize by edge length, not station spacing, to retain thin profiles.
      const endEdge = ad.clone().sub(ac),
        edgeScale = Math.max(ab.length(), endEdge.length());
      if (edgeScale > 0) {
        const startEdge = ab.clone().divideScalar(edgeScale),
          delta = endEdge.divideScalar(edgeScale).sub(startEdge),
          denominator = delta.lengthSq(),
          t = denominator > 0 ? -startEdge.dot(delta) / denominator : 0;
        if (t > 0 && t < 1 && startEdge.addScaledVector(delta, t).lengthSq() <= 1e-20)
          throw new AuthoringDiagnosticError('PROFILE_CORRESPONDENCE_COLLAPSE');
      }
      const scale = Math.max(ab.length(), ac.length(), ad.length());
      // A fixed diagonal biases warped panels: mirrored profiles then produce
      // different surfaces. Use the bilinear midpoint, invariant to corner order,
      // for nonplanar panels. Planar panels retain their compact triangulation.
      const warp =
        scale > 0
          ? Math.abs(
              ab
                .clone()
                .divideScalar(scale)
                .dot(ac.clone().divideScalar(scale).cross(ad.clone().divideScalar(scale))),
            )
          : 0;
      if (warp > 1e-10) {
        const middle = positions.length / 3;
        positions.push(
          ...origin
            .clone()
            .addScaledVector(ab, 0.25)
            .addScaledVector(ac, 0.25)
            .addScaledVector(ad, 0.25)
            .toArray(),
        );
        uvs.push(
          (uvs[a * 2]! + uvs[b * 2]! + uvs[c * 2]! + uvs[d * 2]!) / 4,
          (uvs[a * 2 + 1]! + uvs[b * 2 + 1]! + uvs[c * 2 + 1]! + uvs[d * 2 + 1]!) / 4,
        );
        indices.push(a, c, middle, c, d, middle, d, b, middle, b, a, middle);
      } else indices.push(a, c, b, b, c, d);
    }
  if (!closed)
    for (const station of [0, rings.length - 1]) {
      if (!(station === 0 ? cap.start : cap.end)) continue;
      const ring = rings[station]!,
        profile = profiles[station]!;
      const start = positions.length / 3;
      const bounds = new THREE.Box2().setFromPoints(profile);
      const size = bounds.getSize(new THREE.Vector2());
      for (let j = 0; j < n; j++) {
        positions.push(...ring[j]!.toArray());
        uvs.push(
          (profile[j]!.x - bounds.min.x) / (size.x || 1),
          (profile[j]!.y - bounds.min.y) / (size.y || 1),
        );
      }
      for (const tri of THREE.ShapeUtils.triangulateShape(profile, [])) {
        if (station === 0) indices.push(...tri.map((j) => start + j));
        else indices.push(...tri.toReversed().map((j) => start + j));
      }
    }
  // Section planes do not prescribe a traversal direction. Descending stations
  // need the opposite winding, including caps, before normals are computed.
  if (firstFrameForward && firstFrameForward.dot(centers[1]!.clone().sub(centers[0]!)) < 0)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  const out = meshGeo({ positions, indices, uvs });
  const normal = out.getAttribute('normal');
  const share = (a: number, b: number) => {
    const sum = new THREE.Vector3()
      .fromBufferAttribute(normal, a)
      .add(new THREE.Vector3().fromBufferAttribute(normal, b))
      .normalize();
    normal.setXYZ(a, sum.x, sum.y, sum.z);
    normal.setXYZ(b, sum.x, sum.y, sum.z);
  };
  // The duplicated profile UV seam should not become a shading seam unless it
  // is a crease; neither should a closed path's repeated first ring.
  if (!hardColumn[0])
    for (let block = 0; block < blockRing.length; block++)
      share(block * blockSize, block * blockSize + n);
  if (closed && !hardClosure)
    for (let k = 0; k < blockSize; k++)
      share(nearBlock[0]! * blockSize + k, farBlock[rings.length - 1]! * blockSize + k);
  return out;
}

/** Legacy loft capping: any truthy `cap` closes both ends. */
function loftCapEnds(cap: unknown): CapEnds {
  const both = Boolean(cap ?? true);
  return { start: both, end: both };
}

function sweepCapEnds(cap: SweepOptions['cap'] | null, closed: boolean): CapEnds {
  if (cap === undefined || cap === null || cap === true) return { start: true, end: true };
  if (cap === false) return { start: false, end: false };
  if (cap !== 'start' && cap !== 'end')
    throw new Error("sweepProfile cap must be true, false, 'start' or 'end'");
  if (closed)
    throw new Error(`sweepProfile cap '${cap}' needs an open path; a closed sweep has no ends`);
  return { start: cap === 'start', end: cap === 'end' };
}

/** Profiles lie in local XZ planes; first-section travel determines outward winding. No holes. */
export function loftProfiles(
  sections: readonly LoftSection[],
  options: LoftOptions = {},
): THREE.BufferGeometry {
  rejectHoles(options, 'loftProfiles');
  if (sections.length < 2) throw new Error('loftProfiles needs at least two sections');
  const profiles = sections.map((section, i) => {
    rejectHoles(section, `loftProfiles section ${i}`);
    return profilePoints(section.profile);
  });
  if (profiles.some((p) => p.length !== profiles[0]!.length))
    throw new Error('loftProfiles sections must have the same point count and correspondence');
  const frames = sections.map((section) => geometryFrameMatrix(section.frame));
  const rings = profiles.map((profile, i) =>
    profile.map((p) => new THREE.Vector3(p.x, 0, p.y).applyMatrix4(frames[i]!)),
  );
  const out = buildLoft(
    rings,
    profiles,
    false,
    loftCapEnds(options.cap),
    new THREE.Vector3(0, 1, 0).transformDirection(frames[0]!),
  );
  const analysis = recordSweepAnalysis(out, rings, profiles, false);
  out.userData.kilnGeometryWarnings = analysis.complete
    ? []
    : [
        {
          code: 'LOFT_SELF_INTERSECTION_UNCHECKED',
          message: 'The bounded local ring analysis did not finish; unchecked geometry remains.',
        },
      ];
  return out;
}

/** Sweep a simple profile along supplied polyline stations. Supply enough stations for curved paths. */
export function sweepProfile(
  profile: readonly ProfilePoint[],
  path: readonly Point3[],
  options: SweepOptions = {},
): THREE.BufferGeometry {
  rejectHoles(options, 'sweepProfile');
  const points = profilePoints(profile),
    closed = options.closed ?? false,
    twist = options.twist ?? 0;
  if (!Number.isFinite(twist)) throw new Error('sweepProfile twist must be finite degrees');
  if (closed && Math.abs(twist / 360 - Math.round(twist / 360)) > 1e-8)
    throw new Error('closed sweep twist must be a multiple of 360 degrees');
  const creaseAngle = options.creaseAngle ?? 60;
  if (!Number.isFinite(creaseAngle) || creaseAngle < 0 || creaseAngle > 180)
    throw new Error('sweepProfile creaseAngle must be between 0 and 180 degrees');
  const cap = sweepCapEnds(options.cap, closed);
  if (
    path.length < (closed ? 3 : 2) ||
    path.some((p) => p.length !== 3 || !p.every(Number.isFinite))
  )
    throw new Error('sweepProfile requires finite path points (two open or three closed)');
  const stations = path.map((p) => new THREE.Vector3(...p));
  const pathExtent = new THREE.Box3().setFromPoints(stations).getSize(new THREE.Vector3()).length();
  if (!(pathExtent > 0) || !Number.isFinite(pathExtent))
    throw new Error('sweepProfile path stations must be distinct with finite extent');
  const pathTolerance = pathExtent * 1e-10;
  if (closed && stations[0]!.distanceTo(stations[stations.length - 1]!) < pathTolerance)
    throw new Error('closed sweep path should omit its repeated endpoint');
  const segments: THREE.Vector3[] = [];
  for (let i = 0; i < stations.length - (closed ? 0 : 1); i++) {
    const direction = stations[(i + 1) % stations.length]!.clone().sub(stations[i]!);
    if (direction.length() < pathTolerance)
      throw new Error('sweepProfile path stations must be distinct');
    segments.push(direction.normalize());
  }
  const warnings: { code: string; message: string }[] = [];
  const scales = stations.map((_, i) => {
    const scale =
      typeof options.scale === 'number'
        ? [options.scale, options.scale]
        : (options.scale?.[i] ?? [1, 1]);
    if (scale.length !== 2 || !scale.every((n) => Number.isFinite(n) && n > 0))
      throw new Error('sweepProfile scale requires positive finite pairs');
    return scale as readonly [number, number];
  });
  if (Array.isArray(options.scale) && options.scale.length !== stations.length)
    throw new Error('sweepProfile scale needs one pair per path station');
  const tangents = stations.map((_, i) => {
    if (!closed && i === 0) return segments[0]!.clone();
    if (!closed && i === stations.length - 1) return segments[segments.length - 1]!.clone();
    const incoming = segments[(i - 1 + segments.length) % segments.length]!,
      outgoing = segments[i]!;
    if (incoming.dot(outgoing) < -0.9999)
      throw new Error('sweepProfile path has a reversal; split it into separate sweeps');
    const angle = incoming.angleTo(outgoing);
    const distance = Math.min(
      stations[i]!.distanceTo(stations[(i - 1 + stations.length) % stations.length]!),
      stations[i]!.distanceTo(stations[(i + 1) % stations.length]!),
    );
    const scale = scales[i]!;
    const radius = points.reduce(
      (maximum, point) => Math.max(maximum, Math.hypot(point.x * scale[0], point.y * scale[1])),
      0,
    );
    if (radius * Math.tan(angle / 2) >= distance * 0.5)
      warnings.push({
        code: 'SWEEP_TIGHT_TURN',
        message: `Path station ${i} turns tightly relative to the profile; reduce its size or widen the turn. Self-intersection is possible.`,
      });
    return incoming.clone().add(outgoing).normalize();
  });
  const up = options.up
    ? new THREE.Vector3(...options.up)
    : Math.abs(tangents[0]!.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
  const upLength = Math.hypot(up.x, up.y, up.z);
  if (!(upLength > 0) || !Number.isFinite(upLength))
    throw new Error('sweepProfile up must be a finite nonzero vector');
  up.divideScalar(upLength);
  let z = up.clone().addScaledVector(tangents[0]!, -up.dot(tangents[0]!));
  if (z.lengthSq() < 1e-12)
    throw new Error('sweepProfile up must not be parallel to the first path tangent');
  z.normalize();
  const normals = [z.clone()];
  if (closed) {
    stations.push(stations[0]!.clone());
    tangents.push(tangents[0]!.clone());
    scales.push(scales[0]!);
  }
  const distances = [0];
  for (let i = 1; i < stations.length; i++) {
    z = z
      .clone()
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(tangents[i - 1]!, tangents[i]!));
    normals.push(z);
    distances.push(distances[i - 1]! + stations[i]!.distanceTo(stations[i - 1]!));
  }
  const total = distances[distances.length - 1]!;
  let correction = 0;
  if (closed)
    correction = Math.atan2(
      tangents[0]!.dot(normals[normals.length - 1]!.clone().cross(normals[0]!)),
      normals[normals.length - 1]!.dot(normals[0]!),
    );
  const rings = stations.map((station, i) => {
    const tangent = tangents[i]!,
      t = distances[i]! / total;
    const axisZ = normals[i]!.clone().applyAxisAngle(
      tangent,
      (correction + THREE.MathUtils.degToRad(twist)) * t,
    );
    const axisX = tangent.clone().cross(axisZ).normalize(),
      scale = scales[i]!;
    return points.map((p) =>
      station
        .clone()
        .addScaledVector(axisX, p.x * scale[0])
        .addScaledVector(axisZ, p.y * scale[1]),
    );
  });
  if (closed) rings[rings.length - 1] = rings[0]!.map((p) => p.clone());
  const out = buildLoft(
    rings,
    rings.map(() => points),
    closed,
    cap,
    undefined,
    creaseAngle,
  );
  const analysis = recordSweepAnalysis(
    out,
    rings,
    rings.map(() => points),
    closed,
  );
  if (!analysis.complete)
    warnings.push({
      code: 'SWEEP_SELF_INTERSECTION_UNCHECKED',
      message: 'The bounded local ring analysis did not finish; unchecked geometry remains.',
    });
  out.userData.kilnGeometryWarnings = warnings;
  return out;
}
