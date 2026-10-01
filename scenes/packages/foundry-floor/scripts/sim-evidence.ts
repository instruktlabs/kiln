// SPDX-License-Identifier: MIT
// Writes the twin's evidence under evidence/sim/ and, with --write-snapshot, the stored warm start data/warm/seed-<n>.json:
//   hashes.json   the hourly hashes of the default seed over the first 30 days (test 5's horizon) and the day-30 hash;
//   warmup.json   the cost of the 30-day warm-up and of restoring the stored snapshot, with this PC's load samples;
//   sanity.json   test 6 (pilot mode, days 30 to 60) for the configured release rate and tuning, with the band, the
//                 verdict and the utilisation of every tool group over the window;
//   retunes.json  (--retunes) the release-rate sweep of the owner decision (2026-09-29) with the adopted rate, beside
//                 FF1's two retunes at the spec's rate, each over days 30 to 60 of the same seed;
//   megafab.json  one simulated day of megafab mode from the day-30 state: event cost, synthetic count, bay check.
// Timings are indicative only (a shared PC under load). With --sanity-only (FF3, D-43) the script writes sanity.json
// alone, from a fresh 30-day warm-up continued to day 60, and leaves every other file (and data/warm/) untouched.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/sim-evidence.ts [--seed 1] [--write-snapshot] [--retunes]
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/sim-evidence.ts --sanity-only
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFab, DAY_MS, FAB_DATA, HOUR_MS } from '../src/sim/index';
import { groupUtilisation, regressionBand, SANITY_BAND, sanityVerdict, SPEC_SANITY_BAND, stateTotals, windowMetrics } from '../src/sim/metrics';
import type { SweepRun, WindowMetrics } from '../src/sim/metrics';
import { loadSample } from './load-sample';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const seed = Number(flag('seed') ?? FAB_DATA.config.seeds.default);
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(PKG, 'evidence/sim');
mkdirSync(OUT, { recursive: true });
const write = (name: string, value: unknown) => { writeFileSync(resolve(OUT, name), `${JSON.stringify(value, null, 2)}\n`); console.log(`wrote evidence/sim/${name}`); };
const round = (v: number, d = 2) => Number(v.toFixed(d));
const tidy = (m: WindowMetrics) => ({
  cycleTimeDays: round(m.cycleTimeDays), xFactor: round(m.xFactor), wipMean: round(m.wipMean, 1), wipMin: m.wipMin, wipMax: m.wipMax,
  lotsOut: m.lotsOut, movesPerHour: round(m.movesPerHour, 1), vehiclesBusy: round(m.vehiclesBusy), emergencyStops: m.emergencyStops, releasesSkipped: m.releasesSkipped,
});
const tuning = FAB_DATA.config.tuning;

const sanityOnly = args.includes('--sanity-only');
if (sanityOnly && (args.includes('--write-snapshot') || args.includes('--retunes'))) throw new Error('--sanity-only writes sanity.json alone');

