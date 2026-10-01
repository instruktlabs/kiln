// Sim-spec 7 (time scaling): the wall-delta cap, pause, which one-shot clips play or jump at each scale, loops at
// sim time or 2x wall speed, pulses from 60x, and sim state that never depends on frame boundaries.
import { describe, expect, test } from 'bun:test';
import { createClock, drawAsPulse, formatSimTime, loopPhase, oneShotPlays, oneShotTime, scaleLabel, tick } from '../../src/sim/clock';
import { createFab, DAY_MS, FAB_DATA, HOUR_MS } from '../../src/sim/index';

const rules = FAB_DATA.config.scales;

describe('sim-spec 7: scales', () => {
  test('the ladder is Pause, 1x, 10x, 60x and 600x', () => {
    expect(rules.values).toEqual([0, 1, 10, 60, 600]);
    expect(rules.values.map(v => scaleLabel(v, rules))).toEqual(['Pause', '1x', '10x', '60x', '600x']);
  });

  test('sim time advances by the wall delta times the scale; a delta above 250 ms counts as 250 ms; pause holds', () => {
    const c = createClock(1000, 600);
    expect(tick(c, 16, rules)).toBe(1000 + 16 * 600);
    expect(tick(c, 5000, rules)).toBe(1000 + 16 * 600 + 250 * 600);
    c.scale = 0;
    const held = c.simMs;
    expect(tick(c, 100, rules)).toBe(Math.floor(held));
  });

  test('one-shot clips: all play at 1x; at 10x those lasting at least 0.25 s of wall time play; at 60x and 600x all jump', () => {
    const hoist = 5000, dock = 2000;
    expect(oneShotPlays(hoist, 1, rules)).toBe(true);
    expect(oneShotPlays(dock, 1, rules)).toBe(true);
    expect(oneShotPlays(hoist, 10, rules)).toBe(true); // 0.5 s of wall time
    expect(oneShotPlays(dock, 10, rules)).toBe(false); // 0.2 s: jumps to its end pose
    for (const s of [60, 600]) { expect(oneShotPlays(hoist, s, rules)).toBe(false); expect(oneShotPlays(dock, s, rules)).toBe(false); }
    expect(oneShotTime(1000 + 2500, 1000, hoist, 1, rules)).toBe(2500);
    expect(oneShotTime(1000 + 2500, 1000, hoist, 10, rules)).toBe(2500);
    expect(oneShotTime(1000 + 500, 1000, dock, 10, rules)).toBe(dock);
    expect(oneShotTime(1000 + 500, 1000, hoist, 600, rules)).toBe(hoist);
    expect(oneShotTime(900, 1000, hoist, 600, rules)).toBe(0);
  });

  test('loops run at sim time at 1x, freeze when paused, and run at 2x wall speed above 1x', () => {
    const c = createClock(10_000, 1);
    expect(loopPhase(c, 0, 4000, rules)).toBeCloseTo(0.5, 9);
    c.scale = 0;
    expect(loopPhase(c, 0, 4000, rules)).toBeCloseTo(0.5, 9);
    c.scale = 600;
    c.wallMs = 1000;
    expect(loopPhase(c, 0, 4000, rules)).toBeCloseTo(0.5, 9); // 1000 ms of wall at 2x = 2000 ms of a 4000 ms loop
  });

  test('moving vehicles are drawn as pulses from 60x; stopped vehicles are drawn normally', () => {
    expect(drawAsPulse(10, true, rules)).toBe(false);
    expect(drawAsPulse(60, true, rules)).toBe(true);
    expect(drawAsPulse(600, false, rules)).toBe(false);
  });

  test('the HUD time reads day and hh:mm', () => {
    expect(formatSimTime(30 * DAY_MS + 14 * HOUR_MS + 5 * 60_000)).toBe('day 30 14:05');
  });

  // Measured about 0.7 s.
  test('sim state does not depend on frame boundaries: irregular frames and scale changes give the headless hashes', () => {
    const headless = createFab({ seed: 5 });
    headless.step(2 * DAY_MS);
    const framed = createFab({ seed: 5 });
    const c = createClock(0, 600);
    let x = 12345;
    const end = 2 * DAY_MS;
    for (let i = 0; ; i++) {
      x = (x * 1103515245 + 12345) % 2147483648; // a fixed sequence of frame lengths, 1 to 300 ms
      if (i % 5000 === 0) c.scale = [600, 60, 600, 10][(i / 5000) % 4] as number;
      const target = Math.min(tick(c, 1 + (x % 300), rules), end);
      framed.step(target);
      if (target >= end) break;
    }
    expect(framed.hourlyHashes()).toEqual(headless.hourlyHashes());
    expect(framed.hash()).toBe(headless.hash());
  }, 60_000);
});
