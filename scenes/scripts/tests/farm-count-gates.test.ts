import { expect, test } from 'bun:test';
import { compareColliderCounts, compareFarmOptimizationCounts, compareStaticRendererCounts, summarizeStaticCountCoverage } from '../farm-count-gates';

const counts = (drawCalls = 1000, triangles = 10000, pipelines = 1000) => ({ drawCalls, triangles, pipelines, geometries: 120, textures: 29, programs: 90 });

test('X-02 accepts the inclusive two-percent draw/triangle boundaries and five-percent pipeline ceiling', () => {
  expect(compareStaticRendererCounts(counts(), counts(1020, 9800, 1050)).pass).toBe(true);
  expect(compareStaticRendererCounts(counts(), counts(980, 10200, 0)).pass).toBe(true);
  for (const actual of [counts(1021), counts(979), counts(1000, 10201), counts(1000, 9799), counts(1000, 10000, 1051)]) {
    expect(compareStaticRendererCounts(counts(), actual).pass).toBe(false);
  }
});

test('X-02 reports exact bytes/counts and handles zero baselines without dividing by zero', () => {
  const result = compareStaticRendererCounts(counts(), { ...counts(1002, 9999, 999), geometries: 999, textures: 30 });
  expect(result.checks.drawCalls).toMatchObject({ pilot: 1000, rewrite: 1002, delta: 2, relativeChange: .002, pass: true });
  expect(result.observed.geometries).toEqual({ pilot: 120, rewrite: 999, delta: 879 });
  expect(result.observed.textures).toEqual({ pilot: 29, rewrite: 30, delta: 1 });
  expect(result.pass).toBe(true); // Texture equality is the separate P-05/B-07 gate.
  expect(compareStaticRendererCounts(counts(0, 0, 0), counts(0, 0, 0)).pass).toBe(true);
  expect(compareStaticRendererCounts(counts(0, 0, 0), counts(1, 0, 0)).pass).toBe(false);
  expect(compareStaticRendererCounts(counts(0, 0, 0), counts(0, 0, 1)).pass).toBe(false);
});

test('X-02 rejects missing, fractional, nonfinite and negative counts instead of silently passing', () => {
  for (const value of [undefined, null, -1, .5, NaN, Infinity]) {
    expect(compareStaticRendererCounts(counts(), { ...counts(), pipelines: value } as any).pass).toBe(false);
    expect(compareStaticRendererCounts({ ...counts(), drawCalls: value } as any, counts()).pass).toBe(false);
  }
  expect(compareStaticRendererCounts(counts(), { ...counts(), textures: undefined } as any).pass).toBe(false);
});

test('static qualification needs every named view on both backends and preserves failed retries', () => {
  const names = ['hero', 'window'];
  const results = names.flatMap(view => ['webgpu', 'webgl2'].map(backend => ({ view, backend, attempt: 1, countChecks: { b07: { pass: true }, x02: { pass: true } } })));
  expect(summarizeStaticCountCoverage(names, results)).toMatchObject({ pass: true, expected: 4, checked: 4, passing: 4, failing: 0, missing: [] });
  expect(summarizeStaticCountCoverage(names, results.slice(0, 3))).toMatchObject({ pass: false, checked: 3, missing: ['window/webgl2'] });
  const failure = { ...results[0]!, countChecks: { b07: { pass: false }, x02: { pass: true } } };
  const retried = [failure, ...results.slice(1), { ...results[0]!, attempt: 2 }];
  expect(summarizeStaticCountCoverage(names, retried)).toMatchObject({ pass: true, retainedAttempts: 5, failedAttempts: 1 });
  expect(summarizeStaticCountCoverage(names, [failure, ...results.slice(1)])).toMatchObject({ pass: false, passing: 3, failing: 1 });
});

function optimization() {
  return { placements: 589, woodlandTrees: 843, woodlandCells: 16, grassTufts: 14000, grassMeshes: 16,
    texturePooling: { uniqueBefore: 98, uniqueAfter: 29, sharedAssignments: 92 }, tangentOffenders: [],
    optimization: { woodland: { packed: true, groups: 8, instances: 3372, sourceMeshes: 64, tangentDerivatives: 1 },
      batching: { groups: 83, dynamicGroups: 54, sourceMeshes: 2000, totalSourceMeshes: 2194, eligibleSourceMeshes: 2004, tangentDerivatives: 11 },
      frozen: { placements: 555, nodes: 4191 }, frameGraph: { hiddenRoots: 575, dynamicRoots: 29 } } };
}
const pilot = () => ({ ...counts(), assetTexturePool: { uniqueBefore: 98, uniqueAfter: 29 } });
function b07(raw = optimization()) { return compareFarmOptimizationCounts({ release: 'r33', counts: raw, pilot: pilot(), pilotRepeat: pilot(), rewrite: counts() }); }

