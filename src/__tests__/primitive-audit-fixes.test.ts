/**
 * Fixes for the defects measured by the primitives audit
 * (docs/reviews/2026-11-18-primitives-audit.md, `scripts/audit-primitives.ts`).
 * Each block reproduces the audit's measurement for one issue.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  capsuleGeo,
  capsuleXGeo,
  capsuleYGeo,
  capsuleZGeo,
  countTriangles,
  createPart,
  createStairs,
  createWingPair,
  room,
  wingGeo,
  type WingGeometryOptions,
} from '../primitives';
import { geometryDiagnostics } from '../geometry';
import { analyzeFlushFaces } from '../qa/flush-faces';

/** A material with a texture: the flush-face check reports every depth tie between its faces. */
function textured(): THREE.Material {
  const texture = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) found.push(node as THREE.Mesh);
  });
  return found;
}

function bounds(object: THREE.Object3D): number[] {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return [...box.min.toArray(), ...box.max.toArray()].map((v) => Math.round(v * 1e6) / 1e6 + 0);
}

describe('createStairs risers stop under their treads (#403)', () => {
  test('an ascending flight with a textured material has no flush pair, and its bounds stay put', () => {
    const { root } = createStairs('S', textured(), { totalRise: 2, totalRun: 3, width: 1 });
    const report = analyzeFlushFaces(root);
    expect(report.pairs.map((pair) => pair.parts.join(' / '))).toEqual([]);
    expect(bounds(root)).toEqual([0, 0, -0.5, 3, 2, 0.5]);
    expect(meshes(root)).toHaveLength(16);
  });

  test('a single step reports no shared area, and each riser ends at its tread underside', () => {
    const { root } = createStairs('S', textured(), {
      steps: 1,
      totalRise: 0.2,
      totalRun: 0.3,
      width: 1,
    });
    expect(analyzeFlushFaces(root).pairs).toEqual([]);
    const riser = root.getObjectByName('Mesh_SRiser1')!;
    const tread = root.getObjectByName('Mesh_SStep1')!;
    const [, riserMinY, , , riserMaxY] = bounds(riser);
    const [, treadMinY] = bounds(tread);
    expect(riserMinY).toBe(0);
    expect(riserMaxY).toBeCloseTo(treadMinY!, 6);
    expect(bounds(root)).toEqual([0, 0, -0.5, 0.3, 0.2, 0.5]);
  });

  test('a step rise at or below treadThickness builds treads only', () => {
    for (const totalRise of [0.8, 0.4]) {
      const { root, steps } = createStairs('S', textured(), {
        steps: 10,
        totalRise,
        totalRun: 3,
        width: 1,
      });
      expect(steps).toHaveLength(10);
      expect(meshes(root).filter((mesh) => mesh.name.includes('Riser')).length).toBe(0);
      expect(analyzeFlushFaces(root).pairs.length).toBe(0);
    }
    // 0.54 / 9 - 0.06 rounds to 7e-18 above zero: no sliver riser either.
    const { root } = createStairs('S', textured(), {
      steps: 9,
      totalRise: 0.54,
      totalRun: 3,
      width: 1,
      treadThickness: 0.06,
    });
    expect(meshes(root).filter((mesh) => mesh.name.includes('Riser')).length).toBe(0);
  });

  test('descending flights and riser: false keep their full-height layout', () => {
    const down = createStairs('S', textured(), {
      totalRise: -2,
      totalRun: -3,
      width: 1,
      axis: 'z',
    }).root;
    const riser = down.getObjectByName('Mesh_SRiser1')!;
    const [, minY, , , maxY] = bounds(riser);
    expect(maxY! - minY!).toBeCloseTo(0.25, 6);
    expect(analyzeFlushFaces(down).pairs).toEqual([]);
    const plain = createStairs('S', textured(), {
      totalRise: 2,
      totalRun: 3,
      width: 1,
      riser: false,
    }).root;
    expect(meshes(plain)).toHaveLength(8);
  });
});

