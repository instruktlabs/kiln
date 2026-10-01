// Tier selection end to end through the kit: the kit's device probe values -> classifyDevice -> the
// Golden Gate tier table -> feature level and knobs. SCENE-TASK "Performance and tiers": minimal and
// economy are Low, balanced is Medium, high is High, and `high` on a phone returns Medium, so a
// Galaxy S24+ class phone (which the kit starts on `high`) lands on Medium. The owner's Galaxy Tab S9 FE
// uses the probe values read on the device itself (tests/tools/tablet-check.ts, 2026-09-29).
import { describe, expect, test } from 'bun:test';
import { classifyDevice, resolveTier } from '@kiln-scenes/scene-kit';
import type { DeviceProbe, TierName } from '@kiln-scenes/scene-kit';
import { goldenGateTiers } from '../../src/tiers';
import type { GoldenGateKnobs } from '../../src/tiers';

const base: DeviceProbe = { backend: 'webgpu', hardwareConcurrency: 8, devicePixelRatio: 1, screenWidth: 1920, screenHeight: 1080, coarsePointer: false, mobileUA: false, saveData: false, prefersReducedMotion: false };
/** Galaxy S24+ (SM-S926U, Snapdragon 8 Gen 3): 1440 x 3120 at a device pixel ratio of 3.75, Chrome's WebGPU adapter info (vendor and architecture only). */
const s24plus: DeviceProbe = { ...base, adapter: { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: '' }, devicePixelRatio: 3.75, screenWidth: 384, screenHeight: 832, coarsePointer: true, mobileUA: true, hardwareConcurrency: 8 };
/** Galaxy Tab S9 FE 5G (SM-X518U, Exynos 1380 with Mali-G68), as read on the device in Chrome 154: WebGPU adapter info arm / valhall, 823 x 1317 CSS at 1.75. */
const tabS9fe: DeviceProbe = { ...base, adapter: { vendor: 'arm', architecture: 'valhall', device: '', description: '' }, devicePixelRatio: 1.75, screenWidth: 823, screenHeight: 1317, coarsePointer: true, mobileUA: true };
/** This PC (RTX 3070) and the hub (GTX 1660 Ti Max-Q). */
const rtx3070: DeviceProbe = { ...base, adapter: { vendor: 'nvidia', architecture: 'ampere', device: '', description: '' }, hardwareConcurrency: 16, deviceMemory: 8 };
const hub: DeviceProbe = { ...base, adapter: { vendor: 'nvidia', architecture: 'turing', device: '', description: '' }, hardwareConcurrency: 12, deviceMemory: 8 };

function select(probe: DeviceProbe, quality?: TierName) {
  const { tier, device, reasons } = classifyDevice(probe, goldenGateTiers, quality ? { quality } : {});
  return { tier, device, reasons, knobs: resolveTier<GoldenGateKnobs>(goldenGateTiers, tier, device) };
}

