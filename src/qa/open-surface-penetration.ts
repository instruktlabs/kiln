/**
 * Open surfaces measured against closed solids — #277
 *
 * ## The gap this fills
 *
 * The part-volume pass (`self-intersection.ts`) measures shared volume, so it
 * can only compare parts it can build as closed solids. A cloth, a canopy sheet
 * or an ivy card encloses no volume at all, so every pair containing one is
 * reported as unmeasured — `GEO_PART_SELF_INTERSECTION_UNMEASURED`, or
 * `GEO_PART_SELF_INTERSECTION_ACKNOWLEDGED` when the author marked the shell
 * open. Both findings say plainly that overlap there is not ruled out.
 *
 * That leaves the author with one signal for two opposite situations. A throw
 * resting on a seat and a throw running through a wall produce the same
 * sentence. This pass answers the question the volume pass states it cannot:
 * how far does an open surface reach inside a closed neighbour.
 *
 * ## Depth before sign
 *
 * The measurement is a per-vertex distance to the solid's surface, and the sign
 * — inside or outside — comes from ray parity against the same watertight
 * triangles. The order matters:
 *
 * 1. Distance first. A vertex within {@link OPEN_SURFACE_CONTACT_TOLERANCE} of
 *    the surface is **contact**, and no sign is claimed for it.
 * 2. Sign only beyond the tolerance, where parity is well away from its
 *    degenerate regime.
 *
 * A cloth authored exactly flush on a seat has every vertex on the surface,
 * which is precisely where a parity ray is ambiguous — it grazes the face it
 * starts on. Testing distance first removes that whole class: those vertices
 * never reach the ray. The flush case is silent because it is contact, not
 * because the measurement failed.
 *
 * ## The tolerance is not the adjacency tolerance
 *
 * `FLOATING_EXPAND` and `EXTERNAL_SUPPORT_TOLERANCE` are both 2 cm, and both
 * answer a gross question: did the author forget to attach this part at all.
 * Penetration is a different regime and needs its own, much smaller number —
 * see {@link OPEN_SURFACE_CONTACT_TOLERANCE} for the measurements it was chosen
 * from. Reusing 2 cm here would let a cloth sink 2 cm into a cushion, a canopy
 * panel or a wall cap unreported, and those are exactly the parts an open
 * surface meets.
 *
 * ## Bounded time
 *
 * One deterministic triangle hierarchy per closed solid, built at most once and
 * reused across every open surface that meets it. Vertices are tested in buffer
 * order against a shared work budget; pairs are visited deepest box overlap
 * first, so the likeliest penetration is measured before the budget runs out.
 * Whatever the budget leaves is counted and reported, never silently dropped.
 *
 * ## What it does not see
 *
 * Vertices are the samples, so a solid thinner than the open surface's own
 * facet spacing can pass between two vertices that are both outside it. A
 * coarse drape over a thin rail reads clean for the same reason it should: its
 * vertices lie on or outside the rail, and only the interpolated facet cuts the
 * corner. Instanced, skinned and morph-deformed parts are not sampled.
 */

import * as THREE from 'three';
import { geometryDiagnostics } from '../geometry';
import { lodMembership } from './lod';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

/**
 * Penetration at or below this depth is treated as intended contact, in metres.
 *
 * Chosen from measured fixtures rather than from the adjacency tolerance:
 *
 * | geometry                                  | depth   |
 * |-------------------------------------------|---------|
 * | cloth flush on a seat top                 | 0 mm    |
 * | cloth sunk to hide a seam                 | 1–3 mm  |
 * | cloth 2 mm into a wall (invisible)        | 2 mm    |
 * | canopy pierced by a 6 cm mast             | 30 mm   |
 * | cloth running through a 12 cm wall        | 60 mm   |
 *
 * 5 mm sits an order of magnitude below the defects and above the authoring
 * slop, so both sides keep real margin. It is absolute rather than relative to
 * either part: the quantity is how deep a surface disappears into a solid,
 * which reads the same on a bench and on a building, and scaling it to the open
 * surface would let a 20 m banner hide 10 cm of penetration.
 */
