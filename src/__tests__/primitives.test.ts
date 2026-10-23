/**
 * Primitive coverage tests (W7.3)
 *
 * Existence of these primitives is the entire substrate of the Kiln
 * sandbox - the LLM is expected to call any of them. The render-only
 * spike test only exercises a handful (boxGeo + gameMaterial), leaving
 * most of primitives.ts uncovered. These tests call each primitive
 * directly and assert real behavior:
 *   - return types are the expected Three.js classes
 *   - geometries produce non-zero positions / indices when applicable
 *   - materials carry through their option settings
 *   - animation track helpers produce KeyframeTrack instances with the
 *     right shape
 *   - the analysis helpers (countTriangles, countMaterials, getJointNames,
 *     materialBudgetAdvisory) compute correct numbers on a small built scene
 */

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import {
  // construction
  createRoot,
  createPivot,
  createPart,
  beamBetween,
  createLadder,
  createWingPair,
  room,
  wallWithOpening,
  createRoofPlanes,
  createStairs,
  // geometries
  boxGeo,
  sphereGeo,
  cylinderGeo,
  cylinderXGeo,
  cylinderZGeo,
  cylinderOnAxis,
  coneGeo,
  coneXGeo,
  coneZGeo,
  taperConeGeo,
  capsuleGeo,
  capsuleXGeo,
  capsuleZGeo,
  torusGeo,
  planeGeo,
  wingGeo,
  // materials
  basicMaterial,
  gameMaterial,
  glassMaterial,
  lambertMaterial,
  // animation tracks
  rotationTrack,
  positionTrack,
  scaleTrack,
  createClip,
  // animation patterns
  idleBreathing,
  bobbingAnimation,
  spinAnimation,
  // analysis
  countTriangles,
  countMaterials,
  getJointNames,
  materialBudgetAdvisory,
  buildSandboxGlobals,
} from '../primitives';

function geometrySize(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  return size;
}

// =============================================================================
// Construction primitives
// =============================================================================

describe('createRoot / createPivot / createPart', () => {
  test('createRoot returns a named Object3D', () => {
    const root = createRoot('MyAsset');
    expect(root).toBeInstanceOf(THREE.Object3D);
    expect(root.name).toBe('MyAsset');
  });

  test('createPivot positions the joint and parents it', () => {
    const root = createRoot('R');
    const pivot = createPivot('Hip', [1, 2, 3], root);

    expect(pivot.name).toBe('Joint_Hip');
    expect(pivot.position.x).toBe(1);
    expect(pivot.position.y).toBe(2);
    expect(pivot.position.z).toBe(3);
    expect(pivot.parent).toBe(root);
    expect(root.children).toContain(pivot);
  });

  test('createPivot defaults position to origin and works without a parent', () => {
    const orphan = createPivot('Lonely');
    expect(orphan.position.x).toBe(0);
    expect(orphan.position.y).toBe(0);
    expect(orphan.position.z).toBe(0);
    expect(orphan.parent).toBeNull();
  });

  test('createPart returns a Mesh by default and adds it to the parent', () => {
    const root = createRoot('R');
    const mesh = createPart('Body', boxGeo(1, 1, 1), gameMaterial(0xff0000), {
      parent: root,
    });

    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.name).toBe('Mesh_Body');
    expect(mesh.parent).toBe(root);
  });

  test('createPart applies position/rotation/scale options', () => {
    const mesh = createPart('Cube', boxGeo(1, 1, 1), gameMaterial(0x00ff00), {
      position: [1, 2, 3],
      rotation: [90, 0, 45],
      scale: [2, 1, 1],
    });

    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
    // Rotation is converted from degrees to radians.
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(mesh.rotation.z).toBeCloseTo(Math.PI / 4);
    expect(mesh.scale.x).toBe(2);
  });

  test('createPart with pivot=true returns the wrapping pivot', () => {
    const root = createRoot('R');
    const wrapped = createPart('Door', boxGeo(1, 2, 0.1), gameMaterial(0x654321), {
      pivot: true,
      position: [0.5, 0, 0],
      parent: root,
    });

    expect(wrapped.name).toBe('Joint_Door');
    expect(wrapped.parent).toBe(root);
    // The pivot should hold the offset; the inner mesh should be at origin.
    expect(wrapped.position.x).toBe(0.5);
    const child = wrapped.children[0] as THREE.Mesh;
    expect(child).toBeInstanceOf(THREE.Mesh);
    expect(child.position.x).toBe(0);
    expect(child.name).toBe('Mesh_Door');
  });
});

