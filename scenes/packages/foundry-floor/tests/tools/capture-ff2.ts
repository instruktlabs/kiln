// FF2 captures (TASK-FF2 "Evidence" and items 3, 4 and 7): the eight named views on WebGPU and on the WebGL2 fallback,
// the free walk, the tour, tool panels and follow-a-wafer in the browser, the phone layout (390 x 844, touch), the
// public build on both backends, and the twin's hashes in the browser against the same run headless (sim-spec 5).
// Headless Chrome with an explicit --window-size, from dist/test (and dist/standalone for the public check) served on an
// owned port (4700-4749); each page opens in a browser context of its own, as a first visit. The kit clock is frozen
// (`freeze=1`), so the twin holds at its stored day-30 warm start until a hook steps it and the tour holds where a hook
// seeks it; the walker moves on the kit's raw frame time. Interactions go through the page's own input wherever they can
// (keys on the focused scene, clicks and taps on the canvas and on the HUD's buttons, touches on the kit joystick); hooks
// set up poses and read state. Evidence goes to evidence/captures/ff2/: captures.json and JPEG contact sheets (the views
// per backend, the walk, the tour, the panels and following, the phone layout, the public build). Every frame's record
// carries the SHA-256 and size of its PNG screenshot and names its sheet; no full frames are written (bulk frames
// light). Timings are indicative and carry load samples.
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/capture-ff2.ts [--backends=webgpu,webgl2]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ElementHandle, Page, Viewport } from 'puppeteer-core';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { loadSample } from '../../scripts/load-sample.ts';
import { createFab, FAB_DATA } from '../../src/sim/index.ts';
import { buildTour, holdTime } from '../../src/scene/tour.ts';

