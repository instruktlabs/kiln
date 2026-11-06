/**
 * Project modules measured against each other where they actually sit — #277
 *
 * ## Why this runs on the host
 *
 * The pack this exists for shipped a cloth through a neighbouring module's wall. Each
 * module passed its own QA because neither one contained both parts, and composing them
 * needs the sibling GLBs. The evaluator is isolated and has no filesystem, and `QaContext`
 * stays image-free, so this is not a QA rule: the host reads the exact pinned revisions a
 * project declares, composes them, and runs the same two measurements over the result.
 *
 * ## Declared, never inferred
 *
 * Only an inventory item that states a `placement` takes part. A missing placement means
 * "not composed", not identity: identity would report every unrelated prop in a pack as
 * overlapping at the origin. Nothing here looks at nearby projects, names or collections.
 *
 * ## Only cross-module pairs
 *
 * Overlaps inside one module are already reported by that module's own QA, and a module
 * can hold more of them than a pass has budget for. So within-module pairs are filtered
 * before they spend any budget, rather than measured and discarded afterwards.
 *
 * ## Unmeasured is not clear
 *
 * A sibling that could not be read is named as unmeasured and makes coverage `partial`.
 * A positive is a measurement rather than a verdict, exactly as in the two passes: a
 * fitting socketed into a neighbour's shell is reported as a bolt in a hole is.
 */

import * as THREE from 'three';
import type { AssetLibrary } from './assets';
import type { InventoryPlacement, ProjectRevision } from './projects';
import { lodLevel } from './qa/lod';
import { analyzeOpenSurfacePenetration } from './qa/open-surface-penetration';
import { analyzePartPenetration } from './qa/self-intersection';
import { loadGlbReviewScene } from './views/glb';

export const PROJECT_COMPOSITION_LIMITS = Object.freeze({
  /** Items composed at once; further placed items are reported, not silently dropped. */
  maxModules: 64,
  /** GLB bytes loaded for one check, the same ceiling as a project bundle. */
  maxBytes: 256 * 1024 * 1024,
  /** Meshes composed at once, which bounds the pair filter's quadratic walk. */
  maxParts: 4096,
  /** Findings kept per measurement, so a report stays small enough to live in a manifest. */
  maxReportedPairs: 100,
  /** Item ids and unmeasured parts listed; the count covers the rest. */
  maxListed: 32,
});

const COMPOSITION_NOTE =
  'A positive is a measurement, not a verdict: a fitting socketed into a neighbour is reported as a bolt in a hole is. Measured at rest over visible static parts; open surfaces are not measured against each other, and a solid thinner than a surface’s facet spacing can pass between its vertices. A clean result is not a fit audit.';

export interface CompositionPartV1 {
  inventoryId: string;
  part: string;
}

export interface ProjectCompositionReportV1 {
  schemaVersion: 1;
  source: 'host-composed-scene';
  projectId: string;
  projectRevision: string;
  /**
   * `complete`: every placed item and pair in scope was measured. `partial`: something was
   * not, and is named here. `nothing-to-compare`: fewer than two modules were composed.
   * `failed`: the check itself could not run, which says nothing about the geometry.
   */
  coverage: 'complete' | 'partial' | 'nothing-to-compare' | 'failed';
  /** Present on a save: the items holding the revision being saved. Only their pairs are measured. */
  subject?: string[];
  /** Items composed. `saved` marks the revision being saved, whose id does not exist yet. */
  modules: {
    inventoryId: string;
    collectionId: string;
    assetId: string;
    revisionId?: string;
    saved?: true;
    parts: number;
  }[];
  /** Items with no placement: outside the composition by declaration, and not a problem. */
  notComposed: { count: number; ids: string[] };
  /** Placed items left out of the measurement. Their pairs are not certified clear. */
  unmeasured: {
    inventoryId: string;
    reason: 'unpinned' | 'unavailable' | 'unreadable' | 'budget';
    detail: string;
  }[];
  /** Closed solids in different modules sharing volume, worst first. */
  overlaps: { a: CompositionPartV1; b: CompositionPartV1; volume: number; fraction: number }[];
  overlapsOmitted: number;
  /** Open surfaces reaching inside a closed solid in another module, deepest first. */
  openSurfaces: {
    open: CompositionPartV1;
    solid: CompositionPartV1;
    depth: number;
    vertices: number;
    tested: number;
  }[];
  openSurfacesOmitted: number;
  /** Parts a pass could not measure, except open parts the surface pass sampled instead. */
  unmeasuredParts: (CompositionPartV1 & { pass: 'solids' | 'surfaces'; reason: string })[];
  unmeasuredPartsOmitted: number;
  /** Meshes on LOD levels above 0: alternates of the level 0 part, left out of every pair. */
  lodAlternatesExcluded: number;
  solids: {
    candidatePairs: number;
    pairsTested: number;
    pairsUnmeasurable: number;
    pairsNotReached: number;
    failed?: true;
  };
  surfaces: {
    candidatePairs: number;
    pairsTested: number;
    pairsNotReached: number;
    verticesUnresolved: number;
    failed?: true;
  };
  /** True when a budget left a placed item, a pair or a finding out of this report. */
  truncated: boolean;
  /** Present with coverage `failed`. */
  error?: string;
  note: string;
}