export const OPEN_SURFACE_CONTACT_TOLERANCE = 0.005;
/** Above this, one part stops being bounded-time to sample or to index. */
export const MAX_SURFACE_TRIANGLES = 20000;
/** Vertices sampled per open surface, in buffer order. */
export const MAX_SAMPLED_VERTICES = 20000;
/** Triangle tests shared by every distance and parity query in one analysis. */
export const MAX_WORK = 250_000;
/** Bound pair discovery even when many boxes overlap. */
export const MAX_BROAD_PHASE_PAIRS = 250_000;

export interface OpenSurfacePenetrationPairV1 {
  /** The open surface's part name. */
  open: string;
  /** The closed solid it reaches inside. */
  solid: string;
  /** Deepest distance from the solid's surface to a penetrating vertex, in metres. */
  depth: number;
  /** Vertices measured inside the solid beyond the contact tolerance. */
  vertices: number;
  /** Vertices of the open surface sampled against this solid. */
  tested: number;
}

export interface OpenSurfacePenetrationEvidenceV1 {
  schemaVersion: 1;
  source: 'engine-scene-analysis';
  /** Contact tolerance the analysis ran with, in metres. */
  contactTolerance: number;
  /** Eligible open-surface parts collected. */
  openParts: number;
  /** Eligible closed-solid parts collected. */
  closedParts: number;
  /**
   * Open/closed pairs whose world boxes overlap, excluding LOD alternates; a
   * lower bound when `broadPhaseTruncated` is true.
   */
  candidatePairs: number;
  /** Pair discovery itself exhausted its budget; later pairs were not considered. */
  broadPhaseTruncated?: boolean;
  /** Pairs sampled to completion. */
  pairsTested: number;
  /** Candidate pairs left unsampled, or sampled only in part, by the work budget. */
  pairsNotReached: number;
  /** Overlapping pairs on different LOD levels: alternates, deliberately not compared. */
  pairsLodAlternates: number;
  /** True when pair discovery or the work budget left geometry unexamined. */
  truncated: boolean;
  /** Parts skipped, with the reason — never silently dropped. */
  skipped: { part: string; reason: string }[];
  /** Pairs whose depth exceeds the contact tolerance, deepest first. */
  penetrations: OpenSurfacePenetrationPairV1[];
}

interface SurfaceTriangle {
  triangle: THREE.Triangle;
  box: THREE.Box3;
}

type Hierarchy = { box: THREE.Box3 } & (
  | { triangles: SurfaceTriangle[] }
  | { children: [Hierarchy, Hierarchy] }
);

interface AnalyzedPart {
  name: string;
  mesh: THREE.Mesh;
  box: THREE.Box3;
  closed: boolean;
  lod: ReturnType<typeof lodMembership>;
  /** Built on first use and reused; closed parts only. */
  hierarchy?: Hierarchy;
}

/** Balanced and deterministic: the same scene yields the same tree on every run. */
function buildHierarchy(triangles: SurfaceTriangle[]): Hierarchy {
  const box = new THREE.Box3();
  for (const triangle of triangles) box.union(triangle.box);
  if (triangles.length <= 4) return { box, triangles };
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const center = (triangle: SurfaceTriangle) =>
    triangle.box.min[axis] / 2 + triangle.box.max[axis] / 2;
  // Sorting a copy keeps the caller's traversal order, and the source geometry, untouched.
  const sorted = [...triangles].sort((a, b) => center(a) - center(b));
  const middle = Math.floor(sorted.length / 2);
  return {
    box,
    children: [buildHierarchy(sorted.slice(0, middle)), buildHierarchy(sorted.slice(middle))],
  };
}

function worldTriangles(mesh: THREE.Mesh): SurfaceTriangle[] | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (position?.itemSize !== 3) return null;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  if (count % 3 !== 0) return null;
  const triangles: SurfaceTriangle[] = [];
  const vertex = (at: number) => {
    const id = index ? index.getX(at) : at;
    if (!Number.isSafeInteger(id) || id < 0 || id >= position.count) return null;
    const point = new THREE.Vector3()
      .fromBufferAttribute(position, id)
      .applyMatrix4(mesh.matrixWorld);
    return [point.x, point.y, point.z].every(Number.isFinite) ? point : null;
  };
  for (let i = 0; i < count; i += 3) {
    const a = vertex(i),
      b = vertex(i + 1),
      c = vertex(i + 2);
    if (!a || !b || !c) return null;
    const triangle = new THREE.Triangle(a, b, c);
    triangles.push({ triangle, box: new THREE.Box3().setFromPoints([a, b, c]) });
  }
  return triangles.length ? triangles : null;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return Math.floor((index ? index.count : position.count) / 3);
}

