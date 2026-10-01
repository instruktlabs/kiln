// Assembles the Farm device kit (TASK-M3.md item 5) at packages/farm/dist/device-kit: the test and dev outputs of one build
// label copied unchanged, the ADB check and run wrappers, a manifest with SHA-256 per file and the README.
// Usage: bun scripts/make-device-kit.ts --label m3 [--date 2026-09-29]
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { DEFAULT_ADB, TABLET_SERIAL } from './device-kit';

const args = process.argv.slice(2), root = resolve(import.meta.dir, '..');
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith('--') ? args[at + 1]! : fallback; };
const label = option('--label', 'm3'), kit = resolve(root, 'packages/farm/dist/device-kit');
const source = resolve(root, `packages/farm/dist/${label}`);
for (const mode of ['test', 'dev']) if (!existsSync(resolve(source, mode, 'index.html'))) throw new Error(`Build ${label} ${mode} first (scripts/build-farm.ts --release r34 --label ${label} --all)`);
await rm(kit, { recursive: true, force: true }); await mkdir(kit, { recursive: true });
for (const mode of ['test', 'dev']) await cp(resolve(source, mode), resolve(kit, 'scene', mode), { recursive: true });

async function files(dir: string, out: string[] = []): Promise<string[]> {
  for (const name of await readdir(dir)) { const path = resolve(dir, name); if ((await stat(path)).isDirectory()) await files(path, out); else out.push(path); }
  return out;
}
const checkDevice = `# Farm device kit: the ADB checks (adb devices, battery, thermal status, screen brightness), printed and saved under
# evidence/tablet-<date>/state/. Read-only on the tablet: nothing is installed and no setting changes.
param(
  [string]$Serial = $(if ($env:KILN_TABLET_SERIAL) { $env:KILN_TABLET_SERIAL } else { '${TABLET_SERIAL}' }),
  [string]$Adb = $(if ($env:KILN_ADB) { $env:KILN_ADB } else { '${DEFAULT_ADB}' }),
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd')
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\\..\\..\\..')).Path
$outDir = Join-Path $workspace "evidence\\tablet-$Date\\state"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# $(Get-Date -Format o) serial $Serial")
$lines.Add('# adb devices -l'); (& $Adb devices -l) | ForEach-Object { $lines.Add($_) }
$lines.Add('# dumpsys battery'); (& $Adb -s $Serial shell dumpsys battery) | ForEach-Object { $lines.Add($_) }
$thermal = & $Adb -s $Serial shell dumpsys thermalservice
$lines.Add('# thermal status and HAL temperatures'); $thermal | Select-String -Pattern 'Thermal Status|Temperature\\{' | ForEach-Object { $lines.Add($_.Line) }
$lines.Add('# screen brightness (0-255), mode (1 automatic), off timeout (ms), wakefulness')
$lines.Add((& $Adb -s $Serial shell settings get system screen_brightness))
$lines.Add((& $Adb -s $Serial shell settings get system screen_brightness_mode))
$lines.Add((& $Adb -s $Serial shell settings get system screen_off_timeout))
(& $Adb -s $Serial shell dumpsys power) | Select-String -Pattern 'mWakefulness=' | ForEach-Object { $lines.Add($_.Line.Trim()) }
$lines.Add('# port mappings on this serial (forward, then reverse)')
(& $Adb -s $Serial forward --list) | ForEach-Object { $lines.Add($_) }
(& $Adb -s $Serial reverse --list) | ForEach-Object { $lines.Add($_) }
$file = Join-Path $outDir ("adb-check-" + (Get-Date -Format 'HHmmss') + ".txt")
$lines | Set-Content -Encoding utf8 -Path $file
$lines
"Saved $file"
$status = ($thermal | Select-String -Pattern 'Thermal Status:\\s*(\\d+)' | Select-Object -First 1).Matches.Groups[1].Value
if ($status -ne '0') { Write-Error "STOP: tablet thermal status is $status (0 is none); wait until it is nominal"; exit 2 }
`;
const runTablet = `# Farm device kit: runs the tablet steps (scripts/run-farm-tablet.ts) against this kit's scene copies and writes every result
# into evidence/tablet-<date>/. Steps: state, b09, tier, soak, play, look (comma list).
param(
  [string]$Steps = 'state,b09,tier,soak,play,look',
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [int]$SoakSeconds = 210,
  [string]$Suffix = ''
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\\..\\..\\..')).Path
$extra = @(); if ($Suffix) { $extra = @('--suffix', $Suffix) }
& (Join-Path $workspace 'scripts\\toolchain-run.ps1') scripts/run-farm-tablet.ts --root packages/farm/dist/device-kit/scene --date $Date --steps $Steps --soak-seconds $SoakSeconds @extra
exit $LASTEXITCODE
`;
await writeFile(resolve(kit, 'check-device.ps1'), checkDevice);
await writeFile(resolve(kit, 'run-tablet.ps1'), runTablet);

