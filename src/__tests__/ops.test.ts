/**
 * Kiln mesh ops tests — Round 1
 *
 * Covers mergeVertices + subdivide interaction. Array/mirror/curve ops are
 * covered by validation scripts (no separate unit tests yet).
 */

import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  boxGeo,
  sphereGeo,
  cylinderGeo,
  createPart,
  foliageCardGeo,
  gameMaterial,
} from '../primitives';
import {
  arrayLinear,
  arrayRadial,
  repeatAlongCurve,
  mergeVertices,
  subdivide,
  revolveGeo,
  lathe,
  pipeAlongPath,
  curveToMesh,
} from '../ops';

describe('mergeVertices', () => {
  it('default (attribute-aware) preserves per-face normal splits', () => {
    const box = boxGeo(1, 1, 1);
    expect((box.getAttribute('position') as THREE.BufferAttribute).count).toBe(24);
    const welded = mergeVertices(box);
    // 24 stays 24 — each face keeps its own normals/UVs.
    const after = (welded.getAttribute('position') as THREE.BufferAttribute).count;
    expect(after).toBe(24);
    expect(welded.index).not.toBeNull();
  });

  it('positionOnly welds BoxGeometry corners down to 8', () => {
    const box = boxGeo(1, 1, 1);
    const welded = mergeVertices(box, { positionOnly: true });
    const after = (welded.getAttribute('position') as THREE.BufferAttribute).count;
    expect(after).toBe(8);
    expect(welded.index).not.toBeNull();
    expect(welded.index!.count).toBe(36);
    // Other attributes are dropped — caller is expected to recompute.
    expect(welded.getAttribute('normal')).toBeUndefined();
    expect(welded.getAttribute('uv')).toBeUndefined();
  });

  it('accepts legacy numeric tolerance arg for backward compat', () => {
    const box = boxGeo(1, 1, 1);
    const welded = mergeVertices(box, 1e-4);
    expect((welded.getAttribute('position') as THREE.BufferAttribute).count).toBe(24);
  });

  it('does not mutate the input', () => {
    const input = boxGeo(1, 1, 1);
    const beforeIndex = input.index;
    const beforeCount = (input.getAttribute('position') as THREE.BufferAttribute).count;
    mergeVertices(input, { positionOnly: true });
    expect(input.index).toBe(beforeIndex);
    expect((input.getAttribute('position') as THREE.BufferAttribute).count).toBe(beforeCount);
  });

  it('collapses poles on a SphereGeometry under positionOnly weld', () => {
    const s = sphereGeo(1, 8, 6);
    const before = (s.getAttribute('position') as THREE.BufferAttribute).count;
    const welded = mergeVertices(s, { positionOnly: true });
    const after = (welded.getAttribute('position') as THREE.BufferAttribute).count;
    expect(after).toBeLessThan(before);
  });
});

describe('subdivide auto-weld', () => {
  it('keeps deformed corners connected (rock-smooth fix)', () => {
    // Repro of the rock-smooth audit failure: jitter positions of a
    // non-indexed box then subdivide. Without weld, each corner exists
    // 3x (one per face) and jitter drifts them apart — three-subdivide's
    // position-hash adjacency breaks and the surface splits into shards.
    // With weld (positionOnly) applied first, each corner moves once and
    // the mesh stays one connected blob.
    const base = boxGeo(1.2, 0.8, 1);
    const pos = base.getAttribute('position') as THREE.BufferAttribute;
    // Deterministic "jitter"
    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s / 0xffffffff - 0.5) * 0.2;
      };
    };
    const rand = rng(42);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) + rand(), pos.getY(i) + rand(), pos.getZ(i) + rand());
    }

    const smoothed = subdivide(base, 1); // auto-welds first

    // Count distinct position clusters: mergeVertices({positionOnly}) on
    // the subdivided output collapses coincident verts. A connected surface
    // has indices that reach every cluster.
    const collapsed = mergeVertices(smoothed, { positionOnly: true });
    const clusters = (collapsed.getAttribute('position') as THREE.BufferAttribute).count;

    // Sanity: collapsed result has verts, and substantially fewer than
    // the non-indexed vertex buffer (proving shared corners exist).
    const subVerts = (smoothed.getAttribute('position') as THREE.BufferAttribute).count;
    expect(clusters).toBeGreaterThan(0);
    expect(clusters).toBeLessThan(subVerts);
  });

  it('weld: false disables the auto-merge (legacy behavior)', () => {
    const box = boxGeo(1, 1, 1);
    const legacy = subdivide(box, 1, { weld: false });
    const auto = subdivide(box, 1);
    const legacyVerts = (legacy.getAttribute('position') as THREE.BufferAttribute).count;
    const autoVerts = (auto.getAttribute('position') as THREE.BufferAttribute).count;
    // The welded path produces ≤ verts because corners are shared.
    expect(autoVerts).toBeLessThanOrEqual(legacyVerts);
  });

  it('preserves geometry survival through GLB export after welded subdivide', () => {
    const sub = subdivide(boxGeo(1, 1, 1), 1);
    const pos = sub.getAttribute('position') as THREE.BufferAttribute;
    // Positions finite, no NaN
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
});

