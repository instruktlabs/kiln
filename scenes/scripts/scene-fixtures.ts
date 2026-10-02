// Named views and workloads per scene, as hook-driven fixtures (S1 count probe; reusable by a B-06 A/B runner).
// Each table gives the page query shared by its fixtures, a prepare step after ready, and the fixtures in run order. A
// fixture with its own `query` gets its own page load (Golden Gate flyovers are sought from the URL). Every fixture
// leaves the scene clock frozen (timeScale 0) before it returns, so the probe settles on a still frame; workloads run
// the clock only long enough to reach their state, so their counts are a representative state, not a pinned pose.
import assert from 'node:assert/strict';
import type { Page } from 'puppeteer-core';
import type { SceneId } from './build-scene';

export interface ProbeFixture { id: string; hudLabel: string | null; query?: Record<string, string>; enter(page: Page): Promise<unknown>; exit?(page: Page): Promise<void> }
export interface SceneFixtureTable { scene: SceneId; query: Record<string, string>; prepare(page: Page): Promise<void>; fixtures: ProbeFixture[] }
const TIMEOUT = 120_000;

export const invoke = (page: Page, name: string, ...args: unknown[]) => page.evaluate((n, a) => (window as any).__kilnScene.invoke(n, ...a), name, args); // eslint-disable-line @typescript-eslint/no-explicit-any
export const frames = (page: Page, n: number) => page.evaluate(count => (window as any).__kilnScene.waitFrames(count), n); // eslint-disable-line @typescript-eslint/no-explicit-any
const timeScale = (page: Page, scale: number) => page.evaluate(s => (window as any).__kilnScene.setTimeScale(s), scale); // eslint-disable-line @typescript-eslint/no-explicit-any
const playing = (page: Page, on: boolean) => page.evaluate(v => (window as any).__kilnScene.setPlaying(v), on); // eslint-disable-line @typescript-eslint/no-explicit-any
const workload = (page: Page, name: string) => page.evaluate(n => (window as any).__kilnScene.runWorkload(n), name); // eslint-disable-line @typescript-eslint/no-explicit-any
/** Polls a hook through the page until `test` holds on its result. */
async function until(page: Page, hook: string, args: unknown[], test: string) {
  await page.waitForFunction((n, a, t) => { const value = (window as any).__kilnScene.invoke(n, ...a); return new Function('v', `return (${t});`)(value); }, { timeout: TIMEOUT, polling: 100 }, hook, args, test); // eslint-disable-line @typescript-eslint/no-explicit-any
}
/**
 * Runs a workload on a live clock for `n` frames once `ready` holds, then stops it, releases its held input (a blur of
 * the scene root clears the kit's input) and freezes the clock. Play systems step on the frame's own delta, not the
 * scaled clock, so `still` (a hook read compared 20 frames apart) waits until whatever the input moved has stopped.
 */
async function runFor(page: Page, name: string, hook: string, ready: string, n: number, still?: (value: any) => unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await timeScale(page, 1); await workload(page, name);
  await until(page, hook, [], ready); await frames(page, n);
  await workload(page, ''); await page.focus('.ks-root'); await page.evaluate(() => (document.querySelector('.ks-root') as HTMLElement).blur());
  await timeScale(page, 0); await frames(page, 2);
  if (still) await rest(page, hook, still);
}
const farmRest = (s: any) => [s.player.position, s.player.yaw, s.tractor.position, s.tractor.yaw, s.camera.position]; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Polls `hook` 20 frames apart until `pick` of it repeats (a chase camera's lag runs on the frame's own delta). */
async function rest(page: Page, hook: string, pick: (value: any) => unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0, last = ''; i < 60; i++) { const now = JSON.stringify(pick(await invoke(page, hook))); if (now === last) return; last = now; await frames(page, 20); }
  throw new Error(`${hook}: the scene did not come to rest`);
}

