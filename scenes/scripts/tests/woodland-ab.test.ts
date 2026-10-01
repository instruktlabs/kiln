import { expect, test } from 'bun:test';
import { cropImage, validateWoodlandAb } from '../capture-woodland-ab';

const capture = (safe: boolean) => ({
  png: { width: 1280, height: 720, data: new Uint8Array(0) }, file: safe ? 'safe.png' : 'unsafe.png', diagnostics: [],
  stats: { backend: { backend: 'webgpu' }, camera: { position: [54, 45, 62], target: [0, 0, -2], fov: 45 }, motion: { time: 0, ambient: 0 }, tier: { tier: 'high', level: 0, live: { pixelRatio: 1 } },
    counts: { stage: 'M2a pre-batching', woodlandTrees: 843, woodlandCells: 16, woodlandMeshes: 64, tangentOffenders: safe ? [] : Array.from({ length: 16 }, (_, i) => `Boundary woodland cell-${i} source`) } },
});
test('woodland branch evidence requires actual zero versus16 offenders before packing', () => {
  const safe = capture(true), repeat = capture(true), unsafe = capture(false);
  expect(() => validateWoodlandAb(safe, repeat, unsafe, 'webgpu')).not.toThrow();
  unsafe.stats.counts.tangentOffenders = [];
  expect(() => validateWoodlandAb(safe, repeat, unsafe, 'webgpu')).toThrow(/unsafe.*16/);
  const packed = capture(false); packed.stats.counts.woodlandMeshes = 8;
  expect(() => validateWoodlandAb(safe, repeat, packed, 'webgpu')).toThrow(/64/);
  const changed = capture(false); changed.stats.camera.position[0]++;
  expect(() => validateWoodlandAb(safe, repeat, changed, 'webgpu')).toThrow(/camera/);
});
test('woodland crop preserves exact RGBA rows and rejects bounds or fractional rectangles', () => {
  const source = { width: 4, height: 3, data: Uint8Array.from({ length: 48 }, (_, i) => i) };
  const cropped = cropImage(source, { x: 1, y: 1, width: 2, height: 2 });
  expect([...cropped.data]).toEqual([...source.data.slice(20, 28), ...source.data.slice(36, 44)]);
  expect(() => cropImage(source, { x: 3, y: 1, width: 2, height: 2 })).toThrow(/crop/);
  expect(() => cropImage(source, { x: .5, y: 0, width: 1, height: 1 })).toThrow(/crop/);
});
