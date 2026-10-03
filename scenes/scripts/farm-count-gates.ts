/** Deterministic B-07/X-02 checks. This module neither starts a renderer nor reads timing data. */
export interface RendererCountSnapshot {
  drawCalls: number; triangles: number; pipelines: number;
  geometries: number; textures: number; programs: number;
}
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function countComparison(pilot: unknown, rewrite: unknown) {
  const valid = validCount(pilot) && validCount(rewrite);
  return { pilot, rewrite, delta: valid ? rewrite - pilot : null, valid };
}
function boundedCount(pilot: number, rewrite: number, percent: number, direction: 'both' | 'upper') {
  const comparison = countComparison(pilot, rewrite);
  const delta = comparison.delta;
  // Multiplication uses integer counts, so the exact inclusive percentage boundaries do not
  // accidentally fail through binary floating-point division (e.g. 1.02 - 1 > .02).
  const pass = comparison.valid && (direction === 'both' ? Math.abs(delta!) * 100 <= pilot * percent : rewrite * 100 <= pilot * (100 + percent));
  return { ...comparison, relativeChange: comparison.valid && pilot !== 0 ? delta! / pilot : null,
    allowedPercent: percent, direction, inclusive: true, pass };
}
export type CountFixtureKind = 'named view' | 'play fixture';
export function compareStaticRendererCounts(pilot: RendererCountSnapshot, rewrite: RendererCountSnapshot, fixture: CountFixtureKind = 'named view') {
  const checks = {
    drawCalls: boundedCount(pilot.drawCalls, rewrite.drawCalls, 2, 'both'),
    triangles: boundedCount(pilot.triangles, rewrite.triangles, 2, 'both'),
    pipelines: boundedCount(pilot.pipelines, rewrite.pipelines, 5, 'upper'),
  };
  const observed = {
    geometries: countComparison(pilot.geometries, rewrite.geometries),
    textures: countComparison(pilot.textures, rewrite.textures),
    programs: countComparison(pilot.programs, rewrite.programs),
  };
  const validObservations = Object.values(observed).every(value => value.valid);
  return { id: 'X-02', fixture, scope: `One ${fixture}/backend with the clock frozen; total renderer submissions including shadows`,
    pass: validObservations && Object.values(checks).every(value => value.pass), checks,
    observed: Object.fromEntries(Object.entries(observed).map(([key, { valid: _valid, ...value }]) => [key, value])),
    validObservations };
}

/**
 * OD-8 (D-53): X-02 is re-baselined on the optimized build. The reference is a committed file of that build's fresh-page
 * high counts per view and backend (`packages/farm/fixtures/x02-baseline.json`, written by `scripts/farm-x02-baseline.ts`),
 * and an observation passes on the same rule as before: draws and triangles within an inclusive ±2%, the pipeline cache at
 * most +5%. Pixel parity against the sealed pilot (B-06) and the B-07 goldens are unchanged.
 */
export const X02_BASELINE_SCHEMA = 'kiln.farm-x02-baseline/1';
export const X02_BASELINE_PATH = 'packages/farm/fixtures/x02-baseline.json';
/** The X-02 fixtures: every named view of the layout and the SPEC 19.3/19.7 play fixtures (workloads are not X-02 views). */
export const FARM_X02_VIEWS = ['hero', 'opposite', 'top', 'eye-height', 'crops', 'fences', 'props', 'watermill-wheel', 'watermill-interior', 'house-interior', 'house-porch', 'house-window-out',
  'play-yard', 'play-house', 'play-bridge', 'play-house-door'] as const;
