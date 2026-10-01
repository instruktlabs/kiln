/**
 * Bounded part-vs-part solid-overlap observation — T4.1
 *
 * ## Why intersection VOLUME, not triangle overlap
 *
 * The accept criterion demands true negatives for "intentional contact and
 * socketed parts", and that is what rules out the cheaper checks:
 *
 * - **Bounding boxes** call a bolt in a hole, a wheel in a wheel well, and a
 *   handle through a loop all intersecting. Every one is correct geometry.
 * - **Triangle overlap** cannot separate two parts that merely touch — a lid
 *   resting on a box, a wheel meeting the ground — from two parts occupying the
 *   same space. Contact is coplanar triangles; interpenetration is shared
 *   volume. A triangle test sees both as "they overlap".
 *
 * Boolean intersection volume distinguishes these fixtures: surfaces in
 * contact enclose zero volume, interpenetrating solids enclose a real one. That
 * is exactly the distinction the gate has to make, so it is measured directly
 * rather than inferred from bounding boxes. Numeric tolerance and representation
 * limits still apply; intentional joints can also share real volume.
 *
 * manifold-3d is already a dependency (`solids.ts`), so this costs no new
 * package and reuses the same watertight-solid machinery CSG runs on.
 *
 * ## Bounded time
 *
 * Booleans are expensive and pair count grows quadratically, so the pass is
 * staged:
 *
 * 1. **Broad phase** — world-space AABB overlap, capped at 250,000 pair checks.
 *    Rejects separated pairs for the price of six comparisons. Parts that do
 *    not share a bounding box cannot share volume. Parts on different LOD
 *    levels are alternates, not parts present together, and are not compared.
 * 2. **Narrow phase** — candidates are visited deepest box overlap first
 *    (overlap volume over the smaller box). Each part is built as a solid at
 *    most once, capped by {@link MAX_SOLID_BUILDS}; a pair with a part that
 *    cannot be built (an open shell) is unmeasurable and costs no boolean.
 *    Builds left once every pair is classified check the parts met only
 *    beside such a part, so open parts are named rather than left unexamined.
 *    Booleans are capped by {@link MAX_NARROW_PHASE_PAIRS}. Pairs either cap
 *    leaves unvisited are counted and reported in `truncated` instead of
 *    silently checking less than the analysis claims.
 *
 * Meshes are also capped at {@link MAX_PART_TRIANGLES}; above that a single
 * boolean stops being bounded-time in any useful sense. Skipped parts are
 * reported, never dropped quietly.
 *
 * ## Intentionally open shells
 *
 * A part the author marked with `markOpenShell` (on itself or an ancestor)
 * that cannot be built as a closed solid is listed in `acknowledged` with the
 * author's reason, not in `skipped`. Nothing else changes: it is still
 * attempted as a solid, a marked part that closes is measured like any other,
 * a mark covers no other reason to skip, and every pair it leaves unmeasured
 * is still counted. A mark states intent; it is never a measurement.
 *
 * ## Determinism
 *
 * Parts are collected in traversal order, candidates with equal box overlap
 * keep traversal pair order, volumes are rounded to a fixed precision, and
 * findings are sorted by name. The same scene yields the same report on every
 * run and every machine.
 */

import * as THREE from 'three';
import { openShellIntent } from '../open-shell';
import { lodMembership } from './lod';
import type { QaContext, QaFinding } from './types';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';

/** Above this, one boolean is no longer bounded-time in any useful sense. */
export const MAX_PART_TRIANGLES = 20000;
/** Narrow-phase boolean budget. Broad phase normally leaves far fewer than this. */
export const MAX_NARROW_PHASE_PAIRS = 64;
/** Solid-build budget: as many parts as the boolean budget could ever need. */
export const MAX_SOLID_BUILDS = 2 * MAX_NARROW_PHASE_PAIRS;
/** Bound normalization of merged, disconnected closed shells before measuring volume. */
export const MAX_SOLID_COMPONENTS = 32;
/** Bound pair discovery even when many boxes overlap. */
export const MAX_BROAD_PHASE_PAIRS = 250_000;
/**
 * Intersection volume below this fraction of the smaller part's volume is
 * treated as contact rather than penetration.
 *
 * Not zero: two parts snapped flush share a surface, and floating-point
 * evaluation of a boolean on coincident faces yields a sliver of volume rather
 * than exactly nothing. The threshold is a fraction rather than an absolute so
 * it means the same thing on a 2 cm bolt and a 20 m wall.
 */
