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
test('historical r33 qualification refuses a receipt using the newer D18 scope', () => {
  expect(() => validateMetric({ ...metric(), scope: 'b06-d18', luminancePass: true, lines: { over32: 0, noise: 0, budget: 100, pass: true } })).toThrow(/historical|D18/);
});
test('historical PNG replay preserves only the original luminance fields', async () => {
  const { compareHistoricalStaticImages } = await import('../qualify-farm-static');
  const data = new Uint8Array(1280 * 720 * 4); for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const original = { width: 1280, height: 720, data }, changed = { ...original, data: data.slice() };
  for (let i = 0; i < 101; i++) changed.data[i * 4] = 33;
  const measured = compareHistoricalStaticImages(original, original, changed);
  expect(measured.pass).toBe(true); expect('scope' in measured).toBe(false); expect('lines' in measured).toBe(false); expect('luminancePass' in measured).toBe(false);
  expect(() => validateMetric(measured)).not.toThrow();
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