export type X02Backend = 'webgpu' | 'webgl2';
export interface X02ReferenceEntry extends RendererCountSnapshot { kind: CountFixtureKind }
export interface X02Baseline {
  schema: string; decision: string; rule: string;
  provenance: { build: string; commit: string; chunks: string[]; source: string; tool: string; date: string; [key: string]: unknown };
  /** One page per view (the pipeline cache is cumulative), the scene clock frozen, the cached shadow settled. */
  conditions: { tier: string; viewport: [number, number]; freshPage: boolean; clock: 'frozen'; settled: boolean };
  backends: Partial<Record<X02Backend, Record<string, X02ReferenceEntry>>>;
}
export interface X02Run { tier: string; backend: X02Backend; viewport: [number, number]; freshPage: boolean }
/** Problems with a reference file; an empty list means it can be used. */
export function validateX02Baseline(value: X02Baseline): string[] {
  const problems: string[] = [];
  if (value?.schema !== X02_BASELINE_SCHEMA) problems.push(`schema is not ${X02_BASELINE_SCHEMA}`);
  for (const key of ['build', 'commit', 'source', 'tool', 'date'] as const) if (typeof value?.provenance?.[key] !== 'string' || !value.provenance[key]) problems.push(`provenance.${key} is missing`);
  if (!Array.isArray(value?.provenance?.chunks) || !value.provenance.chunks.length) problems.push('provenance.chunks is missing');
  const c = value?.conditions;
  if (c?.tier !== 'high') problems.push('conditions.tier is not high');
  if (c?.freshPage !== true) problems.push('conditions are not one fresh page per view');
  if (c?.clock !== 'frozen' || c?.settled !== true) problems.push('conditions are not a frozen, settled clock');
  if (!Array.isArray(c?.viewport) || c.viewport.length !== 2 || !c.viewport.every(n => validCount(n) && n > 0)) problems.push('conditions.viewport is missing');
  const backends = Object.entries(value?.backends ?? {});
  if (!backends.length) problems.push('no backend has reference counts');
  for (const [backend, views] of backends) for (const [view, e] of Object.entries(views ?? {})) {
    for (const key of ['drawCalls', 'triangles', 'pipelines', 'geometries', 'textures', 'programs'] as const) if (!validCount(e?.[key])) problems.push(`${backend}/${view}.${key} is not a count`);
    if (e?.kind !== 'named view' && e?.kind !== 'play fixture') problems.push(`${backend}/${view}.kind is not a fixture kind`);
  }
  return problems;
}
/** Conditions that would make a count incomparable with the reference. Viewports compare by aspect ratio (frustum culling). */
function x02Differences(reference: X02Baseline['conditions'], run: X02Run) {
  const differences: string[] = [];
  if (run.tier !== reference.tier) differences.push(`tier ${run.tier}, reference ${reference.tier}`);
  if (run.freshPage !== reference.freshPage) differences.push(`${run.freshPage ? 'a fresh page' : 'a shared page'} per view, reference ${reference.freshPage ? 'a fresh page' : 'a shared page'}`);
  const [w, h] = run.viewport, [rw, rh] = reference.viewport;
  if (!(w > 0 && h > 0) || w * rh !== h * rw) differences.push(`viewport ${w}x${h} has another aspect ratio than the reference ${rw}x${rh}`);
  return differences;
}
/** One view and backend against the committed reference: X-02's bounds, refusing a missing entry or other run conditions. */
export function compareX02Reference(baseline: X02Baseline, o: X02Run & { view: string }, observed: RendererCountSnapshot) {
  const reference = baseline.backends[o.backend]?.[o.view], differences = x02Differences(baseline.conditions, o);
  const head = { id: 'X-02' as const, view: o.view, backend: o.backend, reference: { file: X02_BASELINE_PATH, build: baseline.provenance.build, commit: baseline.provenance.commit, date: baseline.provenance.date }, conditions: { match: differences.length === 0, differences } };
  if (!reference) return { ...head, missing: true, pass: false, fixture: null, checks: null, observed: null, validObservations: false, scope: `No reference counts for ${o.view} on ${o.backend}` };
  const { kind, ...counts } = reference, result = compareStaticRendererCounts(counts, observed, kind);
  return { ...head, ...result, missing: false, pass: result.pass && differences.length === 0 };
}
/** Count-probe rows (summary.json) against the reference: every reference view at the reference tier must be present and pass. */
export function checkX02Rows(baseline: X02Baseline, rows: readonly { tier: string; fixture: string; draws: number; triangles: number; pipelineCache: number; programs: number; memory: { geometries: number; textures: number } }[], run: X02Run) {
  const reference = baseline.backends[run.backend] ?? {}, tierRows = rows.filter(r => r.tier === baseline.conditions.tier);
  const views = tierRows.filter(r => Object.hasOwn(reference, r.fixture)).map(r => compareX02Reference(baseline, { ...run, tier: r.tier, view: r.fixture },
    { drawCalls: r.draws, triangles: r.triangles, pipelines: r.pipelineCache, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs }));
  const missing = Object.keys(reference).filter(view => !tierRows.some(r => r.fixture === view)), extra = tierRows.filter(r => !Object.hasOwn(reference, r.fixture)).map(r => r.fixture);
  return { pass: missing.length === 0 && views.length > 0 && views.every(v => v.pass), conditions: x02Differences(baseline.conditions, { ...run, tier: baseline.conditions.tier }), views, missing, extra };
}