type Backend = 'webgpu' | 'webgl2';
type Point = readonly [number, number, number];
const WIDTH = 1280, HEIGHT = 720;
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const VIEWS = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const;
const backends = (process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const first = backends[0] as Backend;
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/ff2');
mkdirSync(outDir, { recursive: true });
const { layout } = FAB_DATA, TOUR = buildTour(layout), FEATURES = layout.cameras.tour.features, WALK = layout.cameras.walk;
/** Points to click for a stop's subject: its anchor, then the body's middle and the port seats (the first on the canvas wins). */
const clickPoints = (subject: string, anchor: Point): Point[] => {
  const t = layout.tools.find(x => x.id === subject), s = layout.stockers.find(x => x.id === subject);
  const fp = (t ?? s)?.footprint, ports = t ? t.ports : s ? s.ports : [];
  return [anchor, ...(fp ? [[(fp.min[0] + fp.max[0]) / 2, fp.max[1] * 0.6, (fp.min[2] + fp.max[2]) / 2] as Point] : []), ...ports.map(p => [p.seat[0], p.seat[1] + 0.2, p.seat[2]] as Point)];
};
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rel = (path: string) => relative(PACKAGE_ROOT, path).replace(/\\/g, '/');
const round = (v: unknown, d = 3): unknown => typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : Array.isArray(v) ? v.map(x => round(x, d)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, d)])) : v;
const sleep = (ms: number) => new Promise(accept => setTimeout(accept, ms));
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) { failures.push(what); console.log(`FAIL ${what}`); } return ok; };
// Sim-spec 5 in the browser: the same restore, mode switch and one-hour step run headless under Bun; the browser's
// hashes must equal these on both backends (as in FF1's capture).
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
const settle = async (page: Page) => { await new Promise(accept => setTimeout(accept, 160)); await frames(page, 2); };
const lines = (page: Page, selector: string) => page.evaluate(s => { const el = document.querySelector(s); return el ? [el.querySelector('h2')?.textContent ?? '', ...[...el.querySelectorAll('li')].map(li => li.textContent ?? '')] : null; }, selector);
const stats = (page: Page) => page.evaluate(() => { const s = (window as any).__kilnScene.stats(); return { programs: s.programs, pipelines: s.pipelines, drawCalls: s.render?.drawCalls, triangles: s.render?.triangles }; });
const shown = (page: Page, selector: string) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }, selector);
/** A HUD button by its exact text, clicked with the mouse or tapped. */
async function press(page: Page, label: string, how: 'click' | 'tap' = 'click'): Promise<boolean> {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ff-hud button')].find(b => b.textContent === text) ?? null, label);
  const element = handle.asElement() as ElementHandle<Element> | null;
  if (!element) {
    const buttons = await page.evaluate(() => [...document.querySelectorAll('.ff-hud button')].map(b => b.textContent ?? ''));
    return check(false, `no HUD button "${label}" (${buttons.join(', ')})`);
  }
  if (how === 'tap') await element.tap(); else await element.click();
  await frames(page, 2); await settle(page);
  return true;
}
/** The first of `points` that projects onto the canvas where no HUD element covers it, in page coordinates. */
async function canvasPoint(page: Page, points: readonly Point[]): Promise<[number, number] | null> {
  for (const p of points) {
    const xy = await inv<[number, number] | null>(page, 'ffProject', p[0], p[1], p[2]);
    if (xy && await page.evaluate((x, y) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', xy[0], xy[1])) return xy;
  }
  return null;
}

const loadBefore = await loadSample();
const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('ff2-capture', WIDTH, HEIGHT);
const frameRecord = async (page: Page, file: string | null) => {
  const b64 = await page.screenshot({ type: 'png', encoding: 'base64' }) as string, bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (file) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, bytes); }
  return { b64, record: { ...(file ? { file: rel(file) } : {}), sha256: sha(bytes), size: bytes.length } };
};
/** Frames kept for the contact sheets, by sheet, in capture order: the PNG is hashed and kept in memory, only the sheet is written. */
const sheetFrames = new Map<string, { name: string; b64: string }[]>();
const sheetFile = (group: string) => resolve(outDir, `sheet-${group}.jpg`);
const sheetShot = async (page: Page, group: string, name: string) => {
  const { b64, record } = await frameRecord(page, null);
  if (!sheetFrames.has(group)) sheetFrames.set(group, []);
  sheetFrames.get(group)!.push({ name, b64 });
  return { sheet: rel(sheetFile(group)), frame: name, ...record };
};
try {
  const openPage = async (backend: Backend, viewport?: Viewport) => {
    // A browser context of its own, as a first visit: the kit keeps a closed controls panel in local storage, and one
    // page's visit must not carry into the next.
    const context = await chrome.browser.createBrowserContext(), close = () => context.close();
    const page = await context.newPage(), messages: ConsoleRecord[] = [];
    // A mobile or touch viewport reloads the page when it changes, so it is set before navigation.
    if (viewport) await page.setViewport(viewport);
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    await page.evaluateOnNewDocument(() => { (window as any).__kilnMeasureRequested = true; });
    const params = `capture=1&freeze=1&tier=high${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
    const url = `${hosted.url}/?${params}`; assertOwnedUrl(url, owned);
    const started = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    // Polled every animation frame: the page-relative time (ms since navigation start) when the harness first reports ready.
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); const done = h && (h.readyCount > 0 || h.errors.length > 0); if (done) (window as any).__ffReadyAt ??= performance.now(); return done; }, { timeout: 180_000, polling: 'raf' });
    const wallReadyMs = Date.now() - started, pageReadyMs = await page.evaluate(() => (window as any).__ffReadyAt as number);
    const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
    if (!snapshot.readyCount) throw new Error(`${backend}: ${JSON.stringify(snapshot.errors)}`);
    await frames(page, 12);
    return { page, messages, params, snapshot, wallReadyMs, pageReadyMs, close };
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

  // Walk (D-22), tour, panels and follow-a-wafer on the first backend's desktop page.
  async function featureChecks(page: Page): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const group = (name: string) => name.startsWith('walk-') ? 'walk' : name.startsWith('tour-') ? 'tour' : 'panels-follow';
    const shot = (name: string) => sheetShot(page, `${group(name)}-${first}`, name);
    const shell = () => page.evaluate(() => (window as any).__kilnHarness.snapshot().shellEscapes as number);
    const root = '[data-kiln-backend]';
    /** Holds a key on the focused scene until `done` or `seconds` of wall time pass; returns the wall seconds held. */
    const hold = async (key: string, seconds: number, done: (cam: any) => boolean = () => false) => {
      await page.focus(root);
      const t0 = Date.now();
      await page.keyboard.down(key as any);
      try { while (Date.now() - t0 < seconds * 1000) { await frames(page, 3); if (done(await inv(page, 'ffCamera'))) break; } }
      finally { await page.keyboard.up(key as any); }
      const held = (Date.now() - t0) / 1000;
      await frames(page, 2);
      return held;
    };

    // The keyboard on the focused scene walks the N1 etch aisle at eye height (the pace itself is the unit test's; a
    // headless page's frame pacing makes the wall-clock pace indicative only).
    await inv(page, 'ffWalkTo', -28.8, -5, 90, -4); await frames(page, 4);
    const w0 = await inv(page, 'ffCamera');
    const held = await hold('KeyW', 1.5);
    const w1 = await inv(page, 'ffCamera');
    const walked = Math.hypot(w1.walker.x - w0.walker.x, w1.walker.z - w0.walker.z);
    check(w1.mode === 'walk' && Math.abs(w1.position[1] - WALK.eyeY) < 1e-6 && walked > 0.3 && Math.abs(w1.walker.x - w0.walker.x) < 0.05, `walk: W walks the aisle at eye height (${JSON.stringify(round(w1))})`);
    const aisle = await shot('walk-etch-aisle');
    // The kit's controls panel opens with a visit's first walk: it is in the frame above, then closed with its own
    // button, so the frames that follow show the scene (the kit remembers it was closed).
    const help = await page.evaluate(() => document.querySelector('.ks-help')?.textContent ?? null);
    check(help !== null && await shown(page, '.ks-help'), 'walk: the controls panel opens with the first walk');
    if (await shown(page, '.ks-help')) await press(page, 'Close controls');
    check(!(await shown(page, '.ks-help')), 'walk: Close controls closes the controls panel');
    // West toward etch-02's middle load port: the port (to X -30.35) stops the walker at its radius.
    await inv(page, 'ffWalkTo', -29.4, -10.05, 180, -6); await frames(page, 3);
    await hold('KeyW', 4, c => c.walker.x <= -30.35 + WALK.radius + 0.01);
    const w2 = await inv(page, 'ffCamera');
    check(w2.walker.x >= -30.35 + WALK.radius - 1e-6 && w2.walker.x < -30.35 + WALK.radius + 0.02, `walk: etch-02's load port stops the walker (x ${w2.walker.x})`);
    const port = await shot('walk-etch-02-port');
    // The first Escape leaves the walk inside the scene; the second reaches the page (contract B-11).
    const escapes0 = await shell();
    await page.focus(root); await page.keyboard.press('Escape'); await frames(page, 3);
    const afterFirst = { mode: (await inv(page, 'ffCamera')).mode, shellEscapes: (await shell()) - escapes0 };
    await page.focus(root); await page.keyboard.press('Escape'); await frames(page, 2);
    const afterSecond = { mode: (await inv(page, 'ffCamera')).mode, shellEscapes: (await shell()) - escapes0 };
    check(afterFirst.mode === 'orbit' && afterFirst.shellEscapes === 0 && afterSecond.shellEscapes === 1, `walk: the first Escape ends the walk, the second reaches the page (${JSON.stringify([afterFirst, afterSecond])})`);
    // The HUD's Walk button starts the walk where the view stands: from the gallery landing view, in the gallery.
    await inv(page, 'ffSetView', 'landing'); await frames(page, 4);
    await press(page, 'Walk');
    const fromView = await inv(page, 'ffCamera');
    check(fromView.mode === 'walk' && fromView.walker.place === 'In the visitor gallery', `walk: Walk from the landing view starts in the gallery (${fromView.walker?.place})`);
    const status = await page.evaluate(() => document.querySelector('.ff-dock > .ks-status')?.textContent ?? null);
    const gallery = await shot('walk-gallery');
    // Along the gallery east to the viewing landing, then facing the section cut from its north rail.
    await inv(page, 'ffWalkTo', 30, 25.2, 0, -3); await frames(page, 3);
    const toLanding = await hold('KeyW', 8, c => c.walker.place.startsWith('On the viewing landing'));
    const reached = await inv(page, 'ffCamera');
    check(reached.walker.place.startsWith('On the viewing landing'), `walk: the gallery leads to the viewing landing (${reached.walker.place})`);
    await inv(page, 'ffWalkTo', 38.6, 20.3, 118, -14); await frames(page, 2); await settle(page);
    const landing = await inv(page, 'ffCamera');
    const section = await shot('walk-landing-section');
    await press(page, 'Stop walking');
    out.walk = round({
      aisle: { from: w0.walker, to: w1.walker, walkedM: walked, heldSeconds: held, indicativeMps: walked / held, eyeY: w1.position[1], frame: aisle,
        note: 'indicative: the walker steps on the kit raw frame time; the pace (1.4 m/s, 2.8 running) is the unit test (walk.test.ts)' },
      controlsPanel: { openedWith: 'the first walk of the visit', text: help, closedBy: 'Close controls', frame: aisle.frame },
      portStop: { walker: w2.walker, portFaceX: -30.35, radius: WALK.radius, frame: port }, escape: { afterFirst, afterSecond },
      gallery: { startedFrom: 'landing view', camera: fromView, status, frame: gallery },
      landing: { heldSeconds: toLanding, reached: reached.walker, camera: landing, frame: section },
    });

    // Tour: each stop's caption from the live twin (the frozen tour seeked to the stop's hold), a fly leg and a cut
    // at their middles, and interruption by a click on the canvas and by a walking key.
    const stops: Record<string, unknown>[] = [];
    for (const stop of TOUR.stops) {
      await inv(page, 'ffTour', stop.name); await frames(page, 2); await settle(page);
      const cam = await inv(page, 'ffCamera'), caption = await lines(page, '.ff-tour');
      check(cam.mode === 'tour' && cam.tour.stop === stop.name && cam.tour.phase === 'hold', `tour: holds ${stop.name}`);
      check(caption?.[0] === `Tour, stop ${TOUR.stops.indexOf(stop) + 1} of ${TOUR.stops.length}: ${stop.label}`, `tour: caption at ${stop.name} (${caption?.[0]})`);
      stops.push({ stop: stop.name, camera: { position: cam.position, fov: cam.fov }, caption, frame: await shot(`tour-${stop.name}`) });
    }
    const litho = TOUR.stops.findIndex(s => s.name === 'litho'), fly = TOUR.segments.find(s => s.kind === 'fly' && s.stop === litho)!;
    await inv(page, 'ffTour', (fly.t0 + fly.t1) / 2); await frames(page, 2); await settle(page);
    const flyCam = await inv(page, 'ffCamera'), flyCaption = await lines(page, '.ff-tour');
    check(flyCam.tour.phase === 'fly' && flyCaption?.[0] === `Tour, on to stop ${litho + 1} of ${TOUR.stops.length}: ${TOUR.stops[litho]!.label}`, `tour: fly caption (${flyCaption?.[0]})`);
    const flyFrame = await shot('tour-fly-spine-to-litho');
    const cut = TOUR.segments.find(s => s.kind === 'cut' && s.from >= 0)!;
    await inv(page, 'ffTour', (cut.t0 + cut.t1) / 2); await frames(page, 3);
    const cutCam = await inv(page, 'ffCamera');
    check(cutCam.tour.phase === 'cut' && cutCam.tour.fade === 1, 'tour: a cut is dark at its middle');
    await inv(page, 'ffTour', holdTime(TOUR, 0) + 1); await frames(page, 3);
    const centre = await page.evaluate((x, y) => document.elementFromPoint(x, y)?.tagName ?? null, WIDTH / 2, HEIGHT / 2);
    await page.mouse.click(WIDTH / 2, HEIGHT / 2); await frames(page, 2); await settle(page);
    const interrupted = await inv(page, 'ffCamera');
    check(centre === 'CANVAS' && interrupted.mode === 'orbit', 'tour: a click on the canvas hands the camera back to the orbit');
    await press(page, 'Tour');
    const started = await inv(page, 'ffCamera');
    await page.focus(root); await page.keyboard.press('KeyW'); await frames(page, 2); await settle(page);
    const byKey = (await inv(page, 'ffCamera')).mode;
    check(started.mode === 'tour' && byKey === 'orbit', 'tour: the Tour button starts it and a walking key hands the camera back');
    out.tour = round({
      seconds: TOUR.total, stops, fly: { segment: [fly.t0, fly.t1], camera: flyCam, caption: flyCaption, frame: flyFrame },
      cut: { segment: [cut.t0, cut.t1], camera: cutCam }, interruptedBy: { click: interrupted.mode, key: byKey }, startedByButton: started.mode,
    });

    // Tool panels on click: at the cluster stop's view etch-03, at the stocker stop's view its stocker; lines from the twin.
    const panels: Record<string, unknown>[] = [];
    for (const name of ['cluster', 'stocker'] as const) {
      await inv(page, 'ffSetView', name); await frames(page, 6);
      const f = FEATURES[name]!, xy = await canvasPoint(page, clickPoints(f.subject, f.anchor as Point));
      if (!check(xy !== null, `panel: nothing of ${f.subject} is clickable at the ${name} view`)) continue;
      await page.mouse.click(xy![0], xy![1]); await frames(page, 2); await settle(page);
      const panel = await lines(page, '.ff-panel');
      check(panel?.[0] === f.subject && panel.length > 3, `panel: a click at the ${name} view opens ${f.subject} (${panel?.[0]})`);
      panels.push({ view: name, click: xy, panel, frame: await shot(`panel-${f.subject}`) });
    }
    if (await shown(page, '.ff-panel')) await press(page, 'Close panel');
    check(!(await shown(page, '.ff-panel')), 'panel: Close panel closes it');
    out.panels = round(panels);

    // Follow-a-wafer through the HUD (Follow a wafer, then the list's first lot), then a lot whose next move is
    // already reserved, followed through its pick-up, the ride and its arrival, the twin stepped 5 s at a time.
    await inv(page, 'ffSetView', 'landing'); await frames(page, 4);
    await press(page, 'Follow a wafer');
    const picker = await page.evaluate(() => [...document.querySelectorAll('.ff-picker li button')].map(b => b.textContent ?? ''));
    const pickerFrame = await shot('follow-picker');
    if (picker[0]) await press(page, picker[0]);
    await settle(page);
    const picked = await inv(page, 'ffCamera'), pickedPanel = await lines(page, '.ff-follow');
    check(picked.mode === 'follow' && !!pickedPanel?.[0]?.startsWith(`Lot ${picked.follow?.lot} `), `follow: the list's first lot is followed (${pickedPanel?.[0]})`);
    const pickedFrame = await shot('follow-picked');
    const lots = await inv<{ id: number; state: string; loc: string; at: string; dest: string | null }[]>(page, 'ffLots');
    const mover = lots.find(l => l.loc === 'place' && l.dest !== null && l.state !== 'PROCESSING')
      ?? lots.find(l => l.loc === 'place' && (l.state === 'DONE_AT_TOOL' || l.state === 'WAIT_MOVE'));
    const journey: Record<string, unknown>[] = [];
    let rode = false, arrived = false;
    if (check(!!mover, 'follow: a lot waiting for a move at the warm start')) {
      await inv(page, 'ffFollow', mover!.id); await frames(page, 4);
      let place = '', rideAt = -1;
      for (let i = 0; i <= 720 && !arrived; i++) {
        if (i) { await inv(page, 'ffAdvance', 5_000); await frames(page, 2); }
        const cam = await inv(page, 'ffCamera');
        if (cam.mode !== 'follow') { journey.push({ afterSeconds: i * 5, mode: cam.mode }); break; }
        const loc = String(cam.follow.place).split(':')[0], changed = cam.follow.place !== place, midRide = loc === 'vehicle' && rideAt >= 0 && i === rideAt + 3;
        if (!changed && !midRide) continue;
        place = cam.follow.place;
        let name: string;
        if (loc === 'vehicle') { if (rideAt < 0) { rideAt = i; name = 'follow-pickup'; } else name = 'follow-riding'; rode = true; }
        else if (rode) { arrived = true; name = 'follow-arrived'; } else name = journey.length ? 'follow-waiting-2' : 'follow-waiting';
        await sleep(400); await frames(page, 2);
        const state = await inv(page, 'ffState'), now = await inv(page, 'ffCamera');
        journey.push({ afterSeconds: i * 5, simMs: state.simMs, place, camera: { position: now.position, subject: now.follow?.subject, offset: now.follow?.offset }, panel: await lines(page, '.ff-follow'), frame: await shot(name) });
      }
      check(rode && arrived, `follow: lot ${mover!.id} rides a vehicle and arrives (${journey.map(j => j.place).join(' > ')})`);
    }
    if ((await inv(page, 'ffCamera')).mode === 'follow') await press(page, 'Stop following');
    const after = await inv(page, 'ffCamera');
    check(after.mode === 'orbit', 'follow: Stop following hands the camera back');
    out.follow = round({ picker, pickerFrame, picked: { lot: picked.follow?.lot, place: picked.follow?.place, panel: pickedPanel, frame: pickedFrame }, lot: mover?.id ?? null, stepSeconds: 5, rode, arrived, journey });
    return out;
  }

  // 1. The named views per backend (the tour's stops and the overview), then the features on the first backend.
  const records: Record<string, unknown>[] = [];
  let features: Record<string, unknown> = {};
  for (const backend of backends) {
    const { page, messages, params, snapshot, wallReadyMs, pageReadyMs, close } = await openPage(backend);
    try {
      const views: Record<string, unknown>[] = [], shots: { name: string; b64: string }[] = [];
      for (const view of VIEWS) {
        await inv(page, 'ffSetView', view); await frames(page, 6);
        const camera = await inv(page, 'ffCamera'), st = await stats(page);
        const shot = await frameRecord(page, null);
        shots.push({ name: `${view} (${backend})`, b64: shot.b64 });
        views.push({ view, ...shot.record, camera: round({ position: camera.position, fov: camera.fov }), stats: st });
        check(camera.mode === 'orbit', `${backend} ${view}: orbit mode`);
      }
      const viewSheet = await sheet(`Foundry Floor FF2 named views, ${backend}, 1280x720 frames at half size`, shots, resolve(outDir, `sheet-views-${backend}.jpg`));
      await page.bringToFront(); await frames(page, 4);
      if (backend === first) features = await featureChecks(page);
      const unexpected = unexpectedMessages(messages);
      check(unexpected.length === 0, `${backend}: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      const programs = Math.max(...views.map(v => (v.stats as { programs: number }).programs)), pipelines = Math.max(...views.map(v => (v.stats as { pipelines: number }).pipelines));
      records.push({
        backend: snapshot.backend?.backend, requested: backend, fellBack: snapshot.backend?.fellBack, url: `/?${params}`, viewport: [WIDTH, HEIGHT],
        timing: { indicative: true, firstRenderMs: Math.round(pageReadyMs), wallReadyMs, note: 'navigation start to the harness ready callback, polled per animation frame' },
        views, sheet: viewSheet, programs, pipelines, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length,
      });
      console.log(JSON.stringify({ backend, actual: snapshot.backend?.backend, firstRenderMs: Math.round(pageReadyMs), programs, pipelines, unexpected: unexpected.length, failures: failures.length }));
    } finally { await close(); }
  }

  // 2. Phone layout (390 x 844, touch): the orbit HUD, the walk with the kit joystick, a tour stop at the narrow screen's
  // wider fov, a tapped panel and following; the toolbar and the bottom stack never overlap and nothing scrolls sideways.
  const phone = await (async () => {
    const opened = await openPage(first, PHONE), { page } = opened;
    const shots: Record<string, unknown>[] = [];
    try {
      const layoutOf = () => page.evaluate(() => {
        const r = (s: string) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b && b.width ? { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) } : null; };
        return { toolbar: r('.ff-top > .ks-toolbar'), bottom: r('.ff-bottom'), status: r('.ff-status'), dock: r('.ff-dock'), joystick: r('.ks-joystick'), help: r('.ks-help'), viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth };
      });
      const record = async (name: string, extra: Record<string, unknown> = {}) => {
        const l = await layoutOf(), cam = await inv(page, 'ffCamera');
        check(!l.toolbar || !l.bottom || l.toolbar.bottom <= l.bottom.top, `phone ${name}: the toolbar and the bottom stack overlap ${JSON.stringify(l)}`);
        check(l.scrollWidth <= (l.viewport[0] as number), `phone ${name}: horizontal scroll`);
        check(!l.joystick || !l.bottom || l.bottom.bottom <= l.joystick.top, `phone ${name}: the bottom stack covers the joystick`);
        shots.push({ name, layout: l, camera: round({ mode: cam.mode, position: cam.position, fov: cam.fov, walker: cam.walker }), ...extra, ...(await sheetShot(page, `phone-${first}`, `phone-${name}`)) });
      };
      await record('landing');
      await press(page, 'Walk', 'tap');
      if (check(await shown(page, '.ks-help'), 'phone walk: the controls panel opens with the first walk')) { await record('walk-help'); await press(page, 'Close controls', 'tap'); }
      check(await shown(page, '.ks-joystick'), 'phone walk: the joystick shows on touch');
      // Along the gallery (facing east), the joystick pushed forward by a held touch.
      await inv(page, 'ffWalkTo', -6, 25.2, 0, -2); await frames(page, 4);
      const before = (await inv(page, 'ffCamera')).walker;
      const j = await page.evaluate(() => { const b = document.querySelector('.ks-joystick')!.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
      const touch = await page.touchscreen.touchStart(j[0]!, j[1]!);
      await touch.move(j[0]!, j[1]! - 20); await touch.move(j[0]!, j[1]! - 50);
      const t0 = Date.now(); while (Date.now() - t0 < 1500) await frames(page, 3);
      await touch.end(); await frames(page, 3);
      const moved = (await inv(page, 'ffCamera')).walker;
      const joystickM = Math.hypot(moved.x - before.x, moved.z - before.z);
      check(joystickM > 0.3 && moved.x > before.x, `phone walk: the joystick walks the walker forward (${joystickM} m)`);
      await record('walk', { joystick: round({ from: before, to: moved, walkedM: joystickM, heldSeconds: (Date.now() - t0) / 1000 }) });
      await press(page, 'Stop walking', 'tap');
      await inv(page, 'ffTour', 'cluster'); await frames(page, 2); await settle(page);
      await record('tour-cluster', { caption: await lines(page, '.ff-tour') });
      await press(page, 'Stop tour', 'tap');
      await inv(page, 'ffSetView', 'cluster'); await frames(page, 6);
      const f = FEATURES.cluster!, xy = await canvasPoint(page, clickPoints(f.subject, f.anchor as Point));
      if (check(xy !== null, 'phone: nothing of etch-03 is tappable at the cluster view')) { await page.touchscreen.tap(xy![0], xy![1]); await frames(page, 2); await settle(page); }
      const panel = await lines(page, '.ff-panel');
      check(panel?.[0] === f.subject, `phone: a tap at the cluster view opens ${f.subject} (${panel?.[0]})`);
      await record('panel', { tap: xy, panel });
      if (await shown(page, '.ff-panel')) await press(page, 'Close panel', 'tap');
      await press(page, 'Follow a wafer', 'tap');
      await record('picker');
      const firstLot = await page.evaluate(() => document.querySelector('.ff-picker li button')?.textContent ?? null);
      if (firstLot) await press(page, firstLot, 'tap');
      await settle(page); await frames(page, 4);
      check((await inv(page, 'ffCamera')).mode === 'follow', 'phone: following from the list');
      await record('follow', { panel: await lines(page, '.ff-follow') });
      const unexpected = unexpectedMessages(opened.messages);
      check(unexpected.length === 0, `phone: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      return { viewport: PHONE, backend: opened.snapshot.backend?.backend, shots, unexpectedCount: unexpected.length };
    } finally { await opened.close(); }
  })();
  console.log(JSON.stringify({ phone: phone.shots.map(s => s.name), failures: failures.length }));

  // 3. The public build (no test hooks, live clock) on both backends: it loads and renders without console errors.
  const publicHost = await serveOwned(outputFor('public'), owned); owned.add(publicHost.port);
  const publicRuns: Record<string, unknown>[] = [];
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
        await page.waitForFunction(() => { const t = document.querySelector('#page-status')?.textContent ?? 'x'; const done = t === '' || t.startsWith('Scene could not start'); if (done) (window as any).__ffReadyAt ??= performance.now(); return done; }, { timeout: 180_000, polling: 'raf' });
        const status = await page.evaluate(() => document.querySelector('#page-status')?.textContent ?? '');
        const readyMs = await page.evaluate(() => (window as any).__ffReadyAt as number);
        const backendAttr = await page.evaluate(() => document.querySelector('[data-kiln-backend]')?.getAttribute('data-kiln-backend') ?? null);
        const hooks = await page.evaluate(() => typeof (window as any).__kilnScene?.invoke);
        const buttons = await page.evaluate(() => [...document.querySelectorAll('.ff-hud button')].map(b => b.textContent ?? ''));
        await sleep(1500);
        const shot = await sheetShot(page, 'public', `public landing (${backend})`);
        const unexpected = unexpectedMessages(messages);
        check(status === '' && unexpected.length === 0, `public ${backend}: ${status} ${JSON.stringify(unexpected.slice(0, 2))}`);
        check(['Walk', 'Tour', 'Follow a wafer'].every(b => buttons.includes(b)), `public ${backend}: the walk, tour and follow buttons (${buttons.join(', ')})`);
        publicRuns.push({ requested: backend, backend: backendAttr, status, testHooks: hooks, buttons, firstRenderMs: Math.round(readyMs), ...shot, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
        console.log(JSON.stringify({ public: backend, backend: backendAttr, status, firstRenderMs: Math.round(readyMs), unexpected: unexpected.length }));
      } finally { await context.close(); }
    }
  } finally { await publicHost.close(); }

  // 4. Sim-spec 5 in the browser: on a fresh page per backend, the twin's hash at the warm start and one sim hour later
  // (stepped by the hook as the headless run steps it) must equal the headless run's.
  const twinRuns: Record<string, unknown>[] = [];
  for (const backend of backends) {
    const opened = await openPage(backend);
    try {
      const warm = await inv(opened.page, 'ffState');
      await inv(opened.page, 'ffAdvance', 3_600_000); await frames(opened.page, 4);
      const hour = await inv(opened.page, 'ffState');
      const matchesHeadless = warm.simMs === headlessTwin.simMs && warm.hash === headlessTwin.warmStart && hour.hash === headlessTwin.plusOneHour;
      check(matchesHeadless, `twin ${backend}: browser ${warm.hash} then ${hour.hash} at ${warm.simMs}, headless ${headlessTwin.warmStart} then ${headlessTwin.plusOneHour} at ${headlessTwin.simMs}`);
      twinRuns.push({ requested: backend, backend: opened.snapshot.backend?.backend, mode: warm.mode, simMs: warm.simMs, warmStart: warm.hash, plusOneHour: hour.hash, plusOneHourSimMs: hour.simMs, matchesHeadless });
      const unexpected = unexpectedMessages(opened.messages);
      check(unexpected.length === 0, `twin ${backend}: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
    } finally { await opened.close(); }
  }
  console.log(JSON.stringify({ twin: twinRuns.map(r => [r.backend, r.warmStart, r.plusOneHour, r.matchesHeadless]), headless: headlessTwin }));
  // The contact sheets of the walk, tour, panels and follow, phone and public frames (the view sheets are written above).
  const sheets: Record<string, unknown> = {};
  for (const [group, shots] of sheetFrames) {
    const phoneSheet = group.startsWith('phone');
    sheets[group] = await sheet(`Foundry Floor FF2 ${group}, ${phoneSheet ? '390x844 frames at three quarters' : '1280x720 frames at half size'}`, shots, sheetFile(group), phoneSheet ? 292 : 640, phoneSheet ? 4 : 2);
  }
  const loadAfter = await loadSample();
  writeJson(resolve(outDir, 'captures.json'), {
    task: 'TASK-FF2 evidence: the named views per backend, the walk, the tour, tool panels and follow-a-wafer in the browser, the phone layout and the public build',
    captured: new Date().toISOString(), headless: `Chrome, --window-size ${WIDTH}x${HEIGHT}; phone ${PHONE.width}x${PHONE.height} with touch`,
    build: 'dist/test (test hooks) and dist/standalone (public)', clock: 'kit clock frozen (freeze=1): the twin steps only through ffAdvance and the tour holds where ffTour seeks it; the walker moves on raw frame time',
    load: { before: loadBefore, after: loadAfter, note: 'indicative only: this PC is shared with other builders and authors' },
    failures, records, features, phone, publicBuild: { build: 'dist/standalone (public)', runs: publicRuns },
    twin: { test: 'sim-spec 5 in the browser: the warm start and one sim hour later, rendered and headless', headless: { ...headlessTwin, note: 'the same restore (data/warm, seed default), megafab mode and one-hour step under Bun' }, runs: twinRuns },
    sheets,
  });
  console.log(JSON.stringify({ captures: rel(resolve(outDir, 'captures.json')), failures }));
  if (failures.length) process.exitCode = 1;
} finally { await chrome.close(); await hosted.close(); }
