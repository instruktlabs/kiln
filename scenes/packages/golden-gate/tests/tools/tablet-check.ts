// X-07 (SPEC 20.1 and 20.2) on the owner's tablet: Galaxy Tab S9 FE 5G (SM-X518U, Exynos 1380 with
// Mali-G68, Android 16), over ADB (serial R52X405L12T) and Chrome remote debugging. The Golden Gate test
// build is served from this PC on an owned port (4600-4649) and reached through `adb reverse`; the
// DevTools socket is forwarded to another owned port.
// Owner rules (SCENE-TASK-ADDENDUM): install nothing; use the tablet's Chrome only; close the tabs opened
// here; restore any setting changed (none is changed: rotation, screen timeout and stay-awake are only
// read and compared afterwards); never clear browser data; remove the reverse and forward mappings.
// The screen is woken for the runs and put back to sleep if it was asleep.
// Timing counts as evidence only when the pilot's tablet preflight passes (farm-pilot/ops/tablet-observe.py:
// 8 samples of 2 s, CPU mean < 8 %, CPU max < 12 %, GPU busy <= 3 %, "Thermal Status: 0") and each run
// starts cool (Thermal Status 0); thermal and battery state are recorded before and after every run.
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/tablet-check.ts [--seconds 60]
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import puppeteer, { type Browser, type Page, type Target } from 'puppeteer-core';
import { PACKAGE_ROOT, PORT_FIRST, PORT_LAST, serveOwned, writeJson } from './owned.ts';
import { outputFor } from './build.ts';
import { measureFrames, prepare, specRecord, WARMUP_MS, type Tier, type Workload } from '../../scripts/perf-core.ts';

const SERIAL = 'R52X405L12T';
const DEVICE = 'Samsung Galaxy Tab S9 FE 5G (SM-X518U), Exynos 1380 / Mali-G68, Android 16';
const argv = process.argv.slice(2), at = argv.indexOf('--seconds');
const SECONDS = at >= 0 ? Number(argv[at + 1]) : 60;
const DAY = new Date().toISOString().slice(0, 10);
const OUT = resolve(PACKAGE_ROOT, 'evidence/perf', `tablet-${DAY}`);
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function adb(...args: string[]): Promise<string> {
  return new Promise((done, fail) => execFile('adb', ['-s', SERIAL, ...args], { timeout: 30_000, maxBuffer: 16 << 20, windowsHide: true },
    (error, stdout, stderr) => error ? fail(new Error(`adb ${args.join(' ')}: ${String(stderr || error.message).trim()}`)) : done(String(stdout))));
}
const shell = (command: string) => adb('shell', command);

/** The pilot's observer snapshot: /proc/stat ticks and the Mali GPU's busy percent, clock and temperature. */
async function snapshot() {
  const lines = (await shell('cat /proc/stat /sys/kernel/gpu/gpu_busy /sys/kernel/gpu/gpu_clock /sys/kernel/gpu/gpu_tmu')).trim().split(/\r?\n/);
  const ticks = lines[0]!.trim().split(/\s+/).slice(1, 9).map(Number);
  return { at: new Date().toISOString(), total: ticks.reduce((s, v) => s + v, 0), idle: ticks[3]! + ticks[4]!,
    gpuBusyPercent: parseFloat(lines.at(-3)!.trim()), gpuClockKHz: Number(lines.at(-2)), gpuTemperatureC: Number(lines.at(-1)) };
}
async function thermal() {
  const text = await shell('dumpsys thermalservice');
  const hal = text.split('Current temperatures from HAL:')[1]?.split('Current cooling devices')[0] ?? '';
  return { status: Number(/Thermal Status: (\d+)/.exec(text)?.[1] ?? NaN),
    temperaturesC: Object.fromEntries([...hal.matchAll(/mValue=([\d.]+), mType=\d+, mName=(\w+)/g)].map(m => [m[2]!, Number(m[1])])) };
}
async function battery() {
  const text = await shell('dumpsys battery');
  const get = (key: string) => new RegExp(`^\\s*${key}: (.+)$`, 'm').exec(text)?.[1]?.trim() ?? null;
  return { levelPercent: Number(get('level')), temperatureC: Number(get('temperature')) / 10, usbPowered: get('USB powered') === 'true', acPowered: get('AC powered') === 'true', status: Number(get('status')) };
}
/** Read-only device state, compared before and after (settings are never written). */
async function deviceState() {
  const power = await shell('dumpsys power');
  const setting = async (space: string, key: string) => (await shell(`settings get ${space} ${key}`)).trim();
  const viewport = await shell('dumpsys input | grep -m1 "Viewport INTERNAL"; true');
  return {
    wakefulness: /mWakefulness=(\w+)/.exec(power)?.[1] ?? null,
    settings: { accelerometerRotation: await setting('system', 'accelerometer_rotation'), userRotation: await setting('system', 'user_rotation'),
      screenOffTimeout: await setting('system', 'screen_off_timeout'), stayOnWhilePluggedIn: await setting('global', 'stay_on_while_plugged_in') },
    orientation: Number(/orientation=(\d)/.exec(viewport)?.[1] ?? NaN),
    chromeRunning: (await shell('pidof com.android.chrome; true')).trim() !== '',
    reverse: (await adb('reverse', '--list')).trim(),
  };
}

