import { describe, expect, test } from 'bun:test';
import { buildLadder, classifyDevice, createQualityController, resolveTier, type DeviceProbe, type TierName } from '@kiln-scenes/scene-kit';
import { farmTiers, vegetationLadder } from '../../src/tiers';

// P-16 / U-15 on the Farm table (SPEC 15) and the M3b live ladder (R5-01).
const phone: DeviceProbe = { backend: 'webgpu', hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 2.8125, screenWidth: 412, screenHeight: 915, coarsePointer: true, mobileUA: true, saveData: false, prefersReducedMotion: false };
const knobsOf = (name: TierName) => resolveTier(farmTiers, name, classifyDevice(phone, farmTiers).device);

describe('P-16 Farm tier table (SPEC 15)', () => {
  test.each([
    ['minimal', .6, .5, 0, false, 'basic', 512, 'simple', false],
    ['economy', .75, .6, .25, true, 'basic', 512, 'full', true],
    ['balanced', 1, .75, .5, true, 'pcf', 1024, 'full', true],
    ['high', 1.5, 1, 1, true, 'pcf', 2048, 'full', true],
  ] as const)('%s', (name, cap, min, grass, shadows, type, mapSize, water, wind) => {
    const k = knobsOf(name);
    expect([k.pixelRatioCap, k.pixelRatioMin, k.vegetationDensity, k.instanceDensity]).toEqual([cap, min, grass, 1]);
    expect(k.shadows).toEqual({ enabled: shadows, type, mapSize, maxCasters: shadows ? 1 : 0 });
    expect(k.drawDistance).toEqual({ far: 250, fogNear: 120, fogFar: 220, lodBias: 1, streamRadiusScale: 1, zoneHops: 1 });
    expect(k.effects).toEqual({ water, wind, ambientAnimation: wind });
  });
  test('OD-10: every tier discards the canvas pass 4x attachments (no viewport-texture node or transmission splits the Farm pass)', () => {
    for (const name of farmTiers.order) expect(knobsOf(name).multisample).toEqual({ discard: true });
  });
  test('classification start tiers: S24+ high, Tab S9 FE minimal on WebGPU (X-07, both adapter spellings), unknown tablet economy, desktop high, mobile WebGL2 minimal', () => {
    const tierOf = (patch: Partial<DeviceProbe>) => classifyDevice({ ...phone, ...patch }, farmTiers).tier;
    expect(tierOf({ adapter: { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: '' } })).toBe('high');
    const tablet = { screenWidth: 1152, screenHeight: 720, devicePixelRatio: 2 };
    expect(tierOf({ ...tablet, adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: '' } })).toBe('minimal');
    expect(tierOf({ ...tablet, adapter: { vendor: 'arm', architecture: 'mali-g68', device: '', description: '' } })).toBe('minimal');
    expect(tierOf({ ...tablet })).toBe('economy');
    expect(tierOf({ coarsePointer: false, mobileUA: false, adapter: { vendor: 'nvidia', architecture: 'ampere', device: '', description: '' } })).toBe('high');
    expect(tierOf({ ...tablet, backend: 'webgl2', adapter: { vendor: 'ARM', architecture: '', device: '', description: 'Mali-G68' } })).toBe('minimal');
  });
});

describe('R5-01 Farm live ladder: grass steps only (Z4, SPEC 8.3 rule 7)', () => {
  test('ladders per tier', () => {
    const grass = (name: TierName) => buildLadder(knobsOf(name)).map(level => level.vegetationDensity);
    expect(grass('high')).toEqual([1, .75, .5, .25]); expect(grass('balanced')).toEqual([.5, .25]);
    expect(grass('economy')).toEqual([.25]); expect(grass('minimal')).toEqual([0]);
    for (const name of farmTiers.order) for (const level of buildLadder(knobsOf(name))) {
      expect(level.pixelRatio).toBe(knobsOf(name).pixelRatioCap);
      expect([level.instanceDensity, level.lodBias, level.streamRadiusScale, level.zoneHops]).toEqual([1, 1, 1, 1]);
    }
    expect(vegetationLadder(1, .8).map(level => level.vegetationDensity)).toEqual([.55, .3]);
  });
  test.each([
    ['economy (tablet, unknown adapter)', undefined, 'economy', ['tablet / unknown GPU']],
    ['minimal (Tab S9 FE on WebGPU, X-07)', { vendor: 'arm', architecture: 'valhall', device: '', description: '' }, 'minimal', ['tablet / mid GPU', 'Mali-G68 class on WebGPU (X-07)']],
  ] as const)('a single-level tier never steps, never advises and never persists a lower tier: %s', (_name, adapter, tier, reasons) => {
    const writes: string[] = [], storage = { getItem: () => null, setItem: (_key: string, value: string) => { writes.push(value); } };
    const events: unknown[] = [];
    const tablet: DeviceProbe = { ...phone, screenWidth: 1152, screenHeight: 720, adapter: adapter && { ...adapter } };
    const quality = createQualityController(farmTiers, tablet, { sceneId: 'farm', storage, onTier: event => events.push(event) });
    expect(quality.tier).toBe(tier);
    // 45 ms is 22 FPS; 60 ms (below 20 FPS) is evaluated as well since FARM-004.
    for (let i = 0; i < 3000; i++) quality.step(i < 1500 ? 45 : 60);
    expect(quality.level).toBe(0); expect(events).toEqual([{ kind: 'initial', tier, reasons: [...reasons], level: 0 }]);
    expect(writes.every(value => JSON.parse(value).tier === tier)).toBe(true);
  });
  test('high on a phone: a sustained 30 ms trace steps grass down once, and the benefit rule reverts it (C-02)', () => {
    const changes: unknown[] = [], quality = createQualityController(farmTiers, { ...phone, adapter: { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: '' } }, { storage: null, onTier: event => changes.push(event) });
    quality.ready(); for (let i = 0; i < 1500; i++) quality.step(30);
    const live = changes.filter((event): event is { kind: 'live'; direction: string; live: { vegetationDensity: number } } => (event as { kind: string }).kind === 'live');
    expect(live.map(event => [event.direction, event.live.vegetationDensity])).toEqual([['down', .75], ['revert', 1]]);
  });
});
