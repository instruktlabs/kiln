// Assembles the Golden Gate hub run kit (SPEC 20.3; PERFORMANCE.md) in packages/golden-gate/dist/hub-kit:
// the test build carrying the current staged pack (scripts/release.ts), the runner bundled for Node 22, README.txt with the exact
// commands and MANIFEST.json with every file's size and SHA-256. It builds and copies only; it never
// serves, launches a browser or times anything. Rebuild the test output first (tests/tools/build.ts test).
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/make-hub-kit.ts [--copies=<dir>]
// --copies= keeps the README and MANIFEST copies in another directory under the package (default evidence/perf;
// fix round 2 wrote nothing there while the hub session owned it). One token with "=", as perf-local.ts's --out=.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { STAGED_RELEASE, stagedDir } from '../../scripts/release.ts';

const pkg = resolve(import.meta.dir, '../..'), kit = resolve(pkg, 'dist/hub-kit'), source = resolve(pkg, 'dist/test');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const posix = (base: string, file: string) => relative(base, file).split(sep).join('/');

if (existsSync(resolve(kit, 'results')) && readdirSync(resolve(kit, 'results')).length) throw new Error('The existing kit holds results; move them to evidence before rebuilding the kit');
if (!existsSync(resolve(source, 'index.html'))) throw new Error('Build the test output first: tests/tools/build.ts test');
// The test build must carry the staged pack byte for byte.
assert.deepEqual(readFileSync(resolve(source, 'assets/pack.json')), readFileSync(resolve(stagedDir(), 'pack.json')), `The test build does not carry the staged ${STAGED_RELEASE} pack`);
const staging = JSON.parse(await readFile(resolve(pkg, `evidence/staging/${STAGED_RELEASE}.json`), 'utf8')) as { files: number; bytes: number; packSha256: string; downloadBytesByTier: Record<string, number> };
const bundle = JSON.parse(await readFile(resolve(pkg, 'evidence/build/bundle-test.json'), 'utf8')) as { chunks: { name: string; bytes: number; gzipBytes: number }[] };
const chunks = readdirSync(resolve(source, 'assets')).filter(name => /\.(js|css)$/.test(name));
assert.deepEqual(chunks.sort(), bundle.chunks.map(c => c.name).sort(), 'evidence/build/bundle-test.json describes another test build');

await rm(kit, { recursive: true, force: true }); await mkdir(resolve(kit, 'runner'), { recursive: true });
await cp(source, resolve(kit, 'test'), { recursive: true });
const built = await Bun.build({ entrypoints: [resolve(pkg, 'scripts/perf.ts')], target: 'node', format: 'esm', outdir: resolve(kit, 'runner'), naming: 'perf-gg.mjs' });
if (!built.success) throw new AggregateError(built.logs, 'Runner bundle failed');