describe('attachment helpers', () => {
  test('beamBetween creates a named cylinder centered between endpoints', () => {
    const root = createRoot('R');
    const beam = beamBetween('Brace', [1, 0, 0], [1, 2, 0], 0.05, gameMaterial(0x333333), {
      parent: root,
      segments: 6,
    }) as THREE.Mesh;

    expect(beam.name).toBe('Mesh_Brace');
    expect(beam.parent).toBe(root);
    expect(beam.position.x).toBeCloseTo(1);
    expect(beam.position.y).toBeCloseTo(1);
    expect(beam.position.z).toBeCloseTo(0);
    expect(geometrySize(beam.geometry).y).toBeCloseTo(2);
  });

  test('beamBetween rejects zero-length beams', () => {
    expect(() => beamBetween('Bad', [0, 0, 0], [0, 0, 0], 0.05, gameMaterial(0x333333))).toThrow(
      'start and end must be different points',
    );
  });

  test('createLadder creates two continuous rails and evenly named rungs', () => {
    const root = createRoot('R');
    const ladder = createLadder('TowerLadder', {
      bottom: [0, 0, 0],
      top: [0, 2, 0],
      width: 0.5,
      rungCount: 4,
      material: gameMaterial(0x555555),
      parent: root,
    });

    expect(ladder.leftRail.name).toBe('Mesh_TowerLadderLeftRail');
    expect(ladder.rightRail.name).toBe('Mesh_TowerLadderRightRail');
    expect(ladder.rungs.map((r) => r.name)).toEqual([
      'Mesh_TowerLadderRung1',
      'Mesh_TowerLadderRung2',
      'Mesh_TowerLadderRung3',
      'Mesh_TowerLadderRung4',
    ]);
    expect(root.children).toEqual([ladder.root]);
    expect(ladder.root.children.length).toBe(6);
  });

  test('createWingPair attaches mirrored wing roots at +/-rootZ', () => {
    const root = createRoot('Aircraft');
    const wings = createWingPair('MainWing', gameMaterial(0x556b2f), {
      rootZ: 0.45,
      rootX: 0.1,
      rootY: 1.0,
      span: 2,
      rootChord: 0.8,
      tipChord: 0.3,
      sweep: 0.25,
      dihedral: 0.08,
      parent: root,
    });

    expect(wings.right.name).toBe('Mesh_MainWingRight');
    expect(wings.left.name).toBe('Mesh_MainWingLeft');
    expect(wings.right.position.z).toBeCloseTo(0.45);
    expect(wings.left.position.z).toBeCloseTo(-0.45);
    expect(root.children).toContain(wings.right);
    expect(root.children).toContain(wings.left);
  });
});

describe('building helpers', () => {
  test('wallWithOpening: solid wall is one panel', () => {
    const wall = wallWithOpening('S', gameMaterial(0x808080), {
      length: 4,
      height: 2.8,
      thickness: 0.15,
    });
    expect(wall.name).toBe('S');
    expect(wall.children.length).toBe(1);
    expect(wall.children[0]!.name).toBe('Mesh_S');
  });

  test('wallWithOpening: a door cuts a real gap (two jambs + a lintel, no sill)', () => {
    const wall = wallWithOpening('W', gameMaterial(0x808080), {
      length: 4,
      height: 2.8,
      thickness: 0.15,
      opening: { kind: 'door' },
    });
    expect(wall.children.map((c) => c.name).sort()).toEqual([
      'Mesh_W_L',
      'Mesh_W_Lintel',
      'Mesh_W_R',
    ]);
  });

  test('wallWithOpening: a window adds a sill apron under the gap', () => {
    const wall = wallWithOpening('Win', gameMaterial(0x808080), {
      length: 4,
      height: 2.8,
      thickness: 0.15,
      opening: { kind: 'window' },
    });
    expect(wall.children.map((c) => c.name).sort()).toEqual([
      'Mesh_Win_L',
      'Mesh_Win_Lintel',
      'Mesh_Win_R',
      'Mesh_Win_Sill',
    ]);
  });

  test('room: hollow shell of four walls + a floor, enterable by default', () => {
    const root = createRoot('R');
    const {
      root: hut,
      walls,
      floor,
    } = room('Hut', gameMaterial(0x8b6f3d), {
      width: 5,
      depth: 4,
      parent: root,
    });
    expect(hut.parent).toBe(root);
    // 4 wall containers + 1 floor.
    expect(hut.children.length).toBe(5);
    expect(floor).not.toBeNull();
    expect(floor!.name).toBe('Mesh_Hut_Floor');
    expect(walls.front.name).toBe('Hut_WallFront');
    // Default = a door on the front wall, so the front wall is NOT a solid slab.
    expect(walls.front.children.length).toBe(3); // L, R, Lintel
    // The other walls have no opening — a single solid panel each.
    expect(walls.back.children.length).toBe(1);
    expect(walls.left.children.length).toBe(1);
    expect(walls.right.children.length).toBe(1);
    // Front faces +X; left/right sit at -/+ width/2 on Z.
    expect(walls.front.position.x).toBeCloseTo(2); // depth/2
    expect(walls.left.position.z).toBeCloseTo(-2.5); // -width/2
    expect(walls.right.position.z).toBeCloseTo(2.5);
  });

  test('room: openings can be placed on any wall', () => {
    const { walls } = room('Hut', gameMaterial(0x8b6f3d), {
      openings: [
        { wall: 'front', kind: 'door' },
        { wall: 'right', kind: 'window' },
      ],
    });
    expect(walls.front.children.length).toBe(3); // door
    expect(walls.right.children.length).toBe(4); // window (+ sill)
    expect(walls.back.children.length).toBe(1); // solid
  });

  test('createRoofPlanes: two slopes fall AWAY from each other from one ridge', () => {
    const { root, slopes } = createRoofPlanes('Roof', gameMaterial(0x6b4f2a), {
      width: 5,
      depth: 4,
      height: 1.6,
      ridgeAxis: 'x',
    });
    expect(root.name).toBe('Roof');
    expect(slopes[0].name).toBe('Mesh_Roof_positive');
    expect(slopes[1].name).toBe('Mesh_Roof_negative');
    // Physical slope normals, independent of equivalent Euler representations.
    const normals = slopes.map((slope) =>
      new THREE.Vector3(0, 1, 0).applyQuaternion(slope.quaternion),
    );
    expect(normals[0]!.y).toBeGreaterThan(0);
    expect(normals[0]!.z).toBeCloseTo(-normals[1]!.z);
    expect(normals[0]!.z).toBeGreaterThan(0);
    // Slopes drop toward opposite Z sides; ridge centered above the eaves.
    expect(Math.sign(slopes[0].position.z)).toBe(1);
    expect(Math.sign(slopes[1].position.z)).toBe(-1);
    expect(slopes[0].position.y + normals[0]!.y * 0.04).toBeCloseTo(0.8); // top surface midpoint
  });

  test('createStairs: named treads climb up and along; risers included', () => {
    const { root, steps } = createStairs('Porch', gameMaterial(0x888888), {
      steps: 4,
      totalRise: 1.0,
      totalRun: 2.0,
      width: 1.2,
      axis: 'x',
    });
    expect(steps.map((s) => s.name)).toEqual([
      'Mesh_PorchStep1',
      'Mesh_PorchStep2',
      'Mesh_PorchStep3',
      'Mesh_PorchStep4',
    ]);
    expect(steps[3]!.position.y).toBeGreaterThan(steps[0]!.position.y);
    expect(steps[3]!.position.x).toBeGreaterThan(steps[0]!.position.x);
    expect(root.children.length).toBe(8); // 4 treads + 4 risers
  });

  test('createStairs: rejects no steps and a degenerate flight', () => {
    const mat = gameMaterial(0x888888);
    expect(() =>
      createStairs('Bad', mat, { steps: 0, totalRise: 1, totalRun: 1, width: 1 }),
    ).toThrow('steps must be >= 1');
    expect(() => createStairs('Bad', mat, { totalRise: 0, totalRun: 1, width: 1 })).toThrow(
      'must be non-zero',
    );
  });
});

