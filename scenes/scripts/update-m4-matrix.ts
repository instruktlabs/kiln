// M4 rows of the acceptance matrix (TASK-M4.md deliverables; SPEC 24 M4 hardening and delivery). Idempotent:
//   append   rows that M4 re-ran keep their reason up to the marker below and get the M4 sentence after it; the M4
//            evidence comes first and the earlier evidence stays (deduplicated);
//   replace  rows whose state or meaning changes in M4 are replaced whole (their subject kept);
//   patch    single fields set on a row, its reason untouched.
// Every evidence path must exist; the summary is recounted from the rows. Then `scripts/render-report-matrix.ts`
// regenerates REPORT.md's matrix section. Timing from this PC is indicative only and never decides a row.
// Usage: bun scripts/update-m4-matrix.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..'), path = resolve(root, 'evidence/acceptance-matrix.json');
const matrix = JSON.parse(await readFile(path, 'utf8')) as { date: string; notes?: string; summary: Record<string, Record<string, number>>; checks: any[] };
const MARK = ' M4 (round 6): ', recorded = 'M4 (round 6)';
const T = 'evidence/tablet-2026-09-30';
const contract = ['evidence/m4/contract/r34-auto-m4/browser-results.json', 'evidence/m4/contract/r34-webgl2-m4/browser-results.json'];
const play = ['evidence/m4/play/m4-webgpu/results.json', 'evidence/m4/play/m4-webgl2/results.json'];
const tiering = ['evidence/m4/tiering/m4-webgpu/results.json', 'evidence/m4/tiering/m4-webgl2/results.json'];
const b09 = ['evidence/m4/b09/m4-webgpu/results.json', 'evidence/m4/b09/m4-webgl2/results.json'];
const tabletTier = [`${T}/tier/tier-auto.json`, `${T}/tier/tier-webgl2.json`];
const soak = [`${T}/soak/assigned-living-orbit.json`, `${T}/soak/high-living-orbit.json`, `${T}/soak/assigned-living-route.json`, `${T}/soak/assigned-tractor-drive.json`];
const m3Soak = ['evidence/tablet-2026-09-29/soak/assigned-living-orbit.json', 'evidence/tablet-2026-09-29/soak/high-living-orbit.json', 'evidence/tablet-2026-09-29/soak/assigned-living-route.json', 'evidence/tablet-2026-09-29/soak/assigned-tractor-drive.json'];
const hitches = ['evidence/m4/hitches/README.md', 'evidence/m4/hitches/attribution.json'];
const x04 = ['evidence/m4/x04/m4/summary-cold.json', 'evidence/m4/x04/m4/summary-warm.json'];
const hubKit = ['evidence/m4/hub-kit-README.txt', 'evidence/m4/hub-kit-MANIFEST.json'];
const hubM3 = ['evidence/perf/hub-2026-09-29/README.txt', 'evidence/perf/hub-2026-09-29/results/comparison.json'];
const unit = 'evidence/m4/unit-full.log', quality = 'packages/scene-kit/tests/quality/quality.test.ts';
const build = ['evidence/build/m4/bundle-r34-public.json', 'evidence/build/m4/bundle-r34-test.json', 'evidence/build/m4/bundle-r34-dev.json'];