interface PilotOptimizationReference extends RendererCountSnapshot { assetTexturePool: { uniqueBefore: number; uniqueAfter: number } | null }
export interface ColliderCounts { colliders: number; dynamic: number; staticTriangles: number; dynamicTriangles: number; doors: number; doorPivots: number; keys: { key: string; dynamic: boolean; triangles: number }[] }
/** B-07 collider portion: the live collision world against the frozen sealed-pilot fixture (`packages/farm/fixtures/play-colliders.json`). */
export function compareColliderCounts(actual: Partial<ColliderCounts> | null | undefined, fixture: ColliderCounts) {
  const checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
  for (const name of ['colliders', 'dynamic', 'staticTriangles', 'dynamicTriangles', 'doors', 'doorPivots'] as const) {
    const value = actual?.[name]; checks.push({ name: `colliders.${name}`, expected: fixture[name], actual: value ?? null, pass: validCount(value) && value === fixture[name] });
  }
  // Collider order, kind and triangle count; key labels are the port's own names.
  const shape = (keys: unknown) => Array.isArray(keys) ? keys.map(key => [key?.dynamic === true, key?.triangles ?? null]) : null;
  const expected = shape(fixture.keys), observed = shape(actual?.keys);
  checks.push({ name: 'colliders.keys (dynamic, triangles) in order', expected, actual: observed, pass: observed !== null && JSON.stringify(observed) === JSON.stringify(expected) });
  return checks;
}
/** R3-08 preserves exact sealed96m behavior; historical24m evidence is retained, not silently overwritten. */
export const FARM_OPTIMIZATION_GOLDENS = {
  decision: 'R3-08', provenance: 'evidence/m2/optimization/source-counts.json',
  nominalSpecification: { batchGroups: 83, dynamicGroups: 54, sourceMeshes: 1967, reportedSourceDenominator: 2000, tangentDerivatives: 9, hiddenRoots: 560 },
  currentSealed96m: { cellSize: 96, cellOffset: 48, batchGroups: 83, dynamicGroups: 54, sourceMeshes: 2000, eligibleSourceMeshes: 2004, visibleSourceMeshes: 2194,
    tangentDerivatives: 11, hiddenRoots: 575, frozenPlacements: 555, frozenNodes: 4191 },
} as const;
/** D-68 retains the prewarm observation and names the additional two cached-shadow textures. */
export const FARM_TEXTURE_GOLDENS = {
  decision: 'D-68', prewarmed: 39, 'cached-shadows': 41,
  provenance: { prewarmed: 'DECISIONS.md D-68: 39 at every view since prewarm', 'cached-shadows': 'packages/farm/fixtures/x02-baseline.json: draw-after 0174e7d, 16 views on WebGPU and WebGL2, settled cached shadows' },
} as const;
export function compareFarmOptimizationCounts(options: { release: 'r33' | 'r34'; counts: any; pilot: PilotOptimizationReference; pilotRepeat: PilotOptimizationReference; rewrite: RendererCountSnapshot; textureProfile?: 'prewarmed' | 'cached-shadows'; colliders?: { actual: Partial<ColliderCounts> | null | undefined; fixture: ColliderCounts } }) {
  const { counts, pilot, pilotRepeat, rewrite } = options;
  const at = (path: string) => path.split('.').reduce((value, key) => value?.[key], counts);
  const checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
  const equal = (name: string, actual: unknown, expected: number) => checks.push({ name, expected, actual: actual ?? null, pass: validCount(actual) && actual === expected });
  const observedCount = (name: string, actual: unknown, max?: number) => checks.push({ name, expected: max === undefined ? 'nonnegative integer recorded' : `integer between 0 and ${max}`, actual: actual ?? null, pass: validCount(actual) && (max === undefined || actual <= max) });
  const golden = FARM_OPTIMIZATION_GOLDENS.currentSealed96m;
  checks.push({ name: 'optimization.woodland.packed', expected: true, actual: at('optimization.woodland.packed') ?? null, pass: at('optimization.woodland.packed') === true });
  for (const [path, expected] of Object.entries({ placements: 589, woodlandTrees: 843, woodlandCells: 16, grassTufts: 14000, grassMeshes: 16,
    'optimization.woodland.groups': 8, 'optimization.woodland.sourceMeshes': 64, 'optimization.woodland.instances': 3372,
    'optimization.woodland.tangentDerivatives': 1, 'optimization.batching.groups': golden.batchGroups, 'optimization.batching.dynamicGroups': golden.dynamicGroups,
    'optimization.batching.sourceMeshes': golden.sourceMeshes, 'optimization.batching.eligibleSourceMeshes': golden.eligibleSourceMeshes,
    'optimization.batching.tangentDerivatives': golden.tangentDerivatives,
    'optimization.frozen.placements': golden.frozenPlacements, 'optimization.frozen.nodes': golden.frozenNodes,
    'optimization.frameGraph.hiddenRoots': golden.hiddenRoots })) equal(path, at(path), expected);
  if (options.release === 'r33') equal('optimization.batching.totalSourceMeshes', at('optimization.batching.totalSourceMeshes'), golden.visibleSourceMeshes);
  else observedCount('optimization.batching.totalSourceMeshes', at('optimization.batching.totalSourceMeshes'));
  for (const path of ['optimization.frameGraph.dynamicRoots', 'texturePooling.sharedAssignments']) observedCount(path, at(path));
  const derivativeCount = at('optimization.batching.tangentDerivatives'); observedCount('optimization.batching.tangentDerivatives', derivativeCount, 15);
  checks.push({ name: 'assertInstancingSafe', expected: [], actual: counts?.tangentOffenders ?? null, pass: Array.isArray(counts?.tangentOffenders) && counts.tangentOffenders.length === 0 });
  for (const [sampleName, sample] of [['pilot first', pilot], ['pilot repeat', pilotRepeat]] as const) {
    // Invalid or absent reference data cannot be interpreted as equality.
    for (const key of ['uniqueBefore', 'uniqueAfter'] as const) {
      const expected = sample.assetTexturePool?.[key], actual = counts?.texturePooling?.[key];
      checks.push({ name: `texturePooling.${key} versus ${sampleName}`, expected: expected ?? null, actual: actual ?? null,
        pass: validCount(expected) && validCount(actual) && actual === expected });
    }
    observedCount(`${sampleName} renderer textures (observation only)`, sample.textures);
  }
  const profile = options.textureProfile ?? 'cached-shadows';
  const textureGolden = { decision: FARM_TEXTURE_GOLDENS.decision, profile, expected: FARM_TEXTURE_GOLDENS[profile], provenance: FARM_TEXTURE_GOLDENS.provenance[profile] };
  equal(`renderer textures (${profile}, D-68)`, rewrite.textures, textureGolden.expected);
  if (options.colliders) checks.push(...compareColliderCounts(options.colliders.actual, options.colliders.fixture));
  const reviewNotes: string[] = [];
  if (validCount(derivativeCount) && derivativeCount !== 9) reviewNotes.push(`Batch tangent derivatives are ${derivativeCount}, versus SPEC's reported pilot 9; R3-08 documents the reproduced historical 24m versus current sealed 96m difference (SPEC12.6).`);
  if (options.release === 'r34') reviewNotes.push('r34 must retain shared optimization counts; record any source-backed farmhouse-only difference from r33 (D-07).');
  return { id: 'B-07', release: options.release, scope: options.colliders ? 'Optimization statistics and collider counts' : 'Optimization statistics only; collider counts not supplied to this comparison',
    pass: checks.every(check => check.pass), checks, reviewNotes, goldens: FARM_OPTIMIZATION_GOLDENS, textureGolden,
    pilotTextureObservations: { first: pilot.textures, repeat: pilotRepeat.textures, gatedAsEquality: false },
    pending: [...(options.colliders ? [] : ['Collider counts not supplied to this comparison']), ...(options.release === 'r34' ? ['r34 visible-source total versus its sealed farmhouse-only delta'] : [])],
    observed: { batchingSourceMeshes: { batched: at('optimization.batching.sourceMeshes') ?? null, total: at('optimization.batching.totalSourceMeshes') ?? null, eligible: at('optimization.batching.eligibleSourceMeshes') ?? null,
      interpretation: 'R3-08: 1,967 refers to historical 24m batching; current sealed 96m batching represents 2,000 of 2,004 eligible meshes, among 2,194 visible placement meshes (r33)' },
      tangentDerivatives: { batch: derivativeCount ?? null, woodland: at('optimization.woodland.tangentDerivatives') ?? null, reportedPilot: 9, batchUpperBound: 15 },
      colliderCounts: counts?.colliders ?? null } };
}

