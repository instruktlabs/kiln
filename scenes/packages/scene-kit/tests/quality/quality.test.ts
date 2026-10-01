import { describe, expect, test } from 'bun:test';
import { buildLadder, classifyDevice, createQualityController, DEFAULT_GOVERNOR, defineTiers, FrameTimeGovernor, resolveTier, RUNTIME_PIXEL_RATIO_SUPPORTED, type DeviceProbe, type TierKnobs } from '../../src/quality/core';

const knobs: TierKnobs = { pixelRatioCap: 1.5, pixelRatioMin: 1, vegetationDensity: 1, instanceDensity: 1, shadows: { enabled: true, type: 'pcf', mapSize: 1024, maxCasters: 1 }, drawDistance: { far: 250, fogNear: 120, fogFar: 220, lodBias: 1, streamRadiusScale: 1, zoneHops: 2 }, effects: { water: 'full', wind: true, ambientAnimation: true } };
const table = defineTiers({ order: ['minimal', 'economy', 'balanced', 'high'], minimal: knobs, economy: knobs, balanced: knobs, high: (d) => ({ ...knobs, marker: d.form }) });
const probe: DeviceProbe = { backend: 'webgpu', hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 2.8, screenWidth: 412, screenHeight: 915, coarsePointer: true, mobileUA: true, saveData: false, prefersReducedMotion: false };
describe('U-15 classification, tiers and persistence', () => {
  test.each([
    ['S24+', { adapter: { vendor: 'qualcomm', architecture: 'adreno-740', device: '', description: '' } }, 'high', 'phone', 'high'],
    ['S24+ generic architecture', { adapter: { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: '' } }, 'high', 'phone', 'high'],
    ['Tab S9 FE (X-07)', { screenWidth: 800, screenHeight: 1280, adapter: { vendor: 'arm', architecture: 'mali-g68', device: '', description: '' } }, 'minimal', 'tablet', 'low'],
    ['Tab S9 FE WebGPU adapter as read on the device (X-07)', { screenWidth: 800, screenHeight: 1280, adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: '' } }, 'minimal', 'tablet', 'mid'],
    ['Tab S9 FE on WebGL2 (D-03)', { backend: 'webgl2', screenWidth: 800, screenHeight: 1280, adapter: { vendor: 'Google Inc. (ARM)', architecture: '', device: '', description: 'ANGLE (ARM, Mali-G68, OpenGL ES 3.2)' } }, 'minimal', 'tablet', 'low'],
    ['Valhall naming a newer Mali stays economy', { adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: 'Mali-G710' } }, 'economy', 'phone', 'mid'],
    ['Bifrost Mali on WebGPU stays economy', { adapter: { vendor: 'arm', architecture: 'bifrost', device: '', description: '' } }, 'economy', 'phone', 'mid'],
    ['Valhall on a desktop is not X-07', { coarsePointer: false, mobileUA: false, adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: '' } }, 'high', 'desktop', 'mid'],
    ['RTX desktop', { coarsePointer: false, mobileUA: false, adapter: { vendor: 'nvidia', architecture: 'ampere', device: '', description: 'RTX 3070' } }, 'high', 'desktop', 'high'],
    ['unknown Android', {}, 'economy', 'phone', 'unknown'],
    ['Save-Data unknown WebGPU phone keeps economy D05 floor', { saveData: true }, 'economy', 'phone', 'unknown'],
    ['Apple phone', { adapter: { vendor: 'apple', architecture: '', device: '', description: '' } }, 'high', 'phone', 'high'],
    ['integrated laptop', { coarsePointer: false, mobileUA: false, deviceMemory: 4, adapter: { vendor: 'intel', architecture: '', device: '', description: 'Iris Xe' } }, 'balanced', 'desktop', 'mid'],
    ['WebGL2 phone D03', { backend: 'webgl2' }, 'minimal', 'phone', 'unknown'],
    ['saveData', { saveData: true, adapter: { vendor: 'apple', architecture: '', device: '', description: '' } }, 'balanced', 'phone', 'high'],
  ] as const)('%s', (_name, patch, tier, form, gpu) => {
    const result = classifyDevice({ ...probe, ...patch }, table); expect(result.tier).toBe(tier); expect(result.device.form).toBe(form); expect(result.device.gpu).toBe(gpu);
  });
  test('device dependent entry, explicit override, bounded earned tier and blocked storage', () => {
    const d = classifyDevice(probe, table).device; expect((resolveTier(table, 'high', d) as TierKnobs & { marker: string }).marker).toBe('phone');
    expect(createQualityController(table, probe, { quality: 'high' }).tier).toBe('high');
    const storage = { getItem: () => JSON.stringify({ tier: 'high', earnedAt: 1 }), setItem: () => {} };
    expect(createQualityController(table, probe, { sceneId: 'demo', storage }).tier).toBe('balanced');
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    expect(createQualityController(table, probe, { sceneId: 'demo', storage: blocked }).tier).toBe('economy');
    expect(() => defineTiers({ order: ['high'], high: { ...knobs, pixelRatioMin: 2 } })).toThrow();
  });
  test('D05 persisted minimal never escapes mobile WebGL2 automatic routing; explicit prop still wins', () => {
    const storage = { getItem: () => JSON.stringify({ tier: 'minimal', earnedAt: 1 }), setItem: () => {} };
    expect(createQualityController(table, probe, { storage }).tier).toBe('economy');
    expect(createQualityController(table, { ...probe, coarsePointer: false, mobileUA: false }, { storage }).tier).toBe('economy');
    expect(createQualityController(table, { ...probe, backend: 'webgl2' }, { storage }).tier).toBe('minimal');
    expect(createQualityController(table, probe, { quality: 'minimal', storage }).tier).toBe('minimal');
  });
  test('X-07: the Mali-G68 class on WebGPU starts on minimal with its reason, learned tiers never lift it, explicit props still win, and a table without minimal keeps economy', () => {
    const tablet: DeviceProbe = { ...probe, screenWidth: 800, screenHeight: 1280, adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: '' } };
    const events: { kind: string; reasons?: string[] }[] = [];
    const learned = { getItem: () => JSON.stringify({ tier: 'high', earnedAt: 1 }), setItem: () => {} };
    expect(createQualityController(table, tablet, { storage: learned, onTier: e => events.push(e) }).tier).toBe('minimal');
    expect(events[0].reasons).toEqual(['tablet / mid GPU', 'Mali-G68 class on WebGPU (X-07)']);
    expect(createQualityController(table, tablet, { quality: 'economy', storage: learned }).tier).toBe('economy');
    const withoutMinimal = defineTiers({ order: ['economy', 'balanced', 'high'], economy: knobs, balanced: knobs, high: knobs });
    expect(classifyDevice(tablet, withoutMinimal).tier).toBe('economy');
  });
});

