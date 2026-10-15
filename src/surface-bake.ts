/**
 * Baked surface attributes (delivery contract item 2).
 *
 * `bakeSurfaceAttributes(target, { edge?, cavity? })` writes two float vertex attributes on
 * every visible mesh in `target` (a mesh or a subtree), both in [0, 1]:
 *
 * - `_edge` (glTF `_EDGE`): convex-rim weight. Each welded edge between two faces weighs
 *   smoothstep(threshold / 2, threshold, dihedral angle) when it is convex and 0 when it is
 *   concave; an open boundary edge weighs 1. A vertex takes the largest weight of its edges,
 *   then each smoothing step blends it halfway toward its one-ring mean. Flat faces read 0;
 *   chamfers, bevels and rims read toward 1.
 * - `_cavity` (glTF `_CAVITY`): exposure, 1 minus the fraction of a fixed cosine-weighted
 *   hemisphere of rays (default 32) around the vertex normal that hit the asset's own drawn
 *   triangles within the radius (default 0.5 x the occluders' bounds diagonal). Recesses
 *   and overhangs read toward 0; a convex free part reads 1.
 *
 * The three.js attribute names are lowercase so three's GLTFLoader, which lowercases custom
 * glTF attributes, hands the consumer the same names back. Work is deterministic (a fixed
 * direction set, no random numbers, no clock) and bounded by GEOMETRY_ALLOCATION_LIMITS.
 * Cavity depends on placement, so each baked mesh receives its own geometry copy; call the
 * bake after the parts that occlude are attached. Hidden subtrees (collider proxies) neither
 * bake nor occlude, and another LOD tier never occludes a tier it stands in for.
 */
import * as THREE from 'three';
import { GEOMETRY_ALLOCATION_LIMITS } from './geometry-budget';
import { lodName } from './lod';

/** Three.js attribute name to glTF attribute name for the attributes Kiln bakes. */
export const SURFACE_ATTRIBUTES = Object.freeze({ _edge: '_EDGE', _cavity: '_CAVITY' } as const);
/** Where a baked geometry records its parameters until export writes them as mesh extras. */
export const SURFACE_BAKE_KEY = 'kilnSurfaceBakeV1';

export const SURFACE_BAKE_DEFAULTS = Object.freeze({
  edge: Object.freeze({ thresholdDegrees: 35, smoothing: 1 }),
  cavity: Object.freeze({ rays: 32, radiusFactor: 0.5 }),
});

export interface EdgeBakeOptions {
  /** Dihedral angle at which a convex edge reads 1; half of it reads 0. Default 35. */
  thresholdDegrees?: number;
  /** One-ring smoothing steps, 0 to 8. Default 1. */
  smoothing?: number;
}

export interface CavityBakeOptions {
  /** Hemisphere directions per vertex, 1 to 256. Default 32. */
  rays?: number;
  /** Ray length in metres. Default 0.5 x the occluders' bounds diagonal. */
  radius?: number;
  /** Subtree whose drawn triangles occlude. Default: the topmost ancestor of the target. */
  occluders?: THREE.Object3D;
}

export interface SurfaceBakeOptions {
  /** false skips the edge bake. Default: baked with the defaults. */
  edge?: EdgeBakeOptions | boolean;
  /** false skips the cavity bake. Default: baked with the defaults. */
  cavity?: CavityBakeOptions | boolean;
}

/** Parameters recorded per glTF attribute name. */
export interface SurfaceBakeRecordV1 {
  _EDGE?: { thresholdDegrees: number; smoothing: number };
  _CAVITY?: { rays: number; radius: number };
}

const isObject3D = (value: unknown): value is THREE.Object3D =>
  (value as { isObject3D?: boolean } | null)?.isObject3D === true;

function settings<T extends object>(value: T | boolean | undefined, label: string): T | undefined {
  if (value === false) return undefined;
  if (value === undefined || value === true) return {} as T;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`bakeSurfaceAttributes: ${label} must be an options object or false.`);
  return value;
}

