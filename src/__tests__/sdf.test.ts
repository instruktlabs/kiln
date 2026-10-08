import { describe, expect, test } from 'bun:test';
import { smoothUnion, smoothUnionSpheres, sphereInside } from '../sdf';

describe('sdf helpers', () => {
  test('sphereInside is positive at the center', () => {
    expect(sphereInside([0, 0, 0], [0, 0, 0], 0.5)).toBe(0.5);
    expect(sphereInside([0.5, 0, 0], [0, 0, 0], 0.5)).toBe(0);
  });

  test('smoothUnion blends between spheres', () => {
    const p: [number, number, number] = [0, 0, 0];
    const a = sphereInside(p, [-0.2, 0, 0], 0.4);
    const b = sphereInside(p, [0.2, 0, 0], 0.4);
    const blended = smoothUnion(a, b, 0.2);
    expect(blended).toBeGreaterThan(Math.max(a, b) - 1e-6);
  });

  test('smoothUnionSpheres matches chained smoothUnion', () => {
    const p: [number, number, number] = [0.1, 0.05, 0];
    const spheres = [
      { center: [0, 0, 0] as [number, number, number], radius: 0.35 },
      { center: [0.25, 0.1, 0] as [number, number, number], radius: 0.25 },
    ];
    const chained = smoothUnion(
      sphereInside(p, spheres[0]!.center, spheres[0]!.radius),
      sphereInside(p, spheres[1]!.center, spheres[1]!.radius),
      0.15,
    );
    expect(smoothUnionSpheres(p, spheres, 0.15)).toBeCloseTo(chained, 6);
  });
});
