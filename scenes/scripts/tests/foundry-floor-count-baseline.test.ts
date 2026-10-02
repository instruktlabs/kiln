import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFoundryCountBaseline, checkFoundryCounts, FOUNDRY_COUNT_TIERS, validateFoundryCountBaseline, type FoundryCountBaseline, type FoundryCountRow } from '../foundry-count-gates';
import { FOUNDRY_FIXTURES } from '../scene-fixtures';

// OD-8 (D-53), Foundry Floor: it had no X-02 pin, so its draw and triangle budgets never ran in the gate. The reference is a
// committed count baseline of the optimized build (packages/foundry-floor/fixtures/count-baseline.json) with the same inclusive
// ±2% draw and triangle band and the +5% pipeline ceiling as X-02.
const row = (fixture: string, draws: number, triangles = 100_000, pipelinesUsed = 10, pipelineCache = 20, tier = 'high'): FoundryCountRow => ({ scene: 'foundry-floor', tier, fixture, draws, triangles, pipelinesUsed, pipelineCache, programs: 30, memory: { geometries: 100, textures: 8 } });
const provenance = { build: 'draw-after', commit: '892d103', chunks: ['index-x.js'], source: 'git HEAD, clean', tool: 'scripts/check-foundry-counts.ts --record', probe: 'scripts/count-probe.ts --label draw-after-ff', date: '2026-10-02' };
const conditions = { viewport: [1920, 1080] as [number, number], freshPage: false, clock: 'frozen', backend: 'webgpu', settled: true };
function baseline(): FoundryCountBaseline {
  return buildFoundryCountBaseline([row('campus-campus', 100), row('fab-landing', 134, 200_000, 7, 8), row('drive', 140, 250_000, 14, 20), row('campus-campus', 90, 80_000, 9, 15, 'minimal')], { provenance, conditions, workloads: ['drive'] });
}
const run = { freshPage: false, viewport: [1920, 1080] as [number, number] };

test('the reference keeps every row, with provenance, conditions and the workload fixtures marked', () => {
  const b = baseline();
  expect(validateFoundryCountBaseline(b)).toEqual([]);
  expect(b).toMatchObject({ schema: 'kiln.foundry-floor-count-baseline/1', decision: 'OD-8 (D-53)', provenance: { commit: '892d103' } });
  expect(b.tiers.high!['campus-campus']).toMatchObject({ drawCalls: 100, triangles: 100_000, pipelines: 10, pipelineCache: 20 });
  expect(b.tiers.high!.drive).toMatchObject({ workload: true });
  expect(b.tiers.high!['fab-landing']!.workload).toBeUndefined();
});

test('X-02 holds the ±2% draw and triangle band and the +5% pipeline ceiling, inclusive', () => {
  const ok = checkFoundryCounts(baseline(), [row('campus-campus', 102, 98_000, 10), row('fab-landing', 134, 200_000, 7, 8), row('drive', 999, 1, 99)], { ...run, tiers: ['high'] });
  expect(ok).toMatchObject({ pass: true, missing: [], extra: [] });
  // 100 draws: 98 and 102 pass, 97 and 103 fail; triangles likewise; pipelines 10 -> 10 passes (10.5 allowed), 11 fails.
  for (const bad of [row('campus-campus', 103), row('campus-campus', 97), row('campus-campus', 100, 102_001), row('campus-campus', 100, 97_999), row('campus-campus', 100, 100_000, 11)]) {
    const result = checkFoundryCounts(baseline(), [bad, row('fab-landing', 134, 200_000, 7, 8)], { ...run, tiers: ['high'] });
    expect(result.pass).toBe(false);
    expect(result.rows.filter(r => !r.pass).map(r => r.fixture)).toEqual(['campus-campus']);
  }
  // Small pipeline counts have no slack: 7 + 5% is 7.35, so one more pipeline in the fab fails.
  expect(checkFoundryCounts(baseline(), [row('campus-campus', 100), row('fab-landing', 134, 200_000, 8, 8)], { ...run, tiers: ['high'] }).pass).toBe(false);
});