export const CONTACT_VOLUME_FRACTION = 0.001;

export interface PartPenetrationPairV1 {
  a: string;
  b: string;
  /** Absolute intersection volume in cubic meters. */
  volume: number;
  /** Intersection volume over the smaller part's volume, 0..1. */
  fraction: number;
}

export interface PartPenetrationEvidenceV1 {
  schemaVersion: 1;
  source: 'engine-scene-analysis';
  /** Eligible mesh parts collected; not every part necessarily reaches a boolean. */
  partsAnalyzed: number;
  /**
   * Overlapping pairs found, excluding LOD alternates; a lower bound when
   * broadPhaseTruncated is true. Equals pairsTested + pairsUnmeasurable + pairsNotReached.
   */
  candidatePairs: number;
  /** Pair discovery itself exhausted its budget; later pairs were not considered. */
  broadPhaseTruncated?: boolean;
  /** Pairs a boolean was actually run on. */
  pairsTested: number;
  /** Candidate pairs with a part that could not be built as a closed solid. */
  pairsUnmeasurable: number;
  /**
   * Of pairsUnmeasurable, the pairs whose unbuildable parts are all acknowledged open shells.
   * Present only with `acknowledged`. Overlap in these pairs is not ruled out.
   */
  pairsUnmeasurableAcknowledged?: number;
  /** Candidate pairs left unvisited by the boolean or solid-build budget. */
  pairsNotReached: number;
  /** Overlapping pairs on different LOD levels: alternates, deliberately not compared. */
  pairsLodAlternates: number;
  /** True when pair discovery or the narrow-phase budgets left pairs unexamined. */
  truncated: boolean;
  /** Parts skipped, with the reason — never silently dropped. */
  skipped: { part: string; reason: string }[];
  /** Pairs whose shared volume exceeds the contact threshold, worst first. */
  penetrations: PartPenetrationPairV1[];
  /**
   * Parts marked with `markOpenShell` that could not be built as a closed solid, in traversal
   * order: `reason` is why, as in `skipped`; `intent` is the author's reason for the mark.
   * Present only when non-empty. These parts are not in `skipped`.
   */
  acknowledged?: { part: string; reason: string; intent: string }[];
}

interface AnalyzedPart {
  name: string;
  mesh: THREE.Mesh;
  box: THREE.Box3;
  triangles: number;
  center: THREE.Vector3;
  scale: number;
  /** Named sibling chain membership; independent chains can appear together. */
  lod: ReturnType<typeof lodMembership>;
  /** The author's `markOpenShell` reason on the part or an ancestor. */
  intent: string | undefined;
}

/** An overlapping pair, by traversal index, with its box overlap over the smaller box. */
interface CandidatePair {
  a: number;
  b: number;
  overlap: number;
}

const boxVolume = (box: THREE.Box3): number =>
  (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);

/** Shared box volume over the smaller box's volume, 0..1; 0 for flat boxes. */
function boxOverlapRatio(a: THREE.Box3, b: THREE.Box3): number {
  const shared =
    Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) *
    Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)) *
    Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  const ratio = shared / Math.min(boxVolume(a), boxVolume(b));
  return Number.isFinite(ratio) ? ratio : 0;
}

/** Fixed precision so a report is byte-comparable across runs. */
const round = (n: number): number => Math.round(n * 1e9) / 1e9;
// Absolute decimal rounding erased micron-scale positive volumes. Keep relative precision.
const roundVolume = (n: number): number => Number(n.toPrecision(9));

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return Math.floor((index ? index.count : position.count) / 3);
}

/**
 * Collect the meshes worth comparing, in traversal order.
 *
 * Only meshes with real geometry participate: a part with no triangles cannot
 * penetrate anything, and including it would produce a boolean on an empty
 * operand — which `solids.ts` now (correctly) throws on.
 */