const commit = execFileSync('git', ['log', '-1', '--format=%H'], { cwd: pkg, encoding: 'utf8' }).trim();
const chromeVersion = (() => { try { const found = readdirSync('C:/Program Files/Google/Chrome/Application').filter(name => /^[0-9]+([.][0-9]+){3}$/.test(name)); return found.length ? `Chrome ${found.sort().at(-1)}` : 'not recorded'; } catch { return 'not recorded'; } })();
const tiers = staging.downloadBytesByTier;
const readme = `Golden Gate hub run kit (SPEC 20.3; packages/golden-gate/PERFORMANCE.md)
Assembled ${new Date().toISOString().slice(0, 10)} by the Golden Gate builder (packages/golden-gate/tests/tools/make-hub-kit.ts). Nothing in this kit
has been timed. The builder's local smoke (command 1, headless on the dev PC, 2026-09-29 16:10) proved the plumbing only; its numbers
were discarded unread. The runner's other commands were exercised there once with 2 s samples and their output deleted unread.

WHAT IT MEASURES (Golden Gate has no pilot, so every rule is absolute)
  X-06      the tier the kit selects on this machine (automatic quality, governor live, as a visitor gets it) and the frame rate there;
            SPEC 20.2 hub target: 60 FPS or better at the selected tier
  X-04      time to onReady, cold (a new profile per run) and warm, both backends; WebGL2 hard limit 45 s
  X-05      tiers high (High), balanced (Medium) and economy (Low), both backends, three workloads; recorded per tier
  X-09/X-10 a 30 minute soak at the automatic tier: heap trend, governor level changes per minute, long tasks after ready
  Workloads (the scene's own, src/camera/workloads.ts and src/play/Driving.tsx):
    orbit    the hero orbit: the orbit camera 1,000 m around the main span at 240 m, one revolution per 60 s
    flyover  the guided flyovers in turn (postcard sweep, tower rise, deck run; the fog roll plays only under the Fog preset)
    drive    the sedan at full throttle along the northbound deck with lane changes, turning around at each end, chase camera
  Every run uses the Day preset, a 1920 x 1080 viewport at DPR 1 and the page chrome hidden (capture=1), so the canvas is the whole
  viewport; each file records the canvas's drawing buffer (the tier's pixel-ratio cap applies).

CONTENTS
  test/                 the Golden Gate test build (${chunks.join(', ')}) with the staged ${STAGED_RELEASE} pack (${staging.files} files, ${staging.bytes} bytes,
                        pack ${staging.packSha256.slice(0, 16)}...; downloads High ${tiers.high} / Medium ${tiers.medium} / Low ${tiers.low} bytes); served root
  runner/perf-gg.mjs    the runner (packages/golden-gate/scripts/perf.ts and perf-core.ts, bundled for Node)
  MANIFEST.json         every file with size and SHA-256

REQUIREMENTS ON THE HUB
  Node 22 (22.23.2 locally) and Google Chrome (tested locally with ${chromeVersion} on Windows; the Farm hub run used /opt/google/chrome/chrome,
  Chrome 150). No network access: the runner serves test/ itself on 127.0.0.1, ports 4600-4649 (--ports a-b), with no-store headers.
  Chrome runs headed (the default) at --window-size=1920,1080 --window-position=0,0 with --enable-unsafe-webgpu; add --headless only if
  the display cannot be used. WebGPU on the hub, as the Farm run established (scenes/evidence/perf/hub-2026-09-29/README.txt and
  flags.txt): headed in the existing Plasma session through XWayland (DISPLAY=:0) with NVIDIA PRIME render offload
  (__NV_PRIME_RENDER_OFFLOAD=1, __GLX_VENDOR_LIBRARY_NAME=nvidia) and the flags --ozone-platform=x11 --enable-features=Vulkan
  --start-fullscreen. Without the Vulkan feature the adapter is SwiftShader. Every result records the adapter: after the smoke, check
  that it reads nvidia / turing and that the backend is webgpu. Pass each flag as --chrome-arg <flag> (--chrome-arg=<flag> also works).
  Display: eDP-1 1920 x 1080 at 120.11 Hz, as for the Farm run; record the mode before and after.
  Load gate (built in): before each command group the runner takes 8 samples of 2 s, the sealed pilot's hub rule (CPU mean < 5 %,
  CPU max < 12 %, NVIDIA GPU <= 3 %), and retries every 30 s for up to 15 minutes (--wait-quiet <minutes>); it times nothing while
  the machine is busy, and results/preflight/ keeps every sample. Each run file also records one load sample taken 3 s after the
  previous page closed (information only). Hold off screen blanking with kde-inhibit, which exits 0 whatever its child does, so echo
  the runner's exit code as the Farm run did.

COMMANDS (from this directory, in the Plasma session's environment)
  export CHROME=/opt/google/chrome/chrome DISPLAY=:0 __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia
  F="--chrome $CHROME --chrome-arg --ozone-platform=x11 --chrome-arg --enable-features=Vulkan --chrome-arg --start-fullscreen"
  R() { kde-inhibit --power --screenSaver --notifications -- sh -c '"$@"; echo runner-exit=$?' sh node runner/perf-gg.mjs "$@" $F; }
  0. node runner/perf-gg.mjs verify
  1. R smoke --smoke-out results/smoke.json                                   (plumbing only; numbers discarded)
  First session, about 45 minutes (the run to schedule first):
  2. X-06, 18 files:  for b in webgpu webgl2; do for w in orbit flyover drive; do R auto --backend $b --workload $w --runs 3; done; done
  3. X-04, 20 files:  for b in webgpu webgl2; do for c in cold warm; do R ready --backend $b --cache $c --runs 5; done; done
  4. node runner/perf-gg.mjs summary                                          (writes results/summary.json)
  Second session, about 2 h 40 min (SPEC's full X-05 and the soak):
  5. X-05, 90 files:  for b in webgpu webgl2; do for t in high balanced economy; do for w in orbit flyover drive; do
                        R frames --tier $t --backend $b --workload $w --runs 5 --seconds 60; done; done; done
  6. X-09/X-10, 1 file: R soak --backend webgpu --minutes 30
  7. node runner/perf-gg.mjs summary
  Other options: --headless, --ports a-b, --out <dir>, --preset day|golden|fog (Golden hour adds headlights and brake light glow,
  Fog adds the fog banks on High), --width/--height, --no-preflight (never for evidence).

EXPECTED OUTPUT (results/)
  smoke.json
  x06-auto-<webgpu|webgl2>-<orbit|flyover|drive>-run<1-3>.json
  x04-<cold|warm>-<webgpu|webgl2>-run<1-5>.json
  x05-<high|balanced|economy>-<webgpu|webgl2>-<orbit|flyover|drive>-run<1-5>.json
  x09-soak-webgpu.json
  preflight/<group>-<time>.json
  failures/<run>-<time>.json   only for a run that stopped with an error (the summary never reads it)
  summary.json
  Each run file carries SPEC 20.3's flat record under "spec" ({ device, browser, backend, adapter, tier, workload, frames, medianMs,
  p95Ms, p99Ms, cpuRenderMedianMs, drawCalls, triangles, longTasks, governorChanges, readyMs }) beside the detail: frame intervals
  (rAF timestamps), CPU time around renderer.render, renderer.info sampled every 30 frames, the tier and governor level at the start
  and end, level changes, long tasks, the canvas buffer and the adapter, the WebGL renderer string (environment.webgl: the scene's
  own context on WebGL2, a released 1 x 1 probe beside WebGPU) and the page's browser console (console: messages, page errors and
  failed requests with their time since the page opened, at most 400). X-05 holds the governor at the tier's level 0; X-06, X-04 and
  the soak leave it live. A run that fails its own checks (workload not yet running when sampling began, camera not moving, car not
  driven, tier not held, a scene error, page hidden) is marked valid: false: repeat that command, do not shorten it. A scene that
  runs another backend than the one requested, or fails to start, stops the command with an error and leaves
  failures/<run>-<time>.json with the error, the console and the environment; copy it back with the results.

COPY BACK
  Copy results/ unchanged, with the display and environment records, to
  C:/Users/Mattm/X/kiln-commons/scenes/packages/golden-gate/evidence/perf/hub-<YYYY-MM-DD>/ and record it in the Golden Gate PROGRESS.md.

PASS RULES (SPEC 20.1 and 20.2 for a scene without a pilot; summary.json applies them)
  X-06: at the tier the kit selects, on WebGPU, every workload reaches 60 FPS (median frame interval at most 17 ms and average rate
        at least 60 FPS), every run valid and quiet; WebGL2 is recorded the same way.
  X-04: WebGL2 worst run at most 45 s; medians recorded.
  X-05: recorded per tier (which tiers reach 60 FPS on this machine); no pass rule without a pilot.
  X-09: heap growth under 2 MB from minute 5 to the end after forced collections, and no long task after ready.
  X-10: at most 4 governor level changes in any minute.
`;
await writeFile(resolve(kit, 'README.txt'), readme);
const files = walk(kit).map(file => posix(kit, file)).filter(path => path !== 'MANIFEST.json').sort()
  .map(path => { const data = readFileSync(resolve(kit, path)); return { path, bytes: data.length, sha256: sha256(data) }; });
