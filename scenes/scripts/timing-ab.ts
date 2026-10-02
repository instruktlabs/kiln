// S6 timing (docs/plans/2026-10-01-draw-optimization-cycle.md; OD-3, OD-5, OD-6, OD-7, OD-12): one interleaved A/B
// frame-time runner for Farm, Foundry Floor and Golden Gate. Two test builds (A = before, B = after) are served by this
// runner on two loopback ports; every cell (scene, tier, view or workload) runs A/B/B/A/A/B… (order alternating per pair)
// on one host: the hub (a local headed Chrome) or the tablet (the device kit's adb reverse and DevTools forward from this
// PC). Timing is taken only when a person runs it on a quiet host; `quiet` and the block preflight say whether it is.
// Per run it records the rAF frame interval (p50, p95, p99, max), the share of frames within one and within two display
// refreshes (OD-7; the period comes from the display rate measured on a blank page just before), the D-41 hitch counts
// (frames over 50 ms and over 100 ms, longest frame), load samples during the run (hub: CPU and NVIDIA GPU utilisation
// and the busiest processes outside the benchmark; tablet: battery temperature, thermal status and Mali GPU busy), the
// kit's CPU time around renderer.render, and renderer.info's per-frame draw count sampled every 30 frames as a cross-check.
// Runs under Node 22 (bundled by scripts/make-timing-kit.ts) or Bun; needs no network beyond loopback and adb.
//   node runner/timing-ab.mjs ab --a builds/<A> --b builds/<B> --cells farm:high:hero,golden-gate:minimal:arrival [--pairs 3]
//        [--seconds 60] [--device local|tablet] [--block <name>] [--out results] [--chrome <path>] [--chrome-arg <flag>]…
//   node runner/timing-ab.mjs quiet [--out <file>]      host quiet check (load average, busiest processes, GPU, logins, 8 x 2 s window)
//   node runner/timing-ab.mjs summary --dir results/<block>
//   node runner/timing-ab.mjs transient [--device tablet]   WebGPU TRANSIENT_ATTACHMENT support (read-only)
//   node runner/timing-ab.mjs verify
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, hostname, release, type as osType } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
// @ts-ignore Node-builtins-only static server shared with the standalone outputs (no-store aside, the same policy for A and B).
import { startStaticServer } from './static-server.mjs';
import { adbDevices, adbFor, connectDevtools, deviceState, forwardDevtools, listMappings, removeForward, removeReverse, reversePort, wakeAndOpenChrome, type Adb } from './device-kit';

// ---------------------------------------------------------------- pure logic (tests/timing-ab.test.ts)

export type Side = 'A' | 'B';
export const SCENE_IDS = ['farm', 'foundry-floor', 'golden-gate'] as const;
export type SceneId = typeof SCENE_IDS[number];
export const TIERS = ['minimal', 'economy', 'balanced', 'high'] as const;
export type Tier = typeof TIERS[number];

/** The Farm and Golden Gate runners' percentile rule (the sealed pilot's summarize()): the ceil(n q)-th smallest value. */
export function percentile(values: readonly number[], q: number): number | null {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]! : null;
}
export const median = (values: readonly number[]) => percentile(values, .5);
const round = (value: number | null | undefined, digits = 3) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;

export function frameStats(intervals: readonly number[]) {
  const finite = intervals.filter(Number.isFinite), sum = finite.reduce((s, v) => s + v, 0);
  return { count: finite.length, p50: percentile(finite, .5), p95: percentile(finite, .95), p99: percentile(finite, .99), max: percentile(finite, 1),
    mean: finite.length ? sum / finite.length : null, fps: sum > 0 ? 1000 * finite.length / sum : null, sampledMs: sum };
}
/**
 * Display rate from rAF intervals on a probe page: the lower quartile. Throttling and skipped vsyncs only lengthen an
 * interval (the tablet's Chrome dropped an idle about:blank to 30 Hz part-way through the probe in 2 of 36 runs), so the
 * shorter intervals carry the refresh period; the median does not when half the window is throttled.
 */
export function displayRate(intervals: readonly number[]) {
  const periodMs = percentile(intervals.filter(v => v > 0), .25);
  return { periodMs, hz: periodMs ? 1000 / periodMs : null, samples: intervals.length };
}
/**
 * OD-7: the share of frames presented within one and within two display refreshes. A rAF interval is a whole number of
 * vsync periods plus timer jitter, so an interval counts as k refreshes when it rounds to k periods: within one means
 * interval < 1.5 P, within two means interval < 2.5 P.
 */
export function refreshShare(intervals: readonly number[], periodMs: number) {
  const finite = intervals.filter(Number.isFinite), n = finite.length;
  if (!(periodMs > 0) || !n) return { periodMs: periodMs > 0 ? periodMs : null, withinOne: null, withinTwo: null, frames: n };
  const one = finite.filter(v => v < 1.5 * periodMs).length, two = finite.filter(v => v < 2.5 * periodMs).length;
  return { periodMs, withinOne: one / n, withinTwo: two / n, frames: n };
}
export function hitchCounts(intervals: readonly number[]) {
  const finite = intervals.filter(Number.isFinite);
  return { over50: finite.filter(v => v > 50).length, over100: finite.filter(v => v > 100).length, longestMs: finite.length ? Math.max(...finite) : null };
}
/**
 * D-41 (owner, 2026-09-30, keeping D-28's limits): per 60 s run at every tier, 0 frames over 100 ms, 0 over 50 ms and a
 * longest frame of at most 50 ms; the tablet row allows at most 2 frames over 50 ms and 0 over 100 ms. It is judged
 * only on a run of at least 60 s; shorter (dry) runs report the counts with `applies: false`.
 */
export function d41Verdict(counts: ReturnType<typeof hitchCounts>, o: { row: 'desktop' | 'tablet'; seconds: number }) {
  const applies = o.seconds >= 60;
  const limits = o.row === 'tablet' ? { over50AtMost: 2, over100AtMost: 0, longestMsAtMost: null } : { over50AtMost: 0, over100AtMost: 0, longestMsAtMost: 50 };
  const pass = counts.over50 <= limits.over50AtMost && counts.over100 <= limits.over100AtMost && (limits.longestMsAtMost === null || (counts.longestMs ?? 0) <= limits.longestMsAtMost);
  return { row: o.row, applies, limits, pass: applies ? pass : null };
}
/** A/B order per pair, alternating so neither side always runs first: pair 1 A B, pair 2 B A, pair 3 A B, … */
export function interleaveOrder(pairs: number): Side[] {
  if (!Number.isInteger(pairs) || pairs < 1) throw new Error('pairs must be a positive integer');
  return Array.from({ length: pairs }, (_, i) => (i % 2 === 0 ? ['A', 'B'] : ['B', 'A']) as Side[]).flat();
}
export interface Cell { scene: SceneId; tier: Tier; name: string }
export const cellId = (c: Cell) => `${c.scene}-${c.tier}-${c.name}`;
/** "scene:tier:view-or-workload", for example farm:high:hero or golden-gate:minimal:arrival. */
export function parseCell(text: string): Cell {
  const [scene, tier, name, ...rest] = text.trim().split(':');
  if (!scene || !tier || !name || rest.length) throw new Error(`Cell ${text} is not scene:tier:name`);
  if (!(SCENE_IDS as readonly string[]).includes(scene)) throw new Error(`Unknown scene ${scene}`);
  if (!(TIERS as readonly string[]).includes(tier)) throw new Error(`Unknown tier ${tier}`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`View or workload ${name} uses lowercase letters, numbers and hyphens`);
  return { scene: scene as SceneId, tier: tier as Tier, name };
}
export interface PlannedRun { cell: Cell; pair: number; position: number; side: Side }
/** Every cell runs its own interleaved pairs in turn; position counts runs within the cell from 1. */
export function planRuns(cells: readonly Cell[], pairs: number): PlannedRun[] {
  const order = interleaveOrder(pairs);
  return cells.flatMap(cell => order.map((side, i) => ({ cell, pair: Math.floor(i / 2) + 1, position: i + 1, side })));
}

