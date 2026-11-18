/**
 * Guards the phase attribution behind docs/reviews/2026-11-18-engine-profile.md: a sample's
 * self time lands in the phase window that contains it, samples outside every window are
 * dropped, and report frames never carry the machine's checkout path.
 */
import { expect, test } from 'bun:test';
import { attributePhases, shortUrl, type CpuProfile } from './cpuprofile-phases';
import { median, phaseShares } from './profile-engine';

const frame = (id: number, functionName: string, url = '', lineNumber = 0) => ({
  id,
  callFrame: { functionName, url, lineNumber },
});

// Samples at 1000, 1010, 1020, 1030, 1040 us; the profile ends at 1050.
const profile: CpuProfile = {
  nodes: [
    frame(1, '(root)'),
    frame(2, 'evaluate', 'file:///home/someone/kiln/src/render.ts', 9),
    frame(3, 'rasterize', 'file:///home/someone/kiln/src/views/raster.ts', 41),
    frame(4, 'parse', 'file:///home/someone/kiln/node_modules/three/build/three.module.js', 99),
  ],
  startTime: 990,
  endTime: 1050,
  samples: [2, 2, 4, 3, 3],
  timeDeltas: [10, 10, 10, 10, 10],
};

test('attributes self time to the containing phase window', () => {
  const result = attributePhases(profile, [
    { phase: 'raster', asset: 'a', run: 1, startUs: 1030, endUs: 1050 },
    { phase: 'build', asset: 'a', run: 1, startUs: 1000, endUs: 1020 },
  ]);
  expect(result.map((p) => p.phase)).toEqual(['build', 'raster']);
  const [build, raster] = result;
  // The sample at 1020 falls between windows and is dropped.
  expect(build!.sampledMs).toBeCloseTo(0.02);
  expect(build!.top).toEqual([{ frame: 'evaluate (src/render.ts:10)', selfMs: 0.02, share: 1 }]);
  expect(raster!.sampledMs).toBeCloseTo(0.02);
  expect(raster!.top[0]!.frame).toBe('rasterize (src/views/raster.ts:42)');
});

test('merges repeated windows of one phase and orders frames by self time', () => {
  const result = attributePhases(profile, [
    { phase: 'build', asset: 'a', run: 1, startUs: 1000, endUs: 1015 },
    { phase: 'build', asset: 'a', run: 2, startUs: 1020, endUs: 1050 },
  ]);
  expect(result).toHaveLength(1);
  // Ties are ordered by name so the report is stable.
  expect(result[0]!.top.map((h) => [h.frame.split(' ')[0], h.selfMs])).toEqual([
    ['evaluate', 0.02],
    ['rasterize', 0.02],
    ['parse', 0.01],
  ]);
  expect(result[0]!.sampledMs).toBeCloseTo(0.05);
  expect(result[0]!.modules.map((m) => [m.frame, m.selfMs])).toEqual([
    ['src/render.ts', 0.02],
    ['src/views/raster.ts', 0.02],
    ['node_modules/three/build/three.module.js', 0.01],
  ]);
});

test('separates the evaluated program from built-ins', () => {
  const evaluated: CpuProfile = {
    nodes: [frame(1, 'bakeLight', '', 4410), frame(2, 'hypot', '', -1), frame(3, 'every', '', 0)],
    startTime: 0,
    endTime: 40,
    samples: [1, 1, 2, 3],
    timeDeltas: [0, 10, 10, 10],
  };
  const [build] = attributePhases(evaluated, [
    { phase: 'build', asset: 'a', run: 1, startUs: 0, endUs: 40 },
  ]);
  expect(build!.top.map((h) => h.frame)).toEqual(['bakeLight (evaluated:4411)', 'every', 'hypot']);
  expect(build!.modules.map((m) => m.frame)).toEqual(['(evaluated program)', '(native)']);
});

test('report frames name the module, not the checkout', () => {
  expect(shortUrl('file:///home/someone/kiln/node_modules/three/build/three.module.js')).toBe(
    'node_modules/three/build/three.module.js',
  );
  expect(shortUrl('C:\\Users\\someone\\kiln\\src\\qa\\flush-faces.ts')).toBe(
    'src/qa/flush-faces.ts',
  );
  expect(shortUrl('/tmp/other.js')).toBe('other.js');
});

test('phase shares split the real path into the four phases and a remainder', () => {
  expect(median([5, 1, 3])).toBe(3);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  const s = phaseShares({
    build: 100,
    flush: 10,
    penetration: 5,
    rules: 5,
    khronos: 20,
    final: 10,
    export: 40,
    pipeline: 200,
    raster: 300,
  });
  expect(s).toEqual({
    build: 100,
    qa: 50,
    flush: 10,
    export: 40,
    raster: 300,
    other: 10,
    total: 500,
  });
});
