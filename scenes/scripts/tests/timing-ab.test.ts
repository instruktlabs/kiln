import { expect, test } from 'bun:test';
import { cellKind, cellUrl, cpuPercent, d41Verdict, displayRate, frameStats, gpuBusyMedian, hitchCounts, HUB_RULE, interleaveOrder, parseBattery, parseCell, parseLoadavg, parseNvidiaSmi, parseProcStat,
  parseThermalStatus, parseTop, parseWho, PC_RULE, percentile, planRuns, quietVerdict, refreshShare, summarizeCell, tabletCool, type RunMetrics } from '../timing-ab';

test('percentile uses the pilot rule (ceil(n q)-th smallest) and frame stats keep count, fps and sampled time', () => {
  const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
  expect([percentile(values, .5), percentile(values, .95), percentile(values, 1), percentile([], .5)]).toEqual([5, 10, 10, null]);
  const s = frameStats([8, 8, 8, 16]);
  expect([s.count, s.p50, s.p95, s.max, s.sampledMs, s.fps]).toEqual([4, 8, 16, 16, 40, 100]);
  expect(frameStats([NaN, 10]).count).toBe(1);
});

test('the display rate is the median idle rAF interval', () => {
  const r = displayRate([8.33, 8.34, 8.32, 16.67, 8.33]);
  expect(r.periodMs).toBe(8.33); expect(r.hz).toBeCloseTo(120.05, 1);
  expect(displayRate([]).periodMs).toBeNull();
});

test('refresh share counts frames within one (< 1.5 P) and within two (< 2.5 P) display periods', () => {
  const P = 1000 / 120;
  const intervals = [8.2, 8.4, 8.5, 12.4, 12.6, 16.7, 20.8, 21, 25, 33.4];
  // < 12.5: 8.2 8.4 8.5 12.4 → 4; < 20.83: plus 12.6 16.7 20.8 → 7.
  const s = refreshShare(intervals, P);
  expect(s.withinOne).toBe(.4); expect(s.withinTwo).toBe(.7); expect(s.frames).toBe(10);
  expect(refreshShare([], P).withinOne).toBeNull();
  expect(refreshShare([10], NaN).withinTwo).toBeNull();
  // A 60 Hz tablet: 16.7 is one refresh, 33.3 two, 50 three.
  expect(refreshShare([16.6, 16.8, 33.3, 50.1], 1000 / 60)).toMatchObject({ withinOne: .5, withinTwo: .75 });
});

test('hitch counts and the D-41 rule (desktop 0/0/<=50 ms; tablet <=2 over 50, 0 over 100; only on 60 s runs)', () => {
  const c = hitchCounts([8, 50, 50.1, 99, 100.5]);
  expect(c).toEqual({ over50: 3, over100: 1, longestMs: 100.5 });
  expect(d41Verdict(c, { row: 'desktop', seconds: 60 }).pass).toBe(false);
  expect(d41Verdict(hitchCounts([8, 33.4, 50]), { row: 'desktop', seconds: 60 }).pass).toBe(true);
  expect(d41Verdict(hitchCounts([8, 50.2]), { row: 'desktop', seconds: 60 }).pass).toBe(false);
  expect(d41Verdict(hitchCounts([8, 51, 70]), { row: 'tablet', seconds: 60 }).pass).toBe(true);
  expect(d41Verdict(hitchCounts([8, 51, 70, 60]), { row: 'tablet', seconds: 60 }).pass).toBe(false);
  expect(d41Verdict(hitchCounts([8, 101]), { row: 'tablet', seconds: 60 }).pass).toBe(false);
  const dry = d41Verdict(hitchCounts([8, 101]), { row: 'desktop', seconds: 10 });
  expect([dry.applies, dry.pass]).toEqual([false, null]);
  expect(hitchCounts([]).longestMs).toBeNull();
});

