// Records the M2 result in evidence/acceptance-matrix.json (SPEC 25 item 2) under owner direction D-20:
// every status names its evidence, every evidence path must exist, and the family summary is recomputed.
// Ids not listed here keep their earlier entries unchanged.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..'), file = resolve(root, 'evidence/acceptance-matrix.json');
const matrix = JSON.parse(await readFile(file, 'utf8')) as { date: string; summary: Record<string, Record<string, number>>; checks: Record<string, unknown>[] } & Record<string, unknown>;

const contract = ['r33-auto', 'r33-webgl2', 'r34-auto', 'r34-webgl2'].map(run => `evidence/m2/contract/${run}/browser-results.json`);
const staticSet = 'evidence/parity/m2b-static-02/results.json', m2aSets = ['evidence/parity/m2a-static-prepared-01/results.json', 'evidence/parity/m2a-window-camera-02/results.json'];
const playParity = 'evidence/parity/m2d-play-focused-02/results.json', streamCrop = 'evidence/parity/m2b-static-02/stream-crop/stream-crop.json';
const woodland = ['evidence/parity/m2a-static-prepared-01/woodland-ab-webgpu', 'evidence/parity/m2a-static-prepared-01/woodland-ab-webgl2'];
const r34 = ['evidence/parity/m2d-r34-01/results.json', 'evidence/parity/m2d-r34-01/r33-r34-differences.json'];
const world = 'evidence/m2/world/summary.json', placements = 'evidence/m2/placements/README.md', oracle = 'evidence/m2/play/oracle.json';
const b08 = ['evidence/m2/play/b08-03-webgpu/results.json', 'evidence/m2/play/b08-03-webgl2/results.json'], playUnit = 'evidence/m2/play/unit-full-b08.log';
const m1Unit = 'evidence/m1/unit-coverage.md', m0 = 'evidence/m0/browser-results.json', staging = ['evidence/m2/staging/README.md', 'evidence/m2/staging/r34.json'];
const unitFull = 'evidence/m2/m2d/unit-full.log', colliders = 'packages/farm/fixtures/play-colliders.json';
const collidersR34 = ['packages/farm/fixtures/play-colliders-r34.json', 'evidence/m2/m2d/colliders-r33.json', 'evidence/m2/m2d/colliders-r34.json'];
const hubKit = ['evidence/m2/m2d/hub-kit-README.txt', 'evidence/m2/m2d/hub-kit-MANIFEST.json', 'evidence/m2/m2d/hub-kit-smoke.json', 'evidence/m2/m2d/hub-kit-smoke-attempt1.json',
  'evidence/m2/m2d/hub-kit-smoke-attempt1-diagnosis.txt', 'evidence/m2/m2d/hub-kit-tier-mounts.txt'];
const bundles = ['evidence/m2/bundle-r33-public.json', 'evidence/m2/bundle-r34-public.json', 'evidence/m2/bundle-r34-test.json', 'evidence/m2/bundle-r34-dev.json', 'evidence/m1/bundle-budget-check.json'];
const farmScope = 'Farm r33 (parity baseline) and r34 (sealed delivery) outputs, WebGPU and forced WebGL2';

type Update = { status: 'pass' | 'fail' | 'deferred'; reason: string; evidence: string[]; scope?: string; acceptedUnder?: string; deferredPortion?: string };
const pass = (reason: string, evidence: string[], extra: Partial<Update> = {}): Update => ({ status: 'pass', reason, evidence, scope: farmScope, ...extra });
const deferred = (reason: string, evidence: string[], extra: Partial<Update> = {}): Update => ({ status: 'deferred', reason, evidence, ...extra });
const b06 = [staticSet, ...m2aSets, playParity, streamCrop, ...woodland, ...r34];

