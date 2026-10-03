import { expect, test } from 'bun:test';
import * as drawParity from '../capture-farm-draw-parity';
import * as x02 from '../farm-x02-baseline';
import { sceneBrowserOptions } from '../browser-options.mjs';

const request = { tiers: ['economy', 'high'], views: ['hero', 'dest-tractor'], backend: 'webgpu' };
const complete = () => request.tiers.flatMap(tier => request.views.map(view => ({ tier, view, backend: request.backend, pass: true })));

test('Farm draw parity exits successfully only for complete passing requested cells', () => {
  expect(drawParity.farmDrawParityVerdict(request, complete())).toMatchObject({ pass: true, exitCode: 0, expected: 4, checked: 4 });
  expect(drawParity.farmDrawParityVerdict(request, complete().slice(1))).toMatchObject({ pass: false, exitCode: 1, missing: ['economy/hero/webgpu'] });
  expect(drawParity.farmDrawParityVerdict(request, [...complete(), complete()[0]!])).toMatchObject({ pass: false, exitCode: 1 });
  expect(drawParity.farmDrawParityVerdict(request, complete().map(row => ({ ...row, backend: 'webgl2' })))).toMatchObject({ pass: false, exitCode: 1 });
  expect(drawParity.farmDrawParityVerdict({ ...request, views: [] }, [])).toMatchObject({ pass: false, exitCode: 1 });
});

test('Farm draw parity rejects failed, errored and browser-error rows even if other cells pass', () => {
  for (const patch of [{ pass: false }, { error: 'capture failed' }, { messages: { before: [], repeat: [], after: ['pageerror: failure'] } }]) {
    const rows = complete(); rows[0] = { ...rows[0]!, ...patch };
    expect(drawParity.farmDrawParityVerdict(request, rows)).toMatchObject({ pass: false, exitCode: 1, failed: ['economy/hero/webgpu'] });
  }
  const rows = complete().map(row => ({ ...row, messages: { before: ['warn: THREE.Clock deprecation'], repeat: [], after: [] } }));
  expect(drawParity.farmDrawParityVerdict(request, rows)).toMatchObject({ pass: true, exitCode: 0 });
});

test('Farm X02 records the same resolved headless mode passed to browser launch', () => {
  const headed = sceneBrowserOptions({}, { KILN_SCENE_HEADED: '1', KILN_SCENE_CHROME_ARGS: '["--ozone-platform=x11"]' });
  expect(x02.farmX02BrowserProvenance('Chrome/150.0', headed)).toEqual({ browser: 'headed Chrome/150.0', browserLaunch: { headless: false } });
  const headless = sceneBrowserOptions({}, {});
  expect(x02.farmX02BrowserProvenance('Chrome/150.0', headless)).toEqual({ browser: 'headless Chrome/150.0', browserLaunch: { headless: true } });
});

test('Farm parity can format retained error rows after JSON turns nonfinite metrics into null', () => {
  const failed = { tier: 'economy', view: 'hero', backend: 'webgpu', pass: false, b06: false, error: 'capture failed',
    globalMean: NaN, noiseGlobalMean: Infinity, passingTiles: 0, afterVsBefore: {}, repeatVsBefore: {} };
  const retained = JSON.parse(JSON.stringify(failed));
  expect(retained.globalMean).toBeNull();
  for (const row of [retained, failed, { ...retained, globalMean: undefined, noiseGlobalMean: undefined }]) {
    expect(drawParity.farmDrawParityMarkdownRow(row)).toBe('| webgpu | economy | hero | **NO** | NO | 0/144 | unavailable | unavailable | unavailable / unavailable | unavailable / unavailable | unavailable | - | - | - |');
    expect(drawParity.farmDrawParityVerdict({ tiers: ['economy'], views: ['hero'], backend: 'webgpu' }, [row])).toMatchObject({ pass: false, exitCode: 1 });
  }
  const passed = { ...retained, backend: 'webgl2', pass: true, b06: true, error: undefined, globalMean: 0.0002, noiseGlobalMean: 0,
    passingTiles: 144, afterVsBefore: { over32: 2, differing: 4, max: 34 }, repeatVsBefore: { over32: 0, differing: 0 } };
  expect(drawParity.farmDrawParityMarkdownRow(passed)).toContain('| yes | yes | 144/144 | 2.00e-4 | 0.00e+0 | 2 / 0 | 4 / 0 | 34 |');
});
