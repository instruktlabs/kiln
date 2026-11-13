/**
 * Flush faces: faces of an asset that lie on one plane, face the same way and share area.
 *
 * A depth buffer cannot order two such faces, so the pixels they share alternate between them
 * as the camera moves: z-fighting. It is a property of the geometry, so it shows in every
 * renderer the GLB is loaded into, and no export setting hides it. This check finds those
 * faces by measuring triangles, and says which parts, how much area and how far apart, so the
 * author can move one, remove the covered one or cut the opening it sits in.
 *
 * ## What counts
 *
 * - **Same facing.** Normals within one degree. Two faces that face each other (a crate on a
 *   floor) are contact: back-face culling draws only one of them. They count only when one of
 *   the two is drawn on both sides.
 * - **One plane.** Every vertex of each triangle is within `gap` of the other's plane. `gap`
 *   is half a millimetre, or a thousandth of the asset's size when that is smaller: a
 *   24-bit depth buffer with a 0.1 m near plane resolves about 1.5 mm at 50 m, so faces
 *   closer than this fight at ordinary viewing distances even though they are not identical.
 * - **Shared area.** The triangles' overlap in the plane, summed per pair of parts, is at
 *   least a ten-thousandth of the squared size of the asset: a patch a hundredth of the asset
 *   across. Faces that meet along an edge or at a corner share none.
 * - **Where it can be seen.** Two kinds of shared area are buried: faces that point straight
 *   down on the lowest plane of the asset, which is where it stands, and faces that lie
 *   against a face of the asset pointing the other way, such as two undersides on one deck.
 *   Pairs that share less than the least area outside those places are counted as `hidden`
 *   and not reported. This is not a visibility test: a face behind other parts still counts.
 *
 * - **A visible difference.** Two faces drawn with one plain material (no texture, no vertex
 *   colours, the same values) put the same colour on a pixel whichever wins, so the tie does
 *   not show. Those pairs are counted as `matching` and not reported.
 *
 * Two levels of one level-of-detail chain are never drawn together and are not compared.
 *
 * ## Bounds
 *
 * A tree of boxes over the triangles is compared with itself, so only triangles whose boxes
 * touch are measured and the cost follows the number of triangles that are near each other,
 * not the square of the count. The pass stops at `maxTriangles`, `maxWork` (box comparisons) and
 * `maxPairTests` (plane and area measurements) and reports `truncated` rather than claiming a
 * complete check. Order of traversal and fixed rounding make the report the same on every run.
 */
import * as THREE from 'three';
import { lodMembership } from './lod';

export interface FlushPart {
  /** How the part is named to the author: its node name or path. */
  ref: string;
  /** World-space triangle corners, nine numbers per triangle. */
  positions: ArrayLike<number>;
  /** True when the part's material draws both sides. */
  doubleSided?: boolean;
  /** Two parts of one chain at different levels are never drawn together (levels of detail). */
  alternate?: { chain: string; level: number };
  /**
   * What the part's surface looks like, when one plain material draws all of it. Two parts
   * with the same value cannot show a depth tie, so their pairs are counted, not reported.
   */
  surface?: string;
}

export interface FlushFacePair {
  /** The two parts, in traversal order. The same part twice when it overlaps itself. */
  parts: [string, string];
  /** Area the faces share on the plane where it is not buried, in square metres. */
  sharedArea: number;
  /** Largest distance between the two faces, in metres; 0 when they are on one plane. */
  maxGap: number;
  /** Triangle pairs that share area. */
  trianglePairs: number;
  /** `same` when both face one way; `opposite` only for a face drawn on both sides. */
  facing: 'same' | 'opposite';
  /** Unit normal of the shared plane. */
  normal: [number, number, number];
  /** A point on the largest shared region, for framing a close view. */
  at: [number, number, number];
}

