// The look contact sheet for the owner (TASK-M3.md item 6, D-20): one PNG and one JSON with every look preset of the dev build,
// its captures and its frame time per tier on each device. D-18 stands: nothing here becomes a default.
//   evidence/look/contact-sheet.png   rows = presets; captures on this PC (tier high, four views) and on the tablet (tier economy,
//                                     two views); frame time p50 / p95 per tier on this PC (indicative), the tablet and the laptop
//   evidence/look/contact-sheet.json  the same numbers with their conditions (load samples, device state) and every capture path
// With --look-ab it also lays out the D-18 owner evidence (evidence/look-ab/aces-vs-neutral.png and look-ab.json).
// The sheet is laid out as a local HTML file and rendered by headless Chrome from file:// (no server, no listener).
// Usage: bun scripts/make-look-contact-sheet.ts [--pc evidence/look/pc-webgpu] [--tablet evidence/tablet-2026-09-29/look-webgpu]
//          [--tablet-webgl2 evidence/tablet-2026-09-29/look-webgl2] [--laptop evidence/perf/hub-<date>/look-webgpu] [--look-ab]
//          [--pc-captures evidence/look/pc-webgpu-fullframe] [--tablet-captures evidence/tablet-2026-09-29/look-webgpu-fullframe]
// The capture runs default to the full-frame (B-06 framing) runs when present; frame time always comes from --pc and --tablet.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome } from '../packages/scene-kit/src/testing/node';
import { FARM_AO_TIERS, FARM_LOOK_PRESETS, formatFarmLook, lookExposure, parseFarmLook } from '../packages/farm/src/look/options';

const workspace = resolve(import.meta.dir, '..'), args = process.argv.slice(2);
const option = (name: string, fallback: string | null) => { const at = args.indexOf(name); return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith('--') ? args[at + 1]! : fallback; };
const rel = (path: string) => relative(workspace, path).split(sep).join('/');
const TIERS = ['high', 'balanced', 'economy', 'minimal'] as const, SHEET_VIEWS = ['hero', 'fences', 'house-porch', 'watermill-wheel'];
const TABLET_VIEWS = ['hero', 'house-porch'], THUMB = { width: 256, height: 144 };

interface Stats { frames: number; p50: number | null; p95: number | null; p99: number | null; max: number | null; meanFps: number | null; over33ms: number; over50ms: number }
interface Run { dir: string; runs: any }
async function readRun(dir: string | null): Promise<Run | null> {
  if (!dir) return null; const path = resolve(workspace, dir, 'runs.json'); if (!existsSync(path)) return null;
  return { dir: resolve(workspace, dir), runs: JSON.parse(await readFile(path, 'utf8')) };
}
const pc = await readRun(option('--pc', 'evidence/look/pc-webgpu'));
const tablet = await readRun(option('--tablet', 'evidence/tablet-2026-09-29/look-webgpu'));
const tabletGl = await readRun(option('--tablet-webgl2', 'evidence/tablet-2026-09-29/look-webgl2'));
const laptop = await readRun(option('--laptop', null));
const firstRun = async (...dirs: string[]) => { for (const dir of dirs) { const run = await readRun(dir); if (run?.runs.captures?.length) return run; } return null; };
const pcCap = (await firstRun(option('--pc-captures', 'evidence/look/pc-webgpu-fullframe')!, option('--pc', 'evidence/look/pc-webgpu')!))!;
const tabletCap = (await firstRun(option('--tablet-captures', 'evidence/tablet-2026-09-29/look-webgpu-fullframe')!, option('--tablet', 'evidence/tablet-2026-09-29/look-webgpu')!))!;
const framingOf = (run: Run) => (run.runs.captures?.[0]?.framing as string | undefined) ?? 'the standalone page with its shell and HUD (canvas 1280 x 628)';
assert(pc && tablet, 'The sheet needs the PC and tablet look runs (runs.json)');

