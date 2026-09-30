/**
 * Part-connectivity gate — T4.2
 *
 * ## What this adds over the existing floating-parts warning
 *
 * `inspectSceneStructure` (`render.ts`) already reports a part with no
 * neighbour: for each mesh, does any sibling's box come within 2 cm? That is
 * **pairwise adjacency**, and it misses the case the plan actually names —
 * a *disconnected component*. Three parts that touch each other but float as a
 * cluster away from the body each have a neighbour, so every one passes the
 * pairwise test while the group as a whole is detached.
 *
 * This rule builds the adjacency graph and finds its connected components.
 * Anything not in the largest component is reported, with the parts it is
 * adjacent to. These are bounding-box components, not proof that every part
 * should be attached or that overlapping boxes establish physical contact.
 *
 * ## Exemptions
 *
 * Some parts are legitimately separate and always will be:
 *
 * - **Foliage cards and decals** are meant to sit off the surface.
 * - **Joint pivots** carry no geometry and never participate.
 *
 * Foliage/decal exemptions are historical name heuristics, not semantic role
 * validation. No category or label selects this observation. Renaming geometry
 * does not establish an attachment or justify changing the authored asset.
 *
 * ## Cost
 *
 * Pure AABB work: O(n²) box comparisons to build the graph, then a linear
 * flood fill. No booleans, no WASM, so unlike T4.1 this runs inside the
 * synchronous rule with no pre-pass.
 */

import * as THREE from 'three';
import { lodLevel } from './lod';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

/**
 * Adjacency tolerance, matching the existing floating-parts warning so the two
 * never disagree about whether two parts touch.
 */
export const CONNECTIVITY_TOLERANCE = 0.02;

/**
 * Names that are expected to stand apart from the body.
 *
 * Matched against the mesh name, which Kiln's own helpers control (`createPart`
 * prefixes `Mesh_`, `createPivot` prefixes `Joint_`), so this keys off declared
 * structure rather than inferred shape.
 */
const EXEMPT_NAME = /(?:^|_)(?:leaf|leaves|foliage|frond|card|decal|billboard|petal)/i;

interface ConnectivityPart {
  name: string;
  box: THREE.Box3;
}

export interface DisconnectedGroupV1 {
  /** Parts in this component, in traversal order. */
  parts: string[];
  /** Shortest distance from this component to the main one, in meters. */
  gap: number;
}

export interface PartConnectivityReportV1 {
  partsAnalyzed: number;
  /** Size of the largest bounding-box component; not a required attachment target. */
  mainComponentSize: number;
  exempt: string[];
  /** Visible meshes on LOD levels above 0: alternates of the analyzed parts, left out. */
  lodExcluded: number;
  groups: DisconnectedGroupV1[];
}

/**
 * Visible meshes only, matching the part-volume observation: a hidden proxy or spare is
 * not part of what is shown. LOD levels above 0 are alternates of level 0 rather than
 * parts shown with it, so they are counted and left out instead of forming groups.
 */
function collectParts(
  root: THREE.Object3D,
  exempt: string[],
): { parts: ConnectivityPart[]; lodExcluded: number } {
  const parts: ConnectivityPart[] = [];
  let lodExcluded = 0;
  root.updateWorldMatrix(true, true);
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const name = mesh.name || '(unnamed mesh)';
    if ((lodLevel(mesh) ?? 0) > 0) {
      lodExcluded++;
      return;
    }
    if (EXEMPT_NAME.test(name)) {
      exempt.push(name);
      return;
    }
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    parts.push({ name, box });
  });
  return { parts, lodExcluded };
}

/** Shortest distance between two boxes; 0 when they touch or overlap. */
function boxGap(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
  return Math.hypot(dx, dy, dz);
}

/**
 * Group parts into connected components by box adjacency.
 *
 * Exported for testing and for anything that wants the structure rather than
 * the finding.
 */