test('the cumulative pipeline cache is judged only when the run used the reference page policy', () => {
  const grown = [row('campus-campus', 100, 100_000, 10, 25), row('fab-landing', 134, 200_000, 7, 8)];
  const same = checkFoundryCounts(baseline(), grown, { ...run, tiers: ['high'] });
  expect(same).toMatchObject({ pass: false, conditions: { cacheJudged: true } });
  expect(same.rows.find(r => r.fixture === 'campus-campus')!.cache).toEqual({ reference: 20, observed: 25, pass: false });
  // One fresh page per view fills the cache differently: that bound is skipped, draws, triangles and pipelines bound still stand.
  expect(checkFoundryCounts(baseline(), grown, { ...run, freshPage: true, tiers: ['high'] })).toMatchObject({ pass: true, conditions: { match: true, cacheJudged: false } });
  expect(checkFoundryCounts(baseline(), [row('campus-campus', 100, 100_000, 11, 25), row('fab-landing', 134, 200_000, 7, 8)], { ...run, freshPage: true, tiers: ['high'] }).pass).toBe(false);
});

test('the pre-optimization build is flagged where the planting changed and passes where nothing did', () => {
  const before = checkFoundryCounts(baseline(), [row('campus-campus', 108, 100_000, 22, 78), row('fab-landing', 134, 200_000, 7, 8)], { ...run, tiers: ['high'] });
  expect(before.pass).toBe(false);
  expect(before.rows.filter(r => !r.pass).map(r => r.fixture)).toEqual(['campus-campus']);
});

test('a fixture missing from the run fails, a workload fixture is listed but not judged, an unknown one is reported', () => {
  expect(checkFoundryCounts(baseline(), [row('campus-campus', 100)], { ...run, tiers: ['high'] })).toMatchObject({ pass: false, missing: ['high/fab-landing'] }); // the missing drive is a workload
  const result = checkFoundryCounts(baseline(), [row('campus-campus', 100), row('fab-landing', 134, 200_000, 7, 8), row('drive', 500, 9, 99), row('campus-new', 5)], { ...run, tiers: ['high'] });
  expect(result).toMatchObject({ pass: true, extra: ['high/campus-new'] });
  expect(result.rows.find(r => r.fixture === 'drive')).toMatchObject({ workload: true, pass: true, judged: false });
  expect(checkFoundryCounts(baseline(), [row('campus-campus', 100), row('fab-landing', 134, 200_000, 7, 8)], { ...run, tiers: ['minimal'] })).toMatchObject({ pass: false, missing: ['minimal/campus-campus'] });
});

test('observations taken under other conditions than the reference are refused', () => {
  const rows = [row('campus-campus', 100), row('fab-landing', 134, 200_000, 7, 8)];
  expect(checkFoundryCounts(baseline(), rows, { ...run, tiers: ['high'], viewport: [1280, 1024] })).toMatchObject({ pass: false, conditions: { match: false } });
  // The aspect ratio decides culling, so another 16:9 size is the same condition.
  expect(checkFoundryCounts(baseline(), rows, { ...run, tiers: ['high'], viewport: [1280, 720] }).pass).toBe(true);
});

test('a reference without provenance, valid counts or its schema is rejected', () => {
  const b = baseline() as any; delete b.provenance.commit; b.tiers.high['campus-campus'].drawCalls = -1;
  expect(validateFoundryCountBaseline(b)).toEqual(expect.arrayContaining([expect.stringContaining('provenance.commit'), expect.stringContaining('high/campus-campus')]));
  expect(validateFoundryCountBaseline({ ...baseline(), schema: 'other' } as any).length).toBeGreaterThan(0);
});

test('the committed reference covers every Foundry Floor count fixture at every tier', () => {
  const committed = JSON.parse(readFileSync(resolve(import.meta.dir, '../../packages/foundry-floor/fixtures/count-baseline.json'), 'utf8')) as FoundryCountBaseline;
  expect(validateFoundryCountBaseline(committed)).toEqual([]);
  const ids = FOUNDRY_FIXTURES.fixtures.map(f => f.id).sort();
  expect(ids.length).toBe(15);
  for (const tier of FOUNDRY_COUNT_TIERS) expect(Object.keys(committed.tiers[tier] ?? {}).sort()).toEqual(ids);
  expect(committed.conditions).toMatchObject({ backend: 'webgpu', clock: 'frozen', settled: true });
  // The optimized build's planting is in the reference: the Campus view draws 96, not the pre-optimization 102.
  expect(committed.tiers.high!['campus-campus']!.drawCalls).toBe(96);
  expect(Object.entries(committed.tiers.high!).filter(([, e]) => e.workload).map(([id]) => id)).toEqual(['drive']);
});
