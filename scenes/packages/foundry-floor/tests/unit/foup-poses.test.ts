// The scene draws every FOUP from the twin's state alone (sim-spec 8). These checks hold the pure pose helper to
// that: each lot is drawn at most once, every lot the scene can show (on a vehicle, at a port or UTS seat, on a
// stocker crane, at a stocker's manual counter) is drawn, lots inside a stocker slot or a furnace are not, and
// megafab's synthetic vehicles each carry one synthetic FOUP at the carried height.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FOUP_SYNTHETIC, foupPoseContext, foupPoses, foupYawForHeading } from '../../src/scene/foup-poses';
import type { FoupPose } from '../../src/scene/foup-poses';
import { createFab, FAB_DATA, HOUR_MS } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..');
const snapshot = readFileSync(resolve(PACKAGE, `data/warm/seed-${FAB_DATA.config.seeds.default}.json`), 'utf8');
const VISIBLE = new Set(['place', 'vehicle', 'crane', 'manual', 'floor']);
const H = FAB_DATA.layout.heights as Record<string, number>;
const SLOTS = FAB_DATA.layout.stockerSlots;
/** The highest FOUP the scene draws: a vehicle's carried FOUP, or a crane at the top slot level. */
const TOP_Y = Math.max(H.vehicleFoupBase as number, SLOTS.y0 + SLOTS.dy * (SLOTS.levels - 1));
/** Heights a FOUP rests at: load and stocker port seats, the manual counter, UTS seats, the carried height. */
const REST_Y = [H.loadPortSeat as number, H.utsSeat as number, H.vehicleFoupBase as number];

function sweep(mode: 'pilot' | 'megafab', hours: number, stepMs: number, check: (poses: FoupPose[], n: number, fab: ReturnType<typeof createFab>) => void) {
  const fab = createFab({ snapshot, mode });
  const ctx = foupPoseContext(fab.sim, FAB_DATA), out: FoupPose[] = [], scratch = new Float64Array(8);
  const end = fab.now() + hours * HOUR_MS;
  let samples = 0;
  for (let t = fab.now() + stepMs; t <= end; t += stepMs) {
    fab.step(t);
    check(out, foupPoses(ctx, t, out, scratch), fab);
    samples++;
  }
  return samples;
}

describe('FOUP poses from the twin', () => {
  test('pilot: each visible lot is drawn exactly once, hidden lots are not drawn, poses are in the fab', () => {
    const seen = { vehicle: 0, place: 0, crane: 0, manual: 0, floor: 0, hoisting: 0 };
    const samples = sweep('pilot', 6, 7_000, (poses, n, fab) => {
      const drawn = new Map<number, FoupPose>();
      for (let i = 0; i < n; i++) {
        const p = poses[i] as FoupPose;
        expect(p.lot).toBeGreaterThanOrEqual(0);
        expect(drawn.has(p.lot)).toBe(false);
        drawn.set(p.lot, p);
        for (const v of [p.x, p.y, p.z, p.yaw]) expect(Number.isFinite(v)).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(SLOTS.y0 - 1e-9);
        expect(p.y).toBeLessThanOrEqual(TOP_Y + 1e-9);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(36);
        expect(p.z).toBeGreaterThanOrEqual(-27);
        expect(p.z).toBeLessThanOrEqual(23.4);
      }
      for (const lot of fab.sim.lots()) {
        const pose = drawn.get(lot.id);
        if (VISIBLE.has(lot.loc)) {
          expect(pose).toBeDefined();
          seen[lot.loc as 'vehicle' | 'place' | 'crane' | 'manual' | 'floor']++;
          expect(pose?.cls).toBe(lot.cls);
          if (pose && lot.loc !== 'crane' && !REST_Y.some(y => Math.abs(pose.y - y) < 1e-6)) seen.hoisting++;
        } else expect(pose).toBeUndefined();
      }
      expect(drawn.size).toBe(fab.sim.lots().filter(l => VISIBLE.has(l.loc)).length);
    });
    expect(samples).toBeGreaterThan(3000);
    // Every kind of visible location occurs in six hours, and FOUPs are seen part-way along a hoist.
    for (const count of Object.values(seen)) expect(count).toBeGreaterThan(0);
  }, 60_000);

  test('megafab: one synthetic FOUP per synthetic vehicle, at the carried height', () => {
    const samples = sweep('megafab', 1, 60_000, (poses, n, fab) => {
      const synthetic = fab.sim.S.vehicles.filter(v => v.alive && v.syn).length;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const p = poses[i] as FoupPose;
        if (p.cls !== FOUP_SYNTHETIC) continue;
        drawn++;
        expect(p.lot).toBe(-1);
        expect(p.y).toBe(H.vehicleFoupBase as number);
      }
      expect(synthetic).toBeGreaterThan(0);
      expect(drawn).toBe(synthetic);
    });
    expect(samples).toBe(60);
  }, 60_000);

  test('the FOUP door (asset +X) faces the tool at every load port and into the stocker at every stocker port', () => {
    const fab = createFab({ snapshot, mode: 'pilot' });
    // A load port's facing points from its tool out to the aisle, so the door faces the other way (the port yaw plus 180 degrees).
    const ports = new Map(FAB_DATA.layout.tools.flatMap(t => t.ports.map(port => [port.id, port] as const)));
    let load = 0, stocker = 0;
    fab.sim.S.places.forEach((_, pi) => {
      const info = fab.sim.placeInfo(pi), yaw = foupYawForHeading(info.heading[0], info.heading[2]);
      const door = [Math.cos(yaw), -Math.sin(yaw)] as const;
      if (info.kind === 'load') {
        const port = ports.get(info.id);
        expect(port).toBeDefined();
        const f = port?.facing ?? [0, 0, 0];
        expect(door[0] * f[0] + door[1] * f[2]).toBeCloseTo(-1, 9);
        load++;
      } else if (info.kind === 'stocker' && info.inner) {
        const dx = info.inner[0] - info.seat[0], dz = info.inner[2] - info.seat[2], len = Math.hypot(dx, dz);
        expect((door[0] * dx + door[1] * dz) / len).toBeCloseTo(1, 9);
        stocker++;
      }
    });
    expect(load).toBe(ports.size);
    expect(stocker).toBeGreaterThan(0);
  });
});