describe('room walls meet at the corners without overlap or notch (#404)', () => {
  const wallBoxes = (root: THREE.Object3D): THREE.Box3[] => {
    root.updateMatrixWorld(true);
    return meshes(root)
      .filter((mesh) => mesh.name.includes('_Wall'))
      .map((mesh) => new THREE.Box3().setFromObject(mesh));
  };
  const cover = (boxes: THREE.Box3[], x: number, y: number, z: number) =>
    boxes.filter((box) => box.containsPoint(new THREE.Vector3(x, y, z))).length;

  test('a textured room at defaults reports no flush pair', () => {
    const { root } = room('R', textured());
    expect(analyzeFlushFaces(root).pairs.map((pair) => pair.parts.join(' / '))).toEqual([]);
  });

  test('a thick-walled room with a side window reports no flush pair', () => {
    const { root } = room('R', textured(), {
      width: 6,
      depth: 3,
      wallThickness: 0.4,
      openings: [
        { wall: 'front', kind: 'door' },
        { wall: 'left', kind: 'window', width: 1, height: 1, sill: 1 },
      ],
    });
    expect(analyzeFlushFaces(root).pairs.map((pair) => pair.parts.join(' / '))).toEqual([]);
  });

  test('every corner is covered once for the full height, and the footprint stays put', () => {
    const t = 0.15;
    const { root } = room('R', textured(), { floor: false, openings: [] });
    const boxes = wallBoxes(root);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      for (const y of [0.01, 1.4, 2.79]) {
        // Outer corner square (was a notch) and inner overlap square (was covered twice).
        expect(cover(boxes, sx * (2 + t / 4), y, sz * (2 + t / 4))).toBe(1);
        expect(cover(boxes, sx * (2 - t / 4), y, sz * (2 - t / 4))).toBe(1);
      }
    }
    // Outer footprint (depth + t) x (width + t); interior depth - t by width - t.
    expect(bounds(root)).toEqual([-2.075, 0, -2.075, 2.075, 2.8, 2.075]);
    const { walls } = room('R', textured(), { width: 5, depth: 4, openings: [] });
    expect(bounds(walls.front)).toEqual([1.925, 0, -2.575, 2.075, 2.8, 2.575]);
    expect(bounds(walls.left)).toEqual([-1.925, 0, -2.575, 1.925, 2.8, -2.425]);
  });

  test('side-wall openings are checked against the shorter side walls', () => {
    const near = (offset: number) => () =>
      room('R', textured(), {
        openings: [{ wall: 'left', kind: 'window', offset, width: 1 }],
      });
    // The left wall now runs 3.85 between the front and back walls: its ends are at +/-1.925.
    expect(near(1.4)).not.toThrow();
    expect(near(1.45)).toThrow(/left wall.*3\.85/);
    expect(near(-1.45)).toThrow(/left wall.*3\.85/);
    expect(() => room('R', textured(), { depth: 0.15 })).toThrow(/wallThickness.*less than depth/);
  });
});