export interface FlushFacesReport {
  version: 'kiln.flush-faces.v1';
  /** Triangles given. */
  triangles: number;
  /** Triangles measured: not degenerate and inside the triangle budget. */
  examined: number;
  pairTests: number;
  /** True when a budget stopped the pass early; unexamined faces may still be flush. */
  truncated: boolean;
  /** The gap, in metres, under which two faces count as one plane. */
  gap: number;
  /** The shared area, in square metres, under which a pair is not reported. */
  minArea: number;
  /** Part pairs that share at least `minArea` and would show it. */
  candidates: number;
  /** Part pairs that share at least `minArea` but look the same, so the tie does not show. */
  matching: number;
  /** Part pairs that share at least `minArea`, but less than that where it is not buried. */
  hidden: number;
  /** Candidates left out of `pairs`. */
  omitted: number;
  /** The pairs sharing the most area, largest first. */
  pairs: FlushFacePair[];
}

export interface FlushFacesOptions {
  gap?: number;
  maxTriangles?: number;
  maxWork?: number;
  maxPairTests?: number;
  maxFindings?: number;
}

export const FLUSH_GAP_METRES = 0.0005;
export const FLUSH_MAX_TRIANGLES = 400_000;
/** Box comparisons: the cheap step, and the one that grows with the square of the count. */
export const FLUSH_MAX_WORK = 40_000_000;
export const FLUSH_MAX_PAIR_TESTS = 4_000_000;
export const FLUSH_MAX_FINDINGS = 8;
/** cos(1°): normals closer than this face the same way. */
const SAME_FACING = 0.9998476951563913;

const clean = (value: number, digits: number): number => {
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? 0 : rounded;
};

/** Area of the convex polygon left when `subject` is clipped to the counter-clockwise `clip`. */
function clippedArea(subject: number[], clip: number[], centre: [number, number]): number {
  let points = subject;
  for (let edge = 0; edge < clip.length && points.length; edge += 2) {
    const ax = clip[edge]!;
    const ay = clip[edge + 1]!;
    const bx = clip[(edge + 2) % clip.length]!;
    const by = clip[(edge + 3) % clip.length]!;
    const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const next: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const px = points[i]!;
      const py = points[i + 1]!;
      const qx = points[(i + 2) % points.length]!;
      const qy = points[(i + 3) % points.length]!;
      const p = side(px, py);
      const q = side(qx, qy);
      if (p >= 0) next.push(px, py);
      if ((p > 0 && q < 0) || (p < 0 && q > 0)) {
        const t = p / (p - q);
        next.push(px + (qx - px) * t, py + (qy - py) * t);
      }
    }
    points = next;
  }
  if (points.length < 6) return 0;
  let doubled = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const nx = points[(i + 2) % points.length]!;
    const ny = points[(i + 3) % points.length]!;
    doubled += x * ny - nx * y;
    cx += x;
    cy += y;
  }
  centre[0] = cx / (points.length / 2);
  centre[1] = cy / (points.length / 2);
  return Math.abs(doubled) / 2;
}

interface Candidate {
  first: number;
  second: number;
  facing: 'same' | 'opposite';
  sharedArea: number;
  maxGap: number;
  trianglePairs: number;
  largest: number;
  /** Shared area that is buried: on the plane the asset stands on, or against another face. */
  hiddenArea: number;
  normal: [number, number, number];
  at: [number, number, number];
}

/** Every measurable triangle, in flat arrays indexed by triangle. */
interface Soup {
  count: number;
  /** True when the triangle budget left some triangles out. */
  truncated: boolean;
  /** Three corners, nine numbers a triangle. */
  corner: Float64Array;
  /** Unit normal. */
  normal: Float64Array;
  /** Box minimum and maximum. */
  low: Float64Array;
  high: Float64Array;
  area: Float64Array;
  /** Index of the part the triangle belongs to. */
  owner: Int32Array;
  /** Diagonal of the box around every triangle. */
  size: number;
  /** The lowest point of any triangle. */
  floor: number;
}

