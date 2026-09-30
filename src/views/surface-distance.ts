import {
  Box3,
  Matrix4,
  Ray,
  Triangle,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type Object3D,
} from 'three';
import { listCameraSubjects, selectCameraSubject } from './camera';
import type { AttachmentMeasurementV1 } from './measurement';

const MAX_TRIANGLES = 20_000;
// Includes hierarchy expansion and individual triangle-pair checks.
const MAX_WORK = 250_000;
const LIMITATIONS =
  'Unsigned distance between tessellated surfaces in the exported rest pose. Zero means touching or crossing surfaces; positive distance does not exclude containment. Does not establish solid clearance, attachment strength, motion, or alpha/displacement appearance.';

interface SurfaceTriangle {
  triangle: Triangle;
  box: Box3;
  path: string;
  index: number;
  instance?: number;
}

type SurfaceNode = { box: Box3; count: number } & (
  | { triangles: SurfaceTriangle[] }
  | { children: [SurfaceNode, SurfaceNode] }
);

/** Balanced, deterministic hierarchy; never reorders the source geometry. */
function hierarchy(triangles: SurfaceTriangle[]): SurfaceNode {
  const box = new Box3();
  for (const triangle of triangles) box.union(triangle.box);
  const count = triangles.length;
  if (count <= 4) return { box, count, triangles };
  const size = box.getSize(new Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const center = (triangle: SurfaceTriangle) =>
    triangle.box.min[axis] / 2 + triangle.box.max[axis] / 2;
  triangles.sort((a, b) => center(a) - center(b));
  const middle = Math.floor(count / 2);
  return {
    box,
    count,
    children: [hierarchy(triangles.slice(0, middle)), hierarchy(triangles.slice(middle))],
  };
}

function boxDistanceSquared(a: Box3, b: Box3): number {
  const x = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const y = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const z = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return x * x + y * y + z * z;
}

function collect(node: Object3D, paths: Map<Object3D, string>) {
  const triangles: SurfaceTriangle[] = [];
  const bounds = new Box3();
  node.updateWorldMatrix(true, true);
  node.traverseVisible((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (
      (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh ||
      Object.keys(mesh.geometry.morphAttributes).length
    )
      throw new Error('Surface distance does not support skin or morph deformation.');
    const position = mesh.geometry.getAttribute('position');
    if (!position) throw new Error('Surface distance requires mesh positions.');
    const index = mesh.geometry.index;
    const total = index?.count ?? position.count;
    const { start, count } = mesh.geometry.drawRange;
    const end = Math.min(total, start + count);
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isSafeInteger(end) ||
      end < start ||
      start % 3 ||
      (end - start) % 3
    )
      throw new Error('Surface distance requires complete triangle ranges.');
    const instanced = mesh as InstancedMesh;
    const instances = instanced.isInstancedMesh ? instanced.count : 1;
    if (
      !Number.isSafeInteger(instances) ||
      instances < 0 ||
      triangles.length + (instances * (end - start)) / 3 > MAX_TRIANGLES
    )
      throw new Error(
        `Surface distance exceeds the ${MAX_TRIANGLES} triangle budget per subject; select smaller parts.`,
      );
    for (let instance = 0; instance < instances; instance++) {
      const matrix = mesh.matrixWorld.clone();
      if (instanced.isInstancedMesh) {
        const local = new Matrix4();
        instanced.getMatrixAt(instance, local);
        matrix.multiply(local);
      }
      for (let i = start; i < end; i += 3) {
        const vertex = (offset: number) => {
          const id = index ? index.getX(i + offset) : i + offset;
          if (!Number.isSafeInteger(id) || id < 0 || id >= position.count)
            throw new Error('Surface distance encountered an invalid triangle index.');
          const point = new Vector3().fromBufferAttribute(position, id).applyMatrix4(matrix);
          if (![point.x, point.y, point.z].every(Number.isFinite))
            throw new Error('Surface distance encountered a non-finite world position.');
          return point;
        };
        const triangle = new Triangle(vertex(0), vertex(1), vertex(2));
        const box = new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
        bounds.union(box);
        triangles.push({
          triangle,
          box,
          path: paths.get(mesh)!,
          index: i / 3,
          ...(instanced.isInstancedMesh ? { instance } : {}),
        });
      }
    }
  });
  if (!triangles.length) throw new Error('Selected subject has no visible mesh triangles.');
  return { triangles, bounds };
}

/** Closest points on two finite segments, including collapsed edges. */
function segmentPair(p: Vector3, q: Vector3, r: Vector3, s: Vector3) {
  const u = q.clone().sub(p),
    v = s.clone().sub(r),
    w = p.clone().sub(r);
  const a = u.lengthSq(),
    c = v.lengthSq(),
    b = u.dot(v),
    d = u.dot(w),
    e = v.dot(w);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  let t = 0,
    k = 0;
  if (a === 0) k = c === 0 ? 0 : clamp(e / c);
  else if (c === 0) t = clamp(-d / a);
  else {
    // Cross-product form avoids subtracting nearly equal squared dot products.
    const denominator = u.clone().cross(v).lengthSq();
    t = denominator > 0 ? clamp((b * e - c * d) / denominator) : 0;
    k = (b * t + e) / c;
    if (k < 0) {
      k = 0;
      t = clamp(-d / a);
    } else if (k > 1) {
      k = 1;
      t = clamp((b - d) / a);
    }
  }
  return [p.clone().addScaledVector(u, t), r.clone().addScaledVector(v, k)] as const;
}

/** Full triangle distance: vertex/face, edge/edge and edge/face intersections. */
function trianglePair(a: Triangle, b: Triangle) {
  let squared = Infinity;
  const from = a.a.clone(),
    to = b.a.clone();
  const record = (p: Vector3, q: Vector3) => {
    const value = p.distanceToSquared(q);
    if (value < squared) {
      squared = value;
      from.copy(p);
      to.copy(q);
    }
  };
  const av = [a.a, a.b, a.c],
    bv = [b.a, b.b, b.c];
  // Degenerate triangles still contribute their edges, but have no face interior.
  if (b.getArea() > 0) for (const p of av) record(p, b.closestPointToPoint(p, new Vector3()));
  if (a.getArea() > 0) for (const q of bv) record(a.closestPointToPoint(q, new Vector3()), q);
  for (let i = 0; i < 3; i++) {
    const p = av[i]!,
      q = av[(i + 1) % 3]!;
    for (let j = 0; j < 3; j++) record(...segmentPair(p, q, bv[j]!, bv[(j + 1) % 3]!));
    for (const [vertices, target] of [
      [av, b],
      [bv, a],
    ] as const) {
      const origin = vertices[i]!,
        delta = vertices[(i + 1) % 3]!.clone().sub(origin);
      const length = delta.length();
      if (length === 0) continue;
      const hit = new Ray(origin, delta.divideScalar(length)).intersectTriangle(
        target.a,
        target.b,
        target.c,
        false,
        new Vector3(),
      );
      if (hit && origin.distanceTo(hit) <= length) {
        // Near-coplanar ray arithmetic can return a hit outside the triangle.
        // Keep an actual point on each surface instead of declaring zero from
        // the ray result alone. This also preserves witness ownership both ways.
        const onFace = target.closestPointToPoint(hit, new Vector3());
        if (vertices === av) record(hit, onFace);
        else record(onFace, hit);
      }
    }
  }
  if (!Number.isFinite(squared))
    throw new Error('Surface distance exceeds the finite numeric range.');
  return { squared, from, to };
}

/** Bounded targeted measurement; never a universal connectivity or collision gate. */
export function measureSurfaceDistance(root: unknown, input: AttachmentMeasurementV1) {
  if (input.from.point !== undefined || input.to.point !== undefined)
    throw new Error('Surface measurement selects mesh subjects; omit anchor point fields.');
  const from = selectCameraSubject(root, input.from.subject),
    to = selectCameraSubject(root, input.to.subject);
  const nodes = new Set<Object3D>();
  from.node.traverse((node) => nodes.add(node));
  to.node.traverse((node) => {
    if (nodes.has(node))
      throw new Error('Surface subjects have shared nodes; select disjoint parts.');
  });
  const paths = new Map(listCameraSubjects(root).map(({ node, path }) => [node, path]));
  const a = collect(from.node, paths),
    b = collect(to.node, paths);
  let best = Infinity,
    visited = 0,
    work = 0;
  type Witness = { path: string; triangle: number; instance?: number; world: number[] };
  let closest: { from: Witness; to: Witness } | null = null;
  const witness = (triangle: SurfaceTriangle, point: Vector3): Witness => ({
    path: triangle.path,
    triangle: triangle.index,
    ...(triangle.instance !== undefined ? { instance: triangle.instance } : {}),
    world: point.toArray(),
  });
  const finish = (complete: boolean) => {
    const upper = Number.isFinite(best) ? Math.sqrt(best) : null;
    const lower = complete ? upper! : Math.sqrt(boxDistanceSquared(a.bounds, b.bounds));
    if (!Number.isFinite(lower))
      throw new Error('Surface distance exceeds the finite numeric range.');
    return {
      method: 'triangle-surface distance' as const,
      status: complete ? ('complete' as const) : ('incomplete' as const),
      units: 'asset units' as const,
      frame: 'world' as const,
      from: { path: from.path, triangles: a.triangles.length },
      to: { path: to.path, triangles: b.triangles.length },
      distance: complete ? upper : null,
      bounds: { lower, upper },
      closest,
      pairsVisited: visited,
      reason: complete
        ? null
        : `Search budget ${MAX_WORK} reached (hierarchy and triangle pairs); select smaller parts. Upper bound is the closest pair found, not a completed minimum.`,
      limitations: LIMITATIONS,
    };
  };
  const pending = [
    {
      a: hierarchy(a.triangles),
      b: hierarchy(b.triangles),
      lower: boxDistanceSquared(a.bounds, b.bounds),
    },
  ];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.lower >= best) continue;
    if (work === MAX_WORK) return finish(false);
    work++;
    const x = current.a,
      y = current.b;
    if ('triangles' in x && 'triangles' in y) {
      for (const left of x.triangles)
        for (const right of y.triangles) {
          if (work === MAX_WORK) return finish(false);
          work++;
          visited++;
          if (boxDistanceSquared(left.box, right.box) >= best) continue;
          const candidate = trianglePair(left.triangle, right.triangle);
          if (candidate.squared < best) {
            best = candidate.squared;
            closest = { from: witness(left, candidate.from), to: witness(right, candidate.to) };
            if (best === 0) return finish(true);
          }
        }
    } else {
      const pairs =
        'children' in x && ('triangles' in y || x.count >= y.count)
          ? x.children.map((child) => ({ a: child, b: y }))
          : (y as SurfaceNode & { children: [SurfaceNode, SurfaceNode] }).children.map((child) => ({
              a: x,
              b: child,
            }));
      const next = pairs.map((pair) => ({
        ...pair,
        lower: boxDistanceSquared(pair.a.box, pair.b.box),
      }));
      // Visit the nearer branch first to tighten the upper bound early. Depth-first
      // traversal retains only O(log n + log m) pending pairs, not a Cartesian queue.
      if (next[0]!.lower <= next[1]!.lower) pending.push(next[1]!, next[0]!);
      else pending.push(next[0]!, next[1]!);
    }
  }
  return finish(true);
}

