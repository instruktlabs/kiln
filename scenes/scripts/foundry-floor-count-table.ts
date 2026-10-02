// Foundry Floor before/after count table (draw-optimization step S5): reads two count-probe summaries (scripts/count-probe.ts,
// evidence/counts/<label>/summary.json) and writes the per-tier, per-fixture table the report needs: draws per pass, total
// draws, pipelines bound per frame and in the cache, triangles, per-tier sums, and the per-system attribution that shows what
// else changed. Foundry Floor is the control scene, so its AFTER differs from BEFORE only by the campus planting (shared
// material graph) and the MSAA multisample discard; every other system must match exactly. Counts only: nothing reads time.
//   bun scripts/foundry-floor-count-table.ts [--before draw-base] [--after draw-after-ff] [--after-off draw-after-ff-off] [--out evidence/draw-after/foundry-floor]
// Output: <out>/counts-table.md and <out>/counts-table.json. Exits 1 when a system other than planting differs between BEFORE and
// AFTER outside the drive workload (whose traffic depends on the wall clock), or when AFTER with the planting switched off
// (--after-off) does not equal BEFORE on draws, pipelines used and triangles in every non-drive fixture.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..'), TIERS = ['minimal', 'economy', 'balanced', 'high'] as const;
const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const read = (label: string) => JSON.parse(readFileSync(resolve(ROOT, 'evidence/counts', label, 'summary.json'), 'utf8')) as Summary;
interface SystemCount { draws: number; triangles: number }
interface Row {
  scene: string; tier: string; fixture: string; hudLabel: string | null; stable: boolean; draws: number; triangles: number; pipelinesUsed: number; pipelineCache: number; programs: number;
  byKind: Record<string, { passes: number; draws: number; triangles: number; pipelines: number }>; bySystem: Record<string, SystemCount>; drawingBuffer: { width: number; height: number };
  gpu: { equal: boolean; ops: { kind: string; color: string; depth: string }[] } | null;
}
interface Summary { label: string; provenance: { builds: Record<string, string[]>; viewports: string[]; freshPage: boolean | null }; rows: Row[] }
const before = read(option('--before', 'draw-base')), after = read(option('--after', 'draw-after-ff')), offLabel = option('--after-off', 'draw-after-ff-off');
const off = (() => { try { return read(offLabel); } catch { return null; } })();
const out = resolve(ROOT, option('--out', 'evidence/draw-after/foundry-floor')); mkdirSync(out, { recursive: true });

const rowsOf = (s: Summary, scene = 'foundry-floor') => s.rows.filter(r => r.scene === scene);
const find = (s: Summary, tier: string, fixture: string) => s.rows.find(r => r.tier === tier && r.fixture === fixture);
const fixtures = [...new Set(rowsOf(before).map(r => r.fixture))];
const kind = (r: Row, k: string) => r.byKind[k]?.draws ?? 0;
const delta = (a: number, b: number) => b === a ? '=' : `${b - a > 0 ? '+' : ''}${b - a}`;
const arrow = (a: number, b: number) => a === b ? `${a}` : `${a} → ${b}`;
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const WORKLOAD = new Set(['drive']);

interface Line { tier: string; fixture: string; label: string | null; place: 'campus' | 'fab'; before: Row; after: Row; changedSystems: string[]; note: string }
const lines: Line[] = [], problems: string[] = [];
for (const tier of TIERS) for (const fixture of fixtures) {
  const b = find(before, tier, fixture), a = find(after, tier, fixture); if (!b || !a) { problems.push(`${tier} ${fixture}: missing in ${!b ? before.label : after.label}`); continue; }
  const systems = [...new Set([...Object.keys(b.bySystem), ...Object.keys(a.bySystem)])].filter(s => s !== '(output)');
  const changedSystems = systems.filter(s => JSON.stringify(b.bySystem[s] ?? null) !== JSON.stringify(a.bySystem[s] ?? null));
  const unexpected = changedSystems.filter(s => s !== 'planting');
  if (unexpected.length && !WORKLOAD.has(fixture)) problems.push(`${tier} ${fixture}: systems other than planting changed: ${unexpected.join(', ')}`);
  if (a.triangles !== b.triangles && !WORKLOAD.has(fixture)) problems.push(`${tier} ${fixture}: triangles ${b.triangles} → ${a.triangles}`);
  if (a.gpu && !a.gpu.equal) problems.push(`${tier} ${fixture}: GPU draws differ from JS draws`);
  const base = changedSystems.length === 0 ? 'unchanged' : unexpected.length === 0 ? 'planting only' : WORKLOAD.has(fixture) ? `workload state (${unexpected.join(', ')} moved with the wall clock)` : `OTHER: ${unexpected.join(', ')}`;
  const note = WORKLOAD.has(fixture) && !base.startsWith('workload') ? `${base}; workload fixture, its traffic can differ between runs` : base;
  lines.push({ tier, fixture, label: a.hudLabel, place: fixture.startsWith('fab-') ? 'fab' : 'campus', before: b, after: a, changedSystems, note });
}
// AFTER with the planting off must equal BEFORE (draws, pipelines used, triangles, per-system draws) in every non-drive fixture.
const offChecks: { tier: string; fixture: string; equal: boolean; detail: string }[] = [];
if (off) for (const tier of TIERS) for (const fixture of fixtures) {
  const b = find(before, tier, fixture), o = find(off, tier, fixture); if (!b || !o) continue;
  const mismatch = [b.draws !== o.draws && `draws ${b.draws} → ${o.draws}`, b.pipelinesUsed !== o.pipelinesUsed && `pipelines ${b.pipelinesUsed} → ${o.pipelinesUsed}`, b.triangles !== o.triangles && `triangles ${b.triangles} → ${o.triangles}`,
    JSON.stringify(b.bySystem) !== JSON.stringify(o.bySystem) && 'bySystem'].filter(Boolean);
  offChecks.push({ tier, fixture, equal: mismatch.length === 0, detail: mismatch.join('; ') });
  if (mismatch.length && !WORKLOAD.has(fixture)) problems.push(`planting-off ${tier} ${fixture}: ${mismatch.join('; ')}`);
}

