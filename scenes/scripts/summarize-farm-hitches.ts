// M4 item 1: the attribution table for evidence/m4/hitches/ from the hitch runner's summaries (scripts/run-farm-hitches.ts),
// per backend and tier, before and after the fix, plain and traced runs. Reads only the committed summaries; writes
// evidence/m4/hitches/attribution.json. Every number is indicative (this PC, shared and under load; the load samples of
// each run are carried beside it).
//   bun scripts/summarize-farm-hitches.ts [--labels before,after] [--dest evidence/m4/hitches]
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workspacePath } from '../packages/scene-kit/src/testing/node';

const argv = process.argv.slice(2), option = (name: string, fallback: string) => { const at = argv.indexOf(name); return at < 0 ? fallback : argv[at + 1] ?? fallback; };
const workspace = resolve(import.meta.dir, '..'), dest = workspacePath(workspace, option('--dest', 'evidence/m4/hitches'));
const labels = option('--labels', 'before,after').split(',');
type Counters = Record<string, number>;
/** A long frame's cause: the traced attribution where the frame is inside the trace, otherwise read from its own counters. */
const causeOf = (entry: { cause?: string; counters?: Counters }) => {
  if (entry.cause && entry.cause !== 'outside the trace') return entry.cause;
  const c = entry.counters ?? {};
  if ((c['gl.linkProgram'] ?? 0) + (c['gl.compileShader'] ?? 0) + (c['gpu.pipeline'] ?? 0) + (c['gpu.shaderModule'] ?? 0) > 0) return 'program or pipeline creation (from the frame\'s counters; before the trace)';
  if ((c['gl.textureUpload'] ?? 0) + (c['gl.textureAllocation'] ?? 0) + (c['gpu.textureUpload'] ?? 0) > 0) return 'texture upload (from the frame\'s counters; before the trace)';
  return 'unattributed (before the trace)';
};
const uploads = (perFrame: Counters) => ({ calls: (perFrame['gl.bufferData'] ?? 0) + (perFrame['gl.bufferSubData'] ?? 0) + (perFrame['gpu.writeBuffer'] ?? 0),
  bytes: Math.round((perFrame['gl.bufferDataBytes'] ?? 0) + (perFrame['gl.bufferSubDataBytes'] ?? 0) + (perFrame['gpu.writeBufferBytes'] ?? 0)) });
const rows: unknown[] = [];
for (const label of labels) {
  const dir = resolve(dest, label); if (!existsSync(dir)) continue;
  for (const name of (await readdir(dir)).filter(file => /^(webgl2|webgpu)-[a-z]+(-traced)?\.json$/.test(file)).sort()) {
    const r = JSON.parse(await readFile(resolve(dir, name), 'utf8'));
    const long = (r.long ?? []) as { revolution: number; intervalMs: number; atSceneS: number; cause?: string; counters?: Counters }[];
    const causes: Record<string, { over50: number; over100: number; revolutions: number[] }> = {};
    for (const entry of long) { const cause = causeOf(entry), slot = causes[cause] ??= { over50: 0, over100: 0, revolutions: [] }; slot.over50++; if (entry.intervalMs > 100) slot.over100++; if (!slot.revolutions.includes(entry.revolution)) slot.revolutions.push(entry.revolution); }
    rows.push({ label, backend: r.case.backend, tier: r.case.tier, run: r.run, build: r.build, frames: r.frames,
      revolutions: r.revolutions.map((v: any) => ({ revolution: v.revolution, frames: v.frames, over50: v.framesOver50Ms, over100: v.framesOver100Ms, maxMs: v.maxMs, p50Ms: v.intervalMs.p50, p95Ms: v.intervalMs.p95,
        programOrPipelineCreation: v.programOrPipelineCreation, uploadsPerFrame: uploads(v.perFrame), glOrGpuCallMsPerFrame: v.glOrGpuCallMsPerFrame, heapUsedMbAtEnd: v.heap?.usedMbAtEnd ?? null, sceneTimeLostToStepClampMs: v.sceneTimeLostToStepClampMs })),
      afterFirstRevolution: r.afterFirstRevolution, longFrames: long.length, causes,
      startup: { programs: r.setup?.stats?.programs ?? null, pipelines: r.setup?.stats?.pipelines ?? null, warmPass: r.setup?.stats?.counts?.warmPass ?? null },
      heapAtOrbitStartMb: Math.round(r.heapBefore.usedSize / 1048576), heapAtEndMb: Math.round(r.heapAfter.usedSize / 1048576),
      gc: r.trace?.gc ?? null, ordinaryFrame: r.trace?.ordinaryFrameMedians ?? null, tierChanges: r.tierChanges?.length ?? null, longTasks: r.longTasks ?? null,
      load: { before: { cpu: r.loadBefore?.cpuTotalPercent, gpu3d: r.loadBefore?.gpu3dPercent }, after: { cpu: r.loadAfter?.cpuTotalPercent, gpu3d: r.loadAfter?.gpu3dPercent } } });
  }
}
await writeFile(resolve(dest, 'attribution.json'), JSON.stringify({ schema: 'kiln.farm-hitch-attribution/1', note: 'Indicative only: this PC is shared and under load; each run carries its load samples (Get-Counter CPU and GPU 3D engine percent, one second before and after). Frames over 50 ms are attributed from the Chrome trace where the frame is inside it (the trace starts 30 s into revolution 1), otherwise from the frame\'s own WebGL/WebGPU call counters.', rows }, null, 1) + '\n');
for (const row of rows as any[]) console.log(`${row.label.padEnd(6)} ${row.backend} ${row.tier.padEnd(8)} ${row.run.padEnd(6)} revs ${row.revolutions.map((v: any) => `${v.over50}/${v.over100}/${v.maxMs}`).join(' ')}  programs@start ${row.startup.programs}  uploads/frame ${row.revolutions[1].uploadsPerFrame.calls.toFixed(0)} (${row.revolutions[1].uploadsPerFrame.bytes} B)  heap@start ${row.heapAtOrbitStartMb} MB  ${row.gc ? `major GC ${row.gc.major.n}x max ${row.gc.major.maxMs} ms` : ''}  load ${row.load.before.cpu}%`);
