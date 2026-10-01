// The process-model rules of sim-spec 4 and 6 as unit tests (CONWIP, furnace batching, the move rule), plus the
// agent API's snapshot, outage and mode switch. Private engine methods are observed by wrapping them on one
// instance; nothing here changes what the twin does.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFab, DAY_MS, FAB_DATA, HOUR_MS } from '../../src/sim/index';
import type { FabData } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..');
const WARM = readFileSync(resolve(PACKAGE, 'data/warm/seed-1.json'), 'utf8');
const WARM_T = 30 * DAY_MS;
// Private methods are reached through this view in tests only.
type Spy = Record<string, (...args: never[]) => unknown>;

describe('CONWIP (sim-spec 4)', () => {
  // Measured 0.6 s.
  test('releases pause while WIP is at the cap, so WIP never exceeds it', () => {
    const cap = 6;
    const data: FabData = { ...FAB_DATA, config: { ...FAB_DATA.config, starts: { ...FAB_DATA.config.starts, conwipCap: cap } } };
    const fab = createFab({ data });
    const sim = fab.sim as unknown as Spy & typeof fab.sim;
    const release = sim.onRelease.bind(sim) as (t: number) => void;
    let maxWip = 0, releases = 0;
    sim.onRelease = ((t: number) => { release(t); releases++; maxWip = Math.max(maxWip, fab.sim.S.lots.length); }) as never;
    fab.step(3 * DAY_MS);
    expect(releases).toBe(3 * FAB_DATA.config.starts.releaseHours.length + 1); // every release hour of 3 days, and day 3 00:00
    expect(maxWip).toBe(cap);
    expect(fab.sim.S.stats.releasesSkipped).toBe(releases - (fab.sim.S.nextLot - 1));
    expect(fab.sim.S.stats.releasesSkipped).toBeGreaterThan(0);
  });

  test('the configured cap is 95 and releases run every 4 h (4,500 starts a month, the owner decision)', () => {
    expect(FAB_DATA.config.starts.conwipCap).toBe(95);
    expect(FAB_DATA.config.starts.waferStartsPerMonth.value).toBe(4500);
    expect(FAB_DATA.config.starts.waferStartsPerMonth.sourced?.value).toBe(3000);
    expect(FAB_DATA.config.starts.releaseHours).toEqual([0, 4, 8, 12, 16, 20]);
    const fab = createFab({});
    fab.step(DAY_MS - 1);
    expect(fab.sim.S.lots.map(l => l.rel)).toEqual(FAB_DATA.config.starts.releaseHours.map(h => h * HOUR_MS));
  });

  test('the sourced rate of the spec still runs: 3,000 starts a month releases at 00:00, 06:00, 12:00 and 18:00', () => {
    const fab = createFab({ wspm: 3000 });
    fab.step(DAY_MS - 1);
    expect(fab.sim.S.lots.map(l => l.rel)).toEqual([0, 6, 12, 18].map(h => h * HOUR_MS));
  });
});

describe('furnace batching (sim-spec 4)', () => {
  // Measured 1.3 s for 6 simulated days.
  test('a batch starts with 4 lots, or with 2 or 3 once the oldest has waited 2 h', () => {
    const fab = createFab({ snapshot: WARM });
    const sim = fab.sim as unknown as Spy & typeof fab.sim;
    const clip = sim.clip.bind(sim) as (t: number, entity: string, name: string) => void;
    const batches: { size: number; oldestWaitMs: number }[] = [];
    sim.clip = ((t: number, entity: string, name: string) => {
      if (name === 'BoatLoad') {
        const ri = fab.sim.res.findIndex(r => r.id === entity);
        const T = fab.sim.S.tools[ri] as unknown as { batch: number[] };
        const qts = T.batch.map(id => (fab.sim.lots().find(l => l.id === id) as { qt: number }).qt);
        batches.push({ size: T.batch.length, oldestWaitMs: t - Math.min(...qts) });
      }
      clip(t, entity, name);
    }) as never;
    fab.step(WARM_T + 6 * DAY_MS);
    const fb = FAB_DATA.tools.furnaceBatch;
    expect(fb).toMatchObject({ maxLots: 4, minLots: 2, oldestWaitH: 2 });
    expect(batches.length).toBeGreaterThan(20);
    for (const b of batches) {
      expect(b.size).toBeGreaterThanOrEqual(2);
      expect(b.size).toBeLessThanOrEqual(4);
      if (b.size < 4) expect(b.oldestWaitMs).toBeGreaterThanOrEqual(2 * HOUR_MS);
    }
  }, 30_000);
});