function readTriangles(parts: readonly FlushPart[], capacity: number): Soup {
  const corner = new Float64Array(capacity * 9);
  const normal = new Float64Array(capacity * 3);
  const low = new Float64Array(capacity * 3);
  const high = new Float64Array(capacity * 3);
  const area = new Float64Array(capacity);
  const owner = new Int32Array(capacity);
  let count = 0;
  let truncated = false;
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let index = 0; index < parts.length; index++) {
    const positions = parts[index]!.positions;
    for (let offset = 0; offset + 9 <= positions.length; offset += 9) {
      const ax = positions[offset]!;
      const ay = positions[offset + 1]!;
      const az = positions[offset + 2]!;
      const ux = positions[offset + 3]! - ax;
      const uy = positions[offset + 4]! - ay;
      const uz = positions[offset + 5]! - az;
      const vx = positions[offset + 6]! - ax;
      const vy = positions[offset + 7]! - ay;
      const vz = positions[offset + 8]! - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (!(length > 1e-14)) continue;
      if (count === capacity) {
        truncated = true;
        continue;
      }
      for (let k = 0; k < 9; k++) corner[count * 9 + k] = positions[offset + k]!;
      normal[count * 3] = nx / length;
      normal[count * 3 + 1] = ny / length;
      normal[count * 3 + 2] = nz / length;
      for (let axis = 0; axis < 3; axis++) {
        const a = positions[offset + axis]!;
        const b = positions[offset + 3 + axis]!;
        const c = positions[offset + 6 + axis]!;
        const min = Math.min(a, b, c);
        const max = Math.max(a, b, c);
        low[count * 3 + axis] = min;
        high[count * 3 + axis] = max;
        if (min < bounds[axis]!) bounds[axis] = min;
        if (max > bounds[axis + 3]!) bounds[axis + 3] = max;
      }
      area[count] = length / 2;
      owner[count] = index;
      count++;
    }
  }
  const size = count
    ? Math.hypot(bounds[3]! - bounds[0]!, bounds[4]! - bounds[1]!, bounds[5]! - bounds[2]!)
    : 0;
  return { count, truncated, corner, normal, low, high, area, owner, size, floor: bounds[1]! };
}

const LEAF_TRIANGLES = 8;

/** A tree of boxes over the triangles, so each is compared only with the ones near it. */
interface BoxTree {
  /** Triangle indices, ordered so that every node owns one run of them. */
  items: Int32Array;
  /** Per node: the box around its triangles, three numbers each. */
  low: Float64Array;
  high: Float64Array;
  /** Per node: its two children, or -1 for a leaf. */
  left: Int32Array;
  right: Int32Array;
  /** Per node: its run of `items`. */
  start: Int32Array;
  end: Int32Array;
}

/** Rearranges `items[from, to)` so that `items[k]` is the one a sort by `key` would put there. */
function select(
  items: Int32Array,
  from: number,
  to: number,
  k: number,
  key: (item: number) => number,
): void {
  let low = from;
  let high = to - 1;
  while (low < high) {
    const pivot = key(items[(low + high) >> 1]!);
    let i = low;
    let j = high;
    while (i <= j) {
      while (key(items[i]!) < pivot) i++;
      while (key(items[j]!) > pivot) j--;
      if (i <= j) {
        const swap = items[i]!;
        items[i] = items[j]!;
        items[j] = swap;
        i++;
        j--;
      }
    }
    if (k <= j) high = j;
    else if (k >= i) low = i;
    else return;
  }
}

/** Splits the triangles in half at the median of their box centres, along the widest axis. */
function buildBoxTree(soup: Soup): BoxTree {
  const { count } = soup;
  const capacity = Math.max(1, 2 * count);
  const tree: BoxTree = {
    items: new Int32Array(count),
    low: new Float64Array(capacity * 3),
    high: new Float64Array(capacity * 3),
    left: new Int32Array(capacity).fill(-1),
    right: new Int32Array(capacity).fill(-1),
    start: new Int32Array(capacity),
    end: new Int32Array(capacity),
  };
  for (let triangle = 0; triangle < count; triangle++) tree.items[triangle] = triangle;
  let nodes = 0;
  const grow = (from: number, to: number): number => {
    const node = nodes++;
    const centreLow = [Infinity, Infinity, Infinity];
    const centreHigh = [-Infinity, -Infinity, -Infinity];
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity;
      let max = -Infinity;
      for (let at = from; at < to; at++) {
        const triangle = tree.items[at]!;
        const a = soup.low[triangle * 3 + axis]!;
        const b = soup.high[triangle * 3 + axis]!;
        if (a < min) min = a;
        if (b > max) max = b;
        if (a + b < centreLow[axis]!) centreLow[axis] = a + b;
        if (a + b > centreHigh[axis]!) centreHigh[axis] = a + b;
      }
      tree.low[node * 3 + axis] = min;
      tree.high[node * 3 + axis] = max;
    }
    tree.start[node] = from;
    tree.end[node] = to;
    if (to - from > LEAF_TRIANGLES) {
      const spread = centreHigh.map((value, axis) => value - centreLow[axis]!);
      const axis = spread.indexOf(Math.max(...spread));
      const middle = (from + to) >> 1;
      select(
        tree.items,
        from,
        to,
        middle,
        (triangle) => soup.low[triangle * 3 + axis]! + soup.high[triangle * 3 + axis]!,
      );
      tree.left[node] = grow(from, middle);
      tree.right[node] = grow(middle, to);
    }
    return node;
  };
  if (count) grow(0, count);
  return tree;
}

