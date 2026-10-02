import { expect, test } from 'bun:test';
import { compact, crossCheck, pipelinesComparable, runProvenance, standardWhatIfs } from '../../src/testing/probe-report';

const pass = (encoder: string, draws: number, bundledDraws = 0) => ({ frame: 7, encoder, color: [], depth: null, draws, setPipeline: draws, pipelines: 1, bundles: bundledDraws ? 1 : 0, bundledDraws });

test('GPU renderContext draws join JS passes by context id, across a split pass', () => {
  const gpu = { copies: 1, submits: 1, passes: [pass('renderContext_3', 178), pass('renderContext_5', 37), pass('renderContext_3', 1), pass('mipmapEncoder', 0, 1), pass('renderContext_4', 1)] };
  expect(crossCheck(gpu, [{ id: 5, draws: 37 }, { id: 3, draws: 179 }, { id: 4, draws: 1 }])).toEqual({
    equal: true, jsDraws: 217, gpuDraws: 217, mismatches: [], gpuPasses: 5, splitContexts: ['renderContext_3'], otherPasses: 1, otherEncoders: ['mipmapEncoder'], bundledDraws: 1, copies: 1 });
  const off = crossCheck(gpu, [{ id: 5, draws: 37 }, { id: 3, draws: 178 }]);
  expect([off.equal, off.mismatches]).toEqual([false, [{ id: 3, js: 178, gpu: 179 }, { id: 4, js: 0, gpu: 1 }]]);
});

test('JS passes that share a render context (two shadow maps) are summed before the join', () => {
  const gpu = { copies: 0, submits: 1, passes: [pass('renderContext_5', 30), pass('renderContext_5', 12), pass('renderContext_3', 100)] };
  const check = crossCheck(gpu, [{ id: 5, draws: 30 }, { id: 5, draws: 12 }, { id: 3, draws: 100 }]);
  expect([check.equal, check.jsDraws, check.gpuDraws, check.mismatches]).toEqual([true, 142, 142, []]);
});

test('standard what-ifs follow the passes and systems that drew', () => {
  const totals = (byKind: Record<string, number>) => ({ draws: 0, triangles: 0, pipelinesUsed: 0, byKind: Object.fromEntries(Object.entries(byKind).map(([k, d]) => [k, { passes: 1, draws: d, triangles: 0, pipelines: 0 }])) });
  const bySystem = { heroes: { draws: 4, triangles: 0, byKind: {} }, placements: { draws: 0, triangles: 0, byKind: {} } };
  expect(standardWhatIfs({ totals: totals({ main: 3 }), bySystem }, ['heroes', 'placements']).map(w => w.name)).toEqual(['hide-heroes']);
  expect(standardWhatIfs({ totals: totals({ main: 3, shadow: 2, reflection: 1 }), bySystem }, ['heroes']).map(w => w.name))
    .toEqual(['freeze-shadow', 'casters-under-300-triangles', 'casters-under-2-texels', 'skip-reflection', 'hide-heroes']);
  expect(compact({ totals: totals({ main: 3 }), bySystem })).toEqual({ draws: 0, triangles: 0, pipelinesUsed: 0, byKind: { main: { draws: 3, triangles: 0, pipelines: 0 } }, bySystem: { heroes: 4 } });
});

test('run provenance names each scene build, the viewports and the page policy; pipelines compare only between fresh-page runs', () => {
  const record = (scene: string, chunks: string[], freshPage: boolean, viewport: [number, number] = [1920, 1080]) => ({ scene, build: { label: 'b', chunks }, run: { viewport, freshPage } });
  const shared = runProvenance([record('farm', ['index-a.js'], false), record('farm', ['index-a.js'], false), record('golden-gate', ['index-g.js'], false)]);
  expect(shared).toEqual({ builds: { farm: ['index-a.js'], 'golden-gate': ['index-g.js'] }, viewports: ['1920x1080'], freshPage: false, mixed: false });
  const fresh = runProvenance([record('farm', ['index-b.js'], true)]);
  expect(fresh.freshPage).toBe(true);
  expect([pipelinesComparable(fresh, fresh), pipelinesComparable(shared, fresh), pipelinesComparable(fresh, undefined)]).toEqual([true, false, false]);
  // A rebuilt scene, a second viewport or a mix of page policies marks the run mixed.
  const mixed = runProvenance([record('farm', ['index-a.js'], true), record('farm', ['index-b.js'], true), { scene: 'farm' }, record('farm', ['index-a.js'], false, [1280, 720])]);
  expect(mixed).toEqual({ builds: { farm: ['index-a.js', 'index-b.js', '(unknown)'] }, viewports: ['1920x1080', '(unknown)', '1280x720'], freshPage: null, mixed: true });
  expect(pipelinesComparable(mixed, mixed)).toBe(false);
});