// Results of the M4 runs, filled from their evidence files (checked below where a file states them).
const R = {
  b05: { auto: '+1.684 %', webgl2: '+1.603 %' },
  x11: "Recorded on the m4 outputs (bytes only, no timing; headless 1920 × 1080, Chrome 154): the staged r34 pack is 34 files of 7,326,021 B and its 23 GLBs 7,098,444 B (SPEC's 7,070,552 B is the r33 pack's, which stays staged); the public m4 chunk is 1,581,284 B / 462,421 B gzip, 91.30 % / 91.36 % of the Farm's D-15 ceiling (1,732,040 B / 506,143 B). Before onReady the public page fetches 29 requests with 8,906,023 B of bodies (page 1,858, code 1,581,284, JSON 56,437, GLBs 7,098,444, grass binary 168,000; 8,914,723 B with headers) and nothing after onReady; the test build fetches the same 29 requests (8,918,214 B; its chunk is 12,191 B larger) at every tier on both backends, and nothing after onReady. In the site's resolution without the kit's three facade alias the chunk would be 1,934,965 B / 546,755 B (111.72 % / 108.02 % of the ceiling); the remedy is the site's three alias, which TASK-M4 leaves to the site round.",
  x12: "1,000 frames each of living-orbit and walking on the m4 test build (WebGPU and forced WebGL2, tiers high and minimal, headless 1920 × 1080), a forced collection (CDP HeapProfiler.collectGarbage) before and after, Runtime.getHeapUsage: used-heap growth 0.074 to 0.172 MB in all 8 cases (WebGPU high orbit 0.170 and walk 0.097, minimal 0.151 and 0.091; WebGL2 high 0.172 and 0.074, minimal 0.111 and 0.080), each with the camera moving, Rowan walking on foot and the tier held; limit 2 MB. Where the per-frame allocation is made (HeapProfiler sampling, collected objects included) is recorded beside it as a diagnostic, not a rule.",
  x12Status: 'pass' as 'pass' | 'fail',
  tabletTier: "on the real tablet (m4, 2026-09-30) the classification from its own adapter strings now assigns minimal on WebGPU (vendor arm, architecture valhall; reason 'Mali-G68 class on WebGPU (X-07)') and minimal on WebGL2 (ANGLE Mali-G68, D-03), as predicted; the M3 result (economy on WebGPU) is retained for the old rule.",
  x07: "Owner decision 2026-09-29 22:10 (D-25, FARM-007): the Tab S9 FE class starts on minimal on WebGPU, its WebGL2 tier, so SPEC 20.2's tablet target (30 FPS or better with p95 under 33.3 ms in orbit and in play, no task over 100 ms after ready) applies at minimal; SPEC 20.2's table still names economy as the expected tier. Measured on the owner's tablet with the m4 build at its assigned tier (minimal, WebGPU; the tablet's own frame intervals, valid with its device state: thermal status none, battery 93 to 92 % while charging, AP 34.5 to 39.1 °C): living-orbit 210 s at 59.2 FPS, p95 17.3 ms; living-route 60 s at 60.2 FPS, p95 17.5 ms; tractor-drive 60 s at 60.2 FPS, p95 17.2 ms; no task over 100 ms after ready and no frame over 100 ms; 2, 0 and 0 frames over 50 ms (longest 91.6, 33.9 and 31.3 ms). The M3 result at economy (orbit 30.2 FPS, p95 49.8 ms; failed) is retained. The pilot's tablet numbers (34.2 FPS orbit, 44.7 route, 83 ms worst gap) were recorded in an earlier session.",
  x07Status: 'pass' as 'pass' | 'fail' | 'deferred',
  x10: 'On the tablet with the m4 build (2026-09-30) the assigned-tier soaks (minimal: 210 s of orbit, 60 s each of route and drive) make 0 changes, and forced high now steps down below 20 FPS: 3 changes in 210 s (0.86 a minute), 1 reversal and 1 lock, within X-10 (at most 4 changes a minute and one lock a session); in M3 the same forced-high soak made 0 changes.',
  x10Status: 'pass' as 'pass' | 'fail',
};
for (const [key, value] of Object.entries(R)) assert(typeof value === 'object' ? Object.values(value).every(v => v !== '__') : value !== '__', `R.${key} is not filled`);

