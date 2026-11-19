// Host measurements shared by the spike's Node reference and browser harness: the device
// class and whole-machine CPU busy share over a window (all logical processors, this
// process and the browser included). Not part of the package.
import { cpus, freemem, loadavg, platform, release, totalmem } from 'node:os';

const snapshot = () =>
  cpus().reduce(
    (sum, cpu) => {
      const { user, nice, sys, irq, idle } = cpu.times;
      sum.busy += user + nice + sys + irq;
      sum.total += user + nice + sys + irq + idle;
      return sum;
    },
    { busy: 0, total: 0 },
  );

/** Start a window; the returned function gives the busy percentage since the start. */
export function cpuWindow() {
  const start = snapshot();
  return () => {
    const end = snapshot();
    const total = end.total - start.total;
    return total > 0 ? Math.round((1000 * (end.busy - start.busy)) / total) / 10 : 0;
  };
}

/** Busy percentage over a short idle wait, sampled before a run starts. */
export async function idleLoad(ms = 2000) {
  const done = cpuWindow();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return done();
}

export function deviceClass() {
  const list = cpus();
  return {
    cpu: list[0]?.model.trim(),
    logicalProcessors: list.length,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
    freeMemoryGiB: Math.round(freemem() / 2 ** 30),
    os: `${platform()} ${release()}`,
    loadavg: platform() === 'win32' ? undefined : loadavg(),
  };
}

export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? undefined
      : sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { median, min: sorted[0], max: sorted.at(-1), n: sorted.length };
}