/**
 * Split the visible meshes into open surfaces and closed solids.
 *
 * `geometryDiagnostics` answers this from quantized edge topology alone, with no
 * boolean and no WASM, so the whole pass stays synchronous and a QA rule can
 * take the measurement itself.
 */
function collectParts(
  root: THREE.Object3D,
  skipped: OpenSurfacePenetrationEvidenceV1['skipped'],
): AnalyzedPart[] {
  const parts: AnalyzedPart[] = [];
  root.updateWorldMatrix(true, true);
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const name = mesh.name || '(unnamed mesh)';
    if (
      (mesh as THREE.InstancedMesh).isInstancedMesh ||
      (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
      Object.values(mesh.geometry.morphAttributes).some((targets) => targets.length)
    ) {
      skipped.push({
        part: name,
        reason: 'instancing, skin or morph deformation is unsupported by surface sampling',
      });
      return;
    }
    const total = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
    const range = mesh.geometry.drawRange;
    if (range.start !== 0 || range.count < total) {
      skipped.push({
        part: name,
        reason: 'partial triangle draw ranges are unsupported by surface sampling',
      });
      return;
    }
    const triangles = triangleCount(mesh.geometry);
    if (triangles === 0) return;
    if (triangles > MAX_SURFACE_TRIANGLES) {
      skipped.push({
        part: name,
        reason: `${triangles} triangles exceeds the ${MAX_SURFACE_TRIANGLES}-triangle analysis budget`,
      });
      return;
    }
    // Bounds belong to this mesh, never its child meshes (which are independent parts).
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    if (box.isEmpty()) return;
    const determinant = mesh.matrixWorld.determinant();
    if (![...box.min, ...box.max].every(Number.isFinite) || !Number.isFinite(determinant)) {
      skipped.push({ part: name, reason: 'non-finite transformed bounds cannot be measured' });
      return;
    }
    let diagnostics: ReturnType<typeof geometryDiagnostics>;
    try {
      diagnostics = geometryDiagnostics(mesh.geometry);
    } catch (error) {
      skipped.push({
        part: name,
        reason: `topology could not be analyzed (${error instanceof Error ? error.message : String(error)})`,
      });
      return;
    }
    // A watertight, orientable shell is a solid a ray can be counted against.
    // Anything else — a sheet, a card, a shell with a hole — is an open surface.
    const closed =
      diagnostics.solid.closed &&
      diagnostics.solid.manifold &&
      diagnostics.solid.orientation !== 'mixed';
    parts.push({ name, mesh, box, closed, lod: lodMembership(mesh) });
  });
  return parts;
}

function boxDistanceSquared(box: THREE.Box3, point: THREE.Vector3): number {
  const x = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
  const y = Math.max(box.min.y - point.y, 0, point.y - box.max.y);
  const z = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
  return x * x + y * y + z * z;
}

/** Shared box volume over the smaller box's volume, 0..1; 0 for flat boxes. */
function boxOverlapRatio(a: THREE.Box3, b: THREE.Box3): number {
  const extent = (box: THREE.Box3) =>
    (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);
  const shared =
    Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) *
    Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)) *
    Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  const ratio = shared / Math.min(extent(a), extent(b));
  return Number.isFinite(ratio) ? ratio : 0;
}

/** A work meter every query draws on, so one analysis has one bounded cost. */
class Budget {
  private used = 0;
  exhausted = false;
  constructor(private readonly limit: number) {}
  spend(): boolean {
    if (this.used >= this.limit) {
      this.exhausted = true;
      return false;
    }
    this.used++;
    return true;
  }
}

