import { expect, it } from 'bun:test';
import * as THREE from 'three';
import { sweepProfile, loftProfiles } from '../sweep';
import { geometryDiagnostics } from '../geometry';
import { boolDiff } from '../solids';
const square: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

it('rejects collapsed corresponding edges without forbidding noncollapsing twists', () => {
  for (const scale of [0.001, 1, 1000]) {
    const profile = square.map(([x, z]) => [x * scale, z * scale] as [number, number]);
    const shifted = [...profile.slice(2), ...profile.slice(0, 2)].map(
      ([x, z]) => [x * 0.5, z * 0.5] as [number, number],
    );
    const before = JSON.stringify([profile, shifted]);
    expect(() =>
      loftProfiles([
        { profile, frame: { origin: [3 * scale, 0, -4 * scale], rotation: [0, 35, 0] } },
        {
          profile: shifted,
          frame: { origin: [3 * scale, -2 * scale, -4 * scale], rotation: [0, 35, 0] },
        },
      ]),
    ).toThrow(/corresponding.*collapse.*intermediate/i);
    expect(JSON.stringify([profile, shifted])).toBe(before);
    const valid = loftProfiles([
      { profile },
      { profile, frame: { origin: [0, 2 * scale, 0], rotation: [0, 150, 0] } },
    ]);
    expect(geometryDiagnostics(valid).boundaryEdges).toBe(0);
    valid.dispose();
  }
  expect(() =>
    sweepProfile(
      square,
      [
        [0, 0, 0],
        [0, 2, 0],
      ],
      { twist: 180 },
    ),
  ).toThrow(/corresponding.*collapse/i);
});
function signedVolume(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'),
    indices = g.index;
  let volume = 0;
  for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, indices ? indices.getX(i) : i);
    const b = new THREE.Vector3().fromBufferAttribute(p, indices ? indices.getX(i + 1) : i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, indices ? indices.getX(i + 2) : i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

it('keeps loft faces outward for either traversal direction in rotated frames', async () => {
  for (const direction of [-1, 1]) {
    const make = (half: number, start: number, end: number, cap = true) =>
      loftProfiles(
        [start, end].map((t) => ({
          profile: square.map(([x, z]) => [x * half, z * half] as [number, number]),
          frame: { origin: [3 - t * direction, 4, 5] as const, rotation: [0, 0, 90] as const },
        })),
        { cap },
      );
    const body = make(1, 0, 2);
    expect(signedVolume(body)).toBeCloseTo(8, 5);
    const open = make(1, 0, 2, false);
    expect(geometryDiagnostics(open).boundaryEdges).toBe(8);
    const p = open.getAttribute('position'),
      n = open.getAttribute('normal');
    // The centerline lies on world Y=4/Z=5; every side normal points away from it.
    for (let i = 0; i < p.count; i++)
      expect((p.getY(i) - 4) * n.getY(i) + (p.getZ(i) - 5) * n.getZ(i)).toBeGreaterThan(0);
    const cavity = make(0.8, -0.1, 2.1);
    const wall = await boolDiff('Wall', new THREE.Mesh(body), new THREE.Mesh(cavity), {
      preserveAttributes: true,
    });
    expect(signedVolume(wall.geometry)).toBeCloseTo(2.88, 4);
    expect(geometryDiagnostics(body)).toMatchObject({
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      orientationConflicts: 0,
    });
    for (const g of [body, open, cavity, wall.geometry]) g.dispose();
  }
});
it('rejects unsupported holes instead of silently filling a JavaScript request', () => {
  const hole = square.map(([x, z]) => [x * 0.5, z * 0.5]);
  const sections = [
    { profile: square },
    { profile: square, frame: { origin: [0, 2, 0] as const } },
  ];
  // Model-authored JavaScript does not get TypeScript's excess-property check.
  const options = { cap: true, holes: [hole] };
  const firstWithHole = { ...sections[0]!, holes: [hole] };
  const lastWithHole = { ...sections[1]!, holes: [hole] };
  expect(() => loftProfiles(sections, options)).toThrow(/holes.*extrudeProfile/);
  expect(() => loftProfiles([firstWithHole, sections[1]!])).toThrow(
    /section 0.*holes.*extrudeProfile/,
  );
  expect(() => loftProfiles([sections[0]!, lastWithHole])).toThrow(
    /section 1.*holes.*extrudeProfile/,
  );
  expect(() =>
    sweepProfile(
      square,
      [
        [0, 0, 0],
        [0, 2, 0],
      ],
      options,
    ),
  ).toThrow(/holes.*extrudeProfile/);
});
it('tight-turn diagnostics use the effective profile scale at each station', () => {
  const path: [number, number, number][] = [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ];
  const warns = (geometry: THREE.BufferGeometry) =>
    geometry.userData.kilnGeometryWarnings.some(
      (warning: { code: string }) => warning.code === 'SWEEP_TIGHT_TURN',
    );
  expect(warns(sweepProfile(square, path, { scale: 0.1 }))).toBe(false);
  const small = square.map(([x, y]) => [x * 0.05, y * 0.05] as [number, number]);
  expect(warns(sweepProfile(small, path))).toBe(false);
  expect(warns(sweepProfile(small, path, { scale: 20 }))).toBe(true);
  expect(
    warns(
      sweepProfile(small, path, {
        scale: [
          [1, 1],
          [20, 1],
          [1, 1],
        ],
      }),
    ),
  ).toBe(true);
  expect(
    warns(
      sweepProfile(small, path, {
        scale: [
          [1, 1],
          [1, 20],
          [1, 1],
        ],
      }),
    ),
  ).toBe(true);
});
it('sweeps a capped profile with predictable bounds, UVs and outward winding', () => {
  const g = sweepProfile(square, [
    [0, 0, 0],
    [0, 2, 0],
  ]);
  expect(g.boundingBox!.min.toArray()).toEqual([-1, 0, -1]);
  expect(g.boundingBox!.max.toArray()).toEqual([1, 2, 1]);
  expect(geometryDiagnostics(g)).toMatchObject({
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
  });
  expect(g.getAttribute('uv').count).toBe(g.getAttribute('position').count);
  let volume = 0;
  const p = g.getAttribute('position'),
    idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i)),
      b = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + 1)),
      c = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + 2));
    volume += a.dot(b.cross(c)) / 6;
  }
  expect(volume).toBeCloseTo(8);
});
it('transports a noncircular profile with twist and variable scale deterministically', () => {
  const path: [number, number, number][] = [
    [0, 0, 0],
    [0, 2, 0],
    [1, 4, 0],
    [1, 6, 1],
  ];
  const a = sweepProfile(square, path, {
    twist: 30,
    scale: [
      [1, 1],
      [1, 0.8],
      [0.8, 0.6],
      [0.5, 0.4],
    ],
  });
  const b = sweepProfile(square, path, {
    twist: 30,
    scale: [
      [1, 1],
      [1, 0.8],
      [0.8, 0.6],
      [0.5, 0.4],
    ],
  });
  expect(a.getAttribute('position').array).toEqual(b.getAttribute('position').array);
  expect(geometryDiagnostics(a).boundaryEdges).toBe(0);
  expect(square).toEqual([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]);
});
const polygon = (sides: number): [number, number][] =>
  Array.from({ length: sides }, (_, i) => [
    Math.cos((i / sides) * Math.PI * 2),
    Math.sin((i / sides) * Math.PI * 2),
  ]);
