// FF-C1 captures (TASK-FF-CAMPUS-1 item 10, with the browser checks of items 4 to 7): on WebGPU and on the WebGL2
// fallback, the campus from orbit (the whole campus, one pair, the arrival canopy, the split, under an S5 bridge, the
// roundabout), the split, an S5 bridge and the roundabout from the driven car, the way in (the canopy, Enter the fab,
// the interior landing), the interior views FF2 captured (their cameras, draw calls and triangles against FF2's
// recorded evidence/captures/ff2/captures.json), the twin's hashes against the same run headless (warm start, one sim
// hour later, and a fresh session after Exit and a second Enter), and Exit back to the canopy. On the first backend the
// drive's own checks (keys, road-end turn-around by the key and by holding against the stop, Enter the fab from the car
// and Exit back to it at rest, leaving the car); the phone layout (390 x 844, touch: Reset view, the kit joystick);
// per tier the renderer's draw calls and triangles and the scene's instance counts at every view, measured from the
// build (no frame times: this PC measures no performance); and the public build on both backends.
// Headless Chrome with an explicit --window-size, dist/campus/test (and dist/campus/standalone for the public check)
// served on an owned port (4700-4749); each page in a browser context of its own, as a first visit. The kit clock is
// frozen (`freeze=1`): the twin and the traffic hold still until a hook steps them; the car moves on raw frame time, so
// driven frames are taken with the car placed at rest and braked. Evidence goes to evidence/captures/ffc1/:
// captures.json and JPEG contact sheets; every frame's record carries its PNG's SHA-256 and size and names its sheet.
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/capture-campus.ts [--backends=webgpu,webgl2] [--skip=tiers,phone,public]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ElementHandle, Page, Viewport } from 'puppeteer-core';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { campusOutputFor } from './build-campus.ts';
import { createFab, FAB_DATA } from '../../src/sim/index.ts';
import { parseCampus } from '../../src/campus/data.ts';
import { parseDriving } from '../../src/campus/drive/driving.ts';

type Backend = 'webgpu' | 'webgl2';
const WIDTH = 1280, HEIGHT = 720;
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const ORBIT_VIEWS = ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout'] as const;
const INTERIOR_VIEWS = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const;
const TIERS = ['minimal', 'economy', 'balanced', 'high'] as const;
const backends = (process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const skip = new Set((process.argv.find(a => a.startsWith('--skip='))?.slice(7) ?? '').split(',').filter(Boolean));
const first = backends[0] as Backend;
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/ffc1');
mkdirSync(outDir, { recursive: true });
const CAMPUS = parseCampus(readFileSync(resolve(PACKAGE_ROOT, 'data/campus.json'))), DRIVING = parseDriving(readFileSync(resolve(PACKAGE_ROOT, 'data/driving.json')));
const LANES = CAMPUS.roads.split.lanes, RING = CAMPUS.roads.roundabout.lanes;
/** The car's lane (nb-1 by the data's start) as a lateral offset, and its ring lane's radius. */
const LANE_V = LANES.firstCentre + LANES.width, RING_R = RING.inner + RING.width * 1.5;
const bridgeU = (id: string) => CAMPUS.placements.find(p => p.id === id)!.position[0];
/** Driven frames: the car's footprint centre, heading (degrees, 0 north) and what the frame shows. */
const DRIVEN = [
  { name: 'drive-split', u: -2800, v: LANE_V, heading: 0, what: 'the split between the halls from the driven car, northbound in lane nb-1' },
  { name: 'drive-bridge', u: bridgeU('bridge-S2') + 20, v: LANE_V, heading: 0, what: 'under S5 bridge-S2 from the driven car' },
  { name: 'drive-roundabout', u: 0, v: RING_R, heading: 0, what: 'in the roundabout, ring lane 1 on its east side, from the driven car' },
] as const;
const ENTER_SPOT = { u: (CAMPUS.interior.enterZone.u[0] + CAMPUS.interior.enterZone.u[1]) / 2, v: -LANE_V, heading: 180 };
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rel = (path: string) => relative(PACKAGE_ROOT, path).replace(/\\/g, '/');
const round = (v: unknown, d = 3): unknown => typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : Array.isArray(v) ? v.map(x => round(x, d)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, d)])) : v;
const sleep = (ms: number) => new Promise(accept => setTimeout(accept, ms));
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) { failures.push(what); console.log(`FAIL ${what}`); } return ok; };
// The FF2 evidence the interior must equal: each view's camera, draw calls and triangles, and the twin's hashes.
const FF2 = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'evidence/captures/ff2/captures.json'), 'utf8')) as {
  records: { requested: Backend; views: { view: string; camera: { position: number[]; fov: number }; stats: { drawCalls: number; triangles: number } }[] }[];
  twin: { runs: { requested: Backend; warmStart: string; plusOneHour: string }[] };
};
const headlessTwin = (() => {
  const fab = createFab({ snapshot: readFileSync(resolve(PACKAGE_ROOT, `data/warm/seed-${FAB_DATA.config.seeds.default}.json`), 'utf8'), mode: 'megafab' });
  fab.step(fab.now());
  const simMs = fab.now(), warmStart = fab.hash();
  fab.step(fab.now() + 3_600_000);
  return { simMs, warmStart, plusOneHour: fab.hash() };
})();

