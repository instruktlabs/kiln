// Assembles the Farm hub run kit (SPEC 20.3) in packages/farm/dist/hub-kit: the r34 rewrite test build,
// the sealed r34 pilot archive extracted and verified member by member, the runner bundled for Node 22,
// README.txt with the exact commands, and MANIFEST.json with every file's size and SHA-256.
// It builds and copies only; it never serves, launches a browser or times anything.
// Usage: bun scripts/make-hub-kit.ts [--label m4] [--no-look]  (default r34: packages/farm/dist/<label>/test; a label with a dev
// output also ships it as rewrite-dev/ with the look runner, TASK-M3.md item 6, unless --no-look: D-18 settled the look in M4)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readZip } from '../packages/scene-kit/src/staging';

const root = resolve(import.meta.dir, '..'), kit = resolve(root, 'packages/farm/dist/hub-kit');
const kitArgs = process.argv.slice(2), label = (() => { const at = kitArgs.indexOf('--label'); return at >= 0 && kitArgs[at + 1] ? kitArgs[at + 1]! : 'r34'; })();
const rewriteSource = resolve(root, `packages/farm/dist/${label}/test`), devSource = resolve(root, `packages/farm/dist/${label}/dev`), withLook = !kitArgs.includes('--no-look') && existsSync(resolve(devSource, 'index.html'));
// The M2 kit's README and MANIFEST are evidence of M2d; a later label keeps its own copies.
const evidenceDir = resolve(root, label === 'r34' ? 'evidence/m2/m2d' : `evidence/${label}`);
const staging = JSON.parse(await readFile(resolve(root, 'evidence/m2/staging/r34.json'), 'utf8'));
const receipt = staging.checkedSources[0].archives.scene as { archive: string; bytes: number; sha256: string; files: number };
const archive = resolve(staging.checkedSources[0].path, receipt.archive);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const posix = (base: string, file: string) => relative(base, file).split(sep).join('/');

if (existsSync(resolve(kit, 'results')) && readdirSync(resolve(kit, 'results')).length) throw new Error('The existing kit holds results; move them to evidence before rebuilding the kit');
// The rewrite output must carry the staged r34 pack.
assert.deepEqual(JSON.parse(await readFile(resolve(rewriteSource, 'assets/pack.json'), 'utf8')), JSON.parse(await readFile(resolve(root, 'packages/farm/staged/r34/pack.json'), 'utf8')), 'Rewrite test build does not carry the staged r34 pack');
const chunks = readdirSync(resolve(rewriteSource, 'assets')).filter(name => /\.(js|css)$/.test(name));
// The pilot is written straight from the sealed archive after its size and SHA-256 match the staging receipt.
const entries = readZip(archive, { bytes: receipt.bytes, sha256: receipt.sha256.replace(/^sha256:/, '') });
const members = [...entries.keys()].sort();
if (!members.includes('scene/index.html')) throw new Error('The sealed scene archive has no scene/index.html');

await rm(kit, { recursive: true, force: true }); await mkdir(resolve(kit, 'runner'), { recursive: true });
await cp(rewriteSource, resolve(kit, 'rewrite'), { recursive: true });
if (withLook) await cp(devSource, resolve(kit, 'rewrite-dev'), { recursive: true });
for (const name of members) { const target = resolve(kit, 'pilot', name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, entries.get(name)!); }
const bundle = await Bun.build({ entrypoints: [resolve(root, 'packages/farm/scripts/perf.ts')], target: 'node', format: 'esm', outdir: resolve(kit, 'runner'), naming: 'perf-farm.mjs' });
if (!bundle.success) throw new AggregateError(bundle.logs, 'Runner bundle failed');
if (withLook) {
  const look = await Bun.build({ entrypoints: [resolve(root, 'scripts/run-farm-look.ts')], target: 'node', format: 'esm', outdir: resolve(kit, 'runner'), naming: 'look-farm.mjs' });
  if (!look.success) throw new AggregateError(look.logs, 'Look runner bundle failed');
}