/** Whether a node and every ancestor up to (not including) `stop` draws. */
function drawn(node: THREE.Object3D, stop: THREE.Object3D | null): boolean {
  for (let at: THREE.Object3D | null = node; at && at !== stop; at = at.parent)
    if (at.visible === false) return false;
  return true;
}

/** The LOD tier a node belongs to: its outermost ancestor named with an LOD token. */
function tierOf(node: THREE.Object3D): { tier: THREE.Object3D; level: number } | undefined {
  let found: { tier: THREE.Object3D; level: number } | undefined;
  for (let at: THREE.Object3D | null = node; at; at = at.parent) {
    const parsed = lodName(at.name);
    if (parsed) found = { tier: at, level: parsed.level };
  }
  return found;
}

/** Visible meshes under `root` (including root), in traversal order. */
function drawnMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const visit = (node: THREE.Object3D) => {
    if (node.visible === false) return;
    const mesh = node as THREE.Mesh;
    if (
      mesh.isMesh &&
      !(mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh &&
      mesh.geometry?.getAttribute('position')?.itemSize === 3
    )
      meshes.push(mesh);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return meshes;
}

interface Topology {
  /** Welded vertex id per source vertex. */
  ids: Int32Array;
  /** World position per welded vertex. */
  points: THREE.Vector3[];
  /** Triangles as welded ids (degenerate ones removed). */
  triangles: number[];
}

/** Weld a mesh's world-space vertices on a grid relative to its own extent. */
function weld(mesh: THREE.Mesh): Topology {
  const position = mesh.geometry.getAttribute('position');
  const world: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3()
      .fromBufferAttribute(position, i)
      .applyMatrix4(mesh.matrixWorld);
    world.push(point);
    box.expandByPoint(point);
  }
  const size = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
  const tolerance = size > 0 ? size * 1e-6 : 1e-9;
  const keys = new Map<string, number>();
  const ids = new Int32Array(position.count);
  const points: THREE.Vector3[] = [];
  world.forEach((point, index) => {
    const key = `${Math.round((point.x - box.min.x) / tolerance)},${Math.round((point.y - box.min.y) / tolerance)},${Math.round((point.z - box.min.z) / tolerance)}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = points.length;
      keys.set(key, id);
      points.push(point);
    }
    ids[index] = id;
  });
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : position.count;
  const triangles: number[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const a = ids[index ? index.getX(i) : i]!;
    const b = ids[index ? index.getX(i + 1) : i + 1]!;
    const c = ids[index ? index.getX(i + 2) : i + 2]!;
    if (a !== b && b !== c && c !== a) triangles.push(a, b, c);
  }
  return { ids, points, triangles };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Per welded vertex edge weight, smoothed. */
function bakeEdge(topology: Topology, thresholdDegrees: number, smoothing: number): Float64Array {
  const { points, triangles } = topology;
  const normals: THREE.Vector3[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const a = points[triangles[t]!]!;
    const b = points[triangles[t + 1]!]!;
    const c = points[triangles[t + 2]!]!;
    normals.push(
      new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize(),
    );
  }
  // Edge key -> [face, opposite vertex] incidences.
  const edges = new Map<string, Array<[number, number]>>();
  const neighbours = points.map(() => new Set<number>());
  for (let t = 0; t < triangles.length; t += 3) {
    const face = t / 3;
    const corners = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!];
    for (let k = 0; k < 3; k++) {
      const u = corners[k]!;
      const v = corners[(k + 1) % 3]!;
      const w = corners[(k + 2) % 3]!;
      neighbours[u]!.add(v);
      neighbours[v]!.add(u);
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const list = edges.get(key) ?? [];
      list.push([face, w]);
      edges.set(key, list);
    }
  }
  const threshold = THREE.MathUtils.degToRad(thresholdDegrees);
  const weights = new Float64Array(points.length);
  for (const [key, incidences] of edges) {
    let weight: number;
    if (incidences.length !== 2) weight = 1;
    else {
      const [[f1], [f2, opposite2]] = incidences as [[number, number], [number, number]];
      const n1 = normals[f1]!;
      const n2 = normals[f2]!;
      const angle = Math.acos(THREE.MathUtils.clamp(n1.dot(n2), -1, 1));
      const [u] = key.split(':').map(Number) as [number];
      const scale = Math.max(points[u]!.distanceTo(points[opposite2]!), 1e-12);
      const side = new THREE.Vector3().subVectors(points[opposite2]!, points[u]!).dot(n1) / scale;
      // Convex when the second face falls away behind the first face's plane.
      weight = side < -1e-9 ? smoothstep(threshold / 2, threshold, angle) : 0;
    }
    for (const id of key.split(':').map(Number)) weights[id] = Math.max(weights[id]!, weight);
  }
  let current = weights;
  for (let step = 0; step < smoothing; step++) {
    const next = new Float64Array(current.length);
    for (let id = 0; id < current.length; id++) {
      const ring = neighbours[id]!;
      if (ring.size === 0) {
        next[id] = current[id]!;
        continue;
      }
      let sum = 0;
      for (const other of ring) sum += current[other]!;
      next[id] = 0.5 * current[id]! + (0.5 * sum) / ring.size;
    }
    current = next;
  }
  return current;
}

/** A median-split bounding volume hierarchy over world triangles, for any-hit queries. */
class TriangleBvh {
  private readonly bounds: Float64Array;
  private readonly children: Int32Array;
  private readonly firsts: Int32Array;
  private readonly counts: Int32Array;
  private readonly order: Int32Array;
  private nodes = 0;

  constructor(private readonly triangles: Float64Array) {
    const count = triangles.length / 9;
    const capacity = Math.max(1, 2 * count);
    this.bounds = new Float64Array(capacity * 6);
    this.children = new Int32Array(capacity * 2).fill(-1);
    this.firsts = new Int32Array(capacity);
    this.counts = new Int32Array(capacity);
    this.order = Int32Array.from({ length: count }, (_, i) => i);
    const centroids = new Float64Array(count * 3);
    for (let t = 0; t < count; t++)
      for (let k = 0; k < 3; k++)
        centroids[t * 3 + k] =
          (triangles[t * 9 + k]! + triangles[t * 9 + 3 + k]! + triangles[t * 9 + 6 + k]!) / 3;
    if (count > 0) this.build(0, count, centroids);
  }

  private build(first: number, count: number, centroids: Float64Array): number {
    const node = this.nodes++;
    const b = node * 6;
    this.bounds.fill(Infinity, b, b + 3);
    this.bounds.fill(-Infinity, b + 3, b + 6);
    for (let i = first; i < first + count; i++) {
      const t = this.order[i]!;
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) {
          const value = this.triangles[t * 9 + v * 3 + k]!;
          if (value < this.bounds[b + k]!) this.bounds[b + k] = value;
          if (value > this.bounds[b + 3 + k]!) this.bounds[b + 3 + k] = value;
        }
    }
    if (count <= 4) {
      this.firsts[node] = first;
      this.counts[node] = count;
      return node;
    }
    let axis = 0;
    let extent = -1;
    for (let k = 0; k < 3; k++) {
      const size = this.bounds[b + 3 + k]! - this.bounds[b + k]!;
      if (size > extent) {
        extent = size;
        axis = k;
      }
    }
    const slice = Array.from(this.order.subarray(first, first + count));
    slice.sort((x, y) => centroids[x * 3 + axis]! - centroids[y * 3 + axis]! || x - y);
    this.order.set(slice, first);
    const half = count >> 1;
    this.children[node * 2] = this.build(first, half, centroids);
    this.children[node * 2 + 1] = this.build(first + half, count - half, centroids);
    return node;
  }

  /** Whether the ray hits any triangle at a distance in (near, far]. */
  hits(origin: THREE.Vector3, direction: THREE.Vector3, near: number, far: number): boolean {
    if (this.nodes === 0) return false;
    const stack = [0];
    const inverse = [1 / direction.x, 1 / direction.y, 1 / direction.z];
    const o = [origin.x, origin.y, origin.z];
    while (stack.length) {
      const node = stack.pop()!;
      const b = node * 6;
      let tmin = near;
      let tmax = far;
      for (let k = 0; k < 3; k++) {
        let t0 = (this.bounds[b + k]! - o[k]!) * inverse[k]!;
        let t1 = (this.bounds[b + 3 + k]! - o[k]!) * inverse[k]!;
        if (t0 > t1) [t0, t1] = [t1, t0];
        if (Number.isNaN(t0)) t0 = -Infinity;
        if (Number.isNaN(t1)) t1 = Infinity;
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
      }
      if (tmin > tmax) continue;
      const left = this.children[node * 2]!;
      if (left >= 0) {
        stack.push(left, this.children[node * 2 + 1]!);
        continue;
      }
      for (let i = this.firsts[node]!; i < this.firsts[node]! + this.counts[node]!; i++)
        if (this.intersect(this.order[i]!, origin, direction, near, far)) return true;
    }
    return false;
  }

  /** Two-sided Moller-Trumbore. */
  private intersect(
    t: number,
    origin: THREE.Vector3,
    d: THREE.Vector3,
    near: number,
    far: number,
  ): boolean {
    const v = this.triangles;
    const o = t * 9;
    const e1x = v[o + 3]! - v[o]!;
    const e1y = v[o + 4]! - v[o + 1]!;
    const e1z = v[o + 5]! - v[o + 2]!;
    const e2x = v[o + 6]! - v[o]!;
    const e2y = v[o + 7]! - v[o + 1]!;
    const e2z = v[o + 8]! - v[o + 2]!;
    const px = d.y * e2z - d.z * e2y;
    const py = d.z * e2x - d.x * e2z;
    const pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-18) return false;
    const inv = 1 / det;
    const sx = origin.x - v[o]!;
    const sy = origin.y - v[o + 1]!;
    const sz = origin.z - v[o + 2]!;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return false;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (w < 0 || u + w > 1) return false;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return distance > near && distance <= far;
  }
}

/** A fixed cosine-weighted hemisphere around +Z (Fibonacci spiral), unit vectors. */
export function hemisphereDirections(count: number): THREE.Vector3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / count);
    const phi = i * golden;
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
  });
}

/** Drawn occluder triangles in world space, excluding LOD tiers that replace the baked one. */
function occluderTriangles(
  occluders: THREE.Object3D,
  bakedTier: { tier: THREE.Object3D; level: number } | undefined,
): Float64Array {
  const values: number[] = [];
  const point = new THREE.Vector3();
  for (const mesh of drawnMeshes(occluders)) {
    if (!drawn(mesh, null)) continue;
    const tier = tierOf(mesh);
    if (tier && tier.tier !== bakedTier?.tier && (bakedTier || tier.level > 0)) continue;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3)
      for (let k = 0; k < 3; k++) {
        point
          .fromBufferAttribute(position, index ? index.getX(i + k) : i + k)
          .applyMatrix4(mesh.matrixWorld);
        values.push(point.x, point.y, point.z);
      }
    if (values.length / 9 > GEOMETRY_ALLOCATION_LIMITS.surfaceBakeTriangles)
      throw new RangeError(
        `bakeSurfaceAttributes: the occluders hold more than ${GEOMETRY_ALLOCATION_LIMITS.surfaceBakeTriangles} triangles; pass a smaller cavity.occluders subtree.`,
      );
  }
  return Float64Array.from(values);
}

function positiveInteger(label: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(
      `bakeSurfaceAttributes: ${label} must be an integer from ${min} to ${max}.`,
    );
  return value;
}

/**
 * Bake `_edge` and `_cavity` onto every visible mesh in `target`. Returns `target`.
 * See the module comment for the definitions, defaults and bounds.
 */
export function bakeSurfaceAttributes<T extends THREE.Object3D>(
  target: T,
  options: SurfaceBakeOptions = {},
): T {
  if (!isObject3D(target))
    throw new TypeError('bakeSurfaceAttributes: target must be a mesh or a scene node.');
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('bakeSurfaceAttributes: options must be { edge?, cavity? }.');
  const edgeOptions = settings<EdgeBakeOptions>(options.edge, 'edge');
  const cavityOptions = settings<CavityBakeOptions>(options.cavity, 'cavity');
  const thresholdDegrees =
    edgeOptions?.thresholdDegrees ?? SURFACE_BAKE_DEFAULTS.edge.thresholdDegrees;
  if (
    edgeOptions &&
    (typeof thresholdDegrees !== 'number' ||
      !Number.isFinite(thresholdDegrees) ||
      thresholdDegrees <= 0 ||
      thresholdDegrees >= 180)
  )
    throw new RangeError(
      'bakeSurfaceAttributes: edge.thresholdDegrees must be greater than 0 and less than 180.',
    );
  const smoothing = edgeOptions
    ? positiveInteger(
        'edge.smoothing',
        edgeOptions.smoothing ?? SURFACE_BAKE_DEFAULTS.edge.smoothing,
        0,
        8,
      )
    : 0;
  const rays = cavityOptions
    ? positiveInteger(
        'cavity.rays',
        cavityOptions.rays ?? SURFACE_BAKE_DEFAULTS.cavity.rays,
        1,
        GEOMETRY_ALLOCATION_LIMITS.surfaceBakeRayDirections,
      )
    : 0;
  if (cavityOptions?.occluders !== undefined && !isObject3D(cavityOptions.occluders))
    throw new TypeError('bakeSurfaceAttributes: cavity.occluders must be a scene node.');
  if (
    cavityOptions?.radius !== undefined &&
    (typeof cavityOptions.radius !== 'number' ||
      !Number.isFinite(cavityOptions.radius) ||
      cavityOptions.radius <= 0)
  )
    throw new RangeError('bakeSurfaceAttributes: cavity.radius must be a positive finite number.');
  if (!edgeOptions && !cavityOptions) return target;

  let top: THREE.Object3D = target;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const occluders = cavityOptions?.occluders ?? top;
  if (occluders !== top) occluders.updateMatrixWorld(true);

  const meshes = drawnMeshes(target).filter((mesh) => drawn(mesh, null));
  const topologies = meshes.map(weld);
  const vertices = topologies.reduce((sum, topology) => sum + topology.points.length, 0);
  if (vertices > GEOMETRY_ALLOCATION_LIMITS.surfaceBakeVertices)
    throw new RangeError(
      `bakeSurfaceAttributes: ${vertices} welded vertices exceed ${GEOMETRY_ALLOCATION_LIMITS.surfaceBakeVertices}; bake smaller subtrees.`,
    );
  if (vertices * rays > GEOMETRY_ALLOCATION_LIMITS.surfaceBakeRays)
    throw new RangeError(
      `bakeSurfaceAttributes: ${vertices} vertices x ${rays} rays exceed ${GEOMETRY_ALLOCATION_LIMITS.surfaceBakeRays} rays; lower cavity.rays or bake smaller subtrees.`,
    );

  const directions = hemisphereDirections(rays);
  const bvhs = new Map<THREE.Object3D | undefined, { bvh: TriangleBvh; diagonal: number }>();
  const occlusion = (tier: ReturnType<typeof tierOf>) => {
    const key = tier?.tier;
    let entry = bvhs.get(key);
    if (!entry) {
      const triangles = occluderTriangles(occluders, tier);
      const box = new THREE.Box3();
      for (let i = 0; i < triangles.length; i += 3)
        box.expandByPoint(new THREE.Vector3(triangles[i], triangles[i + 1], triangles[i + 2]));
      entry = {
        bvh: new TriangleBvh(triangles),
        diagonal: box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length(),
      };
      bvhs.set(key, entry);
    }
    return entry;
  };

  meshes.forEach((mesh, meshIndex) => {
    const topology = topologies[meshIndex]!;
    const record: SurfaceBakeRecordV1 = {
      ...((mesh.geometry.userData?.[SURFACE_BAKE_KEY] as SurfaceBakeRecordV1 | undefined) ?? {}),
    };
    // Cavity depends on where the mesh stands, so the mesh gets its own geometry copy.
    const geometry = mesh.geometry.clone();
    const sourceCount = geometry.getAttribute('position').count;
    if (edgeOptions) {
      const welded = bakeEdge(topology, thresholdDegrees, smoothing);
      const values = new Float32Array(sourceCount);
      for (let i = 0; i < sourceCount; i++)
        values[i] = THREE.MathUtils.clamp(welded[topology.ids[i]!]!, 0, 1);
      geometry.setAttribute('_edge', new THREE.BufferAttribute(values, 1));
      record._EDGE = { thresholdDegrees, smoothing };
    }
    if (cavityOptions) {
      const { bvh, diagonal } = occlusion(tierOf(mesh));
      const radius = cavityOptions.radius ?? SURFACE_BAKE_DEFAULTS.cavity.radiusFactor * diagonal;
      const epsilon = Math.max(diagonal * 1e-5, 1e-7);
      // Area-weighted welded normals keep split vertices (hard edges, UV seams) identical.
      const normals = topology.points.map(() => new THREE.Vector3());
      const { points, triangles } = topology;
      for (let t = 0; t < triangles.length; t += 3) {
        const a = points[triangles[t]!]!;
        const face = new THREE.Vector3()
          .subVectors(points[triangles[t + 1]!]!, a)
          .cross(new THREE.Vector3().subVectors(points[triangles[t + 2]!]!, a));
        for (let k = 0; k < 3; k++) normals[triangles[t + k]!]!.add(face);
      }
      const exposure = new Float64Array(points.length);
      const tangent = new THREE.Vector3();
      const bitangent = new THREE.Vector3();
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3();
      points.forEach((point, id) => {
        const normal = normals[id]!;
        if (normal.lengthSq() === 0) {
          exposure[id] = 1;
          return;
        }
        normal.normalize();
        // A deterministic tangent frame from the normal.
        tangent.set(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0);
        tangent.cross(normal).normalize();
        bitangent.crossVectors(normal, tangent);
        origin.copy(point).addScaledVector(normal, epsilon);
        let hits = 0;
        for (const local of directions) {
          direction
            .copy(tangent)
            .multiplyScalar(local.x)
            .addScaledVector(bitangent, local.y)
            .addScaledVector(normal, local.z);
          if (bvh.hits(origin, direction, epsilon, radius)) hits++;
        }
        exposure[id] = 1 - hits / directions.length;
      });
      const values = new Float32Array(sourceCount);
      for (let i = 0; i < sourceCount; i++)
        values[i] = THREE.MathUtils.clamp(exposure[topology.ids[i]!]!, 0, 1);
      geometry.setAttribute('_cavity', new THREE.BufferAttribute(values, 1));
      record._CAVITY = { rays, radius };
    }
    geometry.userData = { ...geometry.userData, [SURFACE_BAKE_KEY]: record };
    mesh.geometry = geometry;
  });
  return target;
}

/** The validated bake record a geometry carries, or undefined. */
export function surfaceBakeRecord(geometry: THREE.BufferGeometry): SurfaceBakeRecordV1 | undefined {
  const value = geometry.userData?.[SURFACE_BAKE_KEY] as SurfaceBakeRecordV1 | undefined;
  if (!value || typeof value !== 'object') return undefined;
  const record: SurfaceBakeRecordV1 = {};
  if (value._EDGE) record._EDGE = { ...value._EDGE };
  if (value._CAVITY) record._CAVITY = { ...value._CAVITY };
  return record;
}