/** True when the boxes of two nodes are further than `gap` apart. */
function nodesApart(tree: BoxTree, a: number, b: number, gap: number) {
  for (let axis = 0; axis < 3; axis++)
    if (
      tree.low[a * 3 + axis]! > tree.high[b * 3 + axis]! + gap ||
      tree.low[b * 3 + axis]! > tree.high[a * 3 + axis]! + gap
    )
      return true;
  return false;
}

/**
 * True when a face of the asset lies against triangle `i` at `point`, pointing the other way.
 * The two are in contact there, so whatever faces the way `i` does at that point is buried.
 */
function coveredAt(
  tree: BoxTree,
  soup: Soup,
  i: number,
  j: number,
  point: readonly [number, number, number],
  gap: number,
): boolean {
  const { corner, normal } = soup;
  const pending: number[] = [0];
  while (pending.length) {
    const node = pending.pop()!;
    let outside = false;
    for (let axis = 0; axis < 3; axis++)
      if (
        point[axis]! < tree.low[node * 3 + axis]! - gap ||
        point[axis]! > tree.high[node * 3 + axis]! + gap
      )
        outside = true;
    if (outside) continue;
    if (tree.left[node]! >= 0) {
      pending.push(tree.left[node]!, tree.right[node]!);
      continue;
    }
    for (let at = tree.start[node]!; at < tree.end[node]!; at++) {
      const k = tree.items[at]!;
      if (k === i || k === j) continue;
      const mx = normal[k * 3]!;
      const my = normal[k * 3 + 1]!;
      const mz = normal[k * 3 + 2]!;
      if (normal[i * 3]! * mx + normal[i * 3 + 1]! * my + normal[i * 3 + 2]! * mz > -SAME_FACING)
        continue;
      const px = point[0] - corner[k * 9]!;
      const py = point[1] - corner[k * 9 + 1]!;
      const pz = point[2] - corner[k * 9 + 2]!;
      if (Math.abs(mx * px + my * py + mz * pz) > gap) continue;
      if (insideTriangle(soup, k, point)) return true;
    }
  }
  return false;
}

/** True when `point`, taken to be on the plane of triangle `k`, is inside it or on its edge. */
function insideTriangle(soup: Soup, k: number, point: readonly [number, number, number]) {
  const { corner, normal } = soup;
  for (let edge = 0; edge < 3; edge++) {
    const a = k * 9 + edge * 3;
    const b = k * 9 + ((edge + 1) % 3) * 3;
    const ex = corner[b]! - corner[a]!;
    const ey = corner[b + 1]! - corner[a + 1]!;
    const ez = corner[b + 2]! - corner[a + 2]!;
    const px = point[0] - corner[a]!;
    const py = point[1] - corner[a + 1]!;
    const pz = point[2] - corner[a + 2]!;
    const side =
      (ey * pz - ez * py) * normal[k * 3]! +
      (ez * px - ex * pz) * normal[k * 3 + 1]! +
      (ex * py - ey * px) * normal[k * 3 + 2]!;
    if (side < -soup.area[k]! * 1e-6) return false;
  }
  return true;
}

/** Levels of one LOD chain are drawn one at a time, so they never fight each other. */
const alternates = (a: FlushPart, b: FlushPart): boolean =>
  !!a.alternate &&
  !!b.alternate &&
  a.alternate.chain === b.alternate.chain &&
  a.alternate.level !== b.alternate.level;

