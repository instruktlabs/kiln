import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, CDPSession, Page } from 'puppeteer-core';
import axe from 'axe-core';
import { assertOwnedUrl, contrastRatio, launchChrome, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { DOOR_LABELS, doorPrompt, doorStatus, FARM_STRINGS } from '../packages/farm/src/ui/strings';
import { FARM_CAMERA, FARM_DOORS, FARM_WALK } from '../packages/farm/src/constants';
import { closeExtraStartupPages } from './browser-startup';

/**
 * B-09 mobile flows (SPEC 14 and 18, D-22) on the Farm test output, driven by touch: CDP
 * `Input.dispatchTouchEvent` through puppeteer's touchscreen, never by test hooks. Hooks only place
 * Rowan or the tractor at the B-08 oracle spots (evidence/m2/play/oracle.json) and read state.
 *
 * Two targets:
 * - emulated (default): headless Chrome on this PC with touch emulation (`Emulation.setTouchEmulationEnabled`),
 *   a 412 by 915 CSS px phone at DPR 2.8125 with an Android user agent, plus the 360-430 px layout matrix,
 *   the safe-area override and the mouse layouts that cover the site's 390 px defect;
 * - device: a real Chrome reached over `adb forward` (see packages/farm/dist/device-kit), where the same touch
 *   events are dispatched into the device's own input pipeline at its real screen size.
 * No timing is collected: hold lengths are input durations, and every check is a position, count or text.
 */
const TIMEOUT = 120_000;
const PHONE = { width: 412, height: 915, dpr: 2.8125 } as const;
const LAYOUTS = [[360, 740], [390, 844], [430, 932], [740, 360], [844, 390], [932, 430]] as const;
const fallbackWarning = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/;
type Vec = [number, number, number];
type Backend = 'webgpu' | 'webgl2';
interface Diagnostic { kind: string; type?: string; text: string; url?: string }
interface Pose { position: Vec; target: Vec; fov?: number }
interface Rect { x: number; y: number; width: number; height: number }
interface Control { kind: string; text: string; rect: Rect }
interface LayoutRecord { name: string; viewport: [number, number]; root: Rect; hudClass: string; controls: Control[]; help: Rect | null; problems: string[]; screenshot?: string }
interface Sample { t: number; p: Vec; tractor: Vec; yaw: number; speed: number; status: string; driving: boolean; active: boolean; blocked: number; camera: Pose | null }
interface Step { name: string; status: 'pass' | 'fail' | 'skipped'; details?: unknown; error?: string }
interface Scenario { stands: Record<string, Vec>; doorIds: Record<keyof typeof DOOR_LABELS, string>; walk: { start: [number, number, number, number] }; drive: [number, number, number, number] }
export interface DeviceTarget {
  /** DevTools endpoint on this PC (an `adb forward` port in 4400-4499). */
  browserURL: string;
  /** Called with the owned server port before the page loads (the device kit maps it with `adb reverse`). */
  onServe?(port: number): Promise<void>;
  /** Called after the server closes; the device kit removes its own mapping. */
  onClose?(port: number): Promise<void>;
  /** Device state recorded beside the result (battery, thermal, brightness). */
  state?(): Promise<unknown>;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const flatLength = (v: Vec) => Math.hypot(v[0], v[2]);
const flatUnit = (v: Vec): Vec => { const l = flatLength(v); return [v[0] / l, 0, v[2] / l]; };
const flatDot = (a: Vec, b: Vec) => a[0] * b[0] + a[2] * b[2];
const flatDistance = (a: Vec, b: Vec) => flatLength(sub(a, b));
const distance = (a: Vec, b: Vec) => Math.hypot(...sub(a, b));
const forwardOf = (pose: Pose) => flatUnit(sub(pose.target, pose.position));
const rightOf = (f: Vec): Vec => [-f[2], 0, f[0]];
const degrees = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, flatDot(a, b)))) * 180 / Math.PI;
const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places;
const middle = (r: Rect): [number, number] => [r.x + r.width / 2, r.y + r.height / 2];

async function configurePage(page: Page, ports: ReadonlySet<number>, diagnostics: Diagnostic[]) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  page.on('console', message => diagnostics.push({ kind: 'console', type: message.type(), text: message.text(), url: message.location().url }));
  page.on('pageerror', error => diagnostics.push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', request => diagnostics.push({ kind: 'requestfailed', text: request.failure()?.errorText ?? '', url: request.url() }));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (/^(data|blob):/.test(url)) { void request.continue(); return; }
    try { assertOwnedUrl(url, ports); void request.continue(); }
    catch (error) { diagnostics.push({ kind: 'unowned-request-blocked', text: String(error), url }); void request.abort('blockedbyclient'); }
  });
}
const badDiagnostics = (messages: Diagnostic[]) => messages.filter(m => m.kind !== 'console' || m.type === 'error' || (m.type === 'warn' && !fallbackWarning.test(m.text)));

