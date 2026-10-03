import { expect, test } from 'bun:test';
import { gpuWorkSummary, tabletPairVerdict } from '../gpu-work';

test('GPU work averages paired busy/clock samples, with explicit MHz conversion and sources', () => {
  const mali = gpuWorkSummary([{ gpuBusyPercent: 20, gpuClockKHz: 1_000_000 }, { gpuBusyPercent: 80, gpuClockKHz: 500_000 }]);
  expect(mali).toMatchObject({ samples: 2, clockMHzMean: 750, busyClockMHzMean: 300, sources: ['mali-sysfs-kHz'] });
  // Multiplying the means would incorrectly yield 375.
  expect(gpuWorkSummary([{ gpu: { 'utilization.gpu': 50, 'clocks.gr': 1700 } }])).toMatchObject({ samples: 1, clockMHzMean: 1700, busyClockMHzMean: 850, sources: ['nvidia-smi-MHz'] });
});

test('missing, zero-clock and invalid samples never become zero GPU work or get cross-paired', () => {
  expect(gpuWorkSummary([{ gpuBusyPercent: 20 }, { gpuClockKHz: 1000000 }, { gpuBusyPercent: 0, gpuClockKHz: 0 }, { gpuBusyPercent: 101, gpuClockKHz: 1000000 }, null])).toMatchObject({ samples: 0, omitted: 5, clockMHzMean: null, busyClockMHzMean: null });
  expect(gpuWorkSummary([{ gpuBusyPercent: 0, gpuClockKHz: 500000 }]).busyClockMHzMean).toBe(0);
});

const pairs = () => [1, 2, 3].flatMap(pair => (['A', 'B'] as const).map(side => ({ pair, side, valid: true, seconds: 60,
  gpuWork: gpuWorkSummary(Array.from({ length: 30 }, () => ({ gpuBusyPercent: side === 'A' ? 20 : 20.6, gpuClockKHz: 500000 }))),
  metrics: { p95: 20, withinOne: side === 'A' ? .95 : .94, over50: 0, over100: 0, gpuBusyClockMHz: side === 'A' ? 100 : 103 } })));
test('D16 retains exact margins, requires all three pairs to meet both margins, and keeps the p95 and hitch gates', () => {
  expect(tabletPairVerdict(pairs()).pass).toBe(true);
  const worse = pairs(); for (const r of worse.filter(r => r.side === 'B')) { r.metrics.withinOne = .939; r.metrics.gpuBusyClockMHz = 103.1; r.gpuWork.busyClockMHzMean = 103.1; }
  expect(tabletPairVerdict(worse)).toMatchObject({ pass: false, refreshRegressions: 3, gpuWorkRegressions: 3 });
  worse[1]!.metrics.withinOne = .95; worse[1]!.metrics.gpuBusyClockMHz = 100; worse[1]!.gpuWork.busyClockMHzMean = 100;
  expect(tabletPairVerdict(worse).pass).toBe(false);
  for (const r of worse.filter(r => r.side === 'B')) { r.metrics.withinOne = .95; r.metrics.gpuBusyClockMHz = 100; r.gpuWork.busyClockMHzMean = 100; }
  expect(tabletPairVerdict(worse).pass).toBe(true);
  worse[1]!.metrics.p95 = 33.4;
  expect(tabletPairVerdict(worse).pass).toBe(false);
  worse[1]!.metrics.p95 = 20; worse[1]!.metrics.over50 = 3;
  expect(tabletPairVerdict(worse).pass).toBe(false);
});
test('D16 missing, invalid, short or duplicate evidence stays unqualified', () => {
  expect(tabletPairVerdict(pairs().slice(0, 4)).pass).toBeNull();
  const short = pairs(); short[1]!.seconds = 10;
  expect(tabletPairVerdict(short).pass).toBeNull();
  const invalid = pairs(); invalid[1]!.valid = false;
  expect(tabletPairVerdict(invalid).pass).toBeNull();
  expect(tabletPairVerdict([...pairs(), pairs()[0]!]).pass).toBeNull();
  const missing = pairs(); missing[1]!.gpuWork.busyClockMHzMean = NaN;
  expect(tabletPairVerdict(missing).pass).toBeNull();
});

test('D16 requires actual Mali sample provenance and at least 90 percent of the 2-second sampling window', () => {
  const sparse = pairs();
  sparse[1]!.gpuWork = gpuWorkSummary([{ gpuBusyPercent: 20, gpuClockKHz: 500000 }, ...Array(29).fill(null)]);
  expect(tabletPairVerdict(sparse).pass).toBeNull();
  sparse[1]!.gpuWork = gpuWorkSummary(Array(26).fill({ gpuBusyPercent: 20, gpuClockKHz: 500000 }));
  expect(tabletPairVerdict(sparse).pass).toBeNull();
  sparse[1]!.gpuWork = gpuWorkSummary(Array(27).fill({ gpuBusyPercent: 20, gpuClockKHz: 500000 }));
  expect(tabletPairVerdict(sparse).pass).toBe(true);
  sparse[1]!.gpuWork = gpuWorkSummary(Array(30).fill({ gpu: { 'utilization.gpu': 20, 'clocks.gr': 500 } }));
  expect(tabletPairVerdict(sparse).pass).toBeNull();
});