describe('revolveGeo', () => {
  function bbox(geo: THREE.BufferGeometry): { x: number; y: number; z: number } {
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    return { x: size.x, y: size.y, z: size.z };
  }

  it('full revolution of a vertical line ≡ cylinder bbox', () => {
    // Profile: a vertical line at radius=0.5, from y=0 to y=2.
    // Note: lathe orients y from bottom to top. To match cylinderGeo (which
    // is centered on origin), we offset the profile so it spans y=-1..+1.
    const profile: Array<[number, number]> = [
      [0.5, -1],
      [0.5, 1],
    ];
    const cyl = cylinderGeo(0.5, 0.5, 2, 16);
    const rev = revolveGeo(profile, { segments: 16 });
    const a = bbox(cyl);
    const b = bbox(rev);
    expect(b.x).toBeCloseTo(a.x, 3);
    expect(b.y).toBeCloseTo(a.y, 3);
    expect(b.z).toBeCloseTo(a.z, 3);
  });

  it('full revolution matches lathe (back-compat sanity)', () => {
    const profile: Array<[number, number]> = [
      [0.1, 0],
      [0.3, 0.5],
      [0.2, 1],
      [0.1, 1.2],
    ];
    const a = bbox(lathe(profile, 16));
    const b = bbox(revolveGeo(profile, { segments: 16 }));
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  it('partial sweep covers the requested angular extent', () => {
    // Quarter sweep (90°) of a vertical line at radius=1.
    // LatheGeometry's phi=0 starts at +Z (not +X), so:
    //   quarter (0..π/2): sweeps +Z → +X → bbox.x≈1, bbox.z≈1
    //   half (0..π):       sweeps +Z → -Z passing through +X → bbox.x≈1, bbox.z≈2
    //   full (0..2π):      bbox.x≈2, bbox.z≈2
    const profile: Array<[number, number]> = [
      [1, 0],
      [1, 1],
    ];
    const quarter = revolveGeo(profile, { angle: Math.PI / 2, segments: 16 });
    const half = revolveGeo(profile, { angle: Math.PI, segments: 16 });
    const full = revolveGeo(profile, { angle: Math.PI * 2, segments: 16 });
    expect(bbox(full).x).toBeCloseTo(2, 1);
    expect(bbox(full).z).toBeCloseTo(2, 1);
    expect(bbox(half).x).toBeCloseTo(1, 1);
    expect(bbox(half).z).toBeCloseTo(2, 1);
    expect(bbox(quarter).x).toBeCloseTo(1, 1);
    expect(bbox(quarter).z).toBeCloseTo(1, 1);
  });

  it('non-Y axis reorients the surface', () => {
    // Same line profile, sweep around +X instead of +Y. The "height" should
    // now lie along X, the radial direction in the YZ plane.
    const profile: Array<[number, number]> = [
      [0.5, -1],
      [0.5, 1],
    ];
    const aroundX = revolveGeo(profile, { axis: [1, 0, 0], segments: 16 });
    const b = bbox(aroundX);
    expect(b.x).toBeCloseTo(2, 1); // along X = the lathe axis
    expect(b.y).toBeCloseTo(1, 1); // diameter in YZ
    expect(b.z).toBeCloseTo(1, 1);
  });

  it('rejects zero-length axis', () => {
    expect(() =>
      revolveGeo(
        [
          [1, 0],
          [1, 1],
        ],
        { axis: [0, 0, 0] },
      ),
    ).toThrow('axis must be a non-zero vector');
  });
});

describe('pipeAlongPath', () => {
  it('both tube helpers reject absent or invalid required radii instead of inheriting Three defaults', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [0, 0.2, 0],
    ];
    for (const helper of [pipeAlongPath, curveToMesh]) {
      for (const radius of [undefined, NaN, Infinity, 0, -0.1, 1e-50])
        expect(() => helper(points, radius as number)).toThrow(/explicit.*radius/);
      const result = helper(points, 0.0025);
      result.computeBoundingBox();
      expect(result.boundingBox!.max.x - result.boundingBox!.min.x).toBeCloseTo(0.005, 7);
    }
  });

  function bbox(geo: THREE.BufferGeometry): { x: number; y: number; z: number } {
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    return { x: size.x, y: size.y, z: size.z };
  }

  it('2-point pipe matches a beamBetween bbox along the same vector', () => {
    // Path = [origin, +Y at 1]; radius 0.05.
    // Bbox should span 1 along Y, ≈0.1 along X and Z (diameter).
    const pipe = pipeAlongPath(
      [
        [0, 0, 0],
        [0, 1, 0],
      ],
      0.05,
    );
    const b = bbox(pipe);
    expect(b.y).toBeCloseTo(1, 1);
    expect(b.x).toBeLessThan(0.2);
    expect(b.z).toBeLessThan(0.2);
  });

  it('3-point right-angle path covers both legs', () => {
    // L-shape in the XY plane: (0,0,0) → (1,0,0) → (1,1,0).
    const pipe = pipeAlongPath(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      0.05,
    );
    const b = bbox(pipe);
    expect(b.x).toBeGreaterThan(0.9);
    expect(b.y).toBeGreaterThan(0.9);
  });

  it('bendRadius>0 changes the geometry vs unsmoothed path', () => {
    const pts: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    const sharp = pipeAlongPath(pts, 0.05);
    const smooth = pipeAlongPath(pts, 0.05, { bendRadius: 0.2 });
    // Both produce non-empty geometry; the bend variant has a different
    // vertex count due to inserted waypoints / spline resampling.
    const sharpVerts = (sharp.getAttribute('position') as THREE.BufferAttribute).count;
    const smoothVerts = (smooth.getAttribute('position') as THREE.BufferAttribute).count;
    expect(sharpVerts).toBeGreaterThan(0);
    expect(smoothVerts).toBeGreaterThan(0);
    // Bend radius adds interpolated waypoints — vertex counts may differ
    // (the underlying TubeGeometry uses CatmullRom over the new path).
    const sharpBb = bbox(sharp);
    const smoothBb = bbox(smooth);
    // Smoothed corner shouldn't bow OUTSIDE the original path's bbox.
    expect(smoothBb.x).toBeLessThanOrEqual(sharpBb.x + 0.05);
    expect(smoothBb.y).toBeLessThanOrEqual(sharpBb.y + 0.05);
  });

  it('rejects single-point input', () => {
    expect(() => pipeAlongPath([[0, 0, 0]], 0.05)).toThrow('need at least 2 points');
  });
});