// Host readings, parsed from the text the tools print.
export function parseLoadavg(text: string) {
  const [one, five, fifteen, tasks] = text.trim().split(/\s+/); const [running, total] = (tasks ?? '').split('/').map(Number);
  return { one: Number(one), five: Number(five), fifteen: Number(fifteen), running: running ?? null, total: total ?? null };
}
/** The first line of /proc/stat: total and idle (idle + iowait) jiffies. */
export function parseProcStat(text: string) {
  const values = text.split(/\r?\n/)[0]!.trim().split(/\s+/).slice(1, 9).map(Number);
  return { total: values.reduce((s, v) => s + v, 0), idle: values[3]! + values[4]! };
}
export const cpuPercent = (a: { total: number; idle: number }, b: { total: number; idle: number }) => b.total > a.total ? 100 * (1 - (b.idle - a.idle) / (b.total - a.total)) : null;
/** One `nvidia-smi --query-gpu=<fields> --format=csv,noheader,nounits` row per GPU; "[N/A]" reads null. */
export function parseNvidiaSmi(text: string, fields: readonly string[]) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split(',').map((value, i) => {
    const v = value.trim(), n = Number(v); return [fields[i] ?? `field${i}`, v === '' || /N\/A/.test(v) ? null : Number.isFinite(n) ? n : v];
  })) as Record<string, number | string | null>);
}
export const parseWho = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
/** `top -b -n 1` process rows (after the PID header): pid, user, %CPU, %MEM, command. */
export function parseTop(text: string, limit = 8) {
  const lines = text.split(/\r?\n/), header = lines.findIndex(line => /^\s*PID\s+USER/.test(line));
  if (header < 0) return [];
  const columns = lines[header]!.trim().split(/\s+/), cpu = columns.indexOf('%CPU'), mem = columns.indexOf('%MEM'), command = columns.length - 1;
  return lines.slice(header + 1).map(line => line.trim().split(/\s+/)).filter(f => f.length >= columns.length && /^\d+$/.test(f[0]!))
    .map(f => ({ pid: Number(f[0]), user: f[1]!, cpuPercent: Number(f[cpu]), memPercent: Number(f[mem]), command: f.slice(command).join(' ') })).slice(0, limit);
}
/** The sealed pilot's hub preflight rule (8 samples of 2 s; CPU mean < 5 %, CPU max < 12 %, NVIDIA GPU <= 3 %, no screen locker). */
export const HUB_RULE = { samples: 8, intervalSeconds: 2, cpuMeanBelow: 5, cpuMaxBelow: 12, gpuMaxAtMost: 3, source: 'sealed pilot ops/run-hub-performance.py preflight (hub-2026-09-30 tools/common.py)' } as const;
/** This PC (plan default): CPU < 20 % and GPU < 10 %, judged on the same 8 x 2 s window. */
export const PC_RULE = { samples: 8, intervalSeconds: 2, cpuMeanBelow: 20, cpuMaxBelow: 100, gpuMaxAtMost: 9.999, source: 'plan default for this PC: CPU < 20 %, GPU < 10 %' } as const;
/** The pilot's tablet preflight (farm-pilot ops/tablet-observe.py): CPU mean < 8 %, CPU max < 12 %, Mali GPU busy <= 3 %. */
export const TABLET_RULE = { samples: 8, intervalSeconds: 2, cpuMeanBelow: 8, cpuMaxBelow: 12, gpuMaxAtMost: 3, source: 'farm-pilot ops/tablet-observe.py (golden-gate tests/tools/tablet-check.ts)' } as const;
export type QuietRule = { samples: number; intervalSeconds: number; cpuMeanBelow: number; cpuMaxBelow: number; gpuMaxAtMost: number; source: string };
export function quietVerdict(window: { cpu: readonly number[]; gpu: readonly (number | null)[]; screenLocked?: boolean | null }, rule: QuietRule) {
  const cpu = window.cpu.filter(Number.isFinite), gpu = window.gpu.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const cpuMean = cpu.length ? cpu.reduce((s, v) => s + v, 0) / cpu.length : null, cpuMax = cpu.length ? Math.max(...cpu) : null, gpuMax = gpu.length ? Math.max(...gpu) : null;
  const reasons: string[] = [];
  if (cpu.length < rule.samples) reasons.push(`${cpu.length} of ${rule.samples} CPU samples`);
  if (cpuMean !== null && cpuMean >= rule.cpuMeanBelow) reasons.push(`CPU mean ${cpuMean.toFixed(2)} % >= ${rule.cpuMeanBelow} %`);
  if (cpuMax !== null && cpuMax >= rule.cpuMaxBelow) reasons.push(`CPU max ${cpuMax.toFixed(2)} % >= ${rule.cpuMaxBelow} %`);
  if (gpuMax !== null && gpuMax > rule.gpuMaxAtMost) reasons.push(`GPU max ${gpuMax} % > ${rule.gpuMaxAtMost} %`);
  if (window.screenLocked) reasons.push('screen locker active');
  return { quiet: reasons.length === 0, cpuMean, cpuMax, gpuMax, reasons, rule };
}
// Tablet readings (dumpsys battery and thermalservice; the Mali sysfs nodes used by golden-gate tablet-check.ts).
export function parseBattery(text: string) {
  const get = (key: string) => new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim() ?? null;
  const temperature = get('temperature');
  return { level: get('level') === null ? null : Number(get('level')), temperatureC: temperature === null ? null : Number(temperature) / 10, status: get('status') === null ? null : Number(get('status')),
    usbPowered: get('USB powered') === 'true', acPowered: get('AC powered') === 'true' };
}
export const THERMAL_NAMES = ['none', 'light', 'moderate', 'severe', 'critical', 'emergency', 'shutdown'] as const;
export function parseThermalStatus(text: string): number | null { const m = /Thermal Status:\s*(\d+)/.exec(text); return m ? Number(m[1]) : null; }
/** OD-6 and this step's rule: start and continue only while thermal status is none or light and the battery is at most about 35 C. */
export const TABLET_COOL = { maxThermalStatus: 1, maxBatteryC: 35 } as const;
export function tabletCool(state: { thermalStatus: number | null; batteryC: number | null }, rule: { maxThermalStatus: number; maxBatteryC: number } = TABLET_COOL) {
  const reasons: string[] = [];
  if (state.thermalStatus === null) reasons.push('thermal status unreadable');
  else if (state.thermalStatus > rule.maxThermalStatus) reasons.push(`thermal status ${THERMAL_NAMES[state.thermalStatus] ?? state.thermalStatus} (${state.thermalStatus}) above ${THERMAL_NAMES[rule.maxThermalStatus]}`);
  if (state.batteryC === null) reasons.push('battery temperature unreadable');
  else if (state.batteryC > rule.maxBatteryC) reasons.push(`battery ${state.batteryC} C above ${rule.maxBatteryC} C`);
  return { cool: reasons.length === 0, reasons, rule };
}

/** The per-run values a cell summary compares (one RunRecord carries them under `metrics`). */
export interface RunMetrics { p50: number | null; p95: number | null; p99: number | null; max: number | null; fps: number | null; withinOne: number | null; withinTwo: number | null;
  over50: number; over100: number; longestMs: number | null; cpuRenderP50: number | null; cpuRenderP95: number | null; drawsMedian: number | null; trianglesMedian: number | null;
  /** Median GPU busy % over the load samples taken during the sample (hub: nvidia-smi utilization.gpu; tablet: Mali gpu_busy). At a locked refresh it shows a cost difference the frame interval cannot. */
  gpuBusy?: number | null }
export interface RunSummaryInput { side: Side; pair: number; valid: boolean; metrics: RunMetrics }
const METRIC_KEYS = ['p50', 'p95', 'p99', 'max', 'fps', 'withinOne', 'withinTwo', 'over50', 'over100', 'longestMs', 'cpuRenderP50', 'cpuRenderP95', 'drawsMedian', 'trianglesMedian', 'gpuBusy'] as const;
/** GPU busy % from load samples taken during a run: nvidia-smi rows (hub, this PC) or Mali gpu_busy readings (tablet). */
export function gpuBusyMedian(samples: readonly unknown[]): number | null {
  const values = samples.map(s => { const x = s as { gpu?: Record<string, unknown> | null; gpuBusyPercent?: number | null }; return x.gpu ? x.gpu['utilization.gpu'] : x.gpuBusyPercent; })
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return values.length ? median(values) : null;
}
/**
 * One cell: per side, the median (and range) over its valid runs of each per-run value; per pair, B - A for each value
 * (both runs of the pair valid), with the median paired difference and how many pairs went each way. Lower is better
 * for times and hitch counts; higher for fps and the refresh shares.
 */
export function summarizeCell(runs: readonly RunSummaryInput[]) {
  const side = (s: Side) => {
    const list = runs.filter(r => r.side === s && r.valid);
    return { runs: runs.filter(r => r.side === s).length, valid: list.length, ...Object.fromEntries(METRIC_KEYS.map(k => {
      const values = list.map(r => r.metrics[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return [k, values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values) } : null];
    })) } as { runs: number; valid: number } & Record<typeof METRIC_KEYS[number], { median: number | null; min: number; max: number } | null>;
  };
  const a = side('A'), b = side('B'), pairs = [...new Set(runs.map(r => r.pair))].sort((x, y) => x - y);
  const paired = pairs.flatMap(pair => {
    const ra = runs.find(r => r.pair === pair && r.side === 'A'), rb = runs.find(r => r.pair === pair && r.side === 'B');
    if (!ra || !rb || !ra.valid || !rb.valid) return [];
    return [{ pair, ...Object.fromEntries(METRIC_KEYS.map(k => [k, typeof ra.metrics[k] === 'number' && typeof rb.metrics[k] === 'number' ? (rb.metrics[k] as number) - (ra.metrics[k] as number) : null])) } as { pair: number } & Record<typeof METRIC_KEYS[number], number | null>];
  });
  const deltas = Object.fromEntries(METRIC_KEYS.map(k => {
    const values = paired.map(p => p[k]).filter((v): v is number => typeof v === 'number');
    return [k, values.length ? { medianDelta: median(values), bLower: values.filter(v => v < 0).length, bHigher: values.filter(v => v > 0).length, equal: values.filter(v => v === 0).length } : null];
  }));
  const ratio = (k: typeof METRIC_KEYS[number]) => { const ra = a[k]?.median, rb = b[k]?.median; return typeof ra === 'number' && typeof rb === 'number' && ra !== 0 ? rb / ra : null; };
  return { A: a, B: b, pairs: paired.length, paired, deltas, ratios: { p50: ratio('p50'), p95: ratio('p95'), cpuRenderP50: ratio('cpuRenderP50'), gpuBusy: ratio('gpuBusy') } };
}