const sum = (xs: Line[], pick: (r: Row) => number, which: 'before' | 'after') => xs.reduce((n, l) => n + pick(l[which]), 0);
const md: string[] = [`# Foundry Floor counts: ${before.label} (BEFORE) against ${after.label} (AFTER)`, '',
  `BEFORE: ${(before.provenance.builds['foundry-floor'] ?? []).join(', ')} (viewport ${before.provenance.viewports.join(', ')}, ${before.provenance.freshPage ? 'fresh page per fixture' : 'fixtures share a page'}). AFTER: ${(after.provenance.builds['foundry-floor'] ?? []).join(', ')} (viewport ${after.provenance.viewports.join(', ')}, ${after.provenance.freshPage ? 'fresh page per fixture' : 'fixtures share a page'}). Same policy on both sides: 1920x1080, device scale 1, frozen clock, WebGPU, one page per query group, so the cumulative pipeline cache depends on fixture order and is shown but not compared. "Pipelines" is the number bound in the settled frame (main pass / whole frame). Foundry Floor has no shadow or reflection pass at any tier; the passes are main and the output quad.`, ''];
for (const tier of TIERS) {
  const tl = lines.filter(l => l.tier === tier); if (!tl.length) continue;
  const buffer = tl[0]!.after.drawingBuffer;
  md.push(`## ${tier} (drawing buffer ${buffer.width}×${buffer.height})`, '', '| Fixture | Main draws | Output | Total draws | Pipelines bound (main) | Pipeline cache (n/c) | Triangles | Difference |', '|---|---|---|---|---|---|---|---|');
  for (const l of tl) {
    const b = l.before, a = l.after;
    md.push(`| ${l.fixture}${l.label ? ` (${l.label})` : ''} | ${arrow(kind(b, 'main'), kind(a, 'main'))} | ${arrow(kind(b, 'output'), kind(a, 'output'))} | ${arrow(b.draws, a.draws)} (${delta(b.draws, a.draws)}) | ${arrow(b.pipelinesUsed, a.pipelinesUsed)} (${arrow(b.byKind.main?.pipelines ?? 0, a.byKind.main?.pipelines ?? 0)}) | ${arrow(b.pipelineCache, a.pipelineCache)} | ${arrow(b.triangles, a.triangles)} | ${l.note} |`);
  }
  md.push('');
  for (const [name, group] of [['campus (7 fixtures)', tl.filter(l => l.place === 'campus')], ['fab (8 fixtures)', tl.filter(l => l.place === 'fab')], ['all 15 fixtures', tl]] as const) {
    md.push(`- **${tier} sum, ${name}:** main draws ${arrow(sum(group, r => kind(r, 'main'), 'before'), sum(group, r => kind(r, 'main'), 'after'))}; total draws ${arrow(sum(group, r => r.draws, 'before'), sum(group, r => r.draws, 'after'))} (${((sum(group, r => r.draws, 'after') / sum(group, r => r.draws, 'before') - 1) * 100).toFixed(1)}%); pipelines bound ${arrow(sum(group, r => r.pipelinesUsed, 'before'), sum(group, r => r.pipelinesUsed, 'after'))}; triangles ${num(sum(group, r => r.triangles, 'before'))} → ${num(sum(group, r => r.triangles, 'after'))}.`);
  }
  md.push('');
}
// Per-system attribution: what changed where (draws, then triangles).
md.push('## Per-system draws (BEFORE → AFTER), campus fixtures, high tier', '');
const sysNames = ['structures', 'planting', 'ground', 'traffic', 'sky'], campusHigh = lines.filter(l => l.tier === 'high' && l.place === 'campus');
md.push(`| Fixture | ${sysNames.join(' | ')} |`, `|---|${sysNames.map(() => '---').join('|')}|`);
for (const l of campusHigh) md.push(`| ${l.fixture} | ${sysNames.map(s => { const b = l.before.bySystem[s], a = l.after.bySystem[s]; return `${arrow(b?.draws ?? 0, a?.draws ?? 0)}${(b?.triangles ?? 0) !== (a?.triangles ?? 0) ? ' (tris differ)' : ''}`; }).join(' | ')} |`);
const fabHigh = lines.filter(l => l.tier === 'high' && l.place === 'fab'), fabSystems = ['fab-tools', 'fab-movers', 'fab-building', 'fab-transport', 'interior-context', 'fab-proxies', 'fab-pulses'];
md.push('', '## Per-system draws (BEFORE → AFTER), fab fixtures, high tier', '', `| Fixture | ${fabSystems.join(' | ')} |`, `|---|${fabSystems.map(() => '---').join('|')}|`);
for (const l of fabHigh) md.push(`| ${l.fixture} | ${fabSystems.map(s => { const b = l.before.bySystem[s], a = l.after.bySystem[s]; return `${arrow(b?.draws ?? 0, a?.draws ?? 0)}${(b?.triangles ?? 0) !== (a?.triangles ?? 0) ? ' (tris differ)' : ''}`; }).join(' | ')} |`);
// Systems unchanged over every fixture and tier.
const everywhere = (system: string) => { const ls = lines.filter(l => l.before.bySystem[system] || l.after.bySystem[system]); return { fixtures: ls.length, equal: ls.filter(l => JSON.stringify(l.before.bySystem[system] ?? null) === JSON.stringify(l.after.bySystem[system] ?? null)).length }; };
md.push('', '## Systems compared over every tier and fixture that draws them', '', '| System | Rows | Identical draws and triangles | Note |', '|---|---|---|---|');
for (const s of [...sysNames, ...fabSystems]) { const e = everywhere(s); if (e.fixtures) md.push(`| ${s} | ${e.fixtures} | ${e.equal} | ${e.equal === e.fixtures ? 'identical' : s === 'planting' ? 'changed by the shared planting material' : s === 'traffic' ? 'drive workload (wall-clock traffic)' : 'DIFFERS'} |`); }
// Load and store ops of the main and output passes.
const ops = (s: Summary) => [...new Set(rowsOf(s).flatMap(r => (r.gpu?.ops ?? []).map(o => `${o.kind}: colour ${o.color}; depth ${o.depth}`)))].sort();
md.push('', '## Render-pass attachments observed', '', `- BEFORE (${before.label}):`, ...ops(before).map(o => `  - ${o}`), `- AFTER (${after.label}):`, ...ops(after).map(o => `  - ${o}`));
if (off) {
  md.push('', `## AFTER with the planting switched off (${off.label}, \`plantingShared=false\`) against BEFORE`, '',
    `${offChecks.filter(c => c.equal).length} of ${offChecks.length} fixtures are identical on draws, pipelines bound, triangles and per-system draws.${offChecks.some(c => !c.equal) ? ' Differences: ' + offChecks.filter(c => !c.equal).map(c => `${c.tier} ${c.fixture} (${c.detail})`).join('; ') + '.' : ''} This isolates the planting: with it off, the MSAA discard and every kit change leave the counts of the scene exactly where BEFORE had them.`);
}
md.push('', problems.length ? `## Problems\n\n${problems.map(p => `- ${p}`).join('\n')}` : '## Problems\n\nNone: every fixture outside the drive workload differs from BEFORE in the planting system only.', '');
writeFileSync(resolve(out, 'counts-table.md'), md.join('\n'));
writeFileSync(resolve(out, 'counts-table.json'), JSON.stringify({ before: before.label, after: after.label, afterOff: off?.label ?? null, lines: lines.map(l => ({ tier: l.tier, fixture: l.fixture, note: l.note,
  main: [kind(l.before, 'main'), kind(l.after, 'main')], draws: [l.before.draws, l.after.draws], pipelinesUsed: [l.before.pipelinesUsed, l.after.pipelinesUsed], pipelineCache: [l.before.pipelineCache, l.after.pipelineCache], triangles: [l.before.triangles, l.after.triangles] })), offChecks, problems }, null, 1) + '\n');
console.log(`${lines.length} rows; ${problems.length} problems${problems.length ? '\n' + problems.join('\n') : ''}`);
process.exitCode = problems.length ? 1 : 0;
