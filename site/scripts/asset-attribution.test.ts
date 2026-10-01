import { expect, test } from 'bun:test';
import { groupAssetAttribution, revisionBriefForDisplay } from '../src/lib/attribution';
import vehicles from '../src/data/packs/vehicles.json';

test('saved candidate shorthand is spaced only in displayed prose, without changing source records or LOD names', () => {
  const saved = 'Under candidate2, LOD1 and r_candidate2 preserve the body.';
  expect(revisionBriefForDisplay(saved)).toBe('Under candidate 2, LOD1 and r_candidate2 preserve the body.');
  expect(saved).toContain('candidate2');
  const heavy = vehicles.assets.filter(asset => ['pickup', 'box-truck', 'transit-bus'].includes(asset.slug));
  expect(heavy).toHaveLength(3);
  for (const asset of heavy) {
    const brief = asset.revisions.at(-1)!.brief!;
    expect(brief).toContain('candidate2');
    expect(revisionBriefForDisplay(brief)).not.toContain('candidate2');
    expect(revisionBriefForDisplay(brief)).toContain('candidate 2');
  }
});

test('provenance qualifications and effort apply only to their own asset group', () => {
  const author = 'GPT-6.1 Sol · codex 0.159.2';
  const assets = [
    { id: 'tree', author, attribution: { author, requestedEffort: 'high' } },
    { id: 'truck', author, attribution: { author, requestedEffort: 'high', note: 'Saved model label is generic.' } },
    { id: 'shrub', author, attribution: { author, requestedEffort: 'high' } },
    { id: 'trailer', author, attribution: { author, requestedEffort: 'high', note: 'Saved model label is generic.' } },
    { id: 'unknown', author, attribution: { author, requestedEffort: null } },
  ];
  expect(groupAssetAttribution(assets).map(group => group.map(asset => asset.id))).toEqual([
    ['tree', 'shrub'], ['truck', 'trailer'], ['unknown'],
  ]);
});
