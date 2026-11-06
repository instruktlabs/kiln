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
 * A mesh holding several welded components enters the graph once per component
 * (`mesh-components.ts`, #304), so a primitive merged into another is compared
 * with the rest rather than hidden inside one box.
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
 * AABB work: O(n²) box comparisons to build the graph, then a linear flood
 * fill, after one bounded vertex walk per geometry to split welded components.
 * No booleans, no WASM, so unlike T4.1 this runs inside the synchronous rule
 * with no pre-pass.
 */

import * as THREE from 'three';
import { type ExternalSupportV1, restingSupport } from '../external-support';
import { lodLevel } from './lod';
import {
  meshComponentBoxes,
  type SplitBudget,
  splitBudget,
  STANDS_APART_NAME,
} from './mesh-components';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

/**
 * Adjacency tolerance, matching the existing floating-parts warning so the two
 * never disagree about whether two parts touch.
 */
export const CONNECTIVITY_TOLERANCE = 0.02;

const MAX_LISTED_PARTS = 12;

interface ConnectivityPart {
  name: string;
  /** The scene node: `name` itself, unless this is one welded component of it. */
  node: string;
  /** Component count of the mesh, for a welded component. */
  weldedOf?: number;
  box: THREE.Box3;
  /** The requirements-declared external support this part's bottom meets, if any. */
  support?: ExternalSupportV1;
}

export interface DisconnectedGroupV1 {
  /** Parts in this component, in traversal order. */
  parts: string[];
  /** The scene node of the first part; a welded component's name is not a node. */
  node: string;
  /** Shortest distance from this component to the main one, in meters. */
  gap: number;
  /** Present when every part rests on a requirements-declared external support. */
  externalSupport?: { planeY: number; bottomY: number; tolerance: number };
  /** Present when every part is a welded component of one mesh; these collapse to one group. */
  welded?: {
    mesh: string;
    /** How many components the mesh holds; `parts.length` of them are detached. */
    components: number;
    detached: ComponentLocationV1;
    nearest: ComponentLocationV1;
  };
}

/** Where a part sits, so a component inside one node can be found without selecting it. */
export interface ComponentLocationV1 {
  part: string;
  min: [number, number, number];
  max: [number, number, number];
}

export interface PartConnectivityReportV1 {
  partsAnalyzed: number;
  /** Size of the largest bounding-box component; not a required attachment target. */
  mainComponentSize: number;
  exempt: string[];
  /** Visible meshes on LOD levels above 0: alternates of the analyzed parts, left out. */
  lodExcluded: number;
  /** Meshes over a split budget, measured as one box; welded parts in them stay unseen. */
  unsplit: string[];
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
  budget: SplitBudget,
  supports?: readonly ExternalSupportV1[],
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
    if (STANDS_APART_NAME.test(name)) {
      exempt.push(name);
      return;
    }
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const components = meshComponentBoxes(mesh, budget);
    if (components && components.length > 1) {
      for (const [index, piece] of components.entries()) {
        const support = restingSupport(mesh, piece.min.y, supports);
        parts.push({
          name: `${name} (welded component ${index + 1} of ${components.length})`,
          node: name,
          weldedOf: components.length,
          box: piece,
          ...(support ? { support } : {}),
        });
      }
      return;
    }
    const support = restingSupport(mesh, box.min.y, supports);
    parts.push({ name, node: name, box, ...(support ? { support } : {}) });
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

const rounded = (v: THREE.Vector3): [number, number, number] => [
  Math.round(v.x * 1e4) / 1e4,
  Math.round(v.y * 1e4) / 1e4,
  Math.round(v.z * 1e4) / 1e4,
];
const locationOf = (part: ConnectivityPart): ComponentLocationV1 => ({
  part: part.name,
  min: rounded(part.box.min),
  max: rounded(part.box.max),
});

/**
 * One mesh with forty loose components is one thing to look at, not forty findings. Its
 * groups become one, keeping the location of the component nearest the body.
 */
function collapseWeldedGroups(groups: DisconnectedGroupV1[]): DisconnectedGroupV1[] {
  const byMesh = new Map<string, DisconnectedGroupV1>();
  const out: DisconnectedGroupV1[] = [];
  for (const group of groups) {
    const mesh = group.welded?.mesh;
    const first = mesh === undefined ? undefined : byMesh.get(mesh);
    if (mesh === undefined) out.push(group);
    else if (!first) {
      byMesh.set(mesh, group);
      out.push(group);
    } else {
      first.parts.push(...group.parts);
      if (group.gap < first.gap) {
        first.gap = group.gap;
        first.welded = group.welded;
      }
    }
  }
  return out;
}

/**
 * Group parts into connected components by box adjacency.
 *
 * Exported for testing and for anything that wants the structure rather than
 * the finding.
 */
export function analyzePartConnectivity(
  root: THREE.Object3D,
  supports?: readonly ExternalSupportV1[],
): PartConnectivityReportV1 {
  const exempt: string[] = [];
  const budget = splitBudget();
  const { parts, lodExcluded } = collectParts(root, exempt, budget, supports);
  const report: PartConnectivityReportV1 = {
    partsAnalyzed: parts.length,
    mainComponentSize: parts.length,
    exempt,
    lodExcluded,
    unsplit: budget.unsplit,
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
    let nearestMember = members[0]!;
    let nearestMain = main[0]!;
    for (const m of members) {
      for (const b of main) {
        const between = boxGap(parts[m]!.box, parts[b]!.box);
        if (between < gap) {
          gap = between;
          nearestMember = m;
          nearestMain = b;
        }
      }
    }
    const node = parts[members[0]!]!.node;
    const welded = members.every((m) => parts[m]!.weldedOf && parts[m]!.node === node);
    // The lowest part names the plane the group rests on when all of it is declared.
    const lowest = members.reduce((a, b) => (parts[b]!.box.min.y < parts[a]!.box.min.y ? b : a));
    const support = parts[lowest]!.support;
    report.groups.push({
      parts: members.map((m) => parts[m]!.name),
      node,
      gap: Math.round(gap * 1e6) / 1e6,
      ...(support && members.every((m) => parts[m]!.support)
        ? {
            externalSupport: {
              planeY: support.planeY,
              bottomY: Math.round(parts[lowest]!.box.min.y * 1e6) / 1e6,
              tolerance: support.tolerance ?? CONNECTIVITY_TOLERANCE,
            },
          }
        : welded
          ? {
              welded: {
                mesh: node,
                components: parts[members[0]!]!.weldedOf!,
                detached: locationOf(parts[nearestMember]!),
                nearest: locationOf(parts[nearestMain]!),
              },
            }
          : {}),
    });
  }
  report.groups = collapseWeldedGroups(report.groups);

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
export function inspectPartConnectivity(
  scene: unknown,
  supports?: readonly ExternalSupportV1[],
): readonly QaFinding[] {
  if (!(scene instanceof THREE.Object3D)) return [];
  const report = analyzePartConnectivity(scene, supports);
  const lodNote =
    report.lodExcluded === 1
      ? ' 1 part on an LOD level above 0 was not analyzed.'
      : report.lodExcluded > 1
        ? ` ${report.lodExcluded} parts on LOD levels above 0 were not analyzed.`
        : '';
  const unsplitNote = report.unsplit.length
    ? ` Over the split budget, so measured as one box: ${report.unsplit
        .slice(0, 5)
        .map((mesh) => JSON.stringify(mesh))
        .join(', ')}${report.unsplit.length > 5 ? ` and ${report.unsplit.length - 5} more` : ''}.`
    : '';
  return report.groups.map((group) => {
    // Splitting welded meshes makes groups of a hundred parts ordinary; the count says the rest.
    const named = group.parts.slice(0, MAX_LISTED_PARTS).map((p) => JSON.stringify(p));
    const unnamed = group.parts.length - named.length;
    const listed = `${named.join(', ')}${unnamed > 0 ? `, +${unnamed} more` : ''}`;
    const subject =
      group.parts.length === 1
        ? `Part ${listed} is`
        : `A group of ${group.parts.length} parts (${listed}) is`;
    const declared = group.externalSupport;
    if (declared)
      return {
        code: 'GEO_PART_EXTERNAL_SUPPORT',
        disposition: 'observe' as const,
        dimension: 'visualQuality' as const,
        profile: 'geometry.partConnectivity',
        message: `${subject} separate from the largest component and rests on the support declared in requirements.externalSupport at Y=${declared.planeY.toFixed(3)} m (bottom at Y=${declared.bottomY.toFixed(3)} m). Information only: the support is composed outside this asset.${lodNote}`,
        affected: { node: group.node },
        measurement: {
          name: 'bottomToSupportPlane',
          actual: declared.bottomY,
          expected: declared.planeY,
          threshold: declared.tolerance,
        },
        repairText:
          'No change is needed for a declared support. Remove the part from requirements.externalSupport if it should attach within this asset.',
      };
    if (group.welded) {
      const { mesh, components, detached, nearest } = group.welded;
      const span = ({ min, max }: ComponentLocationV1) =>
        `[${min.join(', ')}] to [${max.join(', ')}]`;
      return {
        code: 'GEO_PART_CONNECTIVITY',
        disposition: 'observe' as const,
        dimension: 'visualQuality' as const,
        profile: 'geometry.partConnectivity',
        message: `Mesh ${JSON.stringify(mesh)} is one drawn part, but ${group.parts.length} of its ${components} welded components ${group.parts.length === 1 ? 'is' : 'are'} separate from the largest component in the rest-pose bounding boxes of visible parts; the nearest box gap is ${group.gap.toFixed(3)} m. Nearest detached: ${span(detached)}. It is nearest to ${JSON.stringify(nearest.part)} at ${span(nearest)}. This may be intentional. Box adjacency is not physical attachment evidence: a gap under ${CONNECTIVITY_TOLERANCE} m reads as contact.${lodNote}${unsplitNote}`,
        affected: { node: mesh },
        measurement: {
          name: 'gapToMainComponent',
          actual: group.gap,
          expected: CONNECTIVITY_TOLERANCE,
          breakdown: {
            weldedComponents: components,
            detachedComponents: group.parts.length,
            ...(report.lodExcluded ? { lodExcludedParts: report.lodExcluded } : {}),
          },
        },
        repairText:
          'Check whether the separation is intentional. One mesh moves and hides as one, so a component meant to attach needs its gap closed in the merged geometry; one meant to stand apart reads better as its own part.',
      };
    }
    return {
      code: 'GEO_PART_CONNECTIVITY',
      disposition: 'observe' as const,
      dimension: 'visualQuality' as const,
      profile: 'geometry.partConnectivity',
      message: `${subject} separate from the largest component in the rest-pose bounding boxes of visible parts; the nearest box gap is ${group.gap.toFixed(3)} m. This may be intentional. Box adjacency is not physical attachment evidence: a gap under ${CONNECTIVITY_TOLERANCE} m reads as contact.${lodNote}${unsplitNote}`,
      affected: { node: group.node },
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