type Row = { status: 'pass' | 'fail' | 'deferred'; reason: string; evidence: string[]; deferredPortion?: string; scope?: string; acceptedUnder?: string };
const append: Record<string, { text: string; evidence: string[] }> = {
  'P-01': { text: 'B-01 passes on the m4 outputs on both profiles. Since M4 the scene compiles every pipeline of its first complete frame before onReady, behind the loading screen (SPEC 6.4 and 5.2(3) as amended by the owner on 2026-09-29 at 22:05, D-23): no program or pipeline is created after ready in any m4 hitch or X-04 run. X-04 now measures the first stable frame (D-23) and waits for the coordinator\'s hub run of the m4 kit (see X-04).', evidence: [...contract, ...hitches, ...x04] },
  'P-15': { text: 'FARM-006 (a dynamic batch is rewritten and re-bounded only when a source moved), static usage for the Farm\'s dynamic batches and instance matrices read as instanced attributes (three\'s documented onNodeBuilderCreated hook) cut the programs on minimal from 178 to 26 and the buffer uploads from 924,752 to 336 bytes a frame; the look A/B against three\'s per-mesh uniform path passes (13 of 24 view and backend pairs pixel-identical, the other 11 within 80 pixels by one level, B-06 tile metric).', evidence: ['evidence/m4/instance-ab/result.json', ...hitches, 'KIT-REQUESTS.md', unit] },
  'P-16': { text: `X-07 (owner decision 2026-09-29 22:10, FARM-007): a phone or tablet on WebGPU whose adapter names a Mali-G5x or G6x, or names no Mali model with vendor arm and architecture valhall, starts on minimal, its WebGL2 tier; the kit's regression test and the Farm tier tests pass, B-10 on m4 passes on both backends with the Tab S9 FE profile now expecting minimal, and ${R.tabletTier}`, evidence: [...tiering, ...tabletTier, quality, unit] },
  'P-17': { text: 'B-05 teardown and B-11 pause-when-hidden pass on the m4 outputs on both profiles.', evidence: contract },
  'P-31': { text: `B-05 passes on the m4 outputs on both profiles (heap growth after forced GC ${R.b05.auto} default-backend, ${R.b05.webgl2} forced WebGL2).`, evidence: contract },
  'P-32': { text: 'B-09 with touch emulation passes on the m4 outputs on both backends; the tablet flows were not repeated (M4 changed no input path).', evidence: b09 },
  'P-33': { text: `U-15 and U-16 pass with the X-07 classification case and the three FARM-004 governor cases; B-10 and B-13 pass on m4 on both backends. ${R.x10}`, evidence: [...tiering, ...soak, quality, unit] },
  'P-34': { text: 'B-11 and B-12 pass on the m4 outputs on both profiles, and the touch HUD checks of B-09 pass on m4 with emulation.', evidence: [...contract, ...b09, 'evidence/m4/hygiene-m4.log'] },
  'P-35': { text: 'B-11 passes on the m4 outputs on both profiles.', evidence: contract },
  'U-15': { text: 'the X-07 case (Tab S9 FE class on WebGPU starts on minimal; learned tiers never lift it; explicit props win; a table without minimal keeps the earlier result) passes in the kit\'s quality tests, with the Farm tier tests.', evidence: [quality, 'packages/farm/tests/unit/tiers.test.ts', unit] },
  'U-16': { text: 'FARM-004: the governor evaluates once its window holds 60 samples or has spanned windowMs; the three new cases (a sub-20 FPS device steps down, reverts and locks, and advises a lower tier) failed on the 60-sample rule and pass; B-10 on m4 replays the traces.', evidence: [quality, ...tiering, unit] },
  'B-05': { text: `m4 outputs, attempt 1: heap growth after forced GC ${R.b05.auto} (default backend) and ${R.b05.webgl2} (forced WebGL2); one C-03 listener retained.`, evidence: contract },
  'B-08': { text: '24 of 24 steps on the m4 outputs on WebGPU and forced WebGL2, colliders equal to the sealed r34 fixture.', evidence: [...play, 'packages/farm/fixtures/play-colliders-r34.json'] },
  'B-09': { text: 'm4 outputs with touch emulation on both backends: every step passes.', evidence: b09 },
  'B-10': { text: 'm4 outputs on both backends; the Tab S9 FE profile now expects minimal on WebGPU (X-07).', evidence: tiering },
  'B-11': { text: 'the m4 outputs on both profiles.', evidence: contract },
  'B-12': { text: 'the m4 outputs on both profiles; the public m4 output passes the bundle hygiene check.', evidence: [...contract, 'evidence/m4/hygiene-m4.log'] },
  'B-13': { text: 'm4 outputs on both backends.', evidence: tiering },
  'B-14': { text: "the Farm consumer's check belongs to the site round (TASK-M4.md: the site's three alias and island check are not M4), so check:site-compat was not re-run (it re-checks the kit demo consumer and would overwrite this row's M1 evidence). The m4 public chunk built with the site's resolution (without the kit's three facade alias) is 1,934,965 B / 546,755 B gzip, 111.72 % / 108.02 % of the Farm ceiling, because three.module.js joins three/webgpu (+353,681 B / +84,334 B gzip); the Farm's own build has one three.", evidence: ['evidence/build/m4/three-double-import.json'] },
  'X-03': { text: `B-05 on the m4 outputs: ${R.b05.auto} (default backend), ${R.b05.webgl2} (forced WebGL2), under 5 %.`, evidence: contract },
};
const replace: Record<string, Row> = {
  'X-04': { status: 'deferred', reason: `Redefined by the owner on 2026-09-29 at 22:05 (D-23; SPEC 6.4 and 5.2(3) amended): the time to the first stable frame (the first frame from the ready frame on with no shader, program or pipeline creation, no asynchronous creation in flight and at most 50 ms) for both scenes, rewrite median within 120 % of the pilot's per backend and cache state, every WebGL2 rewrite run at most 45 s. The m4 rewrite compiles before ready (warm pass) and the hub kit and this PC's runner measure the new moment; the ready and declared moments stay as extra columns (x04Ready, x04Declared). The M3 hub result measured the old moment (WebGPU cold 1.316, warm 1.373; WebGL2 1.004 and 1.020) and is retained. On this PC (indicative only, 3 runs each, load 2 to 18 % CPU): first stable frame rewrite / pilot cold WebGPU 3,366 / 7,179 ms (0.469), cold WebGL2 4,158 / 19,453 ms (0.214), warm WebGPU 3,000 / 2,896 ms (1.036), warm WebGL2 3,445 / 3,466 ms (0.994); the pilot creates its pipelines in its ready frame. Deferred to the coordinator's hub run of kit steps 3 and 4.`,
    evidence: [...x04, ...hubKit, ...hubM3, 'evidence/perf/x04-attempt/README.txt'] },
  'X-05': { status: 'deferred', reason: 'The m4 hub kit carries SPEC X-05 as its step 5: tiers high, balanced and economy, both backends, workloads living-orbit, living-route, walk and tractor-drive, 60 s of sampling after a 5 s warm-up, 5 runs; compare reports each case\'s median and range, SPEC 20.2\'s 60 FPS target per tier and the M4 proposed hitch rule (per 60 s run at every tier: 0 frames over 100 ms, 0 over 50 ms, longest at most 50 ms; not adopted). The M3 hub per-tier runs (30 s, 3 runs, no walk) are retained: no frame over 50 ms outside the minimal tier\'s first-sample compile stalls, which the M4 warm pass removes. Deferred to the coordinator\'s hub run and decision on the rule.',
    evidence: [...hubKit, ...hitches, ...hubM3, 'evidence/perf/hub-2026-09-29/results/tiers'] },
  'X-07': { status: R.x07Status, reason: R.x07, evidence: [...soak, ...tabletTier, ...m3Soak], deferredPortion: 'a same-session pilot run on the tablet (the pilot\'s numbers were recorded earlier)' },
  'X-10': { status: R.x10Status, reason: `FARM-004 is done (the governor evaluates on 60 samples or a spanned window). ${R.x10}`, evidence: [...soak, ...m3Soak, 'KIT-REQUESTS.md'], deferredPortion: 'the phone (no device)' },
  'X-11': { status: 'pass', reason: R.x11, evidence: ['evidence/m4/x11-bytes.json', ...build, 'evidence/build/m4/three-double-import.json', 'evidence/m2/staging/README.md'] },
  'X-12': { status: R.x12Status, reason: R.x12, evidence: ['evidence/m4/x12-allocation.json', 'evidence/m4/x12-allocation-sites.json'] },
};
const patch: Record<string, Record<string, unknown>> = {
  'X-01': { deferredPortion: 'the m4 build on the hub (the rebuilt kit, evidence/m4/hub-kit-README.txt; M4 adds the warm pass and the instanced-attribute path, so the coordinator\'s re-run of kit step 2 measures them)' },
};

