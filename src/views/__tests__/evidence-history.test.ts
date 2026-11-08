import { describe, expect, test } from 'bun:test';

import type { DerivativeReviewFidelityV1, ViewFidelityV1 } from '../../composer/render-port';
import { ViewEvidenceHistoryStore } from '../evidence-history';

const hash = (char: string) => `sha256:${char.repeat(64)}` as const;

function faithful(inputGlbSha256 = hash('a')): ViewFidelityV1 {
  return {
    version: 'kiln.view-fidelity.v1',
    requested: 'full-preferred',
    delivered: 'full-material',
    materialFaithful: true,
    exactArtifact: false,
    rendererId: 'gpu:test',
    inputGlbSha256,
    degraded: false,
  };
}

function degraded(inputGlbSha256 = hash('a')): ViewFidelityV1 {
  return {
    version: 'kiln.view-fidelity.v1',
    requested: 'full-preferred',
    delivered: 'geometry-flat',
    materialFaithful: false,
    exactArtifact: false,
    rendererId: 'cpu:test',
    inputGlbSha256,
    degraded: true,
    degradeReason: 'GPU unavailable',
    reasonCodes: ['FULL_MATERIAL_RENDER_UNAVAILABLE'],
  };
}

describe('bounded model-visible view evidence history', () => {
  test('success then degrade preserves the older faithful reference without reusing pixels', () => {
    const store = new ViewEvidenceHistoryStore(2);
    store.record('kiln_render', faithful());
    const state = store.record('kiln_render', degraded());

    expect(state.current).toMatchObject({
      sequence: 2,
      surface: 'kiln_render',
      delivered: 'geometry-flat',
      materialFaithful: false,
      degraded: true,
      inputGlbSha256: [hash('a')],
    });
    expect(state.lastFaithful).toMatchObject({
      sequence: 1,
      surface: 'kiln_render',
      materialFaithful: true,
      inputGlbSha256: [hash('a')],
    });
    expect(JSON.stringify(state)).not.toContain('png');
    expect(JSON.stringify(state)).not.toContain('source');
  });

  test('degrade-only history never invents a faithful reference', () => {
    const state = new ViewEvidenceHistoryStore().record('kiln_inspect', degraded());
    expect(state.current.degraded).toBe(true);
    expect(state.lastFaithful).toBeUndefined();
    expect(state.faithfulHistory).toEqual([]);
  });

  test('a changed current hash remains distinct from the last faithful input', () => {
    const store = new ViewEvidenceHistoryStore();
    store.record('kiln_render', faithful(hash('a')));
    const state = store.record('kiln_render', degraded(hash('b')));
    expect(state.current.inputGlbSha256).toEqual([hash('b')]);
    expect(state.lastFaithful?.inputGlbSha256).toEqual([hash('a')]);
    expect(state.current.sequence).toBeGreaterThan(state.lastFaithful!.sequence);
  });

  test('malformed derivative receipts degrade current evidence and cannot replace lastFaithful', () => {
    const store = new ViewEvidenceHistoryStore();
    store.record('kiln_render', faithful());
    const malformed = {
      version: 'kiln.derivative-review-fidelity.v1',
      requested: 'full-preferred',
      delivered: 'full-material',
      materialFaithful: true,
      exactArtifact: false,
      degraded: false,
      receipts: [
        {
          ...faithful('sha256:not-a-hash' as `sha256:${string}`),
          derivativeLabel: '',
          exactArtifact: false,
        },
      ],
    } satisfies DerivativeReviewFidelityV1;
    const state = store.record('kiln_screenshot_animation', malformed);
    expect(state.current).toMatchObject({
      delivered: 'none',
      materialFaithful: false,
      degraded: true,
      reasonCodes: ['DERIVATIVE_RECEIPT_INVALID'],
    });
    expect(state.lastFaithful?.sequence).toBe(1);
  });

  test('a surface drawn from the artifact itself carries exactArtifact; a claim its receipts deny is invalid', () => {
    const surface = (exact: boolean[], claimed: boolean): DerivativeReviewFidelityV1 => ({
      version: 'kiln.derivative-review-fidelity.v1',
      requested: 'full-preferred',
      delivered: 'full-material',
      materialFaithful: true,
      exactArtifact: claimed,
      degraded: false,
      receipts: exact.map((exactArtifact, index) => ({
        ...faithful(hash(String(index))),
        derivativeLabel: `shot-${index}`,
        exactArtifact,
      })),
    });
    const store = new ViewEvidenceHistoryStore();
    const exact = store.record('kiln_inspect', surface([true], true));
    expect(exact.current).toMatchObject({ exactArtifact: true, materialFaithful: true });
    expect(exact.lastFaithful?.exactArtifact).toBe(true);
    expect(store.record('kiln_inspect', surface([true, false], false)).current).toMatchObject({
      exactArtifact: false,
      materialFaithful: true,
    });
    for (const [receipts, claimed] of [
      [[true, false], true],
      [[true], false],
    ] as [boolean[], boolean][])
      expect(store.record('kiln_inspect', surface(receipts, claimed)).current.reasonCodes).toEqual([
        'DERIVATIVE_RECEIPT_INVALID',
      ]);
  });

  test('faithful history is bounded and returned snapshots cannot mutate the store', () => {
    const store = new ViewEvidenceHistoryStore(2);
    store.record('kiln_render', faithful(hash('a')));
    store.record('kiln_inspect', faithful(hash('b')));
    const state = store.record('kiln_view_interior', faithful(hash('c')));
    expect(state.faithfulHistory.map((entry) => entry.inputGlbSha256[0])).toEqual([
      hash('b'),
      hash('c'),
    ]);
    state.faithfulHistory.length = 0;
    expect(store.snapshot()!.faithfulHistory).toHaveLength(2);
  });
});