/**
 * A short, pair-local explanation for a subject that selects no single node: a missing
 * or shared name, or an exact path under the wrong root. It suggests at most five exact
 * paths instead of listing the scene, which made one wrong root cost thousands of tokens
 * per pair.
 */
function surfacePathProblem(
  subjects: readonly { path: string; name: string }[],
  path: string,
): string {
  const list = (nodes: readonly { path: string }[]) =>
    `${nodes
      .slice(0, 5)
      .map((n) => n.path)
      .join(', ')}${nodes.length > 5 ? `, and ${nodes.length - 5} more` : ''}`;
  if (!path.startsWith('/')) {
    const named = subjects.filter((s) => s.name === path);
    if (named.length > 1)
      return `${named.length} nodes are named ${JSON.stringify(path)}; choose one exact path: ${list(named)}.`;
    const wanted = path.toLowerCase();
    const similar = subjects.filter(
      (s) => s.name.length > 0 && s.name.toLowerCase().includes(wanted),
    );
    return `No node is named ${JSON.stringify(path)}.${similar.length ? ` Similar: ${list(similar)}.` : ' Exact paths start with / as partListing shows them.'}`;
  }
  const last = path.split('/').pop() ?? '';
  let name = last.replace(/\[\d+\]$/, '');
  try {
    name = decodeURIComponent(name);
  } catch {
    // An undecodable segment simply matches nothing.
  }
  const similar = subjects.filter((s) => s.name === name);
  const rootPath = subjects[0]?.path;
  const misrooted = rootPath !== undefined && path !== rootPath && !path.startsWith(`${rootPath}/`);
  return `No node has path ${JSON.stringify(path)}.${misrooted ? ` Paths start with ${rootPath}.` : ''}${similar.length ? ` Nodes named ${JSON.stringify(name)}: ${list(similar)}.` : ''}`;
}