function collectParts(
  root: THREE.Object3D,
  skipped: PartPenetrationEvidenceV1['skipped'],
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
        reason: 'instancing, skin or morph deformation is unsupported by part-volume analysis',
      });
      return;
    }
    const total = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
    const range = mesh.geometry.drawRange;
    if (range.start !== 0 || range.count < total) {
      skipped.push({
        part: name,
        reason: 'partial triangle draw ranges are unsupported by part-volume analysis',
      });
      return;
    }
    const triangles = triangleCount(mesh.geometry);
    if (triangles === 0) return;
    if (triangles > MAX_PART_TRIANGLES) {
      skipped.push({
        part: name,
        reason: `${triangles} triangles exceeds the ${MAX_PART_TRIANGLES}-triangle analysis budget`,
      });
      return;
    }
    // Bounds belong to this mesh, never its child meshes (which are independent parts).
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.max(size.x, size.y, size.z);
    if (
      ![...box.min, ...box.max, scale].every(Number.isFinite) ||
      !(scale > 0) ||
      !Number.isFinite(mesh.matrixWorld.determinant()) ||
      mesh.matrixWorld.determinant() === 0
    ) {
      skipped.push({
        part: name,
        reason: 'non-finite or collapsed transformed bounds cannot be measured',
      });
      return;
    }
    parts.push({
      name,
      mesh,
      box,
      triangles,
      center,
      scale,
      lod: lodMembership(mesh),
      intent: openShellIntent(mesh),
    });
  });

  return parts;
}

/**
 * Normalized triangle soup for one static mesh, as manifold wants it.
 *
 * Deliberately independent of `solids.ts`'s `threeToManifold`: that one walks a
 * whole Object3D and enforces CSG's stricter operand contract, whereas this
 * needs one already-located mesh and must tolerate geometry a QA pass should
 * report on rather than throw over.
 */
function meshToArrays(
  part: AnalyzedPart,
): { vertProperties: Float32Array; triVerts: Uint32Array } | null {
  const { mesh, center, scale } = part;
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (position?.itemSize !== 3) return null;

  // Translate before transforming vertices, then normalize before Float32 conversion.
  // Manifold solids are later placed in a shared pair frame using double transforms.
  const matrix = mesh.matrixWorld.clone();
  matrix.elements[12] -= center.x;
  matrix.elements[13] -= center.y;
  matrix.elements[14] -= center.z;
  const v = new THREE.Vector3();
  const verts = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    v.set(position.getX(i), position.getY(i), position.getZ(i))
      .applyMatrix4(matrix)
      .divideScalar(scale);
    if (![v.x, v.y, v.z].every((n) => Number.isFinite(Math.fround(n)))) return null;
    verts[i * 3] = v.x;
    verts[i * 3 + 1] = v.y;
    verts[i * 3 + 2] = v.z;
  }

  const index = geometry.getIndex();
  let tris: Uint32Array;
  if (index) {
    if (index.count % 3 !== 0) return null;
    tris = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) {
      const id = index.getX(i);
      if (!Number.isSafeInteger(id) || id < 0 || id >= position.count) return null;
      tris[i] = id;
    }
  } else {
    if (position.count % 3 !== 0) return null;
    tris = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) tris[i] = i;
  }
  if (mesh.matrixWorld.determinant() < 0)
    for (let i = 0; i < tris.length; i += 3)
      [tris[i + 1], tris[i + 2]] = [tris[i + 2]!, tris[i + 1]!];

  return { vertProperties: verts, triVerts: tris };
}

/**
 * Measure how much volume every pair of parts shares.
 *
 * Async because manifold is WASM and initializes on first use. The QA registry
 * evaluates rules synchronously, so this runs as a pre-pass and its result
 * travels to the rule through `QaContext.derivedEvidence` — the seam that
 * exists precisely for engine measurements a rule cannot take itself.
 */