/** Android Chrome identity for the emulated phone (user agent reduction format), from the installed Chrome's major version. */
async function emulatePhone(page: Page, version: string, size: { width: number; height: number; dpr: number }): Promise<CDPSession> {
  const major = /\/(\d+)\./.exec(version)?.[1] ?? '154';
  await page.setUserAgent({ userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`,
    userAgentMetadata: { brands: [{ brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }], fullVersion: `${major}.0.0.0`, platform: 'Android', platformVersion: '15.0.0', architecture: '', model: 'SM-S926U', mobile: true } });
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dpr, isMobile: true, hasTouch: true, isLandscape: size.width > size.height });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return cdp;
}

const state = (page: Page) => page.evaluate(() => (window as any).__kilnScene.simState());
const hook = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n: string, a: unknown[]) => (window as any).__kilnScene[n](...a), name, args);
const pose = (page: Page): Promise<Pose> => page.evaluate(() => { const p = (window as any).__kilnScene.cameraPose(); return { position: [...p.position], target: [...p.target], fov: p.fov }; }) as Promise<Pose>;
function hud(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const joystick = document.querySelector('.ks-joystick');
    return { mode: document.querySelector('.ks-toolbar button')?.textContent ?? null, helpExpanded: document.querySelector('.ks-help-button')?.getAttribute('aria-expanded') ?? null,
      help: document.querySelector('.ks-help')?.textContent ?? null, status: document.querySelector('.ks-status')?.textContent ?? null,
      touchButtons: [...document.querySelectorAll('.ks-touch-button')].filter(shown).map(button => button.textContent ?? ''),
      joystick: shown(joystick) ? joystick.getAttribute('aria-label') : null,
      interactPrompt: shown(document.querySelector('.ks-interact')), exitPlay: !!document.querySelector('.ks-exit-play'),
      cameraPad: !!document.querySelector('[role="group"][aria-label="Camera controls"]'), resetView: shown(document.querySelector('.farm-reset-view')),
      hudClass: document.querySelector('.farm-hud')?.className ?? null };
  });
}
async function rectOf(page: Page, selector: string, text?: string): Promise<Rect> {
  const rect = await page.evaluate((s: string, t: string | null) => {
    const el = [...document.querySelectorAll<HTMLElement>(s)].find(e => e.getClientRects().length > 0 && (t === null || e.textContent === t));
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector, text ?? null);
  assert(rect, `${selector}${text ? ` "${text}"` : ''} is on screen`); return rect;
}
/**
 * Chrome's gesture detector suppresses a tap that lands within a few hundred ms of the end of a drag, pinch or stick hold
 * (measured: a tap 0.1 s after a drag gave no click, 0.6 s after gave one). A person does not tap that fast after a
 * gesture, so taps wait out this settle; it is an input spacing, not a measurement.
 */
let settleUntil = 0;
const settled = () => { settleUntil = Date.now() + 600; };
async function tap(page: Page, selector: string, text?: string) {
  const wait = settleUntil - Date.now(); if (wait > 0) await new Promise(accept => setTimeout(accept, wait));
  const [x, y] = middle(await rectOf(page, selector, text)); await page.touchscreen.tap(x, y);
}
async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const touch = await page.touchscreen.touchStart(from[0], from[1]);
  try { for (let i = 1; i <= steps; i++) await touch.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); }
  finally { await touch.end(); settled(); }
}
/** Two fingers on a horizontal line about `at`, moving from `fromHalf` to `toHalf` px apart on each side (a pinch closes, a spread opens). */
async function pinch(page: Page, at: [number, number], fromHalf: number, toHalf: number, steps = 12, shift: [number, number] = [0, 0]) {
  const a = await page.touchscreen.touchStart(at[0] - fromHalf, at[1]), b = await page.touchscreen.touchStart(at[0] + fromHalf, at[1]);
  try {
    for (let i = 1; i <= steps; i++) {
      const half = fromHalf + (toHalf - fromHalf) * i / steps, dx = shift[0] * i / steps, dy = shift[1] * i / steps;
      await a.move(at[0] - half + dx, at[1] + dy); await b.move(at[0] + half + dx, at[1] + dy);
    }
  } finally { await b.end(); await a.end(); settled(); }
}
/** Per-frame samples of play state and the camera pose for `ms` of wall time. */
function sample(page: Page, ms: number): Promise<Sample[]> {
  return page.evaluate((duration: number) => new Promise<Sample[]>(done => {
    const api = (window as any).__kilnScene, out: Sample[] = [], start = performance.now();
    const tick = () => {
      const s = api.simState(), c = api.cameraPose();
      out.push({ t: performance.now() - start, p: s.player.position, tractor: s.tractor.position, yaw: s.tractor.yaw, speed: s.tractor.speed, status: s.status,
        driving: s.driving, active: s.active, blocked: s.blockedSteps, camera: c ? { position: [...c.position], target: [...c.target] } as Pose : null });
      if (performance.now() - start < duration) requestAnimationFrame(tick); else done(out);
    };
    requestAnimationFrame(tick);
  }), ms);
}
/** Hold the joystick with a finger at each offset in turn (CSS px from its centre; y down is back), sampling while held. */
async function holdStick(page: Page, legs: readonly (readonly [number, number, number])[]): Promise<Sample[][]> {
  const [cx, cy] = middle(await rectOf(page, '.ks-joystick')), touch = await page.touchscreen.touchStart(cx, cy), out: Sample[][] = [];
  try {
    for (const [dx, dy, ms] of legs) { await touch.move(cx + dx / 2, cy + dy / 2); await touch.move(cx + dx, cy + dy); out.push(await sample(page, ms)); }
    return out;
  } finally { await touch.end(); settled(); }
}
const waitStatus = (page: Page, text: string, timeout = 8_000) => page.waitForFunction(value => document.querySelector('.ks-status')?.textContent === value, { timeout }, text);
/** Exactly one context tap target, with this text. */
const waitButton = (page: Page, text: string, timeout = 5_000) => page.waitForFunction(value => {
  const shown = [...document.querySelectorAll('.ks-touch-button')].filter(button => button.getClientRects().length > 0);
  return shown.length === 1 && shown[0]!.textContent === value;
}, { timeout }, text);
const waitNoButton = (page: Page, timeout = 5_000) => page.waitForFunction(() => [...document.querySelectorAll('.ks-touch-button')].every(button => button.getClientRects().length === 0), { timeout });
function waitDoor(page: Page, id: string, target: number, timeout = 15_000) {
  return page.waitForFunction((door: string, goal: number) => {
    const s = (window as any).__kilnScene.simState(), d = s.doors.find((entry: { id: string }) => entry.id === door);
    return !!d && d.target === goal && Math.abs(d.amount - goal) < .001 && s.status === '';
  }, { timeout }, id, target);
}
const waitStopped = (page: Page, timeout = 8_000) => page.waitForFunction(() => Math.abs((window as any).__kilnScene.simState().tractor.speed) < .005, { timeout });
/** A point on the canvas clear of every HUD control (the upper middle of the scene). */
async function canvasPoint(page: Page, fy = .4): Promise<[number, number]> { const r = await rectOf(page, '.ks-root'); return [r.x + r.width / 2, r.y + r.height * fy]; }

/** Rectangles of every visible HUD control; overlaps and escapes from the scene or viewport are problems. */
async function layout(page: Page, name: string): Promise<LayoutRecord> {
  const record = await page.evaluate((layoutName: string) => {
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const shown = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const root = document.querySelector('.ks-root')!, controls: { kind: string; text: string; rect: ReturnType<typeof box> }[] = [];
    const add = (kind: string, selector: string) => { for (const el of document.querySelectorAll(selector)) if (shown(el)) controls.push({ kind, text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48), rect: box(el) }); };
    add('toolbar', '.ks-toolbar > button'); add('camera', '.farm-camera button'); add('joystick', '.ks-joystick'); add('context', '.ks-touch-button');
    add('interact', '.ks-interact'); add('status', '.ks-status');
    const help = document.querySelector('.ks-help');
    return { name: layoutName, viewport: [innerWidth, innerHeight] as [number, number], root: box(root), hudClass: document.querySelector('.farm-hud')?.className ?? '', controls,
      help: help && shown(help) ? box(help) : null, problems: [] as string[] };
  }, name);
  const inside = (r: Rect, outer: Rect) => r.x >= outer.x - .5 && r.y >= outer.y - .5 && r.x + r.width <= outer.x + outer.width + .5 && r.y + r.height <= outer.y + outer.height + .5;
  const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5;
  const viewport: Rect = { x: 0, y: 0, width: record.viewport[0], height: record.viewport[1] };
  for (const c of record.controls) {
    if (!inside(c.rect, record.root)) record.problems.push(`${c.kind} "${c.text}" leaves the scene`);
    if (!inside(c.rect, viewport)) record.problems.push(`${c.kind} "${c.text}" leaves the viewport`);
    if (c.kind !== 'status' && (c.rect.width < 44 || c.rect.height < 44)) record.problems.push(`${c.kind} "${c.text}" is smaller than 44 px (${round(c.rect.width, 1)} x ${round(c.rect.height, 1)})`);
  }
  record.controls.forEach((a, i) => record.controls.slice(i + 1).forEach(b => { if (overlap(a.rect, b.rect)) record.problems.push(`${a.kind} "${a.text}" overlaps ${b.kind} "${b.text}"`); }));
  if (record.help) {
    if (!inside(record.help, record.root)) record.problems.push('help panel leaves the scene');
    for (const c of record.controls.filter(c => c.kind === 'toolbar')) if (overlap(record.help, c.rect)) record.problems.push(`help panel overlaps toolbar "${c.text}"`);
  }
  return record;
}

export interface MobileRunOptions { workspace?: string; backend: Backend; label: string; root?: string; out?: string; device?: DeviceTarget }
export async function runFarmMobile(o: MobileRunOptions) {
  const workspace = resolve(o.workspace ?? process.cwd()), device = o.device;
  const out = workspacePath(workspace, o.out ?? `evidence/m3/b09/${o.label}-${o.backend}`); assert(!existsSync(out), `Refusing to overwrite existing B-09 evidence (${out})`);
  await mkdir(resolve(out, 'layout'), { recursive: true });
  const oracle = JSON.parse(await readFile(workspacePath(workspace, 'evidence/m2/play/oracle.json'), 'utf8'));
  const scenario = oracle.scenario as Scenario, stands = scenario.stands;
  const steps: Step[] = [], diagnostics: Diagnostic[] = [], layouts: LayoutRecord[] = [], ledger: Record<string, unknown> = { runnerPid: process.pid };
  const report: Record<string, unknown> = { schema: 'kiln.farm-b09/1', date: new Date().toISOString(), backend: o.backend, label: o.label, target: device ? 'device' : 'emulated',
    conditions: { profile: device ? 'the device\'s own screen, user agent and touch digitiser path (CDP Input.dispatchTouchEvent into the device Chrome)' : { ...PHONE, userAgent: 'Android Chrome (reduced UA)', touch: 'Emulation.setTouchEmulationEnabled + Input.dispatchTouchEvent', headless: true, windowSize: [PHONE.width, PHONE.height] },
      governor: 'held with an empty synthetic trace', hooks: 'placePlayer / placeTractor place state; simState and cameraPose read it; no hook drives play', timing: 'not collected' },
    steps, layouts, diagnostics, ledger };
  const save = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined, page: Page | undefined, desktop: Page | undefined, mapped = false;
  const step = async (name: string, fn: () => Promise<unknown>, when = true) => {
    const entry: Step = { name, status: when ? 'fail' : 'skipped' }; steps.push(entry);
    if (when) { try { entry.details = await fn(); entry.status = 'pass'; } catch (error) { entry.error = error instanceof Error ? error.stack ?? error.message : String(error); } }
    console.log(`B-09 ${o.backend} ${name}: ${entry.status.toUpperCase()}${entry.error ? ' ' + entry.error.split('\n')[0] : ''}`); await save();
    return entry.status === 'pass';
  };
  const shoot = async (p: Page, record: LayoutRecord) => {
    const file = `layout/${record.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.jpg`;
    await p.screenshot({ path: resolve(out, file) as `${string}.jpg`, type: 'jpeg', quality: 60 }); record.screenshot = file; layouts.push(record); return record;
  };
  try {
    hosted = await serveOwned(workspacePath(workspace, o.root ?? 'packages/farm/dist/test')); ledger.server = { port: hosted.port, pid: process.pid };
    if (device) { await device.onServe?.(hosted.port); mapped = true; ledger.deviceStateBefore = await device.state?.(); }
    browser = device ? await puppeteer.connect({ browserURL: device.browserURL, defaultViewport: null })
      : await launchChrome({ workspace, name: `b09-${o.backend}`, windowSize: [PHONE.width, PHONE.height] });
    ledger.browserPid = device ? 'device Chrome (not owned; only this run\'s tab is closed)' : browser.process()?.pid;
    report.browser = await browser.version();
    if (!device) await closeExtraStartupPages(browser);
    const p = page = await browser.newPage(); await configurePage(p, new Set([hosted.port]), diagnostics);
    // A device has a real touch screen: no emulation there, only the dispatched touch events.
    const cdp = device ? await p.createCDPSession() : await emulatePhone(p, String(report.browser), PHONE);
    const url = new URL(hosted.url); if (o.backend === 'webgl2') url.searchParams.set('backend', 'webgl2'); report.url = url.href;
    // A device keeps its Chrome profile between runs, so this run's own origin starts clean (the stored help dismissal and
    // earned tier of an earlier run on the same port would otherwise carry over). Only this origin is cleared.
    if (device) { await cdp.send('Storage.clearDataForOrigin', { origin: url.origin, storageTypes: 'local_storage,session_storage' }); report.storageCleared = url.origin; }
    await p.goto(url.href, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(p);
    // On a device the screen stays on while this page holds a screen wake lock (no device setting is changed).
    if (device) report.wakeLock = await p.evaluate(async () => { try { (window as any).__wakeLock = await (navigator as any).wakeLock.request('screen'); return 'held'; } catch (error) { return String(error); } });
    await p.waitForFunction(() => ['simState', 'placePlayer', 'placeTractor', 'cameraPose', 'feedFrameTimes', 'setTimeScale', 'tierState'].every(name => typeof (window as any).__kilnScene?.[name] === 'function'), { timeout: TIMEOUT });
    await p.evaluate(() => { const api = (window as any).__kilnScene; api.feedFrameTimes([]); api.setTimeScale(1); });
    report.backendReported = await p.evaluate(() => (window as any).__kilnHarness.snapshot().backend);
    const place = async (spot: readonly number[], yaw: number, frames = 6) => { await hook(p, 'placePlayer', spot[0], spot[1], spot[2], yaw); await waitFrames(p, frames); };
    const placeTractor = async (pose4: readonly number[], frames = 3) => { await hook(p, 'placeTractor', pose4[0], pose4[1], pose4[2], pose4[3]); await waitFrames(p, frames); };
    const startPlay = async () => { await tap(p, '.ks-toolbar > button', FARM_STRINGS.walk); await p.waitForFunction(() => (window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitFrames(p, 3); };
    const leavePlay = async () => { await tap(p, '.ks-toolbar > button', FARM_STRINGS.overview); await p.waitForFunction(() => !(window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitFrames(p, 3); };
    const mount = async () => {
      await placeTractor(scenario.drive); await place(stands.drive!, 0, 4); await waitButton(p, FARM_STRINGS.drive);
      await tap(p, '.ks-touch-button', FARM_STRINGS.drive); await p.waitForFunction(() => (window as any).__kilnScene.simState().driving, { timeout: 5_000 });
      await waitStatus(p, FARM_STRINGS.tractorTouch); await waitButton(p, FARM_STRINGS.leaveTractor);
    };
    const dismount = async () => {
      await waitStopped(p); await tap(p, '.ks-touch-button', FARM_STRINGS.leaveTractor);
      await p.waitForFunction(() => !(window as any).__kilnScene.simState().driving, { timeout: 5_000 }); await waitFrames(p, 3);
      const s = await state(p), reach = flatDistance(s.player.position, s.tractor.position);
      assert(reach > 1 && reach < FARM_DOORS.tractorRadius, `Rowan steps out beside the tractor (${reach} m)`); return round(reach);
    };

    await step('touch profile: coarse pointer, touch points, tier and backend', async () => {
      const profile = await p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches, maxTouchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent, dpr: devicePixelRatio, inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], tier: (window as any).__kilnScene.tierState() }));
      assert.equal(profile.coarse, true, 'the primary pointer is coarse'); assert(profile.maxTouchPoints > 0, 'touch points');
      if (!device) { assert.equal(profile.dpr, PHONE.dpr); assert.deepEqual(profile.inner, [PHONE.width, PHONE.height]); assert.match(profile.userAgent, /Android/); }
      return { ...profile, tier: { tier: profile.tier?.tier, level: profile.tier?.level, device: profile.tier?.device, probe: profile.tier?.probe } };
    });
    let home: Pose | null = null;
    await step('overview on touch: no camera pad, one Reset view target; drag orbits and Reset view returns', async () => {
      const h = await hud(p); assert.equal(h.mode, FARM_STRINGS.walk); assert.equal(h.cameraPad, false, 'no camera pad on touch (D-22)'); assert.equal(h.resetView, true);
      assert.equal(h.joystick, null); assert.deepEqual(h.touchButtons, []); assert.equal(h.hudClass, 'farm-hud farm-overview-touch');
      const hero = await pose(p); await tap(p, '.farm-reset-view'); await waitFrames(p, 6); home = await pose(p);
      await drag(p, await canvasPoint(p), [(await canvasPoint(p))[0] + 80, (await canvasPoint(p))[1]]); await waitFrames(p, 3);
      const turned = await pose(p), moved = distance(turned.position, home.position); assert(moved > .5, `a one-finger drag orbits the overview (${moved} m)`);
      await tap(p, '.farm-reset-view'); await waitFrames(p, 6); const back = await pose(p);
      assert(distance(back.position, home.position) < 1e-3 && distance(back.target, home.target) < 1e-3, `Reset view restores the home view: ${JSON.stringify({ hero, home, turned, back })}`);
      const record = await shoot(p, await layout(p, 'profile-overview')); assert.deepEqual(record.problems, []);
      return { hud: h, orbitMoved: round(moved, 3), hero, home };
    });
    await step('start play by tap: touch help once, the joystick, no pads', async () => {
      await startPlay(); const h = await hud(p);
      assert.equal(h.mode, FARM_STRINGS.overview); assert.equal(h.helpExpanded, 'true'); assert(h.help?.includes(FARM_STRINGS.helpTouch), 'touch help text');
      assert.equal(h.joystick, FARM_STRINGS.joystick); assert.equal(h.exitPlay, false, 'no Leave play pad'); assert.equal(h.interactPrompt, false, 'no desktop prompt on touch');
      assert.equal(h.cameraPad, false); assert(h.touchButtons.length <= 1, 'at most one context tap target');
      const helpLayout = await shoot(p, await layout(p, 'profile-play-help')); assert.deepEqual(helpLayout.problems, []);
      await tap(p, '.ks-help button', 'Close controls'); await waitFrames(p, 2);
      const closed = await hud(p); assert.equal(closed.help, null); assert.equal(closed.helpExpanded, 'false');
      const stored = await p.evaluate(() => { try { return Object.keys(localStorage).filter(key => key.endsWith('.help')).map(key => localStorage.getItem(key)); } catch { return null; } });
      assert.deepEqual(stored, ['dismissed']); return { hud: h, stored };
    });
    await step('joystick walks camera-relative at walking pace; full deflection runs; sideways strafes', async () => {
      const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 20);
      const f = forwardOf(await pose(p)), [walk, run, strafe] = await holdStick(p, [[0, -40, 1500], [0, -66, 1500], [40, 0, 1000]]);
      const measure = (samples: Sample[], from: number) => { const a = samples.find(s => s.t >= from)!, b = samples.at(-1)!, d = sub(b.p, a.p); return { d, speed: flatLength(d) / ((b.t - a.t) / 1000) }; };
      const w = measure(walk!, 250), r = measure(run!, 400), s = measure(strafe!, 300);
      const cosWalk = flatDot(flatUnit(w.d), f), cosRun = flatDot(flatUnit(r.d), f), cosStrafe = flatDot(flatUnit(s.d), rightOf(f));
      assert(cosWalk > .995, `walk follows the camera (cos ${cosWalk})`); assert(Math.abs(w.speed / FARM_WALK.pace - 1) < .15, `walking pace ${w.speed}`);
      assert(cosRun > .995, `run follows the camera (cos ${cosRun})`); assert(Math.abs(r.speed / FARM_WALK.runPace - 1) < .15, `running pace ${r.speed}`);
      assert(cosStrafe > .995, `sideways moves to the camera right (cos ${cosStrafe})`);
      assert([...walk!, ...run!, ...strafe!].every(sample => sample.status === ''), 'no status in the open');
      await sample(p, 300); const after = await state(p), settle = await sample(p, 200);
      assert(flatDistance(settle.at(-1)!.p, after.player.position) < 1e-3, 'Rowan stops when the finger lifts');
      return { cameraForward: f.map(v => round(v)), walk: { cosine: round(cosWalk, 6), metersPerSecond: round(w.speed, 3) }, run: { cosine: round(cosRun, 6), metersPerSecond: round(r.speed, 3) }, strafe: { cosine: round(cosStrafe, 6) } };
    });
    await step('one-finger drag on the canvas turns the follow camera; Rowan stays; the joystick follows the new view', async () => {
      const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 20);
      const before = forwardOf(await pose(p)), s0 = await state(p), from = await canvasPoint(p);
      await drag(p, from, [from[0] + 60, from[1]]); await waitFrames(p, 5);
      const turned = forwardOf(await pose(p)); await waitFrames(p, 60); const settled = forwardOf(await pose(p)), s1 = await state(p);
      const angle = degrees(before, turned), creep = degrees(turned, settled);
      assert(angle > 10 && angle < 60, `drag turned the camera ${angle} degrees`); assert(creep < .05, `no creep (${creep} degrees)`);
      assert(distance(s0.player.position, s1.player.position) < 1e-3, 'a look drag does not move Rowan');
      const [walk] = await holdStick(p, [[0, -40, 1000]]), a = walk!.find(s => s.t >= 200)!, b = walk!.at(-1)!, cos = flatDot(flatUnit(sub(b.p, a.p)), settled);
      assert(cos > .995, `the joystick follows the dragged view (cos ${cos})`);
      return { dragDegrees: round(angle, 3), creepDegrees: round(creep, 5), cosine: round(cos, 6) };
    });
    await step('pinch zooms the follow camera within 1.6 to 10 m and does not move Rowan', async () => {
      const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 20);
      const s0 = await state(p), c0 = await pose(p), d0 = distance(c0.position, c0.target), at = await canvasPoint(p, .45);
      for (let i = 0; i < 3; i++) { await pinch(p, at, 120, 12); await waitFrames(p, 2); }
      const out = await pose(p), far = distance(out.position, out.target);
      for (let i = 0; i < 3; i++) { await pinch(p, at, 12, 150); await waitFrames(p, 2); }
      const inn = await pose(p), near = distance(inn.position, inn.target), s1 = await state(p);
      // The stored follow offset is clamped to 1.6-10 m; the pilot's updateCamera places the camera at max(.22, ray - .14),
      // and the ray returns the full offset length when nothing is hit, so in the open the camera sits the .14 m pad inside it.
      const max = FARM_CAMERA.playMaxDistance - FARM_CAMERA.playPad, min = FARM_CAMERA.playMinDistance - FARM_CAMERA.playPad;
      assert(far <= max + 1e-3 && far > max - .25, `pinching in reaches the 10 m offset limit (camera ${far} m)`);
      assert(near >= min - 1e-3 && near < min + .25, `spreading reaches the 1.6 m offset limit (camera ${near} m)`);
      assert(distance(s0.player.position, s1.player.position) < 1e-3, 'a pinch does not move Rowan');
      assert(degrees(forwardOf(c0), forwardOf(inn)) < 2, 'a centred pinch does not swing the camera');
      return { start: round(d0, 3), pinchedOut: round(far, 4), spreadIn: round(near, 4), swingDegrees: round(degrees(forwardOf(c0), forwardOf(inn)), 4) };
    });
    await step('the context button opens and closes the farmhouse door (one tap target, no key hint)', async () => {
      const door = scenario.doorIds.farmhouse, label = DOOR_LABELS.farmhouse, record: Record<string, unknown> = {};
      for (const [phase, opening] of [['before opening', true], ['before closing', false]] as const) {
        await place(stands[`farmhouse ${phase}`]!, 0, 4); assert.equal((await state(p)).nearest, door);
        await waitButton(p, doorPrompt(label, !opening)); const h = await hud(p); assert.deepEqual(h.touchButtons, [doorPrompt(label, !opening)]);
        if (opening) { const r = await shoot(p, await layout(p, 'profile-play-context')); assert.deepEqual(r.problems, []); }
        await tap(p, '.ks-touch-button', doorPrompt(label, !opening)); await waitStatus(p, doorStatus(label, opening));
        if (opening) { const r = await shoot(p, await layout(p, 'profile-play-status')); assert.deepEqual(r.problems, []); }
        await waitDoor(p, door, opening ? 1 : 0); record[opening ? 'opened' : 'closed'] = { button: h.touchButtons[0], status: doorStatus(label, opening) };
      }
      const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 6); await waitNoButton(p);
      return { ...record, awayFromDoors: 'no context button' };
    });
    await step('tractor by touch: mount, throttle, drift without steer, steer, brake then reverse, dismount', async () => {
      await mount(); const h = await hud(p);
      assert.equal(h.joystick, FARM_STRINGS.joystickDrive); assert.deepEqual(h.touchButtons, [FARM_STRINGS.leaveTractor]); assert.equal(h.status, FARM_STRINGS.tractorTouch);
      const driving = await shoot(p, await layout(p, 'profile-driving')); assert.deepEqual(driving.problems, []);
      const blocked0 = (await state(p)).blockedSteps;
      const [forward] = await holdStick(p, [[0, -66, 1500]]), a = forward![0]!, b = forward!.at(-1)!;
      const heading: Vec = [Math.cos(a.yaw), 0, -Math.sin(a.yaw)], moved = sub(b.tractor, a.tractor), along = flatDot(moved, heading);
      assert(along > 2.5, `drove forward ${along} m`); assert(flatDot(flatUnit(moved), heading) > .999, 'along its heading'); assert(b.speed > 3, `speed ${b.speed}`);
      await waitStopped(p); await placeTractor(scenario.drive);
      const [drift] = await holdStick(p, [[6, -66, 1200]]), yawDrift = Math.abs(drift!.at(-1)!.yaw - drift![0]!.yaw);
      assert(yawDrift < 1e-3, `a thumb held forward with 5 degrees of drift does not steer (yaw ${yawDrift})`); assert(drift!.at(-1)!.speed > 3, 'and keeps full throttle');
      await waitStopped(p); await placeTractor(scenario.drive);
      const [turn] = await holdStick(p, [[-50, -66, 1500]]), yawChange = turn!.at(-1)!.yaw - turn![0]!.yaw;
      assert(yawChange > .4, `left steers left (yaw +${yawChange})`);
      await waitStopped(p); await placeTractor(scenario.drive);
      const [accelerate, pull] = await holdStick(p, [[0, -66, 1200], [0, 66, 3000]]), top = accelerate!.at(-1)!.speed, speeds = pull!.map(s => s.speed);
      const rises = speeds.filter((v, i) => i > 0 && v > speeds[i - 1]! + 1e-3).length, stopAt = speeds.findIndex(v => v <= 0);
      assert(top > 2.5, `accelerated to ${top} m/s`); assert.equal(rises, 0, 'pulling back only slows, then reverses'); assert(stopAt > 0, 'braked from forward speed through a stop');
      assert(Math.min(...speeds) < -1, `then reverses (${Math.min(...speeds)} m/s)`);
      const settle = await sample(p, 1600); assert(Math.abs(settle.at(-1)!.speed) < .05, 'coasts to a stop when the finger lifts');
      const s = await state(p); assert.equal(s.blockedSteps, blocked0, 'no blocked step in the clear drive area');
      await placeTractor(scenario.drive); const exit = await dismount();
      return { forwardMeters: round(along, 3), topSpeed: b.speed, driftYaw: yawDrift, yawChange: round(yawChange, 4), brake: { from: top, samplesToStop: stopAt, lowest: Math.min(...speeds) }, exitDistance: exit };
    });
    await step('the mode button leaves play; the joystick and context button go', async () => {
      await leavePlay(); const h = await hud(p);
      assert.equal(h.mode, FARM_STRINGS.walk); assert.equal(h.joystick, null); assert.deepEqual(h.touchButtons, []); assert.equal(h.resetView, true);
      return { hud: h };
    });
    await step('touch HUD accessibility (P-34): axe in overview, play, help, context and driving; 44 px targets; text contrast; live status', async () => {
      await p.addScriptTag({ content: axe.source });
      const audit = async (name: string) => {
        const violations = await p.evaluate(async () => { const result = await (window as any).axe.run({ include: ['.ks-hud'], exclude: ['canvas'] }); return result.violations.filter((v: any) => v.impact === 'serious' || v.impact === 'critical').map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n: any) => n.target.join(' ')) })); });
        const controls = await p.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.ks-hud button, .ks-hud [role="application"]')).filter(e => e.getBoundingClientRect().width > 0).map(e => {
          const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { label: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim(), width: r.width, height: r.height, color: s.color, background: s.backgroundColor, text: e.tagName === 'BUTTON' };
        }));
        const status = await p.evaluate(() => { const e = document.querySelector<HTMLElement>('.ks-status'); if (!e || !e.textContent) return null; const s = getComputedStyle(e); return { live: e.getAttribute('aria-live'), role: e.getAttribute('role'), color: s.color, background: s.backgroundColor }; });
        const small = controls.filter(c => c.width < 44 || c.height < 44 || !c.label), low = controls.filter(c => c.text && contrastRatio(c.color, c.background) < 4.5);
        return { name, violations, controls: controls.map(c => ({ label: c.label, size: [round(c.width, 1), round(c.height, 1)], contrast: c.text ? round(contrastRatio(c.color, c.background), 2) : null })), status: status && { ...status, contrast: round(contrastRatio(status.color, status.background), 2) }, small: small.map(c => c.label), lowContrast: low.map(c => c.label) };
      };
      const results = [await audit('overview')];
      await startPlay(); const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 6); results.push(await audit('play'));
      await tap(p, '.ks-help-button'); await waitFrames(p, 2); results.push(await audit('help')); await tap(p, '.ks-help button', 'Close controls'); await waitFrames(p, 2);
      await place(stands['farmhouse before opening']!, 0, 4); await waitButton(p, doorPrompt(DOOR_LABELS.farmhouse, false)); results.push(await audit('context'));
      await tap(p, '.ks-touch-button', doorPrompt(DOOR_LABELS.farmhouse, false)); await waitStatus(p, doorStatus(DOOR_LABELS.farmhouse, true)); results.push(await audit('status'));
      await waitDoor(p, scenario.doorIds.farmhouse, 1); await tap(p, '.ks-touch-button', doorPrompt(DOOR_LABELS.farmhouse, true)); await waitDoor(p, scenario.doorIds.farmhouse, 0);
      await mount(); results.push(await audit('driving')); await placeTractor(scenario.drive); await dismount(); await leavePlay();
      const problems = results.flatMap(r => [...r.violations.map(v => `${r.name}: axe ${v.impact} ${v.id} ${v.nodes.join(', ')}`), ...r.small.map(l => `${r.name}: target under 44 px or unnamed (${l})`), ...r.lowContrast.map(l => `${r.name}: contrast under 4.5 (${l})`),
        ...(r.status && (r.status.live !== 'polite' || r.status.contrast < 4.5) ? [`${r.name}: status not announced politely or low contrast`] : [])]);
      assert(results.find(r => r.name === 'status')?.status, 'the status line shows text after the door opens'); assert.deepEqual(problems, []);
      return { axe: axe.version, results };
    });
    await step('overview gestures: pinch within 3 to 160 m, two-finger pan moves the view', async () => {
      const at = await canvasPoint(p, .45);
      for (let i = 0; i < 4; i++) { await pinch(p, at, 150, 10); await waitFrames(p, 2); }
      const out = await pose(p), far = distance(out.position, out.target);
      for (let i = 0; i < 6; i++) { await pinch(p, at, 10, 150); await waitFrames(p, 2); }
      const inn = await pose(p), near = distance(inn.position, inn.target);
      assert(far <= FARM_CAMERA.maxDistance + 1e-3 && far > FARM_CAMERA.maxDistance - 1, `pinching in reaches the 160 m limit (${far})`);
      assert(near >= FARM_CAMERA.minDistance - 1e-3 && near < FARM_CAMERA.minDistance + .5, `spreading reaches the 3 m limit (${near})`);
      await tap(p, '.farm-reset-view'); await waitFrames(p, 3);
      const before = await pose(p); await pinch(p, at, 60, 60, 10, [0, 80]); await waitFrames(p, 3); const panned = await pose(p);
      const shift = distance(before.target, panned.target), zoom = Math.abs(distance(panned.position, panned.target) - distance(before.position, before.target));
      assert(shift > .1, `two fingers moved together pan the overview (${shift} m)`); assert(zoom < .05 * distance(before.position, before.target), 'without zooming');
      await tap(p, '.farm-reset-view'); await waitFrames(p, 3);
      return { pinchedOut: round(far, 3), spreadIn: round(near, 4), panMeters: round(shift, 3), panZoomChange: round(zoom, 4) };
    });
    await step(device ? 'HUD layout at the device size, overview and play' : 'HUD layout at 360 to 430 px, portrait and landscape, overview, play, context, driving and help', async () => {
      const sizes: (readonly [number, number])[] = device ? [[0, 0]] : [...LAYOUTS, [PHONE.width, PHONE.height]];
      const problems: string[] = [], names: string[] = [];
      for (const [width, height] of sizes) {
        if (!device) { await p.setViewport({ width, height, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, isLandscape: width > height }); await waitFrames(p, 8); }
        const tag = device ? 'device' : `${width}x${height}`;
        const check = async (name: string) => { const r = await shoot(p, await layout(p, `${tag}-${name}`)); names.push(r.name); problems.push(...r.problems.map(x => `${r.name}: ${x}`)); };
        await check('overview');
        await startPlay(); await check('play');
        await tap(p, '.ks-help-button'); await waitFrames(p, 2); await check('help'); await tap(p, '.ks-help button', 'Close controls'); await waitFrames(p, 2);
        await place(stands['farmhouse before opening']!, 0, 4); await p.waitForFunction(() => document.querySelectorAll('.ks-touch-button').length === 1, { timeout: 5_000 });
        await check('context');
        const text = await p.evaluate(() => document.querySelector('.ks-touch-button')?.textContent ?? ''); await tap(p, '.ks-touch-button', text);
        await p.waitForFunction(() => !!document.querySelector('.ks-status')?.textContent, { timeout: 5_000 }); await check('status');
        await p.waitForFunction(() => (window as any).__kilnScene.simState().status === '', { timeout: 15_000 });
        await mount(); await check('driving');
        if (!device && width < height) {
          // Orientation change while driving: the joystick stays bottom-left and the context button bottom-right.
          await p.setViewport({ width: height, height: width, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, isLandscape: true }); await waitFrames(p, 8);
          const turned = await shoot(p, await layout(p, `${tag}-driving-rotated`)); names.push(turned.name); problems.push(...turned.problems.map(x => `${turned.name}: ${x}`));
          const joystick = turned.controls.find(c => c.kind === 'joystick')!, context = turned.controls.find(c => c.kind === 'context')!;
          if (!(joystick.rect.x < turned.root.x + 60 && context.rect.x + context.rect.width > turned.root.x + turned.root.width - 60)) problems.push(`${turned.name}: controls did not re-anchor after rotation`);
          await p.setViewport({ width, height, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, isLandscape: false }); await waitFrames(p, 8);
        }
        await dismount(); await leavePlay();
      }
      assert.deepEqual(problems, []); return { layouts: names.length, names };
    });
    await step('safe-area insets move the edge controls (CDP Emulation.setSafeAreaInsetsOverride)', async () => {
      const results: Record<string, unknown> = {};
      for (const [name, size, insets] of [['portrait', [PHONE.width, PHONE.height], { top: 47, bottom: 34, left: 0, right: 0 }], ['landscape', [PHONE.height, PHONE.width], { top: 0, bottom: 21, left: 47, right: 47 }]] as const) {
        await p.setViewport({ width: size[0], height: size[1], deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, isLandscape: size[0] > size[1] }); await waitFrames(p, 6);
        await cdp.send('Emulation.setSafeAreaInsetsOverride' as any, { insets } as any); await waitFrames(p, 4);
        await startPlay(); await place(stands['farmhouse before opening']!, 0, 4); await p.waitForFunction(() => document.querySelectorAll('.ks-touch-button').length === 1, { timeout: 5_000 });
        const r = await shoot(p, await layout(p, `safe-area-${name}`)), toolbar = r.controls.find(c => c.kind === 'toolbar')!, joystick = r.controls.find(c => c.kind === 'joystick')!;
        // The kit's touch-button grid is the inset-anchored box (its empty pedal column adds a 10 px gap beside the button).
        const context = await rectOf(p, '.ks-touch-buttons');
        const gaps = { toolbarTop: toolbar.rect.y - r.root.y, joystickLeft: joystick.rect.x - r.root.x, joystickBottom: r.root.y + r.root.height - joystick.rect.y - joystick.rect.height,
          contextRight: r.root.x + r.root.width - context.x - context.width, contextBottom: r.root.y + r.root.height - context.y - context.height };
        const expected = { toolbarTop: Math.max(12, insets.top), joystickLeft: Math.max(20, insets.left), joystickBottom: Math.max(24, insets.bottom), contextRight: Math.max(16, insets.right), contextBottom: Math.max(20, insets.bottom) };
        for (const key of Object.keys(expected) as (keyof typeof expected)[]) assert(Math.abs(gaps[key] - expected[key]) < 1.5, `${name} ${key}: ${gaps[key]} px, expected ${expected[key]}`);
        assert.deepEqual(r.problems, []); results[name] = { insets, gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, round(v, 2)])), expected };
        await leavePlay();
      }
      await cdp.send('Emulation.setSafeAreaInsetsOverride' as any, { insets: {} } as any);
      await p.setViewport({ width: PHONE.width, height: PHONE.height, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, isLandscape: false }); await waitFrames(p, 6);
      return results;
    }, !device);
    await step('a finger outside the scene scrolls the page; on the canvas it does not; the long-press menu is suppressed', async () => {
      await p.evaluate(() => {
        document.documentElement.style.height = 'auto'; document.body.style.height = 'auto';
        const shell = document.querySelector<HTMLElement>('#scene-shell')!; shell.style.flex = 'none'; shell.style.height = '520px';
        const spacer = document.createElement('div'); spacer.id = 'b09-spacer'; spacer.style.height = '1600px'; spacer.textContent = 'Page content below the scene'; document.body.append(spacer);
        scrollTo(0, 0);
      });
      await waitFrames(p, 8);
      const viewportHeight = await p.evaluate(() => innerHeight), footer = await rectOf(p, 'footer');
      const outside: [number, number] = [40, Math.min(viewportHeight - 40, footer.y + footer.height + 120)];
      await drag(p, outside, [outside[0], outside[1] - 260], 12); await p.waitForFunction(() => scrollY > 60, { timeout: 5_000 }).catch(() => undefined);
      const scrolled = await p.evaluate(() => scrollY); assert(scrolled > 60, `a drag below the scene scrolls the page (${scrolled} px)`);
      await p.evaluate(() => scrollTo(0, 0)); await waitFrames(p, 4);
      const before = await pose(p), from = await canvasPoint(p, .5); await drag(p, from, [from[0], from[1] - 160], 12); await waitFrames(p, 6);
      const after = await pose(p), still = await p.evaluate(() => scrollY);
      assert.equal(still, 0, 'a drag on the canvas does not scroll the page'); assert(distance(before.position, after.position) > .1, 'it orbits the camera instead');
      const menu = await p.evaluate(() => { const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.ks-root canvas')!.dispatchEvent(event); return event.defaultPrevented; });
      assert.equal(menu, true, 'the context menu is suppressed on the canvas');
      const styles = await p.evaluate(() => ({ canvas: getComputedStyle(document.querySelector('.ks-root canvas')!).touchAction, joystick: null as string | null, root: getComputedStyle(document.querySelector('.ks-root')!).overscrollBehavior }));
      assert.equal(styles.canvas, 'none'); assert.equal(styles.root, 'none');
      return { pageScroll: scrolled, canvasScroll: still, orbitMeters: round(distance(before.position, after.position), 3), contextMenuSuppressed: menu, styles };
    });
    await step('HUD layout with a mouse at 360 to 430 px (the site\'s 390 px overlap), overview and play', async () => {
      const d = desktop = await browser!.newPage(); await configurePage(d, new Set([hosted!.port]), diagnostics);
      const problems: string[] = [], names: string[] = [];
      for (const [width, height] of LAYOUTS) {
        await d.setViewport({ width, height, deviceScaleFactor: 1 });
        if (names.length === 0) { await d.goto(report.url as string, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(d); await d.evaluate(() => (window as any).__kilnScene.feedFrameTimes([])); }
        await waitFrames(d, 8);
        const check = async (name: string) => { const r = await shoot(d, await layout(d, `mouse-${width}x${height}-${name}`)); names.push(r.name); problems.push(...r.problems.map(x => `${r.name}: ${x}`)); return r; };
        const overview = await check('overview'); const pad = overview.controls.filter(c => c.kind === 'camera');
        if (pad.length !== 7) problems.push(`mouse-${width}x${height}: camera pad has ${pad.length} buttons`);
        await d.click('.ks-toolbar > button'); await d.waitForFunction(() => (window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitFrames(d, 3);
        const help = await d.evaluate(() => document.querySelector('.ks-help-button')?.getAttribute('aria-expanded'));
        if (help === 'true') { await check('help'); await d.click('.ks-help button:last-child'); await waitFrames(d, 2); }
        await hook(d, 'placePlayer', ...stands['farmhouse before opening']!, 0); await waitFrames(d, 6); await check('play');
        await d.click('.ks-toolbar > button'); await d.waitForFunction(() => !(window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitFrames(d, 3);
      }
      assert.deepEqual(problems, []); return { layouts: names.length, names };
    }, !device);
    await step('no browser errors or warnings', async () => { const bad = badDiagnostics(diagnostics); assert.deepEqual(bad, []); return { messages: diagnostics.length }; });
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); }
  finally {
    const cleanup: string[] = [];
    for (const target of [desktop, page]) { try { await target?.evaluate(() => (window as any).__kilnHarness?.unmount()); } catch { /* the page may have failed before mounting */ } }
    if (device) {
      try { await desktop?.close(); await page?.close(); ledger.tabClosed = true; } catch (error) { cleanup.push('tab: ' + String(error)); }
      try { await browser?.disconnect(); ledger.disconnected = true; } catch (error) { cleanup.push('disconnect: ' + String(error)); }
      try { ledger.deviceStateAfter = await device.state?.(); } catch (error) { cleanup.push('device state: ' + String(error)); }
    } else try { await browser?.close(); ledger.browserClosed = true; } catch (error) { cleanup.push('browser: ' + String(error)); }
    try { await hosted?.close(); ledger.serverClosed = true; } catch (error) { cleanup.push('server: ' + String(error)); }
    if (device && mapped && hosted) try { await device.onClose?.(hosted.port); ledger.reverseRemoved = true; } catch (error) { cleanup.push('adb reverse: ' + String(error)); }
    ledger.cleanupErrors = cleanup;
    report.summary = { steps: steps.length, passed: steps.filter(s => s.status === 'pass').length, skipped: steps.filter(s => s.status === 'skipped').map(s => s.name), failed: steps.filter(s => s.status === 'fail').map(s => s.name) };
    report.status = !report.error && steps.some(s => s.status === 'pass') && steps.every(s => s.status !== 'fail') ? 'pass' : 'fail';
    await save();
    if (cleanup.length) throw new AggregateError(cleanup, 'Owned B-09 resources did not all close');
  }
  return { out, pass: report.status === 'pass', report };
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (key: string, fallback?: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
  const label = value('--label'), backend = value('--backend', 'both')!;
  assert(label && /^[a-z0-9][a-z0-9._-]*$/.test(label), 'Usage: bun scripts/run-farm-mobile.ts --label <new-evidence-name> [--backend both|webgpu|webgl2] [--root packages/farm/dist/test] [--out <dir prefix>]');
  assert(['both', 'webgpu', 'webgl2'].includes(backend), 'Backend must be both, webgpu or webgl2');
  let pass = true;
  for (const b of (backend === 'both' ? ['webgpu', 'webgl2'] : [backend]) as Backend[]) {
    const out = value('--out'); const result = await runFarmMobile({ backend: b, label, root: value('--root'), out: out ? `${out}-${b}` : undefined });
    console.log(`B-09 ${b}: ${result.pass ? 'PASS' : 'FAIL'} (${result.out})`); pass &&= result.pass;
  }
  if (!pass) process.exitCode = 1;
}
