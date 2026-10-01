import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, KeyInput, Page } from 'puppeteer-core';
import { assertOwnedUrl, launchChrome, serveOwned, waitForReady, waitFrames, workspacePath } from '../packages/scene-kit/src/testing/node';
import { DOOR_LABELS, doorPrompt, doorStatus, FARM_STRINGS } from '../packages/farm/src/ui/strings';
import { FARM_CAMERA, FARM_DESTINATIONS, FARM_DOORS, FARM_WALK } from '../packages/farm/src/constants';
import { bridgeCenter } from '../packages/farm/src/world/site-layout';

/**
 * B-08 desktop play flows (SPEC 18) on the rewrite's test output, driven by real puppeteer keyboard
 * and mouse input. Test hooks only place Rowan or the tractor at the spots that the port-only searches
 * of `audit-play-oracle.ts` recorded (evidence/m2/play/oracle.json) and read state; they never drive
 * play. Hold durations are wall-clock input lengths, not measurements: no timing is collected.
 */
const TIMEOUT = 120_000, WIDTH = 1280, HEIGHT = 720;
const fallbackWarning = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\.$/;
type Vec = [number, number, number];
type Backend = 'webgpu' | 'webgl2';
interface Diagnostic { kind: string; type?: string; text: string; url?: string }
interface Pose { position: Vec; target: Vec; fov?: number }
interface Sample { t: number; p: Vec; visible: boolean; tractor: Vec; yaw: number; speed: number; status: string; prompt: string; driving: boolean; active: boolean; blocked: number; driven: number; camera: Pose | null }
interface Step { name: string; status: 'pass' | 'fail'; details?: unknown; error?: string }
interface Scenario {
  stands: Record<string, Vec>; doorIds: Record<keyof typeof DOOR_LABELS, string>; doorwayNearest: boolean;
  walk: { start: [number, number, number, number] }; wall: { start: Vec; yaw: number; direction: Vec; stop: Vec; walked: number };
  obstruction: { at: Vec; yaw: number; ray: number; distance: number; full: number; hidden: boolean };
  riverStart: Vec; riverEdge: Vec; bridge: { deckMaxY: number };
  drive: [number, number, number, number]; boundStart: [number, number, number, number]; barnApproach: [number, number, number, number];
  wedge: [number, number, number, number]; clear: [number, number, number, number]; barn: { contact: [number, number]; stop: [number, number]; runUp: number };
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

async function configurePage(page: Page, ports: ReadonlySet<number>, diagnostics: Diagnostic[]) {
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
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

const state = (page: Page) => page.evaluate(() => (window as any).__kilnScene.simState());
const hook = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n: string, a: unknown[]) => (window as any).__kilnScene[n](...a), name, args);
const pose = (page: Page): Promise<Pose> => page.evaluate(() => { const p = (window as any).__kilnScene.cameraPose(); return { position: [...p.position], target: [...p.target], fov: p.fov }; }) as Promise<Pose>;
const shellEscapes = (page: Page): Promise<number> => page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes ?? 0);
function hud(page: Page) {
  return page.evaluate(() => {
    const interact = document.querySelector<HTMLButtonElement>('.ks-interact');
    return { mode: document.querySelector('.ks-toolbar button')?.textContent ?? null, helpExpanded: document.querySelector('.ks-help-button')?.getAttribute('aria-expanded') ?? null,
      help: document.querySelector('.ks-help')?.textContent ?? null, status: document.querySelector('.ks-status')?.textContent ?? null,
      interact: interact ? { text: interact.textContent ?? '', disabled: interact.disabled } : null,
      cameraButtons: !!document.querySelector('[role="group"][aria-label="Camera controls"]'), focus: (document.activeElement as HTMLElement | null)?.className ?? null };
  });
}
async function clickButton(page: Page, text: string) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll<HTMLButtonElement>('.ks-root button')].find(button => button.textContent === label) ?? null, text);
  const element = handle.asElement(); assert(element, `HUD button "${text}" exists`);
  await (element as unknown as { click(): Promise<void> }).click(); await handle.dispose();
}
/** Per-frame samples of play state and the camera pose for `ms` of wall time. */
function sample(page: Page, ms: number): Promise<Sample[]> {
  return page.evaluate((duration: number) => new Promise<Sample[]>(done => {
    const api = (window as any).__kilnScene, out: Sample[] = [], start = performance.now();
    const tick = () => {
      const s = api.simState(), c = api.cameraPose();
      out.push({ t: performance.now() - start, p: s.player.position, visible: s.player.visible, tractor: s.tractor.position, yaw: s.tractor.yaw, speed: s.tractor.speed,
        status: s.status, prompt: s.prompt, driving: s.driving, active: s.active, blocked: s.blockedSteps, driven: s.drivenMeters, camera: c ? { position: [...c.position], target: [...c.target] } as Pose : null });
      if (performance.now() - start < duration) requestAnimationFrame(tick); else done(out);
    };
    requestAnimationFrame(tick);
  }), ms);
}
async function hold(page: Page, keys: KeyInput[], ms: number): Promise<Sample[]> {
  for (const key of keys) await page.keyboard.down(key);
  try { return await sample(page, ms); } finally { for (const key of [...keys].reverse()) await page.keyboard.up(key); }
}
// The HUD store notifies at most every 100 ms (SPEC 13.1), so DOM checks wait for the text instead of reading once.
const waitStatus = (page: Page, text: string, timeout = 8_000) => page.waitForFunction(value => document.querySelector('.ks-status')?.textContent === value, { timeout }, text);
const waitPrompt = (page: Page, text: string, timeout = 5_000) => page.waitForFunction(value => (document.querySelector('.ks-interact')?.textContent ?? '').replace(/ \(E\)$/, '') === value, { timeout }, text);
function waitDoor(page: Page, id: string, target: number, timeout = 15_000) {
  return page.waitForFunction((door: string, goal: number) => {
    const s = (window as any).__kilnScene.simState(), d = s.doors.find((entry: { id: string }) => entry.id === door);
    return !!d && d.target === goal && Math.abs(d.amount - goal) < .001 && s.status === '';
  }, { timeout }, id, target);
}
const at = (spot: readonly number[]) => spot.slice(0, 3) as Vec;

