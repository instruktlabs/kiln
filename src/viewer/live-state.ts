import type { LiveOperation } from '../live-review';

/** Geometry statistics belong to loaded bytes and remain available across observation IDs. */
export function reviewStageLabel(
  stats: { triangles: number; meshes: number },
  operationId: string,
  lod?: { triangles: number },
): string {
  return lod
    ? `${lod.triangles.toLocaleString()} triangles displayed · ${operationId}`
    : `${stats.triangles.toLocaleString()} triangles · ${stats.meshes} meshes · ${operationId}`;
}

export interface ReviewState {
  following: boolean;
  crossRunContinuity?: boolean;
  operations: LiveOperation[];
  selected?: LiveOperation;
  displayed?: LiveOperation;
  pinned?: LiveOperation;
}

const order = (a: LiveOperation, b: LiveOperation) =>
  a.startedAt.localeCompare(b.startedAt) || a.operationId.localeCompare(b.operationId);

/** Full snapshots replace history; local inspection remains stable across replay and retention. */
export function reconcileReview(state: ReviewState, incoming: LiveOperation[]): ReviewState {
  const previous = new Map(state.operations.map((item) => [item.operationId, item]));
  const operations = incoming
    .map((item) => {
      const old = previous.get(item.operationId);
      return old && old.revision > item.revision ? old : item;
    })
    .sort(order);
  const current = (item?: LiveOperation) =>
    operations.find((op) => op.operationId === item?.operationId) ?? item;
  const selected = state.following ? operations.at(-1) : current(state.selected);
  const compatible = (op?: LiveOperation) =>
    !!op &&
    !!selected &&
    op.projectId === selected.projectId &&
    op.workId === selected.workId &&
    order(op, selected) <= 0 &&
    (op.sessionId === selected.sessionId ||
      (state.following && state.crossRunContinuity === true && !!selected.workId));
  const displayed = selected?.artifact
    ? selected
    : selected
      ? (operations.filter((op) => op.artifact && compatible(op)).at(-1) ??
        (compatible(state.displayed) ? state.displayed : undefined))
      : undefined;
  return { ...state, operations, selected, displayed, pinned: current(state.pinned) };
}

export function selectReviewOperation(state: ReviewState, id: string): ReviewState {
  return reconcileReview(
    {
      ...state,
      following: false,
      selected: state.operations.find((op) => op.operationId === id) ?? state.selected,
    },
    state.operations,
  );
}

/** An observed selection is actionable only after its exact preview has loaded. */
export function visibleReviewOperation(
  displayed: LiveOperation | undefined,
  loaded: LiveOperation | undefined,
): LiveOperation | undefined {
  return displayed?.artifact &&
    loaded?.artifact &&
    displayed.operationId === loaded.operationId &&
    displayed.revision === loaded.revision &&
    displayed.artifact.sha256 === loaded.artifact.sha256
    ? loaded
    : undefined;
}

export function reviewedSaveRequest(
  operation: LiveOperation,
  name: string,
  loaded: LiveOperation | undefined,
  displayed: LiveOperation | undefined,
) {
  if (operation.status !== 'complete' || !operation.artifact)
    throw new Error('Save requires a completed operation with an artifact.');
  if (!visibleReviewOperation(operation, visibleReviewOperation(displayed, loaded)))
    throw new Error(
      'The visible artifact changed or has not loaded. Close this dialog and review it before saving.',
    );
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200)
    throw new Error('Choose an asset name of 1–200 characters.');
  return {
    path: `/api/live/${encodeURIComponent(operation.operationId)}/save`,
    body: { expectedRevision: operation.revision, name: trimmed, collection: 'project' },
  };
}
