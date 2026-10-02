// S1 count probe runner (OD-17): per scene, tier and named view or workload, draws per render pass, pipelines used,
// triangles, attribution by system and asset, and count-only what-ifs, from a test-mode standalone built by
// scripts/build-scene.ts. The page half is the kit's `__kilnScene.probeFrames` (scene-kit testing/probe.ts); the GPU
// half (count-probe-gpu.ts) counts the encoder's passes, draws, pipelines and load/store ops and is joined per frame.
//   bun scripts/count-probe.ts --label <l> [--build <label>] [--scenes farm,foundry-floor,golden-gate]
//     [--tiers minimal,economy,balanced,high] [--fixtures all|id,…] [--what-if none|standard] [--size 1920x1080]
//     [--fresh-page] [--compare <baseline summary.json>] [--summary-only]
// Output: evidence/counts/<label>/<scene>/<tier>/<fixture>.json, scene-summary.json per scene and tier, and
// summary.json + summary.md (plus levers.md appended when present). Each record names its build (code chunks and
// source) and run (viewport, fresh page or shared), and summary.json carries that provenance; --compare checks pipelines
// only between two fresh-page runs. Counts only: nothing here reads or reports time.
// Ports 4400-4499 are try-bound by serveOwned; the runner closes every page, server and browser it starts.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady } from '../packages/scene-kit/src/testing/node';
import { diffCounts, PASS_KINDS } from '../packages/scene-kit/src/testing/probe-core';
import type { DroppedCaster, ProbeResult, ProbeWhatIf } from '../packages/scene-kit/src/testing/probe';
import { compact, crossCheck, pipelinesComparable, runProvenance, standardWhatIfs, type GpuFrame, type RunProvenance } from '../packages/scene-kit/src/testing/probe-report';
import { sceneOutput, type SceneId } from './build-scene';
import { armGpu, installGpuCounters, readGpuFrame } from './count-probe-gpu';
import { SCENE_FIXTURES, type ProbeFixture } from './scene-fixtures';
import { compareStaticRendererCounts } from './farm-count-gates';

