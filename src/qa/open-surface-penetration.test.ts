/**
 * #277 — open surfaces measured against closed solids.
 *
 * The difficulty is the same as T4.1's and sharper: a cloth has no volume, so
 * the boolean pass cannot measure it at all, and the true negatives are the
 * whole problem. A throw resting on a seat, a canopy touching its mast and a
 * cloth deliberately sunk a millimetre or two to hide a seam are all correct
 * geometry. Every one has a fixture here beside the true positives.
 */

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  analyzeOpenSurfacePenetration,
  inspectOpenSurfacePenetration,
  OPEN_SURFACE_CONTACT_TOLERANCE,
  OPEN_SURFACE_PENETRATION_QA_RULE,
} from './open-surface-penetration';
import { analyzePartPenetration } from './self-intersection';
import { EXTERNAL_SUPPORT_TOLERANCE } from '../external-support';
import { createAssetIntentV1 } from '../contracts';
import { markOpenShell } from '../open-shell';

function solid(name: string, size: [number, number, number], at: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

/** An open surface: one plane, no thickness, no volume. */
function cloth(
  name: string,
  size: [number, number],
  at: [number, number, number],
  rotationX = -Math.PI / 2,
  segments = 8,
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1], segments, segments));
  mesh.name = name;
  mesh.rotation.x = rotationX;
  mesh.position.set(...at);
  return mesh;
}

function sceneOf(...nodes: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = 'Asset';
  for (const node of nodes) root.add(node);
  return root;
}

describe('true positives — an open surface inside a closed solid', () => {
  test('a cloth running through a wall names both parts and the depth', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]),
        cloth('Mesh_ThrowBlanket', [1, 1], [0, 0.7, 0.4], 0),
      ),
    );
    expect(evidence.penetrations).toHaveLength(1);
    const [pair] = evidence.penetrations;
    expect(pair!.open).toBe('Mesh_ThrowBlanket');
    expect(pair!.solid).toBe('Mesh_CurvedWall');
    // The cloth sits on the wall's mid-plane, so the nearest face is half its thickness away.
    expect(pair!.depth).toBeCloseTo(0.06, 4);
    const [finding] = inspectOpenSurfacePenetration(evidence);
    expect(finding!.code).toBe('GEO_OPEN_SURFACE_PENETRATION');
    expect(finding!.message).toContain('Mesh_ThrowBlanket');
    expect(finding!.message).toContain('Mesh_CurvedWall');
    expect(finding!.message).toContain('0.0600');
  });

  test('a canopy pierced by one mast is reported from a single penetrating vertex', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_Mast', [0.06, 2, 0.06], [0, 1, 0]),
        cloth('Mesh_Canopy', [1.2, 1.2], [0, 1, 0]),
      ),
    );
    expect(evidence.penetrations).toHaveLength(1);
    expect(evidence.penetrations[0]!.vertices).toBe(1);
    expect(evidence.penetrations[0]!.depth).toBeCloseTo(0.03, 4);
  });
});

describe('true negatives — correct geometry that must stay silent', () => {
  test('a cloth resting exactly on a seat top is contact, not penetration', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_Seat', [1, 0.4, 1], [0, 0.2, 0]),
        cloth('Mesh_Throw', [0.8, 0.8], [0, 0.4, 0]),
      ),
    );
    expect(evidence.candidatePairs).toBe(1);
    expect(evidence.penetrations).toEqual([]);
    expect(inspectOpenSurfacePenetration(evidence)).toEqual([]);
  });

  test('a cloth sunk inside the contact tolerance to hide a seam stays silent', () => {
    const sunk = OPEN_SURFACE_CONTACT_TOLERANCE / 2;
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_Cushion', [1, 0.4, 1], [0, 0.2, 0]),
        cloth('Mesh_Throw', [0.8, 0.8], [0, 0.4 - sunk, 0]),
      ),
    );
    expect(evidence.penetrations).toEqual([]);
  });

  test('a cloth clear above a seat is neither contact nor penetration', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_Seat', [1, 0.4, 1], [0, 0.2, 0]),
        cloth('Mesh_Throw', [0.8, 0.8], [0, 0.45, 0]),
      ),
    );
    expect(evidence.candidatePairs).toBe(0);
    expect(evidence.penetrations).toEqual([]);
  });

  test('two closed solids are left to the boolean pass', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(solid('Mesh_A', [1, 1, 1], [0, 0, 0]), solid('Mesh_B', [1, 1, 1], [0.5, 0, 0])),
    );
    expect(evidence.openParts).toBe(0);
    expect(evidence.candidatePairs).toBe(0);
    expect(evidence.penetrations).toEqual([]);
  });
});