export async function analyzePartPenetration(
  root: THREE.Object3D,
): Promise<PartPenetrationEvidenceV1> {
  const skipped: PartPenetrationEvidenceV1['skipped'] = [];
  const parts = collectParts(root, skipped);

  const base: PartPenetrationEvidenceV1 = {
    schemaVersion: 1,
    source: 'engine-scene-analysis',
    partsAnalyzed: parts.length,
    candidatePairs: 0,
    pairsTested: 0,
    pairsUnmeasurable: 0,
    pairsNotReached: 0,
    pairsLodAlternates: 0,
    truncated: false,
    skipped,
    penetrations: [],
  };
  if (parts.length < 2) return base;

  // Broad phase first, so an unwinnable scene never pays for WASM init.
  const candidates: CandidatePair[] = [];
  let considered = 0;
  broadPhase: for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (considered++ === MAX_BROAD_PHASE_PAIRS) {
        base.broadPhaseTruncated = true;
        break broadPhase;
      }
      const a = parts[i]!;
      const b = parts[j]!;
      if (!a.box.intersectsBox(b.box)) continue;
      if (
        a.lod &&
        b.lod &&
        a.lod.parent === b.lod.parent &&
        a.lod.stem === b.lod.stem &&
        a.lod.level !== b.lod.level
      ) {
        base.pairsLodAlternates++;
        continue;
      }
      candidates.push({ a: i, b: j, overlap: boxOverlapRatio(a.box, b.box) });
    }
  }
  base.candidatePairs = candidates.length;
  base.truncated = !!base.broadPhaseTruncated;
  if (candidates.length === 0) return base;
  // Deepest box overlap first: a small part buried in another's box is the likeliest
  // real overlap, a grazing contact the least. Ties keep traversal pair order.
  candidates.sort((x, y) => y.overlap - x.overlap || x.a - y.a || x.b - y.b);

  const Module = await import('manifold-3d');
  const wasm = await Module.default();
  wasm.setup();
  const { Manifold, Mesh } = wasm;

  // Each part is built once. `null` records a part that cannot be a closed solid, so
  // every later pair with it is unmeasurable without spending the boolean budget.
  const solids = new Map<number, InstanceType<typeof Manifold> | null>();
  // `open`: manifold could not close the part, the one failure a mark acknowledges.
  const unbuildable: { index: number; reason: string; open: boolean }[] = [];
  const build = (index: number): InstanceType<typeof Manifold> | null | undefined => {
    if (solids.has(index)) return solids.get(index)!;
    if (solids.size === MAX_SOLID_BUILDS) return undefined;
    const part = parts[index]!;
    let solid: InstanceType<typeof Manifold> | null = null;
    try {
      const arrays = meshToArrays(part);
      if (arrays) {
        const mesh = new Mesh({ numProp: 3, ...arrays });
        // Three's primitives split vertices at UV/normal seams — a BoxGeometry
        // has 24 positions for 8 corners — and manifold reads that as an open
        // surface ("Not manifold"). merge() welds coincident positions, which
        // is the same step `solids.ts` takes before every CSG operand.
        mesh.merge();
        solid = new Manifold(mesh);
        const components = solid.decompose();
        try {
          if (
            components.length > MAX_SOLID_COMPONENTS ||
            components.some((part) => part.volume() <= 0)
          ) {
            unbuildable.push({
              index,
              reason:
                'compound solid exceeds the component budget or contains an unsupported inward shell',
              open: false,
            });
            solid.delete();
            solid = null;
          } else if (components.length > 1) {
            // Concatenating closed meshes does not take their union: intersections can
            // double-count their overlapping interiors and exceed an operand's volume.
            const union = Manifold.union(components);
            solid.delete();
            solid = union;
          }
        } finally {
          for (const component of components) component.delete();
        }
      } else {
        unbuildable.push({
          index,
          reason: 'its triangle positions or indices are invalid',
          open: false,
        });
      }
    } catch (err) {
      // Failure to build a closed solid is unmeasured, never evidence of no intersection.
      unbuildable.push({
        index,
        reason: `a valid closed solid could not be measured (${err instanceof Error ? err.message : String(err)})`,
        open: true,
      });
      solid?.delete();
      solid = null;
    }
    solids.set(index, solid);
    return solid;
  };

  const penetrations: PartPenetrationPairV1[] = [];
  const rangeSkips: PartPenetrationEvidenceV1['skipped'] = [];
  const unmeasured: CandidatePair[] = [];
  try {
    for (const pair of candidates) {
      if (solids.get(pair.a) === null || solids.get(pair.b) === null) {
        base.pairsUnmeasurable++;
        unmeasured.push(pair);
        continue;
      }
      // Building also classifies parts past the boolean budget, within the build budget,
      // so every open part the candidates reach is named rather than left unexamined.
      const sa = build(pair.a);
      const sb = sa === null ? null : build(pair.b);
      if (sa === null || sb === null) {
        base.pairsUnmeasurable++;
        unmeasured.push(pair);
        continue;
      }
      if (!sa || !sb || base.pairsTested === MAX_NARROW_PHASE_PAIRS) {
        base.pairsNotReached++;
        continue;
      }
      base.pairsTested++;
      const a = parts[pair.a]!;
      const b = parts[pair.b]!;

      let overlap: InstanceType<typeof Manifold> | null = null;
      const scale = Math.max(a.scale, b.scale);
      const pa = sa.scale(a.scale / scale);
      const scaledB = sb.scale(b.scale / scale);
      const pb = scaledB.translate(b.center.clone().sub(a.center).divideScalar(scale).toArray());
      try {
        overlap = Manifold.intersection(pa, pb);
        const volume = overlap.volume();
        if (volume > 0) {
          const smaller = Math.min(Math.abs(pa.volume()), Math.abs(pb.volume()));
          const fraction = smaller > 0 ? volume / smaller : 0;
          if (fraction > CONTACT_VOLUME_FRACTION) {
            const assetVolume = volume * scale ** 3;
            if (!Number.isFinite(assetVolume) || !(assetVolume > 0)) {
              rangeSkips.push({
                part: a.name,
                reason: `intersection with ${JSON.stringify(b.name)} is outside representable volume range`,
              });
              continue;
            }
            penetrations.push({
              a: a.name,
              b: b.name,
              volume: roundVolume(assetVolume),
              fraction: round(fraction),
            });
          }
        }
      } finally {
        overlap?.delete();
        pa.delete();
        pb.delete();
        scaledB.delete();
      }
    }
    // A part met only beside partners already known to be unbuildable was never built.
    // Measurable pairs had the build budget first; what remains classifies these parts,
    // so an open part is named even when its partner already made the pair unmeasurable.
    for (const pair of candidates) {
      if (solids.get(pair.a) === null) build(pair.b);
      else if (solids.get(pair.b) === null) build(pair.a);
    }
  } finally {
    for (const solid of solids.values()) solid?.delete();
  }
  base.truncated = !!base.broadPhaseTruncated || base.pairsNotReached > 0;
  // Unbuildable parts are reported in traversal order, whatever order reached them. An open
  // part the author marked is acknowledged with the mark's reason; every other one is skipped.
  unbuildable.sort((x, y) => x.index - y.index);
  const acknowledged: NonNullable<PartPenetrationEvidenceV1['acknowledged']> = [];
  const acknowledgedIndices = new Set<number>();
  for (const { index, reason, open } of unbuildable) {
    const part = parts[index]!;
    if (open && part.intent !== undefined) {
      acknowledged.push({ part: part.name, reason, intent: part.intent });
      acknowledgedIndices.add(index);
    } else skipped.push({ part: part.name, reason });
  }
  skipped.push(...rangeSkips);
  if (acknowledged.length) {
    base.acknowledged = acknowledged;
    // A pair is acknowledged only when every part that left it unmeasured is acknowledged.
    base.pairsUnmeasurableAcknowledged = unmeasured.filter((pair) =>
      [pair.a, pair.b]
        .filter((index) => solids.get(index) === null)
        .every((index) => acknowledgedIndices.has(index)),
    ).length;
  }

  // Worst first, then by name so equal-volume pairs keep a stable order.
  penetrations.sort(
    (x, y) => y.fraction - x.fraction || `${x.a}:${x.b}`.localeCompare(`${y.a}:${y.b}`),
  );
  base.penetrations = penetrations;
  return base;
}