describe('tier selection through the kit', () => {
  test('a Galaxy S24+ starts on high and lands on the Medium feature set, portrait or landscape', () => {
    for (const probe of [s24plus, { ...s24plus, screenWidth: 832, screenHeight: 384 }]) {
      const s = select(probe);
      expect(s.device).toMatchObject({ form: 'phone', gpu: 'high', backend: 'webgpu' });
      expect(s.tier).toBe('high');
      expect(s.knobs.gg.feature).toBe('medium');
      expect(s.knobs.gg.terrainSet).toBe('medium');
      expect(s.knobs.shadows.enabled).toBe(false);
      expect(s.knobs.gg.traffic.contactShadow).toBeGreaterThan(0);
      expect(s.knobs.gg.water.reflection).toBe('environment');
      // The phone keeps the high tier's pixel-ratio range: 1 to 1.5 of its 3.75.
      expect([s.knobs.pixelRatioMin, s.knobs.pixelRatioCap]).toEqual([1, 1.5]);
    }
  });
  test('the same phone on WebGL2 starts on minimal (D-03) and with Save-Data one tier lower', () => {
    const gl = select({ ...s24plus, backend: 'webgl2' });
    expect(gl.tier).toBe('minimal'); expect(gl.knobs.gg.feature).toBe('low');
    const saver = select({ ...s24plus, saveData: true });
    expect(saver.tier).toBe('balanced'); expect(saver.knobs.gg.feature).toBe('medium');
  });
  // The kit's X-07 rule (owner decision 2026-09-29 22:10, packages/scene-kit/src/quality/core.ts): the Mali-G68
  // class takes the minimal tier on WebGPU too. Golden Gate's own tablet run (PERFORMANCE.md "Tablet (X-07)")
  // passed on economy before that rule; minimal keeps the Low feature set at a lower pixel ratio.
  test('the Galaxy Tab S9 FE (Mali-G68) starts on minimal with the Low feature set (kit X-07), as on WebGL2', () => {
    for (const probe of [tabS9fe, { ...tabS9fe, screenWidth: 1317, screenHeight: 823 }]) {
      const s = select(probe);
      expect(s.device).toMatchObject({ form: 'tablet', gpu: 'mid', backend: 'webgpu' });
      expect(s.tier).toBe('minimal');
      expect(s.knobs.gg.feature).toBe('low');
      expect(s.knobs.shadows.enabled).toBe(false);
      expect(s.knobs.gg.traffic.contactShadow).toBeGreaterThan(0);
      expect([s.knobs.pixelRatioMin, s.knobs.pixelRatioCap]).toEqual([0.6, 0.75]);
      // An explicit economy still gives the tier the tablet run passed on.
      const economy = select(probe, 'economy');
      expect(economy.knobs.gg.feature).toBe('low'); expect([economy.knobs.pixelRatioMin, economy.knobs.pixelRatioCap]).toEqual([0.75, 1]);
    }
    const gl = select({ ...tabS9fe, backend: 'webgl2' });
    expect(gl.tier).toBe('minimal'); expect(gl.knobs.gg.feature).toBe('low');
  });
  test('desktops start on high with one shadow cascade; a four-core desktop on balanced', () => {
    for (const probe of [rtx3070, hub]) {
      const s = select(probe);
      expect(s.tier).toBe('high'); expect(s.knobs.gg.feature).toBe('high');
      expect(s.knobs.shadows).toMatchObject({ enabled: true, maxCasters: 1 });
      expect(s.knobs.gg.water.reflection).toBe('planar');
    }
    const small = select({ ...rtx3070, hardwareConcurrency: 4 });
    expect(small.tier).toBe('balanced'); expect(small.knobs.gg.feature).toBe('medium');
  });
  test('an explicit quality override maps minimal and economy to Low, balanced to Medium and high to High', () => {
    const expected: Record<TierName, string> = { minimal: 'low', economy: 'low', balanced: 'medium', high: 'high' };
    for (const [tier, feature] of Object.entries(expected) as [TierName, string][]) {
      expect(select(rtx3070, tier).knobs.gg.feature).toBe(feature);
      // On a phone, high is Medium; the other tiers are the same as on a desktop.
      expect(select(s24plus, tier).knobs.gg.feature).toBe(tier === 'high' ? 'medium' : feature);
    }
  });
  test('every knob SCENE-TASK names varies by tier', () => {
    const [high, medium, low] = (['high', 'balanced', 'economy'] as const).map(t => select(rtx3070, t).knobs);
    const differ = (pick: (k: GoldenGateKnobs) => unknown) => new Set([high, medium, low].map(k => JSON.stringify(pick(k!)))).size > 1;
    expect(differ(k => k.gg.terrainSet)).toBe(true);           // terrain rings and levels of detail
    expect(differ(k => k.gg.water)).toBe(true);                // water features
    expect(differ(k => k.gg.water.reflection)).toBe(true);     // reflection on or off
    expect(differ(k => k.gg.traffic.density)).toBe(true);      // traffic density
    expect(differ(k => k.gg.traffic.lod)).toBe(true);          // vehicle LOD distances
    expect(differ(k => k.gg.fogBanks)).toBe(true);             // fog banks
    expect(differ(k => k.shadows.enabled)).toBe(true);         // one cascade at High, contact shadows elsewhere
    expect(differ(k => k.pixelRatioCap)).toBe(true);           // pixel ratio
  });
  test('Low fades its per-pixel waves with view distance; High and Medium keep the accepted water', () => {
    // SCENE-REVIEW-1 item 2: the Low waves banded across the bay at mid distance. The fade adds no pass,
    // texture or wave; High and Medium (accepted) carry no fade.
    const [high, medium, low, minimal] = (['high', 'balanced', 'economy', 'minimal'] as const).map(t => select(rtx3070, t).knobs.gg.water);
    expect(high!.waveFade).toBeUndefined();
    expect(medium!.waveFade).toBeUndefined();
    for (const w of [low!, minimal!]) {
      const [start, end] = w.waveFade!;
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      expect(w.fragmentWaves).toBe(4);
    }
  });
});
