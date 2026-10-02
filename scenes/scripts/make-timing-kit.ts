// S6 timing kit (docs/plans/2026-10-01-draw-optimization-cycle.md): packs two build labels' test outputs per scene
// (packages/<scene>/dist/<label>/test, from scripts/build-scene.ts --mode test), the interleaved A/B runner
// (scripts/timing-ab.ts) bundled for Node 22, the hub helpers (session environment, display mode record/ensure/restore,
// run wrapper), README.txt with the exact commands and MANIFEST.json with every file's size and SHA-256.
// It builds and copies only; it never serves, launches a browser or times anything.
//   bun scripts/make-timing-kit.ts [--a draw-base] [--b wavea] [--scenes farm,foundry-floor,golden-gate] [--out dist/timing-kit/<a>-vs-<b>]
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dir, '..'), args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith('--') ? args[at + 1]! : fallback; };
const a = option('--a', 'draw-base'), b = option('--b', 'wavea'), scenes = option('--scenes', 'farm,foundry-floor,golden-gate').split(',');
const kit = resolve(root, option('--out', `dist/timing-kit/${a}-vs-${b}`));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const posix = (base: string, file: string) => relative(base, file).split(sep).join('/');
const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());

for (const label of [a, b]) if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`Label ${label} uses lowercase letters, numbers and hyphens`);
if (existsSync(resolve(kit, 'results')) && readdirSync(resolve(kit, 'results')).length) throw new Error('The existing kit holds results; copy them to evidence/perf before rebuilding the kit');
const builds: Record<string, Record<string, unknown>> = { [a]: {}, [b]: {} };
for (const label of [a, b]) for (const scene of scenes) {
  const source = resolve(root, 'packages', scene, 'dist', label, 'test');
  if (!existsSync(resolve(source, 'index.html'))) throw new Error(`No ${label} test build for ${scene}: bun scripts/build-scene.ts --scene ${scene} --mode test --label ${label}`);
  const record = JSON.parse(readFileSync(resolve(source, 'build.json'), 'utf8'));
  if (record.mode !== 'test' || record.scene !== scene) throw new Error(`${source} is not the ${scene} test build`);
  builds[label]![scene] = { source: posix(root, source), release: record.release, packSha256: record.packSha256, chunks: record.chunks.map((c: { name: string }) => c.name), buildSource: record.source };
}
for (const scene of scenes) if (JSON.stringify((builds[a]![scene] as { packSha256: string }).packSha256) !== JSON.stringify((builds[b]![scene] as { packSha256: string }).packSha256)) throw new Error(`${scene}: ${a} and ${b} carry different asset packs; an A/B compares code on one pack`);

await rm(kit, { recursive: true, force: true }); await mkdir(resolve(kit, 'runner'), { recursive: true }); await mkdir(resolve(kit, 'hub'), { recursive: true });
for (const label of [a, b]) for (const scene of scenes) await cp(resolve(root, 'packages', scene, 'dist', label, 'test'), resolve(kit, 'builds', label, scene), { recursive: true });
const bundle = await Bun.build({ entrypoints: [resolve(root, 'scripts/timing-ab.ts')], target: 'node', format: 'esm', outdir: resolve(kit, 'runner'), naming: 'timing-ab.mjs' });
if (!bundle.success) throw new AggregateError(bundle.logs, 'Runner bundle failed');