// =============================================================================
// Geometry primitives
// =============================================================================

describe('geometry primitives produce real Three.js geometries', () => {
  test('boxGeo', () => {
    const g = boxGeo(1, 2, 3);
    expect(g).toBeInstanceOf(THREE.BoxGeometry);
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  });

  test('sphereGeo with default and custom segments', () => {
    const def = sphereGeo(1);
    expect(def).toBeInstanceOf(THREE.SphereGeometry);
    const custom = sphereGeo(1, 16, 12);
    expect(custom.parameters.widthSegments).toBe(16);
    expect(custom.parameters.heightSegments).toBe(12);
  });

  test('cylinderGeo', () => {
    const g = cylinderGeo(0.5, 0.5, 2, 12);
    expect(g).toBeInstanceOf(THREE.CylinderGeometry);
    expect(g.parameters.radialSegments).toBe(12);
  });

  test('axis-specific cylinder helpers align length to requested axis', () => {
    const x = geometrySize(cylinderXGeo(0.2, 0.2, 2, 12));
    const z = geometrySize(cylinderZGeo(0.2, 0.2, 3, 12));
    expect(x.x).toBeCloseTo(2);
    expect(x.y).toBeLessThan(0.5);
    expect(z.z).toBeCloseTo(3);
    expect(z.y).toBeLessThan(0.5);
  });

  test('cylinderOnAxis with Y normal matches cylinderGeo bbox at origin', () => {
    const baseline = cylinderGeo(0.3, 0.3, 1.5, 16);
    const onAxis = cylinderOnAxis([0, 0, 0], [0, 1, 0], 0.3, 1.5, { segments: 16 });
    const a = geometrySize(baseline);
    const b = geometrySize(onAxis);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  test('cylinderOnAxis with X normal matches cylinderXGeo bbox', () => {
    const ax = geometrySize(cylinderXGeo(0.2, 0.2, 1.2, 12));
    const on = geometrySize(cylinderOnAxis([0, 0, 0], [1, 0, 0], 0.2, 1.2, { segments: 12 }));
    expect(on.x).toBeCloseTo(ax.x, 5);
    expect(on.y).toBeCloseTo(ax.y, 5);
    expect(on.z).toBeCloseTo(ax.z, 5);
  });

  test('cylinderOnAxis with Z normal matches cylinderZGeo bbox', () => {
    const az = geometrySize(cylinderZGeo(0.18, 0.18, 0.9, 10));
    const on = geometrySize(cylinderOnAxis([0, 0, 0], [0, 0, 1], 0.18, 0.9, { segments: 10 }));
    expect(on.x).toBeCloseTo(az.x, 5);
    expect(on.y).toBeCloseTo(az.y, 5);
    expect(on.z).toBeCloseTo(az.z, 5);
  });

  test('cylinderOnAxis with arbitrary normal lies along the requested vector', () => {
    const center: [number, number, number] = [1, 2, -0.5];
    const normal: [number, number, number] = [1, 1, 0];
    const geo = cylinderOnAxis(center, normal, 0.05, 2);
    geo.computeBoundingBox();
    const center3 = new THREE.Vector3();
    geo.boundingBox!.getCenter(center3);
    expect(center3.x).toBeCloseTo(1, 5);
    expect(center3.y).toBeCloseTo(2, 5);
    expect(center3.z).toBeCloseTo(-0.5, 5);
    // For normal=[1,1,0] (axis in XY plane at 45°), height=2, radius=0.05:
    //   bbox.x = bbox.y = cos(45°)·2 + sin(45°)·0.1 ≈ 1.485
    //   bbox.z = 2·radius = 0.1
    const size = geometrySize(geo);
    const expectedXY = Math.SQRT2 + 0.1 * Math.SQRT1_2;
    expect(size.x).toBeCloseTo(expectedXY, 2);
    expect(size.y).toBeCloseTo(expectedXY, 2);
    expect(size.z).toBeLessThan(0.2);
  });

  test('cylinderOnAxis rejects zero-length normal', () => {
    expect(() => cylinderOnAxis([0, 0, 0], [0, 0, 0], 0.1, 1)).toThrow(
      'normal must be a non-zero vector',
    );
  });

  test('cylinderOnAxis radiusTop option produces a frustum', () => {
    const frustum = cylinderOnAxis([0, 0, 0], [0, 1, 0], 0.5, 1, { radiusTop: 0.2 });
    expect(frustum.parameters.radiusTop).toBeCloseTo(0.2);
    expect(frustum.parameters.radiusBottom).toBeCloseTo(0.5);
  });

  test('taperConeGeo with radiusTop=0 matches coneGeo bbox', () => {
    const a = geometrySize(coneGeo(0.5, 1.2, 12));
    const b = geometrySize(taperConeGeo(0.5, 0, 1.2, 'y', 12));
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  test('taperConeGeo with equal radii matches cylinderGeo bbox', () => {
    const a = geometrySize(cylinderGeo(0.3, 0.3, 1.0, 12));
    const b = geometrySize(taperConeGeo(0.3, 0.3, 1.0, 'y', 12));
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  test('taperConeGeo emits a true frustum (top !== bottom !== 0)', () => {
    const f = taperConeGeo(0.4, 0.15, 0.8);
    expect(f.parameters.radiusTop).toBeCloseTo(0.15);
    expect(f.parameters.radiusBottom).toBeCloseTo(0.4);
  });

  test('taperConeGeo axis="x" aligns height along +X', () => {
    const size = geometrySize(taperConeGeo(0.2, 0.2, 1.6, 'x'));
    expect(size.x).toBeCloseTo(1.6);
    expect(size.y).toBeLessThan(0.5);
  });

  test('taperConeGeo axis="z" aligns height along +Z', () => {
    const size = geometrySize(taperConeGeo(0.2, 0.2, 1.4, 'z'));
    expect(size.z).toBeCloseTo(1.4);
    expect(size.y).toBeLessThan(0.5);
  });

  // ---- Lazy mesh cache (Wave 2 B2) -----------------------------------------

  test('sandbox geometry cache returns the same ref for identical args', () => {
    const sandbox = buildSandboxGlobals();
    const box1 = (sandbox.boxGeo as typeof boxGeo)(1, 2, 3);
    const box2 = (sandbox.boxGeo as typeof boxGeo)(1, 2, 3);
    expect(box1).toBe(box2);
  });

  test('sandbox geometry cache returns a new ref when args differ', () => {
    const sandbox = buildSandboxGlobals();
    const a = (sandbox.boxGeo as typeof boxGeo)(1, 1, 1);
    const b = (sandbox.boxGeo as typeof boxGeo)(1, 1, 2);
    expect(a).not.toBe(b);
  });

  test('sandbox geometry cache is per-execution — fresh sandbox = fresh cache', () => {
    const s1 = buildSandboxGlobals();
    const s2 = buildSandboxGlobals();
    const a = (s1.boxGeo as typeof boxGeo)(1, 1, 1);
    const b = (s2.boxGeo as typeof boxGeo)(1, 1, 1);
    // Different sandbox -> different cached instance even with same args.
    expect(a).not.toBe(b);
  });

  test('cache hits still tick the usage counter', () => {
    const usage: Record<string, number> = {};
    const sandbox = buildSandboxGlobals(usage);
    (sandbox.boxGeo as typeof boxGeo)(1, 2, 3);
    (sandbox.boxGeo as typeof boxGeo)(1, 2, 3);
    (sandbox.boxGeo as typeof boxGeo)(1, 2, 3);
    expect(usage.boxGeo).toBe(3);
  });

  test('cache spans different geometry families independently', () => {
    const sandbox = buildSandboxGlobals();
    const box = (sandbox.boxGeo as typeof boxGeo)(1, 1, 1);
    const sphere = (sandbox.sphereGeo as typeof sphereGeo)(1);
    const cyl = (sandbox.cylinderGeo as typeof cylinderGeo)(1, 1, 1);
    // Each is independent; caching doesn't collide across primitive names.
    expect(box).not.toBe(sphere);
    expect(box).not.toBe(cyl);
    expect(sphere).not.toBe(cyl);
  });

  // ---- Mesh-range / sub-shape mapping (Wave 3 B3) -------------------------

  test('sandbox primitives stamp userData.kilnRanges with one entry covering all triangles', () => {
    const sandbox = buildSandboxGlobals();
    const geo = (sandbox.boxGeo as typeof boxGeo)(1, 1, 1);
    const ranges = (geo.userData as Record<string, unknown>).kilnRanges as
      | Array<{ name: string; start: number; count: number }>
      | undefined;
    expect(Array.isArray(ranges)).toBe(true);
    expect(ranges).toHaveLength(1);
    expect(ranges![0]!.name).toMatch(/^boxGeo#\d+$/);
    expect(ranges![0]!.start).toBe(0);
    // Box has 12 tris regardless of size.
    expect(ranges![0]!.count).toBe(12);
  });

  test('kilnRanges name carries the primitive function name', () => {
    const sandbox = buildSandboxGlobals();
    const cyl = (sandbox.cylinderGeo as typeof cylinderGeo)(1, 1, 1, 8);
    const ranges = (cyl.userData as Record<string, unknown>).kilnRanges as
      | Array<{ name: string; start: number; count: number }>
      | undefined;
    expect(ranges![0]!.name).toMatch(/^cylinderGeo#\d+$/);
  });

  test('different primitive calls get distinct kilnRange call ids', () => {
    const sandbox = buildSandboxGlobals();
    const a = (sandbox.boxGeo as typeof boxGeo)(1, 1, 1);
    const b = (sandbox.boxGeo as typeof boxGeo)(2, 2, 2);
    const idA = ((a.userData as Record<string, unknown>).kilnRanges as Array<{ name: string }>)[0]!
      .name;
    const idB = ((b.userData as Record<string, unknown>).kilnRanges as Array<{ name: string }>)[0]!
      .name;
    expect(idA).not.toBe(idB);
  });

  test('coneGeo with default segments', () => {
    const g = coneGeo(1, 2);
    expect(g).toBeInstanceOf(THREE.ConeGeometry);
    expect(g.parameters.radialSegments).toBe(8);
  });

  test('axis-specific cone helpers point toward +X and +Z', () => {
    const x = coneXGeo(0.5, 2, 8);
    const z = coneZGeo(0.5, 2, 8);
    const xSize = geometrySize(x);
    const zSize = geometrySize(z);
    expect(xSize.x).toBeCloseTo(2);
    expect(zSize.z).toBeCloseTo(2);
  });

  test('capsuleGeo with default segments', () => {
    const g = capsuleGeo(0.5, 1);
    expect(g).toBeInstanceOf(THREE.CapsuleGeometry);
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  });

  test('axis-specific capsule helpers align length to requested axis', () => {
    const x = geometrySize(capsuleXGeo(0.2, 2, 6));
    const z = geometrySize(capsuleZGeo(0.2, 3, 6));
    expect(x.x).toBeGreaterThan(x.y);
    expect(z.z).toBeGreaterThan(z.y);
  });

  test('torusGeo with custom segments', () => {
    const g = torusGeo(1, 0.25, 16, 24);
    expect(g).toBeInstanceOf(THREE.TorusGeometry);
    expect(g.parameters.radialSegments).toBe(16);
    expect(g.parameters.tubularSegments).toBe(24);
  });

  test('planeGeo', () => {
    const g = planeGeo(2, 2);
    expect(g).toBeInstanceOf(THREE.PlaneGeometry);
  });

  test('wingGeo builds a swept trapezoid panel extending along +Z', () => {
    const g = wingGeo({
      span: 2,
      rootChord: 0.8,
      tipChord: 0.3,
      sweep: 0.25,
      thickness: 0.06,
      dihedral: 0.08,
    });
    const size = geometrySize(g);

    expect(g).toBeInstanceOf(THREE.BufferGeometry);
    expect(size.z).toBeCloseTo(2);
    expect(size.x).toBeGreaterThan(0.75);
    expect(size.y).toBeGreaterThan(0.05);
  });
});

// =============================================================================
// Materials
// =============================================================================

describe('materials carry option settings', () => {
  test('gameMaterial defaults', () => {
    const m = gameMaterial(0xff0000);
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.metalness).toBe(0);
    expect(m.roughness).toBe(0.8);
    expect(m.flatShading).toBe(true);
  });

  test('gameMaterial overrides applied', () => {
    const m = gameMaterial('#00ff00', {
      metalness: 0.5,
      roughness: 0.2,
      emissive: 0x111111,
      emissiveIntensity: 2,
      flatShading: false,
    });
    expect(m.metalness).toBe(0.5);
    expect(m.roughness).toBe(0.2);
    expect(m.emissiveIntensity).toBe(2);
    expect(m.flatShading).toBe(false);
  });

  test('basicMaterial defaults and transparency override', () => {
    const def = basicMaterial(0xffffff);
    expect(def).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(def.transparent).toBe(false);
    expect(def.opacity).toBe(1);

    const trans = basicMaterial(0xffffff, { transparent: true, opacity: 0.5 });
    expect(trans.transparent).toBe(true);
    expect(trans.opacity).toBe(0.5);
  });

  test('glassMaterial is transparent and double-sided', () => {
    const m = glassMaterial(0x88ccff);
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(0.35);
    expect(m.side).toBe(THREE.DoubleSide);
  });

  test('glassMaterial accepts custom options', () => {
    const m = glassMaterial(0x88ccff, { opacity: 0.2, roughness: 0.5, metalness: 0.3 });
    expect(m.opacity).toBe(0.2);
    expect(m.roughness).toBe(0.5);
    expect(m.metalness).toBe(0.3);
  });

  test('lambertMaterial defaults and overrides', () => {
    const def = lambertMaterial(0xffffff);
    expect(def).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(def.flatShading).toBe(true);

    const overridden = lambertMaterial(0xffffff, {
      flatShading: false,
      emissive: 0x222222,
    });
    expect(overridden.flatShading).toBe(false);
  });
});

// =============================================================================
// Animation track helpers
// =============================================================================

describe('keyframe track helpers', () => {
  test('rotationTrack produces a QuaternionKeyframeTrack with 4 values per frame', () => {
    const t = rotationTrack('Joint_X', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [90, 0, 0] },
    ]);
    expect(t).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
    expect(t.name).toBe('Joint_X.quaternion');
    expect(t.times.length).toBe(2);
    // 2 keyframes × 4 quaternion components.
    expect(t.values.length).toBe(8);
  });

  test('positionTrack produces a VectorKeyframeTrack with 3 values per frame', () => {
    const t = positionTrack('Joint_Y', [
      { time: 0, position: [0, 0, 0] },
      { time: 0.5, position: [1, 2, 3] },
    ]);
    expect(t).toBeInstanceOf(THREE.VectorKeyframeTrack);
    expect(t.name).toBe('Joint_Y.position');
    expect(t.values.length).toBe(6);
  });

  test('scaleTrack produces a VectorKeyframeTrack with 3 values per frame', () => {
    const t = scaleTrack('Joint_Z', [
      { time: 0, scale: [1, 1, 1] },
      { time: 1, scale: [2, 2, 2] },
    ]);
    expect(t).toBeInstanceOf(THREE.VectorKeyframeTrack);
    expect(t.name).toBe('Joint_Z.scale');
    expect(t.values).toEqual(new Float32Array([1, 1, 1, 2, 2, 2]));
  });

  test('createClip wraps tracks in a named AnimationClip', () => {
    const track = rotationTrack('Joint_X', [{ time: 0, rotation: [0, 0, 0] }]);
    const clip = createClip('Wave', 1.5, [track]);
    expect(clip).toBeInstanceOf(THREE.AnimationClip);
    expect(clip.name).toBe('Wave');
    expect(clip.duration).toBe(1.5);
    expect(clip.tracks).toEqual([track]);
  });
});

// =============================================================================
// Animation patterns
// =============================================================================

describe('common animation patterns', () => {
  test('idleBreathing produces a 3-keyframe positionTrack on the body joint', () => {
    const clip = idleBreathing('Joint_Chest', 2, 0.05);
    expect(clip.name).toBe('Idle');
    expect(clip.duration).toBe(2);
    expect(clip.tracks.length).toBe(1);
    expect(clip.tracks[0]?.name).toBe('Joint_Chest.position');
    // 3 keyframes × 3 components = 9.
    expect(clip.tracks[0]?.values.length).toBe(9);
  });

  test('bobbingAnimation oscillates a root', () => {
    const clip = bobbingAnimation('Floater', 1, 0.2);
    expect(clip.name).toBe('Bob');
    expect(clip.duration).toBe(1);
    expect(clip.tracks[0]?.name).toBe('Floater.position');
  });

  test('spinAnimation defaults to Y axis', () => {
    const clip = spinAnimation('Joint_Wheel');
    expect(clip.name).toBe('Spin');
    expect(clip.tracks.length).toBe(1);
    expect(clip.tracks[0]?.name).toBe('Joint_Wheel.quaternion');
    // 5 keyframes × 4 quaternion components.
    expect(clip.tracks[0]?.values.length).toBe(20);
  });

  test('spinAnimation accepts an explicit axis', () => {
    const xClip = spinAnimation('Joint_Wheel', 1, 'x');
    const zClip = spinAnimation('Joint_Wheel', 1, 'z');
    // We don't introspect quaternion contents; we just confirm both
    // produce valid clips on the requested joint - meaning all three
    // axis branches are taken.
    expect(xClip.tracks[0]?.name).toBe('Joint_Wheel.quaternion');
    expect(zClip.tracks[0]?.name).toBe('Joint_Wheel.quaternion');
  });
});

// =============================================================================
// Analysis helpers
// =============================================================================

describe('countTriangles / countMaterials / getJointNames', () => {
  function buildScene(): THREE.Object3D {
    const root = createRoot('Demo');
    createPivot('Hip', [0, 0, 0], root);
    createPart('Head', sphereGeo(0.3, 8, 6), gameMaterial(0xff0000), {
      pivot: true,
      parent: root,
    });
    createPart('Body', boxGeo(0.5, 1, 0.3), gameMaterial(0x00ff00), {
      parent: root,
    });
    return root;
  }

  test('countTriangles counts both indexed and non-indexed geometry', () => {
    const root = buildScene();
    const tris = countTriangles(root);
    // Box = 12 tris, sphere(8,6) ≈ 80 tris (indexed, poles share verts).
    // The exact number depends on Three.js's primitive builder; we just
    // need to confirm both indexed (sphere) and non-indexed paths are
    // exercised and produce a reasonable total.
    expect(tris).toBeGreaterThan(50);
    expect(tris).toBeLessThan(200);
  });

  test('countTriangles handles a non-indexed geometry as well', () => {
    const root = createRoot('R');
    const geo = new THREE.BufferGeometry();
    // A single triangle (3 verts, 9 floats), no index.
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    root.add(new THREE.Mesh(geo, gameMaterial(0x0)));
    expect(countTriangles(root)).toBe(1);
  });

  test('countMaterials returns the number of unique materials in the scene', () => {
    const root = buildScene();
    expect(countMaterials(root)).toBe(2);
  });

  test('countMaterials handles arrays of materials per mesh', () => {
    const root = createRoot('R');
    const mesh = new THREE.Mesh(boxGeo(1, 1, 1), [gameMaterial(0xff0000), gameMaterial(0x00ff00)]);
    root.add(mesh);
    expect(countMaterials(root)).toBe(2);
  });

  test('getJointNames returns every Joint_* in the tree', () => {
    const root = buildScene();
    const joints = getJointNames(root);
    expect(joints).toContain('Joint_Hip');
    expect(joints).toContain('Joint_Head');
    expect(joints.length).toBe(2);
  });
});

// =============================================================================
// materialBudgetAdvisory advisory
// =============================================================================

describe('materialBudgetAdvisory counts', () => {
  test('returns counts without declaring validity or supplying a category budget', () => {
    const root = createRoot('Tiny');
    createPart('Body', boxGeo(1, 1, 1), gameMaterial(0xff0000), { parent: root });
    expect(materialBudgetAdvisory(root)).toEqual({
      materialCount: 1,
      maxMaterials: null,
      exceeded: null,
      warnings: [],
    });
  });

  test('does not convert triangle density into an asset or runtime verdict', () => {
    const root = createRoot('Heavy');
    createPart('Big', sphereGeo(2, 64, 64), gameMaterial(0x00ff00), { parent: root });
    expect(countTriangles(root)).toBeGreaterThan(3000);
    expect(materialBudgetAdvisory(root, { maxMaterials: 1 }).warnings).toEqual([]);
  });

  test('warns only against the explicit requested material count', () => {
    const root = createRoot('ManyMats');
    for (let i = 0; i < 20; i++)
      createPart(`P${i}`, boxGeo(1, 1, 1), gameMaterial(i), { parent: root });
    expect(materialBudgetAdvisory(root).warnings).toEqual([]);
    expect(materialBudgetAdvisory(root, { maxMaterials: 4 })).toMatchObject({
      materialCount: 20,
      maxMaterials: 4,
      exceeded: true,
    });
    expect(materialBudgetAdvisory(root, { maxMaterials: 4 }).warnings.length).toBe(1);
  });
});

// =============================================================================
// Sandbox globals export
// =============================================================================

describe('buildSandboxGlobals', () => {
  test('exposes every primitive the LLM is told it can use', () => {
    const globals = buildSandboxGlobals();
    const expected = [
      'createRoot',
      'createPivot',
      'createPart',
      'beamBetween',
      'createLadder',
      'createWingPair',
      'capsuleGeo',
      'capsuleXGeo',
      'capsuleZGeo',
      'cylinderGeo',
      'cylinderXGeo',
      'cylinderZGeo',
      'boxGeo',
      'sphereGeo',
      'coneGeo',
      'coneXGeo',
      'coneZGeo',
      'torusGeo',
      'planeGeo',
      'wingGeo',
      'gameMaterial',
      'basicMaterial',
      'glassMaterial',
      'lambertMaterial',
      'rotationTrack',
      'positionTrack',
      'scaleTrack',
      'createClip',
      'spinAnimation',
      'bobbingAnimation',
      'idleBreathing',
      'countTriangles',
      'countMaterials',
      'getJointNames',
      'materialBudgetAdvisory',
      'seededRandom',
      'Math',
      'console',
    ];
    for (const name of expected) {
      expect(globals[name]).toBeDefined();
    }
  });

  test('when given a usage map, tallies primitive invocations', () => {
    const usage: Record<string, number> = {};
    const globals = buildSandboxGlobals(usage) as Record<string, (...a: unknown[]) => unknown>;

    // Call a spread of primitives with varying counts.
    globals.createRoot!('R');
    globals.createRoot!('R2');
    globals.createRoot!('R3');
    globals.boxGeo!(1, 1, 1);
    globals.boxGeo!(2, 2, 2);
    globals.sphereGeo!(0.5);
    globals.gameMaterial!(0xff0000);

    expect(usage.createRoot).toBe(3);
    expect(usage.boxGeo).toBe(2);
    expect(usage.sphereGeo).toBe(1);
    expect(usage.gameMaterial).toBe(1);
    // Unused primitive has no entry.
    expect(usage.torusGeo).toBeUndefined();
  });

  test('usage map is isolated per call', () => {
    const usageA: Record<string, number> = {};
    const usageB: Record<string, number> = {};
    const gA = buildSandboxGlobals(usageA) as Record<string, (...a: unknown[]) => unknown>;
    const gB = buildSandboxGlobals(usageB) as Record<string, (...a: unknown[]) => unknown>;

    gA.createRoot!('A');
    gB.createRoot!('B');
    gB.createRoot!('B2');

    expect(usageA.createRoot).toBe(1);
    expect(usageB.createRoot).toBe(2);
  });

  test('without a usage map, geometry primitives still produce valid output', () => {
    // Round 4: caching is now baseline — geometry primitives go through a
    // per-sandbox memo wrapper even without usage instrumentation. The
    // wrapper is observably equivalent to the raw primitive for first-call
    // semantics (returns a real BufferGeometry of the right type).
    const globals = buildSandboxGlobals() as Record<string, unknown>;
    const fn = globals.boxGeo as (w: number, h: number, d: number) => THREE.BoxGeometry;
    const geo = fn(1, 1, 1);
    expect(geo).toBeInstanceOf(THREE.BoxGeometry);
    expect(geo.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('material constructors reject an options object in the color slot', () => {
  /**
   * `gameMaterial({ color, roughness, metalness })` is what a model writes when
   * it is remembering some other engine's API, and until this guard existed it
   * was not an error: three.js leaves `Color.set` alone for a plain object, so
   * the material came back white with default roughness, and the asset shipped
   * with a handful of flat white parts nobody had chosen. Failing closed is the
   * same treatment an invented texture ID already gets.
   */
  const cases: Array<[string, (c: unknown) => unknown]> = [
    ['gameMaterial', (c) => gameMaterial(c as number)],
    ['basicMaterial', (c) => basicMaterial(c as number)],
    ['glassMaterial', (c) => glassMaterial(c as number)],
    ['lambertMaterial', (c) => lambertMaterial(c as number)],
  ];

  for (const [name, call] of cases) {
    test(`${name} names the mistake instead of returning white`, () => {
      expect(() => call({ color: 0x8c4a32, roughness: 0.5 })).toThrow(/color must be a hex number/);
      // The message has to be actionable: the model needs to be told where the
      // settings actually go, not just that it was wrong.
      expect(() => call({ color: 0x8c4a32 })).toThrow(/SECOND argument/);
      expect(() => call(undefined)).toThrow(/color must be a hex number/);
    });
  }

  test('the two real shapes still work', () => {
    expect(gameMaterial(0x8c4a32, { roughness: 0.5, metalness: 0.9 }).roughness).toBe(0.5);
    expect(gameMaterial('#8c4a32').color.getHexString()).toBe('8c4a32');
  });
});

describe('createPart rejects a wrong call instead of failing later', () => {
  // Every case here is a real mistake a dispatched model made. `new THREE.Mesh()`
  // swallows all of them and the program dies much later in the exporter, with a
  // message that names a three.js internal and nothing the author wrote. A model
  // reading that has no way back, so it burns its remaining turns guessing. The
  // assertions below are about the *message*, not the throw: what matters is that
  // it says which argument, what arrived, and what the right call looks like.

  const geo = boxGeo(1, 1, 1);
  const mat = gameMaterial(0x808080);

  test('the parent passed first, the shape most other scene APIs take', () => {
    const root = createRoot('Root');
    expect(() =>
      // @ts-expect-error deliberately the wrong call
      createPart(root, { name: 'box', geo: boxGeo, material: mat }),
    ).toThrow(/first argument is the part NAME.*Object3D.*parent belongs in the options object/s);
  });

  test('a geometry helper referenced instead of called', () => {
    // @ts-expect-error deliberately the wrong call
    expect(() => createPart('Hull', boxGeo, mat)).toThrow(/have to be CALLED/);
  });

  test('an async geometry helper left un-awaited', () => {
    // roundedBoxGeo resolves through WASM, so forgetting the await hands
    // createPart a Promise. Saying so is the whole fix: the model needs to know
    // that build() has to be async too.
    // @ts-expect-error deliberately the wrong call
    expect(() => createPart('Hull', Promise.resolve(geo), mat)).toThrow(/Promise.*await/s);
  });

  test('a colour passed where a material belongs', () => {
    // @ts-expect-error deliberately the wrong call
    expect(() => createPart('Hull', geo, 0x808080)).toThrow(/a colour is not a material/);
  });

  test('every message carries the signature it wants back', () => {
    for (const bad of [
      // @ts-expect-error deliberately the wrong call
      () => createPart(null, geo, mat),
      // @ts-expect-error deliberately the wrong call
      () => createPart('Hull', undefined, mat),
      // @ts-expect-error deliberately the wrong call
      () => createPart('Hull', geo, undefined),
    ]) {
      expect(bad).toThrow(/createPart\(name, geometry, material, options\?\)/);
    }
  });

  test('the right call is untouched', () => {
    const part = createPart('Hull', boxGeo(1, 1, 1), gameMaterial(0x808080));
    expect(part).toBeInstanceOf(THREE.Object3D);
    expect(part.name).toBe('Mesh_Hull');
  });

  test('a geometry from another copy of three is still a geometry', () => {
    // `three-subdivide` resolves its own three, so `subdivide()` returns a
    // geometry whose prototype chain is not this module's. An `instanceof`
    // check rejects it, and the first version of this guard did -- it broke the
    // lighthouse, whose rocks are subdivided icosahedra. The duck-typed flags
    // three ships for exactly this case are what the guard tests now, so the
    // stand-in below has to pass.
    const foreign = Object.assign(Object.create(null), {
      isBufferGeometry: true,
      attributes: {},
      morphAttributes: {},
    }) as unknown as THREE.BufferGeometry;
    expect(() => createPart('Rock', foreign, mat)).not.toThrow();
  });
});
