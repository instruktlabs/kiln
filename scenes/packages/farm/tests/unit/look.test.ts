import { describe, expect, test } from 'bun:test';
import { acesGrey, FARM_LOOK_DEFAULT, FARM_LOOK_PRESETS, formatFarmLook, lookExposure, matchedNeutralExposure, needsPipeline, neutralGrey, parseFarmLook, resolveFarmLook } from '../../src/look/options';
import { FARM_LOOK } from '../../src/constants';

// M3 look exploration (PLAN.md 1.1, D-18, D-20): dev-only options; the default stays today's look.
describe('Farm look options', () => {
  test('the default is today\'s look: MSAA, ACES at .95, no effects, no render pipeline', () => {
    expect(FARM_LOOK_DEFAULT).toEqual({ aa: 'msaa', ao: false, bloom: false, vignette: false, grading: false, tone: 'aces' });
    expect(needsPipeline(FARM_LOOK_DEFAULT)).toBe(false); expect(lookExposure(FARM_LOOK_DEFAULT)).toBe(FARM_LOOK.exposure);
    expect(parseFarmLook(null)).toEqual(FARM_LOOK_DEFAULT); expect(parseFarmLook('default')).toEqual(FARM_LOOK_DEFAULT); expect(formatFarmLook(FARM_LOOK_DEFAULT)).toBe('default');
  });
  test('every other preset needs a pipeline and round-trips through its name', () => {
    for (const [name, patch] of Object.entries(FARM_LOOK_PRESETS)) {
      const look = parseFarmLook(name); expect(look).toEqual({ ...FARM_LOOK_DEFAULT, ...patch });
      expect(needsPipeline(look)).toBe(name !== 'default'); expect(parseFarmLook(formatFarmLook(look))).toEqual(look);
    }
  });
  test('comma lists combine options; unknown words and bad exposures throw', () => {
    expect(parseFarmLook('fxaa,ao,bloom')).toEqual({ ...FARM_LOOK_DEFAULT, aa: 'fxaa', ao: true, bloom: true });
    expect(parseFarmLook('neutral,exposure=1.2')).toEqual({ ...FARM_LOOK_DEFAULT, tone: 'neutral', exposure: 1.2 });
    for (const bad of ['cel', 'exposure=0', 'exposure=x', 'fxaa=1']) expect(() => parseFarmLook(bad)).toThrow();
  });
  test('ambient occlusion is off on the tablet tiers (economy, minimal) and kept on balanced and high', () => {
    const all = parseFarmLook('all');
    for (const tier of ['economy', 'minimal'] as const) { const r = resolveFarmLook(all, tier); expect(r.look.ao).toBe(false); expect(r.disabled).toEqual([`ao (off on the ${tier} tier)`]); expect(r.look.bloom).toBe(true); }
    for (const tier of ['balanced', 'high'] as const) expect(resolveFarmLook(all, tier)).toEqual({ look: all, disabled: [] });
  });
  test('D-18 matched exposure: Neutral maps 18% grey to the same display value as ACES at .95', () => {
    const exposure = matchedNeutralExposure();
    expect(Math.abs(neutralGrey(.18, exposure) - acesGrey(.18, FARM_LOOK.exposure))).toBeLessThan(1e-4);
    expect(exposure).toBeCloseTo(1.3316, 3); expect(lookExposure({ tone: 'neutral' })).toBe(exposure); expect(lookExposure({ tone: 'neutral', exposure: 1 })).toBe(1);
    // Both curves rise monotonically over the scene range, so the match is unique.
    for (let x = .01; x < 2; x += .01) { expect(acesGrey(x + .01, 1)).toBeGreaterThan(acesGrey(x, 1)); expect(neutralGrey(x + .01, 1)).toBeGreaterThanOrEqual(neutralGrey(x, 1)); }
  });
});