const readme = `Farm device kit (M3, TASK-M3.md item 5), built ${(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date())} (local date) from build label ${label} (r34 pack)
===========================================================================================================

The owner's Samsung Galaxy Tab S9 FE 5G (SM-X518U, serial ${TABLET_SERIAL}, Android 16, Mali-G68) driven from this PC over USB.
The scene is served from this PC; nothing is installed on the tablet beyond the pages its Chrome opens, and no device
setting is changed.

Contents
  scene/test, scene/dev   the Farm test and dev outputs of build ${label}, copied unchanged (MANIFEST.json: SHA-256 per file)
  check-device.ps1        the ADB checks: adb devices, dumpsys battery, thermal status and HAL temperatures, screen
                          brightness, mode, off timeout and wakefulness, and this serial's port mappings; saved as
                          evidence/tablet-<date>/state/adb-check-<time>.txt; exits 2 with STOP if the thermal status is not 0
  run-tablet.ps1          the tablet runs (scripts/run-farm-tablet.ts in the scenes workspace) against scene/; every result is
                          written straight into evidence/tablet-<date>/ (nothing stays on the tablet)

Prerequisites
  - USB debugging authorised on the tablet: "adb devices" lists ${TABLET_SERIAL} in state "device".
  - adb: ${DEFAULT_ADB}
    (override with KILN_ADB; the serial with KILN_TABLET_SERIAL). The kit uses the adb client only: it never starts,
    kills or restarts the adb server, which other tools share.
  - The scenes workspace toolchain (Bun 1.4.2 through scripts/toolchain-run.ps1), run from
    C:/Users/Mattm/X/kiln-commons/scenes.

How the tablet reaches the scene and how this PC reaches the tablet's Chrome
  - Scene: each run starts its own static server on the first free port P in 4400-4499 on 127.0.0.1 and maps the same
    port on the tablet with "adb reverse tcp:P tcp:P", so the tablet's Chrome opens http://127.0.0.1:P/ (a secure
    context, so pages may hold a screen wake lock).
  - DevTools: "adb forward --no-rebind tcp:Q localabstract:chrome_devtools_remote" with Q = 4499, 4498 ... 4495 (the first
    port not already mapped); puppeteer connects to http://127.0.0.1:Q. Touch goes through the DevTools protocol
    (Input.dispatchTouchEvent) into the device's own input pipeline at its real screen size; no touch emulation.
  - Every run removes exactly the mappings it made ("adb reverse --remove tcp:P", "adb forward --remove tcp:Q") and
    records the mapping lists before and after. Mappings of other tools are left alone (the Golden Gate builder uses
    4600-4649). Only tabs a run opens are touched, and they are closed at the end.
  - A run wakes the screen ("input keyevent KEYCODE_WAKEUP") and brings Chrome to the front
    ("am start -n com.android.chrome/com.google.android.apps.chrome.Main"); its pages request a screen wake lock.

Device rules
  - The device state is recorded before and after every result: battery level, temperature and charging state; HAL
    temperatures (AP, SKIN, BAT, PA); thermal status; screen brightness and mode; wakefulness; display refresh mode.
  - A thermal status other than 0 (none) stops the run; the summary says STOP and why.
  - Frame time on the tablet is the tablet's own and is valid with its device state recorded (Chrome's frames follow the
    panel's refresh, 60 or 90 Hz, recorded as display.renderFrameRate). Time to ready on the tablet is indicative only
    while this PC is under load: this PC's load sample (scripts/load-sample.ps1) is recorded beside it.

Commands (PowerShell, from C:/Users/Mattm/X/kiln-commons/scenes)
  pwsh -NoProfile -File packages/farm/dist/device-kit/check-device.ps1
  pwsh -NoProfile -File packages/farm/dist/device-kit/run-tablet.ps1 -Steps state,b09,tier,soak,play,look

Steps (evidence/tablet-<date>/)
  state   state/state-<time>.json: adb devices, device state, mappings, this PC's load sample
  b09     b09-webgpu/, b09-webgl2/: the B-09 flows with real touch (scripts/run-farm-mobile.ts, device target): joystick
          walk and drive, drag look, pinch limits, Interact on the farmhouse door, tractor mount and dismount, one
          context button, HUD layout at the device size, axe on the touch HUD, page scroll outside the scene
  tier    tier/tier-auto.json, tier/tier-webgl2.json: the tier the classification assigns from the real adapter strings
          (WebGPU adapter info, WebGL2 unmasked renderer), checked against classifyDevice on the page's own probe; time to
          ready (indicative) with the PC load sample
  soak    soak/<tier>-<workload>.json: the live governor over 210 s of living-orbit on the assigned tier and on forced high
          (X-10: changes per minute, reversals, locks) with every frame interval, and 60 s of living-route and
          tractor-drive on the assigned tier (SPEC 20.2 tablet target: 30 FPS, p95 under 33.3 ms, no task over 100 ms)
  play    play-webgl2/device/, play-webgl2/parity/: the WebGL2 play positions yard, house porch and bridge, on the
          tablet's own view and tier with the HUD, and in the parity framing (1280 x 720 at DPR 1, tier high, HUD hidden)
  look    look-webgpu/: frame time per tier (economy, minimal, balanced, high) for every look preset of the dev build, and
          the economy captures of the contact-sheet views (scripts/run-farm-look.ts --target tablet)
  --suffix <name> (run-tablet.ps1 -Suffix, or the runner option) writes a later run beside the earlier files: b09-<backend>-<name>/,
          tier/tier-<backend>-<name>.json, summary-<steps>-<name>.json
  summary-<steps>.json: status per step, the mappings and the device state at the end.
`;
await writeFile(resolve(kit, 'README.txt'), readme);
const all = await files(kit), manifest = { schema: 'kiln.farm-device-kit/1', created: new Date().toISOString(), label, release: 'r34', source: `packages/farm/dist/${label}`, adb: DEFAULT_ADB, serial: TABLET_SERIAL, ports: '4400-4499 (scene server and DevTools forward)',
  files: await Promise.all(all.map(async path => { const bytes = await readFile(path); return { path: relative(kit, path).split(sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; })) };
await writeFile(resolve(kit, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ kit: relative(root, kit).split(sep).join('/'), files: manifest.files.length + 1, bytes: manifest.files.reduce((s, f) => s + f.bytes, 0) }));