/** Scale, then rotation (Euler XYZ degrees), then translation, each defaulting to identity. */
export function placementMatrix(placement: InventoryPlacement): THREE.Matrix4 {
  const [rx, ry, rz] = placement.rotation ?? [0, 0, 0];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(placement.translation ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(rx),
        THREE.MathUtils.degToRad(ry),
        THREE.MathUtils.degToRad(rz),
        'XYZ',
      ),
    ),
    new THREE.Vector3(...(placement.scale ?? [1, 1, 1])),
  );
}

/** Inventory ids cannot contain `/`, so a part's module survives the two passes in its name. */
const moduleName = (inventoryId: string, part: string) => `${inventoryId}/${part}`;
function nameParts(name: string): CompositionPartV1 {
  const at = name.indexOf('/');
  return { inventoryId: name.slice(0, at), part: name.slice(at + 1).slice(0, 200) };
}

type Listed = ProjectRevision['inventory'][number];

/** The saved library's refusal, reduced to words that are safe in a record that travels. */
function readFailure(
  item: Listed,
  error: unknown,
): ProjectCompositionReportV1['unmeasured'][number] {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  const { collectionId, assetId, revisionId } = item.asset!;
  const pin = `${collectionId}/${assetId} at ${revisionId}`;
  if (code === 'ENOENT' || /Unknown collection/.test(message))
    return {
      inventoryId: item.id,
      reason: 'unavailable',
      detail: `The pinned revision ${pin} is not in the configured collections.`,
    };
  return {
    inventoryId: item.id,
    reason: 'unreadable',
    detail: `The pinned revision ${pin} could not be read (${code ?? message}).`,
  };
}

/**
 * Load one module under its placement. Meshes are renamed in this private copy so each pass
 * reports the module with the part, and LOD alternates are hidden so a neighbour's level 1 is
 * not compared as though it stood beside level 0. Returns the mesh count.
 */
async function composeModule(
  moduleOf: Map<THREE.Object3D, number>,
  index: number,
  item: Listed,
  glb: Uint8Array,
): Promise<{ parts: number; lodExcluded: number; group: THREE.Group }> {
  const loaded = (await loadGlbReviewScene(glb)).root;
  const group = new THREE.Group();
  group.matrix.copy(placementMatrix(item.placement!));
  group.matrixAutoUpdate = false;
  group.add(loaded);
  let parts = 0;
  let lodExcluded = 0;
  loaded.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((lodLevel(mesh) ?? 0) > 0) {
      mesh.visible = false;
      lodExcluded++;
    }
    moduleOf.set(mesh, index);
    mesh.name = moduleName(item.id, mesh.name || '(unnamed mesh)');
    parts++;
  });
  return { parts, lodExcluded, group };
}

export interface ComposeProjectOptions {
  /** The revision being saved: it replaces the pin of every matching item, and scopes the pairs. */
  subject?: { collectionId: string; assetId: string; glb: Uint8Array };
  limits?: Partial<Record<keyof typeof PROJECT_COMPOSITION_LIMITS, number>>;
}