const straight: [number, number, number][] = [
  [0, 0, 0],
  [0, 2, 0],
];
/** Side-face normals of a sweep along +Y, where profile [x, z] lands on world X/Z. */
function sideFaceNormals(profile: [number, number][]): THREE.Vector3[] {
  return profile.map(([x0, z0], i) => {
    const [x1, z1] = profile[(i + 1) % profile.length]!;
    return new THREE.Vector3(z1 - z0, 0, x0 - x1).normalize();
  });
}
function normalsOf(g: THREE.BufferGeometry): THREE.Vector3[] {
  const n = g.getAttribute('normal');
  return Array.from({ length: n.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(n, i));
}
const alignedWithAny = (normal: THREE.Vector3, faces: THREE.Vector3[]) =>
  faces.some((face) => Math.abs(normal.dot(face)) > 1 - 1e-6);

it('keeps hard profile corners face-aligned and fine profiles smooth by default', () => {
  const rectangle: [number, number][] = [
    [-1, -0.5],
    [1, -0.5],
    [1, 0.5],
    [-1, 0.5],
  ];
  for (const profile of [rectangle, polygon(3), polygon(5)]) {
    const g = sweepProfile(profile, straight, { cap: false });
    const faces = sideFaceNormals(profile);
    for (const normal of normalsOf(g)) expect(alignedWithAny(normal, faces)).toBe(true);
    expect(geometryDiagnostics(g).boundaryEdges).toBe(profile.length * 2);
  }
  for (const sides of [6, 16]) {
    const profile = polygon(sides);
    const g = sweepProfile(profile, straight, { cap: false });
    // Smooth: both panels share each ring vertex (plus the one UV seam copy), so
    // no vertex takes a single face's normal.
    expect(g.getAttribute('position').count).toBe(2 * (sides + 1));
    for (const normal of normalsOf(g))
      expect(alignedWithAny(normal, sideFaceNormals(profile))).toBe(false);
  }
  // The angle is adjustable: 180 smooths the rectangle, 30 creases the hexagon.
  const rounded = sweepProfile(rectangle, straight, { cap: false, creaseAngle: 180 });
  expect(
    normalsOf(rounded).some((normal) => !alignedWithAny(normal, sideFaceNormals(rectangle))),
  ).toBe(true);
  const faceted = sweepProfile(polygon(6), straight, { cap: false, creaseAngle: 30 });
  for (const normal of normalsOf(faceted))
    expect(alignedWithAny(normal, sideFaceNormals(polygon(6)))).toBe(true);
  expect(() => sweepProfile(square, straight, { creaseAngle: 181 })).toThrow(/creaseAngle/);
  expect(() => sweepProfile(square, straight, { creaseAngle: Number.NaN })).toThrow(/creaseAngle/);
});

it('creases a sharp path corner and keeps the closed seam consistent', () => {
  const elbow = (options: { creaseAngle?: number } = {}) =>
    sweepProfile(
      polygon(16),
      [
        [0, 0, 0],
        [0, 3, 0],
        [3, 3, 0],
      ],
      options,
    );
  /** Widest normal split, in degrees, among coincident vertices on the corner mitre. */
  function mitreSplit(g: THREE.BufferGeometry): number {
    const p = g.getAttribute('position'),
      normals = normalsOf(g),
      groups = new Map<string, THREE.Vector3[]>();
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getX(i) + p.getY(i) - 3) > 1e-6 || p.getY(i) < 2) continue;
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join();
      groups.set(key, [...(groups.get(key) ?? []), normals[i]!]);
    }
    expect(groups.size).toBe(16);
    let widest = 0;
    for (const list of groups.values())
      for (const a of list) for (const b of list) widest = Math.max(widest, a.angleTo(b));
    return THREE.MathUtils.radToDeg(widest);
  }
  // A 90 degree corner splits the mitre ring; each copy shades with its own run.
  expect(mitreSplit(elbow())).toBeGreaterThan(45);
  expect(mitreSplit(elbow({ creaseAngle: 180 }))).toBeLessThan(1e-3);
  expect(geometryDiagnostics(elbow())).toMatchObject({
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
  });
  const frame = sweepProfile(
    square.map(([x, z]) => [x * 0.1, z * 0.1] as [number, number]),
    [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2],
    ],
    { closed: true, up: [0, 1, 0] },
  );
  expect(geometryDiagnostics(frame)).toMatchObject({
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
  });
  // Every normal of the mitred square frame is axis-aligned, the closing corner too.
  for (const normal of normalsOf(frame))
    expect(Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z))).toBeGreaterThan(
      1 - 1e-6,
    );
});