const commit = execFileSync('git', ['log', '-1', '--format=%H'], { cwd: root, encoding: 'utf8' }).trim();
// Chrome on Windows opens a window for --version, so the version comes from its installation folder instead.
const chromeVersion = (() => { try { const found = readdirSync('C:/Program Files/Google/Chrome/Application').filter(name => /^[0-9]+([.][0-9]+){3}$/.test(name)); return found.length ? `Chrome ${found.sort().at(-1)}` : 'not recorded'; } catch { return 'not recorded'; } })();
const smokeNote = label === 'r34' ? `The builder's local smoke (command 1, run headed on the dev PC under load, before the window pin below was added)
proved the plumbing only; its numbers were discarded. Tier mounts were checked there without timing.`
  : `The builder's local checks on the dev PC (command 0, the smoke of command 1${withLook ? ' and a short look-runner run' : ''}, all headless and under load)
proved the plumbing only; their numbers were discarded.`;
const lookContents = withLook ? `
  rewrite-dev/      the rewrite's ${label} dev build (look toggles behind KILN_DEV; TASK-M3.md item 6); served root: rewrite-dev
  runner/look-farm.mjs   the look runner (scripts/run-farm-look.ts bundled for Node): frame time per tier and captures per look option` : '';
const lookCommands = withLook ? `
  6. Look options (TASK-M3.md item 6; D-18 stands, nothing becomes a default): frame time per tier for every look preset
     during living-orbit (2.5 s warm-up, 6 s sample per preset, governor held, frame pacing uncapped with
     --disable-gpu-vsync --disable-frame-rate-limit), then captures of the contact-sheet views (hero, fences, house-porch,
     watermill-wheel) at 1280 x 720, DPR 1, frozen clock, for tiers high and economy:
     for b in webgpu webgl2; do
       node runner/look-farm.mjs --target hub --backend $b --root rewrite-dev --dest results/look-$b --chrome "$CHROME"
     done
     Add --headless if no display is available; --chrome-arg <flag> as for perf-farm.mjs. About 20 minutes per backend.` : '';
const lookOutput = withLook ? `
  results/look-<webgpu|webgl2>/runs.json (each preset and tier keeps its intervalsMs) and captures/<tier>/<preset>/<view>.jpg   (step 6)` : '';
