/**
 * `fenceRun` (#411): a post at each point of a path and rails between neighbouring posts.
 *
 * Posts are rectangular timbers, optionally with chamfered vertical edges, a truncated-pyramid
 * weathering cap and peg heads on their side faces at each rail height. Each post sits in its own
 * named frame at its path point, so the frames work as snap anchors. A post's local +X follows
 * the run. Where the run turns, the post turns so both rails meet its faces as squarely as a
 * rectangular post allows: straight on at a right-angle corner, and never more than 22.5 degrees
 * off. Rails run between neighbouring post centres at the given heights, follow a sloping path,
 * and stop `embed` inside each post face, so no rail end shows and no rail face lies on a post
 * face.
 *
 * Geometry is built face by face with a normal per face and UVs in metres: V runs along each
 * member (the grain), U around it. Every member is a closed, outward solid; pegs are part of
 * their post's mesh. Everything is checked before the first node is made: a rail that would show
 * its end, meet a post across its edge, cross another rail outside a post or run into a peg
 * throws.
 */
import * as THREE from 'three';
import { assertAssemblyMerge, mergePiecesByMaterial, roleSuffix } from './assembly-merge';
import type { AssemblyMergeMode } from './assembly-merge';
import { GEOMETRY_ALLOCATION_LIMITS } from './geometry-budget';

type V3 = [number, number, number];
type V2 = [number, number];

export interface FencePegOptions {
  radius: number;
  /** Peg length, including `embed`. */
  length: number;
  /** Peg centres along the run from the post axis; pegs go on both side faces. */
  offsets: number[];
  /** Sides of the peg prism. Default 6. */
  sides?: number;
  /** How far each peg sinks into the post face. Default 0.004. */
  embed?: number;
}
export interface FencePostOptions {
  /** Square size, or [along the run, across it]. Default 0.1. */
  section?: number | [number, number];
  /** Height of the post shaft above its path point. Default 1. */
  height?: number;
  /** Width of the chamfer on the four vertical edges. Default 0 (square edges). */
  chamfer?: number;
  /** A truncated-pyramid weathering cap: `rise` above the shaft, faces `inset` from the edge. */
  cap?: { rise: number; inset: number };
  /** Peg heads on both side faces at every rail height. */
  pegs?: FencePegOptions;
  /** Frame (group) names, one per path point. Default `<name>_Post<i>`. */
  groups?: string[];
  /** Post part names, one per path point. Default `<name>_Post<i>`. */
  names?: string[];
}
export interface FenceRailOptions {
  /** Rail centre heights above the post bases; on a sloping path rails follow the slope.
   *  Default 35% and 75% of the post height. */
  heights?: number[];
  /** [thickness across the run, height]. Default [0.04, 0.08]. */
  section?: [number, number];
  /** Chamfer on the rail's long edges. Default 0. */
  chamfer?: number;
  /** How far each rail end reaches inside the post face. Default 0.02. */
  embed?: number;
  /** Make every rail one part with this name. */
  merge?: string;
}
export interface FenceRunOptions {
  /** Post centres at ground level, two or more points. */
  path: V3[];
  /** Join the last point back to the first with rails. Needs three or more points. */
  closed?: boolean;
  post?: FencePostOptions;
  /** Rail options, or false for posts only. */
  rails?: FenceRailOptions | false;
  material: THREE.Material;
  materials?: { post?: THREE.Material; rail?: THREE.Material };
  /** Grain offsets: each member's UVs start at a different place derived from this seed. */
  uv?: { seed?: number };
  merge?: AssemblyMergeMode;
  parent?: THREE.Object3D;
}
export interface FenceRunResult {
  root: THREE.Object3D;
  /** One frame per path point, holding its post: snap anchors. */
  posts: THREE.Object3D[];
  /** Every part the call made, in build order (after a merge, the merged parts). */
  parts: THREE.Mesh[];
}

