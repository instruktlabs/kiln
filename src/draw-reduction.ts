/**
 * A delivery derivative with as few draw calls as the asset allows. Every repeated mesh becomes a
 * GPU batch, then the one-off parts left over merge per material within spatial cells, so a viewer
 * can still cull a large asset by region.
 *
 * Unlike `optimize: 'full'` this runs no `palette()`, which rewrites materials, and no `weld()`,
 * which splits the accessors shared parts rely on: on a 16 MB cathedral `weld()` alone added 10 MB.
 * Saved revisions are never rewritten by this pass; `exportAssetGlb` derives from them.
 */
import { type Document, Logger } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import {
  refreshAtlasDocumentProvenance,
  validateAtlasDocumentProvenance,
} from './atlas-provenance';
import { createGltfIO } from './gltf-io';
import {
  countInstanceBatches,
  instanceByHandedness,
  instancingBlocker,
} from './instance-handedness';
import { collectGlbMetrics } from './metrics';
import { assertFinalGlbValid } from './qa/gltf';
import { mergeRigidGroups, type RigidMergeSummary } from './rigid-merge';

/** Metres. Near the size a viewer's culling can use; set per export with `drawCellSize`. */
export const DEFAULT_DRAW_CELL_SIZE = 15;

/** Two copies already save a draw. The bake pass's higher threshold protects node names. */
const REPEAT_MIN = 2;

/**
 * Metres a merged vertex may move through float32 rounding in its destination frame. The strict
 * default rejects a metre-sized part baked 100 m from its destination, which rounds by about
 * 8 micrometres. 0.1 mm stays far below a pixel at any distance the part is visible from.
 */
const POSITION_TOLERANCE = 1e-4;

export interface DrawReductionV1 {
  drawsBefore: number;
  drawsAfter: number;
  batches: number;
  instances: number;
  /** Why no copy was batched, when something in the asset rules batching out. */
  batchingSkipped?: string;
  merges: number;
  cellSize: number;
  /** Primitives the merge left alone, by reason. */
  locked: Record<string, number>;
  /** Buckets left as authored because building or checking the join failed. */
  rejected: RigidMergeSummary['rejected'];
}

export function assertDrawCellSize(cellSize: number): void {
  if (!Number.isFinite(cellSize) || cellSize <= 0)
    throw new Error('The draw cell size must be a positive number of metres');
}

/** Reduce a finished document's draw calls in place. */
export async function reduceDrawCalls(
  doc: Document,
  options: { cellSize?: number } = {},
): Promise<DrawReductionV1> {
  const cellSize = options.cellSize ?? DEFAULT_DRAW_CELL_SIZE;
  assertDrawCellSize(cellSize);
  // Transform progress must not corrupt CLI JSON on stdout.
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const drawsBefore = collectGlbMetrics(doc).drawCalls;

  const batchingSkipped = instancingBlocker(doc);
  if (!batchingSkipped) await instanceByHandedness(doc, REPEAT_MIN);
  const { batches, instances } = countInstanceBatches(doc);

  // Repeats are batches now. A copy left over shares its mesh with a batch, and baking it would
  // duplicate geometry; mixed into a bucket it can also push the join past the vertex limit,
  // which strands the true one-offs beside it. Only meshes with a single user merge.
  const merge = mergeRigidGroups(doc, {
    cellSize,
    positionTolerance: POSITION_TOLERANCE,
    expandSharedMeshes: false,
  });
  await doc.transform(prune({ keepLeaves: true, keepExtras: true, keepSolidTextures: true }));

  const locked: Record<string, number> = {};
  for (const { reason, primitives } of merge.locked)
    locked[reason] = (locked[reason] ?? 0) + primitives;
  return {
    drawsBefore,
    drawsAfter: collectGlbMetrics(doc).drawCalls,
    batches,
    instances,
    ...(batchingSkipped ? { batchingSkipped } : {}),
    merges: merge.merges,
    cellSize,
    locked,
    rejected: merge.rejected,
  };
}

/** {@link reduceDrawCalls} over GLB bytes, validated before they are handed back. */
export async function reduceGlbDrawCalls(
  bytes: Uint8Array,
  options: { cellSize?: number } = {},
): Promise<{ glb: Uint8Array; summary: DrawReductionV1 }> {
  const io = createGltfIO();
  const doc = await io.readBinary(bytes);
  await validateAtlasDocumentProvenance(doc);
  const summary = await reduceDrawCalls(doc, options);
  await refreshAtlasDocumentProvenance(doc);
  await validateAtlasDocumentProvenance(doc);
  const glb = await io.writeBinary(doc);
  await assertFinalGlbValid(glb);
  return { glb, summary };
}
