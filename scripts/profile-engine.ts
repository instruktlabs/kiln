/**
 * End-to-end engine profile (issue #372): time each phase of turning a saved Kiln program into a
 * GLB and its review views, on the fixed asset set in `scripts/profile-engine-assets.json`.
 *
 * Phases, per asset and run (median of the runs is reported):
 *
 *   build      executeKilnCode: sandbox evaluation, primitives and geometry operations.
 *   flush      analyzeFlushFaces, the advisory coplanar-face check (part of QA, timed alone).
 *   penetration collectRequirementsSceneEvidence: the part self-intersection measurement.
 *   rules      runRequirementsSceneQa: the registry rules on the built scene.
 *   export     renderReviewDerivativeGlb: texture bake, glTF document, dedup and GLB write,
 *              without QA (the same bytes renderSceneToGLB writes for a derivative).
 *   khronos    validateFinalGlbBytes: the Khronos validator on the final GLB.
 *   final      inspectGlbIntegration + appendRequirementsFinalQa on the final GLB.
 *   raster     renderGlbViewGrid: load the GLB and CPU-raster the default 3x2 review sheet.
 *   pipeline   renderGLBInProcess end to end (build + QA + export + metrics), as `kiln render`
 *              runs it before views. Its build is a second, separate evaluation.
 *
 * QA = flush + penetration + rules + khronos + final. `other` = pipeline - build - QA - export:
 * what the real path spends beyond the timed phases (runtime metrics, material metrics,
 * integration bookkeeping) plus measurement noise. Every phase is called through the engine's
 * own exported functions; nothing in src/ is instrumented.
 *
 * Run (KILN_RENDER=cpu keeps raster on the CPU path):
 *   KILN_RENDER=cpu bun scripts/profile-engine.ts [--runs 3] [--assets id,id] [--phases a,b]
 *       [--json out.json] [--windows windows.json]
 *
 * CPU profiles, two ways:
 *   bun --cpu-prof scripts/profile-engine.ts ... --windows windows.json
 *       one whole-process profile; `--windows` writes each timed phase's wall-clock window in
 *       the profile's clock, so `bun scripts/cpuprofile-phases.ts <profile> <windows>`
 *       attributes samples to phases. Fine up to ~150k triangles.
 *   bun scripts/profile-engine.ts ... --cpu-prof-phases build,raster --cpu-prof-dir <dir>
 *       one profile per chosen phase and recorded run, written as
 *       <asset>.<phase>.run<N>.cpuprofile; read with `cpuprofile-phases.ts <profile> --phase <name>`.
 *       Needed for the cathedral: a whole-process profile of it outgrows a 9 GiB ceiling.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countTriangles } from '../src/primitives';
import {
  executeKilnCode,
  inspectGlbIntegration,
  renderGLBInProcess,
  renderReviewDerivativeGlb,
} from '../src/render';
import { resolveRequirementsContext } from '../src/requirements-context';
import { analyzeFlushFaces, flushFaceWarnings } from '../src/qa/flush-faces';
import { validateFinalGlbBytes } from '../src/qa/gltf';
import {
  appendRequirementsFinalQa,
  collectRequirementsSceneEvidence,
  runRequirementsSceneQa,
} from '../src/qa/requirements-run';
import { qaPolicyFromEnv } from '../src/qa/run';
import type { PhaseWindow } from './cpuprofile-phases';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSET_LIST = join(REPO, 'scripts', 'profile-engine-assets.json');

export const PHASES = [
  'build',
  'flush',
  'penetration',
  'rules',
  'export',
  'khronos',
  'final',
  'raster',
  'pipeline',
] as const;
export type Phase = (typeof PHASES)[number];

export interface ProfileAsset {
  id: string;
  tier: 'small' | 'medium' | 'large';
  /** Repository-relative path of the saved program. */
  source: string;
  /** Triangles drawn when the list was made; the harness re-measures and reports both. */
  triangles: number;
  note?: string;
}

export interface AssetList {
  version: 1;
  assets: ProfileAsset[];
}

export function readAssetList(path = ASSET_LIST): AssetList {
  const list = JSON.parse(readFileSync(path, 'utf8')) as AssetList;
  if (list.version !== 1 || !Array.isArray(list.assets)) throw new Error(`${path}: not version 1`);
  return list;
}

export function median(samples: readonly number[]): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The saved manifest beside a pack source binds the requirements it was built with. */
function savedRequirements(source: string): unknown {
  const manifest = join(dirname(source), 'manifest.json');
  if (!existsSync(manifest)) return undefined;
  const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
    build?: { options?: { requirements?: { binding?: unknown } } };
  };
  return parsed.build?.options?.requirements?.binding;
}

/** Wall clock in microseconds: the clock Bun's CPU profiler stamps samples with. */
const profileClockUs = () => (performance.timeOrigin + performance.now()) * 1000;