const readme = `Farm hub run kit (SPEC 20.3): X-01 frame time and X-04 time to the first stable frame (D-23), sealed pilot r34
versus rewrite ${label} (r34 pack), and X-05, the rewrite per tier
Assembled ${(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date())} (local date) by the scenes builder (scripts/make-hub-kit.ts). Nothing in this kit has been timed.
${smokeNote}

CONTENTS
  pilot/            the sealed r34 scene archive ${receipt.archive}, written member by member from the archive
                    (archive ${receipt.bytes} bytes, ${receipt.sha256}); served root: pilot/scene
  rewrite/          the rewrite's ${label} test build of the r34 pack (${chunks.join(', ')}); served root: rewrite
  runner/perf-farm.mjs   the runner (packages/farm/scripts/perf.ts bundled for Node)${lookContents}
  MANIFEST.json     every file with size and SHA-256, and the provenance of each part

REQUIREMENTS ON THE HUB
  Node 22 (tested with 22.23.2) and Google Chrome (tested locally with ${chromeVersion} on Windows).
  A display for headed runs (the default; add --headless otherwise). A headed window opens at the primary
  display's origin (--window-position=0,0) and must fit on that display at 1920 x 1080; if it cannot, use
  --headless for both targets. Every result file records headless and the window position. No network access is needed: the runner
  serves both scenes itself on 127.0.0.1, ports 4400-4499 (--ports a-b), with identical no-store headers.
  WebGPU flags for Chrome on Linux are unverified; add them with --chrome-arg=<flag> (repeatable) and check
  with the smoke before timing. Run only when the hub is idle (standing decision 1); every result file records
  CPU utilisation over one second before its run and nvidia-smi utilisation where present.

COMMANDS (from this directory; set CHROME to the Chrome binary, e.g. /usr/bin/google-chrome)
  0. node runner/perf-farm.mjs verify
  1. node runner/perf-farm.mjs smoke --chrome "$CHROME"                 (plumbing only; numbers discarded)
  2. X-01, 36 files; each run is a 5 s warm-up and 30 s of sampling at 1920 x 1080, DPR 1, tier high:
     for b in webgpu webgl2; do for w in living-orbit living-route tractor-drive; do for t in pilot rewrite; do
       node runner/perf-farm.mjs frames --target $t --backend $b --workload $w --runs 3 --chrome "$CHROME"
     done; done; done
  3. X-04, 40 files; cold = a new profile per run, warm = one profile after one discarded load:
     for b in webgpu webgl2; do for c in cold warm; do for t in pilot rewrite; do
       node runner/perf-farm.mjs ready --target $t --backend $b --cache $c --runs 5 --chrome "$CHROME"
     done; done; done
  4. node runner/perf-farm.mjs compare                                  (writes results/comparison.json)
  5. X-05 (SPEC 20.1), the rewrite alone per tier, 120 files, about 3 hours: tiers high, balanced and economy, both
     backends, workloads living-orbit, living-route, walk and tractor-drive, 60 s of sampling after the 5 s warm-up, 5 runs:
     for b in webgpu webgl2; do for tier in high balanced economy; do for w in living-orbit living-route walk tractor-drive; do
       node runner/perf-farm.mjs frames --target rewrite --tier $tier --backend $b --workload $w --seconds 60 --runs 5 --out results/x05 --chrome "$CHROME"
     done; done; done
     then run step 4 again: comparison.json gains x05 (median and range over the runs per case, and the proposed hitch
     rule's verdict, which the coordinator adopts or not). The governor is held at each tier's level 0. The minimal tier is
     not in SPEC X-05; add minimal to the tier list to record it too.
  Other options: --headless, --chrome-arg=<flag> (repeatable), --ports a-b, --out <dir>. --tier, --seconds and --url
  (SPEC 20.3's runner interface) apply to the rewrite only, for later tier runs; X-01 and X-04 use none of them.${lookCommands}

EXPECTED OUTPUT
  results/frames-<pilot|rewrite>-<living-orbit|living-route|tractor-drive>-<webgpu|webgl2>-run<1-3>.json
  results/ready-<pilot|rewrite>-<cold|warm>-<webgpu|webgl2>-run<1-5>.json
  results/comparison.json
  results/x05/frames-rewrite-<living-orbit|living-route|walk|tractor-drive>-<webgpu|webgl2>[-<balanced|economy>]-run<1-5>.json
                    (step 5; high has no suffix)${lookOutput}
  Every rewrite frames file keeps frameIntervalsMs (each sampled interval, in order) and framesOver100Ms beside
  framesOver50Ms, so hitches are not averaged away; the sealed pilot's page shows only its summary, so both are null
  for the pilot.
  A run that fails its own checks (pilot session not complete, rewrite tier not held at its level 0, rewrite
  workload not yet running when sampling began, camera not moving, tractor not driven, Rowan not on foot for walk,
  wrong backend) is
  marked valid: false and fails the comparison. After its remount the rewrite can produce no frames for a few
  seconds after onReady while the GPU compiles pipelines; the 5 s warm-up normally absorbs this, and a run
  where it did not is invalid (workloadRunningAtSamplingStart: false). Repeat such a run; do not shorten it. (Since M4
  the rewrite compiles its pipelines before onReady, SPEC 6.4, so this should no longer happen.)

COPY BACK
  Copy the whole results/ directory unchanged to
  C:/Users/Mattm/X/kiln-commons/scenes/evidence/perf/hub-<YYYY-MM-DD>/ and record it in PROGRESS.md.

PASS RULES (SPEC 20.1)
  X-01: the rewrite's p50 and p95 frame interval and CPU time around renderer.render, each the median over
        its runs, within 110% of the pilot's.
  X-04 (owner decision 2026-09-29 22:05, D-23; SPEC 6.4): the rewrite's median time to the first stable frame within
        120% of the pilot's, per backend and cache state; every WebGL2 rewrite run at most 45 s. The first stable frame
        is the first frame, from the frame at which the scene is ready, that creates no shader, program or pipeline, ends
        with no asynchronous creation in flight and lasts at most 50 ms; both scenes are measured the same way (stableMs).
        Each X-04 file also keeps readyMs (the first frame at which the scene is ready, the M2 and M3 measure) and
        declaredReadyMs (the moment each scene declares readiness); compare writes x04Ready and x04Declared beside x04
        with the same rule, as extra columns.
  X-05: SPEC 20.2's targets (the hub GPU row: 60 FPS or better at the tier the kit selects; sixtyFpsOrBetter is
        reported for every tier) plus the M4 proposed hitch rule per 60 s run, the same at every tier and counted from
        the first sampled frame (frames over 100 ms: 0; frames over 50 ms: 0; longest frame at most 50 ms), reported for
        the coordinator to adopt or not (evidence/m4/hitches/README.md in the scenes workspace).

METHOD AND DEVIATIONS
  The workloads are the sealed pilot's own measurement workloads (activity.mjs living-orbit and living-route,
  play.mjs beginDrivePreview for tractor-drive). The pilot is measured by its sealed ?profile=1 harness
  (rafDeltaMs and renderSubmitCpuMs); the rewrite runs ports of the same workloads
  (packages/farm/src/play/workloads.ts) and is measured with rAF timestamp intervals and the kit's CPU time
  around renderer.render over the same windows and the same percentile rule. The rewrite's governor is held
  at tier high level 0 because the pilot has fixed quality. SPEC names 60 s runs; the sealed pilot harness
  samples 30 s, so both sides use 30 s. SPEC's walk workload has no sealed pilot measurement, so X-01 leaves it
  out; X-05 runs it on the rewrite (packages/farm/src/play/workloads.ts: play starts, Rowan is placed at the yard, then
  walks away from the camera for 4 s and back for 4 s through the kit's input, as the keyboard would). The rewrite plays its initial clip table (INV 5.8) during the moving workloads; the pilot's
  harness plays only the windmill, watermill and animal clips.
`;
await writeFile(resolve(kit, 'README.txt'), readme);
const files = walk(kit).map(file => posix(kit, file)).filter(path => path !== 'MANIFEST.json').sort()
  .map(path => { const data = readFileSync(resolve(kit, path)); return { path, bytes: data.length, sha256: sha256(data) }; });
