// Sim-spec 12 test 6 (model sanity): pilot mode, days 30 to 60 of the default seed, from the stored day-30 state
// (test 5 holds it equal to a fresh warm-up). The release rate is the owner's decision of 2026-09-29: 4,500 starts a
// month (a lot every 4 h) loads etch and CVD/ALD to about 85 percent of calendar time, with the tool counts and the
// reliability table as specified; the sweep and FF1's two retunes are in evidence/sim/retunes.json.
//
// The band is the owner's decision D-43 (2026-09-30): the spec's band (cycle time 14-23 d, WIP 57-91, 110-130 lots
// out, 45-75 moves an hour) is superseded, because the release rate alone cannot meet it (FF2's finding: lots out
// follows the release rate, and cycle time and WIP need an x-factor the twin's variability does not produce short of
// saturation). The test is now a regression band around the twin at the adopted rate, and each of the four criteria is
// an ordinary test that fails when the model drifts. The width rule: each bound lies half-way between the adopted run
// and its neighbour in the release sweep (4,000 below, 5,000 above), so a run fails once it reads more like a
// neighbouring release rate than the adopted one. The band is derived from the sweep here and held equal to the
// constant the code carries; the measured numbers and the utilisation are pinned to evidence/sim/sanity.json so the
// evidence cannot drift from the code.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createFab, DAY_MS, FAB_DATA, groupUtilisation, regressionBand, SANITY_BAND, sanityVerdict, SPEC_SANITY_BAND, stateTotals, windowMetrics,
} from '../../src/sim/index';
import type { GroupUtilisation, SanityBand, SweepRun, WindowMetrics } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..');
const evidence = JSON.parse(readFileSync(resolve(PACKAGE, 'evidence/sim/sanity.json'), 'utf8')) as {
  schema: string; waferStartsPerMonth: number; metrics: Record<string, number>; band: SanityBand; specBand: SanityBand;
  verdict: Record<keyof SanityBand, boolean>; specVerdict: Record<keyof SanityBand, boolean>; pass: boolean;
  bandFrom: { adopted: number; lower: SweepRun; upper: SweepRun };
  utilisation: Record<string, GroupUtilisation>;
};
const retunes = JSON.parse(readFileSync(resolve(PACKAGE, 'evidence/sim/retunes.json'), 'utf8')) as {
  releaseSweep: { adopted: number; runs: (SweepRun & { adopted: boolean })[] };
};
const ADOPTED = FAB_DATA.config.starts.waferStartsPerMonth.value;

let measured: { m: WindowMetrics; u: Record<string, GroupUtilisation> } | null = null;
function measure(): { m: WindowMetrics; u: Record<string, GroupUtilisation> } {
  if (!measured) {
    const fab = createFab({ snapshot: readFileSync(resolve(PACKAGE, 'data/warm/seed-1.json'), 'utf8') });
    const at30 = stateTotals(fab.sim);
    fab.step(60 * DAY_MS);
    measured = { m: windowMetrics(fab.sim, 30, 60), u: groupUtilisation(fab.sim, at30, stateTotals(fab.sim), 30 * DAY_MS) };
  }
  return measured;
}
const inBand = (v: number, [lo, hi]: [number, number]) => { expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); };