/**
 * Bounded independent queries. Each subject is an exact path (it starts with /) or an
 * unambiguous node name, as measure subjects are. A failed or incomplete pair never
 * disappears behind successful ones.
 */
export function measureSurfacePairs(root: unknown, pairs: readonly (readonly [string, string])[]) {
  if (
    pairs.length < 1 ||
    pairs.length > 12 ||
    pairs.some(
      (pair) =>
        pair.length !== 2 || pair.some((path) => typeof path !== 'string' || path.length > 4096),
    )
  )
    throw new Error('Surface pairs require 1..12 pairs of exact paths or node names.');
  const subjects = listCameraSubjects(root);
  const known = new Set(subjects.map((subject) => subject.path));
  const resolve = (subject: string) => {
    if (subject.startsWith('/')) return known.has(subject) ? subject : undefined;
    const named = subjects.filter((s) => s.name === subject);
    return named.length === 1 ? named[0]!.path : undefined;
  };
  const results = pairs.map(
    (
      paths,
    ): {
      paths: readonly [string, string];
      measurement?: ReturnType<typeof measureSurfaceDistance>;
      error?: string;
    } => {
      const [from, to] = paths.map(resolve);
      const problems = paths.flatMap((path) =>
        resolve(path) === undefined ? [surfacePathProblem(subjects, path)] : [],
      );
      if (problems.length || from === undefined || to === undefined)
        return { paths, error: problems.join(' ') };
      try {
        return {
          paths,
          measurement: measureSurfaceDistance(root, {
            from: { subject: { path: from } },
            to: { subject: { path: to } },
          }),
        };
      } catch (error) {
        return { paths, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  return {
    status: results.every((result) => result.measurement?.status === 'complete')
      ? ('complete' as const)
      : ('partial' as const),
    results,
  };
}