interface PegPlan {
  radius: number;
  length: number;
  offsets: number[];
  sides: number;
  embed: number;
  /** Half the peg prism's extent along the run and up the post (its corners, not its radius). */
  halfWidth: number;
  halfHeight: number;
}
interface PostPlan {
  sx: number;
  sz: number;
  height: number;
  chamfer: number;
  cap?: { rise: number; inset: number };
  pegs?: PegPlan;
  groups: string[];
  names: string[];
}
interface RailPlan {
  heights: number[];
  t: number;
  h: number;
  chamfer: number;
  embed: number;
  merge?: string;
}
interface FencePlan {
  name: string;
  points: V3[];
  segments: V2[];
  post: PostPlan;
  rails?: RailPlan;
  postMaterial: THREE.Material;
  railMaterial: THREE.Material;
  seed: number;
  merge?: AssemblyMergeMode;
  parent?: THREE.Object3D;
}
/** One rail line between two posts, at height 0 above the path; each rail adds its height. */
interface RailSpan {
  a: number;
  b: number;
  start: V3;
  end: V3;
  dir: V3;
  across: V3;
  /** Horizontal fraction of `dir`: the cosine of the slope. */
  flat: number;
}

const fail = (message: string): never => {
  throw new RangeError(`fenceRun: ${message}`);
};
const finite = (value: unknown, label: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(`${label} must be a finite number.`);
const positive = (value: unknown, label: string): number =>
  finite(value, label) > 0 ? (value as number) : fail(`${label} must be positive.`);
const nonNegative = (value: unknown, label: string): number =>
  finite(value, label) >= 0 ? (value as number) : fail(`${label} must not be negative.`);
const record = (value: unknown, label: string, keys: readonly string[]) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an options object.`);
  for (const key of Object.keys(value as object))
    if (!keys.includes(key)) fail(`${label}.${key} is not an option; use ${keys.join(', ')}.`);
  return value as Record<string, unknown>;
};
const isMaterial = (value: unknown) =>
  (value as { isMaterial?: boolean } | null)?.isMaterial === true;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Flat-shaded faces for one part: a normal per face, metre UVs, fan triangulation. */
class Batch {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly uv: number[] = [];
  readonly index: number[] = [];
  face(points: V3[], uvs: V2[]): void {
    const base = this.p.length / 3;
    const normal = norm(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
    for (const [i, point] of points.entries()) {
      this.p.push(...point);
      this.n.push(...normal);
      this.uv.push(...uvs[i]!);
    }
    for (let i = 1; i < points.length - 1; i++) this.index.push(base, base + i, base + i + 1);
  }
  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setIndex(this.index);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Rectangular section, chamfered when `c > 0`, counter-clockwise in (s, t). */
function section(w: number, h: number, c: number): V2[] {
  const a = w / 2;
  const d = h / 2;
  if (c <= 0)
    return [
      [a, -d],
      [a, d],
      [-a, d],
      [-a, -d],
    ];
  return [
    [a, -d + c],
    [a, d - c],
    [a - c, d],
    [-a + c, d],
    [-a, d - c],
    [-a, -d + c],
    [-a + c, -d],
    [a - c, -d],
  ];
}

/** A timber from p0 to p1; `sHint` sets the direction of the section width. */
function timber(
  batch: Batch,
  p0: V3,
  p1: V3,
  size: V2,
  chamfer: number,
  sHint: V3,
  options: { cap?: { rise: number; inset: number }; u?: number; v?: number } = {},
): void {
  const axis = norm(sub(p1, p0));
  const length = Math.hypot(...sub(p1, p0));
  const s = norm(sub(sHint, mul(axis, dot(sHint, axis))));
  const t = cross(axis, s);
  const ring = section(size[0], size[1], chamfer);
  const u0 = options.u ?? 0;
  const v0 = options.v ?? 0;
  const at = (q: V2, along: number): V3 =>
    add(add(add(p0, mul(s, q[0])), mul(t, q[1])), mul(axis, along));
  let around = 0;
  for (const [i, a] of ring.entries()) {
    const b = ring[(i + 1) % ring.length]!;
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ua = around + u0;
    const ub = around + edge + u0;
    batch.face(
      [at(a, 0), at(b, 0), at(b, length), at(a, length)],
      [
        [ua, v0],
        [ub, v0],
        [ub, v0 + length],
        [ua, v0 + length],
      ],
    );
    around += edge;
  }
  const capUV = (q: V2): V2 => [q[0] + 0.37, q[1] + 0.61];
  const bottom = ring.slice().reverse();
  batch.face(
    bottom.map((q) => at(q, 0)),
    bottom.map(capUV),
  );
  if (!options.cap) {
    batch.face(
      ring.map((q) => at(q, length)),
      ring.map(capUV),
    );
    return;
  }
  const { rise, inset } = options.cap;
  const inner = ring.map(
    (q): V2 => [
      Math.sign(q[0]) * Math.max(Math.abs(q[0]) - inset, 0.004),
      Math.sign(q[1]) * Math.max(Math.abs(q[1]) - inset, 0.004),
    ],
  );
  for (const [i, a] of ring.entries()) {
    const j = (i + 1) % ring.length;
    const b = ring[j]!;
    batch.face(
      [at(a, length), at(b, length), at(inner[j]!, length + rise), at(inner[i]!, length + rise)],
      [
        [a[0] + a[1], v0 + length],
        [b[0] + b[1], v0 + length],
        [b[0] + b[1], v0 + length + 0.05],
        [a[0] + a[1], v0 + length + 0.05],
      ],
    );
  }
  batch.face(
    inner.map((q) => at(q, length + rise)),
    inner.map(capUV),
  );
}

/** A peg: a `sides`-gon prism from p0 to p1. */
function peg(batch: Batch, p0: V3, p1: V3, radius: number, sides: number): void {
  const axis = norm(sub(p1, p0));
  const length = Math.hypot(...sub(p1, p0));
  const s = norm(sub([0, 1, 0], mul(axis, axis[1])));
  const t = cross(axis, s);
  const ring: V2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  const at = (q: V2, along: number): V3 =>
    add(add(add(p0, mul(s, q[0])), mul(t, q[1])), mul(axis, along));
  for (const [i, a] of ring.entries()) {
    const b = ring[(i + 1) % sides]!;
    const ua = (i / sides) * 2 * Math.PI * radius;
    const ub = ((i + 1) / sides) * 2 * Math.PI * radius;
    batch.face(
      [at(a, 0), at(b, 0), at(b, length), at(a, length)],
      [
        [ua, 0],
        [ub, 0],
        [ub, length],
        [ua, length],
      ],
    );
  }
  const reversed = ring.slice().reverse();
  batch.face(
    reversed.map((q) => at(q, 0)),
    reversed.map((q): V2 => [q[0], q[1]]),
  );
  batch.face(
    ring.map((q) => at(q, length)),
    ring.map((q): V2 => [q[0], q[1]]),
  );
}

// ---------- Options ----------

function resolvePath(options: FenceRunOptions): { points: V3[]; segments: V2[] } {
  const path = options.path as unknown;
  if (!Array.isArray(path) || path.length < 2) fail('path must list two or more post centres.');
  const list = path as unknown[];
  if (list.length > GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes)
    fail(`path may list at most ${GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes} posts.`);
  const points = list.map((point, i): V3 => {
    if (!Array.isArray(point) || point.length !== 3) fail(`path[${i}] must be [x, y, z].`);
    const [x, y, z] = point as unknown[];
    return [finite(x, `path[${i}][0]`), finite(y, `path[${i}][1]`), finite(z, `path[${i}][2]`)];
  });
  const closed = options.closed ?? false;
  if (typeof closed !== 'boolean') fail('closed must be true or false.');
  if (closed && points.length < 3) fail('a closed run needs three or more posts.');
  const segments: V2[] = [];
  for (let i = 0; i + 1 < points.length; i++) segments.push([i, i + 1]);
  if (closed) segments.push([points.length - 1, 0]);
  return { points, segments };
}

function nameList(value: unknown, label: string, count: number, fallback: (i: number) => string) {
  if (value === undefined) return Array.from({ length: count }, (_, i) => fallback(i));
  if (!Array.isArray(value) || value.length !== count)
    fail(`${label} must give one name per path point.`);
  const names = (value as unknown[]).map((n, i) =>
    typeof n === 'string' && n ? n : fail(`${label}[${i}] must be a non-empty string.`),
  );
  if (new Set(names).size !== names.length) fail(`${label} must not repeat a name.`);
  return names;
}

function resolvePegs(value: unknown, sx: number, chamfer: number): PegPlan {
  const pegs = record(value, 'post.pegs', ['radius', 'length', 'offsets', 'sides', 'embed']);
  const radius = positive(pegs.radius, 'post.pegs.radius');
  const length = positive(pegs.length, 'post.pegs.length');
  if (!Array.isArray(pegs.offsets)) fail('post.pegs.offsets must be an array.');
  const offsets = (pegs.offsets as unknown[]).map((o, i) => finite(o, `post.pegs.offsets[${i}]`));
  const sides = pegs.sides ?? 6;
  if (!Number.isSafeInteger(sides) || (sides as number) < 3 || (sides as number) > 64)
    fail('post.pegs.sides must be an integer from 3 to 64.');
  const embed = nonNegative(pegs.embed ?? 0.004, 'post.pegs.embed');
  if (!(embed < length)) fail('post.pegs.embed must be under the peg length.');
  // The prism's corners stand at angles 2 pi i / sides, the first straight up (see peg()).
  let halfWidth = 0;
  let halfHeight = 0;
  for (let i = 0; i < (sides as number); i++) {
    const a = (i / (sides as number)) * Math.PI * 2;
    halfWidth = Math.max(halfWidth, Math.abs(Math.sin(a)) * radius);
    halfHeight = Math.max(halfHeight, Math.abs(Math.cos(a)) * radius);
  }
  for (const [i, o] of offsets.entries()) {
    if (!(Math.abs(o) + halfWidth < sx / 2 - chamfer))
      fail(`post.pegs.offsets[${i}] puts the peg off the flat of the post face.`);
    for (let j = 0; j < i; j++)
      if (!(Math.abs(o - offsets[j]!) > 2 * halfWidth))
        fail(`post.pegs.offsets[${j}] and [${i}] put two pegs in one place.`);
  }
  return { radius, length, offsets, sides: sides as number, embed, halfWidth, halfHeight };
}

function resolvePost(value: unknown, count: number, name: string): PostPlan {
  const post = record(value === undefined ? {} : value, 'post', [
    'section',
    'height',
    'chamfer',
    'cap',
    'pegs',
    'groups',
    'names',
  ]);
  const size = post.section ?? 0.1;
  if (Array.isArray(size) && size.length !== 2)
    fail('post.section must be a size or [along, across].');
  const [sx, sz] = Array.isArray(size)
    ? [positive(size[0], 'post.section[0]'), positive(size[1], 'post.section[1]')]
    : [positive(size, 'post.section'), size as number];
  const height = positive(post.height ?? 1, 'post.height');
  const chamfer = nonNegative(post.chamfer ?? 0, 'post.chamfer');
  if (!(2 * chamfer < Math.min(sx, sz))) fail('post.chamfer must be under half the post section.');
  let cap: PostPlan['cap'];
  if (post.cap !== undefined) {
    const input = record(post.cap, 'post.cap', ['rise', 'inset']);
    cap = {
      rise: positive(input.rise, 'post.cap.rise'),
      inset: positive(input.inset, 'post.cap.inset'),
    };
    if (!(cap.inset < Math.min(sx, sz) / 2))
      fail('post.cap.inset must be under half the post section.');
  }
  const pegs = post.pegs === undefined ? undefined : resolvePegs(post.pegs, sx, chamfer);
  const fallback = (i: number) => `${name}_Post${i + 1}`;
  const groups = nameList(post.groups, 'post.groups', count, fallback);
  const names = nameList(post.names, 'post.names', count, fallback);
  return { sx, sz, height, chamfer, cap, pegs, groups, names };
}

function resolveRails(value: unknown, post: PostPlan): RailPlan | undefined {
  if (value === false) {
    if (post.pegs) fail('post.pegs sit at the rail heights; give rails or drop post.pegs.');
    return undefined;
  }
  const rails = record(value === undefined ? {} : value, 'rails', [
    'heights',
    'section',
    'chamfer',
    'embed',
    'merge',
  ]);
  const heightsInput = rails.heights ?? [0.35 * post.height, 0.75 * post.height];
  if (!Array.isArray(heightsInput)) fail('rails.heights must be an array.');
  const heights = (heightsInput as unknown[]).map((y, i) => finite(y, `rails.heights[${i}]`));
  const size = rails.section ?? [0.04, 0.08];
  if (!Array.isArray(size) || size.length !== 2) fail('rails.section must be [thickness, height].');
  const t = positive((size as unknown[])[0], 'rails.section[0]');
  const h = positive((size as unknown[])[1], 'rails.section[1]');
  const chamfer = nonNegative(rails.chamfer ?? 0, 'rails.chamfer');
  if (!(2 * chamfer < Math.min(t, h))) fail('rails.chamfer must be under half the rail section.');
  const embed = positive(rails.embed ?? 0.02, 'rails.embed');
  const merge = rails.merge;
  if (merge !== undefined && (typeof merge !== 'string' || !merge))
    fail('rails.merge must be the merged part name.');
  for (const [i, y] of heights.entries())
    if (!(y - h / 2 > 0 && y + h / 2 < post.height))
      fail(`rails.heights[${i}] puts the rail outside the post shaft.`);
  const pegs = post.pegs;
  for (const [i, y] of heights.entries()) {
    if (pegs && !(y - pegs.halfHeight > 0 && y + pegs.halfHeight < post.height))
      fail(`rails.heights[${i}] puts its pegs outside the post shaft.`);
    for (let j = 0; j < i; j++)
      if (pegs && !(Math.abs(y - heights[j]!) > 2 * pegs.halfHeight))
        fail(`rails.heights[${j}] and [${i}] put two pegs in one place.`);
  }
  return { heights, t, h, chamfer, embed, merge: merge as string | undefined };
}

function resolvePlan(name: string, options: FenceRunOptions): FencePlan {
  if (typeof name !== 'string' || !name) fail('name must be a non-empty string.');
  record(options, 'options', [
    'path',
    'closed',
    'post',
    'rails',
    'material',
    'materials',
    'uv',
    'merge',
    'parent',
  ]);
  assertAssemblyMerge('fenceRun', options.merge);
  if (!isMaterial(options.material))
    fail('material must be a material, such as gameMaterial(0x8b6f3d).');
  const materials = record(options.materials === undefined ? {} : options.materials, 'materials', [
    'post',
    'rail',
  ]);
  for (const [role, material] of Object.entries(materials))
    if (!isMaterial(material)) fail(`materials.${role} must be a material.`);
  const uv = record(options.uv === undefined ? {} : options.uv, 'uv', ['seed']);
  const seed = finite(uv.seed ?? 0, 'uv.seed');
  if (
    options.parent !== undefined &&
    (options.parent as { isObject3D?: boolean })?.isObject3D !== true
  )
    fail('parent must be a scene node.');
  const { points, segments } = resolvePath(options);
  const post = resolvePost(options.post, points.length, name);
  const rails = resolveRails(options.rails, post);
  if (rails && rails.heights.length * segments.length > GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes)
    fail(`a run may have at most ${GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes} rails.`);
  const partNames = [...post.names];
  if (rails?.merge !== undefined) partNames.push(rails.merge);
  else if (rails)
    for (let k = 0; k < segments.length; k++)
      for (let j = 0; j < rails.heights.length; j++)
        partNames.push(`${name}_Rail${k + 1}_${j + 1}`);
  const seen = new Set<string>();
  for (const part of partNames) {
    if (seen.has(part)) fail(`two parts would be named ${part}.`);
    seen.add(part);
  }
  return {
    name,
    points,
    segments,
    post,
    rails,
    postMaterial: (materials.post as THREE.Material | undefined) ?? options.material,
    railMaterial: (materials.rail as THREE.Material | undefined) ?? options.material,
    seed,
    merge: options.merge,
    parent: options.parent,
  };
}

// ---------- Layout ----------

const QUARTER = Math.PI / 2;
/** Yaw about +Y that turns local +X onto the horizontal direction (x, z), in (-pi, pi]. */
const yawOf = (x: number, z: number) => {
  const yaw = Math.atan2(-z, x);
  return (yaw <= -Math.PI ? yaw + 2 * Math.PI : yaw) || 0;
};
const wrapYaw = (yaw: number) =>
  (yaw > Math.PI ? yaw - 2 * Math.PI : yaw <= -Math.PI ? yaw + 2 * Math.PI : yaw) || 0;

/** The horizontal unit direction from post a to post b. */
function runDirection(points: V3[], a: number, b: number): V2 {
  const dx = points[b]![0] - points[a]![0];
  const dz = points[b]![2] - points[a]![2];
  const l = Math.hypot(dx, dz);
  if (!(l > 1e-6)) fail(`posts ${a + 1} and ${b + 1} stand at the same place.`);
  return [dx / l, dz / l];
}

/**
 * Each post's yaw. An end post faces its one rail. A post between two rails bisects a turn of up
 * to 45 degrees. At a sharper turn it bisects only what is left after the nearest right angle,
 * so a right-angle corner post is square to both rails and no rail meets a face more than 22.5
 * degrees off square. An exact tie (a 45 or 135 degree turn) turns with the run.
 */
function postYaws(points: V3[], segments: V2[]): number[] {
  const into: (V2 | undefined)[] = points.map(() => undefined);
  const out: (V2 | undefined)[] = points.map(() => undefined);
  for (const [a, b] of segments) {
    const direction = runDirection(points, a, b);
    out[a] = direction;
    into[b] = direction;
  }
  return points.map((_, i) => {
    const before = into[i];
    const after = out[i];
    if (!before) return yawOf(after![0], after![1]);
    const heading = yawOf(before[0], before[1]);
    if (!after) return heading;
    const bend = wrapYaw(yawOf(after[0], after[1]) - heading) / QUARTER;
    // Right angles in the turn, rounding a half toward zero so a tie turns with the run.
    const square = Math.sign(bend) * Math.ceil(Math.abs(bend) - 0.5 - 1e-9);
    const offset = (bend - square) * QUARTER;
    // In line or at a right angle: the post keeps the incoming heading exactly.
    return Math.abs(offset) < 1e-12 ? heading : wrapYaw(heading + offset / 2);
  });
}

/** A post's frame: its path point and yaw. */
interface Frame {
  at: V3;
  cos: number;
  sin: number;
}
/** A world direction in a post's frame (rotation by -yaw about Y). */
const turn = (f: Frame, d: V3): V3 => [
  d[0] * f.cos - d[2] * f.sin,
  d[1],
  d[0] * f.sin + d[2] * f.cos,
];
/** A world point in a post's frame. */
const local = (f: Frame, p: V3): V3 => turn(f, sub(p, f.at));

const EPS = 1e-9;
/** Strictly inside the post's (chamfered) shaft. */
function inShaft(post: PostPlan, p: V3): boolean {
  const x = Math.abs(p[0]);
  const z = Math.abs(p[2]);
  const hx = post.sx / 2;
  const hz = post.sz / 2;
  return (
    x < hx - EPS &&
    z < hz - EPS &&
    (post.chamfer === 0 || x + z < hx + hz - post.chamfer - EPS) &&
    p[1] > EPS &&
    p[1] < post.height - EPS
  );
}

/** The post face a horizontal direction from the post axis crosses, and how far away it is. */
function faceHit(post: PostPlan, d: V3): { reach: number; axis: 0 | 2; side: number } {
  const tx = Math.abs(d[0]) > 1e-12 ? post.sx / 2 / Math.abs(d[0]) : Number.POSITIVE_INFINITY;
  const tz = Math.abs(d[2]) > 1e-12 ? post.sz / 2 / Math.abs(d[2]) : Number.POSITIVE_INFINITY;
  return tx <= tz
    ? { reach: tx, axis: 0, side: Math.sign(d[0]) }
    : { reach: tz, axis: 2, side: Math.sign(d[2]) };
}

/** Where the rail's long edges cross the plane `coordinate[axis] = plane`, never behind its end. */
function edgeCrossings(corners: V3[], outward: V3, axis: 0 | 2, plane: number): V3[] {
  return corners.map((corner) => {
    const t = Math.max(0, (plane - corner[axis]) / outward[axis]);
    return add(corner, mul(outward, t));
  });
}

function railSpans(plan: FencePlan, rails: RailPlan, frames: Frame[]): RailSpan[] {
  const { points, post } = plan;
  return plan.segments.map(([a, b]) => {
    const A = points[a]!;
    const B = points[b]!;
    const dir = norm(sub(B, A));
    const flat = Math.hypot(dir[0], dir[2]);
    const level: V3 = [dir[0] / flat, 0, dir[2] / flat];
    const reachA = faceHit(post, turn(frames[a]!, level)).reach;
    const reachB = faceHit(post, turn(frames[b]!, mul(level, -1))).reach;
    if (!(rails.embed < Math.min(reachA, reachB)))
      fail('rails.embed must be under the post half-section.');
    if (!(Math.hypot(B[0] - A[0], B[2] - A[2]) > reachA + reachB))
      fail(`posts ${a + 1} and ${b + 1} are too close for a rail between them.`);
    const start = add(A, mul(dir, (reachA - rails.embed) / flat));
    const end = sub(B, mul(dir, (reachB - rails.embed) / flat));
    const across = norm(cross([0, 1, 0], dir));
    for (const [i, y] of rails.heights.entries())
      for (let j = 0; j < i; j++)
        if (!(Math.abs(y - rails.heights[j]!) > rails.h / flat + EPS))
          fail(
            `rails.heights[${j}] and [${i}] must be more than a rail height apart (more on a slope).`,
          );
    return { a, b, start, end, dir, across, flat };
  });
}

/** The rail section's four corners at one end, in the post's frame. */
function endCorners(rails: RailPlan, span: RailSpan, frame: Frame, point: V3): V3[] {
  const up = cross(span.dir, span.across);
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([i, k]) =>
    local(
      frame,
      add(add(point, mul(span.across, (i! * rails.t) / 2)), mul(up, (k! * rails.h) / 2)),
    ),
  );
}

/**
 * Check one rail end inside post `n`: its end hidden in the post, its whole section entering
 * through the one face it points at (a chamfer facet included, never round the corner into the
 * next face), and clear of the pegs.
 */
function checkRailEnd(plan: FencePlan, rails: RailPlan, span: RailSpan, frame: Frame, n: number) {
  const { post } = plan;
  const atStart = n === span.a;
  const outward = turn(frame, atStart ? span.dir : mul(span.dir, -1));
  const hit = faceHit(post, [outward[0], 0, outward[2]]);
  const other = hit.axis === 0 ? 2 : 0;
  const face = (hit.side * (hit.axis === 0 ? post.sx : post.sz)) / 2;
  const faceHalf = (other === 0 ? post.sx : post.sz) / 2;
  const label = `the rail from post ${span.a + 1} to post ${span.b + 1}`;
  for (const y of rails.heights) {
    const corners = endCorners(rails, span, frame, add(atStart ? span.start : span.end, [0, y, 0]));
    if (!corners.every((corner) => inShaft(post, corner)))
      fail(
        `${label} shows its end at post ${n + 1}; raise rails.embed, or make the turn or slope gentler.`,
      );
    for (const crossing of edgeCrossings(corners, outward, hit.axis, face)) {
      if (!(Math.abs(crossing[other]) < faceHalf - EPS))
        fail(
          `${label} meets post ${n + 1} across its edge; narrow the rail or make the turn gentler.`,
        );
      if (!(crossing[1] > EPS && crossing[1] < post.height - EPS))
        fail(
          `${label} leaves the shaft of post ${n + 1}; lower the rail or make the slope gentler.`,
        );
    }
    if (post.pegs && hit.axis === 2)
      checkPegs(post, post.pegs, rails.heights, { corners, outward, side: hit.side }, () =>
        fail(
          `post.pegs on post ${n + 1} meet ${label}, which enters that post's side at the turn; move post.pegs.offsets or drop post.pegs.`,
        ),
      );
  }
}