await writeFile(resolve(kit, 'MANIFEST.json'), JSON.stringify({ schema: 'kiln.golden-gate-hub-kit/1', scenesCommit: commit, workingTreeNote: 'Built from the working tree; the Golden Gate package is not yet committed',
  test: { source: 'packages/golden-gate/dist/test', chunks, stagedPackSha256: staging.packSha256 }, runner: { source: ['packages/golden-gate/scripts/perf.ts', 'packages/golden-gate/scripts/perf-core.ts'], bundled: 'runner/perf-gg.mjs' }, files }, null, 2) + '\n');
// The kit lives under dist (not committed), so its README and MANIFEST are also kept as evidence.
const copiesArg = process.argv.find(a => a.startsWith('--copies=')), copies = resolve(pkg, copiesArg ? copiesArg.slice('--copies='.length) : 'evidence/perf');
await mkdir(copies, { recursive: true });
await writeFile(resolve(copies, 'hub-kit-README.txt'), readme);
await cp(resolve(kit, 'MANIFEST.json'), resolve(copies, 'hub-kit-MANIFEST.json'));
const total = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(JSON.stringify({ kit: posix(pkg, kit), files: files.length, bytes: total, chunks, runnerBytes: files.find(f => f.path === 'runner/perf-gg.mjs')?.bytes }));