// The page cancels its own probe (restoring the what-if) before puppeteer's 180 s protocol timeout would give up on it.
const ROOT = resolve(import.meta.dir, '..'), TIERS = ['minimal', 'economy', 'balanced', 'high'] as const, TIMEOUT = 180_000, PROBE_TIMEOUT = 150_000;
type Tier = typeof TIERS[number];
interface WhatIfRun { name: string; whatIf: ProbeWhatIf; stable: boolean; frame: number; totals: ProbeResult['totals']; affected: Record<string, number>; dropped?: DroppedCaster[]; delta: Record<string, unknown>; error?: string }
export interface BuildIdentity { label: string; chunks: string[]; source: unknown }
export interface FixtureRecord {
  scene: SceneId; tier: Tier; fixture: { id: string; hudLabel: string | null }; url: string; build?: BuildIdentity; run?: { viewport: [number, number]; freshPage: boolean; query?: Record<string, string> }; base: ProbeResult & { tier?: unknown };
  gpu: { passes: GpuFrame['passes']; check: ReturnType<typeof crossCheck>; errors: string[] } | null; whatIfs: WhatIfRun[];
  returned: { equal: boolean; totals: ProbeResult['totals'] } | null; messages: { type: string; text: string }[]; error?: string;
  systems?: string[]; census?: Census;
}
interface Census { meshes: number; visibleMeshes: number; casters: number; instanced: number; instances: number; transparent: number; skinned: number; triangles: number; lights: { name: string; type: string; castShadow: boolean; mapSize: number[]; texelWorld: number | null }[]; bySystem: Record<string, { visibleMeshes: number; casters: number; triangles: number }> }
async function probe(page: Page, options: Record<string, unknown>): Promise<ProbeResult> {
  return page.evaluate(o => (window as any).__kilnScene.probeFrames(o), { ...options, timeoutMs: PROBE_TIMEOUT }) as Promise<ProbeResult>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const PAGE_CSS = 'body>header,body>footer{display:none!important}';
async function openPage(browser: BrowserContext, url: string, owned: ReadonlySet<number>, size: [number, number], messages: { type: string; text: string }[]): Promise<Page> {
  const page = await browser.newPage(); page.setDefaultTimeout(TIMEOUT);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') messages.push({ type: m.type(), text: m.text().slice(0, 400) }); });
  page.on('pageerror', e => messages.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
  await page.setViewport({ width: size[0], height: size[1], deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installGpuCounters);
  // Farm has no ?capture=1; every page hides its header and footer so the canvas fills the viewport.
  await page.evaluateOnNewDocument(css => { const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true }); }, PAGE_CSS);
  assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(page);
  const backend = await page.$eval('.ks-root', root => root.getAttribute('data-kiln-backend'));
  if (backend !== 'webgpu') throw new Error(`Expected the WebGPU backend, got ${backend}`);
  return page;
}

type RecordContext = Pick<FixtureRecord, 'build' | 'run'>;
async function runFixture(page: Page, scene: SceneId, tier: Tier, fixture: ProbeFixture, url: string, whatIfs: boolean, messages: { type: string; text: string }[], stamp: RecordContext): Promise<FixtureRecord> {
  const record: FixtureRecord = { scene, tier, fixture: { id: fixture.id, hudLabel: fixture.hudLabel }, url, ...stamp, base: null as never, gpu: null, whatIfs: [], returned: null, messages };
  await fixture.enter(page);
  // Systems and the census are read per fixture: a place change (the Foundry fab) brings a different world.
  const systems = record.systems = await page.evaluate(() => Object.keys((window as any).__kilnScene.invoke('probeSystems') ?? {})) as string[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  record.census = await page.evaluate(() => (window as any).__kilnScene.sceneSummary()) as Census; // eslint-disable-line @typescript-eslint/no-explicit-any
  await armGpu(page, true);
  record.base = await probe(page, { frames: 8, stableFrames: 3, maxFrames: 900, objects: 12 });
  const gpu = await readGpuFrame(page, record.base.frame);
  await armGpu(page, false);
  if (gpu.frame) record.gpu = { passes: gpu.frame.passes, check: crossCheck(gpu.frame, record.base.passes), errors: gpu.errors };
  if (whatIfs) {
    const base = compact(record.base);
    for (const w of standardWhatIfs(record.base, systems)) {
      try {
        const r = await probe(page, { frames: 6, stableFrames: 3, maxFrames: 600, whatIf: w.whatIf });
        record.whatIfs.push({ name: w.name, whatIf: w.whatIf, stable: r.stable, frame: r.frame, totals: r.totals, affected: r.whatIf.affected, ...(r.whatIf.dropped ? { dropped: r.whatIf.dropped } : {}), delta: diffCounts(base, compact(r)) });
      } catch (error) { record.whatIfs.push({ name: w.name, whatIf: w.whatIf, stable: false, frame: -1, totals: null as never, affected: {}, delta: {}, error: String(error) }); }
    }
    const again = await probe(page, { frames: 6, stableFrames: 3, maxFrames: 900 });
    record.returned = { equal: JSON.stringify(compact(again)) === JSON.stringify(base), totals: again.totals };
  }
  await fixture.exit?.(page);
  return record;
}

const evidence = (label: string, ...parts: string[]) => resolve(ROOT, 'evidence/counts', label, ...parts);
const writeJson = (path: string, value: unknown) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 1) + '\n'); };

