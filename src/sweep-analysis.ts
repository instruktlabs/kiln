/** Bounded local checks of the rings actually emitted by the sweep/loft helpers. */
import * as THREE from 'three';

export const SWEEP_ANALYSIS_MAX_STATIONS = 4096;
export const SWEEP_ANALYSIS_MAX_RING_POINTS = 512;
export const SWEEP_ANALYSIS_MAX_TESTS = 65536;
export interface SweepStationFinding {
  station: number;
  kind: 'curvature' | 'rings';
  radius?: number;
  halfExtent?: number;
  otherStation?: number;
}
export interface SweepAnalysis {
  complete: boolean;
  stationsChecked: number;
  ringPairsChecked: number;
  tests: number;
  findings: SweepStationFinding[];
}
// Engine-owned evidence: arbitrary authored userData cannot claim that a check ran.
const analyses = new WeakMap<THREE.BufferGeometry, SweepAnalysis>();
export const readSweepAnalysis = (geometry: THREE.BufferGeometry) => analyses.get(geometry);

function segmentHitsTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  tri: THREE.Triangle,
  epsilon: number,
) {
  const plane = new THREE.Plane().setFromCoplanarPoints(tri.a, tri.b, tri.c);
  if (plane.normal.lengthSq() === 0) return false;
  const da = plane.distanceToPoint(a),
    db = plane.distanceToPoint(b);
  if (Math.abs(da) <= epsilon && Math.abs(db) <= epsilon) {
    if (tri.containsPoint(a) || tri.containsPoint(b)) return true;
    const n = plane.normal;
    const drop =
      Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)
        ? 0
        : Math.abs(n.y) >= Math.abs(n.z)
          ? 1
          : 2;
    const axes = [0, 1, 2].filter((axis) => axis !== drop);
    const point = (p: THREE.Vector3) =>
      [p.getComponent(axes[0]!), p.getComponent(axes[1]!)] as const;
    const cross = (p: readonly number[], q: readonly number[], r: readonly number[]) =>
      (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
    const p = point(a),
      q = point(b);
    const vertices = [tri.a, tri.b, tri.c];
    return vertices.some((v, i) => {
      const r = point(v),
        s = point(vertices[(i + 1) % 3]!);
      return (
        cross(p, q, r) * cross(p, q, s) <= 0 &&
        cross(r, s, p) * cross(r, s, q) <= 0 &&
        axes.every(
          (_, axis) =>
            Math.max(Math.min(p[axis]!, q[axis]!), Math.min(r[axis]!, s[axis]!)) <=
            Math.min(Math.max(p[axis]!, q[axis]!), Math.max(r[axis]!, s[axis]!)) + epsilon,
        )
      );
    });
  }
  if ((da > epsilon && db > epsilon) || (da < -epsilon && db < -epsilon)) return false;
  const t = da / (da - db);
  return t >= 0 && t <= 1 && tri.containsPoint(a.clone().lerp(b, t));
}

/** Checks local curvature and consecutive filled rings, not arbitrary distant surface pairs. */
export function recordSweepAnalysis(
  geometry: THREE.BufferGeometry,
  rings: THREE.Vector3[][],
  profiles: THREE.Vector2[][],
  closed: boolean,
): SweepAnalysis {
  const result: SweepAnalysis = {
    complete: true,
    stationsChecked: 0,
    ringPairsChecked: 0,
    tests: 0,
    findings: [],
  };
  analyses.set(geometry, result);
  if (
    rings.length > SWEEP_ANALYSIS_MAX_STATIONS ||
    rings.some((ring) => ring.length > SWEEP_ANALYSIS_MAX_RING_POINTS)
  ) {
    result.complete = false;
    return result;
  }
  const unique = closed ? rings.length - 1 : rings.length;
  const centers = rings.map((ring) =>
    ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(ring.length),
  );
  for (let i = closed ? 0 : 1; i < (closed ? unique : unique - 1); i++) {
    const a = centers[(i - 1 + unique) % unique]!,
      b = centers[i]!,
      c = centers[(i + 1) % unique]!;
    const u = b.clone().sub(a),
      v = c.clone().sub(b);
    const cross = u.clone().cross(v).length();
    const radius =
      cross > 0
        ? (u.length() * v.length() * a.distanceTo(c)) / (2 * cross)
        : u.dot(v) < 0
          ? 0
          : Infinity;
    const halfExtent = Math.max(...rings[i]!.map((p) => p.distanceTo(b)));
    result.stationsChecked++;
    if (radius < halfExtent)
      result.findings.push({ station: i, kind: 'curvature', radius, halfExtent });
  }
  const triangles = new Map<number, THREE.Triangle[]>();
  const faces = (index: number) => {
    if (!triangles.has(index))
      triangles.set(
        index,
        THREE.ShapeUtils.triangulateShape(profiles[index]!, []).map(
          ([a, b, c]) =>
            new THREE.Triangle(rings[index]![a!]!, rings[index]![b!]!, rings[index]![c!]!),
        ),
      );
    return triangles.get(index)!;
  };
  for (let i = 1; i < rings.length; i++) {
    const boundsA = new THREE.Box3().setFromPoints(rings[i - 1]!);
    const boundsB = new THREE.Box3().setFromPoints(rings[i]!);
    if (!boundsA.intersectsBox(boundsB)) {
      result.ringPairsChecked++;
      continue;
    }
    const epsilon =
      Math.max(
        boundsA.getSize(new THREE.Vector3()).length(),
        boundsB.getSize(new THREE.Vector3()).length(),
      ) * 1e-10;
    let hit = false;
    pair: for (const [a, b] of [
      [i - 1, i],
      [i, i - 1],
    ] as const) {
      for (let edge = 0; edge < rings[a]!.length; edge++)
        for (const triangle of faces(b)) {
          if (result.tests === SWEEP_ANALYSIS_MAX_TESTS) {
            result.complete = false;
            return result;
          }
          result.tests++;
          if (
            segmentHitsTriangle(
              rings[a]![edge]!,
              rings[a]![(edge + 1) % rings[a]!.length]!,
              triangle,
              epsilon,
            )
          ) {
            hit = true;
            break pair;
          }
        }
    }
    result.ringPairsChecked++;
    if (hit) result.findings.push({ station: i, otherStation: i - 1, kind: 'rings' });
  }
  return result;
}