/** The pilot's tablet preflight, retried every 30 s for up to 10 minutes. */
async function preflight() {
  const attempts: unknown[] = [];
  for (let attempt = 1; attempt <= 20; attempt++) {
    let previous = await snapshot(); const samples = [];
    for (let i = 0; i < 8; i++) {
      await sleep(2000); const current = await snapshot();
      samples.push({ at: current.at, cpuPercent: round(100 * (1 - (current.idle - previous.idle) / (current.total - previous.total))), gpuBusyPercent: current.gpuBusyPercent, gpuClockKHz: current.gpuClockKHz, gpuTemperatureC: current.gpuTemperatureC });
      previous = current;
    }
    const heat = await thermal(), power = await battery();
    const cpuMean = round(mean(samples.map(s => s.cpuPercent))), cpuMax = Math.max(...samples.map(s => s.cpuPercent)), gpuMax = Math.max(...samples.map(s => s.gpuBusyPercent));
    const quiet = cpuMean < 8 && cpuMax < 12 && gpuMax <= 3 && heat.status === 0;
    const record = { attempt, quiet, cpuMean, cpuMax, gpuMax, thermal: heat, battery: power, samples };
    attempts.push(record); console.log(JSON.stringify({ event: 'preflight', attempt, quiet, cpuMean, cpuMax, gpuMax, thermalStatus: heat.status }));
    if (quiet) return { quiet, cpuMean, cpuMax, gpuMax, attempts };
    await sleep(30_000);
  }
  const last = attempts.at(-1) as { cpuMean: number; cpuMax: number; gpuMax: number };
  return { quiet: false, cpuMean: last.cpuMean, cpuMax: last.cpuMax, gpuMax: last.gpuMax, attempts };
}
/** Waits up to 5 minutes for Thermal Status 0 before a run. */
async function waitCool() {
  const started = Date.now();
  for (;;) {
    const heat = await thermal();
    if (heat.status === 0 || Date.now() - started > 300_000) return { cool: heat.status === 0, waitedMs: Date.now() - started, thermal: heat };
    await sleep(20_000);
  }
}

const plan: { tier: Tier | 'auto'; workload: Workload; run: number }[] = [
  { tier: 'auto', workload: 'orbit', run: 1 }, { tier: 'auto', workload: 'drive', run: 1 }, { tier: 'auto', workload: 'flyover', run: 1 },
  { tier: 'auto', workload: 'orbit', run: 2 }, { tier: 'auto', workload: 'drive', run: 2 },
  { tier: 'balanced', workload: 'orbit', run: 1 },
];