const updates: Record<string, Update> = {
  'P-01': pass('B-01 passes on the Farm outputs of both releases on both backends (zero-size container, then onReady exactly once); every parity capture reached onReady with the six phase texts. X-04 timing is deferred to the hub run kit (SPEC 20.3).', [...contract, ...hubKit], { deferredPortion: 'X-04 (hub run kit)' }),
  'P-02': pass('U-01 and U-03 pass (kit); B-04 passes on the Farm outputs (404, hash mismatch, schema and CORS failures report the contract errors); both staged packs verify against the sealed receipts.', [m1Unit, ...contract, ...staging]),
  'P-03': pass('B-00a to c pass (M0); B-02 forced WebGL2 and B-03 WebGPU with adapter pass on the Farm outputs of both releases.', [m0, ...contract]),
  'P-04': pass('B-06 static set: all 24 named-view/backend pairs pass at the unchanged thresholds with the Farm lighting (sun shadow camera set once).', [staticSet, ...m2aSets]),
  'P-05': pass('U-01b passes (kit); B-07 records 98 to 29 pooled textures and 39 GPU textures equal to the pilot at every static pair.', [m1Unit, staticSet]),
  'P-06': pass('U-19 (168 layout entries to 589 wrappers) passes; B-07 placements 589 and the crop shadow policy at every static pair.', [placements, staticSet]),
  'P-07': pass('U-19b initial clip table and offsets pass; B-07 at every static pair.', [placements, staticSet]),
  'P-09': pass('U-06 terrain and landscape counts, groups and bounds match the oracle; B-06 static set passes.', [world, staticSet]),
  'P-10': pass('U-07 (843 trees, 16 cells) passes; B-07 8 packed groups, 3,372 instances, 64 source meshes; B-06 passes; the tangent-safe woodland A/B shows no material change (D-06).', [world, staticSet, ...woodland]),
  'P-11': pass('U-06 stream counts pass; B-06 passes, including the SPEC 19.7 stream crop at the mill bank (144 of 144 tiles on both backends).', [world, staticSet, streamCrop],
    { deferredPortion: 'B-13 (pixel ratio and resize on the full scene) is deferred to M3b under D-20; SPEC 24 also lists it under M3b' }),
  'P-12': pass('U-06 bridge (34 boxes, 408 triangles) matches the oracle.', [world]),
  'P-13': pass('U-08 meadow pixels are byte-identical to the sealed recipe; B-06 static set passes.', [world, staticSet]),
  'P-14': pass('B-07 14,000 tufts in 16 meshes at every static pair; B-06 passes.', [staticSet]),
  'P-15': pass('U-13 passes (kit); B-07 batching, freeze and frame-graph goldens from the sealed r33 functions (83 groups, 54 dynamic, 2,000 batched sources; 555 placements and 4,191 nodes frozen; 575 hidden roots; R3-08 reconciles the SPEC counts) at every static pair.', [m1Unit, staticSet]),
  'P-16': deferred('Farm tier table (tiers.ts, section 15) is implemented and U-15 passes, but P-16 also requires B-10, which SPEC 24 places in M3b.', [m1Unit, 'packages/farm/src/tiers.ts']),
  'P-17': pass('B-05 true teardown (C-04 protocol) and B-11 pause-when-hidden (second tab pauses) pass on the Farm outputs of both releases and both backends.', contract),
  'P-18': pass('B-06: the 12 named views read from layout.views pass on both backends, including house-window-out with the interior polar rule (R4-01).', [staticSet, ...m2aSets]),
  'P-19': deferred('Dropped under the SPEC 24 cut line: D-09 keeps the tour out of the public scene, so its B-06 tour frames do not apply. The route itself is ported as the hub-kit living-route workload (test and dev builds only).', ['packages/farm/src/play/workloads.ts', hubKit[0]!]),
  'P-20': pass('U-09 kit collision world and Farm selection pass; the 13 colliders are byte-identical to the sealed pilot (oracle); B-08 passes on both backends and its colliders equal the fixture.', [m1Unit, playUnit, oracle, colliders, ...b08]),
  'P-21': pass('U-10 passes (kit); 4,291 lockstep frames equal the sealed play.mjs; B-08 walk, run, strafe, wall, river and bridge steps pass on both backends.', [m1Unit, oracle, ...b08]),
  'P-22': pass('U-11 (four mechanisms, damp 7, blocked-by-player revert, labels) passes; B-08 opens and closes every door mechanism on both backends.', [playUnit, oracle, ...b08]),
  'P-23': pass('U-14 (tractor kinematics, probes, exit order, joints; ground plan) passes; B-08 drive, steer, reverse, bound, obstacle, wedge and dismount pass on both backends.', [playUnit, oracle, ...b08]),
  'P-24': pass('U-11 prompt radii and text table pass; B-08 prompt steps pass on both backends.', [playUnit, ...b08]),
  'P-25': pass('B-08 follow camera: drag turn without creep, wall obstruction pull-in to the oracle distance, subject hiding and recovery, on both backends.', [oracle, ...b08]),
  'P-26': pass('B-08: seven destinations and reset through the test hook and the HUD, refused while wedged; no public destination menu (D-09).', b08),
  'P-27': pass('U-22 herd positions and playback at 13 samples match the pilot fixture; B-07 at every static pair.', [placements, staticSet]),
  'P-29': pass('B-11 (44 px targets, contrast, keyboard reachability) passes on the Farm outputs; the overview CameraButtons render in the public HUD.', [...contract, 'packages/farm/src/ui/FarmHud.tsx']),
  'P-30': pass('U-17 passes (kit); B-08 keyboard flows and B-11 root-scoped keys (Enter starts play, Escape twice, Tab leaves) pass on both backends.', [m1Unit, ...b08, ...contract]),
  'P-31': deferred('M3 id (SPEC 24: M3 is done when P-31 to P-35 pass) and M3 is not started. Current evidence: Farm B-05 passes on both releases and backends.', contract),
  'P-32': deferred('M3a mobile play (B-09); M3 is not started.', ['PROGRESS.md']),
  'P-33': deferred('M3b tiering in Farm (U-15, U-16, B-10); M3 is not started.', ['PROGRESS.md']),
  'P-34': deferred('M3c public UI polish and accessibility; M3 is not started. Current evidence: Farm B-11 and B-12 pass on both releases and backends.', contract),
  'P-35': deferred('M3c pause and reduced motion; M3 is not started. Current evidence: Farm B-11 (reduced motion freezes ambient motion; a second tab pauses) passes.', contract),
  'U-09': pass('Kit collision world (M1) plus the Farm collider selection test; the 13 Farm colliders are byte-identical to the sealed pilot (r33 and r34).', [m1Unit, playUnit, unitFull, oracle, ...collidersR34]),
  'U-11': pass('Four play.test.ts U-11 tests pass; the lockstep oracle exercises every door and prompt state.', [playUnit, unitFull, oracle]),
  'U-14': pass('Two play.test.ts U-14 tests pass (kinematics, probes, joints; ground plan and exit order); the lockstep oracle covers drive, wedge and dismount.', [playUnit, unitFull, oracle]),
  'U-18': pass('Kit HUD store (M1) plus the Farm string table test: pilot messages verbatim, four door labels, prompts, no coordinates.', [m1Unit, playUnit, unitFull]),
  'B-01': pass('Kit demo (M1) and the Farm outputs of both releases on both backends, attempt 1.', contract),
  'B-02': pass('Kit demo (M1) and the Farm outputs of both releases on both backends, attempt 1.', contract),
  'B-03': pass('Kit demo (M1) and the Farm outputs of both releases on both backends, attempt 1.', contract),
  'B-04': pass('Kit demo (M1) and the Farm outputs of both releases on both backends, attempt 1, including the five injected callback failures.', contract),
  'B-05': pass('C-04 protocol on the Farm outputs, attempt 1: heap growth after forced GC r33 +1.79% (auto) and +1.67% (WebGL2), r34 +2.03% (auto) and +1.68% (WebGL2); one C-03 listener retained.', contract),
  'B-06': pass('Accepted under D-20 on the gathered set: 24 of 24 named-view/backend pairs (m2b-static-02, unchanged thresholds), play positions yard, house porch and bridge on WebGPU, stream crop on both backends, woodland A/B (M2a), and on r34 the farmhouse views and the farmhouse interior through the open door (play-house-door), 144 of 144 tiles on both backends against the sealed r34 pilot; r33 to r34 differences are the farmhouse floor only (D-07).', b06,
    { acceptedUnder: 'D-20', deferredPortion: 'Play positions yard, house porch and bridge on forced WebGL2 were not captured. The r33 play-house-door WebGPU capture failed 132 of 144 tiles because the focused root drew its outline in the rewrite frame; the capture now hides that outline (R4-07), it was not re-run on r33 under D-20, and the same view passes on r34 on both backends. B-13 is separate and deferred' }),
  'B-07': pass('Static goldens at all 24 static pairs; collider counts equal the frozen r33 fixture in B-08; r34: the sealed r34 collision world was frozen from the sealed r34 play.mjs (every soup byte-identical to the port; +264 static triangles, all in the r34 farmhouse) and the colliders of every r34 capture equal it, with all other r34 counts equal (R4-09; farmhouse-only differences, D-07).', [staticSet, colliders, ...collidersR34, ...b08, ...r34]),
  'B-08': pass('24 of 24 steps on WebGPU and on forced WebGL2 with real keys and mouse (b08-03).', [...b08, oracle]),
  'B-09': deferred('M3a mobile play; M3 is not started.', ['PROGRESS.md']),
  'B-10': deferred('M3b tiering in Farm; M3 is not started.', ['PROGRESS.md']),
  'B-11': pass('Kit demo (M1) and the Farm outputs of both releases on both backends: axe, focus and Enter starts play, the Farm walk and door flow, Escape twice, Tab leaves, aria-live, reduced motion, second tab pauses, 44 px targets, contrast.', contract),
  'B-12': pass('Kit demo (M1) and the Farm outputs of both releases: the public build ignores dev and test flags and exposes no hooks; the dev build shows its panel.', contract),
  'B-13': deferred('Deferred to M3b under D-20 (SPEC 24 lists B-13 under both M2d and M3b); it qualifies the governor pixel-ratio ladder, which M3b integrates in Farm.', ['PROGRESS.md']),
  'X-01': deferred('Timing is deferred to the hub run kit (SPEC 20.3; owner rule 2026-09-29: timing on this PC is indicative only). The kit is built and verified; its local plumbing smoke passed on attempt 2 after a plumbing fix (attempt 1 failed only its tractor-drive check), headed and under load, with every number discarded.', hubKit),
  'X-02': pass('Draw calls within .38% and triangles within .024% of the pilot at every named view on both backends; pipelines equal to the pilot; play fixtures yard, house porch and bridge on WebGPU equal the pilot; on r34 the farmhouse views and play-house-door pass on both backends against the sealed r34 pilot.', [staticSet, playParity, ...r34],
    { acceptedUnder: 'D-20', deferredPortion: 'Play fixtures yard, house porch and bridge on forced WebGL2 not captured' }),
  'X-03': pass('Farm B-05 ten-cycle heap growth below 5% on both releases and backends (see B-05).', contract),
  'X-04': deferred('Timing is deferred to the hub run kit (SPEC 20.3; owner rule 2026-09-29: timing on this PC is indicative only). The kit is built and verified; its local plumbing smoke passed on attempt 2, headed and under load, with every number discarded.', hubKit),
  'X-05': deferred('Timing is deferred to the hub (owner rule 2026-09-29: timing on this PC is indicative only). The hub kit README step 5 runs the rewrite at tiers high, balanced, economy and minimal on both backends for living-orbit, living-route and tractor-drive; SPEC X-05 also asks for 60 s windows and five runs (the README gives the flags) and a walk workload, which the kit does not have because the sealed pilot has no walk measurement.', hubKit),
  'X-06': deferred('Not covered by the hub kit: its runner forces the tier, so the automatic tier selection on the hub GPU is not exercised; it needs a run without a forced tier on the hub.', hubKit),
  'X-07': deferred('No tablet kit is built; the tablet is for M3 (coordinator, round 4). SPEC X-07 needs the perf page over Chrome remote debugging or a hosted test build.', ['PROGRESS.md']),
  'X-08': deferred('No phone kit is built; same method as X-07 on the owner\'s phone.', ['PROGRESS.md']),
  'X-09': deferred('The 30-minute soak on the hub and phone is not part of the hub kit; deferred.', ['PROGRESS.md']),
  'X-10': deferred('Governor stability on real devices needs the tablet and phone soak; the synthetic part is U-16 (passes) and B-10 (M3b).', ['PROGRESS.md']),
  'X-11': deferred('M4 check. Recorded now: staged packs r33 7,070,552 B and r34 7,098,444 B (23 GLBs each); the public Farm chunk is 1,574,581 B / 460,130 B gzip for both releases, 1.10% / 1.64% above the ceilings frozen from the M1 kit demo (R3-02: 1,557,399 B / 452,687 B). Whether D-15 applies to each scene is an owner question. Bytes fetched before onReady are not yet recorded.', [...bundles, ...staging]),
  'X-12': deferred('M4 check (SPEC 24); not part of the M2 exit.', ['PROGRESS.md']),
};

