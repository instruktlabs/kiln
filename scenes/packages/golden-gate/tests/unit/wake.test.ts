import { expect, test } from 'bun:test';
import { WAKE, createWaterUniforms, updateWaterUniforms } from '../../src/world/water-material';

// The wake's streak argument at a point, as the shader builds it from the per-frame uniforms (fract omitted).
const u = createWaterUniforms();
function streakArgument(time: number, along: number, across: number): number {
  updateWaterUniforms(u, time, 0, 0);
  const warp = Math.sin((along / WAKE.warpPeriod - u.wakeWarpPhase.value + across / WAKE.warpAcross) * 2 * Math.PI) * WAKE.warp;
  return along / WAKE.period - u.wakePhase.value + across / 9 * .37 + warp;
}
/** Change of a streak argument modulo 1, in [-0.5, 0.5). */
const wrapped = (d: number) => d - Math.round(d);

test('the second period is incommensurate and never folds the streaks', () => {
  expect(WAKE.warpPeriod / WAKE.period).toBeCloseTo((1 + Math.sqrt(5)) / 2, 12);
  // d(argument)/d(along) = 1/period + warp 2 pi / warpPeriod cos(...) stays positive.
  expect(WAKE.warp * 2 * Math.PI * WAKE.period / WAKE.warpPeriod).toBeLessThan(1);
});

test('the streaks advect without jumping when either phase wraps', () => {
  const dt = .01, expected = WAKE.speed * dt / WAKE.period;
  // Every 0.01 s over two minutes (g2 wrapped every 30 s) at points along and across the wake.
  for (const [along, across] of [[0, 0], [60, -12], [240, 20]] as const) {
    for (let t = 0; t < 120; t += dt) {
      const step = wrapped(streakArgument(t + dt, along, across) - streakArgument(t, along, across));
      // Pure advection moves the argument by -speed dt / period; the warp adds at most its own advection.
      expect(Math.abs(step + expected)).toBeLessThan(WAKE.warp * 2 * Math.PI * WAKE.speed * dt / WAKE.warpPeriod + 1e-9);
    }
  }
});

test('the streak contrast fades with the view elevation between 14.5 and 40.5 degrees', () => {
  const degrees = (s: number) => Math.asin(s) * 180 / Math.PI;
  expect(degrees(WAKE.elevation[0])).toBeCloseTo(14.5, 0);
  expect(degrees(WAKE.elevation[1])).toBeCloseTo(40.5, 0);
});
