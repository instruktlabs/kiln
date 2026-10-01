// Driving the sedan, end to end in the test build (headless, owned port): enter with Enter, drive
// with real key events (W, D, Space), the chase camera at Golden (captures), the road-end stop and
// turn-around behind the fade at both ends, leave with E; the desktop HUD keeps its camera button pad
// (keyboard and mouse unchanged by D-22); then the phone controls with touch events (D-22: the joystick
// as the only driving input, pinch zoom in the overview and the chase without swinging it (GG-010),
// drag-look, the held pull-back turn-around, one context button). Fix round 2 moved the car's road ends
// from the deck ends onto the approach roads (the fix round 1 check names are kept: deck-end-turn is the
// north road end) and adds the route checks: the car model driven from the south road end to the north
// one and back, and every traffic lane end to end, sampled against the rendered road surfaces
// (route-contact, traffic-lane-contact: no wheel without road, no vertical step over 0.03 m, no pitch
// change over 1 deg per step, resampled every 0.01 m across the joints at both deck ends and at both
// towers), traffic on
// past both deck ends and fading only in the dissolve stretches, the south road-end turn, and the road
// ends out of the chase camera's sight. Writes evidence/captures/drive/ (images and drive.json).
//   ./scripts/toolchain-run.ps1 packages/golden-gate/tests/tools/drive-check.ts [tier=balanced] [preset=golden] [webgl2]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Page } from 'puppeteer-core';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { outputFor } from './build.ts';
import { downsample, montage, readPng, writePng, type Image } from './image.ts';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const tier = arg('tier', 'balanced'), preset = arg('preset', 'golden'), backend = process.argv.includes('webgl2') ? 'webgl2' : 'webgpu';
const WIDTH = 1280, HEIGHT = 720, MAX_ABS_X = 12.2, MIN_DISTANCE = 3.2;
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/drive'); mkdirSync(outDir, { recursive: true });
/** World x, y, z; route station sigma and lateral offset d (the car's own coordinates); the camera with its route offset. */
interface DriveState { dir: number; x: number; y: number; z: number; sigma: number; d: number; speed: number; kmh: number; headingDeg: number; wheelDeg: number; brakeLight: number; toEnd: number; atRoadEnd: boolean; contact: string | null; turning: boolean; zoom: number; camera: { position: number[]; fov: number; distance: number; d: number | null; sigma: number | null } }
/** The route's stations (road ends, end stops, the deck end) and each approach's dissolve stretch, length and dissolve start (world). */
interface DriveRoute { roadEnd: { south: number; north: number }; endStop: { south: number; north: number }; roadEndZ: number; dissolve: { south: [number, number]; north: [number, number] }; length: { south: number; north: number }; dissolveStart: { south: number[]; north: number[] } }
interface ContactReport { ok: boolean; samples: number; missing: number; range: [number, number]; bodyStep: { m: number }; surfaceStep: { m: number }; pitchStep: { deg: number }; gap: { m: number } }
interface RouteContact { car: { legs: { dir: number; from: number; to: number; steps: number }[]; steps: ContactReport; joints: ContactReport }; traffic: { wheelbase: number; lanes: number; laneLength: number; sampled: [number, number]; steps: ContactReport; joints: ContactReport } }
/** The chase camera stays this far (m) or more from the start of either dissolve stretch, where the road fades into the terrain. */
const ROAD_END_SIGHT = 300;
const SB_MIDDLE = 4.8006, NB_MIDDLE = -4.8006;

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-drive', WIDTH, HEIGHT);
const results: Record<string, unknown> = { tier, preset, backend }, failures: string[] = [], shots: { name: string; file: string; sha256: string; state: DriveState | null }[] = [];
const images: Image[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { results[name] = { ok, detail }; if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`); };

async function open(page: Page, messages: ConsoleRecord[], extra: string) {
  page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
  page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
  const url = `${hosted.url}/?tier=${tier}&preset=${preset}&cam=postcard${extra}${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000 });
  const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
  if (!snapshot.readyCount) throw new Error(JSON.stringify(snapshot.errors));
  return snapshot;
}
/** A two-finger pinch through CDP touch events: the fingers start `from` px apart about (x, y) and end `to` px apart. */
async function pinch(page: Page, x: number, y: number, from: number, to: number, steps = 10) {
  const cdp = await page.createCDPSession();
  try {
    const points = (d: number) => [{ x: x - d / 2, y, id: 41 }, { x: x + d / 2, y, id: 42 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + (to - from) * i / steps) });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => done(null))));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}
