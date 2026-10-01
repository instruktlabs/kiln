// FF3 captures (TASK-FF3 item 9), on WebGPU and on the WebGL2 fallback, from dist/ff3/test (FF-C1's campus page on the
// ff3 pack) and dist/ff3/standalone (public):
//   - the FF-C1 campus views: the six orbit views, each against its record in evidence/captures/ffc1/captures.json
//     (camera, draw calls, triangles and the exterior's counts);
//   - the way in and FF2's eight interior views: each camera against FF2's record (evidence/captures/ff2/captures.json),
//     and each view's renderer counts and per-entity counts (the world's own stats) beside a control run of FF-C1's
//     build (dist/campus/test, served read-only) at the same view, so every difference is named by entity: FF3 may
//     change only the placed subfab kits (subfabKit) and the people (humanoidWorkRobot, technician);
//   - the twin: the warm start at entry and one sim hour later against FF2's recorded hashes and the same run headless,
//     and a second entry from the warm start;
//   - the FF3 subjects on a fresh twin: the placed subfab kits (the section view), the floor robots at rest (item 1
//     stopped: PROGRESS.md decision 1), the humanoid work robot walking the spine and a cleanroom technician walking to
//     or from a qualification, each found by stepping the twin in 5 s steps from the warm start and framed by the walk
//     camera (the subject's page coordinates recorded);
//   - the public build: it loads and renders with no test hooks and no unexpected console message.
// Headless Chrome with an explicit --window-size, served on this builder's ports (4700-4749); each page in a browser
// context of its own. The kit clock is frozen (`freeze=1`): the twin moves only through hooks. Counts only, no timing.
// Evidence: evidence/captures/ff3/captures.json and JPEG contact sheets (every frame's PNG SHA-256 and size recorded).
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/tests/tools/capture-ff3.ts [--backends=webgpu,webgl2] [--skip=control,public]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ElementHandle, Page } from 'puppeteer-core';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';
import { ff3OutputFor } from './build-ff3.ts';
import { campusOutputFor } from './build-campus.ts';
import { createFab, FAB_DATA } from '../../src/sim/index.ts';

type Backend = 'webgpu' | 'webgl2';
const WIDTH = 1280, HEIGHT = 720;
const ORBIT_VIEWS = ['campus', 'pair', 'canopy', 'split', 'bridge', 'roundabout'] as const;
const INTERIOR_VIEWS = ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const;
/** The entities FF3's data may change in a frame: the placed kits and the two people classes. */
const FF3_ENTITIES = new Set(['subfabKit', 'humanoidWorkRobot', 'technician']);
const SEARCH_STEP_MS = 5_000, SEARCH_LIMIT_MS = 24 * 3_600_000;
const backends = (process.argv.find(a => a.startsWith('--backends='))?.slice(11) ?? 'webgpu,webgl2').split(/[,+ ]+/).filter(Boolean) as Backend[];
const skip = new Set((process.argv.find(a => a.startsWith('--skip='))?.slice(7) ?? '').split(',').filter(Boolean));
const outDir = resolve(PACKAGE_ROOT, 'evidence/captures/ff3');
mkdirSync(outDir, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rel = (path: string) => relative(PACKAGE_ROOT, path).replace(/\\/g, '/');
const round = (v: unknown, d = 3): unknown => typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : Array.isArray(v) ? v.map(x => round(x, d)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x, d)])) : v;
const sleep = (ms: number) => new Promise(accept => setTimeout(accept, ms));
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) { failures.push(what); console.log(`FAIL ${what}`); } return ok; };