await writeFile(resolve(kit, 'MANIFEST.json'), JSON.stringify({ schema: 'kiln.farm-hub-kit/1', scenesCommit: commit, workingTreeNote: 'Built from the working tree; uncommitted builder changes are not part of that commit',
  label, rewrite: { source: `packages/farm/dist/${label}/test`, chunks, stagedPackSha256: staging.packSha256 }, pilot: { archive: archive.split(sep).join('/'), receipt },
  runner: { source: 'packages/farm/scripts/perf.ts', bundled: 'runner/perf-farm.mjs' },
  ...(withLook ? { rewriteDev: { source: `packages/farm/dist/${label}/dev` }, lookRunner: { source: 'scripts/run-farm-look.ts', bundled: 'runner/look-farm.mjs' } } : {}), files }, null, 2) + '\n');
// The kit lives under dist (not committed), so its README and MANIFEST are also kept as evidence.
await mkdir(evidenceDir, { recursive: true });
await writeFile(resolve(evidenceDir, 'hub-kit-README.txt'), readme);
await cp(resolve(kit, 'MANIFEST.json'), resolve(evidenceDir, 'hub-kit-MANIFEST.json'));
const total = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(JSON.stringify({ kit: posix(root, kit), files: files.length, bytes: total, rewriteChunks: chunks, pilotMembers: members.length }));