describe('composed modules', () => {
  test('a cloth from one module through a wall in another is reported', () => {
    const seating = new THREE.Group();
    seating.name = 'SeatingModule';
    seating.add(solid('Mesh_Bench', [1.2, 0.4, 0.5], [0, 0.2, 0]));
    seating.add(cloth('Mesh_ThrowBlanket', [1, 1], [0, 0.7, 0.4], 0));
    const structure = new THREE.Group();
    structure.name = 'StructureModule';
    structure.add(solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]));
    const evidence = analyzeOpenSurfacePenetration(sceneOf(seating, structure));
    expect(evidence.penetrations.map((pair) => [pair.open, pair.solid])).toEqual([
      ['Mesh_ThrowBlanket', 'Mesh_CurvedWall'],
    ]);
  });
});

describe('the tolerance regime', () => {
  test('penetration uses its own tolerance, not the 2 cm adjacency tolerance', () => {
    expect(OPEN_SURFACE_CONTACT_TOLERANCE).toBeLessThan(EXTERNAL_SUPPORT_TOLERANCE);
    expect(EXTERNAL_SUPPORT_TOLERANCE).toBe(0.02);
  });

  test('a cloth 1 cm inside a 3 cm panel is reported, where a 2 cm tolerance would hide it', () => {
    // The panel's mid-plane is 15 mm from either face, so a cloth on it reads 15 mm:
    // under the adjacency tolerance, over this pass's.
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_WallCap', [1.5, 0.4, 0.03], [0, 0.5, 0]),
        cloth('Mesh_Throw', [0.6, 0.3], [0, 0.5, 0], 0),
      ),
    );
    expect(evidence.penetrations).toHaveLength(1);
    expect(evidence.penetrations[0]!.depth).toBeCloseTo(0.015, 4);
    expect(evidence.penetrations[0]!.depth).toBeLessThan(EXTERNAL_SUPPORT_TOLERANCE);
  });

  test('an explicit tolerance widens intended contact without changing the measurement', () => {
    const build = () =>
      sceneOf(
        solid('Mesh_Cushion', [1, 0.4, 1], [0, 0.2, 0]),
        cloth('Mesh_Throw', [0.8, 0.8], [0, 0.39, 0]),
      );
    expect(analyzeOpenSurfacePenetration(build()).penetrations).toHaveLength(1);
    expect(analyzeOpenSurfacePenetration(build(), 0.02).penetrations).toEqual([]);
  });
});

describe('coverage this pass does not claim', () => {
  test('a marked open shell is measured here, which the volume pass says it cannot be', async () => {
    const throwBlanket = cloth('Mesh_ThrowBlanket', [1, 1], [0, 0.7, 0.4], 0);
    markOpenShell(throwBlanket, 'a single-sided wool throw');
    const scene = sceneOf(solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]), throwBlanket);
    // The volume pass can only acknowledge the mark; this one takes the measurement.
    const volume = await analyzePartPenetration(scene);
    expect(volume.penetrations).toEqual([]);
    expect(volume.acknowledged?.map((part) => part.part)).toEqual(['Mesh_ThrowBlanket']);
    expect(analyzeOpenSurfacePenetration(scene).penetrations).toHaveLength(1);
  });

  test('a solid thinner than the surface facet spacing passes between vertices unreported', () => {
    // One quad, 1 m across, and a 2 cm post through its middle: no vertex is inside.
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_Post', [0.02, 2, 0.02], [0, 1, 0]),
        cloth('Mesh_Canopy', [1, 1], [0, 1, 0], -Math.PI / 2, 1),
      ),
    );
    expect(evidence.candidatePairs).toBe(1);
    expect(evidence.penetrations).toEqual([]);
  });

  test('LOD alternates are not compared', () => {
    const low = new THREE.Group();
    low.name = 'Awning_LOD1';
    low.add(cloth('Mesh_AwningCloth', [1, 1], [0, 0.7, 0.4], 0));
    const high = new THREE.Group();
    high.name = 'Awning_LOD0';
    high.add(solid('Mesh_AwningFrame', [2, 1.4, 0.12], [0, 0.7, 0.4]));
    const evidence = analyzeOpenSurfacePenetration(sceneOf(low, high));
    expect(evidence.pairsLodAlternates).toBe(1);
    expect(evidence.candidatePairs).toBe(0);
    expect(evidence.penetrations).toEqual([]);
  });

  test('an instanced part is named as unmeasured rather than dropped', () => {
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), undefined, 2);
    instanced.name = 'Mesh_Pebbles';
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(instanced, cloth('Mesh_Throw', [1, 1], [0, 0, 0])),
    );
    expect(evidence.skipped.map((part) => part.part)).toEqual(['Mesh_Pebbles']);
    const codes = inspectOpenSurfacePenetration(evidence).map((finding) => finding.code);
    expect(codes).toContain('GEO_OPEN_SURFACE_PENETRATION_UNMEASURED');
  });

  test('a non-Object3D scene yields an empty measurement, never a clean pass claim', () => {
    const evidence = analyzeOpenSurfacePenetration(undefined);
    expect(evidence.openParts).toBe(0);
    expect(evidence.closedParts).toBe(0);
    expect(inspectOpenSurfacePenetration(evidence)).toEqual([]);
  });
});

