// SPDX-License-Identifier: MIT
// The twin's agent API (sim-spec 9) over explicit data. The page builds it from the pack's data entries; Node tools,
// tests and the headless API use createFab (index.ts), which defaults to FAB_DATA read from disk.
import { DAY_MS } from './data';
import type { FabData } from './data';
import { FabSim } from './fab';
import type { ClipEvent, DispatchRule, E10State, FabKpis, FabMode, LotClass, LotState, VehicleState } from './fab';

export interface CreateFabOptions {
  seed?: number;
  mode?: FabMode;
  /** Wafer starts per month; the default is the configured 4,500 (owner decision; the spec's sourced 3,000 is kept in the config). */
  wspm?: number;
  /** Days simulated in pilot mode before the fab opens (sim-spec 4). Ignored when a snapshot is given. */
  warmupDays?: number;
  /** A snapshot from Fab.snapshot() (for example a stored warm start) to start from instead of a fresh fab. */
  snapshot?: string;
  /** Tools held NON_SCHEDULED for this run, in addition to the configured ones. */
  nonScheduled?: string[];
  /** Multiplies every group's mean time to repair (the configured tuning value when omitted). */
  mttrScale?: number;
}

export interface FabStateView {
  t: number;
  mode: FabMode;
  rule: DispatchRule;
  lots: { id: number; lotClass: LotClass; step: number; state: LotState; tool: string | null }[];
  vehicles: { id: string; state: VehicleState; lot: number | null; synthetic: boolean }[];
  tools: { id: string; state: E10State; since: number }[];
}

export interface Fab {
  step(untilMs: number): void;
  state(): FabStateView;
  events(sinceMs: number): ClipEvent[];
  setDispatchRule(rule: DispatchRule): void;
  injectDown(toolId: string, atMs: number, durationMs: number): void;
  hash(): string;
  kpis(): FabKpis;
  /** Beyond section 9: the sim time, snapshots, the mode switch, the hourly hashes and the engine itself. */
  now(): number;
  snapshot(): string;
  setMode(mode: FabMode): void;
  hourlyHashes(): readonly string[];
  readonly sim: FabSim;
}

/** The twin built from explicit data (the page passes the pack's data; src/sim/index.ts defaults to FAB_DATA). */
export function createFabFrom(data: FabData, options: CreateFabOptions = {}): Fab {
  const sim = new FabSim({
    data,
    seed: options.seed ?? data.config.seeds.default,
    mode: 'pilot',
    ...(options.wspm !== undefined ? { wspm: options.wspm } : {}),
    nonScheduled: [...data.config.tuning.nonScheduled, ...(options.nonScheduled ?? [])],
    ...(options.mttrScale !== undefined ? { mttrScale: options.mttrScale } : {}),
  });
  if (options.snapshot !== undefined) sim.restore(options.snapshot);
  else if ((options.warmupDays ?? 0) > 0) sim.step(Math.round((options.warmupDays ?? 0) * DAY_MS));
  if ((options.mode ?? 'pilot') !== sim.S.mode) sim.setMode(options.mode ?? 'pilot');
  return {
    sim,
    step: untilMs => sim.step(untilMs),
    now: () => sim.S.t,
    state: () => ({
      t: sim.S.t,
      mode: sim.S.mode,
      rule: sim.S.rule,
      lots: sim.lots().map(l => ({ id: l.id, lotClass: sim.lotClass(l.id), step: l.step, state: l.st, tool: l.tool >= 0 ? sim.resourceInfo(l.tool).id : null })),
      vehicles: sim.S.vehicles.flatMap((v, i) => (v.alive ? [{ id: `vehicle-${i + 1}`, state: sim.vehicleState(i), lot: v.lot >= 0 ? v.lot : null, synthetic: v.syn }] : [])),
      tools: sim.res.map((r, i) => ({ id: r.id, state: sim.toolState(i), since: sim.toolSince(i) })),
    }),
    events: sinceMs => sim.clipEvents(sinceMs),
    setDispatchRule: rule => sim.setRule(rule),
    injectDown: (toolId, atMs, durationMs) => sim.injectDown(toolId, atMs, durationMs),
    hash: () => sim.hash(),
    kpis: () => sim.kpis(),
    snapshot: () => sim.snapshot(),
    setMode: mode => sim.setMode(mode),
    hourlyHashes: () => sim.S.hashes,
  };
}