/** Pegs stand on the side faces (local Z); a rail entering a side face must miss them. */
function checkPegs(
  post: PostPlan,
  pegs: PegPlan,
  heights: readonly number[],
  rail: { corners: V3[]; outward: V3; side: number },
  refuse: () => void,
) {
  const { corners, outward, side } = rail;
  const footprint = [
    ...edgeCrossings(corners, outward, 2, side * (post.sz / 2 - pegs.embed)),
    ...edgeCrossings(corners, outward, 2, side * (post.sz / 2 - pegs.embed + pegs.length)),
  ];
  const xs = footprint.map((p) => p[0]);
  const ys = footprint.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const { halfWidth: w, halfHeight: h } = pegs;
  for (const o of pegs.offsets)
    for (const y of heights) if (o - w < x1 && o + w > x0 && y - h < y1 && y + h > y0) refuse();
}

/** Two rails at one post must part inside the post, not outside it. */
function checkCorner(plan: FencePlan, rails: RailPlan, frame: Frame, n: number, toward: V3[]) {
  const [u, v] = toward.map((d) => turn(frame, d)) as [V3, V3];
  const sum: V3 = [u[0] + v[0], 0, u[2] + v[2]];
  const spread = Math.hypot(sum[0], sum[2]);
  if (spread < 1e-9) return; // in line: the rails leave on opposite faces
  const half = Math.hypot(u[0] - v[0], u[2] - v[2]) / 2; // sine of half the angle between them
  if (half < 1e-9) fail(`the run turns back on itself at post ${n + 1}.`);
  const parting = rails.t / 2 / half;
  const point: V3 = [
    (sum[0] / spread) * parting,
    plan.post.height / 2,
    (sum[2] / spread) * parting,
  ];
  if (!inShaft(plan.post, point))
    fail(
      `the rails at post ${n + 1} cross outside the post; the run turns too sharply there for rails this thick.`,
    );
}