/* eslint-disable @typescript-eslint/no-explicit-any */
const inv = <T = any>(page: Page, name: string, ...args: unknown[]): Promise<T> => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args) as Promise<T>;
const frames = (page: Page, n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n);
/** After a state change: the kit's HUD store notifies at most ten times a second, then React renders. */
const settle = async (page: Page) => { await sleep(260); await frames(page, 2); };
const stats = (page: Page) => page.evaluate(() => { const s = (window as any).__kilnScene.stats(); return { programs: s.programs, pipelines: s.pipelines, drawCalls: s.render?.drawCalls, triangles: s.render?.triangles }; });
const shown = (page: Page, selector: string) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }, selector);
const hud = (page: Page) => page.evaluate(() => ({
  buttons: [...document.querySelectorAll('.ks-hud button')].map(b => (b.textContent ?? '') + ((b as HTMLButtonElement).disabled ? ' (disabled)' : '')),
  status: [...document.querySelectorAll('.ks-hud .ks-status')].map(s => s.textContent ?? '').filter(Boolean),
  speed: document.querySelector('.fc-speed')?.textContent ?? null, joystick: !!document.querySelector('.ks-joystick'), help: !!document.querySelector('.ks-help'),
}));
/** A HUD button by its exact text, clicked with the mouse or tapped. */
async function press(page: Page, label: string, how: 'click' | 'tap' = 'click'): Promise<boolean> {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ks-hud button')].find(b => b.textContent === text) ?? null, label);
  const element = handle.asElement() as ElementHandle<Element> | null;
  if (!element) return check(false, `no HUD button "${label}" (${(await hud(page)).buttons.join(', ')})`);
  if (how === 'tap') await element.tap(); else await element.click();
  await frames(page, 2); await settle(page);
  return true;
}
/** Waits for a place switch to finish (the fade up done and, inside, the twin's first view). */
async function waitPlace(page: Page, place: 'exterior' | 'interior', timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const p = await inv(page, 'campusPlace').catch(() => null);
    if (p && p.place === place && !p.moving && (place === 'exterior' || p.interiorReady)) { await frames(page, 4); return p; }
    if (Date.now() - t0 > timeoutMs) { check(false, `the ${place} did not arrive (${JSON.stringify(p)})`); return p; }
    await sleep(150);
  }
}
/** Waits until the drive's traffic and vehicles are built (Drive the sedan appears). */
async function waitDriveReady(page: Page, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if ((await hud(page)).buttons.some(b => b.startsWith('Drive the sedan') || b === 'Leave the car')) return true; await sleep(150); }
  return check(false, 'the drive never became ready');
}

