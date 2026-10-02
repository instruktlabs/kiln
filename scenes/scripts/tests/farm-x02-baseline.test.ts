import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkX02Rows, compareX02Reference, FARM_X02_VIEWS, validateX02Baseline, type X02Baseline } from '../farm-count-gates';
import { FARM_VIEWS } from '../scene-fixtures';

// OD-8 (D-53): X-02 compares against a committed reference of the optimized build's fresh-page high counts per view
// (packages/farm/fixtures/x02-baseline.json) instead of the sealed pilot, with the same inclusive ±2% draw and triangle
// band and the +5% pipeline-cache ceiling.
const entry = (drawCalls = 300, triangles = 1_000_000, pipelines = 60, kind: 'named view' | 'play fixture' = 'named view') => ({ kind, drawCalls, triangles, pipelines, geometries: 200, textures: 30, programs: 40 });
function baseline(): X02Baseline {
  return {
    schema: 'kiln.farm-x02-baseline/1', decision: 'OD-8 (D-53)',
    rule: 'Inclusive ±2% draws and triangles, pipeline cache at most +5% of this reference',
    provenance: { build: 'draw-after', commit: '892d103', chunks: ['index-x.js'], source: 'git HEAD, clean', tool: 'scripts/farm-x02-baseline.ts measure', date: '2026-10-02' },
    conditions: { tier: 'high', viewport: [1280, 720], freshPage: true, clock: 'frozen', settled: true },
    backends: { webgpu: { hero: entry(), 'play-yard': entry(90, 1_500_000, 23, 'play fixture') }, webgl2: { hero: entry(300, 1_000_000, 21) } },
  };
}
const run = { tier: 'high', backend: 'webgpu' as const, viewport: [1920, 1080] as [number, number], freshPage: true };
const observed = (drawCalls = 300, triangles = 1_000_000, pipelines = 60) => ({ drawCalls, triangles, pipelines, geometries: 200, textures: 30, programs: 40 });

test('X-02 compares a view against the committed reference with the ±2% and +5% bounds', () => {
  const ok = compareX02Reference(baseline(), { view: 'hero', ...run }, observed(306, 980_000, 63));
  expect(ok).toMatchObject({ id: 'X-02', view: 'hero', backend: 'webgpu', pass: true, missing: false, conditions: { match: true } });
  expect(ok.checks!.drawCalls).toMatchObject({ pilot: 300, rewrite: 306, pass: true });
  for (const counts of [observed(307), observed(293), observed(300, 1_020_001), observed(300, 1_000_000, 64)]) expect(compareX02Reference(baseline(), { view: 'hero', ...run }, counts).pass).toBe(false);
  // The pre-optimization build (583 draws at the hero view) is flagged; its per-backend entry is used, not the other backend's.
  expect(compareX02Reference(baseline(), { view: 'hero', ...run }, observed(583, 2_300_000, 69)).pass).toBe(false);
  expect(compareX02Reference(baseline(), { view: 'hero', ...run, backend: 'webgl2' }, observed(300, 1_000_000, 22)).pass).toBe(true);
  expect(compareX02Reference(baseline(), { view: 'play-yard', ...run }, observed(90, 1_500_000, 23))).toMatchObject({ pass: true, fixture: 'play fixture' });
});

test('X-02 fails a view or backend missing from the reference instead of passing it', () => {
  expect(compareX02Reference(baseline(), { view: 'top', ...run }, observed())).toMatchObject({ pass: false, missing: true });
  expect(compareX02Reference(baseline(), { view: 'play-yard', ...run, backend: 'webgl2' }, observed())).toMatchObject({ pass: false, missing: true });
});

test('X-02 refuses observations taken under conditions other than the reference', () => {
  const shared = compareX02Reference(baseline(), { view: 'hero', ...run, freshPage: false }, observed());
  expect(shared).toMatchObject({ pass: false, conditions: { match: false } });
  expect(shared.conditions.differences.join(' ')).toContain('fresh page');
  expect(compareX02Reference(baseline(), { view: 'hero', ...run, tier: 'economy' }, observed()).pass).toBe(false);
  // Frustum culling depends on the aspect ratio only, so a 16:9 viewport of another size is the same condition.
  expect(compareX02Reference(baseline(), { view: 'hero', ...run, viewport: [1280, 720] }, observed()).pass).toBe(true);
  expect(compareX02Reference(baseline(), { view: 'hero', ...run, viewport: [1280, 1024] }, observed()).pass).toBe(false);
});

test('X-02 checks a count-probe run: every reference view at high, workloads listed but not judged', () => {
  const row = (fixture: string, draws: number, triangles: number, pipelineCache: number, tier = 'high') => ({ scene: 'farm', tier, fixture, draws, triangles, pipelineCache, programs: 40, memory: { geometries: 200, textures: 30 } });
  const after = checkX02Rows(baseline(), [row('hero', 300, 1_000_000, 60), row('play-yard', 91, 1_500_000, 23), row('walk', 91, 1_500_000, 23), row('hero', 999, 1, 1, 'economy')], run);
  expect(after).toMatchObject({ pass: true, missing: [], extra: ['walk'] });
  expect(after.views.map(v => v.view)).toEqual(['hero', 'play-yard']);
  const before = checkX02Rows(baseline(), [row('hero', 583, 1_884_260, 69), row('play-yard', 119, 1_600_000, 30)], run);
  expect(before.pass).toBe(false);
  expect(before.views.filter(v => !v.pass).map(v => v.view)).toEqual(['hero', 'play-yard']);
  expect(checkX02Rows(baseline(), [row('hero', 300, 1_000_000, 60)], run)).toMatchObject({ pass: false, missing: ['play-yard'] });
  expect(checkX02Rows(baseline(), [row('hero', 300, 1_000_000, 60), row('play-yard', 90, 1_500_000, 23)], { ...run, freshPage: false }).pass).toBe(false);
});

test('a reference without provenance, fresh-page high conditions or valid counts is rejected', () => {
  expect(validateX02Baseline(baseline())).toEqual([]);
  const b = baseline() as any; delete b.provenance.commit; b.conditions.freshPage = false; b.backends.webgpu.hero.drawCalls = -1;
  expect(validateX02Baseline(b)).toEqual(expect.arrayContaining([expect.stringContaining('provenance.commit'), expect.stringContaining('fresh page'), expect.stringContaining('webgpu/hero')]));
  expect(validateX02Baseline({ ...baseline(), schema: 'other' } as any).length).toBeGreaterThan(0);
});

test('the committed Farm reference covers every named view and play fixture on both backends', () => {
  const committed = JSON.parse(readFileSync(resolve(import.meta.dir, '../../packages/farm/fixtures/x02-baseline.json'), 'utf8')) as X02Baseline;
  expect(validateX02Baseline(committed)).toEqual([]);
  expect([...FARM_X02_VIEWS].sort()).toEqual([...FARM_VIEWS, 'play-yard', 'play-house', 'play-bridge', 'play-house-door'].sort());
  for (const backend of ['webgpu', 'webgl2'] as const) expect(Object.keys(committed.backends[backend] ?? {}).sort()).toEqual([...FARM_X02_VIEWS].sort());
  expect(committed.conditions).toMatchObject({ tier: 'high', freshPage: true, clock: 'frozen', settled: true });
});