function boxesApart(soup: Soup, i: number, j: number, gap: number) {
  for (let axis = 0; axis < 3; axis++)
    if (
      soup.low[j * 3 + axis]! > soup.high[i * 3 + axis]! + gap ||
      soup.low[i * 3 + axis]! > soup.high[j * 3 + axis]! + gap
    )
      return true;
  return false;
}

/** How two triangles face each other when they could fight, else undefined. */
function facingOf(
  soup: Soup,
  i: number,
  j: number,
  eitherDoubleSided: boolean,
): 'same' | 'opposite' | undefined {
  const dot =
    soup.normal[i * 3]! * soup.normal[j * 3]! +
    soup.normal[i * 3 + 1]! * soup.normal[j * 3 + 1]! +
    soup.normal[i * 3 + 2]! * soup.normal[j * 3 + 2]!;
  if (dot >= SAME_FACING) return 'same';
  return dot <= -SAME_FACING && eitherDoubleSided ? 'opposite' : undefined;
}

/** The furthest any corner of either triangle lies from the other's plane; stops once past `gap`. */
function planeGap(soup: Soup, i: number, j: number, gap: number): number {
  const { corner, normal } = soup;
  let distance = 0;
  for (let k = 0; k < 3 && distance <= gap; k++) {
    let fromI = 0;
    let fromJ = 0;
    for (let axis = 0; axis < 3; axis++) {
      fromI += normal[i * 3 + axis]! * (corner[j * 9 + k * 3 + axis]! - corner[i * 9 + axis]!);
      fromJ += normal[j * 3 + axis]! * (corner[i * 9 + k * 3 + axis]! - corner[j * 9 + axis]!);
    }
    distance = Math.max(distance, Math.abs(fromI), Math.abs(fromJ));
  }
  return distance;
}

/**
 * The area two triangles share, measured in the plane of triangle `i`. Writes the centre of
 * the shared region to `at`.
 */
function sharedArea(soup: Soup, i: number, j: number, at: [number, number, number]): number {
  const { corner, normal } = soup;
  const nx = normal[i * 3]!;
  const ny = normal[i * 3 + 1]!;
  const nz = normal[i * 3 + 2]!;
  // A basis of the plane: the world axis the normal leans on least, crossed with the normal.
  const pick =
    Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)
      ? 0
      : Math.abs(ny) <= Math.abs(nz)
        ? 1
        : 2;
  const ex = pick === 0 ? 1 : 0;
  const ey = pick === 1 ? 1 : 0;
  const ez = pick === 2 ? 1 : 0;
  let ux = ny * ez - nz * ey;
  let uy = nz * ex - nx * ez;
  let uz = nx * ey - ny * ex;
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  const ox = corner[i * 9]!;
  const oy = corner[i * 9 + 1]!;
  const oz = corner[i * 9 + 2]!;
  const flat = (triangle: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < 3; k++) {
      const x = corner[triangle * 9 + k * 3]! - ox;
      const y = corner[triangle * 9 + k * 3 + 1]! - oy;
      const z = corner[triangle * 9 + k * 3 + 2]! - oz;
      out.push(x * ux + y * uy + z * uz, x * vx + y * vy + z * vz);
    }
    return out;
  };
  let clip = flat(j);
  const turn =
    (clip[2]! - clip[0]!) * (clip[5]! - clip[1]!) - (clip[4]! - clip[0]!) * (clip[3]! - clip[1]!);
  if (turn < 0) clip = [clip[0]!, clip[1]!, clip[4]!, clip[5]!, clip[2]!, clip[3]!];
  const centre: [number, number] = [0, 0];
  const shared = clippedArea(flat(i), clip, centre);
  at[0] = ox + ux * centre[0] + vx * centre[1];
  at[1] = oy + uy * centre[0] + vy * centre[1];
  at[2] = oz + uz * centre[0] + vz * centre[1];
  return shared;
}

/**
 * Finds parts whose faces lie on one plane, face the same way and overlap, which no depth
 * buffer can order. Budgets bound the pass; a report that stopped early says so.
 */