// Warm-up cost: a fresh fab stepped 30 days, twice; the first run continues to day 60 for the sanity window.
const warmDays = FAB_DATA.config.warmup.days;
const main = createFab({ seed });
let snapshot = '';
if (sanityOnly) main.step(warmDays * DAY_MS);
else {
  const loadBefore = await loadSample();
  const runs: { wallMs: number; events: number }[] = [];
  for (let r = 0; r < 2; r++) {
    const fab = r === 0 ? main : createFab({ seed });
    const t0 = performance.now();
    fab.step(warmDays * DAY_MS);
    runs.push({ wallMs: Math.round(performance.now() - t0), events: fab.sim.S.seq });
  }
  snapshot = main.snapshot();
  const hashes = main.hourlyHashes().slice(0, warmDays * 24);
  const t1 = performance.now();
  const restored = createFab({ seed, snapshot });
  const restoreMs = performance.now() - t1;
  if (restored.hash() !== main.hash()) throw new Error('restored snapshot hashes differently');
  const loadAfter = await loadSample();

  if (args.includes('--write-snapshot')) {
    const dir = resolve(PKG, 'data/warm');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `seed-${seed}.json`), snapshot);
    console.log(`wrote data/warm/seed-${seed}.json (${snapshot.length} bytes)`);
  }

  write('hashes.json', {
    schema: 'foundry-floor.evidence.hashes/1',
    seed, mode: 'pilot', hashIntervalMs: HOUR_MS, hours: hashes.length,
    day30Hash: hashes[warmDays * 24 - 1],
    note: 'FNV-1a (32-bit hex) of the canonical integer state at every whole sim hour, hour 1 first; the last entry is day 30 00:00. Test 5 checks these are identical when stepped at 30, 60 and 144 fps at 600x and in one headless run.',
    hashes,
  });

  const warmupMs = Math.min(...runs.map(r => r.wallMs));
  write('warmup.json', {
    schema: 'foundry-floor.evidence.warmup/1',
    indicative: 'this PC is shared by several builders and Kiln authors; the load samples below were taken before and after the runs',
    seed, days: warmDays, budgetMs: FAB_DATA.config.warmup.budgetMs,
    runs, bestWallMs: warmupMs, eventsPerDay: Math.round((runs[0] as { events: number }).events / warmDays),
    restoreSnapshotMs: round(restoreMs, 1), snapshotBytes: snapshot.length,
    decision: warmupMs > FAB_DATA.config.warmup.budgetMs
      ? `the warm-up costs ${warmupMs} ms here, over the ${FAB_DATA.config.warmup.budgetMs} ms budget: the scene starts from a stored snapshot per seed (data/warm/seed-<n>.json), which restores in about ${Math.ceil(restoreMs)} ms`
      : 'the warm-up fits the budget: the scene may warm up on load',
    loadBefore, loadAfter,
  });
}

// Sanity: the first run continues to day 60, measured against the D-43 regression band (the rule and its inputs are
// written beside it; the band must equal the rule applied to the release sweep in retunes.json).
const starts = FAB_DATA.config.starts, lotsPerDay = (w: number) => round(w / starts.wafersPerLot / starts.monthDays, 3);
const ADOPTED_STARTS = starts.waferStartsPerMonth.value;
const sweep = (JSON.parse(readFileSync(resolve(OUT, 'retunes.json'), 'utf8')) as { releaseSweep: { runs: SweepRun[] } }).releaseSweep.runs;
if (JSON.stringify(regressionBand(sweep, ADOPTED_STARTS)) !== JSON.stringify(SANITY_BAND)) throw new Error('SANITY_BAND differs from the D-43 rule applied to evidence/sim/retunes.json');
const neighbour = (dir: -1 | 1) => {
  const r = [...sweep].sort((a, b) => dir * (a.waferStartsPerMonth - b.waferStartsPerMonth)).find(x => dir * (x.waferStartsPerMonth - ADOPTED_STARTS) > 0) as SweepRun;
  return { waferStartsPerMonth: r.waferStartsPerMonth, metrics: { cycleTimeDays: r.metrics.cycleTimeDays, wipMean: r.metrics.wipMean, lotsOut: r.metrics.lotsOut, movesPerHour: r.metrics.movesPerHour } };
};
const at30 = stateTotals(main.sim);
main.step(60 * DAY_MS);
const m = windowMetrics(main.sim, 30, 60);
const verdict = sanityVerdict(m);
const utilisation = groupUtilisation(main.sim, at30, stateTotals(main.sim), 30 * DAY_MS);
write('sanity.json', {
  schema: 'foundry-floor.evidence.sanity/3',
  test: 'sim-spec 12, test 6: pilot mode, days 30 to 60 of a seeded run, against the regression band of the owner\'s decision D-43',
  seed, waferStartsPerMonth: ADOPTED_STARTS, lotsPerDay: lotsPerDay(ADOPTED_STARTS), releaseHours: starts.releaseHours,
  tuning, band: SANITY_BAND,
  bandRule: 'D-43 (owner, 2026-09-30): a regression band around the twin at the adopted release rate, its width from the release sweep. Each bound lies half-way between the adopted run and its neighbouring run of the sweep (the next lower and the next higher release rate), rounded to 4 decimals, so a run outside it reads more like a neighbouring release rate than the adopted one',
  bandFrom: { source: 'the release sweep (retunes.json, releaseSweep.runs)', adopted: ADOPTED_STARTS, lower: neighbour(-1), upper: neighbour(1) },
  metrics: tidy(m), verdict, pass: Object.values(verdict).every(Boolean),
  specBand: SPEC_SANITY_BAND, specVerdict: sanityVerdict(m, SPEC_SANITY_BAND),
  specBandNote: 'the band sim-spec 12 test 6 states, superseded by the owner\'s decision D-43: the release rate alone cannot meet it. Throughput follows the release rate, so 110 to 130 lots out is the spec\'s 3,000 starts a month, and the band\'s cycle time and WIP need an x-factor of 2.5 to 4, which the twin\'s variability does not produce short of saturation (FF2). The release rate, tool counts, MTBF, MTTR and PM are unchanged',
  utilisation, utilisationNote: 'productive = PRODUCTIVE share of calendar time over the window, averaged over the tools of the group; productiveOfAvailable excludes the down states (SCHEDULED_DOWN, UNSCHEDULED_DOWN, ENGINEERING, NON_SCHEDULED). A furnace is PRODUCTIVE for the whole batch cycle whatever the batch size',
  rawProcessHours: round(main.sim.rawMs / HOUR_MS, 1),
});
if (sanityOnly) process.exit(0);

