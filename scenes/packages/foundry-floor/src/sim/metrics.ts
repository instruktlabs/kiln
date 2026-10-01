// SPDX-License-Identifier: MIT
// Window metrics for the model-sanity test (sim-spec 12, test 6) and the evidence scripts: cycle time, WIP, lots
// out, moves per hour and vehicles busy between two whole hours of a run, from the twin's hourly records.
import { DAY_MS, HOUR_MS } from './data';
import type { FabSim } from './fab';

export interface WindowMetrics {
  fromDay: number;
  toDay: number;
  /** Mean release-to-ship time of the lots shipped in the window, in days. */
  cycleTimeDays: number;
  xFactor: number;
  /** Mean of the hourly WIP samples in the window (lots released and not shipped). */
  wipMean: number;
  wipMin: number;
  wipMax: number;
  lotsOut: number;
  movesPerHour: number;
  /** Mean number of pilot vehicles doing a job (synthetic traffic excluded). */
  vehiclesBusy: number;
  emergencyStops: number;
  releasesSkipped: number;
}

export interface SanityBand {
  cycleTimeDays: [number, number];
  wipMean: [number, number];
  lotsOut: [number, number];
  movesPerHour: [number, number];
}

/** Test 6 of sim-spec 12 as the spec writes it (pilot mode, days 30 to 60). Superseded by the owner's decision D-43
 *  (2026-09-30): the release rate alone cannot meet it. Kept for the record and for the release sweep's verdicts. */
export const SPEC_SANITY_BAND: SanityBand = {
  cycleTimeDays: [14, 23],
  wipMean: [57, 91],
  lotsOut: [110, 130],
  movesPerHour: [45, 75],
};

/** One run of the release sweep (evidence/sim/retunes.json `releaseSweep.runs`): its starts and its window metrics. */
export interface SweepRun { waferStartsPerMonth: number; metrics: Pick<WindowMetrics, keyof SanityBand> }

const BAND_KEYS: readonly (keyof SanityBand)[] = ['cycleTimeDays', 'wipMean', 'lotsOut', 'movesPerHour'];

/**
 * D-43's regression band: around the adopted run of the release sweep, each bound half-way to the neighbouring run
 * (the next lower and the next higher release rate). A run outside it reads more like a neighbouring release rate
 * than the adopted one. Bounds are rounded to 4 decimals (the sweep records 1 or 2).
 */
export function regressionBand(runs: readonly SweepRun[], adopted: number): SanityBand {
  const sorted = [...runs].sort((a, b) => a.waferStartsPerMonth - b.waferStartsPerMonth);
  const i = sorted.findIndex(r => r.waferStartsPerMonth === adopted);
  if (i < 0) throw new Error(`the release sweep has no run at the adopted ${adopted} starts a month`);
  const lower = sorted[i - 1], mid = sorted[i] as SweepRun, upper = sorted[i + 1];
  if (!lower || !upper) throw new Error(`the adopted ${adopted} starts a month needs a sweep neighbour on each side`);
  const half = (a: number, b: number) => Number(((a + b) / 2).toFixed(4));
  const band = {} as SanityBand;
  for (const k of BAND_KEYS) band[k] = [half(lower.metrics[k], mid.metrics[k]), half(mid.metrics[k], upper.metrics[k])];
  return band;
}

/** Test 6 as re-based by the owner (D-43): regressionBand over the release sweep at the adopted 4,500 starts a month
 *  (neighbours 4,000 and 5,000), around the measured 8.32 d, 50.1 lots, 180 lots out and 61.8 moves an hour.
 *  tests/unit/sanity.test.ts holds this constant equal to the rule applied to evidence/sim/retunes.json. */
export const SANITY_BAND: SanityBand = {
  cycleTimeDays: [7.955, 9.495],
  wipMean: [45.3, 60.65],
  lotsOut: [170.5, 188],
  movesPerHour: [58.05, 68.35],
};