const scene = (page: Page) => ({
  invoke: <T>(name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args) as Promise<T>,
  frames: (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n),
  seconds: async (s: number) => { const t0 = await page.evaluate(() => (window as any).__kilnScene.motionPolicy().time as number); await page.waitForFunction((t, d) => (window as any).__kilnScene.motionPolicy().time >= t + d, { timeout: 120_000, polling: 50 }, t0, s); },
  state: () => page.evaluate(() => (window as any).__kilnScene.invoke('driveState')) as Promise<DriveState | null>,
});

try {
  // Keyboard and chase camera (HUD hidden for clean captures).
  {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [], s = scene(page);
    const snapshot = await open(page, messages, '&capture=1&hud=0');
    results.backendInfo = snapshot.backend;
    await s.frames(8);
    const cameraSamples: DriveState['camera'][] = [], states: DriveState[] = [];
    const sample = async () => { const st = await s.state(); if (st) { cameraSamples.push(st.camera); states.push(st); } return st; };
    await page.focus('.ks-root'); await page.keyboard.press('Enter'); await s.frames(6);
    const route = await s.invoke<DriveRoute>('driveRoute'); results.route = route;
    const start = await sample();
    check('enter-with-enter', !!start && start.dir === 1 && start.sigma >= -990 && start.sigma <= -870 && start.speed > 10, start && { sigma: start.sigma, speed: start.speed, d: start.d });
    await page.keyboard.down('KeyW'); await s.seconds(3); const fast = await sample(); await page.keyboard.up('KeyW');
    check('throttle-w', !!fast && !!start && fast.speed > start.speed + 3 && fast.sigma > start.sigma + 40, fast && { speed: fast.speed, sigma: fast.sigma });
    await page.keyboard.down('KeyD'); await s.seconds(.6); const steered = await sample(); await page.keyboard.up('KeyD');
    check('steer-d-right', !!steered && !!fast && steered.headingDeg < -1 && steered.wheelDeg < -1, steered && { headingDeg: steered.headingDeg, wheelDeg: steered.wheelDeg, d: steered.d });
    await s.seconds(2); const straight = await sample();
    check('straightens', !!straight && Math.abs(straight.headingDeg) < .5, straight && { headingDeg: straight.headingDeg });
    await page.keyboard.down('Space'); await s.seconds(1); const braking = await sample(); await page.keyboard.up('Space');
    check('brake-space', !!braking && !!straight && braking.speed < straight.speed - 4 && braking.brakeLight > .5, braking && { speed: braking.speed, brakeLight: braking.brakeLight });
    // Chase captures at Golden: the south span toward the South Tower, through the North Tower portal, mid-span;
    // fix round 2: off the deck onto the approach road at each end, and on toward each road end.
    const chase: [string, string, number, number][] = [['chase-south-approach', 'nb-middle', -900, 20], ['chase-south-tower', 'nb-middle', -700, 18], ['chase-mid-span', 'nb-middle', -120, 22], ['chase-north-tower', 'nb-middle', 560, 18],
      ['chase-north-deck-end', 'nb-middle', route.roadEndZ - 45, 18], ['chase-south-deck-end', 'sb-middle', -route.roadEndZ + 45, 18],
      ['chase-north-road-end', 'nb-middle', route.endStop.north - 70, 14], ['chase-south-road-end', 'sb-middle', route.endStop.south + 70, 14]];
    for (const [name, lane, z, speed] of chase) {
      await s.invoke('placeCar', lane, z, speed); await s.invoke('setDriveInput', { throttle: .35 });
      await s.seconds(1.5);
      const st = await sample(), file = resolve(outDir, `${backend}-${tier}-${preset}-${name}.png`), bytes = Buffer.from(await page.screenshot({ type: 'png' }));
      writeFileSync(file, bytes); images.push(readPng(bytes));
      shots.push({ name, file: relative(PACKAGE_ROOT, file).replace(/\\/g, '/'), sha256: createHash('sha256').update(bytes).digest('hex'), state: st });
    }
    // The curb: steer right into it at speed; the car stays on the carriageway.
    await s.invoke('placeCar', 'nb-outer', -400, 22); await s.invoke('setDriveInput', { throttle: .5, steer: 1 }); await s.seconds(2.5);
    const curb = await sample();
    check('curb-holds', !!curb && curb.d >= -9.4488 + .15 + .9 && curb.speed > 5, curb && { d: curb.d, speed: curb.speed, contact: curb.contact });
    /** Drives with the throttle held from `lead` m short of a road end's stop until the car has turned around behind the fade. */
    const driveToEnd = async (lane: string, dir: 1 | -1, lead: number) => {
      const stop = dir > 0 ? route.endStop.north : route.endStop.south;
      await s.invoke('placeCar', lane, stop - dir * lead, 22); await s.invoke('setDriveInput', { throttle: 1 });
      let prompted = false, turned: DriveState | null = null, atStop: DriveState | null = null;
      for (let i = 0; i < 60 && !turned; i++) {
        await s.seconds(.25); const st = await sample(); if (!st) continue;
        if (st.atRoadEnd) prompted = true;
        if (st.dir === dir && !st.turning && Math.abs(st.sigma - stop) < 1) atStop = st;
        if (st.dir === -dir && !st.turning) turned = st;
      }
      return { stop, prompted, turned, atStop };
    };
    // The north road end (on the north approach road): held throttle stops at the end stop, then turns around behind the fade.
    const north = await driveToEnd('nb-middle', 1, 123), turned = north.turned;
    check('deck-end-turn', north.prompted && !!turned && Math.abs(turned.d - SB_MIDDLE) < 3.2 && turned.sigma > north.stop - 50 && turned.sigma <= north.stop + 1e-6,
      { stop: north.stop, turned: turned && { d: turned.d, sigma: turned.sigma, speed: turned.speed } });
    await s.invoke('setDriveInput', { throttle: 1 }); await s.seconds(2); const back = await sample();
    check('drives-south-after-turn', !!back && back.dir === -1 && back.speed > 3 && !!turned && back.sigma < turned.sigma - 5, back && { sigma: back.sigma, speed: back.speed });
    // The south road end the same way, driving south.
    const south = await driveToEnd('sb-middle', -1, 123);
    check('road-end-south-turn', south.prompted && !!south.turned && Math.abs(south.turned.d - NB_MIDDLE) < 3.2 && south.turned.sigma < south.stop + 50 && south.turned.sigma >= south.stop - 1e-6,
      { stop: south.stop, turned: south.turned && { d: south.turned.d, sigma: south.turned.sigma, speed: south.turned.speed } });
    await s.invoke('setDriveInput', null);
    // Out of sight: at both stops, the chase camera is ROAD_END_SIGHT m or more from the dissolve start ahead of it
    // (the road runs on to the approach end and fades into the terrain in the dissolve stretch).
    const far = (st: DriveState | null, to: number[]) => st ? Math.hypot(st.camera.position[0]! - to[0]!, st.camera.position[1]! - to[1]!, st.camera.position[2]! - to[2]!) : NaN;
    const nearest = Math.min(...states.map(st => Math.min(far(st, route.dissolveStart.south), far(st, route.dissolveStart.north))));
    const sight = { north: far(north.atStop, route.dissolveStart.north), south: far(south.atStop, route.dissolveStart.south), nearestOverAllSamples: nearest };
    check('road-end-sight', sight.north >= ROAD_END_SIGHT && sight.south >= ROAD_END_SIGHT && nearest >= ROAD_END_SIGHT, Object.fromEntries(Object.entries(sight).map(([k, v]) => [k, +v.toFixed(1)])));
    check('camera-inside-suspenders', cameraSamples.every(c => c.d !== null && Math.abs(c.d) <= MAX_ABS_X + 1e-3), cameraSamples.map(c => c.d === null ? null : +c.d.toFixed(2)));
    check('camera-min-distance', cameraSamples.every(c => c.distance >= MIN_DISTANCE - .05), cameraSamples.map(c => +c.distance.toFixed(2)));
    await page.keyboard.press('KeyE'); await s.frames(6);
    const left = await s.state(), stats = await s.invoke<{ camera: { mode: string } }>('ggStats');
    check('leave-with-e', left === null && stats.camera.mode === 'orbit', { left, mode: stats.camera.mode });
    // Traffic drives on past both deck ends and fades in and out only inside the dissolve stretches.
    type Vehicle = { lane: number; sigma: number; fade: number };
    const vehicles = await s.invoke<Vehicle[]>('trafficSample', 100_000), beyond = (v: Vehicle) => Math.abs(v.sigma) - route.roadEndZ;
    const past = { south: vehicles.filter(v => v.sigma < 0 && beyond(v) > 50).length, north: vehicles.filter(v => v.sigma > 0 && beyond(v) > 50).length };
    const fading = vehicles.filter(v => v.fade < .999), misplaced = fading.filter(v => beyond(v) < (v.sigma < 0 ? route.dissolve.south : route.dissolve.north)[0] - .5);
    check('traffic-past-deck-ends', past.south > 0 && past.north > 0 && misplaced.length === 0,
      { vehicles: vehicles.length, past, fading: fading.length, misplaced: misplaced.slice(0, 5), farthest: { south: +Math.max(0, ...vehicles.filter(v => v.sigma < 0).map(beyond)).toFixed(1), north: +Math.max(0, ...vehicles.filter(v => v.sigma > 0).map(beyond)).toFixed(1) } });
    // The route itself: the car model over its whole route both ways and every traffic lane end to end, against
    // the rendered road surfaces (src/play/route-contact.ts).
    const contact = await s.invoke<RouteContact | null>('routeContact');
    results.routeContactDetail = contact;
    const legs = contact?.car.legs ?? [];
    check('route-contact', !!contact && contact.car.steps.ok && contact.car.joints.ok && legs.length === 2 && Math.abs(legs[0]!.from - route.endStop.south) < .01
      && Math.abs(legs[0]!.to - route.endStop.north) < .01 && Math.abs(legs[1]!.to - route.endStop.south) < .01,
      contact && { legs, steps: contact.car.steps, joints: contact.car.joints });
    // Every lane is sampled to within half the vehicle's wheelbase of both route ends (where it is faded out).
    const laneRange = contact?.traffic.steps.range ?? [NaN, NaN], margin = (contact?.traffic.wheelbase ?? NaN) / 2 + .01;
    check('traffic-lane-contact', !!contact && contact.traffic.steps.ok && contact.traffic.joints.ok && laneRange[0] <= -(route.roadEndZ + route.length.south) + margin && laneRange[1] >= route.roadEndZ + route.length.north - margin,
      contact && { lanes: contact.traffic.lanes, laneLength: contact.traffic.laneLength, sampled: contact.traffic.sampled, steps: contact.traffic.steps, joints: contact.traffic.joints });
    const unexpected = unexpectedMessages(messages); check('console-keyboard', unexpected.length === 0, unexpected.slice(0, 5));
    await page.close();
  }
  // Keyboard and mouse (D-22 leaves them unchanged): the desktop HUD keeps the kit's camera button pad with its
  // Reset, and the toolbar has no Reset view, before and after keyboard input.
  {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [], s = scene(page);
    await open(page, messages, ''); await s.frames(6);
    const hudButtons = () => page.evaluate(() => ({
      pad: [...document.querySelectorAll('.ks-hud [aria-label="Camera controls"] button')].map(b => b.getAttribute('aria-label')),
      toolbarReset: [...document.querySelectorAll('.ks-toolbar button')].some(b => (b.textContent ?? '').trim() === 'Reset view'),
    }));
    await page.mouse.move(640, 360); await page.mouse.move(660, 370); await s.frames(2); const mouse = await hudButtons();
    await page.focus('.ks-root'); await page.keyboard.press('ArrowLeft'); await s.frames(2); const keyboard = await hudButtons();
    const full = ['Zoom in', 'Zoom out', 'Pan left', 'Pan right', 'Pan up', 'Pan down', 'Reset view'];
    check('desktop-camera-pad', [mouse, keyboard].every(h => JSON.stringify(h.pad) === JSON.stringify(full) && !h.toolbarReset), { mouse, keyboard });
    const unexpected = unexpectedMessages(messages); check('console-desktop', unexpected.length === 0, unexpected.slice(0, 5));
    await page.close();
  }
  // Phone controls (D-22): touch switches the HUD to the kit joystick, the only driving input. A pinch
  // zooms the orbit and the chase camera, a one-finger drag looks around the car, a held pull-back at
  // rest turns the car around at a road end, and one context button shows at a time (Drive or Leave).
  {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [], s = scene(page);
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await open(page, messages, '');
    await s.frames(6);
    await page.touchscreen.tap(420, 200); await s.frames(2);
    const context = () => page.$$eval('.ks-hud button', b => b.map(x => x.textContent?.trim() ?? '').filter(t => ['Drive the sedan', 'Leave the car', 'Turn around', 'Accelerate', 'Brake'].includes(t)));
    // Overview: spreading two fingers brings the orbit in, pinching them sends it back out.
    const orbit = async () => (await s.invoke<{ camera: { orbitDistance: number | null } }>('ggStats')).camera.orbitDistance ?? NaN;
    const overviewContext = await context(), far = await orbit();
    await pinch(page, 422, 220, 80, 260); await s.frames(10); const near = await orbit();
    await pinch(page, 422, 220, 260, 80); await s.frames(10); const out = await orbit();
    check('touch-pinch-orbit', near < far * .9 && out > near * 1.1 && JSON.stringify(overviewContext) === '["Drive the sedan"]', { far, near, out, context: overviewContext });
    const button = await page.$('xpath/.//button[normalize-space()="Drive the sedan"]');
    if (!button) throw new Error(`No Drive button: ${JSON.stringify(overviewContext)}`);
    const box = (await button.boundingBox())!; await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await s.frames(6);
    // The controls help opens on first play (a few frames later); close it with the toolbar's Controls button
    // (the panel's own Close button sits at the end of its scrolling text in this short landscape view).
    await page.waitForFunction(() => !!document.querySelector('.ks-help'), { timeout: 10_000 }).catch(() => undefined);
    const toggle = await page.$('.ks-toolbar .ks-help-button');
    if (toggle && await page.$('.ks-help')) { const b = (await toggle.boundingBox())!; await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await s.frames(2); }
    const helpClosed = !await page.$('.ks-help');
    const controls = await page.evaluate(() => ({ joystick: document.querySelector('.ks-joystick')?.getAttribute('aria-label') ?? null, pedals: document.querySelectorAll('.ks-touch-buttons button').length,
      speed: document.querySelector('.gg-speed')?.textContent ?? null })), drivingContext = await context();
    check('touch-controls', helpClosed && controls.joystick === 'Drive and steer' && controls.pedals === 0 && JSON.stringify(drivingContext) === '["Leave the car"]' && !!controls.speed, { ...controls, helpClosed, context: drivingContext });
    const stick = (await (await page.$('.ks-joystick'))!.boundingBox())!, cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
    /** Holds the stick at (dx, dy) px from its centre for `seconds` of scene time (or until `until`), then releases it. */
    const hold = async (dx: number, dy: number, seconds: number, until?: (st: DriveState | null) => boolean) => {
      await page.touchscreen.touchStart(cx, cy); await page.touchscreen.touchMove(cx + dx, cy + dy);
      let st: DriveState | null = null;
      if (until) for (let i = 0; i < seconds * 4; i++) { await s.seconds(.25); st = await s.state(); if (until(st)) break; }
      else { await s.seconds(seconds); st = await s.state(); }
      await page.touchscreen.touchEnd(); return st;
    };
    const before = await s.state(), pushed = await hold(0, -60, 2.5);
    check('touch-stick-forward-accelerates', !!before && !!pushed && pushed.speed > before.speed + 2, { before: before?.speed, after: pushed?.speed });
    const steering = await hold(60, -60, .6);
    check('touch-stick-steers-keeping-throttle', !!steering && !!pushed && steering.wheelDeg < -1 && steering.speed >= pushed.speed - .5, { wheelDeg: steering?.wheelDeg, speed: steering?.speed, from: pushed?.speed });
    await s.seconds(1.5);
    const rolling = await s.state(), braking = await hold(0, 60, 1);
    check('touch-stick-back-brakes', !!rolling && !!braking && braking.speed < rolling.speed - 4 && braking.brakeLight > .5, { from: rolling?.speed, to: braking?.speed, brakeLight: braking?.brakeLight });
    const reversing = await hold(0, 60, 10, st => !!st && st.speed < -.5);
    check('touch-stick-back-reverses', !!reversing && reversing.speed < -.5 && !reversing.atRoadEnd, reversing && { speed: reversing.speed, sigma: reversing.sigma });
    // A pinch on the scene moves the chase camera in and back out; a one-finger drag swings it around the car.
    await s.invoke('placeCar', 'nb-middle', -300, 0); await s.seconds(1.5);
    const bearing = (st: DriveState) => Math.atan2(st.camera.position[0]! - st.x, st.camera.position[2]! - st.z);
    const swing = (a: DriveState, b: DriveState) => Math.abs(Math.atan2(Math.sin(bearing(b) - bearing(a)), Math.cos(bearing(b) - bearing(a))));
    const rest = await s.state(), at = await page.evaluate(() => { const e = document.elementFromPoint(560, 200); return { target: e ? e.tagName + '.' + e.className : null, scrollY }; });
    // GG-010: the kit ignores a drag while a second finger is down, so a pinch zooms without swinging the chase
    // camera (sampled two frames after the fingers lift, before a drag-look would have eased back).
    await pinch(page, 560, 200, 80, 260); await s.frames(2); const pinchedIn = await s.state(); await s.seconds(1.2); const closer = await s.state();
    await pinch(page, 560, 200, 260, 80); await s.frames(2); const pinchedOut = await s.state(); await s.seconds(1.2); const farther = await s.state();
    const zoomed = (st: DriveState | null) => st && { zoom: +st.zoom.toFixed(3), distance: +st.camera.distance.toFixed(2) };
    check('touch-pinch-chase', !!rest && !!closer && !!farther && closer.zoom < .95 && closer.camera.distance < rest.camera.distance - 1 && farther.zoom > closer.zoom && farther.camera.distance > closer.camera.distance + 1,
      { rest: zoomed(rest), closer: zoomed(closer), farther: zoomed(farther), at });
    check('touch-pinch-no-swing', !!rest && !!pinchedIn && !!pinchedOut && swing(rest, pinchedIn) < .02 && swing(rest, pinchedOut) < .02,
      rest && pinchedIn && pinchedOut && { in: +swing(rest, pinchedIn).toFixed(4), out: +swing(rest, pinchedOut).toFixed(4) });
    const settled = await s.state();
    await page.touchscreen.touchStart(480, 200); for (let i = 1; i <= 5; i++) await page.touchscreen.touchMove(480 + i * 24, 200);
    await s.seconds(.5); const looking = await s.state(); await page.touchscreen.touchEnd(); await s.seconds(5); const returned = await s.state();
    check('touch-drag-look', !!settled && !!looking && !!returned && swing(settled, looking) > .25 && swing(settled, returned) < .05,
      settled && looking && returned && { swing: +swing(settled, looking).toFixed(3), afterRelease: +swing(settled, returned).toFixed(3) });
    const touchCameras = [rest, closer, farther, settled, looking, returned].filter((st): st is DriveState => !!st).map(st => st.camera);
    check('touch-camera-inside-suspenders', touchCameras.length === 6 && touchCameras.every(c => c.d !== null && Math.abs(c.d) <= MAX_ABS_X + 1e-3 && c.distance >= MIN_DISTANCE - .05),
      touchCameras.map(c => [c.d === null ? null : +c.d.toFixed(2), +c.distance.toFixed(2)]));
    // Road end (north approach road): the status line prompts and a held pull-back at rest turns the car around; no button joins Leave the car.
    const roadEnd = (await s.invoke<DriveRoute>('driveRoute')).roadEnd.north;
    await s.invoke('placeCar', 'nb-middle', roadEnd - 73, 8); await s.seconds(1);
    const prompt = await page.$eval('.ks-status', e => e.textContent ?? ''), endContext = await context();
    const turned = await hold(0, 60, 8, st => !!st && st.dir === -1 && !st.turning);
    check('touch-turn-around-hold', prompt === 'End of the drive. Stop and hold the stick back to turn around' && JSON.stringify(endContext) === '["Leave the car"]' && !!turned && turned.dir === -1 && turned.sigma > roadEnd - 133 && Math.abs(turned.speed) < .5,
      { prompt, context: endContext, turned: turned && { dir: turned.dir, d: turned.d, sigma: turned.sigma, speed: turned.speed } });
    const leave = (await (await page.$('xpath/.//div[contains(@class,"ks-toolbar")]//button[normalize-space()="Leave the car"]'))!.boundingBox())!;
    await page.touchscreen.tap(leave.x + leave.width / 2, leave.y + leave.height / 2); await s.frames(6);
    const afterContext = await context();
    check('touch-leave', (await s.state()) === null && JSON.stringify(afterContext) === '["Drive the sedan"]', { context: afterContext });
    const unexpected = unexpectedMessages(messages); check('console-touch', unexpected.length === 0, unexpected.slice(0, 5));
    await page.close();
  }
  if (images.length) writeFileSync(resolve(outDir, `${backend}-${tier}-${preset}-sheet.png`), writePng(montage(images.map(i => downsample(i, 2)), 2)));
  writeJson(resolve(outDir, `${backend}-${tier}-${preset}-drive.json`), { captured: new Date().toISOString(), build: 'dist/test', results, shots, failures });
  console.log(JSON.stringify({ failures, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, (v as { ok?: boolean })?.ok ?? v])) }));
  if (failures.length) process.exitCode = 1; // a failed check fails the run (fix round 1: it used to exit 0)
} finally { await chrome.close(); await hosted.close(); }
