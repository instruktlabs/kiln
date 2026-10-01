// SPDX-License-Identifier: MIT
// Runs the twin headless and prints one line per day plus a JSON summary: events scheduled, wall time (indicative
// only on a shared PC), WIP, lots out, moves, cycle time and vehicles busy.
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/sim-run.ts [--days 30] [--seed 1]
//   [--mode pilot|megafab] [--wspm 3000] [--non-scheduled id,id] [--mttr-scale 1] [--snapshot-out path]
//   [--snapshot-day N] (the day after which the snapshot is written; the last day when omitted) [--quiet]
import { writeFileSync } from 'node:fs';
import { createFab, DAY_MS } from '../src/sim/index';
import type { FabMode } from '../src/sim/index';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const days = Number(flag('days') ?? 30);
const seed = Number(flag('seed') ?? 1);
const mode = (flag('mode') ?? 'pilot') as FabMode;
const wspm = flag('wspm');
const nonScheduled = (flag('non-scheduled') ?? '').split(',').filter(Boolean);
const mttrScale = flag('mttr-scale');
const quiet = args.includes('--quiet');
const snapshotOut = flag('snapshot-out');
const snapshotDay = Number(flag('snapshot-day') ?? days);

const t0 = performance.now();
const fab = createFab({ seed, mode, nonScheduled, ...(wspm ? { wspm: Number(wspm) } : {}), ...(mttrScale ? { mttrScale: Number(mttrScale) } : {}) });
const S = fab.sim.S;
let lastSeq = S.seq, lastMoves = 0, lastShipped = 0, lastBusy = 0;
const rows: Record<string, number>[] = [];
for (let d = 1; d <= days; d++) {
  const w0 = performance.now();
  fab.step(d * DAY_MS);
  const w1 = performance.now();
  const hours = S.stats.hourly, last = hours[hours.length - 1];
  const busy = last ? last.busyMs : 0;
  const ships = S.stats.ships.filter(([st]) => st > (d - 1) * DAY_MS && st <= d * DAY_MS);
  const ct = ships.length ? ships.reduce((s, [st, rel]) => s + (st - rel), 0) / ships.length / DAY_MS : 0;
  const row = {
    day: d, wallMs: Math.round(w1 - w0), events: S.seq - lastSeq, wip: S.lots.length,
    out: S.stats.shipped - lastShipped, moves: S.stats.moves - lastMoves, ctDays: Number(ct.toFixed(2)),
    busy: Number(((busy - lastBusy) / DAY_MS).toFixed(2)), emergency: S.stats.emergencyStops, skipped: S.stats.releasesSkipped,
  };
  rows.push(row);
  if (!quiet) console.log(JSON.stringify(row));
  lastSeq = S.seq; lastMoves = S.stats.moves; lastShipped = S.stats.shipped; lastBusy = busy;
  if (snapshotOut && d === snapshotDay) writeFileSync(snapshotOut, fab.snapshot());
}
const k = fab.kpis();
const summary = {
  seed, mode, days, totalWallMs: Math.round(performance.now() - t0), events: S.seq, hash: fab.hash(),
  hourlyHashes: S.hashes.length, lastHourlyHash: S.hashes[S.hashes.length - 1] ?? null, kpis: k, eventCounts: fab.sim.eventCounts,
};
console.log(JSON.stringify(summary));