if (args.includes('--retunes')) {
  const held = ['etch-05', 'etch-06', 'cvd-05', 'cvd-06', 'pvd-03', 'cmp-04', 'metro-04', 'probe-04', 'implant-02', 'cell-duv-2', 'furnace-03'];
  const SOURCED = FAB_DATA.config.starts.waferStartsPerMonth.sourced?.value ?? 3000, ADOPTED = FAB_DATA.config.starts.waferStartsPerMonth.value;
  const trial = (nonScheduled: string[], mttrScale: number, wspm = SOURCED) => {
    const fab = createFab({ seed, nonScheduled, mttrScale, wspm });
    fab.step(30 * DAY_MS);
    const a = stateTotals(fab.sim);
    fab.step(60 * DAY_MS);
    const w = windowMetrics(fab.sim, 30, 60), u = groupUtilisation(fab.sim, a, stateTotals(fab.sim), 30 * DAY_MS);
    const busiest = Object.entries(u).filter(([g]) => g !== 'furnace').sort((x, y) => y[1].productive - x[1].productive).slice(0, 3).map(([g, v]) => ({ group: g, productive: v.productive, productiveOfAvailable: v.productiveOfAvailable }));
    return { metrics: tidy(w), verdict: sanityVerdict(w, SPEC_SANITY_BAND), busiest, utilisation: u };
  };
  const sweep = [3000, 3500, 4000, 4500, 5000, 6000].map(wspm => ({ waferStartsPerMonth: wspm, lotsPerDay: lotsPerDay(wspm), releaseEveryH: round(24 / lotsPerDay(wspm), 3), adopted: wspm === ADOPTED, ...trial([], 1, wspm) }));
  write('retunes.json', {
    schema: 'foundry-floor.evidence.retunes/2',
    rule: 'owner decision 2026-09-29 22:05 (replacing TASK-FF2 item 6\'s "do not retune"): load the pilot line to about 85 percent utilisation of the busiest families by raising the release rate; tool counts, MTBF/MTTR and PM stay as specified; re-measure days 30 to 60 with seed 1 and record the run beside the earlier ones. FF1\'s rule (TASK-FF1 item 4) allowed at most two retunes of tool counts or dispatch',
    seed, band: SPEC_SANITY_BAND,
    releaseSweep: {
      knob: 'wafer starts per month (the release interval is 30 days over the lots per month); everything else as specified',
      utilisation: 'PRODUCTIVE share of calendar time per group over days 30 to 60; busiest lists the top three groups other than the furnace (a furnace is PRODUCTIVE for the whole batch cycle whatever the batch size)',
      adopted: ADOPTED,
      why: `${ADOPTED} starts a month (a lot every ${round(24 / lotsPerDay(ADOPTED), 2)} h) loads etch and CVD/ALD to about 85 percent of calendar time, the owner's target; 5,000 reaches about 94 percent and 6,000 makes the CONWIP cap bind (releases skipped)`,
      finding: 'throughput follows the release rate, so the band\'s 110 to 130 lots out is the spec\'s 3,000 starts a month; at the owner\'s 85 percent the line ships about 180 lots and cycle time reaches only about 8.5 days (x-factor near 1.5), and even with the CONWIP cap binding (6,000) cycle time is about 14 days with WIP at the cap. The twin\'s variability (exponential failures, lognormal repairs, fixed process times) is lower than a real line\'s, which is where the report\'s assumed x-factor of 2.5 to 4 comes from',
      runs: sweep,
    },
    configurations: [
      { name: 'FF1: spec as written (3,000 starts; kept in FF1)', knobs: { nonScheduled: [], mttrScale: 1, waferStartsPerMonth: SOURCED }, ...trial([], 1), adopted: false,
        why: 'FF1 kept the spec as written and left the gap to the owner; superseded by the owner decision (the release sweep above)' },
      { name: 'FF1 retune 1: tool counts', knobs: { nonScheduled: held, mttrScale: 1, waferStartsPerMonth: SOURCED }, ...trial(held, 1), adopted: false,
        why: 'holds 11 tools NON_SCHEDULED (etch 6 to 4, CVD/ALD 6 to 4, PVD 3 to 2, CMP 4 to 3, metrology 4 to 3, probe 4 to 3, implant 2 to 1, DUV cells 2 to 1, furnace 3 to 2) so the busiest families run at about 85 percent of calendar time; it goes below the report\'s floor of 2 for DUV and implant and below its tools-needed count for etch and CVD/ALD, and still misses the band' },
      { name: 'FF1 retune 2: tool counts and repair times', knobs: { nonScheduled: held, mttrScale: 2, waferStartsPerMonth: SOURCED }, ...trial(held, 2), adopted: false,
        why: 'retune 1 plus every MTTR doubled, to add the variability real lines have; repair time is a reliability parameter, not one of the knobs the spec names (tool counts or dispatch), so this is recorded as a sensitivity result only' },
    ],
    dispatchNote: 'dispatch was not retuned: the three rules (leastWork, fifo, criticalRatio) only reorder a tool\'s queue, which leaves mean cycle time and WIP almost unchanged in a work-conserving line',
    finding: 'at the spec\'s starts, tool counts and reliability the twin runs at an x-factor near 1.2 (calendar utilisation of the busiest families near 57 percent); the report\'s x-factor of 2.5 to 4.0 is an assumed value (E), not an output of its capacity model',
  });
}

