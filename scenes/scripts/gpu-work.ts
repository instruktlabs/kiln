/** D16 activity proxy, not measured energy or a hardware-independent count of GPU work. */
export function gpuWorkSummary(samples: readonly unknown[]) {
  const rows: { clock: number; work: number; source: string }[] = [];
  for (const sample of samples) {
    if (!sample || typeof sample !== 'object') continue;
    const s = sample as { gpu?: Record<string, unknown> | null; gpuBusyPercent?: unknown; gpuClockKHz?: unknown };
    const busy = s.gpu ? s.gpu['utilization.gpu'] : s.gpuBusyPercent;
    const raw = s.gpu ? s.gpu['clocks.gr'] : s.gpuClockKHz;
    if (typeof busy !== 'number' || !Number.isFinite(busy) || busy < 0 || busy > 100 || typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
    const clock = s.gpu ? raw : raw / 1000;
    rows.push({ clock, work: busy / 100 * clock, source: s.gpu ? 'nvidia-smi-MHz' : 'mali-sysfs-kHz' });
  }
  return {
    units: { clock: 'MHz', busyClock: 'busy fraction × MHz' },
    method: 'Arithmetic mean of same-sample busy-percent / 100 × clock-MHz; zero or unreadable clock omitted. An activity proxy, not energy or a cross-device comparison.',
    sources: [...new Set(rows.map(r => r.source))].sort(), samples: rows.length, omitted: samples.length - rows.length,
    clockMHzMean: rows.length ? rows.reduce((sum, r) => sum + r.clock, 0) / rows.length : null,
    busyClockMHzMean: rows.length ? rows.reduce((sum, r) => sum + r.work, 0) / rows.length : null,
  };
}

interface TabletRun {
  pair: number; side: 'A' | 'B'; valid: boolean; seconds?: number;
  gpuWork?: ReturnType<typeof gpuWorkSummary>;
  metrics: { p95: number | null; withinOne: number | null; over50: number; over100: number; gpuBusyClockMHz?: number | null };
}
/** D16: three paired 60-second tablet runs; missing evidence never implies acceptance. */
export function tabletPairVerdict(runs: readonly TabletRun[]) {
  const ids = [...new Set(runs.map(r => r.pair))].sort((a, b) => a - b), reasons: string[] = [];
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (ids.length !== 3 || runs.length !== 6) reasons.push('Exactly three A/B pairs are required');
  const pairs = ids.flatMap(pair => {
    const a = runs.filter(r => r.pair === pair && r.side === 'A'), b = runs.filter(r => r.pair === pair && r.side === 'B');
    if (a.length !== 1 || b.length !== 1) { reasons.push(`Pair ${pair} needs one run per side`); return []; }
    if ([a[0]!, b[0]!].some(r => !r.valid || !finite(r.seconds) || r.seconds < 60 || !finite(r.metrics.p95) || r.metrics.p95 < 0 || !finite(r.metrics.withinOne) || r.metrics.withinOne < 0 || r.metrics.withinOne > 1 || !finite(r.metrics.gpuBusyClockMHz) || r.metrics.gpuBusyClockMHz < 0 || !Number.isInteger(r.metrics.over50) || r.metrics.over50 < 0 || !Number.isInteger(r.metrics.over100) || r.metrics.over100 < 0)) {
      reasons.push(`Pair ${pair} lacks valid 60-second frame and GPU samples`); return [];
    }
    // This runner samples the tablet every two seconds. As with frame coverage,
    // require 90% of the planned window and 90% readable matching sample pairs.
    if ([a[0]!, b[0]!].some(r => {
      const w = r.gpuWork;
      return !w || !finite(w.busyClockMHzMean) || w.busyClockMHzMean < 0 || w.sources.length !== 1 || w.sources[0] !== 'mali-sysfs-kHz' ||
        w.samples < Math.ceil(r.seconds! / 2 * .9) || w.samples < (w.samples + w.omitted) * .9;
    })) { reasons.push(`Pair ${pair} lacks Mali provenance or 90% paired GPU sample coverage`); return []; }
    const ma = a[0]!.metrics, mb = b[0]!.metrics, wa = a[0]!.gpuWork!.busyClockMHzMean!, wb = b[0]!.gpuWork!.busyClockMHzMean!;
    if (wa === 0) { reasons.push(`Pair ${pair} has no nonzero GPU-work baseline`); return []; }
    return [{ pair, refreshDeltaPoints: (mb.withinOne! - ma.withinOne!) * 100, gpuWorkChangePercent: (wb / wa - 1) * 100,
      frameGate: mb.p95! <= 33.3 && mb.over50 <= 2 && mb.over100 === 0 }];
  });
  // Epsilon keeps exact decimal margins from failing through floating point roundoff.
  const refreshRegressions = pairs.filter(p => p.refreshDeltaPoints < -1 - 1e-9).length;
  const gpuWorkRegressions = pairs.filter(p => p.gpuWorkChangePercent > 3 + 1e-9).length;
  return { decision: 'D16', pass: reasons.length ? null : pairs.every(p => p.frameGate) && refreshRegressions === 0 && gpuWorkRegressions === 0,
    reasons, refreshRegressions, gpuWorkRegressions, pairs };
}