export function analyzePartConnectivity(root: THREE.Object3D): PartConnectivityReportV1 {
  const exempt: string[] = [];
  const { parts, lodExcluded } = collectParts(root, exempt);
  const report: PartConnectivityReportV1 = {
    partsAnalyzed: parts.length,
    mainComponentSize: parts.length,
    exempt,
    lodExcluded,
    groups: [],
  };
  if (parts.length < 2) return report;

  const adjacency: number[][] = parts.map(() => []);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (boxGap(parts[i]!.box, parts[j]!.box) <= CONNECTIVITY_TOLERANCE) {
        adjacency[i]!.push(j);
        adjacency[j]!.push(i);
      }
    }
  }

  const component = new Int32Array(parts.length).fill(-1);
  const components: number[][] = [];
  for (let seed = 0; seed < parts.length; seed++) {
    if (component[seed] !== -1) continue;
    const id = components.length;
    const members: number[] = [];
    const stack = [seed];
    component[seed] = id;
    while (stack.length > 0) {
      const current = stack.pop()!;
      members.push(current);
      for (const next of adjacency[current]!) {
        if (component[next] === -1) {
          component[next] = id;
          stack.push(next);
        }
      }
    }
    members.sort((x, y) => x - y);
    components.push(members);
  }

  if (components.length < 2) return report;

  // The main body is the largest component; ties break on the earliest part in
  // traversal order, so the choice is deterministic rather than incidental.
  let mainIndex = 0;
  for (let i = 1; i < components.length; i++) {
    const bigger = components[i]!.length > components[mainIndex]!.length;
    const tie =
      components[i]!.length === components[mainIndex]!.length &&
      components[i]![0]! < components[mainIndex]![0]!;
    if (bigger || tie) mainIndex = i;
  }
  const main = components[mainIndex]!;
  report.mainComponentSize = main.length;

  for (const [index, members] of components.entries()) {
    if (index === mainIndex) continue;
    let gap = Number.POSITIVE_INFINITY;
    for (const m of members) {
      for (const b of main) {
        gap = Math.min(gap, boxGap(parts[m]!.box, parts[b]!.box));
      }
    }
    report.groups.push({
      parts: members.map((m) => parts[m]!.name),
      gap: Math.round(gap * 1e6) / 1e6,
    });
  }

  // Largest detached group first — the biggest missing join is the one to fix.
  report.groups.sort((a, b) => b.parts.length - a.parts.length || a.gap - b.gap);
  return report;
}

/**
 * Report subassemblies that are not attached to the body.
 *
 * `observe` with no promotion evidence, per the plan and the registry's rule:
 * `exact` is reserved for rules already enforcing on frozen conformance
 * evidence, so a new gate is `heuristic` however precise its arithmetic.
 */
export function inspectPartConnectivity(scene: unknown): readonly QaFinding[] {
  if (!(scene instanceof THREE.Object3D)) return [];
  const report = analyzePartConnectivity(scene);
  const lodNote =
    report.lodExcluded === 1
      ? ' 1 part on an LOD level above 0 was not analyzed.'
      : report.lodExcluded > 1
        ? ` ${report.lodExcluded} parts on LOD levels above 0 were not analyzed.`
        : '';
  return report.groups.map((group) => {
    const listed = group.parts.map((p) => JSON.stringify(p)).join(', ');
    const subject =
      group.parts.length === 1
        ? `Part ${listed} is`
        : `A group of ${group.parts.length} parts (${listed}) is`;
    return {
      code: 'GEO_PART_CONNECTIVITY',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.partConnectivity',
      message: `${subject} separate from the largest component in the rest-pose bounding boxes of visible parts; the nearest box gap is ${group.gap.toFixed(3)} m. This may be intentional. Box adjacency is not physical attachment evidence.${lodNote}`,
      affected: { node: group.parts[0]! },
      measurement: {
        name: 'gapToMainComponent',
        actual: group.gap,
        expected: CONNECTIVITY_TOLERANCE,
        ...(report.lodExcluded ? { breakdown: { lodExcludedParts: report.lodExcluded } } : {}),
      },
      repairText:
        'Check whether the separation is intentional. If the brief requires attachment, inspect the named group and its intended interface before moving it. snapTo aligns bounding boxes; verify actual surfaces and required clearances afterward.',
    };
  });
}

export const PART_CONNECTIVITY_QA_RULE: QaRule = Object.freeze({
  id: 'GEO_PART_CONNECTIVITY',
  profile: 'geometry.partConnectivity',
  scope: { kind: 'universal' as const },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate(context: QaContext): readonly QaFinding[] {
    return inspectPartConnectivity(context.scene);
  },
});
