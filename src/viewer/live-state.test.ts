import { expect, test } from 'bun:test';
import type { LiveOperation } from '../live-review';
import {
  reconcileReview,
  selectReviewOperation,
  reviewedSaveRequest,
  visibleReviewOperation,
  type ReviewState,
} from './live-state';

const operation = (
  id: string,
  status: LiveOperation['status'],
  artifact = false,
  sessionId = 'run-a',
): LiveOperation => ({
  version: 'kiln.live.v1',
  operationId: id,
  revision: 1,
  tool: 'kiln_render',
  transport: 'mcp',
  sessionId,
  startedAt: `2026-09-26T00:00:0${id}.000Z`,
  updatedAt: '2026-09-26T00:00:00.000Z',
  status,
  pinned: false,
  captures: [],
  phases: [],
  ...(artifact
    ? { artifact: { name: 'asset.glb', bytes: 10, sha256: id, url: `/api/live/${id}/asset.glb` } }
    : {}),
});

test('a failed iteration advances activity while retaining the last artifact from the same run', () => {
  const first = operation('1', 'complete', true);
  let state: ReviewState = reconcileReview({ following: true, operations: [] }, [first]);
  state = reconcileReview(state, [first, operation('2', 'failed')]);
  expect(state.selected?.operationId).toBe('2');
  expect(state.displayed?.operationId).toBe('1');
  state = reconcileReview(state, [...state.operations, operation('3', 'evaluated', true)]);
  expect(state.displayed?.operationId).toBe('3');
});

test('same-source captures update evidence without collapsing operations or replacing a manual selection', () => {
  const first = { ...operation('1', 'complete', true), programRef: 'same-source' };
  const second = { ...operation('2', 'complete', true), programRef: 'same-source' };
  let state = reconcileReview({ following: true, operations: [] }, [first, second]);
  state = selectReviewOperation(state, '1');
  state = reconcileReview(state, [
    first,
    {
      ...second,
      revision: 2,
      captures: [{ name: 'capture-0.png', bytes: 4, sha256: 'capture', url: '/capture' }],
    },
  ]);
  expect(state.selected?.operationId).toBe('1');
  expect(state.operations).toHaveLength(2);
  expect(state.operations[1]?.captures).toHaveLength(1);
});

test('retention preserves the local selected and pinned reference and does not borrow another run artifact', () => {
  const first = operation('1', 'complete', true);
  let state = reconcileReview(
    { following: false, operations: [], selected: first, pinned: first },
    [],
  );
  expect(state.displayed?.operationId).toBe('1');
  expect(state.pinned?.operationId).toBe('1');
  state = reconcileReview({ ...state, following: true }, [
    first,
    operation('2', 'failed', false, 'run-b'),
  ]);
  expect(state.displayed).toBeUndefined();
});

test('a delayed snapshot cannot regress an operation revision', () => {
  const first = { ...operation('1', 'complete', true), revision: 3 };
  const state = reconcileReview({ following: true, operations: [first] }, [
    { ...first, revision: 1, status: 'running' },
  ]);
  expect(state.selected?.revision).toBe(3);
  expect(state.selected?.status).toBe('complete');
});

test('an older failed selection never borrows a later artifact after history pruning', () => {
  const later = operation('3', 'complete', true);
  const earlier = operation('1', 'failed');
  const state = reconcileReview(
    {
      following: false,
      operations: [later],
      selected: earlier,
      displayed: later,
    },
    [],
  );
  expect(state.displayed).toBeUndefined();
});

test('reviewed save binds the displayed completed operation revision and excludes incomplete artifacts', () => {
  const complete = { ...operation('1', 'complete', true), revision: 7 };
  expect(reviewedSaveRequest(complete, ' Reviewed cube ', complete, complete)).toEqual({
    path: '/api/live/1/save',
    body: { expectedRevision: 7, name: 'Reviewed cube', collection: 'project' },
  });
  const evaluated = operation('2', 'evaluated', true);
  const failed = operation('2', 'failed');
  expect(() => reviewedSaveRequest(evaluated, 'Cube', evaluated, evaluated)).toThrow('completed');
  expect(() => reviewedSaveRequest(failed, 'Cube', failed, failed)).toThrow('completed');
  expect(() => reviewedSaveRequest(complete, ' ', complete, complete)).toThrow('name');
});