// -----------------------------------------------------------------------------
// The rule
// -----------------------------------------------------------------------------

function readEvidence(context: {
  derivedEvidence?: Record<string, unknown>;
}): PartPenetrationEvidenceV1 | undefined {
  const evidence = context.derivedEvidence?.['partPenetration'] as
    | PartPenetrationEvidenceV1
    | undefined;
  return evidence?.schemaVersion === 1 ? evidence : undefined;
}

/**
 * Report parts that occupy the same space.
 *
 * Starts in `observe` as the plan requires: it has no promotion evidence yet,
 * and the registry will not let an unpromoted rule warn or block regardless.
 */
export const SELF_INTERSECTION_QA_RULE: QaRule = Object.freeze({
  id: 'GEO_PART_SELF_INTERSECTION',
  profile: 'geometry.selfIntersection',
  scope: { kind: 'universal' as const },
  // 'heuristic', not 'exact', even though the measurement IS exact — a boolean
  // volume, not a proxy for one. In this registry `exact` is a promotion
  // contract, not a statement about the arithmetic: every `exact` rule must sit
  // in `enforce` with frozen conformance evidence, and the registry test
  // enforces that. A rule with no evidence yet is `heuristic` regardless of how
  // precise its measurement is. Reclassify to `exact` at the same time as
  // freezing a fixture set and promoting, never before.
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate(context: QaContext): readonly QaFinding[] {
    return inspectPartPenetration(readEvidence(context));
  },
});