/** Nearest distance from `point` to the indexed surface; null when the budget runs out. */
function nearestDistance(root: Hierarchy, point: THREE.Vector3, budget: Budget): number | null {
  let best = Infinity;
  const stack: Hierarchy[] = [root];
  const scratch = new THREE.Vector3();
  while (stack.length) {
    const node = stack.pop()!;
    if (boxDistanceSquared(node.box, point) >= best) continue;
    if ('triangles' in node) {
      for (const { triangle } of node.triangles) {
        if (!budget.spend()) return null;
        const distance = point.distanceToSquared(triangle.closestPointToPoint(point, scratch));
        if (distance < best) best = distance;
      }
    } else stack.push(node.children[0], node.children[1]);
  }
  return Number.isFinite(best) ? Math.sqrt(best) : null;
}

/**
 * Three fixed directions, tried in order. A ray that grazes a triangle edge
 * cannot be counted, so an ambiguous direction is abandoned for the next rather
 * than guessed at; the set is fixed so the verdict never varies between runs.
 */
const PARITY_DIRECTIONS: readonly THREE.Vector3[] = Object.freeze([
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0.5773502691896258, 0.5773502691896258, 0.5773502691896258),
  new THREE.Vector3(-0.2672612419124244, 0.5345224838248488, 0.8017837257372732),
]);
/** Barycentric margin below which a hit sits on an edge and the count is unreliable. */
const PARITY_EPSILON = 1e-7;

/** Crossing parity along one direction: true inside, false outside, null ambiguous. */
function parity(
  root: Hierarchy,
  point: THREE.Vector3,
  direction: THREE.Vector3,
  budget: Budget,
): boolean | null {
  const ray = new THREE.Ray(point, direction);
  const stack: Hierarchy[] = [root];
  const hit = new THREE.Vector3();
  const barycentric = new THREE.Vector3();
  let crossings = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (!ray.intersectsBox(node.box)) continue;
    if ('triangles' in node) {
      for (const { triangle } of node.triangles) {
        if (!budget.spend()) return null;
        if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit) === null)
          continue;
        triangle.getBarycoord(hit, barycentric);
        if ([barycentric.x, barycentric.y, barycentric.z].some((v) => Math.abs(v) < PARITY_EPSILON))
          return null;
        crossings++;
      }
    } else stack.push(node.children[0], node.children[1]);
  }
  return crossings % 2 === 1;
}

function inside(root: Hierarchy, point: THREE.Vector3, budget: Budget): boolean | null {
  for (const direction of PARITY_DIRECTIONS) {
    const verdict = parity(root, point, direction, budget);
    if (verdict !== null) return verdict;
    if (budget.exhausted) return null;
  }
  return null;
}

/** Fixed precision so a report is byte-comparable across runs. */
const round = (value: number): number => Number(value.toPrecision(9));

/**
 * Measure how far every open surface reaches inside every closed solid it meets.
 *
 * Synchronous by construction: the open/closed split comes from edge topology
 * and the depth from triangle queries, so no WASM solid is built and the rule
 * takes its own measurement instead of waiting on a derived-evidence pre-pass.
 */