function checkFit(plan: FencePlan, rails: RailPlan, frames: Frame[], spans: RailSpan[]) {
  const before: (number | undefined)[] = plan.points.map(() => undefined);
  const after: (number | undefined)[] = plan.points.map(() => undefined);
  for (const [a, b] of plan.segments) {
    after[a] = b;
    before[b] = a;
  }
  for (const [n, frame] of frames.entries()) {
    const p = before[n];
    const q = after[n];
    if (p === undefined || q === undefined) continue;
    const toward = [p, q].map((m): V3 => {
      const [x, z] = runDirection(plan.points, n, m);
      return [x, 0, z];
    });
    checkCorner(plan, rails, frame, n, toward);
  }
  for (const span of spans) {
    checkRailEnd(plan, rails, span, frames[span.a]!, span.a);
    checkRailEnd(plan, rails, span, frames[span.b]!, span.b);
  }
}

// ---------- Build ----------

function postGeometry(plan: FencePlan, i: number): THREE.BufferGeometry {
  const { post, rails } = plan;
  const batch = new Batch();
  timber(batch, [0, 0, 0], [0, post.height, 0], [post.sx, post.sz], post.chamfer, [1, 0, 0], {
    cap: post.cap,
    v: (plan.seed + i) * 0.3,
  });
  const pegs = post.pegs;
  if (pegs && rails)
    for (const y of rails.heights)
      for (const o of pegs.offsets)
        for (const side of [-1, 1]) {
          const p0: V3 = [o, y, side * (post.sz / 2 - pegs.embed)];
          peg(batch, p0, [o, y, p0[2] + side * pegs.length], pegs.radius, pegs.sides);
        }
  return batch.geometry();
}