// Megafab: one day from the day-30 state.
{
  const fab = createFab({ seed, snapshot, mode: 'megafab' });
  const S = fab.sim.S, loop = new Set(fab.sim.spineLoop);
  const synthetic = S.vehicles.filter(v => v.alive && v.syn).length;
  const seq0 = S.seq, t0 = performance.now();
  let offLoop = 0, samples = 0;
  for (let h = 1; h <= 24; h++) {
    fab.step(30 * DAY_MS + h * HOUR_MS);
    for (const v of S.vehicles) if (v.alive && v.syn) { samples++; if (v.route.some(e => !loop.has(e))) offLoop++; }
  }
  const wallMs = performance.now() - t0;
  write('megafab.json', {
    schema: 'foundry-floor.evidence.megafab/1',
    indicative: 'wall times on a shared PC; see warmup.json for the load samples of this session',
    seed, from: 'the day-30 pilot state, switched to megafab', simHours: 24,
    vehicles: S.vehicles.filter(v => v.alive).length, synthetic,
    events: S.seq - seq0, wallMs: Math.round(wallMs), wallMsPerSimHour: round(wallMs / 24, 1),
    costPerFrameAt600xMs: round(wallMs / 24 / 360, 3),
    syntheticRouteSamples: samples, syntheticRoutesOffSpineLoop: offLoop, emergencyStops: S.stats.emergencyStops,
    kpis: fab.kpis(),
    fits: 'at 600x a 60 fps frame advances 1/360 of a sim hour, so the twin costs the per-frame figure above',
    configured: FAB_DATA.config.modes.megafab.synthetic,
  });
}