/** The report for a check that could not run; it claims nothing about the geometry. */
export function failedCompositionReport(
  project: Pick<ProjectRevision, 'projectId' | 'revisionId'>,
  error: unknown,
): ProjectCompositionReportV1 {
  return {
    ...emptyReport(project),
    coverage: 'failed',
    error: error instanceof Error ? error.message : String(error),
  };
}

function emptyReport(
  project: Pick<ProjectRevision, 'projectId' | 'revisionId'>,
): ProjectCompositionReportV1 {
  return {
    schemaVersion: 1,
    source: 'host-composed-scene',
    projectId: project.projectId,
    projectRevision: project.revisionId,
    coverage: 'nothing-to-compare',
    modules: [],
    notComposed: { count: 0, ids: [] },
    unmeasured: [],
    overlaps: [],
    overlapsOmitted: 0,
    openSurfaces: [],
    openSurfacesOmitted: 0,
    unmeasuredParts: [],
    unmeasuredPartsOmitted: 0,
    lodAlternatesExcluded: 0,
    solids: { candidatePairs: 0, pairsTested: 0, pairsUnmeasurable: 0, pairsNotReached: 0 },
    surfaces: { candidatePairs: 0, pairsTested: 0, pairsNotReached: 0, verticesUnresolved: 0 },
    truncated: false,
    note: COMPOSITION_NOTE,
  };
}

