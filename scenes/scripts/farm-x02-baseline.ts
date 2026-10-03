// OD-8 (D-53) X-02 re-baseline for the Farm. `measure` writes the committed reference (packages/farm/fixtures/x02-baseline.json)
// from a test build: per backend and X-02 view (every named view and the four play fixtures), one fresh page at high with the
// scene clock frozen and ambient life off, the fixture entered as the count probe enters it, the cached sun shadow settled,
// then renderer.info totals (draws including shadow passes, triangles, the pipeline cache) read until three frames agree.
// `check` compares a count-probe run (its summary.json, fresh-page) or a `measure` output against the reference with
// X-02's rule (inclusive ±2% draws and triangles, pipeline cache at most +5%); it exits 1 when the run is flagged.
//   bun scripts/farm-x02-baseline.ts measure --build <label> [--backends webgpu,webgl2] [--out packages/farm/fixtures/x02-baseline.json] [--log <json>]
//   bun scripts/farm-x02-baseline.ts check --summary <count-probe summary.json or a measure output> [--reference …] [--backend webgpu] [--json <out>]
// Counts only: nothing here reads or reports time.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { launchChrome, serveOwned } from '../packages/scene-kit/src/testing/node';
import { sceneOutput } from './build-scene';
import { checkX02Rows, FARM_X02_VIEWS, validateX02Baseline, X02_BASELINE_PATH, X02_BASELINE_SCHEMA, type X02Backend, type X02Baseline, type X02ReferenceEntry } from './farm-count-gates';
import { enterFarmView, openFarmPage, settleFarmShadow, stableFarmCounts } from './farm-capture-pages';
import { sceneBrowserOptions } from './browser-options.mjs';

const ROOT = resolve(import.meta.dir, '..'), args = process.argv.slice(2), command = args[0];
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const PLAY = new Set(['play-yard', 'play-house', 'play-bridge', 'play-house-door']);

export function farmX02BrowserProvenance(version: string, options: { headless: boolean }) {
  return { browser: `${options.headless ? 'headless' : 'headed'} ${version}`, browserLaunch: { headless: options.headless } };
}

async function measure(build: string, backends: X02Backend[], out: string) {
  const dir = sceneOutput('farm', build, 'test'), built = JSON.parse(readFileSync(resolve(dir, 'build.json'), 'utf8')) as { chunks: { name: string }[]; source?: unknown };
  // A working-tree build names no commit: record the last commit that changed the scene sources, and whether they are clean now.
  const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  const fromBuild = (built.source as { commit?: string } | null)?.commit, head = git('rev-parse', 'HEAD'), commit = fromBuild ?? git('log', '-1', '--format=%H', '--', 'packages/scene-kit/src', 'packages/farm/src', 'packages/farm/fixtures/layout.json');
  const dirty = git('status', '--porcelain', '--', 'packages/scene-kit/src', 'packages/farm/src');
  const launch = sceneBrowserOptions();
  const hosted = await serveOwned(dir), owned = new Set([hosted.port]), browser: Browser = await launchChrome({ workspace: ROOT, name: 'farm-x02-baseline', windowSize: [1280, 720], headless: launch.headless });
  const reference: X02Baseline['backends'] = {}, details: Record<string, unknown>[] = [], version = await browser.version();
  try {
    for (const backend of backends) {
      const views: Record<string, X02ReferenceEntry> = reference[backend] = {};
      for (const view of FARM_X02_VIEWS) {
        const { page, messages } = await openFarmPage({ browser, base: hosted.url, owned, tier: 'high', backend, view: PLAY.has(view) ? 'hero' : view });
        try {
          await enterFarmView(page, view);
          const settle = await settleFarmShadow(page), counts = await stableFarmCounts(page);
          if (!counts.stable || settle.unsettled) throw new Error(`${backend} ${view}: counts did not settle (${JSON.stringify({ settle, counts })})`);
          if (messages.length) throw new Error(`${backend} ${view}: browser errors or warnings: ${messages.join(' | ')}`);
          const { frames: _f, stable: _s, ...snapshot } = counts;
          views[view] = { kind: PLAY.has(view) ? 'play fixture' : 'named view', ...snapshot };
          details.push({ backend, view, settle, frames: counts.frames });
          console.log(`${backend} ${view}: draws ${snapshot.drawCalls} triangles ${snapshot.triangles} pipelines ${snapshot.pipelines} programs ${snapshot.programs} (settled after ${settle.frames} frames, cache ${settle.cache})`);
        } finally { await page.close().catch(() => {}); }
      }
    }
  } finally { await browser.close(); await hosted.close(); }
  const value: X02Baseline = {
    schema: X02_BASELINE_SCHEMA, decision: 'OD-8 (D-53): X-02 re-baselined on the optimized build; pixel parity against the sealed pilot (B-06) is unchanged',
    rule: 'Inclusive ±2% draws (renderer.info drawCalls of one frame, shadow passes included) and triangles; pipeline cache at most +5% of this reference',
    provenance: { build, commit, chunks: built.chunks.map(c => c.name).sort(), source: fromBuild ? JSON.stringify(built.source) : `${String(built.source)}; Farm and kit sources last changed in ${commit.slice(0, 7)}, ${dirty ? 'with uncommitted changes' : 'clean'} at HEAD ${head.slice(0, 7)} when measured`,
      tool: `scripts/farm-x02-baseline.ts measure --build ${build}`, date: new Date().toISOString().slice(0, 10), ...farmX02BrowserProvenance(version, launch), viewport: '1280x720 CSS at device scale 1 (B-06 normalization)', pagePolicy: 'one fresh page per view and backend' },
    conditions: { tier: 'high', viewport: [1280, 720], freshPage: true, clock: 'frozen', settled: true },
    backends: reference,
  };
  const problems = validateX02Baseline(value); if (problems.length) throw new Error(`Reference is not valid: ${problems.join('; ')}`);
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(value, null, 1) + '\n');
  return { value, details };
}