export interface AssetTiming {
  id: string;
  tier: ProfileAsset['tier'];
  triangles: number;
  glbBytes: number;
  runs: number;
  /** Median milliseconds per phase. */
  medianMs: Partial<Record<Phase, number>>;
  samplesMs: Partial<Record<Phase, number[]>>;
  /** What the flush-face check measured: its budgets stop it early on large scenes. */
  flushFaces?: { triangles: number; examined: number; pairTests: number; truncated: boolean };
}

/**
 * Profiles chosen phases one at a time through the inspector protocol. A whole-process
 * `bun --cpu-prof` of the multi-million-triangle cathedral grows past 9 GiB (the plain run
 * peaks near 4.6 GiB), so large assets are profiled per phase, one file per recorded run.
 */
export interface PhaseProfiler {
  phases: ReadonlySet<Phase>;
  dir: string;
  intervalUs: number;
}

async function profiledPhase<T>(
  profiler: PhaseProfiler,
  file: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const { Session } = await import('node:inspector/promises');
  const session = new Session();
  session.connect();
  try {
    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', { interval: profiler.intervalUs });
    await session.post('Profiler.start');
    const value = await fn();
    const { profile } = (await session.post('Profiler.stop')) as { profile: unknown };
    writeFileSync(join(profiler.dir, file), JSON.stringify(profile));
    return value;
  } finally {
    session.disconnect();
  }
}

async function profileAsset(
  asset: ProfileAsset,
  runs: number,
  phases: ReadonlySet<Phase>,
  windows: PhaseWindow[],
  profiler?: PhaseProfiler,
): Promise<AssetTiming> {
  const code = readFileSync(join(REPO, asset.source), 'utf8');
  const binding = savedRequirements(join(REPO, asset.source));
  const context = resolveRequirementsContext(binding);
  const policy = qaPolicyFromEnv();
  const samples: Partial<Record<Phase, number[]>> = {};
  let triangles = 0;
  let glbBytes = 0;
  let flushFaces: AssetTiming['flushFaces'];

  async function timed<T>(phase: Phase, run: number, record: boolean, fn: () => Promise<T> | T) {
    const profiled = record && profiler?.phases.has(phase);
    const startUs = profileClockUs();
    const t0 = performance.now();
    const value = profiled
      ? await profiledPhase(profiler!, `${asset.id}.${phase}.run${run}.cpuprofile`, fn)
      : await fn();
    const ms = performance.now() - t0;
    if (record) {
      samples[phase] ??= [];
      samples[phase].push(ms);
      windows.push({ phase, asset: asset.id, run, startUs, endUs: profileClockUs() });
    }
    return value;
  }

  // Run 0 warms the JIT, the validator's WebAssembly and module caches; it is not recorded.
  for (let run = 0; run <= runs; run++) {
    const record = run > 0;
    const { root, clips } = await timed('build', run, record && phases.has('build'), () =>
      executeKilnCode(code),
    );
    triangles = countTriangles(root);
    if (phases.has('flush')) {
      const report = await timed('flush', run, record, () => analyzeFlushFaces(root));
      flushFaceWarnings(report);
      const { triangles: given, examined, pairTests, truncated } = report;
      flushFaces = { triangles: given, examined, pairTests, truncated };
    }
    let evidence = {};
    if (phases.has('penetration'))
      evidence = await timed('penetration', run, record, () =>
        collectRequirementsSceneEvidence(context, root, policy),
      );
    const sceneReport = await timed('rules', run, record && phases.has('rules'), () =>
      runRequirementsSceneQa(context, root, clips, policy, evidence),
    );
    if (phases.has('export'))
      await timed('export', run, record, () => renderReviewDerivativeGlb(root));

    const needsFinal =
      phases.has('pipeline') ||
      phases.has('khronos') ||
      phases.has('final') ||
      phases.has('raster');
    if (!needsFinal) continue;
    const rendered = await timed('pipeline', run, record && phases.has('pipeline'), () =>
      renderGLBInProcess(code, binding === undefined ? {} : { requirements: binding as never }),
    );
    const bytes = new Uint8Array(rendered.glb);
    glbBytes = bytes.byteLength;
    const validation = await timed('khronos', run, record && phases.has('khronos'), () =>
      validateFinalGlbBytes(bytes),
    );
    if (phases.has('final'))
      await timed('final', run, record, async () => {
        await inspectGlbIntegration(bytes, { validation });
        return appendRequirementsFinalQa(context, sceneReport, validation, bytes);
      });
    if (phases.has('raster')) {
      const { renderGlbViewGrid } = await import('../src/views');
      await timed('raster', run, record, () => renderGlbViewGrid(bytes));
    }
  }
  const medianMs: Partial<Record<Phase, number>> = {};
  for (const phase of PHASES) if (samples[phase]) medianMs[phase] = median(samples[phase]!);
  return {
    id: asset.id,
    tier: asset.tier,
    triangles,
    glbBytes,
    runs,
    medianMs,
    samplesMs: samples,
    ...(flushFaces ? { flushFaces } : {}),
  };
}

export interface PhaseShares {
  build: number;
  qa: number;
  flush: number;
  export: number;
  raster: number;
  other: number;
  total: number;
}