export function analyzeOpenSurfacePenetration(
  root: unknown,
  contactTolerance: number = OPEN_SURFACE_CONTACT_TOLERANCE,
): OpenSurfacePenetrationEvidenceV1 {
  const evidence: OpenSurfacePenetrationEvidenceV1 = {
    schemaVersion: 1,
    source: 'engine-scene-analysis',
    contactTolerance,
    openParts: 0,
    closedParts: 0,
    candidatePairs: 0,
    pairsTested: 0,
    pairsNotReached: 0,
    pairsLodAlternates: 0,
    truncated: false,
    skipped: [],
    penetrations: [],
  };
  if (!(root instanceof THREE.Object3D)) return evidence;
  const parts = collectParts(root, evidence.skipped);
  const open = parts.filter((part) => !part.closed);
  const closed = parts.filter((part) => part.closed);
  evidence.openParts = open.length;
  evidence.closedParts = closed.length;

  const candidates: { open: AnalyzedPart; solid: AnalyzedPart; overlap: number }[] = [];
  let considered = 0;
  broadPhase: for (const surface of open) {
    for (const solid of closed) {
      if (considered++ === MAX_BROAD_PHASE_PAIRS) {
        evidence.broadPhaseTruncated = true;
        break broadPhase;
      }
      // Contact within the tolerance is not penetration, so only boxes that
      // already overlap can hold a vertex deeper than it.
      if (!surface.box.intersectsBox(solid.box)) continue;
      if (
        surface.lod &&
        solid.lod &&
        surface.lod.parent === solid.lod.parent &&
        surface.lod.stem === solid.lod.stem &&
        surface.lod.level !== solid.lod.level
      ) {
        evidence.pairsLodAlternates++;
        continue;
      }
      candidates.push({ open: surface, solid, overlap: boxOverlapRatio(surface.box, solid.box) });
    }
  }
  evidence.candidatePairs = candidates.length;
  evidence.truncated = evidence.broadPhaseTruncated === true;
  if (!candidates.length) return evidence;

  // Deepest box overlap first: a surface buried in a solid's box is the likeliest
  // real penetration, a grazing contact the least. Ties keep collection order.
  candidates.sort((x, y) => y.overlap - x.overlap);

  const budget = new Budget(MAX_WORK);
  const penetrations: OpenSurfacePenetrationPairV1[] = [];
  for (const candidate of candidates) {
    if (budget.exhausted) {
      evidence.pairsNotReached++;
      continue;
    }
    if (!candidate.solid.hierarchy) {
      const triangles = worldTriangles(candidate.solid.mesh);
      if (!triangles) {
        evidence.skipped.push({
          part: candidate.solid.name,
          reason: 'invalid or non-finite triangles cannot be indexed',
        });
        evidence.pairsNotReached++;
        continue;
      }
      candidate.solid.hierarchy = buildHierarchy(triangles);
    }
    const hierarchy = candidate.solid.hierarchy;
    const position = candidate.open.mesh.geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined;
    if (position?.itemSize !== 3) {
      evidence.skipped.push({
        part: candidate.open.name,
        reason: 'open surfaces are sampled at their vertices and this part has none',
      });
      continue;
    }
    const matrix = candidate.open.mesh.matrixWorld;
    const limit = Math.min(position.count, MAX_SAMPLED_VERTICES);
    const vertex = new THREE.Vector3();
    let depth = 0;
    let penetrating = 0;
    let tested = 0;
    let partial = limit < position.count;
    for (let i = 0; i < limit; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) continue;
      // Outside the solid's own box, the nearest surface is at least a box
      // distance away, so a cheap reject stands in for the whole query.
      if (boxDistanceSquared(candidate.solid.box, vertex) > contactTolerance * contactTolerance) {
        tested++;
        continue;
      }
      const distance = nearestDistance(hierarchy, vertex, budget);
      if (distance === null) {
        partial = true;
        break;
      }
      tested++;
      // Depth before sign: within the tolerance this is contact either way, and
      // a parity ray starting on the surface it would count is ambiguous.
      if (distance <= contactTolerance) continue;
      const verdict = inside(hierarchy, vertex, budget);
      if (verdict === null) {
        partial = true;
        if (budget.exhausted) break;
        continue;
      }
      if (!verdict) continue;
      penetrating++;
      if (distance > depth) depth = distance;
    }
    if (partial) evidence.pairsNotReached++;
    else evidence.pairsTested++;
    if (penetrating > 0)
      penetrations.push({
        open: candidate.open.name,
        solid: candidate.solid.name,
        depth: round(depth),
        vertices: penetrating,
        tested,
      });
  }
  evidence.truncated = evidence.truncated || evidence.pairsNotReached > 0;
  // Deepest first, then by name so equal-depth pairs keep a stable order.
  penetrations.sort(
    (x, y) => y.depth - x.depth || `${x.open}:${x.solid}`.localeCompare(`${y.open}:${y.solid}`),
  );
  evidence.penetrations = penetrations;
  return evidence;
}

// -----------------------------------------------------------------------------
// The rule
// -----------------------------------------------------------------------------

/** Names listed per skipped reason; the count covers the rest. */
const NAMES_SHOWN = 5;

const namedParts = (parts: readonly string[]): string => {
  const named = parts.slice(0, NAMES_SHOWN).map((part) => JSON.stringify(part));
  const more = parts.length > NAMES_SHOWN ? ` and ${parts.length - NAMES_SHOWN} more` : '';
  return `${named.join(', ')}${more}`;
};