const missing = [...new Set([...Object.values(updates).flatMap(update => update.evidence), ...matrix.checks.flatMap(check => [check.evidence, check.evidenceReports].flat()).filter((path): path is string => typeof path === 'string')])].filter(path => !existsSync(resolve(root, path)));
if (missing.length) throw new Error(`Evidence paths do not exist:\n${missing.join('\n')}`);
const byId = new Map(matrix.checks.map(check => [check.id as string, check]));
for (const [id, update] of Object.entries(updates)) {
  const check = byId.get(id); if (!check) throw new Error(`Unknown matrix id ${id}`);
  // An id that already passed (kit demo in M1, Farm units in M2a) keeps that evidence beside the new Farm evidence.
  const prior = check.status === 'pass' ? [check.evidence, check.evidenceReports].flat().filter((path): path is string => typeof path === 'string' && path !== 'PROGRESS.md') : [];
  const priorScope = check.status === 'pass' && typeof check.scope === 'string' ? check.scope : null;
  for (const key of ['reason', 'evidence', 'scope', 'acceptedUnder', 'deferredPortion', 'evidenceReports', 'staticEvidence', 'note']) delete check[key];
  Object.assign(check, update, { evidence: [...new Set([...prior, ...update.evidence])], recorded: 'M2 close (D-20)' });
  if (priorScope && update.scope) check.scope = `${priorScope}; ${update.scope}`;
}
const summary: Record<string, Record<string, number>> = {};
for (const check of matrix.checks) { const family = String(check.id).split('-')[0]!, bucket = summary[family] ??= { pass: 0, fail: 0, deferred: 0 }; bucket[check.status as string]!++; }
matrix.date = '2026-09-29'; matrix.summary = summary;
await writeFile(file, JSON.stringify(matrix, null, 2) + '\n');
console.log(JSON.stringify({ updated: Object.keys(updates).length, summary }));
