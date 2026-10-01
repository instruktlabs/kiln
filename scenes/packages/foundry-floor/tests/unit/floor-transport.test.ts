import { expect, test } from 'bun:test';
import { createFab, DAY_MS, FAB_DATA } from '../../src/sim/index';
import { foupPoseContext, foupPoses } from '../../src/scene/foup-poses';
import type { FoupPose } from '../../src/scene/foup-poses';

test('floor stations receive and release real lots through capacity-limited carriers', () => {
  const fab = createFab();
  fab.step(3 * DAY_MS);
  expect(fab.sim.eventCounts.floorPick ?? 0).toBeGreaterThan(0);
  expect(fab.sim.eventCounts.floorDrop ?? 0).toBeGreaterThan(0);
  expect(fab.sim.S.stats.shipped + fab.sim.S.lots.length).toBe(fab.sim.S.nextLot - 1);
});

test('a floor-carried production lot is visible exactly once and remains followable', () => {
  const fab = createFab();
  const ctx = foupPoseContext(fab.sim, FAB_DATA), out: FoupPose[] = [], scratch = new Float64Array(8);
  let carried = 0;
  for (let t = 1000; t <= 2 * DAY_MS; t += 1000) {
    fab.step(t);
    const lot = fab.sim.lots().find(l => l.loc === 'floor');
    if (!lot) continue;
    carried++;
    const count = foupPoses(ctx, t, out, scratch);
    expect(out.slice(0, count).filter(p => p.lot === lot.id)).toHaveLength(1);
    expect(fab.sim.lotView(lot.id)?.at).toMatch(/floor-/);
  }
  expect(carried).toBeGreaterThan(10);
});

function checkCustody(fab: ReturnType<typeof createFab>): void {
  const { S } = fab.sim;
  const owners = new Map<number, string[]>();
  const own = (id: number, where: string) => { if (id >= 0) owners.set(id, [...(owners.get(id) ?? []), where]); };
  S.places.forEach((p, i) => own(p.lot, `place:${i}`));
  S.vehicles.forEach((v, i) => { if (v.alive && !v.syn) own(v.lot, `vehicle:${i}`); });
  S.stockers.forEach((s, i) => s.manual.forEach(id => own(id, `manual:${i}`)));
  if (S.floor.active?.carrying) own(S.floor.active.lot, `floor:${S.floor.active.id}`);
  for (const lot of S.lots) {
    if (lot.loc === 'slot') {
      expect(S.stockers[lot.li]?.slots[lot.slot]).toBe(lot.id);
      own(lot.id, `slot:${lot.li}`);
    } else if (lot.loc === 'crane') {
      expect(S.stockers[lot.li]?.cur?.lot).toBe(lot.id);
      own(lot.id, `crane:${lot.li}`);
    } else if (lot.loc === 'buffer') own(lot.id, `buffer:${lot.li}`);
    expect(owners.get(lot.id)).toEqual([`${lot.loc}:${lot.li}`]);
  }
  expect(owners.size).toBe(S.lots.length);
  expect(S.stats.shipped + S.lots.length).toBe(S.nextLot - 1);
  const waiting = [...S.floor.queue.map(j => j.lot), ...(S.floor.active?.carrying || S.floor.active?.phase !== 'RETURN' ? S.floor.active ? [S.floor.active.lot] : [] : [])];
  expect(new Set(waiting).size).toBe(waiting.length);
}

test('production events conserve one owner per lot and keep selected floor ports off OHT jobs', () => {
  const fab = createFab();
  const floorPorts = new Set(FAB_DATA.layout.floorRobots.stations.map(s => s.port));
  const ctx = foupPoseContext(fab.sim, FAB_DATA), out: FoupPose[] = [], scratch = new Float64Array(8);
  let samples = 0;
  let bufferedBesideReservation = 0;
  const sim = fab.sim as unknown as { handle(event: { k: string }): void };
  const handle = sim.handle.bind(sim);
  sim.handle = event => {
    handle(event);
    if (!event.k.startsWith('floor') && event.k !== 'craneMid' && event.k !== 'crane') return;
    checkCustody(fab);
    const a = fab.sim.S.floor.active;
    if (a?.phase === 'PICK' && a.direction === 'deliver') {
      expect(fab.sim.S.floor.docks[a.stocker]).toBe(a.lot);
      expect(fab.sim.S.stockers[a.stocker]!.manual).toContain(a.lot);
    }
    const count = foupPoses(ctx, fab.now(), out, scratch);
    fab.sim.S.floor.docks.forEach((reserved, si) => {
      if (reserved < 0) return;
      const seat = FAB_DATA.layout.stockers[si]!.manualPort.seat;
      for (const id of fab.sim.S.stockers[si]!.manual) {
        if (id === reserved) continue;
        const pose = out.slice(0, count).find(p => p.lot === id)!;
        expect(pose).toBeDefined();
        expect(Math.hypot(pose.x - seat[0], pose.z - seat[2])).toBeGreaterThanOrEqual(0.45 - 1e-9);
        bufferedBesideReservation++;
      }
    });
    for (const v of fab.sim.S.vehicles) if (v.job) {
      expect(floorPorts.has(fab.sim.placeInfo(v.job.from).id)).toBe(false);
      expect(floorPorts.has(fab.sim.placeInfo(v.job.to).id)).toBe(false);
    }
    samples++;
  };
  fab.step(8 * DAY_MS);
  expect(samples).toBeGreaterThan(100);
  expect(bufferedBesideReservation).toBeGreaterThan(0);
  expect(fab.sim.S.floor.completedByStation.every(n => n > 0)).toBe(true);
  expect(fab.sim.S.floor.completedByCarrier.amr).toBeGreaterThan(0);
  expect(Object.keys(fab.sim.S.floor.completedByCarrier)).toEqual(['amr']);
}, 20_000); // About 5 s in the full CPU suite on this shared PC; allow a cold loaded run.

test('a mid-carry snapshot restores exact floor custody, queue and continuation', () => {
  const a = createFab({ seed: 2 });
  for (let t = 1000; t < 2 * DAY_MS && !a.sim.S.floor.active?.carrying; t += 1000) a.step(t);
  expect(a.sim.S.floor.active?.carrying).toBe(true);
  const b = createFab({ seed: 2, snapshot: a.snapshot() });
  expect(b.snapshot()).toBe(a.snapshot());
  a.step(4 * DAY_MS);
  for (let t = b.now() + 7000; t < 4 * DAY_MS; t += 7000) b.step(t);
  b.step(4 * DAY_MS);
  expect(b.snapshot()).toBe(a.snapshot());
  expect(b.hourlyHashes()).toEqual(a.hourlyHashes());
});