it("cap 'start' and 'end' close exactly one end", () => {
  const triangles = (g: THREE.BufferGeometry) => g.index!.count / 3;
  const open = sweepProfile(square, straight, { cap: false });
  const both = sweepProfile(square, straight);
  expect(triangles(both) - triangles(open)).toBe(4);
  for (const [cap, closedY, openY] of [
    ['start', 0, 2],
    ['end', 2, 0],
  ] as const) {
    const g = sweepProfile(square, straight, { cap });
    expect(triangles(g) - triangles(open)).toBe(2);
    const diagnostics = geometryDiagnostics(g);
    expect(diagnostics).toMatchObject({ boundaryEdges: 4, orientationConflicts: 0 });
    // The remaining boundary is the uncapped end.
    const p = g.getAttribute('position');
    const capY = new Set<number>();
    for (let i = open.getAttribute('position').count; i < p.count; i++) capY.add(p.getY(i));
    expect([...capY]).toEqual([closedY]);
    expect(closedY).not.toBe(openY);
  }
  expect(() =>
    sweepProfile(
      square,
      [
        [0, 0, 0],
        [4, 0, 0],
        [0, 0, 4],
      ],
      { closed: true, cap: 'start' },
    ),
  ).toThrow(/cap/);
  expect(() => sweepProfile(square, straight, { cap: 'both' as unknown as boolean })).toThrow(
    /cap/,
  );
});

