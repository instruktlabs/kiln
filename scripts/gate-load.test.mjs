import { expect, test } from 'bun:test';
import {
  busyPercent,
  formatLoad,
  loadVerdict,
  summarize,
  QUIET_THRESHOLD_PERCENT,
} from './gate-load.mjs';

const cpu = (idle, busy) => ({ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } });

test('busyPercent is the busy share of the time elapsed between two samples', () => {
  const before = [cpu(100, 100), cpu(100, 100)];
  const after = [cpu(150, 150), cpu(100, 200)];
  // cpu0: 50 idle, 50 busy; cpu1: 0 idle, 100 busy -> 150 of 200
  expect(busyPercent(before, after)).toBe(75);
});

test('busyPercent is null when no time passed or the cores differ', () => {
  expect(busyPercent([cpu(1, 1)], [cpu(1, 1)])).toBeNull();
  expect(busyPercent([cpu(1, 1)], [cpu(1, 1), cpu(1, 1)])).toBeNull();
  expect(busyPercent([], [])).toBeNull();
});

test('loadVerdict warns above the threshold and only refuses when asked', () => {
  expect(QUIET_THRESHOLD_PERCENT).toBe(90);
  expect(loadVerdict(50, {})).toEqual({ level: 'ok' });
  expect(loadVerdict(90, {})).toEqual({ level: 'ok' });
  expect(loadVerdict(95, {}).level).toBe('warn');
  expect(loadVerdict(95, {}).message).toContain('95%');
  expect(loadVerdict(95, {}).message).toContain('Timeouts');
  expect(loadVerdict(95, { KILN_GATE_REQUIRE_QUIET: '1' }).level).toBe('refuse');
  expect(loadVerdict(95, { KILN_GATE_REQUIRE_QUIET: '0' }).level).toBe('warn');
  expect(loadVerdict(null, { KILN_GATE_REQUIRE_QUIET: '1' })).toEqual({ level: 'ok' });
});

test('summarize reports start, peak, mean and end', () => {
  expect(summarize([40, 100, 70])).toEqual({ start: 40, end: 70, peak: 100, mean: 70 });
  expect(summarize([])).toBeNull();
});

test('formatLoad names an unknown reading', () => {
  expect(formatLoad(87.4)).toBe('87%');
  expect(formatLoad(null)).toBe('unknown');
});