export async function runCountProbe(o: { label: string; build: string; scenes: SceneId[]; tiers: Tier[]; fixtures: string[] | 'all'; whatIfs: boolean; size: [number, number]; freshPage: boolean; query?: Record<string, string> }) {
  const browser = await launchChrome({ workspace: ROOT, name: 'count-probe', windowSize: o.size }), log: string[] = [];
  try {
    for (const scene of o.scenes) {
      const table = SCENE_FIXTURES[scene], dir = sceneOutput(scene, o.build, 'test');
      if (!existsSync(resolve(dir, 'index.html'))) throw new Error(`No test build at ${dir}; run scripts/build-scene.ts --scene ${scene} --mode test --label ${o.build}`);
      const built = existsSync(resolve(dir, 'build.json')) ? JSON.parse(readFileSync(resolve(dir, 'build.json'), 'utf8')) as { chunks: { name: string }[]; source?: unknown } : null;
      // Every record names the build it measured (code chunks are content-hashed) and the viewport and page policy.
      const stamp: RecordContext = { ...(built ? { build: { label: o.build, chunks: built.chunks.map(c => c.name).sort(), source: built.source ?? null } } : {}), run: { viewport: o.size, freshPage: o.freshPage, ...(o.query ? { query: o.query } : {}) } };
      // Scenes reuse the same port one after another and share asset paths (assets/pack.json): one browser context per
      // scene keeps one scene's cache out of the next.
      const hosted = await serveOwned(dir), owned = new Set([hosted.port]), context = await browser.createBrowserContext();
      try {
        for (const tier of o.tiers) {
          const chosen = table.fixtures.filter(f => o.fixtures === 'all' || o.fixtures.includes(f.id));
          const groups: ProbeFixture[][] = [];
          for (const f of chosen) { const last = groups.at(-1); if (!o.freshPage && last && JSON.stringify(last[0]!.query ?? null) === JSON.stringify(f.query ?? null)) last.push(f); else groups.push([f]); }
          let summarized = false;
          for (const group of groups) {
            const query = new URLSearchParams({ ...(group[0]!.query ?? table.query), ...o.query, tier }), url = `${hosted.url}/?${query}`, messages: { type: string; text: string }[] = [];
            let page: Page | null = null;
            try {
              page = await openPage(context, url, owned, o.size, messages);
              await table.prepare(page);
              if (!summarized) { writeJson(evidence(o.label, scene, tier, 'scene-summary.json'), { scene, tier, url, summary: await page.evaluate(() => (window as any).__kilnScene.sceneSummary()), tierState: await page.evaluate(() => (window as any).__kilnScene.tierState()) }); summarized = true; } // eslint-disable-line @typescript-eslint/no-explicit-any
              for (const fixture of group) {
                let record: FixtureRecord;
                try { record = await runFixture(page, scene, tier, fixture, url, o.whatIfs, messages.splice(0), stamp); }
                catch (error) { record = { scene, tier, fixture: { id: fixture.id, hudLabel: fixture.hudLabel }, url, ...stamp, base: null as never, gpu: null, whatIfs: [], returned: null, messages: messages.splice(0), error: String((error as Error)?.stack ?? error).slice(0, 2000) }; }
                writeJson(evidence(o.label, scene, tier, `${fixture.id}.json`), record);
                const t = record.base?.totals, line = record.error ? `${scene} ${tier} ${fixture.id}: ERROR ${record.error.split('\n')[0]}`
                  : `${scene} ${tier} ${fixture.id}: draws ${t.draws} (${PASS_KINDS.filter(k => t.byKind[k]).map(k => `${k} ${t.byKind[k]!.draws}`).join(', ')}) pipelines ${t.pipelinesUsed} triangles ${t.triangles} stable ${record.base.stable} gpu=js ${record.gpu?.check.equal ?? 'n/a'} what-ifs ${record.whatIfs.length} returned ${record.returned?.equal ?? 'n/a'}`;
                console.log(line); log.push(line);
              }
            } catch (error) {
              const line = `${scene} ${tier} [${group.map(f => f.id).join(',')}]: PAGE ERROR ${String(error).split('\n')[0]}`; console.log(line); log.push(line);
              for (const fixture of group) if (!existsSync(evidence(o.label, scene, tier, `${fixture.id}.json`))) writeJson(evidence(o.label, scene, tier, `${fixture.id}.json`), { scene, tier, fixture: { id: fixture.id, hudLabel: fixture.hudLabel }, url, ...stamp, base: null, gpu: null, whatIfs: [], returned: null, messages, error: String((error as Error)?.stack ?? error).slice(0, 2000) });
            } finally { await page?.close().catch(() => {}); }
          }
        }
      } finally { await context.close(); await hosted.close(); }
    }
  } finally { await browser.close(); }
  return log;
}