const at = (id: string) => { const index = matrix.checks.findIndex(check => check.id === id); assert(index >= 0, `Unknown matrix id ${id}`); return index; };
const exists = (id: string, files: string[]) => { for (const file of files) assert(existsSync(resolve(root, file)), `Missing evidence ${file} for ${id}`); };
for (const [id, add] of Object.entries(append)) {
  exists(id, add.evidence);
  const i = at(id), row = matrix.checks[i], base = String(row.reason ?? '').split(MARK)[0]!.trimEnd();
  const evidence = [...new Set([...add.evidence, ...[row.evidence].flat().filter((e: unknown): e is string => typeof e === 'string')])];
  const stop = /[.;:!?)]$/.test(base) ? '' : '.'; // a reason without a closing stop gets one before the M4 sentence
  matrix.checks[i] = { ...row, reason: `${base}${stop}${MARK}${add.text}`, evidence, recorded };
}
for (const [id, row] of Object.entries(replace)) {
  exists(id, row.evidence);
  const i = at(id); matrix.checks[i] = { id, subject: matrix.checks[i].subject, ...row, recorded };
}
for (const [id, fields] of Object.entries(patch)) { const i = at(id); matrix.checks[i] = { ...matrix.checks[i], ...fields, recorded }; }
const summary: Record<string, Record<string, number>> = {};
for (const check of matrix.checks) { const family = String(check.id).split('-')[0]!; (summary[family] ??= { pass: 0, fail: 0, deferred: 0 })[check.status as 'pass' | 'fail' | 'deferred']++; }
matrix.summary = summary; matrix.date = '2026-09-30';
matrix.notes = 'B-00 counts as eight subchecks and suffixed U ids count separately. The one B failure is the M0 B-00e defect with its required Z4 fallback. P-28 is page-owned. P-31 to P-35 are the M3 exit (SPEC 24) and pass. M4 (round 6) re-ran the counted checks on the m4 outputs and records X-11 and X-12; X-04 was redefined by the owner (D-23) and waits, with X-01 and X-05, for the coordinator\'s hub run of the m4 kit. Rows accepted under D-20 pass on the evidence gathered when the owner closed M2 as the record, and name the portion that evidence does not cover. Timing from the builder\'s PC is indicative only and decides no row.';
await writeFile(path, JSON.stringify(matrix, null, 2) + '\n');
console.log(JSON.stringify({ appended: Object.keys(append), replaced: Object.keys(replace), patched: Object.keys(patch), summary }));
