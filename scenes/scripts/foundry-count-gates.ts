/**
 * Foundry Floor X-02 (OD-8, D-53). Foundry Floor had no X-02 pin: its draw and triangle budgets (tests/unit/glb-world.test.ts)
 * need authored inputs and never ran in the gate. The reference is a committed count baseline of the optimized build
 * (`packages/foundry-floor/fixtures/count-baseline.json`, written by `scripts/check-foundry-counts.ts --record` from a
 * count-probe summary) and an observation passes on X-02's rule: draws and triangles within an inclusive ±2%, pipelines at
 * most +5%. Pipelines are those bound in the settled frame (order independent); the cumulative pipeline cache, which depends on
 * what the page drew before, is judged too, but only when the run used the reference's page policy; another policy skips that
 * one bound and the rest stand. This module neither starts a
 * renderer nor reads timing data.
 */
import { compareStaticRendererCounts } from './farm-count-gates';

export const FOUNDRY_COUNT_BASELINE_SCHEMA = 'kiln.foundry-floor-count-baseline/1';
export const FOUNDRY_COUNT_BASELINE_PATH = 'packages/foundry-floor/fixtures/count-baseline.json';
export const FOUNDRY_COUNT_TIERS = ['minimal', 'economy', 'balanced', 'high'] as const;
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export interface FoundryCountEntry {
  drawCalls: number; triangles: number;
  /** Pipelines bound in the settled frame (the main pass and the output quad). */
  pipelines: number;
  /** The kit's cumulative pipeline cache; comparable only under the reference page policy. */
  pipelineCache: number;
  geometries: number; textures: number; programs: number;
  /** A workload fixture (the drive) reaches a representative state on the wall clock, so its counts are listed and never judged. */
  workload?: true;
}
export interface FoundryCountConditions { viewport: [number, number]; freshPage: boolean; clock: string; backend: string; settled: boolean }
export interface FoundryCountProvenance { build: string; commit: string; chunks: string[]; source: string; tool: string; date: string; [key: string]: unknown }
export interface FoundryCountBaseline {
  schema: string; decision: string; rule: string; provenance: FoundryCountProvenance; conditions: FoundryCountConditions;
  tiers: Record<string, Record<string, FoundryCountEntry>>;
}
/** The count-probe summary row fields this check reads (scripts/count-probe.ts summary.json rows). */
export interface FoundryCountRow { scene: string; tier: string; fixture: string; draws: number; triangles: number; pipelinesUsed: number; pipelineCache: number; programs: number; memory: { geometries: number; textures: number } }
export interface FoundryCountRun { freshPage: boolean | null; viewport: [number, number]; tiers?: readonly string[] }

/** The reference from a count-probe run: every Foundry Floor row, in tier order, with the workload fixtures marked. */
export function buildFoundryCountBaseline(rows: readonly FoundryCountRow[], o: { provenance: FoundryCountProvenance; conditions: FoundryCountConditions; workloads: readonly string[] }): FoundryCountBaseline {
  const tiers: FoundryCountBaseline['tiers'] = {};
  for (const tier of FOUNDRY_COUNT_TIERS) {
    const own = rows.filter(r => r.tier === tier && r.scene === 'foundry-floor'); if (!own.length) continue;
    tiers[tier] = Object.fromEntries(own.map(r => [r.fixture, { drawCalls: r.draws, triangles: r.triangles, pipelines: r.pipelinesUsed, pipelineCache: r.pipelineCache, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs,
      ...(o.workloads.includes(r.fixture) ? { workload: true as const } : {}) }]));
  }
  return { schema: FOUNDRY_COUNT_BASELINE_SCHEMA, decision: 'OD-8 (D-53)', rule: 'Inclusive ±2% draws and triangles; pipelines bound per frame at most +5% of this reference (the cache too under the same page policy); workload fixtures listed, not judged',
    provenance: o.provenance, conditions: o.conditions, tiers };
}

