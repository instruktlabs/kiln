// Node-side, pure helpers for the count-probe runner (scenes/scripts/count-probe.ts): the per-frame join of GPU encoder
// passes to JS pass records, the standard what-ifs, the compact shape what-ifs are diffed in, and run provenance. They
// live beside probe-core so the portable gate tests them; no page code imports this file.
import type { ProbeResult, ProbeWhatIf } from './probe';

export interface GpuAttachment { w: number; h: number; samples: number; format: string; mip: number; loadOp?: string; storeOp?: string; resolve?: boolean; depthLoadOp?: string; depthStoreOp?: string; stencilLoadOp?: string; stencilStoreOp?: string }
export interface GpuPass { frame: number; encoder: string; color: GpuAttachment[]; depth: GpuAttachment | null; draws: number; setPipeline: number; pipelines: number; bundles: number; bundledDraws: number }
export interface GpuFrame { passes: GpuPass[]; copies: number; submits: number }

/** Per-frame join: renderContext_<id> GPU draws against JS-level draws summed per context id (records split by render call share one). */
export function crossCheck(gpu: GpuFrame, js: readonly { id: number; draws: number }[]) {
  const byContext = new Map<number, number>(), jsById = new Map<number, number>();
  for (const p of gpu.passes) { const m = /^renderContext_(\d+)$/.exec(p.encoder); if (m) byContext.set(Number(m[1]), (byContext.get(Number(m[1])) ?? 0) + p.draws); }
  for (const p of js) jsById.set(p.id, (jsById.get(p.id) ?? 0) + p.draws);
  const jsDraws = js.reduce((n, p) => n + p.draws, 0), gpuDraws = [...byContext.values()].reduce((n, d) => n + d, 0);
  const mismatches = [...jsById].filter(([id, draws]) => (byContext.get(id) ?? 0) !== draws).map(([id, draws]) => ({ id, js: draws, gpu: byContext.get(id) ?? 0 }));
  for (const [id, draws] of byContext) if (!jsById.has(id) && draws) mismatches.push({ id, js: 0, gpu: draws });
  const other = gpu.passes.filter(p => !/^renderContext_\d+$/.test(p.encoder));
  return { equal: jsDraws === gpuDraws && !mismatches.length, jsDraws, gpuDraws, mismatches, gpuPasses: gpu.passes.length,
    splitContexts: [...new Set(gpu.passes.map(p => p.encoder))].filter(e => /^renderContext_/.test(e) && gpu.passes.filter(p => p.encoder === e).length > 1),
    otherPasses: other.length, otherEncoders: [...new Set(other.map(p => p.encoder))], bundledDraws: gpu.passes.reduce((n, p) => n + p.bundledDraws, 0), copies: gpu.copies };
}

export const compact = (r: Pick<ProbeResult, 'totals' | 'bySystem'>) => ({
  draws: r.totals.draws, triangles: r.totals.triangles, pipelinesUsed: r.totals.pipelinesUsed,
  byKind: Object.fromEntries(Object.entries(r.totals.byKind).map(([k, v]) => [k, { draws: v!.draws, triangles: v!.triangles, pipelines: v!.pipelines }])),
  // Systems with no draws this frame are left out, so an empty bucket appearing or not is not a change.
  bySystem: Object.fromEntries(Object.entries(r.bySystem).filter(([, v]) => v.draws).map(([k, v]) => [k, v.draws])),
});
/** The standard count-only what-ifs for a settled baseline: shadow levers where a shadow pass drew, reflection where one drew, every drawing system. */
export function standardWhatIfs(base: Pick<ProbeResult, 'totals' | 'bySystem'>, systems: readonly string[]): { name: string; whatIf: ProbeWhatIf }[] {
  const list: { name: string; whatIf: ProbeWhatIf }[] = [];
  if (base.totals.byKind.shadow) list.push({ name: 'freeze-shadow', whatIf: { freezeShadows: true } }, { name: 'casters-under-300-triangles', whatIf: { dropCasters: { triangles: 300 } } }, { name: 'casters-under-2-texels', whatIf: { dropCasters: { texels: 2 } } });
  if (base.totals.byKind.reflection) list.push({ name: 'skip-reflection', whatIf: { skipRenders: ['reflection'] } });
  for (const system of systems) if (base.bySystem[system]?.draws) list.push({ name: `hide-${system}`, whatIf: { hide: [system] } });
  return list;
}

/**
 * What a run's records were measured on: per scene the build's code chunks (content-hashed names), the viewports and
 * the page policy. `freshPage` is null when records disagree or do not say; `mixed` flags any of that.
 */
export interface RunProvenance { builds: Record<string, string[]>; viewports: string[]; freshPage: boolean | null; mixed: boolean }
export function runProvenance(records: readonly { scene: string; build?: { chunks: readonly string[] }; run?: { viewport: readonly number[]; freshPage: boolean } }[]): RunProvenance {
  const builds: Record<string, string[]> = {}, viewports: string[] = [], pages = new Set<boolean | null>();
  for (const r of records) {
    const build = r.build ? r.build.chunks.join('+') : '(unknown)', list = builds[r.scene] ??= [];
    if (!list.includes(build)) list.push(build);
    const viewport = r.run ? r.run.viewport.join('x') : '(unknown)';
    if (!viewports.includes(viewport)) viewports.push(viewport);
    pages.add(r.run ? r.run.freshPage : null);
  }
  const freshPage = pages.size === 1 ? [...pages][0]! : null;
  return { builds, viewports, freshPage, mixed: freshPage === null || viewports.length > 1 || Object.values(builds).some(list => list.length > 1) };
}
/** The cumulative pipeline cache depends on what the page drew before, so it compares only between two fresh-page runs. */
export const pipelinesComparable = (a: RunProvenance | null | undefined, b: RunProvenance | null | undefined) => a?.freshPage === true && b?.freshPage === true;