// ---------- summary ----------
const SUMMARY_KINDS = ['main', 'shadow', 'reflection'] as const;
const other = (t: ProbeResult['totals']) => PASS_KINDS.filter(k => !(SUMMARY_KINDS as readonly string[]).includes(k)).reduce((n, k) => n + (t.byKind[k]?.draws ?? 0), 0);
const LOOK_RISK: Record<string, string> = {
  'freeze-shadow': 'none while nothing moves; movers need the live map (OD-9)',
  'casters-under-300-triangles': 'small shadow changes (OD-4); thin limbs can lose shadow',
  'casters-under-2-texels': 'lowest: sub-2-texel casters barely resolve in the map',
  'skip-reflection': 'bound only: removes the reflection; stand-ins or cadence recover part of it',
  hide: 'bound only: the lever is a look-neutral merge or stand-in of that system',
};
function readRecords(label: string): FixtureRecord[] {
  const out: FixtureRecord[] = [], root = evidence(label);
  for (const scene of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())) for (const tier of TIERS) {
    const dir = resolve(root, scene.name, tier); if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'scene-summary.json')) out.push(JSON.parse(readFileSync(resolve(dir, file), 'utf8')));
  }
  return out;
}
const fixtureOrder = (scene: SceneId) => SCENE_FIXTURES[scene].fixtures.map(f => f.id);
const desc = (a: { samples?: number; format?: string } | null | undefined, load?: string, store?: string, resolveTarget?: boolean) => a ? `${a.samples ?? 1}x ${a.format ?? '?'} ${load}/${store}${resolveTarget ? ' +resolve' : ''}` : '-';