// Hub helpers: the 2026-09-30 hub campaign's session-environment method (tools/mkenv.py, common.session_env) and display
// record/restore (tools/env-record.sh, display-restore.sh), made standalone; plus a wrapper that holds off screen blanking.
await writeFile(resolve(kit, 'hub/mkenv.py'), `#!/usr/bin/env python3
"""Print export lines for the running Plasma session's display variables plus PRIME render offload, for eval in a shell.
The method of the 2026-09-30 hub campaign (tools/mkenv.py and common.session_env): plasmashell's environment is readable,
kwin_wayland's is not. Never substitutes headless."""
import pathlib, shlex, sys
KEYS = ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_ID']
for comm in ('plasmashell', 'kwin_wayland'):
    for proc in sorted(pathlib.Path('/proc').glob('[0-9]*/comm')):
        try:
            if proc.read_text().strip() != comm:
                continue
            data = dict(item.split('=', 1) for item in (proc.parent / 'environ').read_bytes().decode().split('\\0') if '=' in item)
        except (OSError, UnicodeError):
            continue
        if data.get('WAYLAND_DISPLAY') and data.get('DISPLAY'):
            for key in KEYS:
                if data.get(key):
                    print(f'export {key}={shlex.quote(data[key])}')
            print('export __NV_PRIME_RENDER_OFFLOAD=1')
            print('export __GLX_VENDOR_LIBRARY_NAME=nvidia')
            print(f'# session from {comm} pid {proc.parent.name}')
            sys.exit(0)
sys.exit('No readable Plasma session process; no display to use and no headless substitution')
`);
await writeFile(resolve(kit, 'hub/display.sh'), `#!/bin/bash
# Display mode for headed timing on the hub (owner rule: 120 Hz on its own display; record before, restore after).
#   hub/display.sh record  <dir> <tag>             kscreen-doctor -o and -j into <dir>/<tag>-display-*
#   hub/display.sh ensure  <dir> <tag> [hz=120]    record, then if an enabled output is not at ~hz, switch it to the mode of
#                                                  the same size at ~hz (prints what it did); otherwise changes nothing
#   hub/display.sh restore <dir> <before> <now>    record <now>; set any output whose mode, scale or position differs back
# Adapted from evidence/perf/hub-2026-09-30/tools (env-record.sh, display-restore.sh). User space only.
set -u
cmd="$1"; dir="$2"; tag="$3"; mkdir -p "$dir"
eval "$(python3 "$(dirname "$0")/mkenv.py")"
record() { kscreen-doctor -o 2>&1 | sed 's/\\x1b\\[[0-9;]*m//g' > "$dir/$1-display-outputs.txt"; kscreen-doctor -j > "$dir/$1-display.json" 2>&1; }
record "$tag"
case "$cmd" in
  record) python3 - "$dir/$tag-display.json" <<'PY'
import json, sys
for o in json.load(open(sys.argv[1]))['outputs']:
    cur = [m for m in o['modes'] if m['id'] == o['currentModeId']]
    print(o['name'], 'enabled', o['enabled'], 'mode', o['currentModeId'], cur[0]['name'] if cur else None, cur[0]['refreshRate'] if cur else None, 'scale', o.get('scale'), 'pos', o.get('pos'))
PY
  ;;
  ensure) python3 - "$dir/$tag-display.json" "\${4:-120}" <<'PY'
import json, subprocess, sys
want = float(sys.argv[2])
for o in json.load(open(sys.argv[1]))['outputs']:
    if not o['enabled']:
        continue
    cur = [m for m in o['modes'] if m['id'] == o['currentModeId']][0]
    if abs(cur['refreshRate'] - want) < 1.5:
        print(f"{o['name']}: mode {cur['id']} {cur['name']} at {cur['refreshRate']:.3f} Hz, already ~{want:g} Hz; nothing changed"); continue
    same = [m for m in o['modes'] if m['size'] == cur['size'] and abs(m['refreshRate'] - want) < 1.5]
    if not same:
        print(f"{o['name']}: no {cur['size']} mode at ~{want:g} Hz; left at {cur['refreshRate']:.3f} Hz"); continue
    cmd = ['kscreen-doctor', f"output.{o['name']}.mode.{same[0]['id']}"]
    print(f"{o['name']}: {cur['refreshRate']:.3f} Hz -> mode {same[0]['id']} at {same[0]['refreshRate']:.3f} Hz:", ' '.join(cmd))
    print(subprocess.run(cmd, capture_output=True, text=True).stdout)
PY
  ;;
  restore) now="$4"; record "$now"; python3 - "$dir/$tag-display.json" "$dir/$now-display.json" <<'PY'
import json, subprocess, sys
before = {o['name']: o for o in json.load(open(sys.argv[1]))['outputs']}
now = {o['name']: o for o in json.load(open(sys.argv[2]))['outputs']}
def mode(o):
    cur = [m for m in o['modes'] if m['id'] == o['currentModeId']]
    return f"{o['currentModeId']} {cur[0]['name'] if cur else None}@{cur[0]['refreshRate'] if cur else None}"
for name, b in before.items():
    n = now.get(name)
    if n is None:
        print(f'{name}: output missing now'); continue
    same = b['currentModeId'] == n['currentModeId'] and b.get('scale') == n.get('scale') and b.get('pos') == n.get('pos') and b['enabled'] == n['enabled']
    print(f"{name}: before {mode(b)} scale {b.get('scale')} pos {b.get('pos')}; now {mode(n)} scale {n.get('scale')} pos {n.get('pos')}; {'UNCHANGED, nothing to restore' if same else 'CHANGED, restoring'}")
    if not same:
        cmd = ['kscreen-doctor', f"output.{name}.mode.{b['currentModeId']}"]
        print(' '.join(cmd)); print(subprocess.run(cmd, capture_output=True, text=True).stdout)
PY
  ;;
  *) echo "usage: display.sh record|ensure|restore <dir> <tag> [...]"; exit 2;;
esac
`);
await writeFile(resolve(kit, 'hub/run.sh'), `#!/bin/bash
# Runs the timing runner headed on the hub's own display, from an SSH shell: the Plasma session's environment with PRIME
# offload (hub/mkenv.py), screen blanking, locking and notifications held off by kde-inhibit (which exits 0 whatever its
# child does, so the runner's exit code is echoed), and the hub's Chrome flags from the 2026-09-30 campaign (flags.txt):
# --ozone-platform=x11 --enable-features=Vulkan (the real NVIDIA WebGPU adapter) --start-fullscreen (the window is the panel).
#   hub/run.sh ab --cells farm:high:hero --pairs 3 --seconds 60 --block <name>
cd "$(dirname "$0")/.." || exit 2
eval "$(python3 hub/mkenv.py)" || exit 2
CHROME="\${CHROME:-/opt/google/chrome/chrome}"
kde-inhibit --power --screenSaver --notifications -- sh -c 'node runner/timing-ab.mjs "$@"; echo runner-exit=$?' sh "$@" \\
  --chrome "$CHROME" --chrome-arg --ozone-platform=x11 --chrome-arg --enable-features=Vulkan --chrome-arg --start-fullscreen
`);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--porcelain', '--', 'scripts/timing-ab.ts', 'scripts/make-timing-kit.ts', 'scripts/device-kit.ts', 'scripts/static-server.mjs'], { cwd: root, encoding: 'utf8' }).trim();
const kitName = posix(root, kit), kitDir = kitName.split('/').at(-1)!;
const cellsHub = 'farm:high:hero,golden-gate:minimal:arrival,foundry-floor:high:campus';
const fullHub = (t: string) => [`farm:${t}:hero`, `farm:${t}:living-orbit`, `farm:${t}:tractor-drive`, `golden-gate:${t}:arrival`, `golden-gate:${t}:orbit`, `golden-gate:${t}:drive`, `foundry-floor:${t}:campus`, `foundry-floor:${t}:drive`].join(',');
const readme = `Kiln scenes timing kit (S6, docs/plans/2026-10-01-draw-optimization-cycle.md): interleaved A/B frame time
A = ${a} (before), B = ${b} (after); scenes ${scenes.join(', ')}
Assembled ${today} (local date) by scripts/make-timing-kit.ts from the scenes workspace at ${commit.slice(0, 7)}${status ? ' (runner files uncommitted)' : ''}.
Nothing in this kit has been timed by the assembler.

WHAT IT MEASURES (owner decisions OD-3, OD-5, OD-6, OD-7, OD-12; D-25, D-28, D-41)
  For each cell (scene, tier, view or workload) the runner serves A and B itself on two loopback ports (4400-4489) and runs
  them interleaved, pair by pair, with the order alternating (A B, B A, A B, ...), each run on a fresh page load:
  idle display-rate probe on about:blank, load, ready, governor held at the tier's level 0, the view or workload engaged
  (scene clock running), a warm-up (5 s), then the sample (60 s for evidence; D-41 applies only to 60 s runs).
  Per run: rAF frame interval p50, p95, p99 and max; the share of frames within one and within two display refreshes
  (OD-7: interval < 1.5 and < 2.5 measured periods); D-41 hitch counts (frames over 50 ms, over 100 ms, longest frame);
  load samples during the run (hub: CPU and NVIDIA GPU utilisation every 5 s and the busiest processes outside the
  benchmark; tablet: battery temperature, thermal status and Mali GPU busy every 15 s); the kit's CPU time around
  renderer.render; renderer.info draw calls and triangles sampled every 30 frames (a cross-check that A and B draw the
  same content); the MSAA policy hook (msaaPolicy: absent in ${a}, {discard, active, tripped} where present).
  Before each block: the host preflight (hub: the sealed pilot's 8 x 2 s window, CPU mean < 5 %, max < 12 %, GPU <= 3 %,
  no screen locker, retried every 30 s up to --wait-quiet minutes; this PC: CPU < 20 %, GPU < 10 %; tablet: thermal
  status none or light, battery <= 35 C, then the pilot's tablet window CPU mean < 8 %, max < 12 %, GPU busy <= 3 %).
  Nothing is timed when it fails. Views and workloads per scene:
    farm           views ${['hero', 'opposite', 'top', 'eye-height', 'crops', 'fences', 'props', 'watermill-wheel', 'watermill-interior', 'house-interior', 'house-porch', 'house-window-out'].join(' ')}
                   workloads living-orbit living-route walk tractor-drive (src/play/workloads.ts)
    golden-gate    views arrival postcard pier topdown horizon deck tower span lanes sidewalk traffic (Day preset, capture=1)
                   workloads orbit flyover drive (src/camera/workloads.ts, src/play/Driving.tsx)
    foundry-floor  views campus pair canopy split bridge roundabout, fab-landing fab-overview fab-spine fab-litho fab-cluster
                   fab-stocker fab-gallery fab-section (entered through the arrival canopy); workload drive (the sedan)

CONTENTS
  builds/${a}/<scene>/   ${a} test builds (packages/<scene>/dist/${a}/test), served as A
  builds/${b}/<scene>/   ${b} test builds, served as B (same asset pack per scene as A; checked when the kit was made)
  runner/timing-ab.mjs   scripts/timing-ab.ts bundled for Node (ESM; puppeteer-core inside); Node 22.23.2 is the pin
  hub/run.sh             headed runner on the hub's display from SSH (session env, PRIME offload, kde-inhibit, hub flags)
  hub/mkenv.py           the Plasma session environment (2026-09-30 campaign method)
  hub/display.sh         display mode record / ensure 120 Hz / restore (kscreen-doctor)
  MANIFEST.json          every file with size and SHA-256, and each build's provenance

HUB (ssh hub; CachyOS, Plasma on Wayland, GTX 1660 Ti Max-Q with PRIME offload, eDP-1 1920x1080 at 120.11 Hz)
  Copy:   scp -r ${kitName} hub:kiln-hub/${kitDir}     (from the scenes workspace; then on the hub: cd ~/kiln-hub/${kitDir})
  0. node runner/timing-ab.mjs verify
  Each timing block (D=results/<block>):
  1. node runner/timing-ab.mjs quiet --out $D/quiet-before.json           (also run from this PC over ssh and kept beside the results)
  2. hub/display.sh ensure $D display-before 120                          (records the mode; switches to 120 Hz only if needed)
  3. hub/run.sh ab --a builds/${a} --b builds/${b} --cells <cells> --pairs <n> --seconds <s> --block <block>
  4. hub/display.sh restore $D display-before display-after
  Dry run (plumbing, 10 s, 1 pair, numbers not evidence):
     hub/run.sh ab --cells farm:high:hero,golden-gate:minimal:arrival,foundry-floor:high:campus --pairs 1 --seconds 10 --prime 0 --block dry-<date>
  MSAA-only A/B (${a} vs ${b}), 60 s, 3 pairs (about 35 minutes):
     hub/run.sh ab --cells ${cellsHub} --pairs 3 --seconds 60 --block msaa-<date>

TABLET (from this PC; Samsung SM-X518U, serial R52X405L12T; the device kit's adb at
        C:/Users/Mattm/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe)
  Run from this kit directory with the maintainer Node (C:/Users/Mattm/AppData/Roaming/fnm/node-versions/v22.23.2/installation/node.exe):
  node runner/timing-ab.mjs transient --device tablet --out results/transient-tablet.json          (read-only WebGPU check)
  node runner/timing-ab.mjs ab --device tablet --cells farm:minimal:hero --pairs 1 --seconds 10 --prime 0 --block tablet-dry-<date>
  node runner/timing-ab.mjs ab --device tablet --cells farm:minimal:hero,farm:economy:hero,golden-gate:minimal:arrival --pairs 3 --seconds 60 --block tablet-msaa-<date>
  Per run the runner maps only that run's port (adb reverse tcp:P tcp:P) and a DevTools forward (4495-4499), connects,
  opens one tab, measures, closes it, removes both mappings and records that the forward and reverse lists are empty;
  it refuses to start when mappings exist. It waits up to --cool-wait minutes (10) for thermal status none/light and a
  battery at or under 35 C before each run, stops the block if the tablet warms past that, and records battery
  temperature, thermal status and GPU busy before, during (every 15 s) and after each run. The tablet stays on its
  tier per D-25 (minimal); economy is measured for OD-12 only. Frame time is the tablet's own (vsync-bound at its panel
  rate, measured per run); readyMs is indicative (served from this PC over USB).

THIS PC (only when its quiet check passes; it is often under load)
  node runner/timing-ab.mjs quiet --rule pc        (exit 3 when not quiet: then do not time here)
  node runner/timing-ab.mjs ab --cells <cells> --pairs 3 --seconds 60 --block pc-<date>   (the block preflight applies the same rule)

FULL BEFORE/AFTER (pending the final optimized builds, label draw-after)
  In the scenes workspace:
    bun scripts/build-scene.ts --scene farm,foundry-floor,golden-gate --mode test --label draw-after
    bun scripts/make-timing-kit.ts --a draw-base --b draw-after
  Hub, per tier t in high balanced economy minimal (8 cells x 3 pairs x 2 sides x ~75 s, about 1 h per tier):
    hub/run.sh ab --a builds/draw-base --b builds/draw-after --cells <fullHub(t)> --pairs 3 --seconds 60 --block full-<t>-<date>
    with <fullHub(t)> = ${fullHub('<t>')}
  Tablet: --cells farm:minimal:hero,farm:minimal:tractor-drive,golden-gate:minimal:arrival,golden-gate:minimal:drive,foundry-floor:minimal:campus,foundry-floor:minimal:drive
    then the OD-12 economy row: --cells farm:economy:hero,farm:economy:tractor-drive,golden-gate:economy:arrival,foundry-floor:economy:campus

OUTPUT (results/<block>/)
  block.json       options, plan, builds (label, chunks, source), preflight or tablet cool/quiet records, browser, every run's
                   headline values and, on the tablet, the mapping lists after each run
  runs/<scene>-<tier>-<name>-pair<k>-<A|B>.json   one run: checks and validity, display rate, frame stats, refresh shares,
                   hitches and D-41 verdict, CPU render, draws, load before/during/after, busiest external processes,
                   environment (adapter, user agent, canvas buffer), every frame interval (frameIntervalsMs)
  summary.json, summary.md   per cell and side: median (min-max) over valid runs; paired B - A per pair with the median
                   difference and how many pairs B was lower or higher; p95 ratio B/A
  node runner/timing-ab.mjs summary --dir results/<block>   rebuilds the summary from runs/
  A run is valid only when the tier held at level 0, the scene clock advanced, the workload was engaged (and the camera
  moved for workloads), the page stayed visible without scene errors, the sample covered at least 90 % of its time and
  the display rate was measured and consistent with the frames. Repeat an invalid run's block; do not shorten it.

COPY BACK
  Copy results/<block>/ unchanged, with the quiet and display records, to
  C:/Users/Mattm/X/kiln-draw-optimization/scenes/evidence/perf/<host>-<YYYY-MM-DD>/ (ignored).
`;
await writeFile(resolve(kit, 'README.txt'), readme);
const files = walk(kit).map(f => posix(kit, f)).filter(p => p !== 'MANIFEST.json').sort().map(path => { const data = readFileSync(resolve(kit, path)); return { path, bytes: data.length, sha256: sha256(data) }; });
const runnerSource = await readFile(resolve(root, 'scripts/timing-ab.ts'));
await writeFile(resolve(kit, 'MANIFEST.json'), JSON.stringify({ schema: 'kiln.timing-kit/1', created: new Date().toISOString(), scenesCommit: commit, runnerFilesStatus: status || 'committed',
  labels: { A: a, B: b }, scenes, builds, runner: { source: 'scripts/timing-ab.ts', sourceSha256: sha256(runnerSource), bundled: 'runner/timing-ab.mjs', nodePin: '22.23.2' },
  totals: { files: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) }, files }, null, 2) + '\n');
console.log(JSON.stringify({ kit: kitName, files: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0), runnerBytes: files.find(f => f.path === 'runner/timing-ab.mjs')?.bytes }));