function emitRails(
  plan: FencePlan,
  rails: RailPlan,
  spans: RailSpan[],
  root: THREE.Object3D,
  made: { pieces: Map<THREE.Mesh, string>; parts: THREE.Mesh[] },
) {
  const keep = (mesh: THREE.Mesh) => {
    root.add(mesh);
    made.pieces.set(mesh, 'rail');
    made.parts.push(mesh);
  };
  const merged = rails.merge === undefined ? undefined : new Batch();
  const size: V2 = [rails.t, rails.h];
  for (const [k, span] of spans.entries())
    for (const [j, y] of rails.heights.entries()) {
      const p0 = add(span.start, [0, y, 0]);
      const p1 = add(span.end, [0, y, 0]);
      const uv = { v: (plan.seed + k) * 0.71 + j * 0.37, u: (plan.seed + k) * 0.13 + j * 0.29 };
      if (merged) {
        timber(merged, p0, p1, size, rails.chamfer, span.across, uv);
        continue;
      }
      const batch = new Batch();
      const centre = mul(add(p0, p1), 0.5);
      timber(batch, sub(p0, centre), sub(p1, centre), size, rails.chamfer, span.across, uv);
      const mesh = new THREE.Mesh(batch.geometry(), plan.railMaterial);
      mesh.name = `Mesh_${plan.name}_Rail${k + 1}_${j + 1}`;
      mesh.position.set(...centre);
      keep(mesh);
    }
  if (merged?.index.length) {
    const mesh = new THREE.Mesh(merged.geometry(), plan.railMaterial);
    mesh.name = `Mesh_${rails.merge}`;
    keep(mesh);
  }
}

