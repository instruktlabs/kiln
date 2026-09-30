/**
 * T4.2 — part connectivity.
 *
 * The case that justifies this rule existing alongside the pairwise
 * floating-parts warning is the detached CLUSTER: parts that touch each other
 * but nothing else. Every one has a neighbour, so the pairwise check passes and
 * the group is still floating.
 */

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { createAssetIntentV1 } from '../contracts';
import { analyzePartConnectivity, PART_CONNECTIVITY_QA_RULE } from './part-connectivity';
import type { QaContext } from './types';

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

const context = (scene: THREE.Object3D): QaContext => ({
  intent: createAssetIntentV1({ category: 'prop' }),
  scene,
});

// -----------------------------------------------------------------------------
// The case the pairwise check misses
// -----------------------------------------------------------------------------

describe('detached clusters', () => {
  test('a group that touches itself but not the body is reported as one group', () => {
    // Body of three touching parts, plus a pair of touching parts far away. The
    // existing pairwise warning sees a neighbour for all five and says nothing.
    const report = analyzePartConnectivity(
      sceneOf(
        boxAt('Body', [1, 1, 1], [0, 0, 0]),
        boxAt('Lid', [1, 0.2, 1], [0, 0.6, 0]),
        boxAt('Knob', [0.2, 0.2, 0.2], [0, 0.8, 0]),
        boxAt('HandleA', [0.2, 0.2, 0.2], [5, 0, 0]),
        boxAt('HandleB', [0.2, 0.2, 0.2], [5.2, 0, 0]),
      ),
    );

    expect(report.mainComponentSize).toBe(3);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]!.parts).toEqual(['HandleA', 'HandleB']);
    // Gap from the cluster to the body (body ends at x=0.5, HandleA starts at
    // x=4.9), not the zero gap between the cluster's own parts.
    expect(report.groups[0]!.gap).toBeCloseTo(4.4, 3);
  });

  test('the finding names the separated group without assuming it needs a join', () => {
    const findings = PART_CONNECTIVITY_QA_RULE.evaluate(
      context(
        sceneOf(
          boxAt('Body', [1, 1, 1], [0, 0, 0]),
          boxAt('Lid', [1, 0.2, 1], [0, 0.6, 0]),
          boxAt('Knob', [0.2, 0.2, 0.2], [0, 0.8, 0]),
          boxAt('HandleA', [0.2, 0.2, 0.2], [5, 0, 0]),
          boxAt('HandleB', [0.2, 0.2, 0.2], [5.2, 0, 0]),
        ),
      ),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('group of 2 parts');
    expect(findings[0]!.message).toContain('This may be intentional');
    expect(findings[0]!.repairText).toContain('snapTo');
  });

  test('the largest detached group is reported first', () => {
    // The body has to out-mass the cluster, or the cluster IS the main body and
    // the body is what gets reported. Three stacked parts against a pair.
    const report = analyzePartConnectivity(
      sceneOf(
        boxAt('BodyA', [2, 2, 2], [0, 0, 0]),
        boxAt('BodyB', [2, 2, 2], [0, 2, 0]),
        boxAt('BodyC', [2, 2, 2], [0, 4, 0]),
        boxAt('Lone', [0.2, 0.2, 0.2], [8, 0, 0]),
        boxAt('PairA', [0.2, 0.2, 0.2], [5, 0, 0]),
        boxAt('PairB', [0.2, 0.2, 0.2], [5.2, 0, 0]),
      ),
    );

    expect(report.mainComponentSize).toBe(3);
    expect(report.groups.map((g) => g.parts.length)).toEqual([2, 1]);
  });
});

// -----------------------------------------------------------------------------
// True negatives
// -----------------------------------------------------------------------------