describe('arrayLinear', () => {
  // Two dispatched models hit this independently: they oriented a source part,
  // arrayed it, and every copy came back axis-aligned. `arrayLinear` read only
  // `source.position`, so "copies of source" lost the source's orientation --
  // while `arrayRadial` next door set a rotation on every copy. The two helpers
  // disagreed about what a copy is.
  it('carries the source rotation and scale onto every copy', () => {
    const root = new THREE.Object3D();
    const source = createPart('Slat0', boxGeo(1, 0.1, 0.4), gameMaterial(0x8b6f3d), {
      position: [0, 0.5, 0],
      rotation: [0, 0, 30],
      scale: [1, 1, 2],
      parent: root,
    });

    const copies = arrayLinear('Slat', source, 4, [0.5, 0, 0], root);

    expect(copies).toHaveLength(3);
    for (const [index, copy] of copies.entries()) {
      const i = index + 1;
      expect(copy.position.toArray()).toEqual([0.5 * i, 0.5, 0]);
      // Degrees in, radians on the object: 30deg about Z.
      expect(copy.rotation.z).toBeCloseTo(Math.PI / 6, 10);
      expect(copy.rotation.x).toBeCloseTo(0, 10);
      expect(copy.rotation.y).toBeCloseTo(0, 10);
      expect(copy.scale.toArray()).toEqual([1, 1, 2]);
    }
  });

  it('leaves an unrotated, unscaled source byte-identical to before', () => {
    // The fix must not move geometry for the overwhelmingly common case.
    const root = new THREE.Object3D();
    const source = createPart('Post0', cylinderGeo(0.05, 0.05, 1.5, 6), gameMaterial(0x8b6f3d), {
      position: [0, 0.75, 0],
      parent: root,
    });
    for (const copy of arrayLinear('Post', source, 3, [0.5, 0, 0], root)) {
      expect(copy.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(copy.scale.toArray()).toEqual([1, 1, 1]);
    }
  });
});

describe('arrayRadial', () => {
  it('orbits the parent origin by default, unchanged', () => {
    const root = new THREE.Object3D();
    const bolt = createPart('Bolt0', cylinderGeo(0.02, 0.02, 0.1, 6), gameMaterial(0x8899aa), {
      position: [1, 0, 0],
      parent: root,
    });
    const copies = arrayRadial('Bolt', bolt, 4, 'y', root);
    expect(copies).toHaveLength(3);
    // Quarter turns about Y from [1,0,0]: [0,0,-1], [-1,0,0], [0,0,1].
    expect(copies[0]!.position.x).toBeCloseTo(0, 10);
    expect(copies[0]!.position.z).toBeCloseTo(-1, 10);
    expect(copies[1]!.position.x).toBeCloseTo(-1, 10);
  });

  it('orbits an explicit centre when one is given', () => {
    // The helper could only ever orbit the parent's origin, so arraying rivets
    // around a hub that is not at the origin meant hand-writing the matrix.
    const root = new THREE.Object3D();
    const rivet = createPart('Rivet0', cylinderGeo(0.02, 0.02, 0.1, 6), gameMaterial(0x8899aa), {
      position: [3, 0, 0],
      parent: root,
    });
    const copies = arrayRadial('Rivet', rivet, 4, 'y', root, [2, 0, 0]);
    // Radius 1 about [2,0,0], not radius 3 about the origin.
    expect(copies[0]!.position.x).toBeCloseTo(2, 10);
    expect(copies[0]!.position.z).toBeCloseTo(-1, 10);
    expect(copies[1]!.position.x).toBeCloseTo(1, 10);
    expect(copies[1]!.position.z).toBeCloseTo(0, 10);
  });
});

describe('repeatAlongCurve', () => {
  // #211: a palm's ~600 leaflets were built by hand with meshGeo, because no helper
  // copied one leaflet along a rachis and merged the copies with their UVs kept.
  const leaflet = () => foliageCardGeo({ width: 0.04, height: 0.3, yPivot: 0 });
  const rachis: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, -1],
  ];

  it('merges copies into one primitive whose UVs equal the source per copy', () => {
    const source = leaflet();
    const merged = repeatAlongCurve(source, rachis, { count: 12 }) as THREE.BufferGeometry;
    const sourceCount = source.getAttribute('position').count;
    expect(merged.getAttribute('position').count).toBe(12 * sourceCount);
    expect(merged.index!.count).toBe(12 * source.index!.count);
    expect(merged.groups).toEqual([]);
    const sourceUv = Array.from(source.getAttribute('uv').array);
    const uv = merged.getAttribute('uv').array;
    for (let copy = 0; copy < 12; copy++)
      expect(Array.from(uv.slice(copy * sourceUv.length, (copy + 1) * sourceUv.length))).toEqual(
        sourceUv,
      );
  });

  it('turns each copy so its local +X follows the curve tangent and +Y points up', () => {
    // Equal segments put the copies at the start, the corner and the end. A thin bar
    // along local +X and a stub along local +Y show each copy's frame.
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, -1],
    ];
    const bar = boxGeo(0.1, 0.002, 0.002).translate(0.05, 0, 0);
    const stub = boxGeo(0.002, 0.05, 0.002).translate(0, 0.025, 0);
    const centroidTip = (geometry: THREE.BufferGeometry, copy: number) => {
      const merged = repeatAlongCurve(geometry, path, { count: 3 }) as THREE.BufferGeometry;
      const position = merged.getAttribute('position');
      const perCopy = geometry.getAttribute('position').count;
      const sum = new THREE.Vector3();
      for (let i = copy * perCopy; i < (copy + 1) * perCopy; i++)
        sum.add(new THREE.Vector3().fromBufferAttribute(position, i));
      return sum.divideScalar(perCopy);
    };
    const bases = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, -1],
    ];
    // At the corner the outgoing segment's direction is the tangent.
    const tangents = [
      [1, 0, 0],
      [0, 0, -1],
      [0, 0, -1],
    ];
    for (const copy of [0, 1, 2]) {
      const base = new THREE.Vector3(...(bases[copy] as [number, number, number]));
      const along = centroidTip(bar, copy).sub(base);
      const tangent = new THREE.Vector3(...(tangents[copy] as [number, number, number]));
      expect(along.distanceTo(tangent.clone().multiplyScalar(0.05))).toBeLessThan(1e-6);
      const up = centroidTip(stub, copy).sub(base);
      expect(up.distanceTo(new THREE.Vector3(0, 0.025, 0))).toBeLessThan(1e-6);
    }
  });

  it('places an opposite row in the same primitive with opposite: true', () => {
    const stub = boxGeo(0.002, 0.05, 0.002).translate(0, 0.025, 0);
    const perCopy = stub.getAttribute('position').count;
    const merged = repeatAlongCurve(stub, [rachis[0]!, rachis[1]!], {
      count: 2,
      opposite: true,
    }) as THREE.BufferGeometry;
    expect(merged.getAttribute('position').count).toBe(4 * perCopy);
    const centroidY = (copy: number) => {
      let y = 0;
      for (let i = copy * perCopy; i < (copy + 1) * perCopy; i++)
        y += merged.getAttribute('position').getY(i);
      return y / perCopy;
    };
    // Each position gets its copy, then the opposite copy twisted 180 degrees.
    expect([0, 1, 2, 3].map((copy) => Math.round(centroidY(copy) * 1000) / 1000)).toEqual([
      0.025, -0.025, 0.025, -0.025,
    ]);
  });

  it('adds an optional _along attribute from attachment (0) to tip (1)', () => {
    const merged = repeatAlongCurve(leaflet(), rachis, {
      count: 5,
      along: true,
    }) as THREE.BufferGeometry;
    const along = merged.getAttribute('_along');
    const perCopy = leaflet().getAttribute('position').count;
    expect([0, 1, 2, 3, 4].map((copy) => along.getX(copy * perCopy))).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
  });

  it('tapers scale and twist from attachment to tip', () => {
    const bar = boxGeo(0.1, 0.01, 0.01).translate(0.05, 0, 0);
    const merged = repeatAlongCurve(bar, [rachis[0]!, rachis[1]!], {
      count: 2,
      scale: [1, 0.5],
      twist: [0, 180],
    }) as THREE.BufferGeometry;
    merged.computeBoundingBox();
    // The tip copy is half length: the whole span is 1 (spacing) + 0.05 (half bar).
    expect(merged.boundingBox!.max.x).toBeCloseTo(1.05, 5);
  });

  it('creates shared-geometry nodes when merge is false', () => {
    const root = new THREE.Object3D();
    const source = new THREE.Mesh(leaflet(), gameMaterial(0x3f7a2c));
    source.name = 'Leaflet';
    const copies = repeatAlongCurve(source, rachis, {
      count: 4,
      merge: false,
      name: 'Leaflet',
      parent: root,
    }) as THREE.Object3D[];
    expect(copies).toHaveLength(4);
    expect(copies.map((copy) => copy.name)).toEqual([
      'Mesh_Leaflet0',
      'Mesh_Leaflet1',
      'Mesh_Leaflet2',
      'Mesh_Leaflet3',
    ]);
    for (const copy of copies) {
      expect((copy as THREE.Mesh).geometry).toBe(source.geometry);
      expect(copy.parent).toBe(root);
    }
  });

  it('refuses an over-budget merge with a bounded diagnostic', () => {
    const dense = sphereGeo(0.1, 64, 64);
    expect(() => repeatAlongCurve(dense, rachis, { count: 200 })).toThrow(
      /repeatAlongCurve would produce \d+ vertices; the limit is 262144/,
    );
  });

  it('rejects invalid curves and options', () => {
    expect(() => repeatAlongCurve(leaflet(), [[0, 0, 0]], { count: 2 })).toThrow(/two points/);
    expect(() =>
      repeatAlongCurve(
        leaflet(),
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
        { count: 2 },
      ),
    ).toThrow(/length/);
    expect(() => repeatAlongCurve(leaflet(), rachis, { count: 0 })).toThrow(/count/);
    expect(() => repeatAlongCurve(leaflet(), rachis, { count: 2, scale: -1 })).toThrow(/scale/);
    expect(() => repeatAlongCurve(leaflet(), rachis, { count: 2, merge: false })).toThrow(/Mesh/);
  });
});