/** Problems with a reference file; an empty list means it can be used. */
export function validateFoundryCountBaseline(value: FoundryCountBaseline): string[] {
  const problems: string[] = [];
  if (value?.schema !== FOUNDRY_COUNT_BASELINE_SCHEMA) problems.push(`schema is not ${FOUNDRY_COUNT_BASELINE_SCHEMA}`);
  for (const key of ['build', 'commit', 'source', 'tool', 'date'] as const) if (typeof value?.provenance?.[key] !== 'string' || !value.provenance[key]) problems.push(`provenance.${key} is missing`);
  if (!Array.isArray(value?.provenance?.chunks) || !value.provenance.chunks.length) problems.push('provenance.chunks is missing');
  const c = value?.conditions;
  if (c?.clock !== 'frozen' || c?.settled !== true) problems.push('conditions are not a frozen, settled clock');
  if (typeof c?.freshPage !== 'boolean') problems.push('conditions.freshPage is missing');
  if (typeof c?.backend !== 'string' || !c.backend) problems.push('conditions.backend is missing');
  if (!Array.isArray(c?.viewport) || c.viewport.length !== 2 || !c.viewport.every(n => validCount(n) && n > 0)) problems.push('conditions.viewport is missing');
  const tiers = Object.entries(value?.tiers ?? {});
  if (!tiers.length) problems.push('no tier has reference counts');
  for (const [tier, fixtures] of tiers) for (const [fixture, e] of Object.entries(fixtures ?? {})) for (const key of ['drawCalls', 'triangles', 'pipelines', 'pipelineCache', 'geometries', 'textures', 'programs'] as const) if (!validCount(e?.[key])) problems.push(`${tier}/${fixture}.${key} is not a count`);
  return problems;
}

/** Conditions that would make a count incomparable with the reference. Viewports compare by aspect ratio (frustum culling). */
function differences(reference: FoundryCountConditions, run: FoundryCountRun) {
  const out: string[] = [], [w, h] = run.viewport, [rw, rh] = reference.viewport;
  if (!(w > 0 && h > 0) || w * rh !== h * rw) out.push(`viewport ${w}x${h} has another aspect ratio than the reference ${rw}x${rh}`);
  return out;
}
/** The cumulative cache depends on what the page drew before, so a run with another page policy skips that one bound (the others stand). */
const pageDiffers = (reference: FoundryCountConditions, run: FoundryCountRun) => run.freshPage !== null && run.freshPage !== reference.freshPage;

/**
 * Count-probe rows against the reference: every reference fixture at every checked tier must be present and pass. A fixture the
 * reference marks as a workload is listed (`judged: false`) and never fails; a fixture the reference lacks is reported as extra.
 */
export function checkFoundryCounts(baseline: FoundryCountBaseline, rows: readonly FoundryCountRow[], run: FoundryCountRun) {
  const tiers = (run.tiers ?? FOUNDRY_COUNT_TIERS).filter(t => baseline.tiers[t] || run.tiers), diff = differences(baseline.conditions, run), samePolicy = !pageDiffers(baseline.conditions, run);
  const checked: { tier: string; fixture: string; workload: boolean; judged: boolean; pass: boolean; checks: ReturnType<typeof compareStaticRendererCounts>['checks'] | null; cache: { reference: number; observed: number; pass: boolean } | null }[] = [];
  const missing: string[] = [], extra: string[] = [];
  for (const tier of tiers) {
    const reference = baseline.tiers[tier] ?? {}, own = rows.filter(r => r.tier === tier && r.scene === 'foundry-floor');
    for (const [fixture, e] of Object.entries(reference)) {
      const { workload, pipelineCache, ...counts } = e, r = own.find(x => x.fixture === fixture); if (!r) { if (workload !== true) missing.push(`${tier}/${fixture}`); continue; }
      const result = compareStaticRendererCounts(counts, { drawCalls: r.draws, triangles: r.triangles, pipelines: r.pipelinesUsed, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs });
      // The cache: at most +5%, compared by integer arithmetic like the other bounds, and only under the reference's page policy.
      const cache = samePolicy ? { reference: pipelineCache, observed: r.pipelineCache, pass: r.pipelineCache * 100 <= pipelineCache * 105 } : null;
      checked.push({ tier, fixture, workload: workload === true, judged: workload !== true, pass: workload === true || (result.pass && (cache?.pass ?? true)), checks: result.checks, cache });
    }
    for (const r of own) if (!Object.hasOwn(reference, r.fixture)) extra.push(`${tier}/${r.fixture}`);
  }
  const conditions = { match: diff.length === 0, differences: diff, cacheJudged: samePolicy };
  return { id: 'X-02', reference: { file: FOUNDRY_COUNT_BASELINE_PATH, build: baseline.provenance.build, commit: baseline.provenance.commit, date: baseline.provenance.date },
    pass: missing.length === 0 && checked.length > 0 && checked.every(c => c.pass) && conditions.match, conditions, rows: checked, missing, extra };
}