function check(referencePath: string, summaryPath: string, backend: X02Backend) {
  const baseline = JSON.parse(readFileSync(referencePath, 'utf8')) as X02Baseline, problems = validateX02Baseline(baseline);
  if (problems.length) throw new Error(`Reference ${referencePath} is not valid: ${problems.join('; ')}`);
  type Row = { scene: string; tier: string; fixture: string; draws: number; triangles: number; pipelineCache: number; programs: number; memory: { geometries: number; textures: number } };
  const raw = JSON.parse(readFileSync(summaryPath, 'utf8')) as { schema?: string; label?: string; provenance?: { viewports?: string[]; freshPage?: boolean | null; build?: string }; rows?: Row[] } & Partial<X02Baseline>;
  // A count-probe summary.json, or another `measure` output (the same shape as the reference) taken as the run.
  const summary = raw.schema === X02_BASELINE_SCHEMA
    ? { label: `measure of ${raw.provenance!.build}`, provenance: { viewports: [raw.conditions!.viewport.join('x')], freshPage: raw.conditions!.freshPage },
      rows: Object.entries(raw.backends?.[backend] ?? {}).map(([fixture, e]): Row => ({ scene: 'farm', tier: raw.conditions!.tier, fixture, draws: e.drawCalls, triangles: e.triangles, pipelineCache: e.pipelines, programs: e.programs, memory: { geometries: e.geometries, textures: e.textures } })) }
    : raw as { label: string; provenance?: { viewports?: string[]; freshPage?: boolean | null }; rows: Row[] };
  const viewport = (summary.provenance?.viewports?.[0] ?? '0x0').split('x').map(Number) as [number, number];
  const result = checkX02Rows(baseline, summary.rows.filter(r => r.scene === 'farm'), { tier: baseline.conditions.tier, backend, viewport, freshPage: summary.provenance?.freshPage === true });
  const pct = (c: { relativeChange: number | null } | undefined) => c?.relativeChange === null || c?.relativeChange === undefined ? '-' : `${(c.relativeChange * 100).toFixed(1)}%`;
  const md = [`X-02 check of ${summary.label} (${summaryPath}) against ${referencePath} (build ${baseline.provenance.build}, ${baseline.provenance.commit.slice(0, 7)}, ${baseline.provenance.date}), ${backend}: **${result.pass ? 'PASS' : 'FLAGGED'}**.`,
    result.conditions.length ? `Run conditions differ from the reference: ${result.conditions.join('; ')}.` : 'Run conditions match the reference (high, one fresh page per view, 16:9).',
    result.missing.length ? `Reference views missing from the run: ${result.missing.join(', ')}.` : '', result.extra.length ? `Rows not judged (not X-02 views): ${result.extra.join(', ')}.` : '', '',
    '| View | Draws (reference → run) | Δ | Triangles | Δ | Pipeline cache | Δ | X-02 |', '|---|---|---|---|---|---|---|---|',
    ...result.views.map(v => `| ${v.view} | ${v.checks!.drawCalls.pilot} → ${v.checks!.drawCalls.rewrite} | ${pct(v.checks!.drawCalls)} | ${v.checks!.triangles.pilot} → ${v.checks!.triangles.rewrite} | ${pct(v.checks!.triangles)} | ${v.checks!.pipelines.pilot} → ${v.checks!.pipelines.rewrite} | ${pct(v.checks!.pipelines)} | ${v.pass ? 'within' : 'outside'} |`)].filter((line, i, all) => line !== '' || all[i - 1] !== '');
  return { result, md: md.join('\n') + '\n' };
}

if (import.meta.main) {
  if (command === 'measure') {
    const build = option('--build', ''); if (!build) throw new Error('--build <label> is required');
    const out = resolve(ROOT, option('--out', X02_BASELINE_PATH)), backends = option('--backends', 'webgpu,webgl2').split(',') as X02Backend[];
    const { details } = await measure(build, backends, out), log = resolve(ROOT, option('--log', `evidence/x02-baseline/${build}-measure-log.json`));
    mkdirSync(dirname(log), { recursive: true }); writeFileSync(log, JSON.stringify(details, null, 1) + '\n');
    console.log(`Reference written: ${out}`);
  } else if (command === 'check') {
    const reference = resolve(ROOT, option('--reference', X02_BASELINE_PATH)), summary = resolve(option('--summary', ''));
    if (!existsSync(summary)) throw new Error('--summary <count-probe summary.json> is required');
    const { result, md } = check(reference, summary, option('--backend', 'webgpu') as X02Backend);
    console.log(md);
    if (args.includes('--json')) { const out = resolve(option('--json', '')); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1) + '\n'); writeFileSync(out.replace(/\.json$/, '.md'), md); }
    process.exitCode = result.pass ? 0 : 1;
  } else console.log('Usage: bun scripts/farm-x02-baseline.ts measure --build <label> [--backends webgpu,webgl2] [--out <file>] | check --summary <summary.json> [--reference <file>] [--backend webgpu] [--json <out>]');
}