it('closes a transported loop with matched UV seams', () => {
  const path: [number, number, number][] = Array.from({ length: 16 }, (_, i) => [
    5 * Math.cos((i / 16) * Math.PI * 2),
    0,
    5 * Math.sin((i / 16) * Math.PI * 2),
  ]);
  const g = sweepProfile(square, path, { closed: true, up: [0, 1, 0] });
  expect(geometryDiagnostics(g)).toMatchObject({
    boundaryEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
  });
  expect(() => sweepProfile(square, path, { closed: true, twist: 25 })).toThrow('closed');
});
it('lofts corresponding asymmetric sections in explicit degree-based frames', () => {
  const g = loftProfiles([
    { profile: square, frame: { origin: [0, 0, 0] } },
    {
      profile: [
        [-0.5, -1],
        [1, -0.5],
        [0.7, 0.5],
        [-0.5, 0.7],
      ],
      frame: { origin: [1, 3, 0], rotation: [0, 20, 0] },
    },
  ]);
  expect(geometryDiagnostics(g).boundaryEdges).toBe(0);
  expect(g.boundingBox!.max.y).toBe(3);
  const open = loftProfiles(
    [{ profile: square }, { profile: square, frame: { origin: [0, 2, 0] } }],
    { cap: false },
  );
  expect(geometryDiagnostics(open).boundaryEdges).toBe(8);
});
it('rejects ambiguous topology and diagnoses risky turns without claiming a solid', () => {
  expect(() =>
    sweepProfile(
      [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
      [
        [0, 0, 0],
        [0, 1, 0],
      ],
    ),
  ).toThrow('profile');
  expect(() =>
    sweepProfile(square, [
      [0, 0, 0],
      [0, 0, 0],
    ]),
  ).toThrow('distinct');
  expect(() =>
    sweepProfile(square, [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]),
  ).toThrow('reversal');
  expect(() =>
    loftProfiles([
      { profile: square },
      {
        profile: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      },
    ]),
  ).toThrow('same');
  const tight = sweepProfile(square, [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ]);
  expect(
    tight.userData.kilnGeometryWarnings.some(
      (w: { code: string }) => w.code === 'SWEEP_TIGHT_TURN',
    ),
  ).toBe(true);
});