export async function runFarmPlay(o: { workspace?: string; backend: Backend; label: string; root?: string; outRoot?: string }) {
  const workspace = resolve(o.workspace ?? process.cwd());
  const out = workspacePath(workspace, `${o.outRoot ?? 'evidence/m2/play'}/${o.label}-${o.backend}`); assert(!existsSync(out), 'Refusing to overwrite existing B-08 evidence'); await mkdir(out, { recursive: true });
  const oracle = JSON.parse(await readFile(workspacePath(workspace, 'evidence/m2/play/oracle.json'), 'utf8'));
  // Each release is judged against its own sealed collision world (SPEC 19.8, R4-09): the build states its pack release.
  const root = workspacePath(workspace, o.root ?? 'packages/farm/dist/test'), release = String(JSON.parse(await readFile(resolve(root, 'assets/pack.json'), 'utf8')).release);
  assert(release === 'r33' || release === 'r34', `Unknown pack release ${release}`);
  const fixtureFile = `packages/farm/fixtures/${release === 'r33' ? 'play-colliders.json' : `play-colliders-${release}.json`}`;
  const fixture = JSON.parse(await readFile(workspacePath(workspace, fixtureFile), 'utf8'));
  const scenario = oracle.scenario as Scenario, stands = scenario.stands;
  const steps: Step[] = [], diagnostics: Diagnostic[] = [], ledger: Record<string, unknown> = { runnerPid: process.pid };
  const report: Record<string, unknown> = { schema: 'kiln.farm-b08/1', date: new Date().toISOString(), backend: o.backend, label: o.label,
    conditions: { width: WIDTH, height: HEIGHT, dpr: 1, tier: 'high', governor: 'held with an empty synthetic trace', input: 'puppeteer keyboard and mouse (trusted CDP input events)',
      hooks: 'placePlayer / placeTractor / teleport / resetFarmer place state; simState, cameraPose and colliderStats read it', fixtures: 'evidence/m2/play/oracle.json (port-only searches after the lockstep oracle)', release, colliderFixture: fixtureFile, timing: 'not collected' },
    steps, diagnostics, ledger };
  const save = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  let hosted: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined, page: Page | undefined;
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const entry: Step = { name, status: 'fail' }; steps.push(entry);
    try { entry.details = await fn(); entry.status = 'pass'; } catch (error) { entry.error = error instanceof Error ? error.stack ?? error.message : String(error); }
    console.log(`B-08 ${o.backend} ${name}: ${entry.status.toUpperCase()}${entry.error ? ' ' + entry.error.split('\n')[0] : ''}`); await save();
    return entry.status === 'pass';
  };
  try {
    hosted = await serveOwned(root); ledger.server = { port: hosted.port, pid: process.pid };
    browser = await launchChrome({ workspace, name: `b08-${o.backend}`, windowSize: [WIDTH, HEIGHT] }); ledger.browserPid = browser.process()?.pid;
    ledger.browserProfile = browser.process()?.spawnargs.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length); report.browser = await browser.version();
    for (const blank of await browser.pages()) await blank.close();
    const p = page = await browser.newPage(); await configurePage(p, new Set([hosted.port]), diagnostics);
    const url = new URL(hosted.url); url.searchParams.set('tier', 'high'); if (o.backend === 'webgl2') url.searchParams.set('backend', 'webgl2'); report.url = url.href;
    await p.goto(url.href, { waitUntil: 'load', timeout: TIMEOUT }); await waitForReady(p);
    await p.waitForFunction(() => ['simState', 'placePlayer', 'placeTractor', 'teleport', 'cameraPose', 'colliderStats', 'feedFrameTimes', 'setTimeScale'].every(name => typeof (window as any).__kilnScene?.[name] === 'function'), { timeout: TIMEOUT });
    await p.evaluate(() => { const api = (window as any).__kilnScene; api.feedFrameTimes([]); api.setTimeScale(1); });
    report.backendReported = await p.evaluate(() => (window as any).__kilnHarness.snapshot().backend);
    let home: Vec = [0, 0, 0], walkSpeed = 0;
    const place = async (spot: readonly number[], yaw: number, frames = 6) => { await hook(p, 'placePlayer', spot[0], spot[1], spot[2], yaw); await waitFrames(p, frames); };
    const placeTractor = async (pose4: readonly number[], frames = 3) => { await hook(p, 'placeTractor', pose4[0], pose4[1], pose4[2], pose4[3]); await waitFrames(p, frames); };
    const mountFrom = async (stand: Vec) => {
      await place(stand, 0, 4); const s = await state(p); assert.equal(s.nearest, 'tractor', 'the tractor is the nearest interaction');
      await waitPrompt(p, FARM_STRINGS.drive); assert.equal((await hud(p)).interact?.disabled, false);
      await p.keyboard.press('KeyE'); await p.waitForFunction(() => (window as any).__kilnScene.simState().driving, { timeout: 5_000 });
      await waitStatus(p, FARM_STRINGS.tractorKeyboard); await waitPrompt(p, FARM_STRINGS.leaveTractor);
    };
    const dismount = async () => {
      await p.keyboard.press('KeyE'); await p.waitForFunction(() => !(window as any).__kilnScene.simState().driving, { timeout: 5_000 }); await waitFrames(p, 3);
      const s = await state(p); assert.equal(s.status, ''); assert.equal(s.active, true);
      const reach = flatDistance(s.player.position, s.tractor.position); assert(reach > 1 && reach < FARM_DOORS.tractorRadius, `Rowan steps out beside the tractor (${reach} m)`);
      return { exitDistance: round(reach), player: s.player.position };
    };

    await step('overview before play', async () => {
      const h = await hud(p), s = await state(p); home = s.player.position;
      assert.equal(s.active, false); assert.equal(h.mode, FARM_STRINGS.walk); assert.equal(h.cameraButtons, true); assert.equal(h.interact, null); assert.equal(h.status, '');
      return { hud: h, home };
    });
    await step('start play from the mode button; help opens once; prompt and focus', async () => {
      await clickButton(p, FARM_STRINGS.walk);
      await p.waitForFunction(() => (window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitPrompt(p, FARM_STRINGS.approach);
      const h = await hud(p);
      assert.equal(h.mode, FARM_STRINGS.overview); assert.equal(h.cameraButtons, false); assert.equal(h.status, ''); assert.equal(h.focus, 'ks-root');
      assert.equal(h.helpExpanded, 'true'); assert(h.help?.includes(FARM_STRINGS.helpKeyboard), 'desktop help text');
      assert.deepEqual(h.interact, { text: FARM_STRINGS.approach, disabled: true }, 'no (E) suffix before keyboard input');
      await clickButton(p, 'Close controls'); await waitFrames(p, 2);
      const closed = await hud(p); assert.equal(closed.help, null); assert.equal(closed.helpExpanded, 'false');
      const stored = await p.evaluate(() => { try { return Object.keys(localStorage).filter(key => key.endsWith('.help')).map(key => [key, localStorage.getItem(key)]); } catch { return null; } });
      assert.deepEqual(stored?.map(entry => entry[1]), ['dismissed']);
      await p.focus('.ks-root');
      return { hud: h, closed, stored };
    });
    await step('walk is camera-relative at walking pace', async () => {
      const [x, y, z, yaw] = scenario.walk.start; await place([x, y, z], yaw, 20);
      const f = forwardOf(await pose(p)), samples = await hold(p, ['KeyW'], 1500);
      const a = samples.find(s => s.t >= 250)!, b = samples.at(-1)!, d = sub(b.p, a.p);
      const along = flatDot(flatUnit(d), f), speed = flatLength(d) / ((b.t - a.t) / 1000); walkSpeed = speed;
      assert(along > .995, `walk direction follows the camera (cos ${along})`); assert(Math.abs(speed / FARM_WALK.pace - 1) < .15, `walking pace ${speed} m/s`);
      assert(samples.every(s => s.status === ''), 'no status while walking in the open');
      const h = await hud(p); assert.equal(h.interact?.text, FARM_STRINGS.approach + ' (E)', '(E) suffix after keyboard input');
      return { cameraForward: f.map(v => round(v)), cosine: round(along, 6), metersPerSecond: round(speed, 3), frames: samples.length };
    });
    await step('run (Shift) at running pace along the camera', async () => {
      const f = forwardOf(await pose(p)), samples = await hold(p, ['ShiftLeft', 'KeyW'], 1500);
      const a = samples.find(s => s.t >= 250)!, b = samples.at(-1)!, d = sub(b.p, a.p), along = flatDot(flatUnit(d), f), speed = flatLength(d) / ((b.t - a.t) / 1000);
      assert(along > .995, `run direction (cos ${along})`); assert(Math.abs(speed / FARM_WALK.runPace - 1) < .15, `running pace ${speed} m/s`);
      const ratio = speed / walkSpeed; assert(Math.abs(ratio / (FARM_WALK.runPace / FARM_WALK.pace) - 1) < .1, `run/walk ratio ${ratio}`);
      return { cosine: round(along, 6), metersPerSecond: round(speed, 3), ratio: round(ratio, 3), expectedRatio: round(FARM_WALK.runPace / FARM_WALK.pace, 3) };
    });
    await step('strafe (D) moves to the camera right', async () => {
      const f = forwardOf(await pose(p)), samples = await hold(p, ['KeyD'], 1000);
      const a = samples.find(s => s.t >= 200)!, b = samples.at(-1)!, cos = flatDot(flatUnit(sub(b.p, a.p)), rightOf(f));
      assert(cos > .995, `strafe direction (cos ${cos})`); return { cosine: round(cos, 6) };
    });
    await step('drag turns the follow camera without creep; walking follows the new view', async () => {
      const before = forwardOf(await pose(p));
      await p.mouse.move(640, 420); await p.mouse.down(); await p.mouse.move(700, 420, { steps: 8 }); await p.mouse.up(); await waitFrames(p, 5);
      const turned = forwardOf(await pose(p)), focus = (await hud(p)).focus; await waitFrames(p, 60);
      const settled = forwardOf(await pose(p)), angle = degrees(before, turned), creep = degrees(turned, settled);
      assert(angle > 15 && angle < 45, `drag turned the camera ${angle} degrees`); assert(creep < .05, `no camera creep after the drag (${creep} degrees)`);
      assert.equal(focus, 'ks-root', 'a canvas drag keeps keyboard focus in the scene');
      const samples = await hold(p, ['KeyW'], 1000), a = samples.find(s => s.t >= 200)!, b = samples.at(-1)!, cos = flatDot(flatUnit(sub(b.p, a.p)), settled);
      const last = forwardOf(b.camera!); assert(degrees(settled, last) < .05, 'walking keeps the dragged view');
      assert(cos > .995, `walk follows the dragged camera (cos ${cos})`);
      return { dragDegrees: round(angle, 3), creepDegrees: round(creep, 5), cosine: round(cos, 6) };
    });
    await step('blocked by the farmhouse wall (static collider, head-on)', async () => {
      const wall = scenario.wall; await place(wall.start, wall.yaw, 20);
      const f = forwardOf(await pose(p)); assert(flatDot(f, wall.direction) > .9999, 'the camera faces the wall');
      const samples = await hold(p, ['KeyW'], 2400), end = samples.at(-1)!, late = samples.find(s => s.t >= end.t - 600)!;
      assert(distance(end.p, late.p) < .002, 'no drift while W is held against the wall');
      assert(flatDistance(end.p, wall.stop) < .01, `stopped at the oracle's contact (${flatDistance(end.p, wall.stop)} m)`);
      const beyond = Math.max(...samples.map(s => flatDot(sub(s.p, wall.stop), wall.direction))); assert(beyond < .005, `never beyond the contact (${beyond})`);
      return { stop: end.p, oracleStop: wall.stop.map(v => round(v)), offsetFromOracle: round(flatDistance(end.p, wall.stop), 6), heldFrames: samples.filter(s => s.t >= end.t - 600).length };
    });
    await step('follow camera pulls in at the wall and hides Rowan; recovers walking away', async () => {
      const o2 = scenario.obstruction; await place(o2.at, o2.yaw, 6);
      const c = await pose(p), s = await state(p), pulled = distance(c.position, c.target);
      assert(Math.abs(pulled - o2.distance) < .005, `pulled-in distance ${pulled} vs ${o2.distance}`); assert.equal(s.player.visible, !o2.hidden, 'Rowan hidden when the camera is inside him');
      const samples = await hold(p, ['KeyW'], 3000), last = samples.at(-1)!, recovered = distance(last.camera!.position, last.camera!.target);
      assert(recovered > 2.5, `camera distance recovers (${recovered})`); assert.equal(last.visible, true, 'Rowan visible again');
      const monotone = samples.every((x, i) => i === 0 || distance(x.camera!.position, x.camera!.target) >= distance(samples[i - 1]!.camera!.position, samples[i - 1]!.camera!.target) - 1e-3);
      assert(monotone, 'the camera only lengthens while Rowan walks away');
      return { pulled: round(pulled, 5), expected: round(o2.distance, 5), hidden: !s.player.visible, recovered: round(recovered, 3), full: round(o2.full, 3) };
    });
    await step('blocked at the river with the status text', async () => {
      await place(scenario.riverStart, Math.PI / 2, 10);
      const samples = await hold(p, ['KeyW'], 4500), end = samples.at(-1)!;
      assert(samples.some(s => s.status === FARM_STRINGS.river), 'river status while held at the bank');
      assert(flatDistance(end.p, scenario.riverEdge) < .02, `held at the oracle's river edge (${flatDistance(end.p, scenario.riverEdge)} m)`);
      assert(samples.every(s => s.p[2] >= scenario.riverEdge[2] - .01), 'never into the river');
      const h = await hud(p); assert.equal(h.status, FARM_STRINGS.river, 'status line shows the river text');
      return { end: end.p, oracle: scenario.riverEdge.map(v => round(v)), status: h.status };
    });
    await step('cross by the timber bridge', async () => {
      assert.equal(await hook(p, 'teleport', 'bridge'), true); await waitFrames(p, 10);
      const samples = await hold(p, ['ShiftLeft', 'KeyW'], 6500), end = samples.at(-1)!;
      const deck = samples.filter(s => Math.abs(s.p[0] - bridgeCenter[0]) < 1.7 && Math.abs(s.p[2] - bridgeCenter[1]) < 3.3);
      assert(deck.length > 10, 'samples on the bridge deck'); const deckY = Math.max(...deck.map(s => s.p[1]));
      assert(Math.abs(deckY - scenario.bridge.deckMaxY) < .01, `deck height ${deckY}`);
      assert(end.p[2] < bridgeCenter[1] - 3.3, `reached the far bank (z ${end.p[2]})`); assert(!samples.some(s => s.status === FARM_STRINGS.river), 'no river status on the bridge');
      return { end: end.p, deckY: round(deckY, 5), deckSamples: deck.length };
    });
    for (const id of ['farmhouse', 'barn', 'watermill', 'fence-gate'] as const) {
      await step(`open and close the ${DOOR_LABELS[id]} (${id === 'barn' ? 'Interact button' : 'E key'})`, async () => {
        const door = scenario.doorIds[id], label = DOOR_LABELS[id], mouse = id === 'barn', record: Record<string, unknown> = {};
        for (const [phase, opening] of [['before opening', true], ['before closing', false]] as const) {
          await place(stands[`${id} ${phase}`]!, 0, 4);
          const s = await state(p); assert.equal(s.nearest, door, `${label} is the nearest interaction`);
          await waitPrompt(p, doorPrompt(label, !opening)); const h = await hud(p); assert.equal(h.interact?.disabled, false);
          if (mouse) { await p.click('.ks-interact'); await p.focus('.ks-root'); } else await p.keyboard.press('KeyE');
          await waitStatus(p, doorStatus(label, opening)); await waitDoor(p, door, opening ? 1 : 0);
          record[opening ? 'opened' : 'closed'] = { prompt: h.interact?.text, status: doorStatus(label, opening) };
        }
        return record;
      });
    }
    await step('door stops when Rowan is in its path', async () => {
      assert(scenario.doorwayNearest, 'oracle: the farmhouse door is nearest from the doorway');
      const door = scenario.doorIds.farmhouse, label = DOOR_LABELS.farmhouse;
      await place(stands['farmhouse before opening']!, 0, 4); await p.keyboard.press('KeyE'); await waitDoor(p, door, 1);
      await place(stands['farmhouse doorway']!, 0, 4); assert.equal((await state(p)).nearest, door);
      await waitPrompt(p, doorPrompt(label, true));
      await p.keyboard.press('KeyE'); await waitStatus(p, FARM_STRINGS.doorBlocked); await waitFrames(p, 10);
      const find = async () => (await state(p)).doors.find((entry: { id: string }) => entry.id === door);
      const d = await find(); assert(Math.abs(d.target - d.amount) < 1e-3, `the leaf stops where it meets Rowan (target ${d.target}, amount ${d.amount})`);
      assert(d.amount > .4, `stopped before closing (${d.amount})`); await waitFrames(p, 30);
      const later = await find(); assert(Math.abs(later.amount - d.amount) < 1e-4, 'and stays stopped');
      await place(stands['farmhouse before closing']!, 0, 4); await waitPrompt(p, doorPrompt(label, true)); await p.keyboard.press('KeyE'); await waitDoor(p, door, 0);
      return { stoppedAt: d.amount, status: FARM_STRINGS.doorBlocked };
    });
    await step('destinations and reset (test hooks; no public menu per D-09)', async () => {
      const visited: Record<string, unknown> = {};
      for (const [name, destination] of Object.entries(FARM_DESTINATIONS)) {
        assert.equal(await hook(p, 'teleport', name), true); await waitFrames(p, 3);
        const s = await state(p), c = await pose(p), offset = flatDistance(s.player.position, destination.position as unknown as Vec);
        assert(offset < .6, `${name}: Rowan at the destination (${offset} m)`); assert(Math.abs(s.player.yaw - round(destination.yaw)) < 1e-3, `${name}: yaw`);
        assert(distance(c.position, c.target) <= Math.hypot(FARM_CAMERA.playOffsetLength, FARM_CAMERA.walkingHeight) + 1e-3, `${name}: follow camera reset`);
        visited[name] = { offset: round(offset), camera: round(distance(c.position, c.target), 3) };
      }
      assert.equal(await hook(p, 'resetFarmer'), true); await waitFrames(p, 3);
      const s = await state(p); assert(flatDistance(s.player.position, home) < 1e-3, 'reset returns Rowan to his placement');
      return { visited, reset: s.player.position };
    });
    await step('mount the tractor, drive, steer and reverse; dismount at a free exit', async () => {
      await placeTractor(scenario.drive); await mountFrom(stands.drive!);
      const h = await hud(p); assert.equal(h.interact?.text, FARM_STRINGS.leaveTractor + ' (E)'); assert.equal(h.status, FARM_STRINGS.tractorKeyboard);
      const c = await pose(p), chase = distance(c.position, c.target);
      const blocked0 = (await state(p)).blockedSteps;
      const forward = await hold(p, ['KeyW'], 2000), a = forward[0]!, b = forward.at(-1)!;
      const heading: Vec = [Math.cos(a.yaw), 0, -Math.sin(a.yaw)], moved = sub(b.tractor, a.tractor), along = flatDot(moved, heading);
      assert(along > 4, `drove forward ${along} m`); assert(flatDot(flatUnit(moved), heading) > .999, 'along its heading'); assert(b.speed > 3.5, `speed ${b.speed}`);
      const turn = await hold(p, ['KeyW', 'KeyA'], 1500), yawChange = turn.at(-1)!.yaw - turn[0]!.yaw;
      assert(yawChange > .5, `A steers left (yaw +${yawChange})`);
      const reverse = await hold(p, ['KeyS'], 1500), rear = reverse.at(-1)!;
      assert(rear.speed < -1, `S reverses (speed ${rear.speed})`);
      await sample(p, 1500);
      const s = await state(p); assert.equal(s.blockedSteps, blocked0, 'no blocked step in the clear drive area'); assert(s.drivenMeters > 8, `driven ${s.drivenMeters} m`);
      const exit = await dismount();
      return { chaseDistance: round(chase, 3), expectedChase: round(Math.hypot(FARM_CAMERA.playOffsetLength, FARM_CAMERA.drivingHeight), 3), forwardMeters: round(along, 3), topSpeed: b.speed, yawChange: round(yawChange, 4), reverseSpeed: rear.speed, drivenMeters: s.drivenMeters, exit };
    });
    await step('the +-33 m bound holds the tractor with the obstacle text', async () => {
      await placeTractor(scenario.boundStart); await mountFrom(stands['bound lane']!);
      const blocked0 = (await state(p)).blockedSteps, samples = await hold(p, ['KeyW'], 4000), end = samples.at(-1)!;
      assert(Math.max(...samples.map(s => s.tractor[0])) <= 33, 'never beyond x = 33'); assert(end.tractor[0] > 32.5, `held at the bound (x ${end.tractor[0]})`);
      assert(samples.some(s => s.status === FARM_STRINGS.obstacle), 'obstacle text at the bound'); assert(end.blocked > blocked0, 'blocked steps counted');
      assert.equal((await hud(p)).status, FARM_STRINGS.obstacle);
      const exit = await dismount();
      return { heldAtX: end.tractor[0], oracleHeldAtX: oracle.scenario.bound.heldAtX, blockedSteps: end.blocked - blocked0, exit };
    });
    await step('an obstacle (the barn) stops the tractor', async () => {
      await placeTractor(scenario.barnApproach); await mountFrom(stands['barn approach']!);
      const blocked0 = (await state(p)).blockedSteps, samples = await hold(p, ['KeyW'], 5000), end = samples.at(-1)!, late = samples.find(s => s.t >= end.t - 800)!;
      assert(samples.some(s => s.status === FARM_STRINGS.obstacle), 'obstacle text'); assert(flatDistance(end.tractor, late.tractor) < .01, 'stopped against the barn');
      const run = flatDistance(end.tractor, at(scenario.barnApproach)), gap = Math.hypot(end.tractor[0] - scenario.barn.contact[0], end.tractor[2] - scenario.barn.contact[1]);
      assert(run > 3, `drove ${run} m toward the barn`); assert(gap < .3, `stopped at the oracle's barn contact (${gap} m)`); assert(end.blocked > blocked0, 'blocked steps counted');
      assert.equal((await hud(p)).status, FARM_STRINGS.obstacle);
      return { stoppedAt: end.tractor, contact: scenario.barn.contact, oracleStop: scenario.barn.stop, run: round(run, 3), gap: round(gap, 4) };
    });
    await step('every exit blocked: E and Escape keep play, the mode button and visits are refused; then a free exit', async () => {
      const escapes = await shellEscapes(p);
      await placeTractor(scenario.wedge);
      await p.keyboard.press('KeyE'); await waitStatus(p, FARM_STRINGS.exitBlocked);
      let s = await state(p); assert.equal(s.driving, true); assert.equal(s.active, true);
      await p.keyboard.press('Escape'); await waitFrames(p, 4);
      s = await state(p); assert.equal(s.active, true, 'Escape keeps play'); assert.equal(s.driving, true); assert.equal(await shellEscapes(p), escapes, 'the page shell never saw that Escape');
      await clickButton(p, FARM_STRINGS.overview); await waitFrames(p, 4);
      s = await state(p); const h = await hud(p); assert.equal(s.active, true, 'the mode button keeps play'); assert.equal(h.mode, FARM_STRINGS.overview); await p.focus('.ks-root');
      assert.equal(await hook(p, 'teleport', 'yard'), false, 'visit refused'); assert.equal(await hook(p, 'resetFarmer'), false, 'reset refused');
      await placeTractor(scenario.clear);
      const exit = await dismount();
      return { status: FARM_STRINGS.exitBlocked, shellEscapes: await shellEscapes(p), exit };
    });
    await step('Escape while driving leaves the tractor and play; the shell sees only the second Escape', async () => {
      const s0 = await state(p); assert.equal(s0.nearest, 'tractor'); await p.keyboard.press('KeyE'); await p.waitForFunction(() => (window as any).__kilnScene.simState().driving, { timeout: 5_000 });
      const escapes = await shellEscapes(p);
      await p.keyboard.press('Escape'); await p.waitForFunction(() => !(window as any).__kilnScene.simState().active, { timeout: 5_000 }); await waitFrames(p, 3);
      const s = await state(p), h = await hud(p); assert.equal(s.driving, false); assert.equal(await shellEscapes(p), escapes, 'first Escape consumed by play');
      assert.equal(h.mode, FARM_STRINGS.walk); assert.equal(h.cameraButtons, true); assert.equal(h.interact, null); assert.equal(s.player.visible, true);
      await p.keyboard.press('Escape'); await waitFrames(p, 3); assert.equal(await shellEscapes(p), escapes + 1, 'second Escape reaches the page shell');
      return { shellEscapes: escapes + 1, player: s.player.position };
    });
    await step('restart play (help stays dismissed); Escape while walking, then the shell Escape', async () => {
      await clickButton(p, FARM_STRINGS.walk); await p.waitForFunction(() => (window as any).__kilnScene.simState().active, { timeout: 10_000 }); await waitFrames(p, 3);
      const h = await hud(p); assert.equal(h.help, null, 'help is not reopened after dismissal'); assert.equal(h.helpExpanded, 'false'); assert.equal(h.focus, 'ks-root');
      await hold(p, ['KeyS'], 500);
      const escapes = await shellEscapes(p);
      await p.keyboard.press('Escape'); await p.waitForFunction(() => !(window as any).__kilnScene.simState().active, { timeout: 5_000 }); await waitFrames(p, 3);
      assert.equal(await shellEscapes(p), escapes); assert.equal((await hud(p)).mode, FARM_STRINGS.walk);
      await p.keyboard.press('Escape'); await waitFrames(p, 3); assert.equal(await shellEscapes(p), escapes + 1);
      return { shellEscapes: escapes + 1 };
    });
    await step(`B-07 collision world equals the frozen ${release} pilot fixture`, async () => {
      const stats = await hook(p, 'colliderStats') as any;
      assert.deepEqual({ colliders: stats.colliders, dynamic: stats.dynamic, staticTriangles: stats.staticTriangles, dynamicTriangles: stats.dynamicTriangles, doors: stats.doors, doorPivots: stats.doorPivots },
        { colliders: fixture.colliders, dynamic: fixture.dynamic, staticTriangles: fixture.staticTriangles, dynamicTriangles: fixture.dynamicTriangles, doors: fixture.doors, doorPivots: fixture.doorPivots });
      assert.deepEqual(stats.keys.map((k: any) => [k.dynamic, k.triangles]), fixture.keys.map((k: any) => [k.dynamic, k.triangles]));
      return { colliders: stats.colliders, dynamic: stats.dynamic, staticTriangles: stats.staticTriangles, dynamicTriangles: stats.dynamicTriangles, doors: stats.doors, doorPivots: stats.doorPivots };
    });
    await step('no browser errors or warnings', async () => { const bad = badDiagnostics(diagnostics); assert.deepEqual(bad, []); return { messages: diagnostics.length }; });
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); }
  finally {
    const cleanup: string[] = [];
    try { await page?.evaluate(() => (window as any).__kilnHarness?.unmount()); } catch { /* the page may have failed before mounting */ }
    try { await browser?.close(); ledger.browserClosed = true; } catch (error) { cleanup.push('browser: ' + String(error)); }
    try { await hosted?.close(); ledger.serverClosed = true; } catch (error) { cleanup.push('server: ' + String(error)); }
    ledger.cleanupErrors = cleanup;
    report.summary = { steps: steps.length, passed: steps.filter(s => s.status === 'pass').length, failed: steps.filter(s => s.status === 'fail').map(s => s.name) };
    report.status = !report.error && steps.length > 0 && steps.every(s => s.status === 'pass') ? 'pass' : 'fail';
    await save();
    if (cleanup.length) throw new AggregateError(cleanup, 'Owned B-08 resources did not all close');
  }
  return { out, pass: report.status === 'pass', report };
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (key: string, fallback?: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
  const label = value('--label'), backend = value('--backend', 'both')!;
  assert(label && /^[a-z0-9][a-z0-9._-]*$/.test(label), 'Usage: bun scripts/run-farm-play.ts --label <new-evidence-name> [--backend both|webgpu|webgl2] [--root packages/farm/dist/test]');
  assert(['both', 'webgpu', 'webgl2'].includes(backend), 'Backend must be both, webgpu or webgl2');
  let pass = true;
  for (const b of (backend === 'both' ? ['webgpu', 'webgl2'] : [backend]) as Backend[]) {
    const result = await runFarmPlay({ backend: b, label, root: value('--root'), outRoot: value('--out-root') });
    console.log(`B-08 ${b}: ${result.pass ? 'PASS' : 'FAIL'} (${result.out})`); pass &&= result.pass;
  }
  if (!pass) process.exitCode = 1;
}
