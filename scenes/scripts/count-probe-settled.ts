// S5 (OD-9) count probe for the Farm's cached sun shadow: scripts/count-probe.ts with every probe (base, what-ifs and the
// return check) taken only once the cache has settled, so a probe never stops on a run of identical frames in which casters
// that moved during a fixture (a door, the drive, the walk) are still in the live map. A settled frame has no shadow
// pass; the static map's cost is reported separately: per fixture the static map is re-armed (test hook shadowRearm) and the
// one frame that redraws it is probed on its own. Without a cache (?shadowCache=0, minimal) it runs exactly as count-probe.
//   bun scripts/count-probe-settled.ts --label <l> [--build <label>] [--tiers …] [--fixtures all|id,…] [--what-if none|standard]
//     [--query 'k=v&…'] [--compare <baseline summary.json>]
// Output: as count-probe (records carry base.settle.frames), plus evidence/counts/<label>/farm-static-shadow.json and a section
// appended to summary.md. Counts only.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { runCountProbe, summarize } from './count-probe';
import { FARM_FIXTURES } from './scene-fixtures';

const ROOT = resolve(import.meta.dir, '..'), SETTLE_FRAMES = 900, QUIET = 45;
interface StaticRow { tier: string; fixture: string; settle: { frames: number; live: number; pending: number; unsettled?: true }; staticRender: { draws: number; triangles: number; pipelines: number; label: string } | null; live: number; stats: unknown }
const rows: StaticRow[] = [];
/**
 * Wraps the page's probe once: each probe first waits until counts().shadow.pendingSettle is 0 (or there is no cache). The
 * probe's clock is frozen and ambient life is off, and the kit ignores sub-micrometre drift, so every fixture settles; the
 * tractor coasts on the frame's own delta (its damped speed never reaches 0) for a few hundred frames after a drive. Only a
 * caster still moving after SETTLE_FRAMES falls back to the cache's counters held for QUIET frames, marked `unsettled`. (A
 * quiet run alone is not settled: the coasting tractor holds the counters still while it creeps, then settles mid-what-if,
 * review RF-3.)
 */
async function installSettle(page: Page) {
  await page.evaluate((limit, quiet) => {
    const s = (window as any).__kilnScene; if (s.__settledProbe) return; // eslint-disable-line @typescript-eslint/no-explicit-any
    const probe = s.probeFrames, settle = async () => {
      let last = '', same = 0;
      for (let i = 0; ; i++) {
        const c = s.invoke('counts')?.shadow; if (!c || c.pendingSettle === 0) return { frames: i, live: c?.liveCasters ?? 0, pending: 0 };
        const key = [c.staticRenders, c.liveCasters, c.invalidations, c.pendingSettle].join('|');
        if (key !== last) { last = key; same = 0; } else same++;
        if (i >= limit) { if (same >= quiet) return { frames: i, live: c.liveCasters, pending: c.pendingSettle, unsettled: true }; if (i >= limit + 4 * quiet) break; }
        await s.waitFrames(1);
      }
      throw new Error(`Cached shadow did not settle within ${limit} frames`);
    };
    s.__settledProbe = { probe, settle };
    s.probeFrames = async (o: unknown) => { const settled = await settle(); return { ...await probe(o), settle: settled }; };
  }, SETTLE_FRAMES, QUIET);
}
/** One static re-render: re-arm, then probe exactly the next frame with the unwrapped probe. */
async function staticRender(page: Page) {
  return page.evaluate(async () => {
    const s = (window as any).__kilnScene, w = s.__settledProbe, settled = await w.settle(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!s.invoke('shadowRearm')) return { settled, pass: null, live: 0, stats: null };
    const r = await w.probe({ frames: 1, stableFrames: 1, maxFrames: 1 }), pass = r.passes.find((p: any) => /sun static/.test(p.label)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const live = r.passes.filter((p: any) => /sun live/.test(p.label)).reduce((n: number, p: any) => n + p.draws, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
    await w.settle();
    return { settled, pass: pass ? { draws: pass.draws, triangles: pass.triangles, pipelines: pass.pipelines, label: pass.label } : null, live, stats: s.invoke('counts')?.shadow ?? null };
  });
}
for (const fixture of FARM_FIXTURES.fixtures) {
  const enter = fixture.enter;
  fixture.enter = async page => {
    const value = await enter(page); await installSettle(page);
    const tier = new URL(page.url()).searchParams.get('tier') ?? '?', r = await staticRender(page);
    rows.push({ tier, fixture: fixture.id, settle: r.settled, staticRender: r.pass, live: r.live, stats: r.stats });
    return value;
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2), option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
  const label = option('--label', ''); if (!/^[a-z0-9-]+$/.test(label)) throw new Error('--label <lowercase-label> is required');
  const fixtures = option('--fixtures', 'all'), tiers = option('--tiers', 'minimal,economy,balanced,high').split(',') as ('minimal' | 'economy' | 'balanced' | 'high')[];
  await runCountProbe({ label, build: option('--build', label), scenes: ['farm'], tiers, fixtures: fixtures === 'all' ? 'all' : fixtures.split(','), whatIfs: option('--what-if', 'standard') === 'standard',
    size: [1920, 1080], freshPage: false, ...(args.includes('--query') ? { query: Object.fromEntries(new URLSearchParams(option('--query', ''))) } : {}) });
  const dir = resolve(ROOT, 'evidence/counts', label); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'farm-static-shadow.json'), JSON.stringify({ label, rule: `Settled first (pendingSettle 0; only after ${SETTLE_FRAMES} frames, the cache's counters still for ${QUIET} frames, marked unsettled); then one re-armed static render probed alone. live = live-map draws in that frame.`, rows }, null, 1) + '\n');
  console.log(JSON.stringify(summarize(label, args.includes('--compare') ? option('--compare', '') : undefined)));
  const md = ['', '## farm · cached sun shadow: settle state and one static re-render', '',
    `Each probe waits until the cache is settled: pendingSettle 0 (the live map empty, no map armed); only a caster still moving after ${SETTLE_FRAMES} frames falls back to the cache's counters still for ${QUIET} frames (marked unsettled, live casters listed). The static map re-renders only on events (a caster settling, a re-arm); here it is re-armed once and that frame is probed alone.`, '',
    '| Tier | Fixture | Frames waited | Live casters (pending) | Static render draws | Triangles | Pipelines | Live draws that frame |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.tier} | ${r.fixture} | ${r.settle.frames} | ${r.settle.live} (${r.settle.pending})${r.settle.unsettled ? ' unsettled' : ''} | ${r.staticRender?.draws ?? '-'} | ${r.staticRender?.triangles.toLocaleString('en-US') ?? '-'} | ${r.staticRender?.pipelines ?? '-'} | ${r.live} |`), ''];
  appendFileSync(resolve(dir, 'summary.md'), md.join('\n'));
}