export function summarize(label: string, compareWith?: string) {
  const records = readRecords(label), scenes = [...new Set(records.map(r => r.scene))].sort();
  const rows = records.filter(r => r.base).map(r => ({
    scene: r.scene, tier: r.tier, fixture: r.fixture.id, hudLabel: r.fixture.hudLabel, stable: r.base.stable, stableAfter: r.base.stableAfter, frame: r.base.frame,
    draws: r.base.totals.draws, byKind: Object.fromEntries(Object.entries(r.base.totals.byKind).map(([k, v]) => [k, { passes: v!.passes, draws: v!.draws, triangles: v!.triangles, pipelines: v!.pipelines }])),
    pipelinesUsed: r.base.totals.pipelinesUsed, pipelineCache: r.base.pipelineCache, programs: r.base.programs, memory: { geometries: r.base.info.memory.geometries ?? 0, textures: r.base.info.memory.textures ?? 0 }, triangles: r.base.totals.triangles, drawingBuffer: r.base.drawingBuffer,
    bySystem: Object.fromEntries(Object.entries(r.base.bySystem).sort((a, b) => b[1].draws - a[1].draws).map(([k, v]) => [k, { draws: v.draws, triangles: v.triangles, byKind: v.byKind }])),
    topAssets: Object.entries(r.base.byAsset).sort((a, b) => b[1].draws - a[1].draws).slice(0, 8).map(([k, v]) => ({ asset: k, draws: v.draws, triangles: v.triangles })),
    gpu: r.gpu ? { equal: r.gpu.check.equal, jsDraws: r.gpu.check.jsDraws, gpuDraws: r.gpu.check.gpuDraws, passes: r.gpu.check.gpuPasses, split: r.gpu.check.splitContexts, otherEncoders: r.gpu.check.otherEncoders, bundledDraws: r.gpu.check.bundledDraws, copies: r.gpu.check.copies, errors: r.gpu.errors.length,
      ops: r.gpu.passes.filter(p => /^renderContext_/.test(p.encoder)).map(p => { const js = r.base.passes.find(x => `renderContext_${x.id}` === p.encoder); return { kind: js?.kind ?? '?', color: p.color.map(c => desc(c, c.loadOp, c.storeOp, c.resolve)).join(', '), depth: p.depth ? desc(p.depth, p.depth.depthLoadOp, p.depth.depthStoreOp) : '-' }; }) } : null,
    whatIfs: Object.fromEntries(r.whatIfs.map(w => [w.name, w.error ? { error: w.error } : { draws: (w.delta as { draws: number }).draws, triangles: (w.delta as { triangles: number }).triangles, pipelines: (w.delta as { pipelinesUsed: number }).pipelinesUsed, byKind: Object.fromEntries(Object.entries((w.delta as { byKind: Record<string, { draws: number }> }).byKind ?? {}).map(([k, v]) => [k, v.draws])), stable: w.stable, affected: w.affected }])),
    returned: r.returned?.equal ?? null, messages: r.messages.length,
  }));
  const errors = records.filter(r => r.error).map(r => ({ scene: r.scene, tier: r.tier, fixture: r.fixture.id, error: r.error!.split('\n')[0] }));
  const provenance = runProvenance(records), before = compareWith ? JSON.parse(readFileSync(resolve(compareWith), 'utf8')) as { rows: CountRow[]; provenance?: RunProvenance } : null;
  const comparison = before ? compareRows(rows, before.rows, pipelinesComparable(before.provenance, provenance)) : null;
  writeJson(evidence(label, 'summary.json'), { label, provenance, rows, errors, comparison });
  const builds = [...new Map(records.filter(r => r.build).map(r => [`${r.scene} ${r.build!.chunks.join('+')}`, r])).values()].map(r => {
    const source = r.build!.source as { commit?: string; overlay?: unknown[] } | null;
    return `${r.scene} ${r.build!.chunks.join(', ')} (build ${r.build!.label}${source?.commit ? `, ${source.commit.slice(0, 7)} plus ${source.overlay?.length ?? 0} overlay files` : ''})`;
  });
  const md: string[] = [`# Count probe ${label}: per-scene draw diagnosis`, '',
    `Test-mode standalones built from source (scripts/build-scene.ts), headless Chrome, WebGPU, frozen scene clock, device scale 1. Counts only: draws, triangles and pipelines, never timings. Each row is one settled frame (three identical frames in a row, no draw skipped for a compiling pipeline). "Other" is the output-quad pass plus any off-screen render. Pipelines are those bound in that frame. The GPU column checks that the encoder's renderContext draws equal the JS-level draws of the same frame.`, '',
    `Provenance: ${builds.join('; ') || 'builds not recorded'}. Viewport ${provenance.viewports.join(', ')}; ${provenance.freshPage === true ? 'one fresh page per fixture' : provenance.freshPage === false ? 'fixtures with the same query share a page, so the cumulative pipeline cache depends on fixture order and is not compared' : 'page policy mixed or not recorded'}.${provenance.mixed ? ' **Mixed provenance: records come from more than one build, viewport or page policy.**' : ''}`, '',
    `Records: ${records.length} fixtures, ${rows.length} probed, ${errors.length} failed. Probes stable: ${rows.filter(r => r.stable).length}/${rows.length}. GPU = JS: ${rows.filter(r => r.gpu?.equal).length}/${rows.filter(r => r.gpu).length}. Baseline returned after what-ifs: ${rows.filter(r => r.returned).length}/${rows.filter(r => r.returned !== null).length}.`, ''];
  for (const scene of scenes) {
    const order = fixtureOrder(scene), sceneRows = rows.filter(r => r.scene === scene).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || order.indexOf(a.fixture) - order.indexOf(b.fixture));
    md.push(`## ${scene}`, '');
    for (const tier of TIERS) {
      // One census line per distinct world in this tier (the Foundry fab differs from the campus).
      let previous = '';
      for (const r of records.filter(x => x.scene === scene && x.tier === tier && x.census).sort((a, b) => fixtureOrder(scene).indexOf(a.fixture.id) - fixtureOrder(scene).indexOf(b.fixture.id))) {
        const s = r.census!, key = Object.keys(s.bySystem).join(); if (key === previous) continue; previous = key;
        md.push(`- **${tier} census at ${r.fixture.id}:** ${s.visibleMeshes} visible meshes (${s.meshes} total), ${s.casters} casters, ${s.instanced} instanced (${s.instances} instances), ${s.transparent} transparent, ${s.skinned} skinned, ${Math.round(s.triangles).toLocaleString('en-US')} triangles; lights ${s.lights.map(l => `${l.name || l.type}${l.castShadow ? ` casts ${l.mapSize.join('×')}${l.texelWorld ? `, texel ${(l.texelWorld * 100).toFixed(1)} cm` : ''}` : ' no shadow'}`).join('; ') || 'none with shadows'}. Visible meshes/casters by system: ${Object.entries(s.bySystem).sort((a, b) => b[1].visibleMeshes - a[1].visibleMeshes).map(([k, v]) => `${k} ${v.visibleMeshes}/${v.casters}`).join(', ')}.`);
      }
    }
    md.push('');
    for (const tier of TIERS) {
      const tierRows = sceneRows.filter(r => r.tier === tier); if (!tierRows.length) continue;
      md.push(`### ${scene} · ${tier}`, '', '| Fixture | Draws | Main | Shadow | Reflection | Other | Pipelines (main/shadow/refl) | Triangles | Buffer | Top systems (draws) | GPU=JS |', '|---|---|---|---|---|---|---|---|---|---|---|');
      for (const r of tierRows) md.push(`| ${r.fixture}${r.hudLabel ? ` (${r.hudLabel})` : ''}${r.stable ? '' : ' ⚠ unstable'} | ${r.draws} | ${r.byKind.main?.draws ?? 0} | ${r.byKind.shadow ? `${r.byKind.shadow.draws}${r.byKind.shadow.passes > 1 ? ` (${r.byKind.shadow.passes} passes)` : ''}` : '-'} | ${r.byKind.reflection?.draws ?? '-'} | ${other({ byKind: r.byKind } as never)} | ${r.pipelinesUsed} (${SUMMARY_KINDS.map(k => r.byKind[k]?.pipelines ?? '-').join('/')}) | ${Math.round(r.triangles).toLocaleString('en-US')} | ${r.drawingBuffer.width}×${r.drawingBuffer.height} | ${Object.entries(r.bySystem).filter(([k]) => k !== '(output)').slice(0, 4).map(([k, v]) => `${k} ${v.draws}`).join(', ')} | ${r.gpu ? r.gpu.equal ? 'yes' : `NO ${r.gpu.jsDraws}/${r.gpu.gpuDraws}` : 'n/a'} |`);
      const names = [...new Set(tierRows.flatMap(r => Object.keys(r.whatIfs)))];
      if (names.length) {
        md.push('', `What-ifs at ${tier} (Δ draws per frame; shadow/main/reflection share in brackets where the delta is split):`, '', `| Fixture | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
        for (const r of tierRows) md.push(`| ${r.fixture} | ${names.map(n => { const w = r.whatIfs[n] as { draws?: number; byKind?: Record<string, number>; error?: string; stable?: boolean } | undefined; if (!w) return ''; if (w.error) return 'error'; const parts = Object.entries(w.byKind ?? {}).filter(([, v]) => v); return `${w.draws}${parts.length > 1 ? ` [${parts.map(([k, v]) => `${k[0]}${v}`).join(' ')}]` : ''}${w.stable ? '' : '⚠'}`; }).join(' | ')} |`);
      }
      md.push('');
    }
    // What-ifs ranked by mean draws saved over this scene's fixtures, per tier, with mean pipelines saved and the pass that carries the saving.
    const tiers = TIERS.filter(t => sceneRows.some(r => r.tier === t)), lever = new Map<string, { cells: Map<Tier, { saves: number[]; pipes: number[] }>; byKind: Map<string, number> }>();
    for (const r of sceneRows) for (const [name, w] of Object.entries(r.whatIfs) as [string, { draws?: number; pipelines?: number; byKind?: Record<string, number> }][]) {
      if (w.draws === undefined) continue;
      const entry = lever.get(name) ?? { cells: new Map(), byKind: new Map<string, number>() }, cell = entry.cells.get(r.tier) ?? { saves: [] as number[], pipes: [] as number[] };
      cell.saves.push(-w.draws); cell.pipes.push(-(w.pipelines ?? 0)); entry.cells.set(r.tier, cell);
      for (const [k, v] of Object.entries(w.byKind ?? {})) entry.byKind.set(k, (entry.byKind.get(k) ?? 0) - v);
      lever.set(name, entry);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const ranked = [...lever.entries()].map(([name, e]) => ({ name, e, best: Math.max(...[...e.cells.values()].map(c => mean(c.saves))), pass: [...e.byKind.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-' })).filter(l => l.best > 0).sort((a, b) => b.best - a.best);
    if (ranked.length) {
      md.push(`### ${scene} · what-ifs ranked (draws saved per frame: mean / max over fixtures, mean pipelines saved in brackets; count-only upper bounds)`, '',
        `| What-if | ${tiers.join(' | ')} | Pass carrying it | Look risk |`, `|---|${tiers.map(() => '---').join('|')}|---|---|`);
      for (const l of ranked) md.push(`| ${l.name} | ${tiers.map(t => { const c = l.e.cells.get(t); if (!c) return '–'; const p = mean(c.pipes); return `${mean(c.saves).toFixed(0)} / ${Math.max(...c.saves)}${p >= .5 ? ` (${p.toFixed(0)})` : ''}`; }).join(' | ')} | ${l.pass} | ${LOOK_RISK[l.name] ?? LOOK_RISK[l.name.startsWith('hide-') ? 'hide' : ''] ?? ''} |`);
      md.push('');
    }
    // MSAA and attachment store ops observed per pass kind (S3 input).
    const ops = new Map<string, Set<string>>();
    for (const r of sceneRows) for (const p of r.gpu?.ops ?? []) { const key = `${r.tier} ${p.kind}`; const set = ops.get(key) ?? new Set(); set.add(`colour ${p.color}; depth ${p.depth}`); ops.set(key, set); }
    if (ops.size) {
      md.push(`### ${scene} · render-pass load/store ops observed (renderContext passes)`, '', '| Tier and pass | Attachments (samples, format, load/store) |', '|---|---|');
      for (const [key, set] of [...ops.entries()].sort()) md.push(`| ${key} | ${[...set].join('<br>')} |`);
      const extras = [...new Set(sceneRows.flatMap(r => r.gpu?.otherEncoders ?? []))], split = [...new Set(sceneRows.filter(r => r.gpu?.split.length).map(r => `${r.tier}/${r.fixture}`))];
      md.push('', `Other encoders: ${extras.join(', ') || 'none'}; bundled (mipmap) draws per frame up to ${Math.max(0, ...sceneRows.map(r => r.gpu?.bundledDraws ?? 0))}; texture copies per frame up to ${Math.max(0, ...sceneRows.map(r => r.gpu?.copies ?? 0))}; main pass split into more than one GPU pass in ${split.length} probes${split.length ? ` (${split.slice(0, 6).join(', ')}${split.length > 6 ? ', …' : ''})` : ''}; uncaptured GPU errors ${Math.max(0, ...sceneRows.map(r => r.gpu?.errors ?? 0))}.`, '');
    }
  }
  if (errors.length) { md.push('## Failed fixtures', '', ...errors.map(e => `- ${e.scene} ${e.tier} ${e.fixture}: ${e.error}`), ''); }
  if (comparison) md.push('## Comparison with ' + compareWith, '', comparison.some(c => !c.pipelinesComparable) ? 'Pipelines are the cumulative pipeline cache; it is compared only when both runs used a fresh page per fixture, so here it is shown but not checked (n/c).' : 'Both runs used a fresh page per fixture, so the pipeline cache is compared.', '',
    '| Scene | Tier | Fixture | Draws | Triangles | Pipelines | X-02 (±2% draws and triangles, pipelines ≤ +5%) |', '|---|---|---|---|---|---|---|', ...comparison.map(c => `| ${c.scene} | ${c.tier} | ${c.fixture} | ${c.before.draws} → ${c.after.draws} | ${c.before.triangles} → ${c.after.triangles} | ${c.before.pipelines} → ${c.after.pipelines}${c.pipelinesComparable ? '' : ' (n/c)'} | ${c.pass ? 'within' : 'outside'} |`), '');
  const levers = evidence(label, 'levers.md');
  if (existsSync(levers)) md.push(readFileSync(levers, 'utf8').trim(), '');
  writeFileSync(evidence(label, 'summary.md'), md.join('\n'));
  return { rows: rows.length, errors: errors.length };
}
/**
 * X-02 against a baseline summary (OD-8 re-baseline). The cumulative pipeline cache depends on what the page drew before,
 * so its +5% bound applies only when both runs used a fresh page per fixture (`pipelinesComparable`); otherwise a row
 * passes on draws and triangles and its pipelines are shown as not compared.
 */
