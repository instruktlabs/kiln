import { expect, test } from 'bun:test';
import {
  boxGeo,
  sphereGeo,
  cylinderGeo,
  capsuleGeo,
  coneGeo,
  torusGeo,
  planeGeo,
  cylinderOnAxis,
  taperConeGeo,
  decalBox,
  buildSandboxGlobals,
} from '../primitives';

test('basic primitives reject nonfinite or negative dimensions with named causes', () => {
  for (const bad of [NaN, Infinity, -1, 1e40]) {
    for (const create of [
      () => boxGeo(bad, 1, 1),
      () => sphereGeo(bad),
      () => cylinderGeo(bad, 1, 1),
      () => capsuleGeo(1, bad),
      () => coneGeo(1, bad),
      () => torusGeo(1, bad),
      () => planeGeo(1, bad),
      () => decalBox(1, 1, bad),
    ])
      expect(create).toThrow(
        /boxGeo|sphereGeo|cylinderGeo|capsuleGeo|coneGeo|torusGeo|planeGeo|decalBox/,
      );
  }
});

test('segment counts are bounded integers and grid products are checked before construction', () => {
  for (const bad of [0, 1.5, NaN, Infinity, 4097]) {
    for (const create of [
      () => cylinderGeo(1, 1, 1, bad),
      () => capsuleGeo(1, 1, bad),
      () => coneGeo(1, 1, bad),
      () => sphereGeo(1, bad, 3),
      () => planeGeo(1, 1, bad, 1),
      () => torusGeo(1, 0.2, bad, 3),
    ])
      expect(create).toThrow(/segments|Segments/);
  }
  for (const create of [
    () => sphereGeo(1, 1024, 1024),
    () => planeGeo(1, 1, 1024, 1024),
    () => torusGeo(1, 0.2, 1024, 1024),
  ])
    expect(create).toThrow(/262144|262,144/);
});

test('intentional cone tips, zero middle capsule length and open planes remain valid', () => {
  expect(cylinderGeo(0, 1, 2).getAttribute('position').count).toBeGreaterThan(0);
  expect(cylinderGeo(1, 0, 2).getAttribute('position').count).toBeGreaterThan(0);
  expect(capsuleGeo(1, 0).getAttribute('position').count).toBeGreaterThan(0);
  expect(planeGeo(1, 1).index!.count).toBe(6);
  expect(() => cylinderGeo(0, 0, 1)).toThrow(/radius/);
  expect(() => boxGeo(1, 0, 1)).toThrow(/planeGeo/);
});

test('oriented cylinders reject invalid frames and axes instead of emitting invalid vertices', () => {
  expect(() => cylinderOnAxis([NaN, 0, 0], [0, 1, 0], 1, 1)).toThrow(/center/);
  expect(() => cylinderOnAxis([0, 0, 0], [0, Infinity, 0], 1, 1)).toThrow(/normal/);
  expect(() => cylinderOnAxis([0, 0, 0], [0, 0, 0], 1, 1)).toThrow(/normal/);
  expect(() => taperConeGeo(1, 0, 1, 'bad' as 'x')).toThrow(/axis/);
  const hugeNormal = cylinderOnAxis([0, 0, 0], [Number.MAX_VALUE, Number.MAX_VALUE, 0], 1, 1);
  expect([...hugeNormal.getAttribute('position').array].every(Number.isFinite)).toBe(true);
  hugeNormal.computeBoundingBox();
  expect(hugeNormal.boundingBox!.max.x).toBeGreaterThan(1);
});

test('invalid sandbox inputs fail before cached construction', () => {
  const globals = buildSandboxGlobals() as unknown as { boxGeo: typeof boxGeo };
  expect(() => globals.boxGeo(NaN, 1, 1)).toThrow(/boxGeo/);
  expect(() => globals.boxGeo(null as unknown as number, 1, 1)).toThrow(/boxGeo/);
  expect(globals.boxGeo(1, 1, 1).getAttribute('position').count).toBe(24);
});

test('torusGeo rejects a tube at least as thick as the ring radius, naming both values', () => {
  // The tube would cross the ring axis and the surface would intersect itself.
  expect(() => torusGeo(0.2, 0.5)).toThrow(/torusGeo.*tube 0\.5.*radius 0\.2/s);
  expect(() => torusGeo(0.3, 0.3)).toThrow(/tube 0\.3.*radius 0\.3/s);
  // A thick but valid ring still builds, and its geometry is untouched.
  const thick = torusGeo(0.5, 0.49, 8, 12);
  expect(thick.getAttribute('position').count).toBe(117);
  expect(torusGeo(0.4, 0.04, 8, 16).getAttribute('position').count).toBe(153);
});