type Stats = { programs: number; pipelines: number; drawCalls: number; triangles: number };
type EntityStats = { instances: number; drawn: number; lod1: number; draws: number; triangles: number };
type WorldStats = { instances: number; drawn: number; draws: number; triangles: number; lod1: number; sets: Record<string, EntityStats>; pulses: number; people: number; proxies: number };
type PersonPose = { key: string; x: number; z: number; yaw: number; activity: 'walk' | 'idle' | 'service'; clipS: number };
type People = { id: string; entity: string; poses: PersonPose[] }[];
const FF2 = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'evidence/captures/ff2/captures.json'), 'utf8')) as {
  records: { requested: Backend; views: { view: string; camera: { position: number[]; fov: number }; stats: Stats }[] }[];
  twin: { runs: { requested: Backend; warmStart: string; plusOneHour: string }[] };
};
const FFC1 = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'evidence/captures/ffc1/captures.json'), 'utf8')) as {
  records: { requested: Backend; views: { view: string; camera: unknown; stats: Stats; counts: unknown; sha256: string }[] }[];
};
const LAYOUT = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'data/layout.json'), 'utf8')) as {
  floorRobots: { stations: { id: string; port: string; tool: string; arm: { id: string; position: number[] }; amr: { id: string; position: number[] } }[] };
  sectionCut: { subfabKits: { id: string; position: number[] }[] };
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
const settle = async (page: Page) => { await sleep(260); await frames(page, 2); };
const stats = (page: Page): Promise<Stats> => page.evaluate(() => { const s = (window as any).__kilnScene.stats(); return { programs: s.programs, pipelines: s.pipelines, drawCalls: s.render?.drawCalls, triangles: s.render?.triangles }; });
const hud = (page: Page) => page.evaluate(() => ({
  buttons: [...document.querySelectorAll('.ks-hud button')].map(b => (b.textContent ?? '') + ((b as HTMLButtonElement).disabled ? ' (disabled)' : '')),
  status: [...document.querySelectorAll('.ks-hud .ks-status')].map(s => s.textContent ?? '').filter(Boolean),
}));
const shown = (page: Page, selector: string) => page.evaluate(q => { const r = document.querySelector(q)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }, selector);
async function press(page: Page, label: string): Promise<boolean> {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ks-hud button')].find(b => b.textContent === text) ?? null, label);
  const element = handle.asElement() as ElementHandle<Element> | null;
  if (!element) return check(false, `no HUD button "${label}" (${(await hud(page)).buttons.join(', ')})`);
  await element.click();
  await frames(page, 2); await settle(page);
  return true;
}
async function waitPlace(page: Page, place: 'exterior' | 'interior', timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const p = await inv(page, 'campusPlace').catch(() => null);
    if (p && p.place === place && !p.moving && (place === 'exterior' || p.interiorReady)) { await frames(page, 4); return p; }
    if (Date.now() - t0 > timeoutMs) { check(false, `the ${place} did not arrive (${JSON.stringify(p)})`); return p; }
    await sleep(150);
  }
}
async function waitDriveReady(page: Page, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if ((await hud(page)).buttons.some(b => b.startsWith('Drive the sedan'))) return true; await sleep(150); }
  return check(false, 'the drive never became ready');
}
/** From the orbit: the canopy view, then Enter the fab; returns once the interior has drawn its first view. */
async function enterFab(page: Page, backend: Backend, label: string) {
  await inv(page, 'campusView', 'canopy'); await frames(page, 10); await settle(page);
  check((await hud(page)).buttons.includes('Enter the fab'), `${backend} ${label}: the canopy view offers Enter the fab`);
  await press(page, 'Enter the fab');
  await waitPlace(page, 'interior');
}
const worldOf = async (page: Page) => (await inv<{ world: WorldStats; hash: string; simMs: number }>(page, 'ffState'));
/** Per-entity counts reduced to what a frame shows: instances drawn, draw calls and triangles. */
const entityRows = (w: WorldStats) => Object.fromEntries(Object.entries(w.sets).map(([id, s]) => [id, { drawn: s.drawn, lod1: s.lod1, draws: s.draws, triangles: s.triangles }]));
/** The entities whose drawn counts differ between two frames, and the sums of their differences. */
function entityDiff(a: WorldStats, b: WorldStats) {
  const zero = { drawn: 0, lod1: 0, draws: 0, triangles: 0 }, ra = entityRows(a), rb = entityRows(b);
  const ids = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort();
  const changed: Record<string, { control: typeof zero | null; ff3: typeof zero | null }> = {};
  let draws = 0, triangles = 0;
  for (const id of ids) {
    const x = ra[id] ?? zero, y = rb[id] ?? zero;
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    changed[id] = { control: ra[id] ?? null, ff3: rb[id] ?? null };
    draws += y.draws - x.draws; triangles += y.triangles - x.triangles;
  }
  return { changed, sum: { draws, triangles } };
}
/** The walk camera placed `back` metres ahead of a person along its heading and `side` metres to its left, looking at
 *  its chest; returns the walker, the camera and the person's chest in page coordinates (null when off the frame). */