describe('sim-spec 12 test 6: model sanity, days 30-60, against the D-43 regression band', () => {
  test('the band is the half-way rule applied to the release sweep in evidence/sim/retunes.json', () => {
    expect(retunes.releaseSweep.adopted).toBe(ADOPTED);
    expect(retunes.releaseSweep.runs.filter(r => r.adopted).map(r => r.waferStartsPerMonth)).toEqual([ADOPTED]);
    expect(regressionBand(retunes.releaseSweep.runs, ADOPTED)).toEqual(SANITY_BAND);
    // The rule reads only the adopted run's two neighbours: the spec's 3,000 and the saturated 6,000 do not move it.
    const neighbours = retunes.releaseSweep.runs.filter(r => [4000, ADOPTED, 5000].includes(r.waferStartsPerMonth));
    expect(regressionBand(neighbours, ADOPTED)).toEqual(SANITY_BAND);
    expect(evidence.band).toEqual(SANITY_BAND);
    expect(evidence.bandFrom.adopted).toBe(ADOPTED);
    expect([evidence.bandFrom.lower.waferStartsPerMonth, evidence.bandFrom.upper.waferStartsPerMonth]).toEqual([4000, 5000]);
  });

  test('the rule rejects a sweep without a neighbour on each side of the adopted rate', () => {
    const runs = retunes.releaseSweep.runs;
    expect(() => regressionBand(runs.filter(r => r.waferStartsPerMonth <= ADOPTED), ADOPTED)).toThrow();
    expect(() => regressionBand(runs.filter(r => r.waferStartsPerMonth !== ADOPTED), ADOPTED)).toThrow();
  });

  // Measured 5.4 s (FF1) for the 30 simulated days on this PC under load; budget 120 s.
  test('the measured numbers and utilisation match evidence/sim/sanity.json', () => {
    const { m, u } = measure();
    expect(evidence.schema).toBe('foundry-floor.evidence.sanity/3');
    expect(evidence.waferStartsPerMonth).toBe(ADOPTED);
    expect(m.cycleTimeDays).toBeCloseTo(evidence.metrics.cycleTimeDays as number, 2);
    expect(m.wipMean).toBeCloseTo(evidence.metrics.wipMean as number, 1);
    expect(m.lotsOut).toBe(evidence.metrics.lotsOut as number);
    expect(m.movesPerHour).toBeCloseTo(evidence.metrics.movesPerHour as number, 1);
    expect(m.emergencyStops).toBe(0);
    expect(m.releasesSkipped).toBe(0);
    for (const [group, v] of Object.entries(evidence.utilisation)) expect(u[group]?.productive).toBeCloseTo(v.productive, 3);
    expect(evidence.verdict).toEqual(sanityVerdict(m));
    expect(evidence.pass).toBe(true);
  }, 120_000);

  test('the adopted D43 sweep remains reproducible with floor routing disabled (its bounds stay unchanged)', () => {
    const data = { ...FAB_DATA, config: { ...FAB_DATA.config, floorTransport: { ...FAB_DATA.config.floorTransport!, enabled: false } } };
    const baseline = createFab({ data });
    baseline.step(60 * DAY_MS);
    const m = windowMetrics(baseline.sim, 30, 60);
    const run = retunes.releaseSweep.runs.find(r => r.waferStartsPerMonth === ADOPTED) as SweepRun;
    expect(run.metrics.cycleTimeDays).toBeCloseTo(m.cycleTimeDays, 2);
    expect(run.metrics.wipMean).toBeCloseTo(m.wipMean, 1);
    expect(run.metrics.lotsOut).toBe(m.lotsOut);
    expect(run.metrics.movesPerHour).toBeCloseTo(m.movesPerHour, 1);
  }, 120_000);

  test('the owner decision: the busiest families (etch, CVD/ALD) run at about 85 percent of calendar time', () => {
    const { u } = measure();
    for (const group of ['etch', 'cvdald']) inBand(u[group]?.productive ?? 0, [0.82, 0.88]);
    const busiest = Math.max(...Object.entries(u).filter(([g]) => g !== 'furnace').map(([, v]) => v.productive));
    inBand(busiest, [0.82, 0.88]);
  }, 120_000);

  test('cycle time within 7.955-9.495 days (measured 8.32 at the adoption)', () => inBand(measure().m.cycleTimeDays, SANITY_BAND.cycleTimeDays), 120_000);
  test('WIP within 45.3-60.65 lots (measured 50.1)', () => inBand(measure().m.wipMean, SANITY_BAND.wipMean), 120_000);
  test('lots out within 170.5-188 in the 30 days (measured 180)', () => inBand(measure().m.lotsOut, SANITY_BAND.lotsOut), 120_000);
  test('moves per hour within 58.05-68.35 (measured 61.8)', () => inBand(measure().m.movesPerHour, SANITY_BAND.movesPerHour), 120_000);

  test('the spec band is kept as superseded (D-43): at the adopted rate only moves per hour falls inside it', () => {
    expect(SPEC_SANITY_BAND).toEqual({ cycleTimeDays: [14, 23], wipMean: [57, 91], lotsOut: [110, 130], movesPerHour: [45, 75] });
    expect(evidence.specBand).toEqual(SPEC_SANITY_BAND);
    const spec = sanityVerdict(measure().m, SPEC_SANITY_BAND);
    expect(spec).toEqual({ cycleTimeDays: false, wipMean: false, lotsOut: false, movesPerHour: true });
    expect(evidence.specVerdict).toEqual(spec);
  }, 120_000);
});