const before = await deviceState();
if (before.reverse) throw new Error(`The tablet already has reverse mappings (${before.reverse}); not starting`);
const hosted = await serveOwned(outputFor('test'));
let reversed = false, forwardPort: number | null = null, browser: Browser | null = null, anchor: Page | null = null;
const opened: Page[] = [], results: Record<string, unknown>[] = [], problems: string[] = [];
let gate: Awaited<ReturnType<typeof preflight>> | null = null, preexistingTabs = 0, chromeVersion = '';
try {
  await adb('reverse', `tcp:${hosted.port}`, `tcp:${hosted.port}`); reversed = true;
  // The forward binds a PC port directly (adb refuses a port in use); nothing is probed.
  for (let port = PORT_LAST; port >= PORT_FIRST && forwardPort === null; port--) {
    if (port === hosted.port) continue;
    try { await adb('forward', `tcp:${port}`, 'localabstract:chrome_devtools_remote'); forwardPort = port; } catch { /* taken; next */ }
  }
  if (forwardPort === null) throw new Error('No owned port for the DevTools forward');
  if (before.wakefulness !== 'Awake') { await shell('input keyevent KEYCODE_WAKEUP'); await sleep(1500); }
  // A local, static page opens Chrome in a new tab; it anchors the session and is closed at the end.
  const anchorUrl = `http://127.0.0.1:${hosted.port}/THIRD-PARTY-NOTICES.txt`;
  await shell(`am start -a android.intent.action.VIEW -d '${anchorUrl}' -p com.android.chrome`);
  const deadline = Date.now() + 60_000;
  for (;;) {
    try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${forwardPort}`, defaultViewport: null, protocolTimeout: 300_000 }); break; }
    catch (error) { if (Date.now() > deadline) throw error; await sleep(1000); }
  }
  chromeVersion = await browser.version();
  let anchorTarget: Target | undefined;
  for (let i = 0; i < 30 && !anchorTarget; i++) { anchorTarget = browser.targets().find(t => t.type() === 'page' && t.url().startsWith(anchorUrl)); if (!anchorTarget) await sleep(1000); }
  if (!anchorTarget) throw new Error('The anchor tab did not appear');
  anchor = await anchorTarget.page();
  // Only the count of the owner's tabs is kept, never their addresses.
  preexistingTabs = browser.targets().filter(t => t.type() === 'page' && t !== anchorTarget).length;
  await sleep(20_000);
  gate = await preflight();
  writeJson(resolve(OUT, 'preflight.json'), { schema: 'kiln.golden-gate-tablet-preflight/1', device: DEVICE, serial: SERIAL, rule: 'farm-pilot/ops/tablet-observe.py: 8 samples of 2 s, CPU mean < 8 %, CPU max < 12 %, GPU busy <= 3 %, Thermal Status 0',
    note: 'Aggregate CPU and GPU utilisation only; Android per-process GPU residency is unavailable. USB charging and stock power and thermal management retained. Taken with Chrome open on a static local page.', ...gate });

  for (const item of plan) {
    const coolness = await waitCool(), batteryBefore = await battery();
    const page = await browser.newPage(); opened.push(page);
    await page.bringToFront().catch(() => undefined);
    await page.evaluateOnNewDocument(() => {
      const tasks: number[][] = (window as any).__ggLongTasks = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { new PerformanceObserver(list => { for (const e of list.getEntries()) tasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true } as PerformanceObserverInit); } catch { /* unsupported */ }
    });
    await prepare(page, item.tier === 'auto');
    const label = `x07-${item.tier}-${item.workload}-run${item.run}`;
    try {
      const result = await measureFrames(page, { base: hosted.url, backend: 'auto', tier: item.tier, workload: item.workload, warmupMs: WARMUP_MS, sampleMs: SECONDS * 1000, requireBackend: false });
      const tasks = await page.evaluate(() => { const w = window as any; return { readyAt: w.__ggPerf.readyAt as number, tasks: w.__ggLongTasks as number[][] }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const afterReady = tasks.tasks.filter(([start]) => start! >= tasks.readyAt);
      const longTasksAfterReady = { count: afterReady.length, over100Ms: afterReady.filter(([, d]) => d! > 100).length, maxMs: afterReady.length ? round(Math.max(...afterReady.map(([, d]) => d!)), 1) : 0,
        beforeReady: tasks.tasks.length - afterReady.length, method: 'PerformanceObserver longtask entries from document start; after ready = starting at or after the first frame that saw onReady' };
      const heatAfter = await thermal(), batteryAfter = await battery(), selected = result.tierAtStart?.tier ?? null, env = result.page;
      const record = { schema: 'kiln.golden-gate-perf/1', id: 'X-07', measure: 'frames', tier: item.tier, selectedTier: selected, workload: item.workload, run: item.run, seconds: SECONDS, preset: 'day',
        evidence: !!gate?.quiet && coolness.cool, preflight: gate && { quiet: gate.quiet, cpuMean: gate.cpuMean, cpuMax: gate.cpuMax, gpuMax: gate.gpuMax },
        thermalBefore: coolness.thermal, cooledForMs: coolness.waitedMs, thermalAfter: heatAfter, batteryBefore, batteryAfter,
        environment: { device: DEVICE, browser: chromeVersion, served: 'this PC through adb reverse (USB); readyMs includes that transfer', ...env },
        spec: specRecord(DEVICE, chromeVersion, result.backend, env.adapter, selected, item.workload, { frames: result.frameIntervalMs.count, medianMs: result.frameIntervalMs.p50, p95Ms: result.frameIntervalMs.p95, p99Ms: result.frameIntervalMs.p99,
          cpuRenderMedianMs: result.cpuRenderMs.p50, drawCalls: result.drawCalls.median, triangles: result.triangles.median, longTasks: result.longTasks, governorChanges: result.governorChanges, readyMs: result.readyMs }),
        longTasksAfterReady, ...result };
      writeJson(resolve(OUT, `${label}.json`), record); results.push(record);
      console.log(JSON.stringify({ event: 'run', label, valid: result.valid, evidence: record.evidence, backend: result.backend, tier: selected, level: result.tierAtEnd?.level, averageFps: result.averageFps && round(result.averageFps, 1),
        p50: result.frameIntervalMs.p50 && round(result.frameIntervalMs.p50, 1), p95: result.frameIntervalMs.p95 && round(result.frameIntervalMs.p95, 1), max: result.frameIntervalMs.max && round(result.frameIntervalMs.max, 1),
        cpu: result.cpuRenderMs.p50 && round(result.cpuRenderMs.p50, 2), draws: result.drawCalls.median, tris: result.triangles.median, readyMs: Math.round(result.readyMs), governorChanges: result.governorChanges,
        tasksOver100: longTasksAfterReady.over100Ms, thermal: [coolness.thermal.status, heatAfter.status], skin: [coolness.thermal.temperaturesC.SKIN, heatAfter.temperaturesC.SKIN] }));
    } catch (error) {
      problems.push(`${label}: ${(error as Error).message}`); console.log(JSON.stringify({ event: 'run-failed', label, error: (error as Error).message }));
    } finally { await page.close().catch(() => undefined); opened.splice(opened.indexOf(page), 1); }
  }
} finally {
  for (const page of opened) await page.close().catch(() => undefined);
  if (anchor) await anchor.close().catch(error => problems.push(`anchor tab: ${(error as Error).message}`));
  if (browser) await browser.disconnect().catch(() => undefined);
  if (forwardPort !== null) await adb('forward', '--remove', `tcp:${forwardPort}`).catch(error => problems.push((error as Error).message));
  if (reversed) await adb('reverse', '--remove', `tcp:${hosted.port}`).catch(error => problems.push((error as Error).message));
  if (before.wakefulness !== 'Awake') { await shell('input keyevent KEYCODE_HOME').catch(() => undefined); await sleep(800); await shell('input keyevent KEYCODE_SLEEP').catch(() => undefined); }
  await hosted.close();
}

await sleep(2000);
const after = await deviceState();
const restored = JSON.stringify(before.settings) === JSON.stringify(after.settings) && after.reverse === '' && (before.wakefulness === 'Awake' || after.wakefulness !== 'Awake');
const forwards = (await new Promise<string>(done => execFile('adb', ['forward', '--list'], { windowsHide: true }, (_e, out) => done(String(out ?? ''))))).trim();
const auto = results.filter(r => r.tier === 'auto') as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const judged = (workload: Workload) => {
  const runs = auto.filter(r => r.workload === workload);
  return { runs: runs.length, allValid: runs.every(r => r.valid), averageFps: runs.map(r => round(r.averageFps, 1)), p95Ms: runs.map(r => round(r.frameIntervalMs.p95, 1)), maxGapMs: runs.map(r => round(r.frameIntervalMs.max, 1)),
    tasksOver100MsAfterReady: runs.map(r => r.longTasksAfterReady.over100Ms), pass: runs.length > 0 && runs.every(r => r.valid && r.averageFps >= 30 && r.frameIntervalMs.p95 < 33.3 && r.longTasksAfterReady.over100Ms === 0) };
};
writeJson(resolve(OUT, 'x07-summary.json'), {
  schema: 'kiln.golden-gate-tablet-summary/1', id: 'X-07', device: DEVICE, browser: chromeVersion, seconds: SECONDS,
  rule: 'SPEC 20.2 tablet: the tier the kit selects (expected economy), 30 FPS or better with p95 under 33.3 ms in orbit and in play (drive), no task over 100 ms after ready; evidence only with a quiet preflight and a cool start',
  evidence: !!gate?.quiet && results.every(r => r.evidence), selectedTiers: [...new Set(auto.map(r => r.selectedTier))], backends: [...new Set(results.map(r => r.backend))],
  classification: auto[0]?.tierAtStart?.device ?? null, orbit: judged('orbit'), drive: judged('drive'), flyover: judged('flyover'),
  balancedOrbit: (results.filter(r => r.tier === 'balanced') as any[]).map(r => ({ valid: r.valid, averageFps: round(r.averageFps, 1), p95Ms: round(r.frameIntervalMs.p95, 1), level: r.tierAtEnd?.level })), // eslint-disable-line @typescript-eslint/no-explicit-any
  owner: { preexistingTabsCount: preexistingTabs, tabsOpenedHereAllClosed: opened.length === 0, settingsBefore: before.settings, settingsAfter: after.settings, wakefulnessBefore: before.wakefulness, wakefulnessAfter: after.wakefulness,
    orientation: before.orientation, reverseAfter: after.reverse, forwardsAfter: forwards, restored },
  problems,
});
console.log(JSON.stringify({ event: 'done', restored, problems, forwardsAfter: forwards, reverseAfter: after.reverse, wakefulnessAfter: after.wakefulness }));
if (!restored || problems.length) process.exitCode = 1;