export function findFlushFaces(
  parts: readonly FlushPart[],
  options: FlushFacesOptions = {},
): FlushFacesReport {
  const maxPairTests = options.maxPairTests ?? FLUSH_MAX_PAIR_TESTS;
  const maxWork = options.maxWork ?? FLUSH_MAX_WORK;
  const maxFindings = options.maxFindings ?? FLUSH_MAX_FINDINGS;

  let given = 0;
  for (const part of parts) given += Math.floor(part.positions.length / 9);
  const soup = readTriangles(parts, Math.min(given, options.maxTriangles ?? FLUSH_MAX_TRIANGLES));
  const { count, owner, size } = soup;
  let truncated = soup.truncated;
  const gap = options.gap ?? Math.min(FLUSH_GAP_METRES, size * 1e-3);
  const minArea = Math.max(1e-8, size * size * 1e-4);
  const tree = buildBoxTree(soup);

  const found = new Map<string, Candidate>();
  const at: [number, number, number] = [0, 0, 0];
  let pairTests = 0;
  let work = 0;

  /** Measures one pair of triangles whose boxes touch. False once the pair budget is spent. */
  const measure = (i: number, j: number): boolean => {
    const partI = parts[owner[i]!]!;
    const partJ = parts[owner[j]!]!;
    if (alternates(partI, partJ)) return true;
    const facing = facingOf(soup, i, j, !!(partI.doubleSided || partJ.doubleSided));
    if (!facing) return true;
    if (++pairTests > maxPairTests) {
      pairTests = maxPairTests;
      return false;
    }
    const distance = planeGap(soup, i, j, gap);
    if (distance > gap) return true;
    const shared = sharedArea(soup, i, j, at);
    if (shared <= Math.max(1e-14, Math.min(soup.area[i]!, soup.area[j]!) * 1e-6)) return true;
    const first = Math.min(owner[i]!, owner[j]!);
    const second = Math.max(owner[i]!, owner[j]!);
    const key = `${first}:${second}:${facing}`;
    let candidate = found.get(key);
    if (!candidate) {
      candidate = {
        first,
        second,
        facing,
        sharedArea: 0,
        maxGap: 0,
        trianglePairs: 0,
        largest: 0,
        hiddenArea: 0,
        normal: [0, 0, 0],
        at: [0, 0, 0],
      };
      found.set(key, candidate);
    }
    // Buried: straight down on the plane the asset stands on, or against a face in contact.
    const buried =
      facing === 'same' &&
      ((soup.normal[i * 3 + 1]! <= -SAME_FACING && soup.high[i * 3 + 1]! <= soup.floor + gap) ||
        coveredAt(tree, soup, i, j, at, gap));
    if (buried) {
      candidate.hiddenArea += shared;
      return true;
    }
    candidate.sharedArea += shared;
    candidate.maxGap = Math.max(candidate.maxGap, distance);
    candidate.trianglePairs++;
    if (shared > candidate.largest) {
      candidate.largest = shared;
      candidate.normal = [soup.normal[i * 3]!, soup.normal[i * 3 + 1]!, soup.normal[i * 3 + 2]!];
      candidate.at = [at[0], at[1], at[2]];
    }
    return true;
  };

  /** Every pair of triangles across two leaves, or within one. False once a budget is spent. */
  const meet = (a: number, b: number): boolean => {
    for (let x = tree.start[a]!; x < tree.end[a]!; x++) {
      const i = tree.items[x]!;
      for (let y = a === b ? x + 1 : tree.start[b]!; y < tree.end[b]!; y++) {
        const j = tree.items[y]!;
        if (++work > maxWork) return false;
        if (boxesApart(soup, i, j, gap)) continue;
        // Lower index first, so a pair is measured the same way whatever the tree's shape.
        if (!(i < j ? measure(i, j) : measure(j, i))) return false;
      }
    }
    return true;
  };

  // The tree against itself: a pair of nodes whose boxes are apart is dropped whole, and a
  // pair of triangles is reached through exactly one pair of leaves.
  const pending: number[] = [0, 0];
  while (pending.length) {
    const b = pending.pop()!;
    const a = pending.pop()!;
    if (++work > maxWork) {
      truncated = true;
      break;
    }
    if (a !== b && nodesApart(tree, a, b, gap)) continue;
    const leafA = tree.left[a]! < 0;
    const leafB = tree.left[b]! < 0;
    if (leafA && leafB) {
      if (meet(a, b)) continue;
      truncated = true;
      break;
    }
    if (a === b) {
      pending.push(tree.left[a]!, tree.left[a]!, tree.right[a]!, tree.right[a]!);
      pending.push(tree.left[a]!, tree.right[a]!);
      continue;
    }
    // Open the node that is not a leaf; of two, the one that holds more triangles.
    const openB =
      leafA || (!leafB && tree.end[b]! - tree.start[b]! > tree.end[a]! - tree.start[a]!);
    const open = openB ? b : a;
    const other = openB ? a : b;
    pending.push(tree.left[open]!, other, tree.right[open]!, other);
  }

  const sharing = [...found.values()].filter(
    (candidate) => candidate.sharedArea + candidate.hiddenArea >= minArea,
  );
  const lookAlike = (candidate: Candidate) => {
    const surface = parts[candidate.first]!.surface;
    return surface !== undefined && surface === parts[candidate.second]!.surface;
  };
  const showing = sharing.filter((candidate) => !lookAlike(candidate));
  const candidates = showing
    .filter((candidate) => candidate.sharedArea >= minArea)
    .sort(
      (a, b) =>
        b.sharedArea - a.sharedArea ||
        a.first - b.first ||
        a.second - b.second ||
        a.facing.localeCompare(b.facing),
    );
  return {
    version: 'kiln.flush-faces.v1',
    triangles: given,
    examined: count,
    pairTests,
    truncated,
    gap: clean(gap, 7),
    minArea: clean(minArea, 9),
    candidates: candidates.length,
    matching: sharing.length - showing.length,
    hidden: showing.length - candidates.length,
    omitted: Math.max(0, candidates.length - maxFindings),
    pairs: candidates.slice(0, maxFindings).map((candidate) => ({
      parts: [parts[candidate.first]!.ref, parts[candidate.second]!.ref],
      sharedArea: clean(candidate.sharedArea, 8),
      maxGap: clean(candidate.maxGap, 7),
      trianglePairs: candidate.trianglePairs,
      facing: candidate.facing,
      normal: [
        clean(candidate.normal[0], 4),
        clean(candidate.normal[1], 4),
        clean(candidate.normal[2], 4),
      ],
      at: [clean(candidate.at[0], 5), clean(candidate.at[1], 5), clean(candidate.at[2], 5)],
    })),
  };
}