export function compareRows(after: CountRow[], before: CountRow[], pipelines: boolean) {
  const snapshot = (r: CountRow) => ({ drawCalls: r.draws, triangles: r.triangles, pipelines: r.pipelineCache, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs });
  return after.flatMap(a => {
    const b = before.find(x => x.scene === a.scene && x.tier === a.tier && x.fixture === a.fixture); if (!b) return [];
    const x02 = compareStaticRendererCounts(snapshot(b), snapshot(a)), pass = pipelines ? x02.pass : x02.validObservations && x02.checks.drawCalls.pass && x02.checks.triangles.pass;
    return [{ scene: a.scene, tier: a.tier, fixture: a.fixture, before: { draws: b.draws, triangles: b.triangles, pipelines: b.pipelineCache }, after: { draws: a.draws, triangles: a.triangles, pipelines: a.pipelineCache }, pipelinesComparable: pipelines, pass }];
  });
}
export interface CountRow { scene: string; tier: string; fixture: string; draws: number; triangles: number; pipelineCache: number; programs: number; memory: { geometries: number; textures: number } }

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => { const at = args.indexOf(name); if (at < 0) return fallback; const v = args[at + 1]; if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`); return v; };
  const label = option('--label', ''); if (!/^[a-z0-9-]+$/.test(label)) throw new Error('--label <lowercase-label> is required');
  const compareWith = args.includes('--compare') ? option('--compare', '') : undefined;
  if (!args.includes('--summary-only')) {
    const scenes = option('--scenes', 'farm,foundry-floor,golden-gate').split(',') as SceneId[], tiers = option('--tiers', TIERS.join(',')).split(',') as Tier[];
    for (const s of scenes) if (!SCENE_FIXTURES[s]) throw new Error(`Unknown scene ${s}`);
    for (const t of tiers) if (!TIERS.includes(t)) throw new Error(`Unknown tier ${t}`);
    const fixtures = option('--fixtures', 'all'), size = option('--size', '1920x1080').split('x').map(Number) as [number, number];
    await runCountProbe({ label, build: option('--build', label), scenes, tiers, fixtures: fixtures === 'all' ? 'all' : fixtures.split(','), whatIfs: option('--what-if', 'standard') === 'standard', size, freshPage: args.includes('--fresh-page'),
      // --query adds dev parameters (for example heroMerge=false) to every fixture URL, for A/B counts within one build.
      ...(args.includes('--query') ? { query: Object.fromEntries(new URLSearchParams(option('--query', ''))) } : {}) });
  }
  console.log(JSON.stringify(summarize(label, compareWith)));
}