describe('U-16 deterministic governor', () => {
  const fast = { ...DEFAULT_GOVERNOR, windowMs: 2000, evalEveryMs: 100, warmupFrames: 0, settleFrames: 0, minChangeGapMs: 2000, upHoldMs: 1000, upGapMs: 2000, maxChangesPerMinute: 100 };
  const ladder = buildLadder(knobs);
  test('Z4 omits every DPR change and C01 preserves floor', () => {
    expect(RUNTIME_PIXEL_RATIO_SUPPORTED).toBe(false); expect(ladder.length).toBeGreaterThan(3);
    expect(ladder.every(l => l.pixelRatio === 1.5 && l.pixelRatio >= knobs.pixelRatioMin)).toBe(true);
    expect(ladder.at(-1)!.vegetationDensity).toBe(.25);
  });
  test('custom ladders respect Z4 and reject invalid live density values', () => {
    const first = ladder[0]; const custom = buildLadder({ ...knobs, ladder: [{ ...first, pixelRatio: 1.2 }, { ...first, pixelRatio: 1, vegetationDensity: .5 }] });
    expect(custom).toHaveLength(2); expect(custom.every(level => level.pixelRatio === 1.5)).toBe(true);
    expect(() => buildLadder({ ...knobs, ladder: [{ ...first, instanceDensity: -1 }] })).toThrow();
  });
  test('C02 improving sustained slow trace reaches floor', () => {
    const g = new FrameTimeGovernor({ ...fast, downP95Ms: 1, downMedianMs: 1 }, ladder);
    for (let n = 0; n < 4000; n++) g.pushFrame(30 * Math.pow(.85, g.level), {});
    expect(g.level).toBe(ladder.length - 1);
  });
  test.each([30, 33])('constant %i ms trace reverts and disables down steps for 60 s', dt => {
    const g = new FrameTimeGovernor(fast, ladder); const events: string[] = [];
    for (let n = 0; n < 500; n++) { const event = g.pushFrame(dt, {}); if (event) events.push(event.direction); }
    expect(events).toEqual(['down', 'revert']); expect(g.level).toBe(0);
  });
  test('noisy 60fps with isolated stalls never changes and pause ignores samples', () => {
    const g = new FrameTimeGovernor(DEFAULT_GOVERNOR, ladder);
    for (let n = 0; n < 5000; n++) expect(g.pushFrame(n % 111 === 0 ? 400 : 16 + n % 3, {})).toBe(null);
    for (let n = 0; n < 200; n++) expect(g.pushFrame(80, { hidden: true })).toBe(null);
    expect(g.level).toBe(0);
  });
  test('warmup/settle exclude frames and max changes per minute is capped', () => {
    const g = new FrameTimeGovernor({ ...fast, warmupFrames: 100, settleFrames: 90, maxChangesPerMinute: 2, downP95Ms: 1, downMedianMs: 1 }, ladder);
    for (let n = 0; n < 100; n++) expect(g.pushFrame(30, {})).toBe(null);
    let changes = 0;
    for (let n = 0; n < 1000; n++) if (g.pushFrame(30 * Math.pow(.85, g.level), {})) changes++;
    expect(changes).toBeLessThanOrEqual(2);
  });
  test('two oscillation reversals lock the lower level', () => {
    const g = new FrameTimeGovernor(fast, ladder); const events: string[] = [];
    for (let n = 0; n < 5000 && !g.locked; n++) {
      const dt = g.level > 0 ? 10 : 30; const change = g.pushFrame(dt, {}); if (change) events.push(change.direction);
    }
    expect(events).toContain('up'); expect(g.locked).toBe(true); expect(g.level).toBeGreaterThan(0);
  });
  test('controller keeps live object stable and emits tier events', () => {
    const events: unknown[] = []; const c = createQualityController(table, probe, { quality: 'high', governor: fast, onTier: e => events.push(e) });
    const live = c.live; let notified = 0; c.onLiveChange(() => notified++);
    for (let n = 0; n < 120; n++) c.step(30, {});
    expect(c.live).toBe(live); expect(notified).toBeGreaterThan(0); expect(events.length).toBeGreaterThan(1);
    c.dispose(); const count = events.length; for (let n = 0; n < 100; n++) c.step(40, {}); expect(events.length).toBe(count);
  });
  test('dev live updates clamp finite values and cannot change startup DPR', () => {
    const c = createQualityController(table, probe, { quality: 'high' }); let changes = 0; c.onLiveChange(() => changes++);
    c.setLive({ vegetationDensity: -.1, instanceDensity: 2, pixelRatio: .1, zoneHops: 8, lodBias: NaN });
    expect(c.live).toMatchObject({ vegetationDensity: 0, instanceDensity: 1, pixelRatio: 1.5, zoneHops: 2, lodBias: 1 }); expect(changes).toBe(1);
    c.setLive({ instanceDensity: 2 }); expect(changes).toBe(1); c.dispose(); c.setLive({ vegetationDensity: 1 }); expect(c.live.vegetationDensity).toBe(0);
  });
  test('FARM-004: a slow window is evaluated once it spans windowMs; a fast one still at 60 samples, whichever comes first', () => {
    const o = { ...DEFAULT_GOVERNOR, warmupFrames: 0, settleFrames: 0 }, slow = new FrameTimeGovernor(o, ladder), quick = new FrameTimeGovernor(o, ladder);
    // 15 FPS: 3000 ms of window is 45 frames, never 60 samples. The 45th frame closes the span and steps down at once.
    for (let n = 1; n < 45; n++) expect(slow.pushFrame(66.7)).toBe(null);
    expect(slow.median).toBe(0); expect(slow.pushFrame(66.7)).toEqual({ level: 1, direction: 'down' });
    // 60 FPS: the 60th sample arrives after 1 s, before the window spans 3 s.
    for (let n = 1; n < 60; n++) quick.pushFrame(16.7);
    expect(quick.median).toBe(0); quick.pushFrame(16.7); expect(quick.median).toBeCloseTo(16.7);
  });
  test('FARM-004: below 20 FPS a constant trace steps down, reverts, and locks after the second reversal', () => {
    const g = new FrameTimeGovernor(fast, ladder); const events: string[] = [];
    for (let n = 0; n < 1500 && !g.locked; n++) { const event = g.pushFrame(66.7); if (event) events.push(event.direction); }
    expect(events).toEqual(['down', 'revert', 'down']); expect(g.locked).toBe(true); expect(g.level).toBe(1);
  });
  test('FARM-004: below 20 FPS an improving trace exhausts the ladder and the controller advises a lower tier', () => {
    const events: { kind: string; suggestedTier?: string; direction?: string }[] = [];
    const c = createQualityController(table, probe, { quality: 'high', governor: fast, storage: null, onTier: e => events.push(e) });
    for (let n = 0; n < 3000 && !events.some(e => e.kind === 'advice'); n++) c.step(150 * Math.pow(.9, c.level));
    expect(c.level).toBe(ladder.length - 1); expect(150 * Math.pow(.9, c.level)).toBeGreaterThan(50);
    expect(events.filter(e => e.kind === 'live').every(e => e.direction === 'down')).toBe(true);
    expect(events.at(-1)).toMatchObject({ kind: 'advice', suggestedTier: 'balanced' });
  });
  test('D05 exhausted economy cannot persist or advise minimal on WebGPU', () => {
    const first = ladder[0], economy = { ...knobs, ladder: [first, { ...first, vegetationDensity: .5 }] };
    const values: string[] = [], events: { kind: string; suggestedTier?: string }[] = [];
    const c = createQualityController({ ...table, economy }, probe, { governor: { ...fast, windowMs: 5000 }, onTier: e => events.push(e), storage: { getItem: () => null, setItem: (_key, value) => values.push(value) }, earnedAt: () => 123 });
    for (let n = 0; n < 2000; n++) c.step(c.level ? 45 : 60);
    expect(c.level).toBe(1); expect(values.length).toBeGreaterThan(0);
    expect(values.every(value => JSON.parse(value).tier !== 'minimal')).toBe(true);
    expect(events.some(event => event.kind === 'advice' && event.suggestedTier === 'minimal')).toBe(false);
  });
});