/** Compose an exact project revision and measure its modules against each other. */
export async function composeProjectModules(
  project: ProjectRevision,
  library: Pick<AssetLibrary, 'read'>,
  options: ComposeProjectOptions = {},
): Promise<ProjectCompositionReportV1> {
  const limits = { ...PROJECT_COMPOSITION_LIMITS, ...options.limits };
  const report = emptyReport(project);
  const { subject } = options;
  const holdsSubject = (item: Listed) =>
    subject !== undefined &&
    item.asset?.collectionId === subject.collectionId &&
    item.asset.assetId === subject.assetId;

  const placed = project.inventory.filter((item) => item.placement);
  const outside = project.inventory.filter((item) => !item.placement);
  report.notComposed = {
    count: outside.length,
    ids: outside.slice(0, limits.maxListed).map((item) => item.id),
  };
  const held = placed.filter(holdsSubject);
  if (subject) report.subject = held.map((item) => item.id);

  // The saved revision goes first, so no budget can leave out the module this save is about.
  const scene = new THREE.Group();
  const moduleOf = new Map<THREE.Object3D, number>();
  const subjectModules = new Set<number>();
  let bytes = 0;
  let parts = 0;
  let exhausted = false;
  const overBudget = (item: Listed, detail: string) => {
    exhausted = true;
    report.unmeasured.push({ inventoryId: item.id, reason: 'budget', detail });
  };
  for (const item of [...held, ...placed.filter((item) => !holdsSubject(item))]) {
    if (!item.asset) {
      report.unmeasured.push({
        inventoryId: item.id,
        reason: 'unpinned',
        detail: 'This item states a placement but links no saved revision.',
      });
      continue;
    }
    if (exhausted || report.modules.length >= limits.maxModules) {
      overBudget(
        item,
        `Not loaded: the check composes at most ${limits.maxModules} modules, ${limits.maxBytes} bytes and ${limits.maxParts} parts.`,
      );
      continue;
    }
    const saved = holdsSubject(item);
    let glb: Uint8Array | undefined;
    if (saved) glb = subject!.glb;
    else {
      try {
        const { collectionId, assetId, revisionId } = item.asset;
        glb = (await library.read(collectionId, assetId, revisionId)).files['asset.glb'];
      } catch (error) {
        report.unmeasured.push(readFailure(item, error));
        continue;
      }
      if (!glb) {
        report.unmeasured.push({
          inventoryId: item.id,
          reason: 'unreadable',
          detail: 'The pinned revision has no asset.glb.',
        });
        continue;
      }
    }
    if (bytes + glb.length > limits.maxBytes) {
      overBudget(item, `Not loaded: the check loads at most ${limits.maxBytes} GLB bytes.`);
      continue;
    }
    bytes += glb.length;
    let module: Awaited<ReturnType<typeof composeModule>>;
    try {
      module = await composeModule(moduleOf, report.modules.length, item, glb);
    } catch (error) {
      report.unmeasured.push({
        inventoryId: item.id,
        reason: 'unreadable',
        detail: `The GLB could not be loaded (${error instanceof Error ? error.message : String(error)}).`,
      });
      continue;
    }
    if (parts + module.parts > limits.maxParts) {
      overBudget(item, `Not composed: the check composes at most ${limits.maxParts} parts.`);
      continue;
    }
    parts += module.parts;
    report.lodAlternatesExcluded += module.lodExcluded;
    scene.add(module.group);
    if (saved) subjectModules.add(report.modules.length);
    report.modules.push({
      inventoryId: item.id,
      collectionId: item.asset.collectionId,
      assetId: item.asset.assetId,
      ...(saved ? { saved: true as const } : { revisionId: item.asset.revisionId }),
      parts: module.parts,
    });
  }

  let failed = false;
  if (report.modules.length >= 2) {
    const comparable = (a: THREE.Mesh, b: THREE.Mesh) => {
      const left = moduleOf.get(a);
      const right = moduleOf.get(b);
      if (left === right) return false;
      return !subject || subjectModules.has(left!) || subjectModules.has(right!);
    };
    const unmeasured: ProjectCompositionReportV1['unmeasuredParts'] = [];
    let open = new Set<string>();
    try {
      const surfaces = analyzeOpenSurfacePenetration(scene, undefined, { comparable });
      open = new Set(surfaces.openPartNames);
      report.surfaces = {
        candidatePairs: surfaces.candidatePairs,
        pairsTested: surfaces.pairsTested,
        pairsNotReached: surfaces.pairsNotReached,
        verticesUnresolved: surfaces.verticesUnresolved,
      };
      report.truncated ||= surfaces.truncated;
      report.openSurfaces = surfaces.penetrations.slice(0, limits.maxReportedPairs).map((pair) => ({
        open: nameParts(pair.open),
        solid: nameParts(pair.solid),
        depth: pair.depth,
        vertices: pair.vertices,
        tested: pair.tested,
      }));
      report.openSurfacesOmitted = surfaces.penetrations.length - report.openSurfaces.length;
      for (const { part, reason } of surfaces.skipped)
        unmeasured.push({ ...nameParts(part), pass: 'surfaces', reason });
    } catch {
      report.surfaces.failed = true;
      failed = true;
    }
    try {
      const solids = await analyzePartPenetration(scene, { comparable });
      report.solids = {
        candidatePairs: solids.candidatePairs,
        pairsTested: solids.pairsTested,
        pairsUnmeasurable: solids.pairsUnmeasurable,
        pairsNotReached: solids.pairsNotReached,
      };
      report.truncated ||= solids.truncated;
      report.overlaps = solids.penetrations.slice(0, limits.maxReportedPairs).map((pair) => ({
        a: nameParts(pair.a),
        b: nameParts(pair.b),
        volume: pair.volume,
        fraction: pair.fraction,
      }));
      report.overlapsOmitted = solids.penetrations.length - report.overlaps.length;
      // An open part encloses no volume. The surface pass sampled it, so the volume pass
      // failing to close it is expected and leaves nothing unmeasured.
      for (const { part, reason } of [...solids.skipped, ...(solids.acknowledged ?? [])])
        if (!open.has(part)) unmeasured.push({ ...nameParts(part), pass: 'solids', reason });
    } catch {
      report.solids.failed = true;
      failed = true;
    }
    report.unmeasuredParts = unmeasured.slice(0, limits.maxListed);
    report.unmeasuredPartsOmitted = unmeasured.length - report.unmeasuredParts.length;
    report.truncated ||= report.overlapsOmitted > 0 || report.openSurfacesOmitted > 0;
    failed ||= unmeasured.length > 0;
  }
  report.truncated ||= exhausted;
  report.coverage =
    failed || report.truncated || report.unmeasured.length > 0
      ? 'partial'
      : report.modules.length < 2
        ? 'nothing-to-compare'
        : 'complete';
  return report;
}