export function buildFenceRun(name: string, options: FenceRunOptions): FenceRunResult {
  const plan = resolvePlan(name, options);
  const yaws = postYaws(plan.points, plan.segments);
  const frames = plan.points.map(
    (at, i): Frame => ({ at, cos: Math.cos(yaws[i]!), sin: Math.sin(yaws[i]!) }),
  );
  const rails = plan.rails;
  const spans = rails ? railSpans(plan, rails, frames) : [];
  if (rails) checkFit(plan, rails, frames, spans);

  // Build. Nothing above has made a node.
  const root = new THREE.Object3D();
  root.name = name;
  const made = { pieces: new Map<THREE.Mesh, string>(), parts: [] as THREE.Mesh[] };
  const posts = plan.points.map((point, i) => {
    const frame = new THREE.Object3D();
    frame.name = plan.post.groups[i]!;
    frame.position.set(...point);
    if (yaws[i]) frame.rotation.y = yaws[i]!;
    root.add(frame);
    const mesh = new THREE.Mesh(postGeometry(plan, i), plan.postMaterial);
    mesh.name = `Mesh_${plan.post.names[i]}`;
    frame.add(mesh);
    made.pieces.set(mesh, 'post');
    made.parts.push(mesh);
    return frame;
  });
  if (rails) emitRails(plan, rails, spans, root, made);
  const parts =
    plan.merge === 'byMaterial'
      ? mergePiecesByMaterial(root, made.pieces, (role) =>
          role === 'post' ? name : `${name}_${roleSuffix(role)}s`,
        ).parts
      : made.parts;
  if (plan.parent) plan.parent.add(root);
  return { root, posts, parts };
}
