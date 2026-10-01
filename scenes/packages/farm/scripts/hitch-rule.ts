// SPDX-License-Identifier: MIT
// The X-05 hitch rule, a gate since 2026-09-30 (DECISIONS.md D-28): for each 60 s rewrite run at every tier and backend,
// no frame over 100 ms, no frame over 50 ms (so 0 per minute) and a longest frame of at most 50 ms. Proposed in M4 from the
// hitch measurements (evidence/m4/hitches/README.md) and confirmed on the idle hub's X-05 runs of 2026-09-30: 160 of 160
// runs held it (32 cells of 5 runs; longest frame 33.4 ms on high/WebGPU/living-orbit, 16.8 ms on the minimal tier). The
// tablet's own row (at most 2 frames over 50 ms and none over 100 ms in its orbit) is measured on the device, not here.
export interface HitchLimits { over50PerMinute: number; over100: number; maxMs: number }
export interface HitchRun { run: number; valid: boolean; quiet: boolean; over50PerMinute: number | null; over100: number | null; maxMs: number | null }
export interface HitchVerdict {
  limits: HitchLimits;
  runs: { run: number; over50PerMinute: number | null; over100: number | null; maxMs: number | null; pass: boolean }[];
  /** Every run valid, quiet and within the limits; no runs is a fail, never a pass. */
  pass: boolean;
}

export const HITCH_RULE: Record<string, HitchLimits> = {
  high: { over50PerMinute: 0, over100: 0, maxMs: 50 }, balanced: { over50PerMinute: 0, over100: 0, maxMs: 50 },
  economy: { over50PerMinute: 0, over100: 0, maxMs: 50 }, minimal: { over50PerMinute: 0, over100: 0, maxMs: 50 },
};

const within = (value: number | null, limit: number) => typeof value === 'number' && Number.isFinite(value) && value <= limit;

export function hitchVerdict(runs: readonly HitchRun[], tier: string): HitchVerdict {
  const limits = HITCH_RULE[tier];
  if (!limits) throw new Error(`No hitch limits for tier ${tier}; the rule covers ${Object.keys(HITCH_RULE).join(', ')}`);
  const rows = runs.map(run => ({ run: run.run, over50PerMinute: run.over50PerMinute, over100: run.over100, maxMs: run.maxMs,
    pass: run.valid && run.quiet && within(run.over100, limits.over100) && within(run.over50PerMinute, limits.over50PerMinute) && within(run.maxMs, limits.maxMs) }));
  return { limits, runs: rows, pass: rows.length > 0 && rows.every(row => row.pass) };
}