describe('legitimately connected assemblies are not flagged', () => {
  test('a chain of parts each touching the next is one component', () => {
    // Wheels on an axle: the wheels never touch each other, only the axle.
    const report = analyzePartConnectivity(
      sceneOf(
        boxAt('Axle', [4, 0.2, 0.2], [0, 0, 0]),
        boxAt('WheelL', [0.4, 1, 1], [-2, 0, 0]),
        boxAt('WheelR', [0.4, 1, 1], [2, 0, 0]),
      ),
    );

    expect(report.groups).toEqual([]);
    expect(report.mainComponentSize).toBe(3);
  });

  test('a hinged lid resting on its box stays attached', () => {
    const report = analyzePartConnectivity(
      sceneOf(boxAt('Chest', [1, 1, 1], [0, 0, 0]), boxAt('Lid', [1, 0.1, 1], [0, 0.55, 0])),
    );
    expect(report.groups).toEqual([]);
  });

  test('parts within the tolerance count as touching', () => {
    // 1 cm apart, inside the 2 cm tolerance the existing floating-parts warning
    // already uses — the two must never disagree about contact.
    const report = analyzePartConnectivity(
      sceneOf(boxAt('A', [1, 1, 1], [0, 0, 0]), boxAt('B', [1, 1, 1], [1.01, 0, 0])),
    );
    expect(report.groups).toEqual([]);
  });

  test('a single part cannot be disconnected from anything', () => {
    const report = analyzePartConnectivity(sceneOf(boxAt('Only', [1, 1, 1], [0, 0, 0])));
    expect(report.groups).toEqual([]);
    expect(report.partsAnalyzed).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Exemptions are by declared role, not inferred shape
// -----------------------------------------------------------------------------

describe('exemptions', () => {
  test('foliage, cards, and decals are expected to stand apart', () => {
    const report = analyzePartConnectivity(
      sceneOf(
        boxAt('Trunk', [0.5, 3, 0.5], [0, 0, 0]),
        boxAt('Mesh_FoliageA', [2, 2, 2], [0, 6, 0]),
        boxAt('Mesh_Decal_Sign', [0.5, 0.5, 0.05], [0, 8, 0]),
      ),
    );

    expect(report.exempt).toEqual(['Mesh_FoliageA', 'Mesh_Decal_Sign']);
    expect(report.groups).toEqual([]);
  });

  test('a name that is not a declared exempt role is still checked', () => {
    // "Ornament" looks decorative but declares nothing, so it is not exempt —
    // guessing from appearance would fail exactly on unusual assets.
    const report = analyzePartConnectivity(
      sceneOf(boxAt('Body', [1, 1, 1], [0, 0, 0]), boxAt('Ornament', [0.2, 0.2, 0.2], [5, 0, 0])),
    );
    expect(report.groups.map((g) => g.parts)).toEqual([['Ornament']]);
  });
});

// -----------------------------------------------------------------------------
// Only parts that are present together are connected
// -----------------------------------------------------------------------------

function group(name: string, ...children: THREE.Object3D[]) {
  const node = new THREE.Group();
  node.name = name;
  node.add(...children);
  return node;
}

describe('parts that are not shown together', () => {
  test('hidden meshes and hidden subtrees do not form separate groups', () => {
    const proxy = boxAt('CollisionProxy', [0.2, 0.2, 0.2], [5, 0, 0]);
    proxy.visible = false;
    const spare = group('SpareParts', boxAt('SpareWheel', [0.5, 0.5, 0.5], [-5, 0, 0]));
    spare.visible = false;
    const report = analyzePartConnectivity(
      sceneOf(
        boxAt('Body', [1, 1, 1], [0, 0, 0]),
        boxAt('Lid', [1, 0.2, 1], [0, 0.6, 0]),
        proxy,
        spare,
      ),
    );
    expect(report.groups).toEqual([]);
    expect(report.partsAnalyzed).toBe(2);
  });

  test('LOD1+ alternates are excluded from the main analysis and counted', () => {
    // An offset low-detail copy is an alternate of the body, not a detached group.
    const lowDetail = group(
      'Tree_LOD1',
      boxAt('TrunkLow', [1, 1, 1], [0, 0, 0]),
      boxAt('CrownLow', [1, 1, 1], [0, 1, 0]),
    );
    lowDetail.position.x = 10;
    const scene = sceneOf(
      group(
        'Tree_LOD0',
        boxAt('Trunk', [1, 1, 1], [0, 0, 0]),
        boxAt('Crown', [1, 1, 1], [0, 1, 0]),
      ),
      lowDetail,
      boxAt('Sign_lod2', [0.2, 0.2, 0.2], [-5, 0, 0]),
      boxAt('Handle', [0.2, 0.2, 0.2], [5, 0, 0]),
    );
    const report = analyzePartConnectivity(scene);
    expect(report.groups.map((g) => g.parts)).toEqual([['Handle']]);
    expect(report.partsAnalyzed).toBe(3);
    expect(report.lodExcluded).toBe(3);

    const [finding] = PART_CONNECTIVITY_QA_RULE.evaluate(context(scene));
    expect(finding!.disposition).toBe('observe');
    expect(finding!.message).toContain('3 parts on LOD levels above 0 were not analyzed.');
    expect(finding!.measurement).toEqual({
      name: 'gapToMainComponent',
      actual: report.groups[0]!.gap,
      expected: 0.02,
      breakdown: { lodExcludedParts: 3 },
    });
  });
});

// -----------------------------------------------------------------------------
// Rule wiring
// -----------------------------------------------------------------------------

describe('the QA rule', () => {
  test('starts in observe with no promotion evidence', () => {
    expect(PART_CONNECTIVITY_QA_RULE.defaultMode).toBe('observe');
    expect(PART_CONNECTIVITY_QA_RULE.promotion).toBeUndefined();
    expect(PART_CONNECTIVITY_QA_RULE.ruleClass).toBe('heuristic');
  });

  test('a missing scene yields no findings rather than a false clean result', () => {
    expect(
      PART_CONNECTIVITY_QA_RULE.evaluate({ intent: createAssetIntentV1({ category: 'prop' }) }),
    ).toEqual([]);
  });

  test('a connected asset produces no findings', () => {
    expect(
      PART_CONNECTIVITY_QA_RULE.evaluate(
        context(sceneOf(boxAt('A', [1, 1, 1], [0, 0, 0]), boxAt('B', [1, 1, 1], [1, 0, 0]))),
      ),
    ).toEqual([]);
  });

  test('the same scene always produces the same report', () => {
    const build = () =>
      sceneOf(
        boxAt('Body', [1, 1, 1], [0, 0, 0]),
        boxAt('FarA', [0.2, 0.2, 0.2], [5, 0, 0]),
        boxAt('FarB', [0.2, 0.2, 0.2], [5.2, 0, 0]),
      );
    expect(JSON.stringify(analyzePartConnectivity(build()))).toBe(
      JSON.stringify(analyzePartConnectivity(build())),
    );
  });
});