/**
 * A mesh's look as a string, when one material without textures draws it and it has no vertex
 * colours: every number, flag and colour of the material, so two meshes compare equal only when
 * a renderer would shade a shared plane identically. Undefined when the look varies over the
 * surface or cannot be read.
 */
function plainSurface(mesh: THREE.Mesh): string | undefined {
  const material = mesh.material;
  if (!material || Array.isArray(material) || mesh.geometry.getAttribute('color')) return undefined;
  const values: string[] = [];
  for (const [name, value] of Object.entries(material)) {
    if (name === 'uuid' || name === 'name' || name === 'version' || name === 'userData') continue;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
      values.push(`${name}=${value}`);
    else if (value && typeof value === 'object') {
      if ((value as { isTexture?: boolean }).isTexture) return undefined;
      if ((value as { isColor?: boolean }).isColor)
        values.push(`${name}=${(value as THREE.Color).getHexString()}`);
    }
  }
  return values.sort().join(';');
}

export interface SceneFlushFacesReport extends FlushFacesReport {
  /** Meshes not measured: instanced, skinned, morphed or drawn from part of their buffer. */
  unexaminedParts: number;
}

/**
 * Measure the visible static meshes of a built scene. Corners are taken in world space, so
 * parts are compared where they are drawn. A part is named as the author named its mesh.
 */
