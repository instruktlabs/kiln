#!/usr/bin/env node
/**
 * Records host CPU load around a gate command: `node scripts/gate-load.mjs <command> [args]`.
 *
 * CLI-spawning tests carry 20 to 120 s limits that exist to catch hangs. On a host at 90% CPU
 * or more they time out without hanging, and nothing in the output said which it was. This
 * prints the load before the command, samples it while the command runs, and prints start,
 * peak, mean and end after it, so a timeout reads as load or as a defect.
 *
 * Above 90% at the start it warns. `KILN_GATE_REQUIRE_QUIET=1` turns the warning into a
 * refusal. The command's exit code is passed through unchanged.
 *
 * The reading is the busy share of `os.cpus()` times between two samples, which works the
 * same on Windows, Linux and macOS with no counters or tools to install.
 */
import { spawn } from 'node:child_process';
import { cpus, loadavg } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUIET_THRESHOLD_PERCENT = 90;
const SAMPLE_WINDOW_MS = 1000;
const SAMPLE_EVERY_MS = 5000;

/** Busy share, 0 to 100, of the time all cores spent between two `os.cpus()` snapshots. */
export function busyPercent(before, after) {
  if (before.length === 0 || before.length !== after.length) return null;
  let busy = 0;
  let total = 0;
  for (let i = 0; i < before.length; i++) {
    const a = before[i].times;
    const b = after[i].times;
    const idle = b.idle - a.idle;
    let all = 0;
    for (const key of Object.keys(b)) all += b[key] - (a[key] ?? 0);
    busy += all - idle;
    total += all;
  }
  return total > 0 ? (busy / total) * 100 : null;
}

/** `ok`, `warn` or `refuse` for a load at the start of a gate run. */
export function loadVerdict(percent, env) {
  if (percent === null || percent <= QUIET_THRESHOLD_PERCENT) return { level: 'ok' };
  const reading = formatLoad(percent);
  if (env.KILN_GATE_REQUIRE_QUIET === '1')
    return {
      level: 'refuse',
      message: `Host CPU is at ${reading}, above ${QUIET_THRESHOLD_PERCENT}%, and KILN_GATE_REQUIRE_QUIET=1 is set. Wait for a quiet host or use the second gate host.`,
    };
  return {
    level: 'warn',
    message: `Host CPU is at ${reading}, above ${QUIET_THRESHOLD_PERCENT}%. Timeouts in CLI-spawning tests are expected; rerun a failed file alone before reading it as a defect.`,
  };
}

export function summarize(samples) {
  if (samples.length === 0) return null;
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    start: samples[0],
    end: samples[samples.length - 1],
    peak: Math.max(...samples),
    mean: sum / samples.length,
  };
}

export function formatLoad(percent) {
  return percent === null ? 'unknown' : `${Math.round(percent)}%`;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function sampleOnce() {
  const before = cpus();
  await sleep(SAMPLE_WINDOW_MS);
  return busyPercent(before, cpus());
}

function describeHost() {
  const load = process.platform === 'win32' ? '' : `, load average ${loadavg()[0].toFixed(2)}`;
  return `${cpus().length} logical CPUs${load}`;
}

async function main(argv, env) {
  if (argv.length === 0) {
    console.error('Usage: node scripts/gate-load.mjs <command> [args...]');
    return 2;
  }
  const first = await sampleOnce();
  console.error(`[gate-load] start: CPU ${formatLoad(first)} (${describeHost()})`);
  const verdict = loadVerdict(first, env);
  if (verdict.level === 'refuse') {
    console.error(`[gate-load] ${verdict.message}`);
    return 3;
  }
  if (verdict.level === 'warn') console.error(`[gate-load] WARNING: ${verdict.message}`);

  const samples = first === null ? [] : [first];
  let previous = cpus();
  const timer = setInterval(() => {
    const next = cpus();
    const percent = busyPercent(previous, next);
    previous = next;
    if (percent !== null) samples.push(percent);
  }, SAMPLE_EVERY_MS);

  const code = await new Promise((done) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env });
    child.on('error', (error) => {
      console.error(`[gate-load] could not start ${argv[0]}: ${error.message}`);
      done(127);
    });
    child.on('exit', (status, signal) => done(status ?? (signal ? 1 : 0)));
  });
  clearInterval(timer);

  const last = busyPercent(previous, cpus());
  if (last !== null) samples.push(last);
  const s = summarize(samples);
  if (s) {
    console.error(
      `[gate-load] end: CPU start ${formatLoad(s.start)}, peak ${formatLoad(s.peak)}, mean ${formatLoad(s.mean)}, end ${formatLoad(s.end)} over ${samples.length} samples`,
    );
    if (code !== 0 && s.peak > QUIET_THRESHOLD_PERCENT)
      console.error(
        `[gate-load] The run failed with CPU above ${QUIET_THRESHOLD_PERCENT}% at its peak. Rerun each failed file alone; a timeout that passes alone was load, not a hang.`,
      );
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