// Adapters: from the runs when recorded, else from the tier evidence of the same device and backend.
async function adapterFallback(device: 'pc' | 'tablet') {
  if (device === 'pc') { const r = JSON.parse(await readFile(resolve(workspace, 'evidence/m3/tiering/m3-webgpu/results.json'), 'utf8')); const text = JSON.stringify(r); const m = text.match(/"adapter":\{"vendor":"(nvidia)","architecture":"(\w+)"/);
    return { webgpu: m ? `${m[1]} / ${m[2]}` : 'nvidia / ampere', gpu: 'NVIDIA GeForce RTX 3070 (this PC, D3D12)', source: 'evidence/m3/tiering/m3-webgpu/results.json' }; }
  const t = JSON.parse(await readFile(resolve(workspace, 'evidence/tablet-2026-09-29/tier/tier-auto.json'), 'utf8'));
  const a = t.adapters;
  return { webgpu: `${a.webgpu.info.vendor} / ${a.webgpu.info.architecture}`, webgl2: a.webgl2.unmaskedRenderer, gpu: 'Mali-G68 (Galaxy Tab S9 FE, SM-X518U)', source: 'evidence/tablet-2026-09-29/tier/tier-auto.json' };
}
const adapters = { pc: await adapterFallback('pc'), tablet: await adapterFallback('tablet') };

function frameTable(run: Run | null) {
  const table: Record<string, Record<string, Stats & { tierState?: unknown }>> = {}, blocks: Record<string, unknown> = {};
  for (const block of run?.runs.frames ?? []) {
    blocks[block.tier] = { canvas: block.canvas, adapter: block.adapter ?? null, before: block.before, after: block.after, messages: block.messages };
    for (const row of block.rows) (table[row.preset] ??= {})[block.tier] = { ...row.stats, tierState: row.tierState };
  }
  return { table, blocks };
}
const frames = { pc: frameTable(pc), tablet: frameTable(tablet), tabletWebgl2: frameTable(tabletGl), laptop: frameTable(laptop) };
function shotsOf(run: Run | null, tier: string) {
  const out: Record<string, Record<string, string>> = {};
  for (const block of run?.runs.captures ?? []) if (block.tier === tier) for (const shot of block.shots) (out[shot.preset] ??= {})[shot.view] = resolve(run!.dir, shot.file);
  return out;
}
const pcShots = shotsOf(pcCap, 'high'), pcEconomyShots = shotsOf(pcCap, 'economy'), tabletShots = shotsOf(tabletCap, 'economy');
const presets = Object.keys(FARM_LOOK_PRESETS);
const describe = (preset: string) => {
  const o = parseFarmLook(preset), parts = [o.aa === 'msaa' ? 'MSAA 4x (renderer)' : o.aa === 'none' ? 'no AA' : o.aa.toUpperCase()];
  if (o.ao) parts.push('GTAO (half res)'); if (o.bloom) parts.push('emissive-only bloom'); if (o.vignette) parts.push('vignette'); if (o.grading) parts.push('grade');
  parts.push(o.tone === 'aces' ? `ACES ${lookExposure(o)}` : `Neutral ${lookExposure(o)} (matched)`);
  return parts.join(', ');
};
const ms = (v: number | null | undefined) => v === null || v === undefined ? '–' : v >= 100 ? v.toFixed(0) : v.toFixed(1);
function cell(device: keyof typeof frames, preset: string, tier: string) {
  const s = frames[device].table[preset]?.[tier], base = frames[device].table.default?.[tier];
  if (!s) return { text: '', delta: null };
  const delta = preset !== 'default' && s.p50 !== null && base?.p50 !== null && base?.p50 !== undefined ? Math.round((s.p50 - base.p50) * 10) / 10 : null;
  return { text: `${ms(s.p50)} / ${ms(s.p95)}`, delta };
}
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const img = (file: string | undefined, label: string) => file && existsSync(file) ? `<img src="${pathToFileURL(file).href}" width="${THUMB.width}" height="${THUMB.height}" alt="${esc(label)}">` : `<div class="missing">${esc(label)}<br>not captured</div>`;

const pcLoads = (pc.runs.frames ?? []).map((b: any) => [b.tier, b.before?.cpuTotalPercent, b.before?.gpu3dPercent, b.after?.cpuTotalPercent, b.after?.gpu3dPercent]);
const loadText = pcLoads.map(([tier, c0, g0, c1, g1]: any[]) => `${tier} ${c0 ?? '?'}/${g0 ?? '?'} → ${c1 ?? '?'}/${g1 ?? '?'}`).join('; ');
const tabletBlocks = (tablet.runs.frames ?? []) as any[];
const tabletState = (state: any) => state ? `battery ${state.battery.level} % ${state.battery.temperatureC} °C, AP ${state.thermal.temperaturesC.AP ?? '?'} °C, thermal ${state.thermal.name}, brightness ${state.screen.brightness} (${state.screen.brightnessMode}), ${state.display.renderFrameRate} Hz` : '?';
const tabletText = tabletBlocks.map(b => `${b.tier}: ${tabletState(b.before)} → ${tabletState(b.after)}`).join('<br>');
const deviceRows = [['PC*', 'pc'], ['Tablet', 'tablet'], ...(tabletGl ? [['Tablet GL2', 'tabletWebgl2']] : []), ['Laptop', 'laptop']] as const;
const numbers = (preset: string) => `<table class="nums"><tr><th></th>${TIERS.map(t => `<th>${t}</th>`).join('')}</tr>${deviceRows.map(([name, key]) => {
  if (key === 'laptop' && !laptop) return `<tr><td class="dev">${name}</td><td colspan="4" class="pending">pending: hub kit step 6 (coordinator)</td></tr>`;
  return `<tr><td class="dev">${name}</td>${TIERS.map(t => { const c = cell(key, preset, t); const aoOff = parseFarmLook(preset).ao && !FARM_AO_TIERS.includes(t);
    return `<td>${c.text || '·'}${c.delta !== null ? `<span class="${c.delta > .5 ? 'up' : c.delta < -.5 ? 'down' : 'flat'}"> ${c.delta > 0 ? '+' : ''}${c.delta}</span>` : ''}${aoOff && c.text ? '<sup>ao off</sup>' : ''}</td>`; }).join('')}</tr>`; }).join('')}</table>`;

const title = 'Farm look options: contact sheet (M3 exploration)';
const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 16px; font: 13px/1.35 system-ui, Segoe UI, Arial, sans-serif; color: #111; background: #fff; }
h1 { font-size: 20px; margin: 0 0 6px; } p { margin: 2px 0; max-width: 2200px; } .small { color: #444; font-size: 12px; }
table.sheet { border-collapse: collapse; margin-top: 10px; } table.sheet > tbody > tr > td, table.sheet > thead > tr > th { border-bottom: 1px solid #ccc; padding: 4px; vertical-align: top; }
table.sheet th { text-align: left; font-size: 12px; background: #f3f3f3; } .label { width: 190px; } .label b { font-size: 15px; } .label div { color: #333; font-size: 12px; margin-top: 3px; }
img { display: block; } .gap { width: 10px; border-bottom: none !important; } .missing { width: ${THUMB.width}px; height: ${THUMB.height}px; background: #eee; color: #777; font-size: 11px; display: flex; align-items: center; justify-content: center; text-align: center; }
table.nums { border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; } table.nums th { background: none; font-weight: 600; padding: 1px 6px; text-align: right; } table.nums td { padding: 1px 6px; text-align: right; white-space: nowrap; }
td.dev { text-align: left !important; font-weight: 600; } td.pending { color: #777; text-align: left !important; } .up { color: #b00020; } .down { color: #0a7a2f; } .flat { color: #666; } sup { color: #666; font-size: 9px; }
</style></head><body>
<h1>${title}</h1>
<p>Dev build <b>${esc(String(pc.runs.root))}</b> (r34 pack), switched at runtime through <code>setLook</code>. <b>D-18 stands: the default look (ACES .95, MSAA) does not change; nothing here becomes a default.</b> Vignette and grade are off by default; AO is off on the economy and minimal tiers (the tablet tiers).</p>
<p>Captures: 1280 × 720 at DPR 1, frozen clock at time 0, ambient off, JPEG; framing: ${esc(framingOf(pcCap))}. PC: tier high, ${pcCap.runs.backend}, build ${esc(String(pcCap.runs.root))}. Tablet: tier economy (its WebGPU tier), ${tabletCap.runs.backend}, build ${esc(String(tabletCap.runs.root))}, same framing through a device-metrics override. Frame time was measured on the m3 dev build before the one-string revert of 20:05, whose code is otherwise byte-identical (evidence/build/m3/revert-tractor-touch-diff.json).</p>
<p>Frame time: p50 / p95 of requestAnimationFrame intervals in ms during the living-orbit workload, governor held, per preset after its pipeline is built and warmed (${pc.runs.warmupMs} ms warm-up; samples ${pc.runs.sampleMs} ms PC, ${tablet.runs.sampleMs} ms tablet); coloured figure = p50 change against the default at the same tier (red slower, green faster, grey within .5 ms). Frame time runs on the standalone page with its shell (PC viewport 1280 × 720, canvas 1280 × 628 CSS; tablet its own 823 × 1142 CSS viewport at DPR 1.75), drawing buffer at each tier's render scale (contact-sheet.json, devices.*.blocks). Tablet intervals are whole vsyncs (16.6 ms steps) and each cell is one sample, so a difference of one vsync between neighbouring cells is within its spread.</p>
<p class="small"><b>*PC = this PC: INDICATIVE ONLY</b> (shared ${esc(adapters.pc.gpu)}, WebGPU adapter ${esc(adapters.pc.webgpu)}; headless, frame pacing uncapped; other agents working; load CPU %/GPU 3D % before → after per tier block: ${esc(loadText)}). It settles no budget and no look.</p>
<p class="small"><b>Tablet</b> = ${esc(adapters.tablet.gpu)}, WebGPU adapter ${esc(adapters.tablet.webgpu)}${adapters.tablet.webgl2 ? `, WebGL2 ${esc(adapters.tablet.webgl2)}` : ''}; its own frame time, vsync-bound at the panel rate; device state before → after each tier block:<br>${tabletText}</p>
<p class="small"><b>Laptop</b> = the hub: ${laptop ? 'from the hub kit results' : 'not run here (the hub is off limits to this builder); the hub kit carries the dev build and runner/look-farm.mjs (README step 6) for the coordinator'}.</p>
<table class="sheet"><thead><tr><th>Preset</th>${SHEET_VIEWS.map(v => `<th>PC, high: ${v}</th>`).join('')}<th class="gap"></th>${TABLET_VIEWS.map(v => `<th>Tablet, economy: ${v}</th>`).join('')}<th>Frame time p50 / p95 ms (change in p50 against default)</th></tr></thead><tbody>
${presets.map(preset => `<tr><td class="label"><b>${esc(preset)}</b><div>${esc(describe(preset))}</div></td>${SHEET_VIEWS.map(v => `<td>${img(pcShots[preset]?.[v], `${preset} ${v}`)}</td>`).join('')}<td class="gap"></td>${TABLET_VIEWS.map(v => `<td>${img(tabletShots[preset]?.[v], `${preset} ${v}`)}</td>`).join('')}<td>${numbers(preset)}</td></tr>`).join('\n')}
</tbody></table>
<p class="small">Full-size captures: ${esc(rel(resolve(pcCap.dir, 'captures')))} (tier high: every named view; tier economy: the four sheet views) and ${esc(rel(resolve(tabletCap.dir, 'captures')))}. Numbers and conditions: evidence/look/contact-sheet.json.</p>
</body></html>`;

async function render(htmlText: string, htmlPath: string, pngPath: string, width: number) {
  await mkdir(resolve(workspace, '.tmp/contact-sheet'), { recursive: true }); await writeFile(htmlPath, htmlText);
  const browser = await launchChrome({ workspace, name: 'sheet', windowSize: [width, 1200] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0), { timeout: 120_000 });
    await page.screenshot({ path: pngPath as `${string}.png`, type: 'png', fullPage: true });
  } finally { await browser.close(); }
}
const outDir = resolve(workspace, 'evidence/look'); await mkdir(outDir, { recursive: true });
const sheetWidth = 190 + 4 * (THUMB.width + 9) + 10 + 2 * (THUMB.width + 9) + 470 + 32;
await render(html, resolve(workspace, '.tmp/contact-sheet/sheet.html'), resolve(outDir, 'contact-sheet.png'), sheetWidth);

const json = {
  schema: 'kiln.farm-look-contact-sheet/1', date: new Date().toISOString(), build: pc.runs.root, rule: 'D-18 stands; D-20 exploration; nothing becomes a default',
  image: 'evidence/look/contact-sheet.png', views: { pc: { tier: 'high', views: SHEET_VIEWS }, tablet: { tier: 'economy', views: TABLET_VIEWS } },
  captureRuns: { pc: { runs: rel(resolve(pcCap.dir, 'runs.json')), build: pcCap.runs.root, framing: framingOf(pcCap) }, tablet: { runs: rel(resolve(tabletCap.dir, 'runs.json')), build: tabletCap.runs.root, framing: framingOf(tabletCap) } },
  frameTimeBuild: 'the m3 dev build before the one-string revert (tractorTouch), otherwise byte-identical: evidence/build/m3/revert-tractor-touch-diff.json',
  method: { frameTime: 'requestAnimationFrame intervals during living-orbit, governor held with an empty synthetic trace, per preset after its pipeline is built (lookState active) and a warm-up', percentile: 'nearest-rank', capture: '1280 x 720, DPR 1, frozen clock at time 0, ambient off' },
  devices: {
    pc: { role: 'INDICATIVE ONLY (TASK.md): shared PC, other agents working', adapter: adapters.pc, runs: rel(resolve(pc.dir, 'runs.json')), backend: pc.runs.backend, browser: pc.runs.browser, pacing: 'uncapped (--disable-gpu-vsync --disable-frame-rate-limit), headless, 1280 x 720', blocks: frames.pc.blocks },
    tablet: { role: "the tablet's own frame time, valid with its device state", adapter: adapters.tablet, runs: rel(resolve(tablet.dir, 'runs.json')), backend: tablet.runs.backend, browser: tablet.runs.browser, pacing: 'vsync-bound at the panel rate; its own viewport', blocks: frames.tablet.blocks,
      ...(tabletGl ? { webgl2: { runs: rel(resolve(tabletGl.dir, 'runs.json')), blocks: frames.tabletWebgl2.blocks } } : {}) },
    laptop: laptop ? { runs: rel(resolve(laptop.dir, 'runs.json')), backend: laptop.runs.backend, blocks: frames.laptop.blocks } : { status: 'pending', how: 'packages/farm/dist/hub-kit README step 6 (node runner/look-farm.mjs --target hub ...), results copied back to evidence/perf/hub-<date>/look-<backend>, then rerun this script with --laptop' },
  },
  options: Object.fromEntries(presets.map(preset => [preset, {
    requested: formatFarmLook(parseFarmLook(preset)), description: describe(preset), aoOffTiers: parseFarmLook(preset).ao ? TIERS.filter(t => !FARM_AO_TIERS.includes(t)) : [],
    frameTime: Object.fromEntries((['pc', 'tablet', 'tabletWebgl2', 'laptop'] as const).filter(d => Object.keys(frames[d].table).length).map(d => [d, Object.fromEntries(TIERS.filter(t => frames[d].table[preset]?.[t]).map(t => [t, { ...frames[d].table[preset]![t], p50DeltaAgainstDefault: cell(d, preset, t).delta }]))])),
    captures: { pcHigh: Object.fromEntries(Object.entries(pcShots[preset] ?? {}).map(([v, f]) => [v, rel(f)])), pcEconomy: Object.fromEntries(Object.entries(pcEconomyShots[preset] ?? {}).map(([v, f]) => [v, rel(f)])), tabletEconomy: Object.fromEntries(Object.entries(tabletShots[preset] ?? {}).map(([v, f]) => [v, rel(f)])) },
  }])),
};
await writeFile(resolve(outDir, 'contact-sheet.json'), JSON.stringify(json, null, 2) + '\n');
console.log(JSON.stringify({ png: 'evidence/look/contact-sheet.png', json: 'evidence/look/contact-sheet.json', presets: presets.length, pcTiers: Object.keys(frames.pc.blocks), tabletTiers: Object.keys(frames.tablet.blocks), laptop: !!laptop }));

// D-18 owner evidence: ACES .95 against Neutral at matched exposure, hero and the two most saturated daylight views.
if (args.includes('--look-ab')) {
  const selection = JSON.parse(await readFile(resolve(workspace, 'evidence/look-ab/view-selection.json'), 'utf8')) as { picks: string[] };
  const backends = ['webgpu', 'webgl2'].filter(b => existsSync(resolve(workspace, `evidence/look-ab/pc-${b}/runs.json`)));
  assert(backends.length, 'Run the look-ab captures first (evidence/look-ab/pc-<backend>/runs.json)');
  const ab: Record<string, unknown> = { schema: 'kiln.farm-look-ab/1', date: new Date().toISOString(), rule: 'D-18: three Farm views, ACES and Neutral at matched exposure; the owner decides; the default does not change',
    exposures: { aces: lookExposure(parseFarmLook('default')), neutral: lookExposure(parseFarmLook('neutral')), matching: '18 % grey maps to the same display value (matchedNeutralExposure)' }, views: selection.picks, selection: 'evidence/look-ab/view-selection.json', backends: {} };
  const big = { width: 640, height: 360 };
  for (const backend of backends) {
    const run = (await readRun(`evidence/look-ab/pc-${backend}`))!, shots = shotsOf(run, 'high');
    (ab.backends as Record<string, unknown>)[backend] = { runs: rel(resolve(run.dir, 'runs.json')), framing: framingOf(run), forced: backend === 'webgl2' ? '?backend=webgl2 (B-02)' : null, aces: Object.fromEntries(selection.picks.map(v => [v, shots.default?.[v] ? rel(shots.default[v]!) : null])), neutral: Object.fromEntries(selection.picks.map(v => [v, shots.neutral?.[v] ? rel(shots.neutral[v]!) : null])) };
    const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>body { margin: 16px; font: 13px/1.35 system-ui, Segoe UI, Arial, sans-serif; color: #111; background: #fff; } h1 { font-size: 18px; margin: 0 0 6px; } td, th { padding: 4px; vertical-align: top; text-align: left; } img { display: block; }</style></head><body>
<h1>Farm D-18 look A/B (${backend}): ACES Filmic at ${lookExposure(parseFarmLook('default'))} against Khronos PBR Neutral at ${lookExposure(parseFarmLook('neutral'))} (matched: 18 % grey maps to the same display value)</h1>
<p>Dev build ${esc(String(run.runs.root))}, tier high, 1280 × 720 at DPR 1 (shown at half size), frozen clock at time 0, ambient off, PNG. Views: hero and the two daylight views with the most saturated pixels (evidence/look-ab/view-selection.json). Framing: ${esc(framingOf(run))}.${backend === 'webgl2' ? ' WebGL2 is forced with ?backend=webgl2 (the flag B-02 qualifies).' : ''} The default stays ACES (D-18); the owner decides.</p>
<table><tr><th></th><th>ACES Filmic ${lookExposure(parseFarmLook('default'))} (current default)</th><th>Neutral ${lookExposure(parseFarmLook('neutral'))}</th></tr>
${selection.picks.map(v => `<tr><th>${esc(v)}</th><td>${img(shots.default?.[v], `aces ${v}`).replace(`width="${THUMB.width}" height="${THUMB.height}"`, `width="${big.width}" height="${big.height}"`)}</td><td>${img(shots.neutral?.[v], `neutral ${v}`).replace(`width="${THUMB.width}" height="${THUMB.height}"`, `width="${big.width}" height="${big.height}"`)}</td></tr>`).join('\n')}
</table></body></html>`;
    await render(pageHtml, resolve(workspace, `.tmp/contact-sheet/look-ab-${backend}.html`), resolve(workspace, `evidence/look-ab/aces-vs-neutral-${backend}.png`), 2 * big.width + 160);
  }
  await writeFile(resolve(workspace, 'evidence/look-ab/look-ab.json'), JSON.stringify(ab, null, 2) + '\n');
  console.log(JSON.stringify({ lookAb: backends.map(b => `evidence/look-ab/aces-vs-neutral-${b}.png`) }));
}
await rm(resolve(workspace, '.tmp/contact-sheet'), { recursive: true, force: true });