export function analyzeFlushFaces(
  root: THREE.Object3D,
  options: FlushFacesOptions = {},
): SceneFlushFacesReport {
  const maxTriangles = options.maxTriangles ?? FLUSH_MAX_TRIANGLES;
  const parts: FlushPart[] = [];
  const chains = new Map<THREE.Object3D | null, number>();
  let unexaminedParts = 0;
  let collected = 0;
  let beyondBudget = false;
  const point = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute('position');
    if (!position) return;
    const corners = geometry.index ? geometry.index.count : position.count;
    if (
      (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh ||
      (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh ||
      geometry.morphAttributes.position?.length ||
      geometry.drawRange.start !== 0 ||
      geometry.drawRange.count < corners
    ) {
      unexaminedParts++;
      return;
    }
    const triangles = Math.floor(corners / 3);
    if (collected + triangles > maxTriangles) {
      beyondBudget = true;
      return;
    }
    collected += triangles;
    const positions = new Float64Array(triangles * 9);
    for (let corner = 0; corner < triangles * 3; corner++) {
      const vertex = geometry.index ? geometry.index.getX(corner) : corner;
      point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
      positions[corner * 3] = point.x;
      positions[corner * 3 + 1] = point.y;
      positions[corner * 3 + 2] = point.z;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const surface = plainSurface(mesh);
    const membership = lodMembership(mesh);
    let alternate: FlushPart['alternate'];
    if (membership) {
      if (!chains.has(membership.parent)) chains.set(membership.parent, chains.size);
      alternate = {
        chain: `${chains.get(membership.parent)}:${membership.stem}`,
        level: membership.level,
      };
    }
    parts.push({
      ref: mesh.name || '(unnamed mesh)',
      positions,
      ...(materials.some((material) => material?.side === THREE.DoubleSide)
        ? { doubleSided: true }
        : {}),
      ...(alternate ? { alternate } : {}),
      ...(surface === undefined ? {} : { surface }),
    });
  });
  const report = findFlushFaces(parts, options);
  return { ...report, truncated: report.truncated || beyondBudget, unexaminedParts };
}

/** How many pairs a build names before it only counts the rest. */
export const FLUSH_WARNING_PAIRS = 3;
const millimetres = (metres: number) => `${clean(metres * 1000, 2)} mm`;
const squareMetres = (area: number) =>
  area >= 0.01 ? `${clean(area, 2)} m²` : `${clean(area * 10_000, 2)} cm²`;
const named = (pair: FlushFacePair) =>
  pair.parts[0] === pair.parts[1]
    ? `${pair.parts[0]} over itself`
    : `${pair.parts[0]} and ${pair.parts[1]}`;

/**
 * The report as one build warning for the author: the worst pair in full, the next ones by
 * name, a count of the rest, and what to do. One line, so it cannot crowd other warnings out
 * of a result that keeps only a few. Empty when there is nothing to say.
 */
export function flushFaceWarnings(report: SceneFlushFacesReport): string[] {
  const [worst, ...others] = report.pairs.slice(0, FLUSH_WARNING_PAIRS);
  if (!worst)
    return report.truncated
      ? [
          'FLUSH_FACES: the flush-face check stopped at its budget before measuring every face, so flush faces may remain unreported.',
        ]
      : [];
  const count = report.candidates;
  const rest = count - 1 - others.length;
  // A gap that rounds to nothing is one plane to the reader.
  const plane =
    clean(worst.maxGap * 1000, 2) === 0
      ? 'on one plane'
      : `${millimetres(worst.maxGap)} apart, too close to order`;
  return [
    `FLUSH_FACES: ${count} pair${count === 1 ? '' : 's'} of parts ${count === 1 ? 'has' : 'have'} faces on one plane that will flicker (z-fighting) in any renderer. ` +
      `${count === 1 ? 'It is' : 'Worst:'} ${named(worst)}, ${plane}, sharing ${squareMetres(worst.sharedArea)} near [${worst.at.join(', ')}], normal (${worst.normal.join(', ')})${worst.facing === 'opposite' ? ', one drawn on both sides' : ''}. ` +
      (others.length
        ? `Also: ${others.map((pair) => `${named(pair)} (${squareMetres(pair.sharedArea)})`).join('; ')}${rest > 0 ? `; and ${rest} more` : ''}. `
        : '') +
      `${count === 1 ? 'Move the smaller face at least 2 mm along that normal' : 'For each pair, move the smaller face at least 2 mm along the shared normal'}, remove the covered face, or cut the opening it sits in${report.truncated ? '. The check stopped at its budget, so more may remain' : ''}.`,
  ];
}
