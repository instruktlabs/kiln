import { describe, expect, test } from 'bun:test';
import { REVIEW_RIG } from '../src/lib/review-rig';
import { CHART_TOLERANCE_BYTES, compareChart, presetDifferences } from './verify-viewer-rig.mjs';

const measured = [
  { orientation: 'key', patch: 0, roughness: 0.5, name: 'dark skin', rgb: [116, 84, 71] },
  { orientation: 'key', patch: 1, roughness: 1, name: 'light skin', rgb: [200, 150, 130] },
  { orientation: 'up', patch: 0, roughness: 0.5, name: 'dark skin', rgb: [110, 80, 70] },
];
const browser = (rgb: number[][]) => [
  { name: 'key', samples: [{ patch: 0, roughness: 0.5, rgb: rgb[0] }, { patch: 1, roughness: 1, rgb: rgb[1] }] },
  { name: 'up', samples: [{ patch: 0, roughness: 0.5, rgb: rgb[2] }] },
];

describe('comparing the viewer with the rig’s chart measurements', () => {
  test('reports mean, signed mean, maximum and the worst patches per orientation', () => {
    const result = compareChart(measured, browser([[116, 84, 71], [201, 148, 130], [110, 80, 70]]));
    const key = result.groups[0];
    expect(key.group).toBe('key');
    expect(key.patches).toBe(2);
    expect(key.maxAbs).toBe(2);
    expect(key.meanAbs).toBeCloseTo(3 / 6, 10);
    expect(key.meanSigned).toBeCloseTo(-1 / 6, 10);
    expect(key.within[1]).toBeCloseTo(5 / 6, 10);
    expect(key.worst[0]).toMatchObject({ name: 'light skin', delta: [1, -2, 0], worst: 2 });
    expect(result.groups[1].maxAbs).toBe(0);
    expect(result.maxAbs).toBe(2);
  });

  test('refuses a sample the rig never measured instead of ignoring it', () => {
    expect(() => compareChart(measured, [{ name: 'side', samples: [{ patch: 0, roughness: 0.5, rgb: [0, 0, 0] }] }])).toThrow(/no measurement for side patch 0/);
  });

  test('allows only a rounding difference between two GPU drivers', () => {
    expect(CHART_TOLERANCE_BYTES).toBeLessThanOrEqual(2);
  });
});

describe('comparing the viewer’s values with a rig receipt', () => {
  const receipt = () => ({
    id: 'review-neutral-v1',
    exposure: 0.9,
    environment: { type: 'room', sigma: 0.04, intensity: 0.4352 },
    ambient: { type: 'hemisphere', sky: 0xffffff, ground: 0xffffff, intensity: 1.0879 },
    sun: { enabled: false },
    key: { enabled: true, color: 0xffffff, intensity: 0.136, position: [4, 7, 5], castsShadow: false },
    fill: { enabled: true, color: 0xffffff, intensity: 0.0204, position: [-4, 3, 2], castsShadow: false },
    rim: { enabled: true, color: 0xffffff, intensity: 0.0204, position: [-2, 5, -5], castsShadow: false },
    shadows: { enabled: false, type: 'pcf', mapSize: [1024, 1024], bias: 0, normalBias: 0, radius: 1 },
  });

  test('finds nothing when the values are the recorded preset', () => {
    expect(presetDifferences(JSON.parse(JSON.stringify(REVIEW_RIG)), receipt())).toEqual([]);
  });

  test('names each value that differs', () => {
    const changed = receipt();
    changed.key.intensity = 3;
    changed.exposure = 1.38;
    changed.shadows.enabled = true;
    const differences = presetDifferences(JSON.parse(JSON.stringify(REVIEW_RIG)), changed);
    expect(differences).toHaveLength(3);
    expect(differences.join('\n')).toMatch(/exposure: viewer 0.9, receipt 1.38/);
    expect(differences.join('\n')).toMatch(/key: viewer .*"intensity":0.136/);
    expect(differences.join('\n')).toMatch(/shadows: viewer false, receipt true/);
  });
});
