/**
 * Attribute a CPU profile to the phases `scripts/profile-engine.ts` timed (issue #372).
 *
 * The profiler samples whole stacks, and an async phase loses its caller frame after its first
 * await, so the call tree alone cannot say which phase a sample belongs to. The harness records
 * each phase's wall-clock window in the profile's own clock (microseconds since the epoch); a
 * sample is attributed to the window that contains it, and only its leaf frame earns self time.
 *
 * Run: bun scripts/cpuprofile-phases.ts <profile.cpuprofile> <windows.json> [--top N] [--json]
 */
import { readFileSync } from 'node:fs';

export interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber?: number };
  children?: number[];
}

export interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

/** One timed phase, in the profile clock (microseconds). */
export interface PhaseWindow {
  phase: string;
  asset: string;
  run: number;
  startUs: number;
  endUs: number;
}

export interface HotFunction {
  /** `name (file:line)`, with the file shortened to its path from `src/` or `node_modules/`. */
  frame: string;
  selfMs: number;
  /** Share of the phase's sampled time. */
  share: number;
}

export interface PhaseHotSpots {
  phase: string;
  sampledMs: number;
  top: HotFunction[];
  /** Self time summed per module; frames with no script (built-ins, GC, idle) are `(native)`. */
  modules: HotFunction[];
}

/** Shorten a script URL so a report names the module, never the machine's checkout path. */
export function shortUrl(url: string): string {
  const path = url.replace(/^file:\/\//, '').replace(/\\/g, '/');
  for (const marker of ['/node_modules/', '/src/', '/scripts/', '/dist/']) {
    const at = path.lastIndexOf(marker);
    if (at >= 0) return path.slice(at + 1);
  }
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/**
 * Code with no URL past its first line was compiled at run time: in the build phase that is the
 * Kiln program itself, which `executeKilnCode` evaluates with `new Function` (its body starts
 * below the generated header, so never on line 0). Native functions report line -1, and
 * JavaScriptCore's JS-implemented built-ins (`every`, `map`, iterator helpers) line 0.
 */
const isEvaluated = (node: CpuProfileNode) => !node.callFrame.url && node.callFrame.lineNumber > 0;

function moduleName(node: CpuProfileNode): string {
  if (node.callFrame.url) return shortUrl(node.callFrame.url);
  return isEvaluated(node) ? '(evaluated program)' : '(native)';
}

function frameName(node: CpuProfileNode): string {
  const { functionName, url, lineNumber } = node.callFrame;
  const name = functionName || '(anonymous)';
  if (isEvaluated(node)) return `${name} (evaluated:${lineNumber + 1})`;
  if (!url) return name;
  // Profile line numbers are zero-based.
  return `${name} (${shortUrl(url)}:${lineNumber + 1})`;
}

/**
 * Self time per leaf frame, per phase. A sample's duration is the delta to the next sample
 * (the last sample runs to the profile's end), and it lands in the first window whose
 * half-open interval [startUs, endUs) contains its timestamp. Samples outside every window
 * (setup, warm-up that was not recorded, teardown) are ignored.
 */
export function attributePhases(
  profile: CpuProfile,
  windows: readonly PhaseWindow[],
  top = 10,
): PhaseHotSpots[] {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const sorted = [...windows].sort((a, b) => a.startUs - b.startUs);
  const self = new Map<string, Map<string, number>>();
  const modules = new Map<string, Map<string, number>>();
  const sampled = new Map<string, number>();
  const times: number[] = [];
  let t = profile.startTime;
  for (const delta of profile.timeDeltas) {
    t += delta;
    times.push(t);
  }
  let w = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const at = times[i]!;
    const next = i + 1 < times.length ? times[i + 1]! : profile.endTime;
    const durationUs = Math.max(0, next - at);
    while (w < sorted.length && sorted[w]!.endUs <= at) w++;
    const window = sorted[w];
    if (!window || at < window.startUs) continue;
    const node = nodes.get(profile.samples[i]!);
    if (!node) continue;
    // Idle and garbage-collector frames stay in the table: they are time the phase spent.
    const name = frameName(node);
    const byFrame = self.get(window.phase) ?? new Map<string, number>();
    byFrame.set(name, (byFrame.get(name) ?? 0) + durationUs);
    self.set(window.phase, byFrame);
    const byModule = modules.get(window.phase) ?? new Map<string, number>();
    const module = moduleName(node);
    byModule.set(module, (byModule.get(module) ?? 0) + durationUs);
    modules.set(window.phase, byModule);
    sampled.set(window.phase, (sampled.get(window.phase) ?? 0) + durationUs);
  }
  const phases = [...new Set(sorted.map((x) => x.phase))];
  return phases.map((phase) => {
    const totalUs = sampled.get(phase) ?? 0;
    const rank = (totals: Map<string, number> | undefined) =>
      [...(totals ?? new Map<string, number>())]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, top)
        .map(([frame, us]) => ({
          frame,
          selfMs: us / 1000,
          share: totalUs > 0 ? us / totalUs : 0,
        }));
    return {
      phase,
      sampledMs: totalUs / 1000,
      top: rank(self.get(phase)),
      modules: rank(modules.get(phase)),
    };
  });
}

export function formatHotSpots(phases: readonly PhaseHotSpots[]): string {
  const out: string[] = [];
  const row = (hot: HotFunction) =>
    `| ${hot.selfMs.toFixed(0)} | ${(hot.share * 100).toFixed(1)}% | \`${hot.frame}\` |`;
  for (const { phase, sampledMs, top, modules } of phases) {
    out.push(`### ${phase} (${sampledMs.toFixed(0)} ms sampled)`, '');
    out.push('| self ms | share | function |', '|---:|---:|---|', ...top.map(row), '');
    out.push(
      '| self ms | share | module |',
      '|---:|---:|---|',
      ...modules.slice(0, 5).map(row),
      '',
    );
  }
  return out.join('\n');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const valued = ['--top', '--phase'];
  const positional = args.filter((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]!));
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const top = Number(option('--top') ?? 12);
  const phase = option('--phase');
  if (positional.length !== (phase ? 1 : 2) || !Number.isInteger(top) || top < 1) {
    console.error(
      'usage: bun scripts/cpuprofile-phases.ts <profile.cpuprofile> (<windows.json> | --phase <name>) [--top N] [--json]',
    );
    process.exit(2);
  }
  const profile = JSON.parse(readFileSync(positional[0]!, 'utf8')) as CpuProfile;
  // A per-phase profile (profile-engine.ts --cpu-prof-phases) is one window from end to end.
  const windows: PhaseWindow[] = phase
    ? [{ phase, asset: '', run: 0, startUs: profile.startTime, endUs: profile.endTime + 1 }]
    : (JSON.parse(readFileSync(positional[1]!, 'utf8')) as PhaseWindow[]);
  const result = attributePhases(profile, windows, top);
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : formatHotSpots(result));
}