describe('the move rule (sim-spec 4 and 6)', () => {
  // Measured 0.6 s for 2 simulated days.
  test('a finished lot goes to a free port of its next tool, else to an upstream UTS seat, else to the nearer stocker', () => {
    const fab = createFab({ snapshot: WARM });
    const sim = fab.sim as unknown as Spy & typeof fab.sim;
    const dispatch = sim.dispatchStep.bind(sim) as (lot: { id: number; step: number; loc: string; li: number; dest: number; tool: number }, t: number) => void;
    const chooseTool = sim.chooseTool.bind(sim) as (group: string, t: number) => number;
    const freePort = sim.freePort.bind(sim) as (ri: number) => number;
    const utsUpstream = sim.utsUpstream.bind(sim) as (src: number, ri: number) => number;
    const routeGroup = (fab.sim as unknown as { routeGroup: string[] }).routeGroup;
    const tally = { port: 0, uts: 0, stocker: 0, stored: 0 };
    sim.dispatchStep = ((lot: Parameters<typeof dispatch>[0], t: number) => {
      if (lot.loc === 'slot') { tally.stored++; dispatch(lot, t); return; }
      const ri = chooseTool(routeGroup[lot.step] as string, t);
      const port = freePort(ri), seat = port < 0 ? utsUpstream(lot.li, ri) : -1;
      dispatch(lot, t);
      expect(lot.tool).toBe(ri);
      if (port >= 0 && FAB_DATA.layout.floorRobots.stations.some(s => s.port === fab.sim.placeInfo(port).id)) {
        expect(lot.dest < 0 || fab.sim.placeInfo(lot.dest).kind === 'stocker').toBe(true); tally.stocker++;
      } else if (port >= 0) { expect(lot.dest).toBe(port); tally.port++; }
      else if (seat >= 0) { expect(lot.dest).toBe(seat); expect(fab.sim.placeInfo(seat).kind).toBe('uts'); tally.uts++; }
      else { expect(lot.dest < 0 || fab.sim.placeInfo(lot.dest).kind === 'stocker').toBe(true); tally.stocker++; }
    }) as never;
    fab.step(WARM_T + 2 * DAY_MS);
    expect(tally.port).toBeGreaterThan(1000);
    expect(tally.port + tally.uts + tally.stocker + tally.stored).toBeGreaterThan(1500);
  }, 30_000);

  test('the least-work tool is chosen, ties to the lowest id', () => {
    const fab = createFab({ snapshot: WARM });
    const sim = fab.sim as unknown as Spy & typeof fab.sim;
    const work = sim.work.bind(sim) as (ri: number, t: number) => number;
    const chooseTool = sim.chooseTool.bind(sim) as (group: string, t: number) => number;
    for (const group of ['etch', 'cvdald', 'cmp', 'metrology', 'probe', 'furnace', 'euv']) {
      const members = fab.sim.res.map((r, i) => ({ r, i })).filter(x => x.r.group === group);
      const least = Math.min(...members.map(x => work(x.i, WARM_T)));
      const first = members.find(x => work(x.i, WARM_T) === least);
      expect(chooseTool(group, WARM_T)).toBe(first?.i as number);
    }
  });
});