/** Names listed per unmeasured reason; the count covers the rest. */
const UNMEASURED_NAMES_SHOWN = 5;
/** Author reasons listed for acknowledged open shells; the count covers the rest. */
const ACKNOWLEDGED_REASONS_SHOWN = 5;

/** `"A", "B" and 3 more` for the first names of a group. */
const namedParts = (parts: readonly string[]): string => {
  const named = parts.slice(0, UNMEASURED_NAMES_SHOWN).map((part) => JSON.stringify(part));
  const more =
    parts.length > UNMEASURED_NAMES_SHOWN
      ? ` and ${parts.length - UNMEASURED_NAMES_SHOWN} more`
      : '';
  return `${named.join(', ')}${more}`;
};

/**
 * Open shells the author marked: one line per mark reason and build failure, the author's words
 * quoted, and the pairs left unmeasured because of these parts alone. Overlap there stays open.
 */
function acknowledgedFinding(
  acknowledged: NonNullable<PartPenetrationEvidenceV1['acknowledged']>,
  pairs: number,
): QaFinding {
  const groups = new Map<string, { intent: string; reason: string; parts: string[] }>();
  for (const { part, reason, intent } of acknowledged) {
    const key = JSON.stringify([intent, reason]);
    const group = groups.get(key);
    if (group) group.parts.push(part);
    else groups.set(key, { intent, reason, parts: [part] });
  }
  const listed = [...groups.values()];
  const shown = listed.slice(0, ACKNOWLEDGED_REASONS_SHOWN);
  const lines = shown.map(
    ({ intent, reason, parts }) =>
      `${parts.length} marked ${JSON.stringify(intent)}, because ${reason}: ${namedParts(parts)}.`,
  );
  const rest = listed.slice(ACKNOWLEDGED_REASONS_SHOWN);
  if (rest.length) {
    const count = rest.reduce((sum, group) => sum + group.parts.length, 0);
    lines.push(
      `${count} more ${count === 1 ? 'part' : 'parts'} marked with ${rest.length} other ${rest.length === 1 ? 'reason' : 'reasons'}.`,
    );
  }
  const one = acknowledged.length === 1;
  const which = one ? 'this part' : 'these parts';
  const pairText =
    pairs === 1
      ? ` 1 overlapping part pair was not measured because of ${which} alone; overlap there is not ruled out.`
      : pairs > 1
        ? ` ${pairs} overlapping part pairs were not measured because of ${which} alone; overlap there is not ruled out.`
        : '';
  return {
    code: 'GEO_PART_SELF_INTERSECTION_ACKNOWLEDGED',
    disposition: 'observe' as const,
    dimension: 'visualQuality' as const,
    profile: 'geometry.selfIntersection',
    message:
      `${acknowledged.length} ${one ? 'part' : 'parts'} marked intentionally open (markOpenShell) ${one ? 'was' : 'were'} not measured as ${one ? 'a closed solid' : 'closed solids'}. ` +
      `${lines.join(' ')}${pairText}`,
    measurement: {
      name: 'acknowledgedOpenShells',
      actual: acknowledged.length,
      breakdown: { pairsUnmeasurable: pairs },
    },
  };
}