const hosted = await serveOwned(campusOutputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('ffc1-capture', WIDTH, HEIGHT);
const frameRecord = async (page: Page) => {
  const b64 = await page.screenshot({ type: 'png', encoding: 'base64' }) as string, bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return { b64, record: { sha256: sha(bytes), size: bytes.length } };
};
/** Frames kept for the contact sheets, by sheet, in capture order: the PNG is hashed and kept in memory, only the sheet is written. */
const sheetFrames = new Map<string, { name: string; b64: string }[]>();
const sheetFile = (group: string) => resolve(outDir, `sheet-${group}.jpg`);
const sheetShot = async (page: Page, group: string, name: string) => {
  const { b64, record } = await frameRecord(page);
  if (!sheetFrames.has(group)) sheetFrames.set(group, []);
  sheetFrames.get(group)!.push({ name, b64 });
  return { sheet: rel(sheetFile(group)), frame: name, ...record };
};
try {
  const openPage = async (backend: Backend, options: { viewport?: Viewport; tier?: string } = {}) => {
    const context = await chrome.browser.createBrowserContext(), close = () => context.close();
    const page = await context.newPage(), messages: ConsoleRecord[] = [];
    if (options.viewport) await page.setViewport(options.viewport);
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    const params = `capture=1&freeze=1&tier=${options.tier ?? 'high'}${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
    const url = `${hosted.url}/?${params}`; assertOwnedUrl(url, owned);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000, polling: 250 });
    const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
    if (!snapshot.readyCount) throw new Error(`${backend}: ${JSON.stringify(snapshot.errors)}`);
    await frames(page, 12);
    await waitDriveReady(page);
    return { page, messages, params, snapshot, close };
  };
  /** A contact sheet: the frames scaled to `cellWidth` in `columns` columns with their names, as one JPEG. */
  const sheet = async (title: string, shots: { name: string; b64: string }[], file: string, cellWidth = 640, columns = 2) => {
    const page = await chrome.browser.newPage();
    try {
      await page.setViewport({ width: 20 + columns * cellWidth + (columns - 1) * 10, height: 800, deviceScaleFactor: 1 });
      const cells = shots.map(s => `<figure><img src="data:image/png;base64,${s.b64}"><figcaption>${s.name}</figcaption></figure>`).join('');
      await page.setContent(`<!doctype html><html><head><style>body{margin:0;padding:10px;background:#111;color:#eee;font:14px system-ui}h1{font-size:16px;margin:0 0 8px}
        main{display:grid;grid-template-columns:repeat(${columns},${cellWidth}px);gap:10px}figure{margin:0}img{width:${cellWidth}px;height:auto;display:block}figcaption{padding:2px 0 0}</style></head>
        <body><h1>${title}</h1><main>${cells}</main></body></html>`, { waitUntil: 'load' });
      const bytes = Uint8Array.from(atob(await page.screenshot({ type: 'jpeg', quality: 85, fullPage: true, encoding: 'base64' }) as string), c => c.charCodeAt(0));
      writeFileSync(file, bytes);
      return { file: rel(file), sha256: sha(bytes), size: bytes.length };
    } finally { await page.close(); }
  };
  /** The driven car placed at rest and braked (the car moves on raw frame time), the chase camera started over behind it. */
  const placeAtRest = async (page: Page, u: number, v: number, heading: number) => {
    await inv(page, 'setDriveInput', { brake: 1 });
    const placed = await inv(page, 'placeCar', u, v, heading, 0);
    await frames(page, 8); await settle(page);
    return placed;
  };

  // 1. Per backend: the orbit views, the driven views, the way in, FF2's interior views, the twin, Exit and a second Enter.
  const records: Record<string, unknown>[] = [];
  for (const backend of backends) {
    const { page, messages, params, snapshot, close } = await openPage(backend);
    const group = `views-${backend}`;
    try {
      const views: Record<string, unknown>[] = [];
      for (const view of ORBIT_VIEWS) {
        await inv(page, 'campusView', view); await frames(page, 20); await settle(page);
        const state = await inv(page, 'campusState'), counts = await inv(page, 'counts'), st = await stats(page);
        check(state.place === 'exterior' && state.view === view, `${backend} ${view}: the orbit shows the view (${state.view})`);
        views.push({ view, camera: round(state.camera), stats: st, counts, ...(await sheetShot(page, group, `orbit ${view} (${backend})`)) });
      }
      // The driven car: Drive the sedan takes it at its start (rolling); then placed at rest for each driven view.
      await press(page, 'Drive the sedan');
      const start = await inv(page, 'driveState'), startHud = await hud(page);
      if (await shown(page, '.ks-help')) await press(page, 'Close controls');
      check(!!start && start.speed > 0 && start.centre[0] >= DRIVING.start.window[0] - 1 && start.centre[0] <= DRIVING.start.window[1] + 1,
        `${backend} drive: Drive the sedan starts the car rolling in the start window (${JSON.stringify(round(start))})`);
      check(startHud.buttons.includes('Leave the car') && startHud.speed !== null, `${backend} drive: the HUD shows Leave the car and the speed (${JSON.stringify(startHud)})`);
      views.push({ view: 'drive-start', car: round(start), hud: startHud, stats: await stats(page), counts: await inv(page, 'counts'), ...(await sheetShot(page, group, `drive start (${backend})`)) });
      for (const d of DRIVEN) {
        const car = await placeAtRest(page, d.u, d.v, d.heading), state = await inv(page, 'driveState'), counts = await inv(page, 'counts');
        check(!!car && Math.abs(state.centre[0] - d.u) < 0.5 && Math.abs(state.centre[1] - d.v) < 0.5, `${backend} ${d.name}: the car stands at its spot (${JSON.stringify(round(state?.centre))})`);
        check(counts.traffic?.drawn > 0, `${backend} ${d.name}: traffic is drawn (${JSON.stringify(counts.traffic)})`);
        views.push({ view: d.name, what: d.what, car: round(state), stats: await stats(page), counts, ...(await sheetShot(page, group, `${d.name} (${backend})`)) });
      }
      await inv(page, 'setDriveInput', null);
      await press(page, 'Leave the car');

      // The way in from the orbit: the canopy view offers Enter the fab; the interior is FF2's, unchanged.
      await inv(page, 'campusView', 'canopy'); await frames(page, 10); await settle(page);
      const atCanopy = await hud(page);
      check(atCanopy.buttons.includes('Enter the fab'), `${backend} way in: the canopy view offers Enter the fab (${atCanopy.buttons.join(', ')})`);
      const wayIn: Record<string, unknown> = { canopy: { hud: atCanopy, ...(await sheetShot(page, group, `way in: the canopy (${backend})`)) } };
      await press(page, 'Enter the fab');
      await waitPlace(page, 'interior');
      const landing = await inv(page, 'ffCamera'), warm = await inv(page, 'ffState'), insideHud = await hud(page);
      wayIn.landing = { camera: round({ mode: landing.mode, position: landing.position, fov: landing.fov }), hud: insideHud, stats: await stats(page), ...(await sheetShot(page, group, `way in: the interior landing (${backend})`)) };
      check(insideHud.buttons.includes('Exit to campus'), `${backend} way in: inside, Exit to campus leads FF2's toolbar (${insideHud.buttons.join(', ')})`);
      // FF2's views inside the campus against FF2's recorded frames: the same camera, draw calls and triangles.
      const ff2 = FF2.records.find(r => r.requested === backend)!, interior: Record<string, unknown>[] = [];
      for (const view of INTERIOR_VIEWS) {
        await inv(page, 'ffSetView', view); await frames(page, 6);
        const cam = await inv(page, 'ffCamera'), st = await stats(page), was = ff2.views.find(v => v.view === view)!;
        const same = { camera: JSON.stringify(round({ position: cam.position, fov: cam.fov })) === JSON.stringify(round(was.camera)), drawCalls: st.drawCalls === was.stats.drawCalls, triangles: st.triangles === was.stats.triangles };
        check(same.camera && same.drawCalls && same.triangles, `${backend} interior ${view}: equals FF2 (${JSON.stringify({ now: { camera: round({ position: cam.position, fov: cam.fov }), stats: st }, ff2: was })})`);
        interior.push({ view, camera: round({ position: cam.position, fov: cam.fov }), stats: st, ff2: { camera: was.camera, drawCalls: was.stats.drawCalls, triangles: was.stats.triangles }, equalsFf2: same, ...(await sheetShot(page, group, `interior ${view} (${backend})`)) });
      }
      // The twin (sim-spec 5): the warm start at entry and one sim hour later equal the headless run and FF2's record.
      await inv(page, 'ffAdvance', 3_600_000); await frames(page, 4);
      const hour = await inv(page, 'ffState');
      const ff2Twin = FF2.twin.runs.find(r => r.requested === backend)!;
      const twin: Record<string, unknown> = { atEntry: { simMs: warm.simMs, mode: warm.mode, hash: warm.hash }, plusOneHour: { simMs: hour.simMs, hash: hour.hash }, headless: headlessTwin, ff2: ff2Twin };
      check(warm.simMs === headlessTwin.simMs && warm.hash === headlessTwin.warmStart && hour.hash === headlessTwin.plusOneHour && warm.hash === ff2Twin.warmStart && hour.hash === ff2Twin.plusOneHour,
        `${backend} twin: ${warm.hash} then ${hour.hash}; headless ${headlessTwin.warmStart} then ${headlessTwin.plusOneHour}; FF2 ${ff2Twin.warmStart} then ${ff2Twin.plusOneHour}`);
      // Exit returns to the canopy; a second Enter starts a fresh twin from the warm start.
      await press(page, 'Exit to campus');
      await waitPlace(page, 'exterior');
      const back = await inv(page, 'campusState'), backHud = await hud(page);
      check(back.view === 'canopy' && backHud.buttons.includes('Enter the fab'), `${backend} exit: back at the canopy view with Enter the fab (${back.view}; ${backHud.buttons.join(', ')})`);
      wayIn.exit = { view: back.view, camera: round(back.camera), hud: backHud, ...(await sheetShot(page, group, `exit: back at the canopy (${backend})`)) };
      await press(page, 'Enter the fab');
      await waitPlace(page, 'interior');
      const again = await inv(page, 'ffState');
      twin.secondEntry = { simMs: again.simMs, hash: again.hash };
      check(again.simMs === headlessTwin.simMs && again.hash === headlessTwin.warmStart, `${backend} twin: a second Enter starts from the warm start (${again.hash} at ${again.simMs})`);
      await press(page, 'Exit to campus');
      await waitPlace(page, 'exterior');
      const unexpected = unexpectedMessages(messages);
      check(unexpected.length === 0, `${backend}: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      records.push({ backend: snapshot.backend?.backend, requested: backend, fellBack: snapshot.backend?.fellBack, url: `/?${params}`, viewport: [WIDTH, HEIGHT], views, wayIn, interior, twin, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
      console.log(JSON.stringify({ backend, actual: snapshot.backend?.backend, twin: [warm.hash, hour.hash, again.hash], unexpected: unexpected.length, failures: failures.length }));
    } finally { await close(); }
  }

  // 2. The drive's checks on the first backend: keys on the focused scene, the road-end turn-around, Enter from the car.
  const drive = await (async () => {
    const { page, messages, close } = await openPage(first);
    const root = '[data-kiln-backend]', out: Record<string, unknown> = {}, group = `drive-${first}`;
    const key = async (code: string) => { await page.focus(root); await page.keyboard.press(code as any); await frames(page, 3); await settle(page); };
    /** Holds a key on the focused scene for `seconds` of wall time (the car moves on raw frame time: indicative). */
    const hold = async (code: string, seconds: number) => {
      await page.focus(root); await page.keyboard.down(code as any);
      try { const t0 = Date.now(); while (Date.now() - t0 < seconds * 1000) await frames(page, 3); } finally { await page.keyboard.up(code as any); }
      await frames(page, 2);
    };
    try {
      // E on the focused scene takes the car; E leaves it; Enter (the kit's play key) takes it; Escape leaves it.
      await key('KeyE');
      const byE = await inv(page, 'driveState');
      if (await shown(page, '.ks-help')) { out.help = (await hud(page)).help; await press(page, 'Close controls'); }
      await key('KeyE');
      const leftByE = await inv(page, 'driveState');
      await key('Enter');
      const byEnter = await inv(page, 'driveState');
      await key('Escape');
      const leftByEscape = await inv(page, 'driveState');
      check(!!byE && leftByE === null && !!byEnter && leftByEscape === null, `drive keys: E takes and leaves the car, Enter takes it, Escape leaves it (${JSON.stringify([!!byE, leftByE, !!byEnter, leftByEscape])})`);
      out.keys = { eTakes: !!byE, eLeaves: leftByE === null, enterTakes: !!byEnter, escapeLeaves: leftByEscape === null };
      // W accelerates and A steers left (the heading falls), on the focused scene with the car on the split.
      await press(page, 'Drive the sedan');
      await placeAtRest(page, -3000, LANE_V, 0);
      await inv(page, 'setDriveInput', null);
      const w0 = await inv(page, 'driveState');
      await hold('KeyW', 1.5);
      const w1 = await inv(page, 'driveState');
      await page.focus(root); await page.keyboard.down('KeyW');
      await hold('KeyA', 0.8);
      await page.keyboard.up('KeyW'); await frames(page, 2);
      const w2 = await inv(page, 'driveState');
      check(w1.speed > 1 && w1.centre[0] > w0.centre[0], `drive keys: W accelerates the car north (${round(w0.centre[0])} to ${round(w1.centre[0])}, ${round(w1.speed)} m/s)`);
      check(w2.headingDeg < w1.headingDeg - 0.5, `drive keys: A steers left (heading ${round(w1.headingDeg)} to ${round(w2.headingDeg)} degrees)`);
      out.keyboard = round({ from: w0, afterW: w1, afterWA: w2, note: 'indicative distances: the car moves on the raw frame time of a headless page' });
      // Space brakes to a stop.
      await hold('Space', 3);
      const braked = await inv(page, 'driveState');
      check(Math.abs(braked.speed) < 0.5, `drive keys: Space brakes the car (${round(braked.speed)} m/s)`);
      // A road end: the prompt, then R turns the car around behind a fade (mirrored across the centre line, facing back).
      await placeAtRest(page, CAMPUS.roads.split.carEnd - DRIVING.roadEnd.stopDistance - 40, LANE_V, 0);
      await inv(page, 'setDriveInput', null);
      const promptHud = await hud(page);
      check(promptHud.status.some(s => s.startsWith('End of the road')), `road end: the turn-around prompt shows (${JSON.stringify(promptHud.status)})`);
      const prompt = await sheetShot(page, group, 'road end: the prompt');
      await key('KeyR'); await sleep(DRIVING.roadEnd.fadeSeconds * 2000 + 400); await frames(page, 4);
      const turnedByR = await inv(page, 'driveState');
      check(Math.abs(Math.abs(turnedByR.headingDeg) - 180) < 1 && turnedByR.centre[1] < 0 && Math.abs(turnedByR.speed) < 0.01, `road end: R turns the car around (${JSON.stringify(round(turnedByR))})`);
      const afterR = await sheetShot(page, group, 'road end: turned around by R');
      // Held against the stop: the throttle held for roadEnd.holdSeconds at the stop turns the car too (scripted steps).
      await placeAtRest(page, CAMPUS.roads.split.carEnd - DRIVING.roadEnd.stopDistance - 40, LANE_V, 0);
      const reached = await inv(page, 'driveAdvance', 30, { throttle: 1 });
      await inv(page, 'setDriveInput', null);
      await sleep(DRIVING.roadEnd.fadeSeconds * 2000 + 400); await frames(page, 4);
      const turnedByHold = await inv(page, 'driveState');
      check(reached.turning && Math.abs(Math.abs(turnedByHold.headingDeg) - 180) < 1, `road end: holding the throttle against the stop turns the car around (${JSON.stringify(round({ reached, turnedByHold }))})`);
      out.roadEnd = round({ prompt: { status: promptHud.status, ...prompt }, byR: { car: turnedByR, ...afterR }, byHold: { stoppedAt: reached, car: turnedByHold } });
      // Enter the fab from the car: stopped under the south-west canopy; Exit brings the car back there, at rest.
      await placeAtRest(page, ENTER_SPOT.u, ENTER_SPOT.v, ENTER_SPOT.heading);
      const zoneHud = await hud(page), zoneCar = await inv(page, 'driveState');
      check(zoneCar.canEnter && zoneHud.buttons.includes('Enter the fab'), `drive way in: the car stopped under the canopy offers Enter the fab (${zoneHud.buttons.join(', ')})`);
      const zone = await sheetShot(page, group, 'way in from the car: stopped under the canopy');
      await inv(page, 'setDriveInput', null);
      await press(page, 'Enter the fab');
      await waitPlace(page, 'interior');
      const inside = await inv(page, 'ffState');
      check(inside.hash === headlessTwin.warmStart, `drive way in: the interior twin starts at the warm start (${inside.hash})`);
      const insideShot = await sheetShot(page, group, 'way in from the car: the interior landing');
      await press(page, 'Exit to campus');
      await waitPlace(page, 'exterior');
      const resumed = await inv(page, 'driveState'), resumedHud = await hud(page);
      check(!!resumed && Math.abs(resumed.centre[0] - ENTER_SPOT.u) < 0.01 && Math.abs(resumed.centre[1] - ENTER_SPOT.v) < 0.01 && Math.abs(resumed.speed) < 0.01 && resumedHud.buttons.includes('Leave the car'),
        `drive way in: Exit brings the car back under the canopy at rest (${JSON.stringify(round(resumed?.centre))}, ${resumed?.speed})`);
      const resumedShot = await sheetShot(page, group, 'Exit: back in the car under the canopy');
      out.wayIn = round({ zone: { car: zoneCar, hud: zoneHud, ...zone }, inside: { hash: inside.hash, simMs: inside.simMs, ...insideShot }, resumed: { car: resumed, hud: resumedHud, ...resumedShot } });
      // Leaving the car hands the camera to the orbit above the car.
      await press(page, 'Leave the car');
      const left = await inv(page, 'campusState'), leftHud = await hud(page);
      const dist = Math.hypot(left.camera.position[0] - ENTER_SPOT.u, left.camera.position[2] - ENTER_SPOT.v);
      check(leftHud.buttons.includes('Drive the sedan') && dist < 80, `leave the car: the orbit takes over near the car (${round(dist)} m; ${leftHud.buttons.join(', ')})`);
      out.leave = round({ camera: left.camera, distanceFromCarM: dist, hud: leftHud, ...(await sheetShot(page, group, 'Leave the car: the orbit above the car')) });
      // The traffic: vehicles fade in and out at the lane ends (the pure flow's fades are the unit test's).
      const traffic = await inv(page, 'driveTraffic', 0, 30);
      check(traffic.stats.vehicles > 0 && traffic.stats.fading > 0, `traffic: vehicles in the lanes, some fading at the ends (${JSON.stringify(traffic.stats)})`);
      out.traffic = round({ stats: traffic.stats, simSeconds: traffic.time, models: traffic.models });
      const unexpected = unexpectedMessages(messages);
      check(unexpected.length === 0, `drive: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      return { ...out, unexpectedCount: unexpected.length };
    } finally { await close(); }
  })();
  console.log(JSON.stringify({ drive: Object.keys(drive), failures: failures.length }));

  // 3. Phone layout (390 x 844, touch): the orbit HUD with Reset view, the drive with the kit joystick (a held touch
  // drives the car), Enter the fab from the car and FF2's phone HUD inside; nothing overlaps or scrolls sideways.
  const phone = skip.has('phone') ? null : await (async () => {
    const opened = await openPage(first, { viewport: PHONE }), { page } = opened, group = `phone-${first}`;
    const shots: Record<string, unknown>[] = [];
    try {
      const layoutOf = () => page.evaluate(() => {
        const r = (s: string) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b && b.width ? { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) } : null; };
        return { toolbar: r('.fc-top > .ks-toolbar') ?? r('.ff-top > .ks-toolbar'), bottom: r('.fc-bottom') ?? r('.ff-bottom'), joystick: r('.ks-joystick'), help: r('.ks-help'), viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth };
      });
      const record = async (name: string, extra: Record<string, unknown> = {}) => {
        const l = await layoutOf();
        check(!l.toolbar || !l.bottom || l.toolbar.bottom <= l.bottom.top, `phone ${name}: the toolbar and the bottom stack overlap ${JSON.stringify(l)}`);
        check(l.scrollWidth <= (l.viewport[0] as number), `phone ${name}: horizontal scroll`);
        check(!l.joystick || !l.bottom || l.bottom.bottom <= l.joystick.top, `phone ${name}: the bottom stack covers the joystick ${JSON.stringify(l)}`);
        shots.push({ name, layout: l, hud: await hud(page), ...extra, ...(await sheetShot(page, group, `phone ${name}`)) });
      };
      const orbitHud = await hud(page);
      check(orbitHud.buttons.includes('Reset view'), `phone orbit: Reset view in the toolbar (${orbitHud.buttons.join(', ')})`);
      await record('orbit');
      await press(page, 'Drive the sedan', 'tap');
      if (check(await shown(page, '.ks-help'), 'phone drive: the controls panel opens with the first drive')) { await record('drive-help'); await press(page, 'Close controls', 'tap'); }
      check(await shown(page, '.ks-joystick'), 'phone drive: the joystick shows on touch');
      await placeAtRest(page, -3000, LANE_V, 0);
      await inv(page, 'setDriveInput', null);
      const before = await inv(page, 'driveState');
      const j = await page.evaluate(() => { const b = document.querySelector('.ks-joystick')!.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
      const touch = await page.touchscreen.touchStart(j[0]!, j[1]!);
      await touch.move(j[0]!, j[1]! - 20); await touch.move(j[0]!, j[1]! - 50);
      const t0 = Date.now(); while (Date.now() - t0 < 1500) await frames(page, 3);
      const during = await inv(page, 'driveState');
      await touch.end(); await frames(page, 3);
      check(during.speed > 1 && during.centre[0] > before.centre[0], `phone drive: the joystick pushed forward drives the car (${round(during.speed)} m/s)`);
      await record('drive', { joystick: round({ from: before.centre, to: during.centre, speed: during.speed }) });
      await placeAtRest(page, ENTER_SPOT.u, ENTER_SPOT.v, ENTER_SPOT.heading);
      await inv(page, 'setDriveInput', null);
      await record('drive-enter-zone');
      await press(page, 'Enter the fab', 'tap');
      await waitPlace(page, 'interior');
      await record('interior-landing');
      await press(page, 'Exit to campus', 'tap');
      await waitPlace(page, 'exterior');
      const resumed = await inv(page, 'driveState');
      check(!!resumed && Math.abs(resumed.speed) < 0.01, 'phone: Exit brings the car back at rest');
      await record('exit-to-car');
      await press(page, 'Leave the car', 'tap');
      await record('left-car');
      const unexpected = unexpectedMessages(opened.messages);
      check(unexpected.length === 0, `phone: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      return { viewport: PHONE, backend: opened.snapshot.backend?.backend, shots, unexpectedCount: unexpected.length };
    } finally { await opened.close(); }
  })();
  console.log(JSON.stringify({ phone: phone?.shots.map(s => s.name) ?? 'skipped', failures: failures.length }));

  // 4. Tiers (item 7): per tier and backend, at every orbit view and on the split from the car, the renderer's draw
  // calls and triangles and the scene's structure, ground, parking and traffic counts. Counts only.
  const tiers: Record<string, unknown>[] = [];
  if (!skip.has('tiers')) for (const backend of backends) for (const tier of TIERS) {
    const { page, messages, close } = await openPage(backend, { tier });
    try {
      const rows: Record<string, unknown>[] = [];
      for (const view of ORBIT_VIEWS) {
        await inv(page, 'campusView', view); await frames(page, 20); await settle(page);
        rows.push({ view, stats: await stats(page), counts: await inv(page, 'counts') });
      }
      await press(page, 'Drive the sedan');
      if (await shown(page, '.ks-help')) await press(page, 'Close controls');
      await placeAtRest(page, DRIVEN[0].u, DRIVEN[0].v, DRIVEN[0].heading);
      rows.push({ view: DRIVEN[0].name, stats: await stats(page), counts: await inv(page, 'counts') });
      const unexpected = unexpectedMessages(messages);
      check(unexpected.length === 0, `tier ${tier} ${backend}: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      tiers.push({ backend, tier, data: CAMPUS.tiers[tier], rows, unexpectedCount: unexpected.length });
      console.log(JSON.stringify({ tier, backend, drawCalls: rows.map(r => (r.stats as { drawCalls: number }).drawCalls), triangles: rows.map(r => (r.stats as { triangles: number }).triangles) }));
    } finally { await close(); }
  }

  // 5. The public build (no test hooks, live clock) on both backends: it loads, renders and offers the drive.
  const publicRuns: Record<string, unknown>[] = [];
  if (!skip.has('public')) {
    const publicHost = await serveOwned(campusOutputFor('public'), owned); owned.add(publicHost.port);
    try {
      for (const backend of backends) {
        const context = await chrome.browser.createBrowserContext();
        const page = await context.newPage(), messages: ConsoleRecord[] = [];
        page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
        page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
        page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
        try {
          // The public page reads no URL parameters, so WebGL2 is reached the way a visitor without WebGPU reaches it.
          if (backend === 'webgl2') await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'gpu', { get: () => undefined }); });
          const url = `${publicHost.url}/`; assertOwnedUrl(url, owned);
          await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
          await page.waitForFunction(() => { const t = document.querySelector('#page-status')?.textContent ?? 'x'; return t === '' || t.startsWith('Scene could not start'); }, { timeout: 180_000, polling: 250 });
          await page.waitForFunction(() => [...document.querySelectorAll('.ks-hud button')].some(b => b.textContent === 'Drive the sedan'), { timeout: 60_000, polling: 250 }).catch(() => undefined);
          const status = await page.evaluate(() => document.querySelector('#page-status')?.textContent ?? '');
          const backendAttr = await page.evaluate(() => document.querySelector('[data-kiln-backend]')?.getAttribute('data-kiln-backend') ?? null);
          const hooks = await page.evaluate(() => typeof (window as any).__kilnScene?.invoke);
          const buttons = (await hud(page)).buttons;
          await sleep(1500);
          const shot = await sheetShot(page, 'public', `public campus (${backend})`);
          const unexpected = unexpectedMessages(messages);
          check(status === '' && unexpected.length === 0, `public ${backend}: ${status} ${JSON.stringify(unexpected.slice(0, 2))}`);
          check(['Drive the sedan', 'About the campus', 'Controls', 'Credits'].every(b => buttons.includes(b)) && hooks === 'undefined', `public ${backend}: the drive, About, Controls and Credits, no test hooks (${buttons.join(', ')}; hooks ${hooks})`);
          publicRuns.push({ requested: backend, backend: backendAttr, status, testHooks: hooks, buttons, ...shot, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
          console.log(JSON.stringify({ public: backend, backend: backendAttr, status, unexpected: unexpected.length }));
        } finally { await context.close(); }
      }
    } finally { await publicHost.close(); }
  }

  // The contact sheets.
  const sheets: Record<string, unknown> = {};
  for (const [group, shots] of sheetFrames) {
    const phoneSheet = group.startsWith('phone');
    sheets[group] = await sheet(`Foundry Floor campus (FF-C1) ${group}, ${phoneSheet ? '390x844 frames at three quarters' : '1280x720 frames at half size'}`, shots, sheetFile(group), phoneSheet ? 292 : 640, phoneSheet ? 4 : 2);
  }
  writeJson(resolve(outDir, 'captures.json'), {
    task: 'TASK-FF-CAMPUS-1 item 10 (with items 4 to 7 in the browser): orbit, driven and way-in views per backend, FF2\'s interior views and the twin inside the campus, the drive\'s checks, the phone layout, per-tier counts and the public build',
    captured: new Date().toISOString(), headless: `Chrome, --window-size ${WIDTH}x${HEIGHT}; phone ${PHONE.width}x${PHONE.height} with touch`,
    build: 'dist/campus/test (test hooks) and dist/campus/standalone (public)', clock: 'kit clock frozen (freeze=1): the twin and the traffic step only through hooks; the car moves on raw frame time, so driven frames are taken with the car placed at rest and braked',
    noTiming: 'no frame time or load time is recorded: this PC measures no performance (TASK.md); counts only',
    failures, records, drive, phone, tiers, publicBuild: { build: 'dist/campus/standalone (public)', runs: publicRuns },
    ff2Reference: { file: 'evidence/captures/ff2/captures.json', twin: FF2.twin.runs }, headlessTwin, sheets,
  });
  console.log(JSON.stringify({ captures: rel(resolve(outDir, 'captures.json')), failures }));
  if (failures.length) process.exitCode = 1;
} finally { await chrome.close(); await hosted.close(); }
