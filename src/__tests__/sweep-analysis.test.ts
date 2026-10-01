import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { sweepProfile, loftProfiles } from '../sweep';
import {
  readSweepAnalysis,
  SWEEP_ANALYSIS_MAX_RING_POINTS,
  SWEEP_ANALYSIS_MAX_TESTS,
} from '../sweep-analysis';
import { renderSceneToGLB } from '../render';

const square = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

test('a straight sweep is checked without an unchecked advisory', () => {
  const geometry = sweepProfile(square, [
    [0, 0, 0],
    [0, 3, 0],
    [0, 6, 0],
  ]);
  expect(readSweepAnalysis(geometry)).toMatchObject({ complete: true, findings: [] });
  expect(geometry.userData.kilnGeometryWarnings).toEqual([]);
});

test('tight sweep radius and intersecting consecutive loft rings identify their stations', () => {
  const sweep = sweepProfile(square, [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ]);
  expect(readSweepAnalysis(sweep)?.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ station: 1, kind: 'curvature', radius: expect.any(Number) }),
    ]),
  );
  const loft = loftProfiles([
    { profile: square },
    { profile: square, frame: { origin: [0, 0.25, 0], rotation: [0, 0, 90] } },
  ]);
  expect(readSweepAnalysis(loft)?.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ station: 1, kind: 'rings', otherStation: 0 }),
    ]),
  );
});

test('the export reports sweep findings in observe mode with bounded station evidence', async () => {
  const mesh = new THREE.Mesh(
    sweepProfile(square, [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ]),
    new THREE.MeshStandardMaterial(),
  );
  mesh.name = 'TightPipe';
  const result = await renderSceneToGLB(mesh);
  const findings = Object.values(result.qaReport.dimensions).flatMap((d) => d.findings);
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'SWEEP_SELF_INTERSECTION', disposition: 'observe' }),
    ]),
  );
  expect(result.warnings.join('\n')).not.toContain('SELF_INTERSECTION_UNCHECKED');
});

test('a returning collinear loft has zero curvature radius instead of a straight-path pass', () => {
  const geometry = loftProfiles(
    [0, 2, 0].map((y) => ({ profile: square, frame: { origin: [0, y, 0] as const } })),
  );
  expect(readSweepAnalysis(geometry)?.findings).toContainEqual({
    station: 1,
    kind: 'curvature',
    radius: 0,
    halfExtent: Math.SQRT2,
  });
});

test('ring checks scale with geometry and preserve station evidence far from the origin', () => {
  for (const scale of [1e-4, 1, 1e4]) {
    const profile = square.map(([x, y]) => [x * scale, y * scale] as const);
    const geometry = loftProfiles([
      { profile, frame: { origin: [1e3, 1e3, 1e3] } },
      { profile, frame: { origin: [1e3, 1e3 + 0.25 * scale, 1e3], rotation: [0, 0, 90] } },
    ]);
    expect(readSweepAnalysis(geometry)).toMatchObject({
      complete: true,
      findings: expect.arrayContaining([expect.objectContaining({ station: 1, kind: 'rings' })]),
    });
  }
});

test('oversized profiles explicitly retain the unchecked warning and bounded evidence', async () => {
  const profile = Array.from({ length: SWEEP_ANALYSIS_MAX_RING_POINTS + 1 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / (SWEEP_ANALYSIS_MAX_RING_POINTS + 1);
    return [Math.cos(angle), Math.sin(angle)] as const;
  });
  const geometry = sweepProfile(profile, [
    [0, 0, 0],
    [0, 3, 0],
  ]);
  expect(readSweepAnalysis(geometry)).toMatchObject({ complete: false, tests: 0 });
  expect(readSweepAnalysis(geometry)!.tests).toBeLessThanOrEqual(SWEEP_ANALYSIS_MAX_TESTS);
  expect(geometry.userData.kilnGeometryWarnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'SWEEP_SELF_INTERSECTION_UNCHECKED' }),
    ]),
  );
  const result = await renderSceneToGLB(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  expect(Object.values(result.qaReport.dimensions).flatMap((d) => d.findings)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'SWEEP_SELF_INTERSECTION_PARTIAL', disposition: 'observe' }),
    ]),
  );
});

test('parallel tilted rings stop at the narrow-phase analysis budget', () => {
  const profile = Array.from({ length: 192 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / 192;
    return [Math.cos(angle), Math.sin(angle)] as const;
  });
  const geometry = loftProfiles([
    { profile, frame: { rotation: [0, 0, 45] } },
    { profile, frame: { origin: [-0.07, 0.07, 0], rotation: [0, 0, 45] } },
  ]);
  expect(readSweepAnalysis(geometry)).toMatchObject({
    complete: false,
    tests: SWEEP_ANALYSIS_MAX_TESTS,
    findings: [],
  });
  expect(geometry.userData.kilnGeometryWarnings[0].code).toBe('LOFT_SELF_INTERSECTION_UNCHECKED');
});