/** Shared observation kernel; the measurement is derived by the engine, never asset metadata. */
export function inspectPartPenetration(evidence?: PartPenetrationEvidenceV1): readonly QaFinding[] {
  if (!evidence) return [];

  const findings: QaFinding[] = evidence.penetrations.map((pair) => ({
    code: 'GEO_PART_SELF_INTERSECTION',
    disposition: 'observe' as const,
    dimension: 'visualQuality' as const,
    profile: 'geometry.selfIntersection',
    message: `Parts ${JSON.stringify(pair.a)} and ${JSON.stringify(pair.b)} occupy the same space: they share ${pair.volume.toPrecision(3)} m³, which is ${(pair.fraction * 100).toFixed(1)}% of the smaller part.`,
    affected: { node: pair.a },
    measurement: {
      name: 'intersectionVolumeFraction',
      actual: pair.fraction,
      expected: CONTACT_VOLUME_FRACTION,
    },
    repairText:
      'Check whether this overlap is intentional, such as a joined beam or embedded detail. For unintended solid overlap, move a part or use boolDiff to cut clearance. This observation does not test intersections within a single mesh, open surfaces, empty passage space or motion.',
  }));

  const pairsUnmeasurable = evidence.pairsUnmeasurable ?? 0;
  const acknowledged = evidence.acknowledged ?? [];
  const pairsAcknowledged = acknowledged.length
    ? Math.min(evidence.pairsUnmeasurableAcknowledged ?? 0, pairsUnmeasurable)
    : 0;
  if (evidence.truncated) {
    const pairsNotReached = evidence.pairsNotReached ?? 0;
    findings.push({
      code: 'GEO_PART_SELF_INTERSECTION_TRUNCATED',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.selfIntersection',
      message:
        `Tested ${evidence.pairsTested} of ${evidence.broadPhaseTruncated ? 'at least ' : ''}${evidence.candidatePairs} overlapping part pairs: ` +
        `${pairsUnmeasurable} involve parts that could not be measured, ${pairsNotReached} were beyond the analysis budget (${MAX_NARROW_PHASE_PAIRS} booleans, ${MAX_SOLID_BUILDS} solids).` +
        (evidence.broadPhaseTruncated
          ? ` Pair discovery stopped after ${MAX_BROAD_PHASE_PAIRS} box comparisons.`
          : '') +
        ' Unreached pairs were not examined; the most overlapping bounding boxes were tested first.',
      measurement: {
        name: 'overlappingPartPairsTested',
        actual: evidence.pairsTested,
        expected: evidence.candidatePairs,
        breakdown: { pairsUnmeasurable, pairsNotReached },
      },
    });
  }
  if (evidence.skipped.length) {
    // One line per reason: an asset with forty open shells needs the reason once, not forty times.
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
    const includes = one ? 'this part' : 'one of these parts';
    // Pairs left unmeasured only by acknowledged open shells are counted with those.
    const unmarked = pairsUnmeasurable - pairsAcknowledged;
    const pairs =
      unmarked === 1
        ? ` 1 overlapping part pair includes ${includes} and was not measured.`
        : unmarked > 1
          ? ` ${unmarked} overlapping part pairs include ${includes} and were not measured.`
          : '';
    findings.push({
      code: 'GEO_PART_SELF_INTERSECTION_UNMEASURED',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.selfIntersection',
      message: `${evidence.skipped.length} part-volume ${one ? 'measurement was' : 'measurements were'} unavailable. ${reasons.join(' ')}${pairs} ${one ? 'This part is' : 'These parts are'} not certified clear.`,
    });
  }
  if (acknowledged.length) findings.push(acknowledgedFinding(acknowledged, pairsAcknowledged));

  return findings;
}