test('interleave order alternates which side runs first in each pair', () => {
  expect(interleaveOrder(1)).toEqual(['A', 'B']);
  expect(interleaveOrder(3)).toEqual(['A', 'B', 'B', 'A', 'A', 'B']);
  expect(() => interleaveOrder(0)).toThrow();
  const plan = planRuns([parseCell('farm:high:hero'), parseCell('golden-gate:minimal:arrival')], 2);
  expect(plan.map(p => `${p.cell.scene}/${p.pair}/${p.side}`)).toEqual(['farm/1/A', 'farm/1/B', 'farm/2/B', 'farm/2/A', 'golden-gate/1/A', 'golden-gate/1/B', 'golden-gate/2/B', 'golden-gate/2/A']);
  expect(plan.map(p => p.position)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
});

test('cells parse as scene:tier:name and resolve to the scene own views and workloads', () => {
  expect(parseCell('foundry-floor:high:campus')).toEqual({ scene: 'foundry-floor', tier: 'high', name: 'campus' });
  expect(() => parseCell('farm:ultra:hero')).toThrow(); expect(() => parseCell('mill:high:hero')).toThrow(); expect(() => parseCell('farm:high')).toThrow();
  expect(cellKind(parseCell('farm:high:hero'))).toBe('view');
  expect(cellKind(parseCell('farm:economy:tractor-drive'))).toBe('workload');
  expect(cellKind(parseCell('golden-gate:minimal:drive'))).toBe('workload');
  expect(cellKind(parseCell('foundry-floor:high:fab-overview'))).toBe('view');
  expect(() => cellKind(parseCell('golden-gate:high:hero'))).toThrow(/no view or workload/);
  // The clock is never frozen: no freeze or time parameter; tier and A/B extras are added.
  const url = new URL(cellUrl('http://127.0.0.1:4400/', parseCell('golden-gate:minimal:arrival'), { msaa: 'store' }));
  expect(Object.fromEntries(url.searchParams)).toEqual({ capture: '1', hud: '0', preset: 'day', cam: 'arrival', tier: 'minimal', msaa: 'store' });
  expect(new URL(cellUrl('http://x', parseCell('farm:high:hero'))).search).toBe('?view=hero&tier=high');
  expect(new URL(cellUrl('http://x', parseCell('foundry-floor:economy:drive'))).search).toBe('?capture=1&tier=economy');
});

test('quiet-check parsing: loadavg, /proc/stat, nvidia-smi, who and top', () => {
  expect(parseLoadavg('0.37 0.40 0.37 1/589 1685215\n')).toEqual({ one: .37, five: .4, fifteen: .37, running: 1, total: 589 });
  const a = parseProcStat('cpu  100 0 50 1000 50 0 0 0 0 0\ncpu0 1 2 3'), b = parseProcStat('cpu  110 0 60 1170 50 0 0 0 0 0\n');
  expect(a).toEqual({ total: 1200, idle: 1050 }); expect(cpuPercent(a, b)).toBeCloseTo(100 * 20 / 190, 6);
  expect(cpuPercent(a, a)).toBeNull();
  expect(parseNvidiaSmi('0, 39, 300, 5, P8\n', ['utilization.gpu', 'temperature.gpu', 'clocks.gr', 'memory.used', 'pstate'])).toEqual([{ 'utilization.gpu': 0, 'temperature.gpu': 39, 'clocks.gr': 300, 'memory.used': 5, pstate: 'P8' }]);
  expect(parseNvidiaSmi('[N/A], 40\n', ['a', 'b'])[0]).toEqual({ a: null, b: 40 });
  expect(parseWho('\n')).toEqual([]); expect(parseWho('matthewk tty2 2026-09-30 01:00\n')).toHaveLength(1);
  const top = `top - 01:19:44 up 6 days, 16:51,  3 users,  load average: 0.37, 0.40, 0.37
Tasks: 300 total,   1 running, 299 sleeping,   0 stopped,   0 zombie

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   1234 matthewk  20   0 3400000 200000  90000 S   6.2   1.3   1:23.45 kwin_wayland --xwayland
      1 root      20   0   22000  12000   9000 S   0.0   0.1   0:05.00 systemd
`;
  expect(parseTop(top)).toEqual([{ pid: 1234, user: 'matthewk', cpuPercent: 6.2, memPercent: 1.3, command: 'kwin_wayland --xwayland' }, { pid: 1, user: 'root', cpuPercent: 0, memPercent: .1, command: 'systemd' }]);
  expect(parseTop('no header')).toEqual([]);
});

test('quiet verdicts: the hub pilot rule and this PC rule', () => {
  const calm = { cpu: [1, 1.5, .8, 2, 1, 1, 1, 1], gpu: [0, 0, 1, 0, 0, 0, 0, 0] };
  expect(quietVerdict(calm, HUB_RULE).quiet).toBe(true);
  expect(quietVerdict({ ...calm, gpu: [0, 0, 4, 0, 0, 0, 0, 0] }, HUB_RULE).reasons).toEqual(['GPU max 4 % > 3 %']);
  expect(quietVerdict({ ...calm, cpu: [1, 1, 1, 13, 1, 1, 1, 1] }, HUB_RULE).reasons[0]).toMatch(/CPU max 13/);
  expect(quietVerdict({ ...calm, screenLocked: true }, HUB_RULE).quiet).toBe(false);
  expect(quietVerdict({ cpu: [1, 1], gpu: [] }, HUB_RULE).reasons).toEqual(['2 of 8 CPU samples']);
  const busyPc = { cpu: [35, 40, 38, 36, 37, 39, 41, 36], gpu: [22, 25, 24, 23, 22, 21, 20, 25] };
  expect(quietVerdict(busyPc, PC_RULE).reasons).toEqual(['CPU mean 37.75 % >= 20 %', 'GPU max 25 % > 9.999 %']);
  expect(quietVerdict({ cpu: [10, 12, 15, 11, 9, 14, 13, 12], gpu: [5, 5, 5, 5, 5, 5, 5, 9] }, PC_RULE).quiet).toBe(true);
});

test('tablet readings and the cool rule (thermal none or light, battery at most 35 C)', () => {
  const battery = `Current Battery Service state:
  AC powered: false
  USB powered: true
  status: 5
  level: 100
  temperature: 240
09-30 02:00:19.688  Sending ACTION_BATTERY_CHANGED: level:100, temperature:228`;
  expect(parseBattery(battery)).toEqual({ level: 100, temperatureC: 24, status: 5, usbPowered: true, acPowered: false });
  expect(parseThermalStatus('IsStatusOverride: false\nThermal Status: 1\n')).toBe(1);
  expect(parseThermalStatus('nothing')).toBeNull();
  expect(tabletCool({ thermalStatus: 1, batteryC: 34.9 }).cool).toBe(true);
  expect(tabletCool({ thermalStatus: 2, batteryC: 30 }).reasons).toEqual(['thermal status moderate (2) above light']);
  expect(tabletCool({ thermalStatus: 0, batteryC: 35.2 }).reasons).toEqual(['battery 35.2 C above 35 C']);
  expect(tabletCool({ thermalStatus: null, batteryC: null }).reasons).toHaveLength(2);
});

test('a cell summary gives per-side medians over valid runs and paired B - A differences', () => {
  const m = (p50: number, p95: number, withinOne: number, over50 = 0): RunMetrics => ({ p50, p95, p99: p95, max: p95, fps: 1000 / p50, withinOne, withinTwo: 1, over50, over100: 0, longestMs: p95, cpuRenderP50: p50 / 2, cpuRenderP95: p95 / 2, drawsMedian: 583, trianglesMedian: 2e6, gpuBusy: p50 * 4 });
  const runs = [
    { side: 'A' as const, pair: 1, valid: true, metrics: m(10, 20, .9) }, { side: 'B' as const, pair: 1, valid: true, metrics: m(9, 18, .95) },
    { side: 'B' as const, pair: 2, valid: true, metrics: m(9.5, 19, .94) }, { side: 'A' as const, pair: 2, valid: true, metrics: m(10.5, 21, .9) },
    { side: 'A' as const, pair: 3, valid: true, metrics: m(11, 22, .88, 1) }, { side: 'B' as const, pair: 3, valid: false, metrics: m(30, 60, .1, 9) },
  ];
  const s = summarizeCell(runs);
  expect([s.A.valid, s.B.valid, s.A.runs, s.B.runs]).toEqual([3, 2, 3, 3]);
  expect(s.A.p50).toEqual({ median: 10.5, min: 10, max: 11 });
  expect(s.B.p95?.max).toBe(19); // the invalid run is left out
  expect(s.pairs).toBe(2);
  expect(s.paired.map(p => p.p95)).toEqual([-2, -2]);
  expect(s.deltas.p50).toEqual({ medianDelta: -1, bLower: 2, bHigher: 0, equal: 0 });
  expect(s.deltas.drawsMedian).toEqual({ medianDelta: 0, bLower: 0, bHigher: 0, equal: 2 });
  expect(s.ratios.p95).toBeCloseTo(18 / 21, 6);
  expect(s.deltas.gpuBusy?.medianDelta).toBe(-4);
});

test('GPU busy during a run is the median of nvidia-smi or Mali gpu_busy samples', () => {
  expect(gpuBusyMedian([{ gpu: { 'utilization.gpu': 50 } }, { gpu: { 'utilization.gpu': 40 } }, { gpu: null }, { gpu: { 'utilization.gpu': 60 } }])).toBe(50);
  expect(gpuBusyMedian([{ gpuBusyPercent: 31 }, { batteryC: 25, gpuBusyPercent: 29 }, { gpuBusyPercent: null }])).toBe(29);
  expect(gpuBusyMedian([])).toBeNull();
});
