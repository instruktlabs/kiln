// Foundry Floor X-02 check and baseline recorder (OD-8, D-53): compares a count-probe summary of the scene against the committed
// reference (packages/foundry-floor/fixtures/count-baseline.json) with X-02's rule (draws and triangles ±2% inclusive, pipelines
// at most +5%; scripts/foundry-count-gates.ts), or records that reference from a summary.
//   bun scripts/check-foundry-counts.ts --summary <label|path>          check an existing probe run (evidence/counts/<label>/summary.json)
//   bun scripts/check-foundry-counts.ts --run --build <label>           probe a test-mode build (bun scripts/build-scene.ts --scene foundry-floor --mode test --label <l>) at every tier, then check
//   bun scripts/check-foundry-counts.ts --record --summary <label|path> --commit <hash> [--source <text>] [--build <label>] [--date <yyyy-mm-dd>] [--out <path>]
// The reference's conditions are the probe's own: 1920x1080, device scale 1, WebGPU, frozen clock, settled frames, one page per
// query group (so the cumulative pipeline cache depends on fixture order; the run is judged on it only under that policy). The exit
// code is 1 when any judged fixture falls outside the rule, a reference fixture is missing or the viewport has another aspect ratio.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCountProbe, summarize } from './count-probe';
import { checkFoundryCounts, buildFoundryCountBaseline, FOUNDRY_COUNT_BASELINE_PATH, FOUNDRY_COUNT_TIERS, validateFoundryCountBaseline, type FoundryCountBaseline, type FoundryCountRow } from './foundry-count-gates';
import { sceneOutput } from './build-scene';

const ROOT = resolve(import.meta.dir, '..');
const args = process.argv.slice(2), option = (name: string, fallback = '') => { const at = args.indexOf(name); if (at < 0) return fallback; const v = args[at + 1]; if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`); return v; };
interface Summary { label: string; provenance: { builds: Record<string, string[]>; viewports: string[]; freshPage: boolean | null; mixed: boolean }; rows: FoundryCountRow[] }
const summaryPath = (label: string) => { const path = resolve(label); return existsSync(path) && statSync(path).isFile() ? path : resolve(ROOT, 'evidence/counts', label, 'summary.json'); };
const readSummary = (label: string) => JSON.parse(readFileSync(summaryPath(label), 'utf8')) as Summary;
const viewportOf = (s: Summary): [number, number] => { const [w, h] = (s.provenance.viewports[0] ?? '').split('x').map(Number); return [w!, h!]; };

if (args.includes('--record')) {
  const summary = readSummary(option('--summary')), commit = option('--commit'), out = resolve(ROOT, option('--out', FOUNDRY_COUNT_BASELINE_PATH));
  if (summary.provenance.mixed || summary.provenance.viewports.length !== 1) throw new Error('The summary mixes builds or viewports; record from a single run');
  const chunks = summary.provenance.builds['foundry-floor'] ?? []; if (!chunks.length) throw new Error('The summary names no foundry-floor build');
  const build = option('--build', 'draw-after'), buildJson = resolve(sceneOutput('foundry-floor', build, 'test'), 'build.json');
  const built = existsSync(buildJson) ? JSON.parse(readFileSync(buildJson, 'utf8')) as { source?: unknown } : null;
  const baseline = buildFoundryCountBaseline(summary.rows, {
    provenance: { build, commit, chunks: chunks[0]!.split('+'), source: option('--source', built?.source === 'working tree' ? `test build ${build} of the working tree at ${commit}` : `test build ${build}`), tool: 'scripts/check-foundry-counts.ts --record',
      probe: `scripts/count-probe.ts --scenes foundry-floor --what-if none --build ${build} (summary ${summary.label})`, date: option('--date', new Date().toISOString().slice(0, 10)) },
    conditions: { viewport: viewportOf(summary), freshPage: summary.provenance.freshPage === true, clock: 'frozen', backend: 'webgpu', settled: true }, workloads: ['drive'] });
  const problems = validateFoundryCountBaseline(baseline); if (problems.length) throw new Error(problems.join('\n'));
  writeFileSync(out, JSON.stringify(baseline, null, 1) + '\n');
  console.log(`Recorded ${Object.values(baseline.tiers).reduce((n, t) => n + Object.keys(t).length, 0)} rows (${Object.keys(baseline.tiers).join(', ')}) to ${out}`);
  process.exit(0);
}

let label = option('--summary');
if (args.includes('--run')) {
  label = option('--label', 'x02-foundry-floor');
  await runCountProbe({ label, build: option('--build'), scenes: ['foundry-floor'], tiers: [...FOUNDRY_COUNT_TIERS], fixtures: 'all', whatIfs: false, size: [1920, 1080], freshPage: false });
  summarize(label);
}
if (!label) throw new Error('--summary <label|path> or --run --build <label> is required');
const baseline = JSON.parse(readFileSync(resolve(ROOT, option('--baseline', FOUNDRY_COUNT_BASELINE_PATH)), 'utf8')) as FoundryCountBaseline, problems = validateFoundryCountBaseline(baseline);
if (problems.length) throw new Error(`The reference is unusable:\n${problems.join('\n')}`);
const summary = readSummary(label), tiers = option('--tiers', FOUNDRY_COUNT_TIERS.join(',')).split(',');
const result = checkFoundryCounts(baseline, summary.rows, { freshPage: summary.provenance.freshPage, viewport: viewportOf(summary), tiers });
const fmt = (a: number, b: number) => a === b ? `${a}` : `${a} → ${b}`;
console.log(`X-02 Foundry Floor against ${baseline.provenance.build} ${baseline.provenance.commit} (${baseline.provenance.date}): ${result.pass ? 'PASS' : 'FAIL'}; ${result.rows.filter(r => r.judged).length} judged, ${result.rows.filter(r => !r.judged).length} workload, missing ${result.missing.length}, extra ${result.extra.length}; cache ${result.conditions.cacheJudged ? 'judged' : 'not judged (another page policy)'}`);
for (const r of result.rows) {
  const row = summary.rows.find(x => x.tier === r.tier && x.fixture === r.fixture)!, ref = baseline.tiers[r.tier]![r.fixture]!;
  console.log(`${r.pass ? (r.judged ? 'ok  ' : 'info') : 'FAIL'} ${r.tier} ${r.fixture}: draws ${fmt(ref.drawCalls, row.draws)}, triangles ${fmt(ref.triangles, row.triangles)}, pipelines ${fmt(ref.pipelines, row.pipelinesUsed)}${r.cache ? `, cache ${fmt(r.cache.reference, r.cache.observed)}` : ''}${r.judged ? '' : ' (workload, not judged)'}`);
}
for (const m of result.missing) console.log(`FAIL missing from the run: ${m}`);
for (const e of result.extra) console.log(`note not in the reference: ${e}`);
for (const d of result.conditions.differences) console.log(`FAIL condition: ${d}`);
process.exitCode = result.pass ? 0 : 1;
