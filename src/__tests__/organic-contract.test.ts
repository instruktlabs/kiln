import { expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { geometryDiagnostics, type Point3 } from '../geometry';
import { geometryPrimitives } from '../geometry-catalog';
import {
  catmullRomPath,
  metaballSurface,
  smoothOrganic,
  spiralPath,
  taperedTube,
} from '../organic';

test('spline rejects unsafe derived counts before invoking the curve sampler', () => {
  const sample = spyOn(THREE.CatmullRomCurve3.prototype, 'getPoints').mockImplementation(() => {
    throw new Error('SAMPLER_CALLED');
  });
  try {
    for (const closed of [false, true])
      expect(() =>
        catmullRomPath(
          [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
          ],
          Number.MAX_SAFE_INTEGER,
          closed,
        ),
      ).toThrow('safe integer');
    expect(sample).not.toHaveBeenCalled();
  } finally {
    sample.mockRestore();
  }
});

test('spiral rejects an unsafe derived count before evaluating its first station', () => {
  const cosine = spyOn(Math, 'cos').mockImplementation(() => {
    throw new Error('STATION_CALLED');
  });
  try {
    expect(() =>
      spiralPath({
        center: [0, 0, 0],
        radius: 1,
        rise: 1,
        turns: 1,
        samples: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('safe integer');
    expect(cosine).not.toHaveBeenCalled();
  } finally {
    cosine.mockRestore();
  }
});

test('closed spline validates the temporary repeated endpoint count before reading controls', () => {
  let reads = 0;
  const controls = new Proxy([] as Point3[], {
    get(_target, key) {
      if (key === 'length') return 6361;
      reads++;
      throw new Error('CONTROL_READ');
    },
  });
  // The closed output count is exactly MAX_SAFE_INTEGER; getPoints temporarily
  // creates one additional endpoint before it is removed.
  expect(() => catmullRomPath(controls, 1_416_003_655_831, true)).toThrow('safe integer');
  expect(reads).toBe(0);
});

test('spline supports valid output above the removed 262144-station cap', () => {
  const path = catmullRomPath(
    [
      [0, 0, 0],
      [1, 0, 0],
    ],
    262_144,
  );
  expect(path).toHaveLength(262_145);
  expect(path[0]).toEqual([0, 0, 0]);
  expect(path[131_072]![0]).toBeCloseTo(0.5, 8);
  expect(path.at(-1)).toEqual([1, 0, 0]);
});

test('spiral supports valid output above the removed 262144-station cap', () => {
  const path = spiralPath({ center: [0, 0, 0], radius: 1, rise: 1, turns: 1, samples: 262_144 });
  expect(path).toHaveLength(262_145);
  expect(path[0]).toEqual([0, 0, 1]);
  expect(path.at(-1)![1]).toBeCloseTo(1, 8);
  expect(path.at(-1)![2]).toBeCloseTo(0.42, 8);
});

const budgetSpheres = [
  { center: [0, 0, 0] as Point3, radius: 0.2 },
  { center: [0.2, 0, 0] as Point3, radius: 0.2 },
];
const budgetOptions = {
  bounds: { min: [-0.4, -0.4, -0.4] as Point3, max: [0.6, 0.4, 0.4] as Point3 },
  edgeLength: 0.1,
};

test('metaball inherits the existing implicit grid and evaluation defaults', async () => {
  const geometry = await metaballSurface(budgetSpheres, budgetOptions);
  expect(geometry.userData.kilnImplicit.maxCells).toBe(1_000_000);
  expect(geometry.userData.kilnImplicit.maxEvaluations).toBe(8_000_000);
});

test('metaball passes explicit larger grid and evaluation ceilings through unchanged', async () => {
  const geometry = await metaballSurface(budgetSpheres, {
    ...budgetOptions,
    maxCells: 2_000_000,
    maxEvaluations: 16_000_000,
  });
  expect(geometry.userData.kilnImplicit.maxCells).toBe(2_000_000);
  expect(geometry.userData.kilnImplicit.maxEvaluations).toBe(16_000_000);
  const tighter = await metaballSurface(budgetSpheres, {
    ...budgetOptions,
    maxEvaluations: 50_000,
  });
  expect(tighter.userData.kilnImplicit.maxEvaluations).toBe(50_000);
  expect(geometry.getAttribute('position').array).toEqual(tighter.getAttribute('position').array);
});

test('metaball still enforces caller-selected implicit limits and input validation', async () => {
  await expect(
    metaballSurface(budgetSpheres, { ...budgetOptions, maxEvaluations: 1 }),
  ).rejects.toThrow('maxEvaluations 1');
  await expect(metaballSurface(budgetSpheres, { ...budgetOptions, maxCells: 1 })).rejects.toThrow(
    'exceeds maxCells 1',
  );
  for (const maxEvaluations of [0, Infinity, 1.5])
    await expect(
      metaballSurface(budgetSpheres, { ...budgetOptions, maxEvaluations }),
    ).rejects.toThrow('positive safe integer');
});

test('open spline samples each span and includes both endpoints', () => {
  const controls: Point3[] = [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ];
  const path = catmullRomPath(controls, 8);
  expect(path).toHaveLength(17);
  expect(path[0]).toEqual(controls[0]);
  expect(path.at(-1)).toEqual(controls.at(-1));
});

test('closed spline composes with closed tube without a duplicate endpoint', () => {
  const path = catmullRomPath(
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    4,
    true,
  );
  expect(path).toHaveLength(16);
  expect(path.at(-1)).not.toEqual(path[0]);
  const geometry = taperedTube(
    path,
    path.map(() => 0.08),
    { closed: true },
  );
  const diagnostics = geometryDiagnostics(geometry);
  expect(diagnostics.boundaryEdges).toBe(0);
  expect(diagnostics.degenerateTriangles).toBe(0);
});

test('closed spline requires enough distinct stations for its sweep companion', () => {
  expect(() =>
    catmullRomPath(
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      4,
      true,
    ),
  ).toThrow();
});

test('published catalog tube example executes', () => {
  const example = geometryPrimitives.find((entry) => entry.name === 'taperedTube')!.example;
  const geometry = new Function('catmullRomPath', 'taperedTube', `${example}\nreturn tail;`)(
    catmullRomPath,
    taperedTube,
  );
  expect(geometryDiagnostics(geometry).boundaryEdges).toBe(0);
});

test('maintained organic curve recipe executes', () => {
  const text = readFileSync(
    new URL('../../skills/kiln-author-asset/references/geometry-recipes.md', import.meta.url),
    'utf8',
  );
  const section = text.split('## Organic curves and blended volumes')[1]!;
  const example = section.match(/```js\r?\n([\s\S]*?)```/)![1]!;
  const geometry = new Function(
    'catmullRomPath',
    'taperedTube',
    'smoothOrganic',
    `${example}\nreturn soft;`,
  )(catmullRomPath, taperedTube, smoothOrganic);
  expect(geometryDiagnostics(geometry).boundaryEdges).toBe(0);
});

test('metaball default blend remains the contributed shape default', async () => {
  const spheres = [
    { center: [0, 0, 0] as Point3, radius: 0.2 },
    { center: [0.2, 0, 0] as Point3, radius: 0.2 },
  ];
  const options = {
    bounds: { min: [-0.4, -0.4, -0.4] as Point3, max: [0.6, 0.4, 0.4] as Point3 },
    edgeLength: 0.08,
  };
  const implicitDefault = await metaballSurface(spheres, options);
  const explicitDefault = await metaballSurface(spheres, { ...options, blend: 0.07 });
  expect(implicitDefault.getAttribute('position').array).toEqual(
    explicitDefault.getAttribute('position').array,
  );
  expect(geometryDiagnostics(implicitDefault).boundaryEdges).toBe(0);
});

test('metaball rejects invalid blend even when only one sphere is supplied', async () => {
  await expect(
    metaballSurface([{ center: [0, 0, 0], radius: 0.2 }], {
      bounds: { min: [-0.4, -0.4, -0.4], max: [0.4, 0.4, 0.4] },
      edgeLength: 0.1,
      blend: 0,
    }),
  ).rejects.toThrow();
});

test('spiral rejects nonfinite direction vectors before producing positions', () => {
  expect(() =>
    spiralPath({ center: [0, 0, 0], radius: 1, rise: 1, turns: 1, axis: [0, NaN, 0] }),
  ).toThrow();
  expect(() =>
    spiralPath({ center: [0, 0, 0], radius: 1, rise: 1, turns: 1, forward: [Infinity, 0, 1] }),
  ).toThrow();
});