async function framePerson(page: Page, pose: PersonPose, back = 4.2, side = 1.0) {
  const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw), lx = -fz, lz = fx;
  const cx = pose.x + fx * back + lx * side, cz = pose.z + fz * back + lz * side;
  const dx = pose.x - cx, dz = pose.z - cz, dist = Math.hypot(dx, dz);
  const spot = await inv<[number, number]>(page, 'ffWalkTo', cx, cz, (Math.atan2(-dz, dx) * 180) / Math.PI, (Math.atan2(1.1 - 1.6, dist) * 180) / Math.PI);
  await frames(page, 8); await settle(page);
  // The walk may have moved the spot: aim again from where the walker stands.
  const ex = pose.x - spot[0], ez = pose.z - spot[1], d2 = Math.hypot(ex, ez);
  await inv(page, 'ffWalkTo', spot[0], spot[1], (Math.atan2(-ez, ex) * 180) / Math.PI, (Math.atan2(1.1 - 1.6, d2) * 180) / Math.PI);
  await frames(page, 8); await settle(page);
  const camera = await inv(page, 'ffCamera'), chest = await inv<[number, number] | null>(page, 'ffProject', pose.x, 1.1, pose.z);
  return { spot, distanceM: d2, camera, chest };
}
/** Where a searched person must be: walking, and optionally within |z| of the spine and an X range. */
interface Where { maxAbsZ?: number; x?: [number, number] }
/** Steps the twin in SEARCH_STEP_MS steps (inside the page, one sim hour per call) until a walking person of class
 *  `id` stands `where`, up to SEARCH_LIMIT_MS; returns the time stepped and the pose, or null. */
async function findPerson(page: Page, id: string, where: Where) {
  const HOUR = 3_600_000;
  for (let first = 0; first <= SEARCH_LIMIT_MS; first += HOUR) {
    const found = await page.evaluate((cls, w, step, from, to) => {
      const scene = (window as any).__kilnScene;
      const ok = (p: PersonPose) => p.activity === 'walk' && (w.maxAbsZ === undefined || Math.abs(p.z) <= w.maxAbsZ) && (!w.x || (p.x >= w.x[0] && p.x <= w.x[1]));
      for (let t = from; t <= to; t += step) {
        if (t > 0) scene.invoke('ffAdvance', step);
        const pose = (scene.invoke('ffPeople') as People).find(g => g.id === cls)?.poses.find(ok);
        if (pose) return { steppedMs: t, pose };
      }
      return null;
    }, id, where, SEARCH_STEP_MS, first, Math.min(first + HOUR - SEARCH_STEP_MS, SEARCH_LIMIT_MS));
    if (found) return found;
  }
  return null;
}

