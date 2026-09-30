/**
 * T4.1 — part-vs-part self-intersection.
 *
 * The gate's whole difficulty is the true negatives: bounding boxes call a bolt
 * in a hole an intersection, and triangle overlap cannot tell a lid resting on a
 * box from a lid sunk into it. Both are correct geometry that must not be
 * flagged, so both have fixtures here alongside the true positives.
 */

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  analyzePartPenetration,
  CONTACT_VOLUME_FRACTION,
  MAX_PART_TRIANGLES,
  SELF_INTERSECTION_QA_RULE,
} from './self-intersection';
import type { QaContext } from './types';
import { createAssetIntentV1 } from '../contracts';

function boxAt(name: string, size: [number, number, number], at: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

function sceneOf(...meshes: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = 'Asset';
  for (const m of meshes) root.add(m);
  return root;
}

const pairNames = (e: { penetrations: { a: string; b: string }[] }) =>
  e.penetrations.map((p) => [p.a, p.b]);

// -----------------------------------------------------------------------------
// True positives
// -----------------------------------------------------------------------------

describe('true positives — parts occupying the same space', () => {
  test('two boxes overlapping by half report the shared volume and fraction', async () => {
    const e = await analyzePartPenetration(
      sceneOf(boxAt('A', [1, 1, 1], [0, 0, 0]), boxAt('B', [1, 1, 1], [0.5, 0, 0])),
    );

    expect(pairNames(e)).toEqual([['A', 'B']]);
    // A 1x1x1 box overlapping another by 0.5 along x shares exactly 0.5 m³,
    // which is half of either part.
    expect(e.penetrations[0]!.volume).toBeCloseTo(0.5, 6);
    expect(e.penetrations[0]!.fraction).toBeCloseTo(0.5, 6);
  });

  test('a fully contained part reports a fraction of 1', async () => {
    const e = await analyzePartPenetration(
      sceneOf(boxAt('Outer', [2, 2, 2], [0, 0, 0]), boxAt('Inner', [0.5, 0.5, 0.5], [0, 0, 0])),
    );

    expect(e.penetrations).toHaveLength(1);
    expect(e.penetrations[0]!.fraction).toBeCloseTo(1, 6);
  });

  test('worst offender is reported first', async () => {
    const e = await analyzePartPenetration(
      sceneOf(
        boxAt('Base', [4, 1, 1], [0, 0, 0]),
        boxAt('Slight', [1, 1, 1], [1.95, 0, 0]),
        boxAt('Deep', [1, 1, 1], [-1.2, 0, 0]),
      ),
    );

    expect(e.penetrations.length).toBeGreaterThanOrEqual(2);
    expect(e.penetrations[0]!.fraction).toBeGreaterThan(e.penetrations[1]!.fraction);
    expect(e.penetrations[0]!.b).toBe('Deep');
  });
});

// -----------------------------------------------------------------------------
// True negatives — the reason this is a volume test
// -----------------------------------------------------------------------------

describe('true negatives — correct geometry that must not be flagged', () => {
  test('parts in flush contact share a surface, not a volume', async () => {
    // A lid sitting exactly on a box. Triangle overlap would call this a hit.
    const e = await analyzePartPenetration(
      sceneOf(boxAt('Box', [1, 1, 1], [0, 0, 0]), boxAt('Lid', [1, 0.1, 1], [0, 0.55, 0])),
    );

    expect(e.candidatePairs).toBeGreaterThan(0); // the broad phase did consider them
    expect(e.penetrations).toEqual([]);
  });

  /** Square plate, 2x2x0.2, with a bore of the given radius through its center. */
  function boredPlate(boreRadius: number): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(-1, -1);
    shape.lineTo(1, -1);
    shape.lineTo(1, 1);
    shape.lineTo(-1, 1);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }),
    );
    plate.name = 'Plate';
    plate.rotation.x = -Math.PI / 2;
    return plate;
  }

  test('a bolt too fat for its bore IS caught — the negative below is not vacuous', async () => {
    const fat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 24));
    fat.name = 'FatBolt';

    const e = await analyzePartPenetration(sceneOf(boredPlate(0.2), fat));

    expect(e.skipped).toEqual([]);
    expect(e.pairsTested).toBe(1);
    expect(pairNames(e)).toEqual([['Plate', 'FatBolt']]);
    expect(e.penetrations[0]!.fraction).toBeGreaterThan(0.1);
  });

  test('a socketed part in its hole is not flagged', async () => {
    // The classic bounding-box false positive: a bolt through a plate. The plate
    // has a real bore, so the two solids share no volume even though their boxes
    // overlap completely.
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 24));
    bolt.name = 'Bolt';

    const e = await analyzePartPenetration(sceneOf(boredPlate(0.2), bolt));

    expect(e.candidatePairs).toBe(1); // boxes do overlap
    // Neither part was skipped and the boolean really ran, so the empty result
    // is a measurement rather than an analysis that quietly did nothing.
    expect(e.skipped).toEqual([]);
    expect(e.pairsTested).toBe(1);
    expect(e.penetrations).toEqual([]); // volumes do not overlap
  });

  test('parts that are far apart never reach the narrow phase', async () => {
    const e = await analyzePartPenetration(
      sceneOf(boxAt('A', [1, 1, 1], [0, 0, 0]), boxAt('B', [1, 1, 1], [10, 0, 0])),
    );

    expect(e.candidatePairs).toBe(0);
    expect(e.pairsTested).toBe(0);
    expect(e.penetrations).toEqual([]);
  });

  test('a sliver of shared volume below the contact threshold is not a penetration', async () => {
    // Overlap of 1e-5 on a unit box — the scale of a coincident-face boolean
    // artifact, not of a modelling mistake.
    const e = await analyzePartPenetration(
      sceneOf(boxAt('A', [1, 1, 1], [0, 0, 0]), boxAt('B', [1, 1, 1], [1 - 1e-5, 0, 0])),
    );

    expect(e.penetrations).toEqual([]);
    expect(CONTACT_VOLUME_FRACTION).toBeGreaterThan(1e-5);
  });
});