/**
 * Split one asset's medians into the issue's four phases plus the remainder. Total is the
 * real path: the end-to-end pipeline plus the review raster.
 */
export function phaseShares(ms: Partial<Record<Phase, number>>): PhaseShares {
  const get = (p: Phase) => ms[p] ?? 0;
  const qa = get('flush') + get('penetration') + get('rules') + get('khronos') + get('final');
  const pipeline = ms.pipeline ?? get('build') + qa + get('export');
  const other = pipeline - get('build') - qa - get('export');
  return {
    build: get('build'),
    qa,
    flush: get('flush'),
    export: get('export'),
    raster: get('raster'),
    other,
    total: pipeline + get('raster'),
  };
}

const fmt = (ms: number) => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1));
const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(0)}%` : '-';

export function formatTables(results: readonly AssetTiming[]): string {
  const lines: string[] = [];
  lines.push(
    '| asset | tier | triangles | build | QA | (flush) | export | raster | other | total |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const r of results) {
    const s = phaseShares(r.medianMs);
    const cell = (v: number) => `${fmt(v)} (${pct(v, s.total)})`;
    lines.push(
      `| ${r.id} | ${r.tier} | ${r.triangles.toLocaleString('en-US')} | ${cell(s.build)} | ${cell(s.qa)} | ${cell(s.flush)} | ${cell(s.export)} | ${cell(s.raster)} | ${cell(s.other)} | ${fmt(s.total)} |`,
    );
  }
  lines.push(
    '',
    `| asset | ${PHASES.join(' | ')} |`,
    `|---|${PHASES.map(() => '---:').join('|')}|`,
  );
  for (const r of results)
    lines.push(
      `| ${r.id} | ` +
        PHASES.map((p) => (r.medianMs[p] === undefined ? '-' : fmt(r.medianMs[p]!))).join(' | ') +
        ' |',
    );
  return lines.join('\n');
}

function machineState() {
  const commit = (() => {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim();
    } catch {
      return 'unknown';
    }
  })();
  return {
    date: new Date().toISOString(),
    commit,
    bun: typeof Bun === 'undefined' ? undefined : Bun.version,
    platform: `${process.platform} ${process.arch}`,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model,
    memGiB: Math.round(totalmem() / 2 ** 30),
    loadavg: loadavg().map((x) => Number(x.toFixed(2))),
    kilnRender: process.env['KILN_RENDER'],
    qaMode: process.env['KILN_QA_MODE'],
  };
}

function argValue(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const runs = Number(argValue(args, '--runs') ?? 3);
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
  const only = argValue(args, '--assets')?.split(',');
  const phaseArg = argValue(args, '--phases')?.split(',') as Phase[] | undefined;
  for (const p of phaseArg ?? []) if (!PHASES.includes(p)) throw new Error(`unknown phase ${p}`);
  const phases = new Set<Phase>(phaseArg ?? PHASES);
  if (process.env['KILN_RENDER'] !== 'cpu')
    console.error('note: KILN_RENDER is not cpu; set KILN_RENDER=cpu for comparable runs');
  // Every rule evaluates and none throws, so a blocked asset is still timed in full.
  process.env['KILN_QA_MODE'] ??= 'observe';

  const list = readAssetList();
  const assets = only ? list.assets.filter((a) => only.includes(a.id)) : list.assets;
  if (only && assets.length !== only.length) throw new Error('unknown asset id in --assets');
  const start = machineState();
  console.error(`start ${JSON.stringify(start)}`);
  const profArg = argValue(args, '--cpu-prof-phases')?.split(',') as Phase[] | undefined;
  for (const p of profArg ?? []) if (!PHASES.includes(p)) throw new Error(`unknown phase ${p}`);
  const profiler: PhaseProfiler | undefined = profArg
    ? {
        phases: new Set(profArg),
        dir: argValue(args, '--cpu-prof-dir') ?? '.',
        intervalUs: Number(argValue(args, '--cpu-prof-interval') ?? 1000),
      }
    : undefined;
  const windows: PhaseWindow[] = [];
  const results: AssetTiming[] = [];
  for (const asset of assets) {
    const t0 = performance.now();
    const result = await profileAsset(asset, runs, phases, windows, profiler);
    results.push(result);
    console.error(
      `${asset.id}: ${result.triangles} triangles, ${((performance.now() - t0) / 1000).toFixed(1)} s, ` +
        JSON.stringify(
          Object.fromEntries(Object.entries(result.medianMs).map(([k, v]) => [k, Math.round(v!)])),
        ),
    );
  }
  const end = machineState();
  console.error(`end ${JSON.stringify(end)}`);
  console.log(formatTables(results));
  const json = argValue(args, '--json');
  if (json) writeFileSync(json, JSON.stringify({ start, end, runs, results }, null, 2));
  const windowsPath = argValue(args, '--windows');
  if (windowsPath) writeFileSync(windowsPath, JSON.stringify(windows));
}