test('pending or failed replacement cannot save or pin an artifact that is not loaded', () => {
  const a = operation('1', 'complete', true);
  const b = operation('2', 'complete', true);
  expect(visibleReviewOperation(b, a)).toBeUndefined();
  expect(visibleReviewOperation(b, undefined)).toBeUndefined();
  expect(() => reviewedSaveRequest(b, 'New asset', a, b)).toThrow('visible');
  expect(() => reviewedSaveRequest(b, 'New asset', undefined, b)).toThrow('visible');
  expect(visibleReviewOperation(b, b)).toBe(b);
  expect(reviewedSaveRequest(b, 'New asset', b, b).path).toBe('/api/live/2/save');
});

test('save dialog rechecks exact operation revision and hash even when meshes share bytes', () => {
  const a = operation('1', 'complete', true);
  const b = { ...operation('2', 'complete', true), artifact: a.artifact };
  expect(visibleReviewOperation(b, a)).toBeUndefined();
  expect(() => reviewedSaveRequest(a, 'A', b, b)).toThrow('visible');
  const revised = { ...a, revision: 2 };
  expect(visibleReviewOperation(revised, a)).toBeUndefined();
  expect(() => reviewedSaveRequest(a, 'A', revised, revised)).toThrow('visible');
  const changed = { ...a, artifact: { ...a.artifact!, sha256: 'changed' } };
  expect(() => reviewedSaveRequest(a, 'A', changed, changed)).toThrow('visible');
});

test('global follow keeps an explicit work item across CLI invocations but a run filter stays isolated', () => {
  const first = { ...operation('1', 'complete', true), projectId: 'farm', workId: 'cow' };
  const failed = {
    ...operation('2', 'failed', false, 'new-cli-process'),
    projectId: 'farm',
    workId: 'cow',
  };
  let state = reconcileReview({ following: true, crossRunContinuity: true, operations: [] }, [
    first,
    failed,
  ]);
  expect(state.selected?.operationId).toBe('2');
  expect(state.displayed?.operationId).toBe('1');
  state = reconcileReview({ ...state, crossRunContinuity: false, displayed: undefined }, [failed]);
  expect(state.displayed).toBeUndefined();
  const otherProject = { ...failed, projectId: 'city' };
  state = reconcileReview(
    { following: true, crossRunContinuity: true, operations: [], displayed: first },
    [first, otherProject],
  );
  expect(state.displayed).toBeUndefined();
});

test('sharing a project never makes separate authoring items the same model', () => {
  const first = { ...operation('1', 'complete', true), projectId: 'farm', workId: 'cow' };
  const other = { ...operation('2', 'running', false), projectId: 'farm', workId: 'tractor' };
  expect(
    reconcileReview({ following: true, crossRunContinuity: true, operations: [] }, [first, other])
      .displayed,
  ).toBeUndefined();
  const legacy = { ...operation('3', 'failed', false, 'another-run'), projectId: 'farm' };
  expect(
    reconcileReview({ following: true, crossRunContinuity: true, operations: [] }, [
      { ...first, workId: undefined },
      legacy,
    ]).displayed,
  ).toBeUndefined();
});

test('independent standalone runs do not borrow artifacts, while the same run retains its last success', () => {
  const first = operation('1', 'complete', true);
  const failed = operation('2', 'failed', false, 'standalone-b');
  const initial: ReviewState = { following: true, crossRunContinuity: true, operations: [] };
  const unrelated = reconcileReview(initial, [first, failed]);
  expect(unrelated.selected?.operationId).toBe('2');
  expect(unrelated.displayed).toBeUndefined();
  const sameRun = reconcileReview(initial, [first, { ...failed, sessionId: first.sessionId }]);
  expect(sameRun.displayed?.operationId).toBe('1');
});