// ---------------------------------------------------------------- scenes: views, workloads and the page setup per scene

type Kind = 'view' | 'workload';
interface SceneTiming {
  views: readonly string[]; workloads: readonly string[];
  /** Page query for a cell (tier and backend are added by the runner); never `freeze` or `time`, so the scene clock runs. */
  query(kind: Kind, name: string): Record<string, string>;
  /** After ready and the governor hold: puts the camera on the view or starts the workload. */
  engage(page: Page, kind: Kind, name: string): Promise<void>;
  /** Camera position and any workload state, read at the start and end of sampling. */
  state(page: Page): Promise<{ pose: unknown; workload: Record<string, unknown> | null }>;
  /** True when the workload is running as named (views: always true). */
  engaged(kind: Kind, name: string, state: { pose: unknown; workload: Record<string, unknown> | null }): boolean;
}
const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args); // eslint-disable-line @typescript-eslint/no-explicit-any
const waitFrames = (page: Page, n: number) => page.evaluate(count => (window as any).__kilnScene.waitFrames(count), n); // eslint-disable-line @typescript-eslint/no-explicit-any
async function until(page: Page, hook: string, args: unknown[], test: string, timeout = 120_000) {
  await page.waitForFunction((n, a, t) => { const value = (window as any).__kilnScene.invoke(n, ...a); return new Function('v', `return (${t});`)(value); }, { timeout, polling: 200 }, hook, args, test); // eslint-disable-line @typescript-eslint/no-explicit-any
}
// Views and workloads are the scenes' own: Farm layout views (scene-fixtures FARM_VIEWS) and src/play/workloads.ts; Foundry
// Floor campus views (FOUNDRY_CAMPUS_VIEWS), fab views (FOUNDRY_FAB_VIEWS, entered through the arrival canopy) and the sedan
// drive (campus/exterior/Drive.tsx); Golden Gate cameras (GG_CAMERAS) and src/camera/workloads.ts orbit, flyover, drive.
const FARM_VIEWS = ['hero', 'opposite', 'top', 'eye-height', 'crops', 'fences', 'props', 'watermill-wheel', 'watermill-interior', 'house-interior', 'house-porch', 'house-window-out'] as const;
const FF_CAMPUS = ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout'] as const;
const FF_FAB = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const;
const GG_CAMERAS = ['arrival', 'postcard', 'pier', 'topdown', 'horizon', 'deck', 'tower', 'span', 'lanes', 'sidewalk', 'traffic'] as const;
export const SCENES: Readonly<Record<SceneId, SceneTiming>> = {
  farm: {
    views: FARM_VIEWS, workloads: ['living-orbit', 'living-route', 'walk', 'tractor-drive'],
    query: (kind, name) => ({ view: kind === 'view' ? name : 'hero' }),
    async engage(page, kind, name) { if (kind === 'view') await invoke(page, 'setView', name); else await page.evaluate(n => (window as any).__kilnScene.runWorkload(n), name); }, // eslint-disable-line @typescript-eslint/no-explicit-any
    async state(page) { const s = await invoke(page, 'simState') as any; return { pose: s?.camera ?? await invoke(page, 'cameraPose') ?? null, workload: s ? { active: s.active, driving: s.driving, drivenMeters: s.drivenMeters ?? null } : null }; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    engaged: (kind, name, s) => kind === 'view' || (name === 'tractor-drive' ? s.workload?.driving === true : name === 'walk' ? s.workload?.active === true && s.workload.driving === false : true),
  },
  'foundry-floor': {
    views: [...FF_CAMPUS, ...FF_FAB.map(v => `fab-${v}`)], workloads: ['drive'],
    query: () => ({ capture: '1' }),
    async engage(page, kind, name) {
      await until(page, 'driveTraffic', [1], 'v !== null');
      if (kind === 'workload') { await page.evaluate(n => (window as any).__kilnScene.runWorkload(n), name); return; } // eslint-disable-line @typescript-eslint/no-explicit-any
      if (name.startsWith('fab-')) {
        // scene-fixtures FOUNDRY_FIXTURES fab entry: Arrival, the canopy prompt, enter, the interior ready.
        await invoke(page, 'campusView', 'canopy'); await until(page, 'campusState', [], 'v && v.canEnter');
        await invoke(page, 'campusEnter'); await until(page, 'campusPlace', [], 'v.interiorReady && !v.moving');
        await invoke(page, 'ffSetView', name.slice(4)); await waitFrames(page, 12); return;
      }
      await invoke(page, 'campusView', name); await waitFrames(page, 18);
    },
    async state(page) { const c = await invoke(page, 'campusState') as any, d = await invoke(page, 'driveState') as any; return { pose: d?.camera?.position ?? c?.camera?.position ?? null, workload: d ? { u: d.u, v: d.v, speed: d.speed } : null }; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    engaged: (kind, _name, s) => kind === 'view' || (s.workload !== null && Math.abs(Number(s.workload.speed)) > .5),
  },
  'golden-gate': {
    views: GG_CAMERAS, workloads: ['orbit', 'flyover', 'drive'],
    query: (kind, name) => ({ capture: '1', hud: '0', preset: 'day', cam: kind === 'view' ? name : 'arrival' }),
    async engage(page, kind, name) { if (kind === 'view') { await invoke(page, 'setView', name); await waitFrames(page, 20); } else await page.evaluate(n => (window as any).__kilnScene.runWorkload(n), name); }, // eslint-disable-line @typescript-eslint/no-explicit-any
    async state(page) { const g = await invoke(page, 'ggStats') as any, d = await invoke(page, 'driveState') as any; return { pose: g?.camera?.position ?? null, workload: { mode: g?.camera?.mode ?? null, drive: d ? { z: d.z, speed: d.speed } : null } }; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    engaged: (kind, name, s) => kind === 'view' || (name === 'orbit' ? s.workload?.mode === 'orbit' : name === 'flyover' ? s.workload?.mode === 'flight' : Math.abs(Number((s.workload?.drive as any)?.speed ?? 0)) > 1), // eslint-disable-line @typescript-eslint/no-explicit-any
  },
};
export function cellKind(cell: Cell): Kind {
  const s = SCENES[cell.scene];
  if (s.views.includes(cell.name)) return 'view';
  if (s.workloads.includes(cell.name)) return 'workload';
  throw new Error(`${cell.scene} has no view or workload ${cell.name}; views ${s.views.join(', ')}; workloads ${s.workloads.join(', ')}`);
}
export function cellUrl(base: string, cell: Cell, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...SCENES[cell.scene].query(cellKind(cell), cell.name), tier: cell.tier, ...extra });
  return `${base.replace(/[/]+$/, '')}/?${query}`;
}

// ---------------------------------------------------------------- CLI options

const argv = process.argv.slice(2), command = argv[0] ?? 'help';
const flag = (name: string) => argv.includes(name);
const option = (name: string, fallback?: string) => { const at = argv.indexOf(name); if (at < 0) return fallback; const value = argv[at + 1]; if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`); return value; };
const many = (name: string) => argv.flatMap((value, at) => argv[at - 1] === name ? [value] : []);
const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = () => resolve(option('--kit', resolve(here, '..'))!);
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
const run = (file: string, args: string[], timeout = 10_000) => new Promise<string | null>(done => execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 << 20 }, (error, stdout) => done(error ? null : String(stdout))));
const now = () => new Date().toISOString();
async function writeJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 1) + '\n'); return path; }

// ---------------------------------------------------------------- host load (hub, this PC) and tablet state

const GPU_FIELDS = ['utilization.gpu', 'temperature.gpu', 'clocks.gr', 'memory.used', 'pstate'] as const;
async function gpuRow() { const out = await run('nvidia-smi', [`--query-gpu=${GPU_FIELDS.join(',')}`, '--format=csv,noheader,nounits'], 8000); return out ? parseNvidiaSmi(out, GPU_FIELDS)[0] ?? null : null; }
async function cpuCounters() {
  if (process.platform === 'linux') return parseProcStat(await readFile('/proc/stat', 'utf8'));
  return cpus().reduce((s, c) => { const t = c.times; return { total: s.total + t.user + t.nice + t.sys + t.idle + t.irq, idle: s.idle + t.idle }; }, { total: 0, idle: 0 });
}
/** Per-process CPU jiffies (Linux): the busiest processes over a window, outside a set of excluded process trees. */
async function procTicks() {
  const out = new Map<number, { parent: number; name: string; ticks: number; start: number }>();
  if (process.platform !== 'linux') return out;
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try { const text = await readFile(`/proc/${entry}/stat`, 'utf8'), end = text.lastIndexOf(')'), f = text.slice(end + 2).split(' ');
      out.set(Number(entry), { parent: Number(f[1]), name: text.slice(text.indexOf('(') + 1, end), ticks: Number(f[11]) + Number(f[12]), start: Number(f[19]) }); } catch { /* exited */ }
  }
  return out;
}
function externalBusiest(before: Map<number, { parent: number; name: string; ticks: number; start: number }>, after: typeof before, seconds: number, roots: number[]) {
  const mine = new Set(roots), descends = (pid: number): boolean => { for (let p = pid, hops = 0; p > 1 && hops < 64; hops++) { if (mine.has(p)) return true; p = after.get(p)?.parent ?? before.get(p)?.parent ?? 0; } return false; };
  const hz = 100, logical = cpus().length;
  return [...after.entries()].flatMap(([pid, p]) => { const b = before.get(pid); if (!b || b.start !== p.start || descends(pid)) return []; const pct = 100 * (p.ticks - b.ticks) / hz / (seconds * logical); return pct > .05 ? [{ pid, name: p.name, machineCpuPercent: round(pct, 3) }] : []; })
    .sort((x, y) => (y.machineCpuPercent ?? 0) - (x.machineCpuPercent ?? 0)).slice(0, 8);
}
async function hostState() {
  const read = async (path: string) => { try { return (await readFile(path, 'utf8')).trim(); } catch { return null; } };
  const linux = process.platform === 'linux';
  const temp = linux ? await (async () => { for (const hw of readdirSync('/sys/class/hwmon')) { if (await read(`/sys/class/hwmon/${hw}/name`) === 'k10temp') return Number(await read(`/sys/class/hwmon/${hw}/temp1_input`)) / 1000; } return null; })().catch(() => null) : null;
  const locker = linux ? await run('gdbus', ['call', '--session', '--dest', 'org.freedesktop.ScreenSaver', '--object-path', '/ScreenSaver', '--method', 'org.freedesktop.ScreenSaver.GetActive'], 5000) : null;
  return { host: hostname(), os: `${osType()} ${release()}`, cpu: cpus()[0]?.model ?? null, logicalCpus: cpus().length,
    loadavg: linux ? parseLoadavg(await read('/proc/loadavg') ?? '') : null, cpuTempC: temp, acOnline: linux ? await read('/sys/class/power_supply/AC0/online') : null,
    governor: linux ? await read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor') : null, who: linux ? parseWho(await run('who', []) ?? '') : null,
    loginctlSessions: linux ? parseWho(await run('loginctl', ['list-sessions', '--no-legend']) ?? '') : null,
    top: linux ? parseTop(await run('top', ['-b', '-n', '1', '-o', '%CPU', '-w', '200']) ?? '') : null,
    screenLockerActive: locker === null ? null : /true/.test(locker), gpu: await gpuRow() };
}
/** The quiet window: `samples` readings `intervalSeconds` apart of whole-machine CPU and NVIDIA GPU, with the busiest processes over it. */
async function quietWindow(rule: QuietRule) {
  const ticks = await procTicks(), started = Date.now(); let previous = await cpuCounters(); const rows: { at: string; cpuPercent: number | null; gpu: Record<string, unknown> | null }[] = [];
  for (let i = 0; i < rule.samples; i++) { await sleep(rule.intervalSeconds * 1000); const current = await cpuCounters(); rows.push({ at: now(), cpuPercent: round(cpuPercent(previous, current)), gpu: await gpuRow() }); previous = current; }
  const state = await hostState();
  const verdict = quietVerdict({ cpu: rows.map(r => r.cpuPercent ?? NaN), gpu: rows.map(r => (r.gpu?.['utilization.gpu'] as number | null) ?? null), screenLocked: state.screenLockerActive }, rule);
  return { at: now(), ...verdict, busiestProcesses: externalBusiest(ticks, await procTicks(), (Date.now() - started) / 1000, [process.pid]), hostState: state, samples: rows };
}
const hostRule = (): QuietRule => process.platform === 'linux' ? HUB_RULE : PC_RULE;
/** Waits for a quiet window (retrying every 30 s up to `minutes`); never times on a busy machine. */
async function preflight(rule: QuietRule, minutes: number) {
  const attempts = []; const until = Date.now() + minutes * 60_000;
  for (;;) {
    const w = await quietWindow(rule); attempts.push(w);
    console.log(JSON.stringify({ event: 'preflight', attempt: attempts.length, quiet: w.quiet, cpuMean: round(w.cpuMean, 2), cpuMax: round(w.cpuMax, 2), gpuMax: w.gpuMax, reasons: w.reasons, busiest: w.busiestProcesses.slice(0, 3) }));
    if (w.quiet || Date.now() > until) return { quiet: w.quiet, attempts: attempts.length, final: w, earlier: attempts.slice(0, -1).map(a => ({ at: a.at, quiet: a.quiet, cpuMean: a.cpuMean, cpuMax: a.cpuMax, gpuMax: a.gpuMax, reasons: a.reasons })) };
    await sleep(30_000);
  }
}
async function tabletReading(adb: Adb) {
  const text = await adb.shell('dumpsys battery; echo @@thermal; dumpsys thermalservice | grep -m1 "Thermal Status"; echo @@gpu; cat /sys/kernel/gpu/gpu_busy /sys/kernel/gpu/gpu_clock /sys/kernel/gpu/gpu_tmu 2>/dev/null').catch(error => `error ${String(error)}`);
  const [battery = '', rest = ''] = text.split('@@thermal'), [thermal = '', gpu = ''] = rest.split('@@gpu'), g = gpu.trim().split(/\s+/);
  const b = parseBattery(battery);
  return { at: now(), batteryC: b.temperatureC, batteryLevel: b.level, thermalStatus: parseThermalStatus(thermal), gpuBusyPercent: g[0] ? parseFloat(g[0]) : null, gpuClockKHz: g[1] ? Number(g[1]) : null, gpuTemperatureC: g[2] ? Number(g[2]) : null };
}
async function tabletQuietWindow(adb: Adb) {
  const snap = async () => { const lines = (await adb.shell('cat /proc/stat; echo @@; cat /sys/kernel/gpu/gpu_busy 2>/dev/null')).split('@@'); return { cpu: parseProcStat(lines[0]!), gpu: parseFloat(lines[1]?.trim() ?? '') }; };
  let previous = await snap(); const rows: { cpuPercent: number | null; gpuBusyPercent: number | null }[] = [];
  for (let i = 0; i < TABLET_RULE.samples; i++) { await sleep(TABLET_RULE.intervalSeconds * 1000); const current = await snap(); rows.push({ cpuPercent: round(cpuPercent(previous.cpu, current.cpu)), gpuBusyPercent: Number.isFinite(current.gpu) ? current.gpu : null }); previous = current; }
  return { at: now(), ...quietVerdict({ cpu: rows.map(r => r.cpuPercent ?? NaN), gpu: rows.map(r => r.gpuBusyPercent) }, TABLET_RULE), samples: rows };
}
/** Samples load every `everyMs` while a run samples frames; stopped by the returned function. */
function startLoadSampler(device: 'local' | 'tablet', adb: Adb | null, everyMs: number) {
  const samples: unknown[] = []; let stopped = false, previous: { total: number; idle: number } | null = null, tick = 0;
  const loop = (async () => {
    if (device === 'local') previous = await cpuCounters();
    while (!stopped) {
      await sleep(everyMs); if (stopped) break; tick++;
      // Tablet: Mali GPU busy and clock every tick (two sysfs reads); battery, thermal status and GPU temperature every 15 s.
      if (device === 'tablet' && adb) {
        if (tick % Math.max(1, Math.round(15_000 / everyMs)) === 0) samples.push(await tabletReading(adb));
        else { const g = (await adb.shell('cat /sys/kernel/gpu/gpu_busy /sys/kernel/gpu/gpu_clock 2>/dev/null').catch(() => '')).trim().split(/\s+/); samples.push({ at: now(), gpuBusyPercent: g[0] ? parseFloat(g[0]) : null, gpuClockKHz: g[1] ? Number(g[1]) : null }); }
      } else { const current = await cpuCounters(); samples.push({ at: now(), cpuPercent: round(cpuPercent(previous!, current)), gpu: await gpuRow() }); previous = current; }
    }
  })();
  return async () => { stopped = true; await loop; return samples; };
}

// ---------------------------------------------------------------- page measurement

const PAGE_CSS = 'body>header,body>footer{display:none!important}';
/** Before any page script: the rAF interval recorder (the Farm and Golden Gate runners' method), readiness seen on the first frame after onReady, and renderer.info sampled every 30 recorded frames. */
function installRecorder() {
  const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (w.__ab) return;
  const rec = w.__ab = { readyAt: null as number | null, error: null as unknown, recording: false, intervals: [] as number[], last: null as number | null, draws: [] as number[], triangles: [] as number[], idle: [] as number[], idleLast: null as number | null, idleOn: false };
  const tick = (t: number) => {
    if (rec.idleOn) { if (rec.idleLast !== null) rec.idle.push(t - rec.idleLast); rec.idleLast = t; }
    if (rec.readyAt === null && !rec.error) { try { const s = w.__kilnHarness?.snapshot(); if (s?.errors?.length) rec.error = s.errors[0]; else if ((s?.readyCount ?? 0) > 0) rec.readyAt = t; } catch { /* booting */ } }
    if (rec.recording) {
      if (rec.last !== null) rec.intervals.push(t - rec.last);
      rec.last = t;
      if (rec.intervals.length % 30 === 0) { const r = w.__kilnScene?.stats()?.render; if (r) { rec.draws.push(r.drawCalls); rec.triangles.push(r.triangles); } }
    } else rec.last = null;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function installCss(css: string) { const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true }); }
/** The display rate on an idle page (about:blank) just before the run: 1.5 s of rAF intervals. */
async function measureDisplay(page: Page) {
  await page.goto('about:blank');
  // Every frame repaints a small box, so the compositor has damage each frame and does not throttle an idle page.
  const intervals = await page.evaluate(() => new Promise<number[]>(done => { const out: number[] = []; let last: number | null = null, start: number | null = null, n = 0;
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px'; document.documentElement.append(box);
    const tick = (t: number) => { start ??= t; if (last !== null) out.push(t - last); last = t; box.style.background = ++n % 2 ? '#000' : '#fff'; if (t - start < 1500) requestAnimationFrame(tick); else { box.remove(); done(out); } }; requestAnimationFrame(tick); }));
  return { ...displayRate(intervals), method: 'lower-quartile rAF interval over 1.5 s on about:blank in the same tab just before the run, a box repainted every frame', intervalsMs: intervals.map(v => round(v)) };
}

interface Served { side: Side; label: string; root: string; base: string; port: number; build: unknown; close(): Promise<void> }
async function serve(side: Side, root: string, ports: [number, number], taken: Set<number>): Promise<Served> {
  if (!existsSync(resolve(root, 'index.html'))) throw new Error(`No test build at ${root}`);
  const buildFile = resolve(root, 'build.json'), build = existsSync(buildFile) ? JSON.parse(readFileSync(buildFile, 'utf8')) : null;
  for (let port = ports[0]; port <= ports[1]; port++) {
    if (taken.has(port)) continue;
    try { const s = await startStaticServer({ root, port }); taken.add(port);
      // Chrome keeps connections alive (on the tablet through adb reverse), so they are cut before the server closes.
      const close = () => Promise.race([(s.server.closeAllConnections?.(), s.close()), sleep(5000)]) as Promise<void>;
      return { side, label: build?.label ?? root, root, base: s.url, port, build: build && { label: build.label, scene: build.scene, mode: build.mode, release: build.release, chunks: build.chunks?.map((c: { name: string }) => c.name), source: build.source }, close };
    } catch (error) { if ((error as { code?: string }).code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`No free port in ${ports[0]}-${ports[1]}`);
}

interface MeasureOptions { device: 'local' | 'tablet'; seconds: number; warmupMs: number; width: number; height: number; backend: 'webgpu'; extra: Record<string, string>; adb: Adb | null; loadEveryMs: number; browserPid: number | null }
async function measure(browser: Browser, served: Served, cell: Cell, o: MeasureOptions) {
  const page = await browser.newPage(), messages: { type: string; text: string }[] = [];
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warn') && messages.length < 100) messages.push({ type: m.type(), text: m.text().slice(0, 400) }); });
  page.on('pageerror', e => { if (messages.length < 100) messages.push({ type: 'pageerror', text: String(e).slice(0, 400) }); });
  try {
    await page.bringToFront().catch(() => undefined);
    if (o.device === 'local') await page.setViewport({ width: o.width, height: o.height, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installRecorder); await page.evaluateOnNewDocument(installCss, PAGE_CSS);
    const display = await measureDisplay(page);
    const url = cellUrl(served.base, cell, o.extra), started = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => (window as any).__ab.readyAt !== null || (window as any).__ab.error, { timeout: 180_000, polling: 100 }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const setup = await page.evaluate(() => {
      const w = window as any, api = w.__kilnScene, host = w.__kilnHarness.snapshot(); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (w.__ab.error) return { error: w.__ab.error };
      api.feedFrameTimes([]); // the governor is held at the tier's level 0 (as perf.ts and perf-core.ts X-05)
      return { error: null, errors: host.errors, readyAt: w.__ab.readyAt, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend') ?? null, tier: api.tierState(), msaaPolicy: api.invoke('msaaPolicy') ?? null };
    });
    if (setup.error) throw new Error(`Scene failed: ${JSON.stringify(setup.error)}`);
    if (setup.backend !== o.backend) throw new Error(`${served.side} runs ${setup.backend}, not ${o.backend}`);
    if (setup.tier?.tier !== cell.tier || setup.tier.level !== 0) throw new Error(`${served.side} tier is ${setup.tier?.tier} level ${setup.tier?.level}, not ${cell.tier} level 0`);
    // The page holds a screen wake lock (run-farm-tablet.ts openTab), so the tablet panel stays on through the sample.
    const wakeLock = await page.evaluate(async () => { try { (window as any).__abWakeLock = await (navigator as any).wakeLock.request('screen'); return 'held'; } catch (error) { return String(error); } }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const kind = cellKind(cell), scene = SCENES[cell.scene];
    await scene.engage(page, kind, cell.name);
    if (o.warmupMs) await sleep(o.warmupMs);
    const before = await scene.state(page), clock0 = await page.evaluate(() => (window as any).__kilnScene.motionPolicy().time as number); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ticks = await procTicks(), t0 = Date.now();
    await page.evaluate(() => { const w = window as any, rec = w.__ab; w.__kilnScene.beginMeasurement(); rec.intervals = []; rec.draws = []; rec.triangles = []; rec.last = null; rec.recording = true; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const stopLoad = startLoadSampler(o.device, o.adb, o.loadEveryMs);
    await sleep(o.seconds * 1000);
    const end = await page.evaluate(() => {
      const w = window as any, api = w.__kilnScene, rec = w.__ab, host = w.__kilnHarness.snapshot(); // eslint-disable-line @typescript-eslint/no-explicit-any
      rec.recording = false; api.recordFrames(false); const s = api.stats();
      const canvas = document.querySelector('.ks-root canvas') as HTMLCanvasElement | null;
      return { intervals: rec.intervals as number[], draws: rec.draws as number[], triangles: rec.triangles as number[], cpu: api.cpuRenderTimes() as number[], tier: api.tierState(), clock: api.motionPolicy().time as number,
        errors: host.errors, visibility: document.visibilityState, longTasks: s.longTasks ?? null, pipelines: s.pipelines ?? null, msaaPolicy: api.invoke('msaaPolicy') ?? null,
        canvas: canvas ? { buffer: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight], dpr: devicePixelRatio } : null };
    });
    const during = await stopLoad(), seconds = (Date.now() - t0) / 1000;
    const after = await scene.state(page);
    const external = process.platform === 'linux' && o.device === 'local' ? externalBusiest(ticks, await procTicks(), seconds, [process.pid, ...(o.browserPid ? [o.browserPid] : [])]) : null;
    const env = await page.evaluate(async () => { const a = await (navigator as any).gpu?.requestAdapter?.().catch(() => null), i = a?.info; return { userAgent: navigator.userAgent, adapter: i ? { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } : null, inner: [innerWidth, innerHeight], dpr: devicePixelRatio }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const stats = frameStats(end.intervals), cpu = frameStats(end.cpu), share = refreshShare(end.intervals, display.periodMs ?? NaN), hitches = hitchCounts(end.intervals);
    const checks = { backend: setup.backend, tierHeldAtLevel0: end.tier?.tier === cell.tier && end.tier?.level === 0, clockAdvanced: end.clock > clock0, engaged: scene.engaged(kind, cell.name, before),
      movedForWorkload: kind === 'view' ? null : JSON.stringify(before.pose) !== JSON.stringify(after.pose), noErrors: end.errors.length === 0, pageVisible: end.visibility === 'visible',
      coverage: round(stats.sampledMs / (o.seconds * 1000), 3), displayMeasured: !!display.periodMs,
      refreshMismatch: !!display.periodMs && stats.p50 !== null && stats.p50 < .75 * display.periodMs };
    const valid = checks.tierHeldAtLevel0 && checks.clockAdvanced && checks.engaged && checks.movedForWorkload !== false && checks.noErrors && checks.pageVisible && (checks.coverage ?? 0) >= .9 && checks.displayMeasured && !checks.refreshMismatch;
    const metrics: RunMetrics = { p50: stats.p50, p95: stats.p95, p99: stats.p99, max: stats.max, fps: stats.fps, withinOne: share.withinOne, withinTwo: share.withinTwo, over50: hitches.over50, over100: hitches.over100,
      longestMs: hitches.longestMs, cpuRenderP50: cpu.p50, cpuRenderP95: cpu.p95, drawsMedian: median(end.draws), trianglesMedian: median(end.triangles), gpuBusy: gpuBusyMedian(during) };
    return { valid, checks, url, readyMs: round(setup.readyAt, 1), wakeLock, display, frames: stats, refresh: share, hitches, d41: d41Verdict(hitches, { row: o.device === 'tablet' ? 'tablet' : 'desktop', seconds: o.seconds }),
      cpuRenderMs: { ...cpu, sampledMs: undefined }, draws: { median: median(end.draws), min: end.draws.length ? Math.min(...end.draws) : null, max: end.draws.length ? Math.max(...end.draws) : null, samples: end.draws.length },
      triangles: { median: median(end.triangles), samples: end.triangles.length }, metrics, msaaPolicy: { atStart: setup.msaaPolicy, atEnd: end.msaaPolicy }, tier: { start: setup.tier && { tier: setup.tier.tier, level: setup.tier.level, device: setup.tier.device }, end: end.tier && { tier: end.tier.tier, level: end.tier.level } },
      workload: { kind, before, after }, canvas: end.canvas, longTasks: end.longTasks, pipelines: end.pipelines, environment: env, loadDuring: during, externalBusiest: external, messages, sampleWallSeconds: round(seconds, 2), startedToSampleMs: t0 - started,
      frameIntervalsMs: end.intervals.map(v => round(v)), cpuRenderTimesMs: end.cpu.map(v => round(v)) };
  } finally { await page.close().catch(() => undefined); }
}

// ---------------------------------------------------------------- the A/B block

async function launchLocal(profile: string, headless: boolean, width: number, height: number) {
  const chrome = option('--chrome', process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/opt/google/chrome/chrome')!;
  if (!existsSync(chrome)) throw new Error(`No Chrome at ${chrome}; pass --chrome <path>`);
  // perf.ts and perf-gg.mjs: a headed window pinned to the primary display's origin; the hub adds --ozone-platform=x11
  // --enable-features=Vulkan --start-fullscreen through --chrome-arg (two tokens each), with the session's DISPLAY and PRIME offload.
  const args = ['--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', `--window-size=${width},${height}`, ...(headless ? [] : ['--window-position=0,0']), ...many('--chrome-arg')];
  const browser = await puppeteer.launch({ executablePath: chrome, headless, pipe: true, userDataDir: profile, defaultViewport: null, args, protocolTimeout: 300_000 });
  return { browser, args, chrome };
}
interface TabletSession { browser: Browser; forward: number; reversed: number[]; anchor: Page | null }
async function tabletConnect(adb: Adb, ports: number[]): Promise<TabletSession> {
  const reversed: number[] = []; let forward: { port: number; browserURL: string } | null = null;
  try {
    for (const port of ports) { await reversePort(adb, port); reversed.push(port); }
    await wakeAndOpenChrome(adb); forward = await forwardDevtools(adb);
    const browser = await connectDevtools(forward.browserURL, 30_000);
    return { browser, forward: forward.port, reversed, anchor: null };
  } catch (error) {
    if (forward) await removeForward(adb, forward.port).catch(() => undefined);
    for (const port of reversed) await removeReverse(adb, port).catch(() => undefined);
    throw error;
  }
}
async function tabletRelease(adb: Adb, s: TabletSession | null) {
  const problems: string[] = [];
  if (!s) return { problems, mappings: await listMappings(adb).catch(e => String(e)) };
  try { await s.browser.disconnect(); } catch (e) { problems.push(`disconnect: ${String(e)}`); }
  try { await removeForward(adb, s.forward); } catch (e) { problems.push(`forward ${s.forward}: ${String(e)}`); }
  for (const port of s.reversed) try { await removeReverse(adb, port); } catch (e) { problems.push(`reverse ${port}: ${String(e)}`); }
  const mappings = await listMappings(adb).catch(e => String(e));
  const empty = typeof mappings !== 'string' && mappings.forward.length === 0 && mappings.reverse.length === 0;
  if (!empty) problems.push(`mappings left: ${JSON.stringify(mappings)}`);
  return { problems, mappings, empty };
}
async function waitCool(adb: Adb, minutes: number) {
  const until = Date.now() + minutes * 60_000, readings = [];
  for (;;) { const r = await tabletReading(adb), v = tabletCool(r); readings.push({ ...r, cool: v.cool, reasons: v.reasons }); if (v.cool || Date.now() > until) return { ...v, readings }; await sleep(30_000); }
}

async function abBlock() {
  const kit = kitRoot(), device = (option('--device', 'local') as 'local' | 'tablet');
  if (device !== 'local' && device !== 'tablet') throw new Error('--device is local or tablet');
  const cells = option('--cells', '')!.split(',').filter(Boolean).map(parseCell); if (!cells.length) throw new Error('--cells scene:tier:name[,…] is required');
  for (const c of cells) cellKind(c);
  const pairs = Number(option('--pairs', '3')), seconds = Number(option('--seconds', '60')), warmupMs = Number(option('--warmup', '5')) * 1000, primeSeconds = Number(option('--prime', '3'));
  const [width, height] = option('--size', '1920x1080')!.split('x').map(Number) as [number, number];
  // --a and --b are build-label folders holding one test build per scene (<label>/<scene>/index.html, as the kit packs them).
  const rootA = resolve(kit, option('--a', 'builds/draw-base')!), rootB = resolve(kit, option('--b', 'builds/wavea')!);
  const block = option('--block', `ab-${now().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`)!, out = resolve(option('--out', resolve(kit, 'results'))!, block);
  if (existsSync(resolve(out, 'block.json'))) throw new Error(`${out} already holds a block; choose another --block`);
  const extra = (name: string) => Object.fromEntries(new URLSearchParams(option(name, '') ?? ''));
  const query = { A: { ...extra('--query'), ...extra('--query-a') }, B: { ...extra('--query'), ...extra('--query-b') } };
  const plan = planRuns(cells, pairs);
  const record: Record<string, unknown> = { schema: 'kiln.timing-ab-block/1', block, device, startedAt: now(), runner: 'scripts/timing-ab.ts', node: process.version, platform: process.platform, host: hostname(),
    options: { pairs, seconds, warmupSeconds: warmupMs / 1000, primeSeconds, size: device === 'local' ? [width, height] : 'device viewport', query, headless: flag('--headless'), chromeArgs: many('--chrome-arg') },
    cells: cells.map(c => ({ ...c, kind: cellKind(c) })), plan: plan.map(p => ({ cell: cellId(p.cell), pair: p.pair, position: p.position, side: p.side })), runs: [] as unknown[] };
  const save = () => writeJson(resolve(out, 'block.json'), record);
  await mkdir(resolve(out, 'runs'), { recursive: true });
  // Two builds, two owned loopback ports (4400-4499: the device kit's range, so adb reverse maps the same numbers on the tablet).
  const taken = new Set<number>(), ports = (option('--ports', '4400-4489')!.split('-').map(Number)) as [number, number];
  const served = {} as Record<SceneId, { A: Served; B: Served }>;
  for (const scene of [...new Set(cells.map(c => c.scene))]) served[scene] = { A: await serve('A', resolve(rootA, scene), ports, taken), B: await serve('B', resolve(rootB, scene), ports, taken) };
  record.builds = Object.fromEntries(Object.entries(served).map(([scene, s]) => [scene, { A: { root: s.A.root, port: s.A.port, build: s.A.build }, B: { root: s.B.root, port: s.B.port, build: s.B.build } }]));
  let browser: Browser | null = null, profile: string | null = null, browserPid: number | null = null; const adb = device === 'tablet' ? adbFor() : null;
  let stopped: string | null = null;
  try {
    if (device === 'local') {
      record.preflight = flag('--no-preflight') ? { skipped: 'Not evidence: --no-preflight' } : await preflight(hostRule(), Number(option('--wait-quiet', '10')));
      await save();
      if (!flag('--no-preflight') && !(record.preflight as { quiet: boolean }).quiet) { stopped = 'host not quiet: nothing timed'; throw new Error(`STOP: ${stopped}`); }
      profile = await mkdtemp(resolve(kit, 'tmp-profile-')); const launched = await launchLocal(profile, flag('--headless'), width, height);
      browser = launched.browser; browserPid = launched.browser.process()?.pid ?? null;
      record.browser = { version: await browser.version(), chrome: launched.chrome, args: launched.args, pid: browserPid };
    } else {
      const devices = await adbDevices(); record.adbDevices = devices.devices;
      if (!devices.devices.some(d => d.serial === adb!.serial && d.state === 'device')) throw new Error(`Tablet ${adb!.serial} is not attached`);
      const before = await listMappings(adb!); record.mappingsBefore = before;
      if (before.forward.length || before.reverse.length) throw new Error(`The tablet already has port mappings ${JSON.stringify(before)}; not starting`);
      record.deviceBefore = await deviceState(adb!);
      const cool = await waitCool(adb!, Number(option('--cool-wait', '10'))); record.coolBefore = cool;
      if (!cool.cool) { stopped = `tablet not cool: ${cool.reasons.join('; ')}`; throw new Error(`STOP: ${stopped}`); }
      // The pilot's tablet window, retried every 30 s for up to --wait-quiet minutes (golden-gate tablet-check.ts preflight).
      const attempts: Awaited<ReturnType<typeof tabletQuietWindow>>[] = [], quietUntil = Date.now() + Number(option('--wait-quiet', '10')) * 60_000;
      for (;;) {
        const w = await tabletQuietWindow(adb!); attempts.push(w);
        console.log(JSON.stringify({ event: 'tablet-preflight', attempt: attempts.length, quiet: w.quiet, cpuMean: round(w.cpuMean, 2), cpuMax: w.cpuMax, gpuMax: w.gpuMax, reasons: w.reasons }));
        if (w.quiet || Date.now() > quietUntil) break; await sleep(30_000);
      }
      const quiet = attempts.at(-1)!; record.tabletPreflight = { ...quiet, attempts: attempts.length, earlier: attempts.slice(0, -1).map(a => ({ at: a.at, quiet: a.quiet, cpuMean: a.cpuMean, cpuMax: a.cpuMax, gpuMax: a.gpuMax, reasons: a.reasons })) };
      if (!quiet.quiet && !flag('--no-preflight')) { stopped = `tablet not quiet: ${quiet.reasons.join('; ')}`; throw new Error(`STOP: ${stopped}`); }
    }
    await save();
    // One discarded load per side warms the HTTP and shader caches equally before the first measured run.
    if (primeSeconds > 0) {
      const primes = [];
      for (const cell of cells) for (const side of ['A', 'B'] as const) {
        let session: TabletSession | null = null; const prime: Record<string, unknown> = { cell: cellId(cell), side };
        try {
          session = device === 'tablet' ? await tabletConnect(adb!, [served[cell.scene][side].port]) : null;
          const page = await (session?.browser ?? browser!).newPage();
          try { if (device === 'local') await page.setViewport({ width, height, deviceScaleFactor: 1 }); await page.evaluateOnNewDocument(installRecorder); await page.evaluateOnNewDocument(installCss, PAGE_CSS);
            await page.goto(cellUrl(served[cell.scene][side].base, cell, query[side]), { waitUntil: 'load', timeout: 180_000 });
            await page.waitForFunction(() => (window as any).__ab.readyAt !== null || (window as any).__ab.error, { timeout: 180_000, polling: 200 }); await sleep(primeSeconds * 1000); // eslint-disable-line @typescript-eslint/no-explicit-any
            prime.ok = true; } finally { await page.close().catch(() => undefined); }
        } catch (error) { prime.ok = false; prime.error = String(error).slice(0, 300); }
        finally { if (device === 'tablet') { const r = await tabletRelease(adb!, session); prime.mappingsEmpty = r.empty ?? null; if (r.problems.length) stopped ??= `mapping cleanup after prime: ${r.problems.join('; ')}`; } }
        primes.push(prime); console.log(JSON.stringify({ event: 'prime', ...prime }));
        if (stopped) throw new Error(`STOP: ${stopped}`);
      }
      record.primes = primes; await save();
    }
    for (const planned of plan) {
      const cell = planned.cell, side = planned.side, label = `${cellId(cell)}-pair${planned.pair}-${side}`;
      let session: TabletSession | null = null, cool: unknown = null;
      const entry: Record<string, unknown> = { label, cell: cellId(cell), pair: planned.pair, position: planned.position, side };
      try {
        if (device === 'tablet') {
          const c = await waitCool(adb!, Number(option('--cool-wait', '10'))); cool = c;
          if (!c.cool) { stopped = `tablet not cool before ${label}: ${c.reasons.join('; ')}`; throw new Error(`STOP: ${stopped}`); }
          session = await tabletConnect(adb!, [served[cell.scene][side].port]);
        }
        const loadBefore = device === 'local' ? { at: now(), cpuPercent: null, gpu: await gpuRow(), loadavg: process.platform === 'linux' ? parseLoadavg(await readFile('/proc/loadavg', 'utf8')) : null } : await tabletReading(adb!);
        const result = await measure(session?.browser ?? browser!, served[cell.scene][side], cell, { device, seconds, warmupMs, width, height, backend: 'webgpu', extra: query[side], adb, loadEveryMs: device === 'tablet' ? 2_000 : 5_000, browserPid });
        const loadAfter = device === 'local' ? { at: now(), gpu: await gpuRow(), loadavg: process.platform === 'linux' ? parseLoadavg(await readFile('/proc/loadavg', 'utf8')) : null } : await tabletReading(adb!);
        const fileRecord = { schema: 'kiln.timing-ab-run/1', block, device, cell: { ...cell, kind: cellKind(cell) }, side, label: served[cell.scene][side].label, pair: planned.pair, position: planned.position, seconds, warmupSeconds: warmupMs / 1000,
          build: served[cell.scene][side].build, query: query[side], startedAt: now(), loadBefore, loadAfter, coolBefore: cool, ...result };
        await writeJson(resolve(out, 'runs', `${label}.json`), fileRecord);
        Object.assign(entry, { valid: result.valid, p50: round(result.frames.p50, 2), p95: round(result.frames.p95, 2), withinOne: round(result.refresh.withinOne, 4), withinTwo: round(result.refresh.withinTwo, 4), over50: result.hitches.over50, over100: result.hitches.over100, longestMs: round(result.hitches.longestMs, 1), draws: result.draws.median, periodMs: round(result.display.periodMs, 3), msaa: result.msaaPolicy.atEnd });
        console.log(JSON.stringify({ event: 'run', ...entry }));
        if (device === 'tablet') { const t = tabletCool(loadAfter as { thermalStatus: number | null; batteryC: number | null }); if (!t.cool) { stopped = `tablet warmed during ${label}: ${t.reasons.join('; ')}`; } }
      } catch (error) {
        entry.error = String((error as Error)?.message ?? error).slice(0, 1000); console.log(JSON.stringify({ event: 'run-failed', ...entry }));
        if (/STOP:/.test(String(error))) stopped ??= String(error);
      } finally {
        if (device === 'tablet') { const r = await tabletRelease(adb!, session); entry.mappingsAfter = r.mappings; entry.mappingsEmpty = r.empty ?? null; if (r.problems.length) { stopped ??= `mapping cleanup: ${r.problems.join('; ')}`; } }
        (record.runs as unknown[]).push(entry); await save();
      }
      if (stopped) break;
    }
  } catch (error) { stopped ??= String((error as Error)?.message ?? error); console.error(String((error as Error)?.stack ?? error)); }
  finally {
    if (browser) await browser.close().catch(() => undefined);
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    for (const s of Object.values(served)) { await s.A.close().catch(() => undefined); await s.B.close().catch(() => undefined); }
    if (device === 'tablet' && adb) { record.deviceAfter = await deviceState(adb).catch(e => String(e)); record.mappingsAtEnd = await listMappings(adb).catch(e => String(e)); }
    record.finishedAt = now(); record.stopped = stopped; await save();
  }
  const summary = await summarizeBlock(out);
  console.log(JSON.stringify({ event: 'block', block, out, stopped, cells: summary.cells.map(c => ({ cell: c.cell, A: c.A.valid, B: c.B.valid, p95: [c.A.p95?.median, c.B.p95?.median] })) }));
  if (stopped) process.exitCode = 2;
}

// ---------------------------------------------------------------- summary

const pct = (v: number | null | undefined) => typeof v === 'number' ? `${(100 * v).toFixed(1)}%` : '-';
const ms = (v: number | null | undefined, d = 2) => typeof v === 'number' ? v.toFixed(d) : '-';
export async function summarizeBlock(dir: string) {
  const files = existsSync(resolve(dir, 'runs')) ? readdirSync(resolve(dir, 'runs')).filter(f => f.endsWith('.json')).sort() : [];
  const runs = files.map(f => JSON.parse(readFileSync(resolve(dir, 'runs', f), 'utf8')));
  const block = existsSync(resolve(dir, 'block.json')) ? JSON.parse(readFileSync(resolve(dir, 'block.json'), 'utf8')) : {};
  const ids = [...new Set(runs.map(r => `${r.cell.scene}-${r.cell.tier}-${r.cell.name}`))];
  const cells = ids.map(id => {
    const list = runs.filter(r => `${r.cell.scene}-${r.cell.tier}-${r.cell.name}` === id);
    const s = summarizeCell(list.map(r => ({ side: r.side, pair: r.pair, valid: r.valid, metrics: { ...r.metrics, gpuBusy: r.metrics.gpuBusy ?? gpuBusyMedian(r.loadDuring ?? []) } })));
    const sideFacts = (side: Side) => { const l = list.filter(r => r.side === side); return { label: l[0]?.build?.label ?? null, chunks: l[0]?.build?.chunks ?? null, msaa: [...new Set(l.map(r => JSON.stringify(r.msaaPolicy?.atEnd ?? null)))], periodMs: median(l.map(r => r.display?.periodMs).filter(Number.isFinite)),
      d41: l.map(r => r.d41?.pass ?? null), invalid: l.filter(r => !r.valid).map(r => ({ pair: r.pair, checks: r.checks })) }; };
    return { cell: id, scene: list[0].cell.scene, tier: list[0].cell.tier, name: list[0].cell.name, kind: list[0].cell.kind, seconds: [...new Set(list.map(r => r.seconds))], facts: { A: sideFacts('A'), B: sideFacts('B') }, ...s };
  });
  const out = { schema: 'kiln.timing-ab-summary/1', block: block.block ?? null, device: block.device ?? null, generatedAt: now(), runs: runs.length, stopped: block.stopped ?? null,
    method: 'Per run: rAF frame intervals over the sample after a warm-up, governor held at the tier level 0. Per side: median (min-max) over valid runs. Paired: B - A within each interleaved pair (both runs valid), median over pairs, and how many pairs B was lower or higher. Refresh shares (OD-7): interval < 1.5 and < 2.5 measured display periods. D-41: 0 over 100 ms, 0 over 50 ms, longest <= 50 ms per 60 s run (tablet: at most 2 over 50 ms, 0 over 100 ms); judged only on runs of at least 60 s.',
    cells };
  await writeJson(resolve(dir, 'summary.json'), out);
  const md = [`# Timing A/B ${out.block ?? dir} (${out.device ?? '?'})`, '', out.method, '', `Runs: ${runs.length}.${out.stopped ? ` **Stopped: ${out.stopped}**` : ''}`, '',
    '| Cell | Side (label) | Valid | p50 ms | p95 ms | Within 1 refresh | Within 2 | >50 ms | >100 ms | Longest ms | CPU render p50 ms | GPU busy % | Draws | Period ms |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of cells) for (const side of ['A', 'B'] as const) {
    const x = c[side], f = c.facts[side];
    md.push(`| ${c.cell} | ${side} (${f.label}) | ${x.valid}/${x.runs} | ${ms(x.p50?.median)} (${ms(x.p50?.min)}-${ms(x.p50?.max)}) | ${ms(x.p95?.median)} (${ms(x.p95?.min)}-${ms(x.p95?.max)}) | ${pct(x.withinOne?.median)} | ${pct(x.withinTwo?.median)} | ${x.over50 ? `${x.over50.median} (max ${x.over50.max})` : '-'} | ${x.over100 ? `${x.over100.median} (max ${x.over100.max})` : '-'} | ${ms(x.longestMs?.max, 1)} | ${ms(x.cpuRenderP50?.median)} | ${x.gpuBusy ? `${ms(x.gpuBusy.median, 1)} (${ms(x.gpuBusy.min, 0)}-${ms(x.gpuBusy.max, 0)})` : '-'} | ${x.drawsMedian?.median ?? '-'} | ${ms(f.periodMs, 3)} |`);
  }
  md.push('', '| Cell | Pairs | Δp50 ms (B-A, median; B lower/higher) | Δp95 ms | Δ within 1 | Δ CPU render p50 ms | Δ GPU busy pt | p95 ratio B/A |', '|---|---|---|---|---|---|---|---|');
  for (const c of cells) {
    const d = c.deltas as Record<string, { medianDelta: number | null; bLower: number; bHigher: number } | null>;
    const cellText = (k: string, f: (v: number | null) => string) => d[k] ? `${f(d[k]!.medianDelta)} (${d[k]!.bLower}/${d[k]!.bHigher})` : '-';
    md.push(`| ${c.cell} | ${c.pairs} | ${cellText('p50', v => ms(v, 3))} | ${cellText('p95', v => ms(v, 3))} | ${cellText('withinOne', v => typeof v === 'number' ? `${(100 * v).toFixed(2)} pt` : '-')} | ${cellText('cpuRenderP50', v => ms(v, 3))} | ${cellText('gpuBusy', v => ms(v, 1))} | ${typeof c.ratios.p95 === 'number' ? c.ratios.p95.toFixed(3) : '-'} |`);
  }
  await writeFile(resolve(dir, 'summary.md'), md.join('\n') + '\n');
  return out;
}

// ---------------------------------------------------------------- quiet, transient, verify

async function quietCommand() {
  const rule = option('--rule', process.platform === 'linux' ? 'hub' : 'pc') === 'hub' ? HUB_RULE : PC_RULE;
  const w = await quietWindow(rule), outFile = option('--out');
  const record = { schema: 'kiln.timing-ab-quiet/1', ...w };
  if (outFile) await writeJson(resolve(outFile), record);
  const s = w.hostState;
  console.log(JSON.stringify({ quiet: w.quiet, reasons: w.reasons, cpuMean: round(w.cpuMean, 2), cpuMax: round(w.cpuMax, 2), gpuMax: w.gpuMax, loadavg: s.loadavg, gpu: s.gpu, cpuTempC: s.cpuTempC, who: s.who, sessions: s.loginctlSessions?.length ?? null,
    top: s.top?.slice(0, 5), busiest: w.busiestProcesses.slice(0, 5), screenLocker: s.screenLockerActive, out: outFile ?? null }));
  if (!w.quiet) process.exitCode = 3;
}
/** WebGPU transient (memoryless) attachments: GPUTextureUsage.TRANSIENT_ATTACHMENT and whether a 4x clear/discard pass validates. Read-only. */
async function transientProbe(page: Page, url: string) {
  // navigator.gpu exists only in a secure context: a loopback page (127.0.0.1), not about:blank.
  await page.goto(url, { waitUntil: 'load' });
  return page.evaluate(async () => {
    const g = (globalThis as any).GPUTextureUsage, out: Record<string, unknown> = { usageFlags: g ? Object.fromEntries(Object.entries(g)) : null, transientFlag: g?.TRANSIENT_ATTACHMENT ?? null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu?.requestAdapter?.(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!adapter) return { ...out, adapter: null };
    out.adapter = { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, device: adapter.info?.device, description: adapter.info?.description };
    out.features = [...adapter.features].sort(); out.wgslFeatures = [...((navigator as any).gpu.wgslLanguageFeatures ?? [])].sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const device = await adapter.requestDevice();
    const attempt = async (usage: number, label: string) => {
      device.pushErrorScope('validation');
      let created = false;
      try {
        const tex = device.createTexture({ label, size: [64, 64], format: 'rgba8unorm', sampleCount: 4, usage }), resolveTex = device.createTexture({ size: [64, 64], format: 'rgba8unorm', usage: g.RENDER_ATTACHMENT });
        const enc = device.createCommandEncoder(), pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), resolveTarget: resolveTex.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }] });
        pass.end(); device.queue.submit([enc.finish()]); created = true; tex.destroy(); resolveTex.destroy();
      } catch (error) { return { label, created, thrown: String(error) }; }
      const e = await device.popErrorScope(); return { label, created, validationError: e ? e.message : null };
    };
    out.renderAttachment = await attempt(g.RENDER_ATTACHMENT, 'msaa-render-attachment');
    out.transient = typeof g.TRANSIENT_ATTACHMENT === 'number' ? await attempt(g.RENDER_ATTACHMENT | g.TRANSIENT_ATTACHMENT, 'msaa-transient') : { skipped: 'GPUTextureUsage.TRANSIENT_ATTACHMENT is undefined in this browser' };
    device.destroy(); out.userAgent = navigator.userAgent; return out;
  });
}
async function transientCommand() {
  const device = option('--device', 'tablet'), outFile = option('--out');
  // Any static page of the kit on an owned loopback port (the A build's notices file) gives the secure context.
  const anchor = resolve(kitRoot(), option('--a', 'builds/draw-base')!, 'farm'), served = await serve('A', anchor, [4400, 4489], new Set()), url = `${served.base}/THIRD-PARTY-NOTICES.txt`;
  let result: unknown;
  try {
    if (device === 'tablet') {
      const adb = adbFor(), before = await listMappings(adb); if (before.forward.length || before.reverse.length) throw new Error(`Existing mappings ${JSON.stringify(before)}`);
      let session: TabletSession | null = null, release: unknown = null;
      try { session = await tabletConnect(adb, [served.port]); const page = await session.browser.newPage(); try { result = { chrome: await session.browser.version(), ...(await transientProbe(page, url)) }; } finally { await page.close().catch(() => undefined); } }
      finally { release = await tabletRelease(adb, session); }
      result = { ...(result as object), mappingsAfter: release };
    } else {
      const profile = await mkdtemp(resolve(kitRoot(), 'tmp-profile-')), { browser } = await launchLocal(profile, flag('--headless'), 800, 600);
      try { const page = await browser.newPage(); result = { chrome: await browser.version(), ...(await transientProbe(page, url)) }; } finally { await browser.close(); await rm(profile, { recursive: true, force: true }); }
    }
  } finally { await served.close(); }
  const record = { schema: 'kiln.timing-ab-transient/1', at: now(), device, result };
  if (outFile) await writeJson(resolve(outFile), record);
  console.log(JSON.stringify(record, null, 1));
}
async function verifyCommand() {
  const kit = kitRoot(), manifest = JSON.parse(await readFile(resolve(kit, 'MANIFEST.json'), 'utf8')) as { files: { path: string; bytes: number; sha256: string }[] };
  const problems: string[] = [];
  for (const f of manifest.files) { const p = resolve(kit, f.path); if (!existsSync(p)) { problems.push(`missing ${f.path}`); continue; } const data = await readFile(p); if (data.length !== f.bytes || createHash('sha256').update(data).digest('hex') !== f.sha256) problems.push(`changed ${f.path}`); }
  console.log(JSON.stringify({ files: manifest.files.length, problems, node: process.version })); if (problems.length) process.exitCode = 1;
}

const isMain = typeof (import.meta as { main?: boolean }).main === 'boolean' ? (import.meta as { main?: boolean }).main : !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (command === 'ab') await abBlock();
  else if (command === 'quiet') await quietCommand();
  else if (command === 'summary') { const r = await summarizeBlock(resolve(option('--dir')!)); console.log(JSON.stringify({ cells: r.cells.length, runs: r.runs })); }
  else if (command === 'transient') await transientCommand();
  else if (command === 'verify') await verifyCommand();
  else console.log('Usage: timing-ab <ab|quiet|summary|transient|verify> [--a builds/<A>] [--b builds/<B>] [--cells scene:tier:name,…] [--pairs 3] [--seconds 60] [--warmup 5] [--prime 3] [--device local|tablet] [--block name] [--out dir] [--chrome path] [--chrome-arg flag]… [--headless] [--size 1920x1080] [--query k=v&…] [--query-a …] [--query-b …] [--wait-quiet min] [--cool-wait min] [--no-preflight (not evidence)]');
}