describe('wing flat faces keep their own vertices and normals (#405)', () => {
  /** Largest angle between a stored vertex normal and its triangle's winding normal. */
  function normalFacts(geometry: THREE.BufferGeometry) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;
    const [a, b, c, face, n] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
    let maxDeg = 0;
    let opposed = 0;
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      a!.fromBufferAttribute(position, corners[0]!);
      b!.fromBufferAttribute(position, corners[1]!);
      c!.fromBufferAttribute(position, corners[2]!);
      face!.subVectors(b!, a!).cross(c!.sub(a!)).normalize();
      for (const corner of corners) {
        n!.fromBufferAttribute(normal, corner).normalize();
        maxDeg = Math.max(maxDeg, THREE.MathUtils.radToDeg(n!.angleTo(face!)));
        if (n!.dot(face!) < 0) opposed++;
      }
    }
    return { maxDeg, opposed };
  }

  const variants: Array<[string, WingGeometryOptions, number, number]> = [
    ['defaults', {}, 24, 0.018],
    ['triangular (tipChord 0)', { tipChord: 0 }, 18, 0.012],
    [
      'span 4, sweep 1, dihedral 0.2, thickness 0.08',
      { span: 4, sweep: 1, dihedral: 0.2, thickness: 0.08 },
      24,
      0.144,
    ],
    ['forward sweep, wide tip', { sweep: -0.5, tipChord: 1.2 }, 24, 0.036],
  ];

  for (const [label, options, vertices, volume] of variants) {
    test(`wingGeo ${label}: face normals within 1 degree, still a closed outward solid`, () => {
      const geometry = wingGeo(options);
      expect(geometry.getAttribute('position').count).toBe(vertices);
      const facts = normalFacts(geometry);
      expect(facts.opposed).toBe(0);
      expect(facts.maxDeg).toBeLessThan(1);
      const { solid } = geometryDiagnostics(geometry);
      expect(solid.closed).toBe(true);
      expect(solid.manifold).toBe(true);
      expect(solid.orientation).toBe('outward');
      expect(solid.signedVolume).toBeCloseTo(volume, 6);
    });
  }

  test('createWingPair: both wings carry face normals', () => {
    for (const options of [{}, { tipChord: 0, sweep: 0.4 }]) {
      const pair = createWingPair('W', textured(), { rootZ: 0.3, ...options });
      for (const wing of [pair.left, pair.right]) {
        const geometry = (wing as THREE.Mesh).geometry;
        const facts = normalFacts(geometry);
        expect(facts.opposed).toBe(0);
        expect(facts.maxDeg).toBeLessThan(1);
        expect(geometryDiagnostics(geometry).solid.orientation).toBe('outward');
      }
    }
  });
});

describe('capsules carry no zero-area pole triangles (#407)', () => {
  const cases: Array<[string, () => THREE.BufferGeometry, number, number]> = [
    // label, build, triangles after the fix (60 - 12 and so on), signed volume (unchanged)
    ['capsuleGeo(0.5, 1)', () => capsuleGeo(0.5, 1), 48, 1.019119],
    ['capsuleXGeo(0.5, 1)', () => capsuleXGeo(0.5, 1), 48, 1.019119],
    ['capsuleYGeo(0.5, 1)', () => capsuleYGeo(0.5, 1), 48, 1.019119],
    ['capsuleZGeo(0.5, 1)', () => capsuleZGeo(0.5, 1), 48, 1.019119],
    ['capsuleGeo(0.5, 1, 3)', () => capsuleGeo(0.5, 1, 3), 24, 0.509559],
    ['capsuleGeo(0.5, 0) zero straight length', () => capsuleGeo(0.5, 0), 36, 0.369599],
    ['capsuleXGeo(0.5, 0, 3)', () => capsuleXGeo(0.5, 0, 3), 18, 0.1848],
    ['capsuleGeo(0.01, 2, 16) thin', () => capsuleGeo(0.01, 2, 16), 128, 0.000616],
  ];

  for (const [label, build, triangles, volume] of cases) {
    test(`${label}: no zero-area triangle, closed solid facts unchanged`, () => {
      const geometry = build();
      const diagnostics = geometryDiagnostics(geometry);
      expect(diagnostics.degenerateTriangles).toBe(0);
      expect(diagnostics.collapsedByToleranceTriangles).toBe(0);
      expect(diagnostics.triangles).toBe(triangles);
      expect(diagnostics.solid.closed).toBe(true);
      expect(diagnostics.solid.manifold).toBe(true);
      expect(diagnostics.solid.orientation).toBe('outward');
      expect(diagnostics.solid.signedVolume).toBeCloseTo(volume, 6);
    });
  }

  test('the vertices, normals and UVs stay; countTriangles reports the lower count', () => {
    const geometry = capsuleGeo(0.5, 1);
    expect(geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    // Six rows of seven vertices, as three.js builds them; only the index changes.
    expect(geometry.getAttribute('position').count).toBe(42);
    expect(geometry.getAttribute('normal').count).toBe(42);
    expect(geometry.getAttribute('uv').count).toBe(42);
    const part = createPart('Pill', geometry, new THREE.MeshStandardMaterial());
    expect(countTriangles(part)).toBe(48);
  });
});