describe('determinism and wiring', () => {
  test('the same scene yields the same evidence', () => {
    const build = () =>
      sceneOf(
        solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]),
        solid('Mesh_Mast', [0.06, 2, 0.06], [0.4, 1, 0.4]),
        cloth('Mesh_ThrowBlanket', [1.4, 1.4], [0, 0.7, 0.4], 0),
      );
    const first = analyzeOpenSurfacePenetration(build());
    expect(JSON.stringify(analyzeOpenSurfacePenetration(build()))).toBe(JSON.stringify(first));
    expect(first.penetrations.map((pair) => pair.solid)).toEqual(['Mesh_CurvedWall']);
  });

  test('the rule takes its own measurement from the scene', () => {
    const findings = OPEN_SURFACE_PENETRATION_QA_RULE.evaluate({
      intent: createAssetIntentV1({ category: 'prop' }),
      scene: sceneOf(
        solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]),
        cloth('Mesh_ThrowBlanket', [1, 1], [0, 0.7, 0.4], 0),
      ),
    });
    expect(findings.map((finding) => finding.code)).toEqual(['GEO_OPEN_SURFACE_PENETRATION']);
    expect(findings[0]!.disposition).toBe('observe');
    expect(findings[0]!.dimension).toBe('visualQuality');
  });
});

describe('reported coverage', () => {
  const base = {
    schemaVersion: 1 as const,
    source: 'engine-scene-analysis' as const,
    contactTolerance: OPEN_SURFACE_CONTACT_TOLERANCE,
    openParts: 2,
    closedParts: 2,
    candidatePairs: 4,
    pairsTested: 1,
    pairsNotReached: 3,
    pairsLodAlternates: 0,
    verticesUnresolved: 0,
    truncated: true,
    skipped: [],
    penetrations: [],
  };

  test('a budget shortfall names the pairs it did not sample', () => {
    const [finding] = inspectOpenSurfacePenetration(base);
    expect(finding!.code).toBe('GEO_OPEN_SURFACE_PENETRATION_TRUNCATED');
    expect(finding!.message).toContain('Sampled 1 of 4');
    expect(finding!.message).not.toContain('could not be resolved');
    expect(finding!.measurement!.breakdown).toEqual({
      pairsNotReached: 3,
      verticesUnresolved: 0,
    });
  });

  test('unresolved vertices are reported apart from the budget, not as skipped work', () => {
    const [finding] = inspectOpenSurfacePenetration({
      ...base,
      pairsTested: 4,
      pairsNotReached: 0,
      truncated: false,
      verticesUnresolved: 2,
    });
    expect(finding!.code).toBe('GEO_OPEN_SURFACE_PENETRATION_TRUNCATED');
    expect(finding!.message).not.toContain('analysis budget');
    expect(finding!.message).toContain('2 vertices');
    expect(finding!.message).toContain('counted as neither');
  });

  test('complete coverage reports nothing', () => {
    expect(
      inspectOpenSurfacePenetration({
        ...base,
        pairsTested: 4,
        pairsNotReached: 0,
        truncated: false,
      }),
    ).toEqual([]);
  });
});

describe('a positive is a measurement, not a verdict', () => {
  /**
   * Measured over the 86 shipped examples, 916 findings across 51 of them, against
   * 3,575 from the part-volume pass across all 86. The dominant real case is not
   * cloth: it is a fitting socketed into a structural shell, which is correct
   * geometry and is still reported, exactly as the volume pass reports a bolt in a
   * hole. This fixture pins that, so the pass is never mistaken for a defect gate.
   */
  test('a fitting socketed into a hull shell is reported, like a bolt in a hole', () => {
    // An open hull panel with a lamp recess set into it: the recess is meant to be there.
    const hull = cloth('Mesh_HullPanel', [2, 1.2], [0, 0.6, 0], 0, 12);
    const recess = solid('Mesh_LampRecess', [0.12, 0.12, 0.2], [0, 0.6, 0]);
    const evidence = analyzeOpenSurfacePenetration(sceneOf(recess, hull));
    expect(evidence.penetrations).toHaveLength(1);
    const [finding] = inspectOpenSurfacePenetration(evidence);
    expect(finding!.disposition).toBe('observe');
    expect(finding!.repairText).toContain('not a defect');
    expect(finding!.repairText).toContain('a bolt in a hole');
  });

  test('the finding carries the depth as a measurement against the tolerance', () => {
    const evidence = analyzeOpenSurfacePenetration(
      sceneOf(
        solid('Mesh_CurvedWall', [2, 1.4, 0.12], [0, 0.7, 0.4]),
        cloth('Mesh_ThrowBlanket', [1, 1], [0, 0.7, 0.4], 0),
      ),
    );
    const [finding] = inspectOpenSurfacePenetration(evidence);
    expect(finding!.measurement).toMatchObject({
      name: 'openSurfacePenetrationDepth',
      expected: OPEN_SURFACE_CONTACT_TOLERANCE,
      unit: 'm',
    });
    expect(finding!.measurement!.actual).toBeCloseTo(0.06, 4);
  });
});