/** Shared observation kernel; the measurement is derived by the engine, never asset metadata. */
export function inspectOpenSurfacePenetration(
  evidence?: OpenSurfacePenetrationEvidenceV1,
): readonly QaFinding[] {
  if (evidence?.schemaVersion !== 1) return [];
  const findings: QaFinding[] = evidence.penetrations.map((pair) => ({
    code: 'GEO_OPEN_SURFACE_PENETRATION',
    disposition: 'observe' as const,
    dimension: 'visualQuality' as const,
    profile: 'geometry.openSurfacePenetration',
    message:
      `Open surface ${JSON.stringify(pair.open)} reaches ${pair.depth.toFixed(4)} m inside solid ${JSON.stringify(pair.solid)}: ` +
      `${pair.vertices} of ${pair.tested} sampled ${pair.vertices === 1 ? 'vertex lies' : 'vertices lie'} deeper inside it than the ${evidence.contactTolerance} m contact tolerance.`,
    affected: { node: pair.open },
    measurement: {
      name: 'openSurfacePenetrationDepth',
      actual: pair.depth,
      expected: evidence.contactTolerance,
      unit: 'm',
      breakdown: { penetratingVertices: pair.vertices, sampledVertices: pair.tested },
    },
    repairText:
      "Check whether this is intended, such as a cloth tucked behind a panel. For an unintended crossing, move the surface clear or cut it back to the solid. Vertices are the samples, so a solid thinner than this surface's facet spacing can pass between two of them.",
  }));

  if (evidence.truncated) {
    findings.push({
      code: 'GEO_OPEN_SURFACE_PENETRATION_TRUNCATED',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.openSurfacePenetration',
      message:
        `Sampled ${evidence.pairsTested} of ${evidence.broadPhaseTruncated ? 'at least ' : ''}${evidence.candidatePairs} overlapping open-surface and solid pairs; ` +
        `${evidence.pairsNotReached} were beyond the ${MAX_WORK}-test analysis budget.` +
        (evidence.broadPhaseTruncated
          ? ` Pair discovery stopped after ${MAX_BROAD_PHASE_PAIRS} box comparisons.`
          : '') +
        ' Unsampled pairs were not examined; the most overlapping bounding boxes were sampled first.',
      measurement: {
        name: 'openSurfacePairsSampled',
        actual: evidence.pairsTested,
        expected: evidence.candidatePairs,
        breakdown: { pairsNotReached: evidence.pairsNotReached },
      },
    });
  }

  if (evidence.skipped.length) {
    // One line per reason: an asset with forty instanced parts needs the reason once.
    const byReason = new Map<string, string[]>();
    for (const { part, reason } of evidence.skipped) {
      const parts = byReason.get(reason);
      if (parts) parts.push(part);
      else byReason.set(reason, [part]);
    }
    const reasons = [...byReason].map(
      ([reason, parts]) => `${parts.length} because ${reason}: ${namedParts(parts)}.`,
    );
    const one = evidence.skipped.length === 1;
    findings.push({
      code: 'GEO_OPEN_SURFACE_PENETRATION_UNMEASURED',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.openSurfacePenetration',
      message:
        `${evidence.skipped.length} ${one ? 'part was' : 'parts were'} not sampled for open-surface penetration. ` +
        `${reasons.join(' ')} ${one ? 'This part is' : 'These parts are'} not certified clear of the solids around ${one ? 'it' : 'them'}.`,
    });
  }

  return findings;
}

/**
 * Report open surfaces that reach inside closed solids.
 *
 * `heuristic`, not `exact`, even though the depth is measured rather than
 * inferred: in this registry `exact` is a promotion contract that demands
 * `enforce` with frozen conformance evidence, and this rule has none yet.
 * Reclassify when a fixture set is frozen and promoted, never before.
 */
export const OPEN_SURFACE_PENETRATION_QA_RULE: QaRule = Object.freeze({
  id: 'GEO_OPEN_SURFACE_PENETRATION',
  profile: 'geometry.openSurfacePenetration',
  scope: { kind: 'universal' as const },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate(context: QaContext): readonly QaFinding[] {
    return inspectOpenSurfacePenetration(analyzeOpenSurfacePenetration(context.scene));
  },
});