export const FARM_VIEWS = ['hero', 'opposite', 'top', 'eye-height', 'crops', 'fences', 'props', 'watermill-wheel', 'watermill-interior', 'house-interior', 'house-porch', 'house-window-out'] as const;
const FARM_PLAY = { 'play-yard': { to: 'yard' }, 'play-house': { to: 'house' }, 'play-bridge': { to: 'bridge' }, 'play-house-door': { to: 'house', door: 'home-0' } } as const;
export const FARM_FIXTURES: SceneFixtureTable = {
  scene: 'farm', query: { freeze: '1', time: '0', view: 'hero' },
  async prepare(page) {
    await page.evaluate(() => { const s = (window as any).__kilnScene; s.feedFrameTimes([]); s.setAmbient(false); s.setTimeScale(0); s.setTime(0); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const names = await invoke(page, 'viewNames') as string[];
    assert.deepEqual([...names].sort(), [...FARM_VIEWS].sort(), 'Farm layout views match the fixture table');
  },
  fixtures: [
    ...FARM_VIEWS.map((view): ProbeFixture => ({ id: view, hudLabel: view === 'hero' ? 'Overview (landing)' : null, enter: page => invoke(page, 'setView', view) })),
    ...Object.entries(FARM_PLAY).map(([id, f]): ProbeFixture => ({ id, hudLabel: id === 'play-yard' ? 'Walk the farm' : null, async enter(page) {
      await playing(page, true); await frames(page, 2);
      assert.equal(await invoke(page, 'teleport', f.to), true, `Farm destination ${f.to}`); await frames(page, 3);
      if ('door' in f) {
        await invoke(page, 'toggleDoor', f.door); await timeScale(page, 1);
        await until(page, 'simState', [], `v.doors.some(d => d.id === '${f.door}' && d.target === 1 && Math.abs(d.amount - 1) < 1e-3)`);
        await timeScale(page, 0);
      }
    }, async exit(page) { if ('door' in f) { await invoke(page, 'toggleDoor', f.door); await timeScale(page, 1); await until(page, 'simState', [], `v.doors.some(d => d.id === '${f.door}' && Math.abs(d.amount) < 1e-3)`); await timeScale(page, 0); } } })),
    { id: 'walk', hudLabel: 'Walk the farm (walk workload)', enter: page => runFor(page, 'walk', 'simState', 'v.active', 120, farmRest), exit: page => playing(page, false).then(() => frames(page, 3)) },
    { id: 'tractor-drive', hudLabel: 'Drive tractor', enter: page => runFor(page, 'tractor-drive', 'simState', 'v.driving', 120, farmRest), exit: page => playing(page, false).then(() => frames(page, 3)) },
  ],
};

export const FOUNDRY_CAMPUS_VIEWS = { campus: 'Campus', pair: 'One pair', canopy: 'Arrival', split: 'The split', bridge: null, roundabout: null } as const;
export const FOUNDRY_FAB_VIEWS = { landing: 'Gallery', overview: 'Overview', spine: null, litho: null, cluster: null, stocker: 'Transfers', gallery: null, section: null } as const;
export const FOUNDRY_FIXTURES: SceneFixtureTable = {
  scene: 'foundry-floor', query: { freeze: '1', time: '0', capture: '1' },
  async prepare(page) {
    await page.evaluate(() => (window as any).__kilnScene.feedFrameTimes([])); // eslint-disable-line @typescript-eslint/no-explicit-any
    await until(page, 'driveTraffic', [1], 'v !== null');
  },
  fixtures: [
    ...Object.entries(FOUNDRY_CAMPUS_VIEWS).map(([view, label]): ProbeFixture => ({ id: `campus-${view}`, hudLabel: label, async enter(page) { await invoke(page, 'campusView', view); await frames(page, 18); } })),
    { id: 'drive', hudLabel: 'Drive the sedan', async enter(page) {
      // Two seconds of fixed steps at throttle .8, then the car is set down where it got to at rest (the drive steps on the
      // frame's own delta, so a moving car would never settle) and the chase camera comes to rest behind it.
      await playing(page, true); await until(page, 'driveState', [], 'v !== null');
      const at = await invoke(page, 'driveAdvance', 2, { throttle: .8 }) as { centre: [number, number]; headingDeg: number };
      await invoke(page, 'setDriveInput', { throttle: 0 }); await invoke(page, 'placeCar', at.centre[0], at.centre[1], at.headingDeg, 0);
      await rest(page, 'driveState', v => [v.centre, v.camera.position]);
    }, async exit(page) { await invoke(page, 'setDriveInput', null); await playing(page, false); await until(page, 'driveState', [], 'v === null'); await frames(page, 6); } },
    ...Object.entries(FOUNDRY_FAB_VIEWS).map(([view, label], index): ProbeFixture => ({ id: `fab-${view}`, hudLabel: index === 0 ? `Enter the fab → ${label}` : label, async enter(page) {
      if (index === 0) {
        // tests/tools/capture-local-v09.ts enter(): Arrival, wait for the canopy prompt, enter, wait for the interior.
        await invoke(page, 'campusView', 'canopy'); await until(page, 'campusState', [], 'v && v.canEnter');
        await invoke(page, 'campusEnter'); await until(page, 'campusPlace', [], 'v.interiorReady && !v.moving');
        await page.evaluate(() => (window as any).__kilnScene.setTimeScale(0)); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      await invoke(page, 'ffSetView', view); await frames(page, 12);
    } })),
  ],
};

export const GG_CAMERAS = ['arrival', 'postcard', 'pier', 'topdown', 'horizon', 'deck', 'tower', 'span', 'lanes', 'sidewalk', 'traffic'] as const;
const GG_FLIGHTS = { 'postcard-sweep': 'Postcard sweep', 'tower-rise': 'Tower rise', 'deck-run': 'Deck run', 'fog-roll': 'Fog roll' } as const;
const GG_QUERY = { capture: '1', hud: '0', preset: 'day', cam: 'arrival', time: '12' };
export const GOLDEN_GATE_FIXTURES: SceneFixtureTable = {
  scene: 'golden-gate', query: GG_QUERY,
  async prepare(page) { await page.evaluate(() => (window as any).__kilnScene.feedFrameTimes([])); }, // eslint-disable-line @typescript-eslint/no-explicit-any
  fixtures: [
    ...GG_CAMERAS.map((cam): ProbeFixture => ({ id: cam, hudLabel: cam === 'arrival' ? 'Overview (landing)' : null, async enter(page) { await invoke(page, 'setView', cam); await frames(page, 20); } })),
    ...(['golden', 'fog'] as const).map((preset): ProbeFixture => ({ id: `preset-${preset}`, hudLabel: preset === 'golden' ? 'Golden hour' : 'Fog', async enter(page) {
      await invoke(page, 'setView', 'arrival'); await invoke(page, 'setPreset', preset); await frames(page, 20);
    }, async exit(page) { await invoke(page, 'setPreset', 'day'); await frames(page, 6); } })),
    { id: 'drive', hudLabel: 'Drive the sedan', async enter(page) {
      // tests/tools/perf-local.ts X-02 drive fixture (northbound middle lane 300 m south of midspan at 25 m/s, 90 live
      // frames), then the car is set down at rest where it got to and the chase camera settles (the drive steps on the
      // frame's own delta, so a moving car would never give a still frame).
      await timeScale(page, 1); await playing(page, true); await until(page, 'driveState', [], 'v !== null');
      await invoke(page, 'placeCar', 'nb-middle', -300, 25); await frames(page, 90); await timeScale(page, 0);
      const at = await invoke(page, 'driveState') as { sigma: number };
      await invoke(page, 'setDriveInput', { throttle: 0 }); await invoke(page, 'placeCar', 'nb-middle', at.sigma, 0);
      await rest(page, 'driveState', v => [v.x, v.z, v.camera.position]);
    }, async exit(page) { await invoke(page, 'setDriveInput', null); await playing(page, false); await frames(page, 6); } },
    ...Object.entries(GG_FLIGHTS).map(([flight, label]): ProbeFixture => ({ id: `flight-${flight}`, hudLabel: label,
      query: { ...GG_QUERY, preset: flight === 'fog-roll' ? 'fog' : 'day', flight, flightAt: '0.5' }, async enter(page) { await frames(page, 20); } })),
  ],
};

export const SCENE_FIXTURES: Readonly<Record<SceneId, SceneFixtureTable>> = { farm: FARM_FIXTURES, 'foundry-floor': FOUNDRY_FIXTURES, 'golden-gate': GOLDEN_GATE_FIXTURES };
