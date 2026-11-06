import { expect, test } from 'bun:test';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SkinnedMesh,
} from 'three';
import { measureSurfaceDistance, measureSurfacePairs } from '../surface-distance';

const request = { from: { subject: { name: 'A' } }, to: { subject: { name: 'B' } } };
function pair(a: Mesh, b: Mesh) {
  const root = new Group();
  a.name = 'A';
  b.name = 'B';
  root.add(a, b);
  return root;
}
function triangle(points: number[]) {
  return new Mesh(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3)),
  );
}

test('measures a millimetre surface gap under reflected, nonuniform parent transforms without changing geometry', () => {
  const a = new Mesh(new BoxGeometry(1, 1, 1)),
    b = a.clone();
  b.position.x = 1.001;
  const root = pair(a, b);
  root.rotation.z = 0.71;
  root.scale.set(-2, 3, 0.5);
  root.position.set(5, -8, 12);
  const positions = Array.from(a.geometry.getAttribute('position').array);
  const result = measureSurfaceDistance(root, request);
  expect(result.status).toBe('complete');
  expect(result.distance).toBeCloseTo(0.002, 10);
  expect(result.bounds.lower).toBe(result.distance!);
  expect(result.bounds.upper).toBe(result.distance);
  expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(positions);
  expect(b.position.x).toBe(1.001);
});

test('overlapping bounding boxes do not imply triangle contact; closest points may lie on edges', () => {
  const root = pair(
    triangle([0, 0, 0, 2, 0, 0, 0, 2, 0]),
    triangle([2, 2, 0, 2, 1.1, 0, 1.1, 2, 0]),
  );
  const result = measureSurfaceDistance(root, request);
  expect(result.status).toBe('complete');
  expect(result.distance).toBeCloseTo(1.1 / Math.sqrt(2), 6);
  expect(result.closest?.from.path).toContain('A');
  expect(result.closest?.to.path).toContain('B');
});

