// Device kit helpers (TASK-M3.md item 5): the owner's Galaxy Tab S9 FE driven from this PC over USB with adb.
// Only this PC's adb client is used: it reads device state, maps this run's own ports (adb reverse for the scene server,
// adb forward to Chrome's DevTools socket, both on 4400-4499) and removes exactly those mappings again. Nothing is
// installed on the device, no device setting is changed, and the adb server is never started or stopped here.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { DeviceTarget } from './run-farm-mobile';

/** This PC's load, recorded beside anything indicative (TASK.md): CPU total %, GPU 3D % and process counts from scripts/load-sample.ps1, or os.cpus over one second without PowerShell. */
export async function pcLoadSample(workspace: string): Promise<Record<string, unknown>> {
  const script = resolve(workspace, 'scripts/load-sample.ps1');
  if (process.platform === 'win32' && existsSync(script)) return new Promise(done => execFile('pwsh', ['-NoProfile', '-File', script], { timeout: 30_000, windowsHide: true }, (error, stdout) => {
    if (error) { done({ error: String(error) }); return; } try { done(JSON.parse(String(stdout).trim())); } catch { done({ error: 'unparsed load sample', raw: String(stdout).slice(0, 400) }); } }));
  const sample = () => cpus().reduce((sum, cpu) => { const t = cpu.times; return { idle: sum.idle + t.idle, total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq }; }, { idle: 0, total: 0 });
  const a = sample(); await new Promise(done => setTimeout(done, 1000)); const b = sample();
  return { at: new Date().toISOString(), cpuTotalPercent: b.total > a.total ? Math.round(1000 * (1 - (b.idle - a.idle) / (b.total - a.total))) / 10 : null, gpu3dPercent: null, method: 'os.cpus over 1 s' };
}

export const DEFAULT_ADB = 'C:/Users/Mattm/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe';
export const TABLET_SERIAL = 'R52X405L12T';
/** Android PowerManager thermal status codes (THERMAL_STATUS_*). */
export const THERMAL_STATUS = ['none', 'light', 'moderate', 'severe', 'critical', 'emergency', 'shutdown'] as const;
const BATTERY_STATUS: Record<string, string> = { '1': 'unknown', '2': 'charging', '3': 'discharging', '4': 'not charging', '5': 'full' };

export interface Adb { serial: string; path: string; run(args: string[], timeoutMs?: number): Promise<string>; shell(command: string): Promise<string> }
export function adbFor(serial = process.env.KILN_TABLET_SERIAL ?? TABLET_SERIAL, path = process.env.KILN_ADB ?? DEFAULT_ADB): Adb {
  const run = (args: string[], timeoutMs = 30_000) => new Promise<string>((accept, reject) => execFile(path, ['-s', serial, ...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    (error, stdout, stderr) => error ? reject(new Error(`adb ${args.join(' ')}: ${stderr || error.message}`)) : accept(String(stdout))));
  return { serial, path, run, shell: command => run(['shell', command]) };
}

/** `adb devices -l` (all attached devices; the kit then addresses only its serial). */
export async function adbDevices(path = process.env.KILN_ADB ?? DEFAULT_ADB): Promise<{ raw: string; devices: { serial: string; state: string; detail: string }[] }> {
  const raw = await new Promise<string>((accept, reject) => execFile(path, ['devices', '-l'], { timeout: 30_000, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(`adb devices: ${stderr || error.message}`)) : accept(String(stdout))));
  const devices = raw.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean).map(line => { const [serial = '', state = '', ...rest] = line.split(/\s+/); return { serial, state, detail: rest.join(' ') }; });
  return { raw, devices };
}