/** Metrics between the hourly records at fromDay and toDay (both whole days, the run must have reached toDay). */
export function windowMetrics(sim: FabSim, fromDay: number, toDay: number): WindowMetrics {
  const S = sim.S, hours = S.stats.hourly;
  const at = (day: number) => {
    const rec = hours.find(h => h.t === day * DAY_MS);
    if (!rec) throw new Error(`no hourly record at day ${day} (the run reached ${S.t} ms)`);
    return rec;
  };
  const a = at(fromDay), b = at(toDay);
  const inside = hours.filter(h => h.t > a.t && h.t <= b.t);
  const ships = S.stats.ships.filter(([st]) => st > a.t && st <= b.t);
  const ct = ships.length ? ships.reduce((s, [st, rel]) => s + (st - rel), 0) / ships.length / DAY_MS : 0;
  const spanH = (b.t - a.t) / HOUR_MS;
  return {
    fromDay,
    toDay,
    cycleTimeDays: ct,
    xFactor: ct > 0 ? (ct * DAY_MS) / sim.rawMs : 0,
    wipMean: inside.reduce((s, h) => s + h.wip, 0) / Math.max(1, inside.length),
    wipMin: Math.min(...inside.map(h => h.wip)),
    wipMax: Math.max(...inside.map(h => h.wip)),
    lotsOut: b.shipped - a.shipped,
    movesPerHour: (b.moves - a.moves) / spanH,
    vehiclesBusy: (b.busyMs - a.busyMs) / (b.t - a.t),
    emergencyStops: S.stats.emergencyStops,
    releasesSkipped: S.stats.releasesSkipped,
  };
}

/** Which of the four test-6 numbers fall inside the band. */
export function sanityVerdict(m: WindowMetrics, band: SanityBand = SANITY_BAND): Record<keyof SanityBand, boolean> {
  const inside = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
  return {
    cycleTimeDays: inside(m.cycleTimeDays, band.cycleTimeDays),
    wipMean: inside(m.wipMean, band.wipMean),
    lotsOut: inside(m.lotsOut, band.lotsOut),
    movesPerHour: inside(m.movesPerHour, band.movesPerHour),
  };
}

/** Cumulative ms per E10 state for every resource at the sim's current time (the running state included). */
export function stateTotals(sim: FabSim): number[][] {
  const t = sim.S.t, order = ['PRODUCTIVE', 'STANDBY', 'ENGINEERING', 'SCHEDULED_DOWN', 'UNSCHEDULED_DOWN', 'NON_SCHEDULED'];
  return sim.S.tools.map(T => { const k = order.indexOf(T.st); return T.stateMs.map((v, i) => v + (i === k ? t - T.t0 : 0)); });
}

export interface GroupUtilisation { tools: number; productive: number; down: number; productiveOfAvailable: number }
/** Per tool group, the PRODUCTIVE share of calendar time between two stateTotals samples (utilisation), the down
 *  share (SCHEDULED_DOWN, UNSCHEDULED_DOWN, ENGINEERING, NON_SCHEDULED) and PRODUCTIVE over the time not down. */
export function groupUtilisation(sim: FabSim, a: number[][], b: number[][], spanMs: number): Record<string, GroupUtilisation> {
  const acc = new Map<string, { n: number; f: number[] }>();
  sim.res.forEach((r, i) => {
    const g = acc.get(r.group) ?? { n: 0, f: [0, 0, 0, 0, 0, 0] };
    g.n++;
    (b[i] as number[]).forEach((v, k) => { g.f[k] = (g.f[k] as number) + (v - ((a[i] as number[])[k] as number)) / spanMs; });
    acc.set(r.group, g);
  });
  const out: Record<string, GroupUtilisation> = {};
  for (const [name, g] of [...acc].sort((x, y) => x[0].localeCompare(y[0]))) {
    const f = g.f.map(v => v / g.n), productive = f[0] as number, down = (f[2] as number) + (f[3] as number) + (f[4] as number) + (f[5] as number);
    out[name] = { tools: g.n, productive: Number(productive.toFixed(3)), down: Number(down.toFixed(3)), productiveOfAvailable: Number((productive / Math.max(1e-9, 1 - down)).toFixed(3)) };
  }
  return out;
}
