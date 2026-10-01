import { expect, test } from 'bun:test';
import { validateMetric, selectStaticResults } from '../qualify-farm-static';

function metric() {
  return { width: 1280, height: 720, globalMean: .001, noiseGlobalMean: 0, passingTiles: 144, passingFraction: 1, pass: true,
    tiles: Array.from({ length: 144 }, (_, i) => ({ x: i % 16, y: Math.floor(i / 16), pixels: 6400, mean: .001, noise: 0, threshold: .02, pass: true })) };
}
test('qualification recomputes fixed thresholds and does not trust a pass label', () => {
  expect(() => validateMetric(metric())).not.toThrow();
  const relaxed = metric(); relaxed.tiles[0]!.threshold = .1;
  expect(() => validateMetric(relaxed)).toThrow(/threshold/);
  const missing = metric(); missing.tiles.pop();
  expect(() => validateMetric(missing)).toThrow(/144/);
  const failed = metric(); failed.globalMean = .03;
  expect(() => validateMetric(failed)).toThrow();
});
test('qualification replaces only window cases and selects the latest attempt even if it failed', () => {
  const views = ['hero', 'house-window-out'];
  const base = views.flatMap(view => ['webgpu', 'webgl2'].map(backend => ({ view, backend, attempt: 1, status: view === 'hero' ? 'pass' : 'fail' })));
  const correction = ['webgpu', 'webgl2'].map(backend => ({ view: 'house-window-out', backend, attempt: 1, status: 'pass' }));
  expect(selectStaticResults(base, correction, views).length).toBe(4);
  expect(() => selectStaticResults(base, [...correction, { ...correction[0]!, attempt: 2, status: 'fail' }], views)).toThrow(/latest/);
  expect(() => selectStaticResults(base, [...correction, { view: 'hero', backend: 'webgpu', attempt: 1, status: 'pass' }], views)).toThrow(/only/);
  expect(() => selectStaticResults(base, correction.slice(0, 1), views)).toThrow(/missing/);
});