export interface DeviceState {
  at: string; model: string; android: string; chrome: string | null;
  battery: { level: number; temperatureC: number; status: string; usbPowered: boolean; acPowered: boolean };
  thermal: { status: number; name: string; nominal: boolean; temperaturesC: Record<string, number> };
  screen: { brightness: number; brightnessMode: 'automatic' | 'manual' | string; wakefulness: string; keyguardShowing: boolean | null; offTimeoutMs: number | null };
  display: { state: string | null; mode: number | null; renderFrameRate: number | null };
}
const field = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? null;
/** Battery, temperature, thermal status, brightness and screen state: recorded beside every tablet result. */
export async function deviceState(adb: Adb): Promise<DeviceState> {
  const [battery, thermal, brightness, mode, power, chrome, model, android, keyguard, timeout, display] = await Promise.all([
    adb.shell('dumpsys battery'), adb.shell('dumpsys thermalservice'), adb.shell('settings get system screen_brightness'), adb.shell('settings get system screen_brightness_mode'),
    adb.shell('dumpsys power'), adb.shell('dumpsys package com.android.chrome'), adb.shell('getprop ro.product.model'), adb.shell('getprop ro.build.version.release'),
    adb.shell('dumpsys window | grep isKeyguardShowing'), adb.shell('settings get system screen_off_timeout'), adb.shell('dumpsys display | grep mOverrideDisplayInfo')]);
  const status = Number(field(thermal, /Thermal Status:\s*(\d+)/) ?? NaN);
  // "Current temperatures from HAL": AP (the SoC), SKIN, BAT, PA and so on, in degrees C (read-only; zero means no sensor).
  const hal = thermal.split(/Current temperatures from HAL:/)[1]?.split(/Current cooling devices/)[0] ?? '';
  const temperaturesC = Object.fromEntries([...hal.matchAll(/mValue=(-?[\d.]+), mType=\d+, mName=(\w+)/g)].filter(m => Number(m[1]) !== 0).map(m => [m[2]!, Number(m[1])]));
  const keyguardShowing = field(keyguard, /isKeyguardShowing=(\w+)/), displayMode = field(display, /\bmode (\d+), renderFrameRate/), frameRate = field(display, /renderFrameRate ([\d.]+)/);
  return {
    at: new Date().toISOString(), model: model.trim(), android: android.trim(),
    // The first versionName is the installed update; the second, when present, is the factory image.
    chrome: field(chrome, /versionName=([^\s]+)/),
    battery: { level: Number(field(battery, /\blevel:\s*(\d+)/)), temperatureC: Number(field(battery, /\btemperature:\s*(\d+)/)) / 10,
      status: BATTERY_STATUS[field(battery, /\bstatus:\s*(\d+)/) ?? ''] ?? 'unknown', usbPowered: field(battery, /USB powered:\s*(\w+)/) === 'true', acPowered: field(battery, /AC powered:\s*(\w+)/) === 'true' },
    thermal: { status, name: THERMAL_STATUS[status] ?? 'unknown', nominal: status === 0, temperaturesC },
    screen: { brightness: Number(brightness.trim()), brightnessMode: mode.trim() === '1' ? 'automatic' : mode.trim() === '0' ? 'manual' : mode.trim(), wakefulness: field(power, /mWakefulness=(\w+)/) ?? 'unknown',
      keyguardShowing: keyguardShowing === null ? null : keyguardShowing === 'true', offTimeoutMs: Number.isFinite(Number(timeout.trim())) ? Number(timeout.trim()) : null },
    display: { state: field(display, /\bstate (\w+), committedState/), mode: displayMode === null ? null : Number(displayMode), renderFrameRate: frameRate === null ? null : Number(frameRate) },
  };
}
/** Stop rule (TASK-M3.md): the device must be quiet and cool; a thermal status other than none stops the run. */
export async function requireNominal(adb: Adb, when: string): Promise<DeviceState> {
  const state = await deviceState(adb);
  if (!state.thermal.nominal) throw new Error(`STOP: tablet thermal status is ${state.thermal.name} (${state.thermal.status}) ${when}; the run stops until it is nominal again`);
  return state;
}

const owned = (port: number) => assert(Number.isInteger(port) && port >= 4400 && port <= 4499, `Device kit ports stay in 4400-4499 (got ${port})`);
/** Existing mappings, read before and after a run so that only this run's own entries are ever removed. */
export async function listMappings(adb: Adb) {
  const [forward, reverse] = await Promise.all([adb.run(['forward', '--list']), adb.run(['reverse', '--list'])]);
  const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return { forward: lines(forward).filter(line => line.startsWith(adb.serial)), reverse: lines(reverse) };
}
export async function reversePort(adb: Adb, port: number) { owned(port); await adb.run(['reverse', `tcp:${port}`, `tcp:${port}`]); }
export async function removeReverse(adb: Adb, port: number) { owned(port); await adb.run(['reverse', '--remove', `tcp:${port}`]); }
/** Chrome's DevTools socket on this PC. adb binds the local port itself; a busy port fails the bind and the next one is tried. */
export async function forwardDevtools(adb: Adb, ports: readonly number[] = [4499, 4498, 4497, 4496, 4495]): Promise<{ port: number; browserURL: string }> {
  const existing = (await listMappings(adb)).forward;
  for (const port of ports) {
    owned(port);
    if (existing.some(line => line.includes(`tcp:${port} `))) continue;
    try { await adb.run(['forward', '--no-rebind', `tcp:${port}`, 'localabstract:chrome_devtools_remote']); return { port, browserURL: `http://127.0.0.1:${port}` }; }
    catch { /* busy on this PC; try the next port */ }
  }
  throw new Error('No free device kit port for the DevTools forward');
}
export async function removeForward(adb: Adb, port: number) { owned(port); await adb.run(['forward', '--remove', `tcp:${port}`]); }
/** Connects to the device Chrome through this run's forward; Chrome may need a few seconds after `am start` to open its socket. */
export async function connectDevtools(browserURL: string, timeoutMs = 20_000): Promise<Browser> {
  const until = Date.now() + timeoutMs; let last: unknown;
  while (Date.now() < until) {
    try { return await puppeteer.connect({ browserURL, defaultViewport: null, protocolTimeout: 180_000 }); } catch (error) { last = error; await new Promise(done => setTimeout(done, 1000)); }
  }
  throw new Error(`No DevTools connection through ${browserURL}: ${String(last)}`);
}
/** Wakes the screen and brings Chrome to the front (opening Chrome is the only app action the kit takes). */
export async function wakeAndOpenChrome(adb: Adb) {
  await adb.shell('input keyevent KEYCODE_WAKEUP');
  await adb.shell('am start -n com.android.chrome/com.google.android.apps.chrome.Main');
}
/** The `DeviceTarget` shape the Farm runners take: this run's reverse mapping and device state beside the result. */
export function tabletTarget(adb: Adb, browserURL: string): DeviceTarget {
  return { browserURL, onServe: port => reversePort(adb, port), onClose: port => removeReverse(adb, port), state: () => deviceState(adb) };
}