// -----------------------------------------------------------------------------
// Determinism and bounds
// -----------------------------------------------------------------------------

describe('determinism and bounds', () => {
  test('reflection, distant origins and scale preserve measured overlap', async () => {
    for (const [scale, offset, reflected] of [
      [1, 0, true],
      [1, 1e12, false],
      [1e-6, 0, false],
      [1e-3, 0, false],
      [1e6, 0, false],
    ] as const) {
      const a = boxAt('A', [1, 1, 1], [0, 0, 0]);
      const b = boxAt('B', [1, 1, 1], [0.5, 0, 0]);
      if (reflected) b.scale.x = -1;
      const root = sceneOf(a, b);
      root.scale.setScalar(scale);
      root.position.set(offset, offset, offset);
      const e = await analyzePartPenetration(root);
      expect(e.skipped).toEqual([]);
      expect(e.penetrations).toHaveLength(1);
      expect(e.penetrations[0]!.fraction).toBeCloseTo(0.5, 6);
      expect(e.penetrations[0]!.volume / (0.5 * scale ** 3)).toBeCloseTo(1, 6);
    }
  });

  test('unsupported posed and instanced inputs are explicit rather than base-shape measurements', async () => {
    const instance = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    );
    instance.name = 'Instance';
    const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry());
    skin.name = 'Skin';
    const morph = boxAt('Morph', [1, 1, 1], [0, 0, 0]);
    morph.geometry.morphAttributes.position = [morph.geometry.getAttribute('position').clone()];
    for (const mesh of [instance, skin, morph]) {
      const e = await analyzePartPenetration(sceneOf(mesh, boxAt('Box', [1, 1, 1], [0, 0, 0])));
      expect(e.pairsTested).toBe(0);
      expect(e.skipped).toHaveLength(1);
      expect(e.skipped[0]!.part).toBe(mesh.name);
      expect(e.skipped[0]!.reason).toContain('unsupported');
      const findings = SELF_INTERSECTION_QA_RULE.evaluate({
        intent: createAssetIntentV1({ category: 'prop' }),
        derivedEvidence: { source: 'engine-scene-analysis', partPenetration: e },
      });
      expect(findings.some((f) => f.code === 'GEO_PART_SELF_INTERSECTION_UNMEASURED')).toBe(true);
    }
  });

  test('pair discovery is bounded as well as boolean work', async () => {
    const root = sceneOf(
      ...Array.from({ length: 1000 }, (_, i) => boxAt(`P${i}`, [1, 1, 1], [0, 0, 0])),
    );
    const e = await analyzePartPenetration(root);
    expect(e.broadPhaseTruncated).toBe(true);
    expect(e.candidatePairs).toBeLessThan(499500);
    expect(e.pairsTested).toBe(64);
    expect(e.pairsUnmeasurable).toBe(0);
    expect(e.pairsNotReached).toBe(e.candidatePairs - 64);
    expect(e.truncated).toBe(true);
    const truncated = SELF_INTERSECTION_QA_RULE.evaluate({
      intent: createAssetIntentV1({ category: 'prop' }),
      derivedEvidence: { source: 'engine-scene-analysis', partPenetration: e },
    }).find((f) => f.code === 'GEO_PART_SELF_INTERSECTION_TRUNCATED');
    expect(truncated!.message).toStartWith(`Tested 64 of at least ${e.candidatePairs} `);
    expect(truncated!.message).toContain('Pair discovery stopped after 250000 box comparisons.');
  });

  test('overlap advice preserves intentional joints and measurement limits', () => {
    const [finding] = SELF_INTERSECTION_QA_RULE.evaluate({
      intent: createAssetIntentV1({ category: 'prop' }),
      derivedEvidence: {
        source: 'engine-scene-analysis',
        partPenetration: {
          schemaVersion: 1,
          penetrations: [{ a: 'A', b: 'B', volume: 0.5, fraction: 0.5 }],
          truncated: false,
          skipped: [],
        },
      },
    });
    expect(finding!.repairText).toContain('intentional');
    expect(finding!.repairText).toContain('within a single mesh');
  });

  test('the same scene produces an identical report every run', async () => {
    const build = () =>
      sceneOf(
        boxAt('A', [1, 1, 1], [0, 0, 0]),
        boxAt('B', [1, 1, 1], [0.5, 0, 0]),
        boxAt('C', [1, 1, 1], [0.25, 0.5, 0]),
      );

    const a = await analyzePartPenetration(build());
    const b = await analyzePartPenetration(build());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('an oversized mesh is skipped with the reason, not silently ignored', async () => {
    const dense = new THREE.Mesh(new THREE.SphereGeometry(1, 200, 200));
    dense.name = 'Dense';
    expect(dense.geometry.getIndex()!.count / 3).toBeGreaterThan(MAX_PART_TRIANGLES);

    const e = await analyzePartPenetration(sceneOf(dense, boxAt('B', [1, 1, 1], [0, 0, 0])));

    expect(e.skipped.map((s) => s.part)).toContain('Dense');
    expect(e.skipped[0]!.reason).toContain('analysis budget');
    expect(e.partsAnalyzed).toBe(1);
  });

  test('an open shell encloses no volume and is reported, not treated as clean', async () => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    plane.name = 'Card';
    const e = await analyzePartPenetration(sceneOf(plane, boxAt('B', [1, 1, 1], [0, 0, 0])));

    // Either manifold rejects it (reported in `skipped`) or it is closed enough
    // to measure; what must not happen is a silent pass with no record.
    expect(e.skipped.length + e.pairsTested).toBeGreaterThan(0);
    expect(e.penetrations).toEqual([]);
  });

  test('a scene with fewer than two parts costs nothing', async () => {
    const e = await analyzePartPenetration(sceneOf(boxAt('Only', [1, 1, 1], [0, 0, 0])));
    expect(e.partsAnalyzed).toBe(1);
    expect(e.candidatePairs).toBe(0);
    expect(e.penetrations).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Which pairs the bounded budget reaches
// -----------------------------------------------------------------------------

/** A box missing one face: an open shell manifold cannot close. */
function openBox(name: string, size: number) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  geometry.setIndex(Array.from(geometry.getIndex()!.array).slice(0, 30));
  geometry.clearGroups();
  const mesh = new THREE.Mesh(geometry);
  mesh.name = name;
  return mesh;
}

function group(name: string, ...children: THREE.Object3D[]) {
  const node = new THREE.Group();
  node.name = name;
  node.add(...children);
  return node;
}

describe('pair selection within the budget', () => {
  test('parts in different LOD levels are alternates, not overlapping parts', async () => {
    const e = await analyzePartPenetration(
      sceneOf(
        group('Car_LOD0', boxAt('Body', [1, 1, 1], [0, 0, 0])),
        group('Car_LOD1', boxAt('BodyLow', [1, 1, 1], [0, 0, 0])),
        boxAt('Trim_lod1', [1, 1, 1], [0, 0, 0]),
        boxAt('Driver', [1, 1, 1], [0, 0, 0]),
        boxAt('Glod2', [1, 1, 1], [0, 0, 0]),
      ),
    );
    // Body (LOD0) against BodyLow and Trim_lod1 (LOD1) are alternates. Untagged parts and
    // parts on the same level still share space with each other; "Glod2" carries no tag.
    expect(pairNames(e)).not.toContainEqual(['Body', 'BodyLow']);
    expect(pairNames(e)).not.toContainEqual(['Body', 'Trim_lod1']);
    expect(pairNames(e)).toContainEqual(['BodyLow', 'Trim_lod1']);
    expect(e.penetrations).toHaveLength(8);
    expect(e.pairsLodAlternates).toBe(2);
    expect(e.candidatePairs).toBe(8);
    expect(e.pairsTested).toBe(8);
  });

  test('an open shell containing the assembly does not use up the boolean budget', async () => {
    // 64 bolts inside the shell's box would fill every pair slot in traversal order
    // before the two inner parts that actually interpenetrate were reached.
    const bolts = Array.from({ length: 64 }, (_, i) =>
      boxAt(
        `Bolt_${i}`,
        [0.5, 0.5, 0.5],
        [-3 + 2 * (i % 4), -3 + 2 * (Math.floor(i / 4) % 4), -3 + 2 * Math.floor(i / 16)],
      ),
    );
    const e = await analyzePartPenetration(
      sceneOf(
        openBox('HeadShell', 10),
        ...bolts,
        boxAt('InnerA', [1, 1, 1], [0, 0, 0]),
        boxAt('InnerB', [1, 1, 1], [0.5, 0, 0]),
      ),
    );
    expect(pairNames(e)).toEqual([['InnerA', 'InnerB']]);
    expect(e.candidatePairs).toBe(67);
    expect(e.pairsTested).toBe(1);
    expect(e.pairsUnmeasurable).toBe(66);
    expect(e.pairsNotReached).toBe(0);
    expect(e.truncated).toBe(false);
    expect(e.skipped.map((s) => s.part)).toEqual(['HeadShell']);
  });

  test('a part whose every pair already has an unmeasurable partner is still named', async () => {
    // The first shell decides the pair, but the second must not read as measured.
    const e = await analyzePartPenetration(sceneOf(openBox('OpenA', 2), openBox('OpenB', 1)));
    expect(e.skipped.map((s) => s.part)).toEqual(['OpenA', 'OpenB']);
    expect(e.candidatePairs).toBe(1);
    expect(e.pairsTested).toBe(0);
    expect(e.pairsUnmeasurable).toBe(1);
    expect(e.pairsNotReached).toBe(0);
    expect(e.truncated).toBe(false);
  });

  test('the most overlapping boxes are tested first when the budget runs out', async () => {
    // 69 barely touching neighbours come first in traversal order; the one deeply
    // overlapping pair comes last and must still be measured.
    const row = Array.from({ length: 70 }, (_, i) =>
      boxAt(`Row_${i}`, [1, 1, 1], [i * 0.9995, 0, 0]),
    );
    const e = await analyzePartPenetration(
      sceneOf(
        ...row,
        boxAt('LateA', [1, 1, 1], [200, 0, 0]),
        boxAt('LateB', [1, 1, 1], [200.5, 0, 0]),
      ),
    );
    expect(pairNames(e)).toEqual([['LateA', 'LateB']]);
    expect(e.candidatePairs).toBe(70);
    expect(e.pairsTested).toBe(64);
    expect(e.pairsNotReached).toBe(6);
    expect(e.truncated).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// The rule
// -----------------------------------------------------------------------------

describe('the QA rule', () => {
  const contextWith = (partPenetration: unknown): QaContext => ({
    intent: createAssetIntentV1({ category: 'prop' }),
    derivedEvidence: { source: 'engine-scene-analysis', partPenetration },
  });

  test('starts in observe, as the plan requires before any promotion evidence', () => {
    expect(SELF_INTERSECTION_QA_RULE.defaultMode).toBe('observe');
    expect(SELF_INTERSECTION_QA_RULE.promotion).toBeUndefined();
    // `exact` in this registry is a promotion contract, not a claim about the
    // arithmetic: every exact rule must be enforcing on frozen conformance
    // evidence. Until that evidence exists this stays heuristic, however precise
    // the boolean volume underneath it is.
    expect(SELF_INTERSECTION_QA_RULE.ruleClass).toBe('heuristic');
  });

  test('a finding names both parts, the shared volume, and how to fix it', async () => {
    const evidence = await analyzePartPenetration(
      sceneOf(boxAt('Handle', [1, 1, 1], [0, 0, 0]), boxAt('Body', [1, 1, 1], [0.5, 0, 0])),
    );
    const [finding] = SELF_INTERSECTION_QA_RULE.evaluate(contextWith(evidence));

    expect(finding!.code).toBe('GEO_PART_SELF_INTERSECTION');
    expect(finding!.disposition).toBe('observe');
    expect(finding!.message).toContain('"Handle"');
    expect(finding!.message).toContain('"Body"');
    expect(finding!.repairText).toContain('boolDiff');
  });

  test('no evidence yields no findings — an analysis that did not run is not a pass', () => {
    expect(SELF_INTERSECTION_QA_RULE.evaluate(contextWith(undefined))).toEqual([]);
    expect(
      SELF_INTERSECTION_QA_RULE.evaluate({ intent: createAssetIntentV1({ category: 'prop' }) }),
    ).toEqual([]);
  });

  test('a truncated analysis says so rather than reading as complete', () => {
    const findings = SELF_INTERSECTION_QA_RULE.evaluate(
      contextWith({
        schemaVersion: 1,
        source: 'engine-scene-analysis',
        partsAnalyzed: 40,
        candidatePairs: 200,
        pairsTested: 64,
        pairsUnmeasurable: 20,
        pairsNotReached: 116,
        pairsLodAlternates: 0,
        truncated: true,
        skipped: [],
        penetrations: [],
      }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('GEO_PART_SELF_INTERSECTION_TRUNCATED');
    expect(findings[0]!.disposition).toBe('observe');
    expect(findings[0]!.message).toBe(
      'Tested 64 of 200 overlapping part pairs: 20 involve parts that could not be measured, 116 were beyond the analysis budget (64 booleans, 128 solids). Unreached pairs were not examined; the most overlapping bounding boxes were tested first.',
    );
    expect(findings[0]!.measurement).toEqual({
      name: 'overlappingPartPairsTested',
      actual: 64,
      expected: 200,
      breakdown: { pairsUnmeasurable: 20, pairsNotReached: 116 },
    });
  });

  test('pairs left unmeasured by open parts are not reported as a truncated budget', () => {
    const reason = 'a valid closed solid could not be measured (Not manifold)';
    const findings = SELF_INTERSECTION_QA_RULE.evaluate(
      contextWith({
        schemaVersion: 1,
        source: 'engine-scene-analysis',
        partsAnalyzed: 45,
        candidatePairs: 60,
        pairsTested: 10,
        pairsUnmeasurable: 50,
        pairsNotReached: 0,
        pairsLodAlternates: 0,
        truncated: false,
        skipped: [
          ...Array.from({ length: 40 }, (_, i) => ({ part: `Shell_${i}`, reason })),
          { part: 'Dense', reason: '30000 triangles exceeds the 20000-triangle analysis budget' },
        ],
        penetrations: [],
      }),
    );

    expect(findings.map((f) => f.code)).toEqual(['GEO_PART_SELF_INTERSECTION_UNMEASURED']);
    expect(findings[0]!.disposition).toBe('observe');
    expect(findings[0]!.message).toBe(
      '41 part-volume measurements were unavailable. 40 because a valid closed solid could not be measured (Not manifold): "Shell_0", "Shell_1", "Shell_2", "Shell_3", "Shell_4" and 35 more. 1 because 30000 triangles exceeds the 20000-triangle analysis budget: "Dense". 50 overlapping part pairs include one of these parts and were not measured. These parts are not certified clear.',
    );
  });

  test('a single unmeasured part reads in the singular', () => {
    const findings = SELF_INTERSECTION_QA_RULE.evaluate(
      contextWith({
        schemaVersion: 1,
        source: 'engine-scene-analysis',
        partsAnalyzed: 2,
        candidatePairs: 1,
        pairsTested: 0,
        pairsUnmeasurable: 1,
        pairsNotReached: 0,
        pairsLodAlternates: 0,
        truncated: false,
        skipped: [
          { part: 'Sheet', reason: 'a valid closed solid could not be measured (Not manifold)' },
        ],
        penetrations: [],
      }),
    );
    expect(findings.map((f) => f.message)).toEqual([
      '1 part-volume measurement was unavailable. 1 because a valid closed solid could not be measured (Not manifold): "Sheet". 1 overlapping part pair includes this part and was not measured. This part is not certified clear.',
    ]);
  });
});