interface CountAttempt { view: string; backend: string; attempt: number; countChecks?: { b07?: { pass: boolean }; x02?: { pass: boolean } } }
/** The final allowed attempt decides a view. All earlier attempts remain represented in the ledger. */
export function summarizeStaticCountCoverage(namedViews: readonly string[], attempts: readonly CountAttempt[], playFixtures: readonly string[] = []) {
  const final = new Map(attempts.map(result => [`${result.view}/${result.backend}`, result]));
  const required = [...namedViews, ...playFixtures].flatMap(view => ['webgpu', 'webgl2'].map(backend => `${view}/${backend}`));
  const missing = required.filter(key => !final.has(key)), checked = required.length - missing.length;
  const passed = (result: CountAttempt | undefined) => result?.countChecks?.b07?.pass === true && result?.countChecks?.x02?.pass === true;
  const passing = required.filter(key => passed(final.get(key))).length;
  return { pass: checked === required.length && passing === required.length, expected: required.length, checked, passing,
    failing: checked - passing, missing, retainedAttempts: attempts.length, failedAttempts: attempts.filter(result => !passed(result)).length,
    scope: playFixtures.length ? `B-07 counts and X-02 at every named view and the play fixtures (${playFixtures.join(', ')})` : 'B-07 optimization counts and X-02 static named views only' };
}