describe('agent API (sim-spec 9)', () => {
  // Measured 0.8 s.
  test('snapshot and restore continue identically', () => {
    const a = createFab({ seed: 3 });
    a.step(1.5 * DAY_MS);
    const b = createFab({ seed: 3, snapshot: a.snapshot() });
    expect(b.hash()).toBe(a.hash());
    a.step(2.5 * DAY_MS);
    b.step(2.5 * DAY_MS);
    expect(b.hash()).toBe(a.hash());
    expect(b.hourlyHashes()).toEqual(a.hourlyHashes());
    expect(b.snapshot()).toBe(a.snapshot());
  }, 30_000);

  test('different seeds give different fabs; the stored day-30 snapshot restores at day 30', () => {
    const a = createFab({ seed: 1 }), b = createFab({ seed: 2 });
    a.step(DAY_MS); b.step(DAY_MS);
    expect(a.hash()).not.toBe(b.hash());
    const warm = createFab({ snapshot: WARM });
    expect(warm.now()).toBe(WARM_T);
    expect(warm.hourlyHashes().length).toBe(720);
  });

  test('injectDown takes a tool down for the given time and it comes back', () => {
    const fab = createFab({ snapshot: WARM });
    fab.injectDown('etch-03', WARM_T + HOUR_MS, 2 * HOUR_MS);
    fab.step(WARM_T + HOUR_MS + 1);
    const state = () => fab.state().tools.find(t => t.id === 'etch-03')?.state;
    expect(state()).toBe('UNSCHEDULED_DOWN');
    fab.step(WARM_T + 4 * HOUR_MS);
    expect(state()).not.toBe('UNSCHEDULED_DOWN');
    expect(fab.events(WARM_T).some(e => e.entity === 'etch-03')).toBe(true);
  });

  test('the three dispatch rules run', () => {
    for (const rule of ['leastWork', 'fifo', 'criticalRatio'] as const) {
      const fab = createFab({ snapshot: WARM });
      fab.setDispatchRule(rule);
      fab.step(WARM_T + 6 * HOUR_MS);
      expect(fab.state().rule).toBe(rule);
      expect(fab.kpis().wipLots).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe('megafab slice (sim-spec 6 and 7)', () => {
  // Measured 0.6 s for two runs of 6 simulated hours.
  test('synthetic vehicles stay on the spine loop, the total stays within 40, the run is deterministic, and pilot mode removes them', () => {
    const run = () => {
      const fab = createFab({ snapshot: WARM, mode: 'megafab' });
      const loop = new Set(fab.sim.spineLoop);
      let off = 0;
      for (let h = 1; h <= 6; h++) {
        fab.step(WARM_T + h * HOUR_MS);
        for (const v of fab.sim.S.vehicles) if (v.alive && v.syn && v.route.some(e => !loop.has(e))) off++;
      }
      return { fab, off };
    };
    const one = run(), two = run();
    const alive = one.fab.sim.S.vehicles.filter(v => v.alive);
    const synthetic = alive.filter(v => v.syn).length;
    // The configured count (15, TASK-FF2 item 6) is placed, within the cap and the vehicle ceiling.
    const mf = FAB_DATA.config.modes.megafab;
    expect(mf.synthetic).toBe(15);
    expect(synthetic).toBe(Math.min(mf.synthetic, mf.syntheticCap, mf.maxVehicles - FAB_DATA.config.modes.pilot.vehicles));
    expect(synthetic).toBeLessThanOrEqual(mf.syntheticCap);
    expect(alive.length).toBeLessThanOrEqual(FAB_DATA.config.modes.megafab.maxVehicles);
    expect(one.off).toBe(0);
    expect(one.fab.sim.S.stats.emergencyStops).toBe(0);
    expect(two.fab.hash()).toBe(one.fab.hash());
    one.fab.setMode('pilot');
    expect(one.fab.sim.S.vehicles.filter(v => v.alive && v.syn).length).toBe(0);
    one.fab.step(WARM_T + 7 * HOUR_MS);
    expect(one.fab.state().vehicles.length).toBe(FAB_DATA.config.modes.pilot.vehicles);
  }, 30_000);
});