const hosted = await serveOwned(ff3OutputFor('test')), owned = new Set([hosted.port]);
const control = skip.has('control') ? null : await serveOwned(campusOutputFor('test'), owned);
if (control) owned.add(control.port);
const chrome = await launchHeadless('ff3-capture', WIDTH, HEIGHT);
const sheetFrames = new Map<string, { name: string; b64: string }[]>();
const sheetFile = (group: string) => resolve(outDir, `sheet-${group}.jpg`);
const sheetShot = async (page: Page, group: string, name: string) => {
  const b64 = await page.screenshot({ type: 'png', encoding: 'base64' }) as string, bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (!sheetFrames.has(group)) sheetFrames.set(group, []);
  sheetFrames.get(group)!.push({ name, b64 });
  return { sheet: rel(sheetFile(group)), frame: name, sha256: sha(bytes), size: bytes.length };
};
try {
  const openPage = async (url0: string, backend: Backend) => {
    const context = await chrome.browser.createBrowserContext(), close = () => context.close();
    const page = await context.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
    const params = `capture=1&freeze=1&tier=high${backend === 'webgl2' ? '&backend=webgl2' : ''}`;
    const url = `${url0}/?${params}`; assertOwnedUrl(url, owned);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => { const h = (window as any).__kilnHarness?.snapshot(); return h && (h.readyCount > 0 || h.errors.length > 0); }, { timeout: 180_000, polling: 250 });
    const snapshot = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
    if (!snapshot.readyCount) throw new Error(`${backend}: ${JSON.stringify(snapshot.errors)}`);
    await frames(page, 12);
    await waitDriveReady(page);
    return { page, messages, params, snapshot, close };
  };
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

  const records: Record<string, unknown>[] = [];
  for (const backend of backends) {
    // 1. The control: FF-C1's build (read only) at FF2's eight interior views, the renderer's and the world's counts.
    const controlViews = new Map<string, { stats: Stats; world: WorldStats; camera: { position: number[]; fov: number } }>();
    if (control) {
      const { page, messages, close } = await openPage(control.url, backend);
      try {
        await enterFab(page, backend, 'control');
        for (const view of INTERIOR_VIEWS) {
          await inv(page, 'ffSetView', view); await frames(page, 6);
          const cam = await inv(page, 'ffCamera'), st = await stats(page), w = (await worldOf(page)).world;
          controlViews.set(view, { stats: st, world: w, camera: { position: cam.position, fov: cam.fov } });
          const was = FF2.records.find(r => r.requested === backend)!.views.find(v => v.view === view)!;
          check(st.drawCalls === was.stats.drawCalls && st.triangles === was.stats.triangles, `${backend} control ${view}: FF-C1's build equals FF2's record (${st.drawCalls} / ${st.triangles} against ${was.stats.drawCalls} / ${was.stats.triangles})`);
        }
        const unexpected = unexpectedMessages(messages);
        check(unexpected.length === 0, `${backend} control: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      } finally { await close(); }
    }

    // 2. FF3's build.
    const { page, messages, params, snapshot, close } = await openPage(hosted.url, backend);
    const group = `views-${backend}`;
    try {
      // The FF-C1 campus views, each against FF-C1's record.
      const ffc1 = FFC1.records.find(r => r.requested === backend)!, orbit: Record<string, unknown>[] = [];
      for (const view of ORBIT_VIEWS) {
        await inv(page, 'campusView', view); await frames(page, 20); await settle(page);
        const state = await inv(page, 'campusState'), counts = await inv(page, 'counts'), st = await stats(page), was = ffc1.views.find(v => v.view === view)!;
        const same = { camera: JSON.stringify(round(state.camera)) === JSON.stringify(was.camera), drawCalls: st.drawCalls === was.stats.drawCalls, triangles: st.triangles === was.stats.triangles, counts: JSON.stringify(counts) === JSON.stringify(was.counts) };
        check(state.place === 'exterior' && state.view === view && same.camera && same.drawCalls && same.triangles && same.counts,
          `${backend} orbit ${view}: equals FF-C1 (${JSON.stringify({ now: { camera: round(state.camera), stats: st, counts }, ffc1: { camera: was.camera, stats: was.stats, counts: was.counts } })})`);
        const shot = await sheetShot(page, group, `orbit ${view} (${backend})`);
        orbit.push({ view, camera: round(state.camera), stats: st, counts, ffc1: { stats: was.stats, sha256: was.sha256 }, equalsFfc1: { ...same, png: shot.sha256 === was.sha256 }, ...shot });
      }
      // The way in and FF2's interior views: FF2's cameras; counts beside the control, differences named by entity.
      await enterFab(page, backend, 'way in');
      const warm = await inv(page, 'ffState');
      const ff2 = FF2.records.find(r => r.requested === backend)!, interior: Record<string, unknown>[] = [];
      for (const view of INTERIOR_VIEWS) {
        await inv(page, 'ffSetView', view); await frames(page, 6);
        const cam = await inv(page, 'ffCamera'), st = await stats(page), w = (await worldOf(page)).world, was = ff2.views.find(v => v.view === view)!;
        const camera = { position: cam.position, fov: cam.fov };
        const sameCamera = JSON.stringify(round(camera)) === JSON.stringify(round(was.camera));
        check(sameCamera, `${backend} interior ${view}: FF2's camera (${JSON.stringify(round(camera))} against ${JSON.stringify(was.camera)})`);
        const c = controlViews.get(view);
        let attribution: Record<string, unknown> | null = null;
        if (c) {
          const diff = entityDiff(c.world, w), renderer = { drawCalls: st.drawCalls - c.stats.drawCalls, triangles: st.triangles - c.stats.triangles };
          const others = Object.keys(diff.changed).filter(id => !FF3_ENTITIES.has(id));
          const explained = renderer.drawCalls === diff.sum.draws && renderer.triangles === diff.sum.triangles;
          check(others.length === 0, `${backend} interior ${view}: only the kits and the people differ from FF-C1's build (also ${others.join(', ')})`);
          check(explained, `${backend} interior ${view}: the renderer's difference (${JSON.stringify(renderer)}) is the named entities' (${JSON.stringify(diff.sum)})`);
          attribution = { control: { stats: c.stats, worldDraws: c.world.draws, worldTriangles: c.world.triangles }, renderer, entities: diff.changed, entitySum: diff.sum, onlyFf3Entities: others.length === 0, explained };
        }
        interior.push({
          view, camera: round(camera), stats: st, ff2: { camera: was.camera, drawCalls: was.stats.drawCalls, triangles: was.stats.triangles },
          equalsFf2: { camera: sameCamera, drawCalls: st.drawCalls === was.stats.drawCalls, triangles: st.triangles === was.stats.triangles },
          ff3Entities: Object.fromEntries([...FF3_ENTITIES].map(id => [id, entityRows(w)[id] ?? null])), people: w.people, attribution,
          ...(await sheetShot(page, group, `interior ${view} (${backend})`)),
        });
      }
      // The twin (sim-spec 5): the warm start at entry and one sim hour later.
      await inv(page, 'ffAdvance', 3_600_000); await frames(page, 4);
      const hour = await inv(page, 'ffState');
      const ff2Twin = FF2.twin.runs.find(r => r.requested === backend)!;
      const twin: Record<string, unknown> = { atEntry: { simMs: warm.simMs, mode: warm.mode, hash: warm.hash }, plusOneHour: { simMs: hour.simMs, hash: hour.hash }, headless: headlessTwin, ff2: ff2Twin };
      check(warm.simMs === headlessTwin.simMs && warm.hash === headlessTwin.warmStart && hour.hash === headlessTwin.plusOneHour && warm.hash === ff2Twin.warmStart && hour.hash === ff2Twin.plusOneHour,
        `${backend} twin: ${warm.hash} then ${hour.hash}; headless ${headlessTwin.warmStart} then ${headlessTwin.plusOneHour}; FF2 ${ff2Twin.warmStart} then ${ff2Twin.plusOneHour}`);
      await press(page, 'Exit to campus');
      await waitPlace(page, 'exterior');
      await enterFab(page, backend, 'second entry');
      const again = await inv(page, 'ffState');
      twin.secondEntry = { simMs: again.simMs, hash: again.hash };
      check(again.simMs === headlessTwin.simMs && again.hash === headlessTwin.warmStart, `${backend} twin: a second Enter starts from the warm start (${again.hash} at ${again.simMs})`);

      // 3. The FF3 subjects on this fresh twin.
      const sgroup = `subjects-${backend}`, subjects: Record<string, unknown> = {};
      // The placed kits in the section view.
      await inv(page, 'ffSetView', 'section'); await frames(page, 6);
      const sectionWorld = (await worldOf(page)).world, kitRow = entityRows(sectionWorld).subfabKit ?? null;
      check(!!kitRow && kitRow.drawn > 0, `${backend} section: the placed subfab kits are drawn (${JSON.stringify(kitRow)})`);
      const kitPoints = [];
      for (const kit of LAYOUT.sectionCut.subfabKits) kitPoints.push({ id: kit.id, page: round(await inv(page, 'ffProject', kit.position[0], kit.position[1] + 3, kit.position[2])) });
      subjects.kits = { view: 'section', camera: round(await inv(page, 'ffCamera')), subfabKit: kitRow, kits: LAYOUT.sectionCut.subfabKits.length, inFrame: kitPoints.filter(k => k.page !== null).length, kitCentres: kitPoints, stats: await stats(page), ...(await sheetShot(page, sgroup, `the placed subfab kits: the section view (${backend})`)) };
      // The floor robots at rest (item 1 stopped: decision 1), station 1 seen from the east along its aisle.
      const station = LAYOUT.floorRobots.stations[0]!, [ax, , az] = station.arm.position as [number, number, number], [mx, , mz] = station.amr.position as [number, number, number];
      const tx = (ax + mx) / 2, tz = (az + mz) / 2, from: [number, number] = [tx + 3.2, tz - 2.2];
      const robotSpot = await inv<[number, number]>(page, 'ffWalkTo', from[0], from[1], (Math.atan2(-(tz - from[1]), tx - from[0]) * 180) / Math.PI, (Math.atan2(0.8 - 1.6, Math.hypot(tx - from[0], tz - from[1])) * 180) / Math.PI);
      await frames(page, 8); await settle(page);
      // The first walk opens the kit's controls panel over the frame; it is closed as a visitor would.
      const helpClosed = await shown(page, '.ks-help') ? await press(page, 'Close controls') : false;
      const robotsWorld = (await worldOf(page)).world;
      subjects.floorRobots = {
        station: station.id, port: station.port, tool: station.tool, spot: round(robotSpot), helpClosed, camera: round(await inv(page, 'ffCamera')),
        arm: { id: station.arm.id, page: round(await inv(page, 'ffProject', ax, 0.9, az)) }, amr: { id: station.amr.id, page: round(await inv(page, 'ffProject', mx, 0.6, mz)) },
        entities: { toolFrontRobotArm: entityRows(robotsWorld).toolFrontRobotArm ?? null, amrFloorRobot: entityRows(robotsWorld).amrFloorRobot ?? null },
        note: 'at rest (arm home, deck down), as in FF2: the twin moves every FOUP by the overhead rail, so the AMR hand-off and the arm at work are not drawn (PROGRESS.md FF3 decision 1)',
        ...(await sheetShot(page, sgroup, `the floor robots at rest, ${station.id} (${backend})`)),
      };
      // The humanoid work robot walking the spine, then a cleanroom technician walking.
      const people: Record<string, unknown> = {};
      const searches: [string, Where, string][] = [
        ['humanoid', { maxAbsZ: 0.6, x: [-30, 30] }, 'the humanoid work robot walking the spine'],
        ['technician', {}, 'a cleanroom technician walking'],
      ];
      for (const [cls, where, label] of searches) {
        const found = await findPerson(page, cls, where);
        if (!check(!!found, `${backend} ${label}: none within ${SEARCH_LIMIT_MS / 3_600_000} h of the warm start`)) { people[cls] = null; continue; }
        await frames(page, 4);
        const state = await inv(page, 'ffState'), framed = await framePerson(page, found!.pose);
        const w = (await worldOf(page)).world;
        check(framed.chest !== null, `${backend} ${label}: the chest projects inside the frame (${JSON.stringify(framed)})`);
        people[cls] = {
          what: label, steppedMs: found!.steppedMs, simMs: state.simMs, sinceWarmStartMs: state.simMs - again.simMs, hash: state.hash, pose: round(found!.pose), camera: round(framed.camera), spot: round(framed.spot), distanceM: round(framed.distanceM), chestOnPage: round(framed.chest),
          drawn: (await inv<People>(page, 'ffPeople')).map(g => ({ id: g.id, entity: g.entity, n: g.poses.length, activities: g.poses.map(p => p.activity) })), entity: entityRows(w)[cls === 'humanoid' ? 'humanoidWorkRobot' : 'technician'] ?? null,
          ...(await sheetShot(page, sgroup, `${label}, ${Math.round((state.simMs - again.simMs) / 1000)} s after the warm start (${backend})`)),
        };
      }
      subjects.people = people;
      await press(page, 'Exit to campus');
      await waitPlace(page, 'exterior');
      const unexpected = unexpectedMessages(messages);
      check(unexpected.length === 0, `${backend}: unexpected console messages ${JSON.stringify(unexpected.slice(0, 3))}`);
      records.push({ backend: snapshot.backend?.backend, requested: backend, fellBack: snapshot.backend?.fellBack, url: `/?${params}`, viewport: [WIDTH, HEIGHT], orbit, interior, twin, subjects, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
      console.log(JSON.stringify({ backend, actual: snapshot.backend?.backend, twin: [warm.hash, hour.hash, again.hash], people: Object.fromEntries(Object.entries(people).map(([k, v]) => [k, v ? (v as { sinceWarmStartMs: number }).sinceWarmStartMs : null])), unexpected: unexpected.length, failures: failures.length }));
    } finally { await close(); }
  }

  // 4. The public build (no test hooks, live clock) on both backends.
  const publicRuns: Record<string, unknown>[] = [];
  if (!skip.has('public')) {
    const publicHost = await serveOwned(ff3OutputFor('public'), owned); owned.add(publicHost.port);
    try {
      for (const backend of backends) {
        const context = await chrome.browser.createBrowserContext();
        const page = await context.newPage(), messages: ConsoleRecord[] = [];
        page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
        page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
        page.on('requestfailed', r => messages.push({ kind: 'requestfailed', url: r.url(), text: r.failure()?.errorText }));
        try {
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
          const shot = await sheetShot(page, 'public', `public page (${backend})`);
          const unexpected = unexpectedMessages(messages);
          check(status === '' && unexpected.length === 0, `public ${backend}: ${status} ${JSON.stringify(unexpected.slice(0, 2))}`);
          check(['Drive the sedan', 'About the campus', 'Controls', 'Credits'].every(b => buttons.includes(b)) && hooks === 'undefined', `public ${backend}: the drive, About, Controls and Credits, no test hooks (${buttons.join(', ')}; hooks ${hooks})`);
          publicRuns.push({ requested: backend, backend: backendAttr, status, testHooks: hooks, buttons, ...shot, unexpectedConsole: unexpected.slice(0, 8), unexpectedCount: unexpected.length });
          console.log(JSON.stringify({ public: backend, backend: backendAttr, status, unexpected: unexpected.length }));
        } finally { await context.close(); }
      }
    } finally { await publicHost.close(); }
  }

  const sheets: Record<string, unknown> = {};
  for (const [group, shots] of sheetFrames) sheets[group] = await sheet(`Foundry Floor FF3 ${group}, 1280x720 frames at half size`, shots, sheetFile(group));
  writeJson(resolve(outDir, 'captures.json'), {
    task: 'TASK-FF3 item 9: the FF-C1 campus views and FF2\'s interior views on the ff3 build (differences named by entity against FF-C1\'s build), the twin\'s hashes, the placed subfab kits, the floor robots at rest, the humanoid and a technician walking, and the public build, on WebGPU and WebGL2',
    captured: new Date().toISOString(), headless: `Chrome, --window-size ${WIDTH}x${HEIGHT}`,
    build: 'dist/ff3/test (test hooks) and dist/ff3/standalone (public); control: dist/campus/test (FF-C1, served read-only)',
    clock: 'kit clock frozen (freeze=1): the twin steps only through hooks; the people searches step it in 5 s steps from a fresh warm start',
    noTiming: 'no frame time or load time is recorded: this PC measures no performance (TASK.md); counts only',
    notCaptured: { amrHandoff: 'not drawn: item 1 stopped at the brief\'s model-change rule (PROGRESS.md FF3 decision 1)', armAtWork: 'not drawn: the same decision; the arms and AMRs stand at rest, captured as such' },
    failures, records, publicBuild: { build: 'dist/ff3/standalone (public)', runs: publicRuns },
    references: { ff2: 'evidence/captures/ff2/captures.json', ffc1: 'evidence/captures/ffc1/captures.json' }, headlessTwin, sheets,
  });
  console.log(JSON.stringify({ captures: rel(resolve(outDir, 'captures.json')), failures }));
  if (failures.length) process.exitCode = 1;
} finally { await chrome.close(); await hosted.close(); await control?.close(); }