test('B-07 checks independently measured optimization fields and both pilot texture samples', () => {
  const result = b07();
  expect(result.pass).toBe(true);
  expect(result.pending).toContain('Collider counts not supplied to this comparison');
  expect(result.observed.batchingSourceMeshes).toMatchObject({ batched: 2000, total: 2194, eligible: 2004 });
  expect(result.goldens.nominalSpecification).toMatchObject({ sourceMeshes: 1967, reportedSourceDenominator: 2000, hiddenRoots: 560 });
  expect(result.goldens.decision).toBe('R3-08');
  const raw = optimization(); raw.optimization.frameGraph.hiddenRoots = 559;
  expect(b07(raw).pass).toBe(false);
  const missing = optimization(); delete (missing.optimization as any).frozen;
  expect(b07(missing).pass).toBe(false);
  expect(compareFarmOptimizationCounts({ release: 'r33', counts: optimization(), pilot: pilot(), pilotRepeat: { ...pilot(), textures: 30 }, rewrite: counts() }).pass).toBe(false);
});

test('B-07 distinguishes recorded historical counts from current sealed goldens and unsafe instances', () => {
  const different = optimization(); different.optimization.batching.tangentDerivatives = 10;
  expect(b07(different).pass).toBe(false);
  expect(b07(different).reviewNotes.join(' ')).toContain('10');
  const historical = optimization(); historical.optimization.batching.sourceMeshes = 1967; historical.optimization.batching.tangentDerivatives = 9; historical.optimization.frameGraph.hiddenRoots = 560;
  expect(b07(historical).pass).toBe(false);
  const overflow = optimization(); overflow.optimization.batching.tangentDerivatives = 16;
  expect(b07(overflow).pass).toBe(false);
  const unsafe = optimization(); (unsafe.tangentOffenders as string[]).push('unsafe mesh');
  expect(b07(unsafe).pass).toBe(false);
  const missing = optimization(); delete (missing as any).tangentOffenders;
  expect(b07(missing).pass).toBe(false);
});

const colliderFixture = () => ({ colliders: 3, dynamic: 2, staticTriangles: 90, dynamicTriangles: 30, doors: 1, doorPivots: 2,
  keys: [{ key: 'Static farm world', dynamic: false, triangles: 90 }, { key: 'Joint_FrontDoor', dynamic: true, triangles: 12 }, { key: 'tractor', dynamic: true, triangles: 18 }] });
test('B-07 collider portion equals the frozen fixture in count, kind, order and triangles', () => {
  const live = { ...colliderFixture(), keys: colliderFixture().keys.map(key => ({ ...key, key: `port ${key.key}` })) };
  expect(compareColliderCounts(live, colliderFixture()).every(check => check.pass)).toBe(true);
  const result = compareFarmOptimizationCounts({ release: 'r33', counts: optimization(), pilot: pilot(), pilotRepeat: pilot(), rewrite: counts(), colliders: { actual: live, fixture: colliderFixture() } });
  expect(result.pass).toBe(true); expect(result.pending).toEqual([]); expect(result.scope).toBe('Optimization statistics and collider counts');
  const reordered = { ...colliderFixture(), keys: [...colliderFixture().keys].reverse() };
  expect(compareColliderCounts(reordered, colliderFixture()).find(check => check.name.startsWith('colliders.keys'))!.pass).toBe(false);
  expect(compareColliderCounts({ ...colliderFixture(), staticTriangles: 91 }, colliderFixture()).some(check => !check.pass)).toBe(true);
  expect(compareColliderCounts(null, colliderFixture()).every(check => !check.pass)).toBe(true);
  expect(compareFarmOptimizationCounts({ release: 'r33', counts: optimization(), pilot: pilot(), pilotRepeat: pilot(), rewrite: counts(), colliders: { actual: { ...colliderFixture(), doors: 2 }, fixture: colliderFixture() } }).pass).toBe(false);
});

test('X-02 names its fixture kind and the coverage summary requires play fixtures on both backends', () => {
  expect(compareStaticRendererCounts(counts(), counts(), 'play fixture')).toMatchObject({ fixture: 'play fixture', pass: true });
  expect(compareStaticRendererCounts(counts(), counts()).fixture).toBe('named view');
  const entries = ['hero', 'play-yard'].flatMap(view => ['webgpu', 'webgl2'].map(backend => ({ view, backend, attempt: 1, countChecks: { b07: { pass: true }, x02: { pass: true } } })));
  expect(summarizeStaticCountCoverage(['hero'], entries, ['play-yard'])).toMatchObject({ pass: true, expected: 4, passing: 4 });
  expect(summarizeStaticCountCoverage(['hero'], entries.slice(0, 3), ['play-yard'])).toMatchObject({ pass: false, missing: ['play-yard/webgl2'] });
});