test('detects triangle interiors crossing and coplanar contact without claiming solid clearance', () => {
  const a = triangle([-2, -2, 0, 2, -2, 0, 0, 2, 0]);
  for (const points of [
    [0, 0, -1, 0, 0, 1, 0, 1, 1],
    [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
  ]) {
    const result = measureSurfaceDistance(pair(a, triangle(points)), request);
    expect(result.status).toBe('complete');
    expect(result.distance).toBe(0);
    expect(result.limitations).toContain('containment');
  }
  // One closed solid entirely inside another still has a positive surface distance.
  const nested = measureSurfaceDistance(
    pair(new Mesh(new BoxGeometry(4, 4, 4)), new Mesh(new BoxGeometry(1, 1, 1))),
    request,
  );
  expect(nested.distance).toBeCloseTo(1.5, 10);
});

test('accounts for instances and collapsed triangles; rejects ambiguous, shared or absent geometry', () => {
  const a = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
  a.setMatrixAt(0, new Matrix4().makeTranslation(10, 0, 0));
  a.setMatrixAt(1, new Matrix4().makeTranslation(2, 0, 0));
  const root = pair(a, new Mesh(new BoxGeometry(1, 1, 1)));
  expect(measureSurfaceDistance(root, request).distance).toBe(1);
  expect(measureSurfaceDistance(root, request).closest?.from.instance).toBe(1);
  expect(
    measureSurfaceDistance(
      pair(triangle([0, 0, 0, 0, 0, 0, 0, 0, 0]), triangle([1, 0, 0, 1, 1, 0, 1, 0, 1])),
      request,
    ).distance,
  ).toBe(1);
  expect(() => measureSurfaceDistance(root, { ...request, to: request.from })).toThrow(/shared/);
  const duplicate = new Group();
  duplicate.name = 'A';
  root.add(duplicate);
  expect(() => measureSurfaceDistance(root, request)).toThrow(/ambiguous/);
  duplicate.name = 'Empty';
  expect(() =>
    measureSurfaceDistance(root, { ...request, to: { subject: { name: 'Empty' } } }),
  ).toThrow(/no.*triangle/);
  expect(() =>
    measureSurfaceDistance(root, { ...request, from: { ...request.from, point: [0, 0, 0] } }),
  ).toThrow(/point/);
});

test('prunes separated clusters instead of spending the budget enumerating every triangle pair', () => {
  const points = Array.from({ length: 501 }, () => [0, 0, 0, 0, 1, 0, 0, 0, 1]).flat();
  const a = triangle(points),
    b = triangle(points);
  b.position.x = 1;
  const result = measureSurfaceDistance(pair(a, b), request);
  expect(result.status).toBe('complete');
  expect(result.distance).toBe(1);
  expect(result.bounds.lower).toBe(1);
  expect(result.bounds.upper).toBe(1);
  expect(result.pairsVisited).toBeLessThan(100);
});

test('finds contact at the end of both subjects without depending on triangle enumeration order', () => {
  const plane = (x: number) => [x, 0, 0, x, 1, 0, x, 0, 1];
  const a = triangle([...Array.from({ length: 501 }, () => plane(0)).flat(), ...plane(1000)]);
  const b = triangle([...Array.from({ length: 501 }, () => plane(10)).flat(), ...plane(1000)]);
  const result = measureSurfaceDistance(pair(a, b), request);
  expect(result.status).toBe('complete');
  expect(result.distance).toBe(0);
  expect(result.closest?.from.triangle).toBe(501);
  expect(result.closest?.to.triangle).toBe(501);
});

test('hierarchy pruning agrees with exhaustive triangle measurements under transformed and reordered geometry', () => {
  const points = (i: number) => [
    i % 3,
    Math.sin(i),
    i / 10,
    (i % 3) + 0.2,
    Math.sin(i) + 0.7,
    i / 10,
    i % 3,
    Math.sin(i),
    i / 10 + 0.4,
  ];
  for (const offset of [0.05, 2, 8]) {
    const left = Array.from({ length: 9 }, (_, i) => points(i));
    const right = Array.from({ length: 17 }, (_, i) => points(i + 3)).reverse();
    const scene = (a: number[], b: number[]) => {
      const root = pair(triangle(a), triangle(b));
      root.children[1]!.rotation.y = 0.37;
      root.children[1]!.position.set(offset, 0.1, 0.2);
      root.rotation.z = 0.43;
      root.scale.set(-2, 0.7, 3);
      root.position.set(5, 8, -3);
      return root;
    };
    const root = scene(left.flat(), right.flat());
    const actual = measureSurfaceDistance(root, request);
    let expected = Infinity;
    for (const a of left)
      for (const b of right)
        expected = Math.min(expected, measureSurfaceDistance(scene(a, b), request).distance!);
    expect(actual.status).toBe('complete');
    expect(actual.distance).toBeCloseTo(expected, 10);
    expect(measureSurfaceDistance(root, request)).toEqual(actual);
  }
});

test('unprunable work remains incomplete with distance bounds, never a fabricated exact result', () => {
  const a = triangle(Array.from({ length: 501 }, () => [0, 0, 0, 2, 0, 0, 0, 2, 0]).flat());
  const b = triangle(Array.from({ length: 501 }, () => [2, 2, 0, 2, 1, 0, 1, 2, 0]).flat());
  const result = measureSurfaceDistance(pair(a, b), request);
  expect(result.status).toBe('incomplete');
  expect(result.distance).toBeNull();
  expect(result.bounds.lower).toBe(0);
  expect(result.bounds.upper).toBeCloseTo(1 / Math.sqrt(2), 10);
  expect(result.pairsVisited).toBeGreaterThan(0);
  expect(result.pairsVisited).toBeLessThanOrEqual(250_000);
  expect(result.reason).toMatch(/budget/);
  const batch = measureSurfacePairs(pair(a, b), [['/[0]/A[0]', '/[0]/B[0]']]);
  expect(batch.status).toBe('partial');
  expect(batch.results[0]!.measurement).toEqual(result);
  expect(() => measureSurfacePairs(pair(a, b), [])).toThrow('1..12');
}, 60_000); // Exhaustive CPU measurement: 2.0 s in CI, past its old budget at load 20+ on 5 November 2026.

test('unsupported deformation and invalid or excessive geometry fail visibly before reporting a minimum', () => {
  const box = () => new Mesh(new BoxGeometry(1, 1, 1));
  expect(() =>
    measureSurfaceDistance(pair(new SkinnedMesh(new BoxGeometry()), box()), request),
  ).toThrow(/skin/);
  const morph = box();
  morph.geometry.morphAttributes.position = [morph.geometry.getAttribute('position').clone()];
  expect(() => measureSurfaceDistance(pair(morph, box()), request)).toThrow(/morph/);
  const nonfinite = box();
  nonfinite.position.x = NaN;
  expect(() => measureSurfaceDistance(pair(nonfinite, box()), request)).toThrow(/non-finite/);
  const badIndex = box();
  badIndex.geometry.index!.setX(0, 300);
  expect(() => measureSurfaceDistance(pair(badIndex, box()), request)).toThrow(/index/);
  const range = box();
  range.geometry.setDrawRange(1, 3);
  expect(() => measureSurfaceDistance(pair(range, box()), request)).toThrow(/triangle ranges/);
  const instances = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1700);
  expect(() => measureSurfaceDistance(pair(instances, box()), request)).toThrow(/triangle budget/);
  const empty = new Mesh(new BufferGeometry());
  expect(() => measureSurfaceDistance(pair(empty, box()), request)).toThrow(/positions/);
});

// Captured from two separated gripper pads under an exported articulated pose.
// Their coplanar faces make Ray.intersectTriangle return a spurious interior hit.
test('near-coplanar ray arithmetic cannot turn separated faces into contact', () => {
  const faces = [
    [
      0.8770196468891831, 0.35905668581044864, 0.07182866434573713, 0.8763508321834312,
      0.3597858257442866, 0.0638900846264745, 0.8949410432100305, 0.3504808522950901,
      0.06953114051477673,
    ],
    [
      0.8704839594224772, 0.3597858257442866, 0.11970965028074182, 0.8727886824543675,
      0.35905668581044864, 0.1120836019714277, 0.8875360481711247, 0.351209992228928,
      0.12568303551450705,
    ],
  ];
  const meshes = faces.map(
    (points) =>
      new Mesh(
        new BufferGeometry().setAttribute(
          'position',
          new BufferAttribute(new Float64Array(points), 3),
        ),
      ),
  );
  const root = pair(meshes[0]!, meshes[1]!);
  const result = measureSurfaceDistance(root, request);
  expect(result.status).toBe('complete');
  // Independent separating coordinate: all vertices of B lie beyond A in Z.
  const lower =
    Math.min(...faces[1]!.filter((_, i) => i % 3 === 2)) -
    Math.max(...faces[0]!.filter((_, i) => i % 3 === 2));
  expect(lower).toBeGreaterThan(0.04);
  expect(result.distance!).toBeGreaterThanOrEqual(lower);
  const reverse = measureSurfaceDistance(root, { from: request.to, to: request.from });
  expect(reverse.distance).toBeCloseTo(result.distance!, 12);
});
