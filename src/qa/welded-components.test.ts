/**
 * Primitives merged into one mesh are compared with each other (#304).
 *
 * One mesh used to be one box, so a part welded into another mesh was invisible
 * at any distance. These pin the split: what it reports, what it must keep silent,
 * and that the 2 cm floor #289 closed on did not move.
 */

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { inspectSceneStructure } from '../render';
import { analyzePartConnectivity, inspectPartConnectivity } from './part-connectivity';
import {
  MAX_MESH_COMPONENTS,
  MAX_SPLIT_VERTICES,
  meshComponentBoxes,
  splitBudget,
} from './mesh-components';

function merged(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => part.toNonIndexed());
  const out = new THREE.BufferGeometry();
  const count = flat.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3);
  let offset = 0;
  for (const part of flat) {
    positions.set(part.getAttribute('position').array as Float32Array, offset);
    offset += part.getAttribute('position').array.length;
  }
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return out;
}
const box = (size: number, at: [number, number, number] = [0, 0, 0]) =>
  new THREE.BoxGeometry(size, size, size).translate(...at);
function mesh(geometry: THREE.BufferGeometry, name = 'Mesh_receiver') {
  const out = new THREE.Mesh(geometry);
  out.name = name;
  return out;
}
function sceneOf(...meshes: THREE.Object3D[]) {
  const root = new THREE.Object3D();
  root.name = 'Asset';
  root.add(...meshes);
  return root;
}
const twoAt = (gap: number) => merged(box(0.1), box(0.1, [0.1 + gap, 0, 0]));
const floating = (root: THREE.Object3D) =>
  inspectSceneStructure(root).filter((warning) => warning.startsWith('Floating parts'));

describe('a welded mesh is split into its components', () => {
  test('two components 200 mm apart are reported by both checks, each located', () => {
    const root = sceneOf(mesh(twoAt(0.2)));
    const warnings = floating(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Mesh_receiver');
    expect(warnings[0]).toContain('welded');

    const report = analyzePartConnectivity(root);
    expect(report.partsAnalyzed).toBe(2);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]!.gap).toBeCloseTo(0.2, 5);
    const findings = inspectPartConnectivity(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('GEO_PART_CONNECTIVITY');
    // A real node, so a tool can resolve it; the component is named in the text.
    expect(findings[0]!.affected).toEqual({ node: 'Mesh_receiver' });
    // Both components located: the detached one and what it is detached from.
    expect(findings[0]!.message).toContain('[0.25');
    expect(findings[0]!.message).toContain('[-0.05');
  });

  test('a single-mesh scene is reached: no sibling mesh is needed', () => {
    expect(floating(sceneOf(mesh(twoAt(0.2))))).toHaveLength(1);
    expect(analyzePartConnectivity(sceneOf(mesh(twoAt(0.2)))).groups).toHaveLength(1);
  });

  test('primitives that share vertices are one component', () => {
    // Each face of a non-indexed box owns its vertices; only their positions join them.
    expect(meshComponentBoxes(mesh(box(1).toNonIndexed()), splitBudget())).toHaveLength(1);
    expect(meshComponentBoxes(mesh(box(1)), splitBudget())).toHaveLength(1);
    const sharedCorner = merged(box(1), box(1, [1, 1, 1]));
    expect(meshComponentBoxes(mesh(sharedCorner), splitBudget())).toHaveLength(1);
    expect(floating(sceneOf(mesh(sharedCorner)))).toEqual([]);
    expect(analyzePartConnectivity(sceneOf(mesh(sharedCorner))).groups).toEqual([]);
  });

  test('separate components that overlap or touch stay silent', () => {
    const overlapping = merged(box(1), box(1, [0.5, 0, 0]));
    expect(meshComponentBoxes(mesh(overlapping), splitBudget())).toHaveLength(2);
    expect(floating(sceneOf(mesh(overlapping)))).toEqual([]);
    expect(analyzePartConnectivity(sceneOf(mesh(overlapping))).groups).toEqual([]);
  });

  test('the 2 cm floor is unchanged inside a welded mesh', () => {
    for (const gap of [0.002, 0.00085, 0.019]) {
      expect(floating(sceneOf(mesh(twoAt(gap))))).toEqual([]);
      expect(analyzePartConnectivity(sceneOf(mesh(twoAt(gap)))).groups).toEqual([]);
    }
    expect(floating(sceneOf(mesh(twoAt(0.025))))).toHaveLength(1);
    expect(analyzePartConnectivity(sceneOf(mesh(twoAt(0.025)))).groups).toHaveLength(1);
  });

  test('distances are in world space', () => {
    const scaled = mesh(twoAt(0.005));
    scaled.scale.setScalar(10);
    expect(floating(sceneOf(scaled))).toHaveLength(1);
    expect(analyzePartConnectivity(sceneOf(scaled)).groups[0]!.gap).toBeCloseTo(0.05, 5);

    // Each box comes from its own vertices, through the rotation.
    const rotated = mesh(twoAt(0.2));
    rotated.rotation.set(0, Math.PI / 2, 0);
    rotated.updateWorldMatrix(true, false);
    const boxes = meshComponentBoxes(rotated, splitBudget());
    expect(boxes).toHaveLength(2);
    expect(boxes![1]!.min.z).toBeCloseTo(-0.35, 5);
  });

  test('one shared geometry is measured through each mesh that draws it', () => {
    const shared = twoAt(0.2);
    const near = mesh(shared, 'Mesh_a');
    const far = mesh(shared, 'Mesh_b');
    far.position.set(0, 10, 0);
    const root = sceneOf(near, far);
    root.updateWorldMatrix(true, true);
    const [a, b] = [near, far].map((each) => meshComponentBoxes(each, splitBudget())!);
    expect(a![0]!.max.y).toBeCloseTo(0.05, 5);
    expect(b![0]!.max.y).toBeCloseTo(10.05, 5);
  });

  test('a vertex no triangle uses, or a non-finite one, makes no component', () => {
    const geometry = box(1);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const grown = new Float32Array(position.count * 3 + 6);
    grown.set(position.array as Float32Array);
    grown.set([100, 100, 100, Number.NaN, 0, 0], position.count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(grown, 3));
    expect(meshComponentBoxes(mesh(geometry), splitBudget())).toHaveLength(1);
  });

  test('many detached components of one mesh are one finding and one warning entry', () => {
    const scatter = merged(...Array.from({ length: 40 }, (_, i) => box(0.1, [i * 0.5, 0, 0])));
    const root = sceneOf(mesh(scatter));
    const findings = inspectPartConnectivity(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('39 of its 40');
    expect(findings[0]!.message.length).toBeLessThan(1000);
    const [warning] = floating(root);
    expect(warning!.match(/Mesh_receiver/g)!.length).toBeLessThan(4);
  });

  test('a group mixing two meshes names a real node and stays bounded', () => {
    // Forty components of two meshes that touch each other, clear of the larger body.
    const cluster = (x: number) =>
      merged(...Array.from({ length: 40 }, (_, i) => box(0.1, [x + i * 0.095, 50, 0])));
    const body = merged(...Array.from({ length: 100 }, (_, i) => box(1, [i * 0.9, 0, 0])));
    const root = sceneOf(
      mesh(body, 'Mesh_body'),
      mesh(cluster(0), 'Mesh_a'),
      mesh(cluster(3.75), 'Mesh_b'),
    );
    const findings = inspectPartConnectivity(root);
    const group = findings.find((finding) => finding.affected?.node === 'Mesh_a');
    expect(findings.map((finding) => finding.affected?.node)).not.toContainEqual(
      expect.stringContaining('welded component'),
    );
    expect(group).toBeDefined();
    expect(group!.message.length).toBeLessThan(1200);
    expect(group!.message).toContain('more');
  });

  test('the same scene gives the same report', () => {
    const report = () => analyzePartConnectivity(sceneOf(mesh(twoAt(0.2)), mesh(twoAt(0.3), 'B')));
    expect(report()).toEqual(report());
  });
});

describe('what is deliberately not split', () => {
  test('foliage and decal names keep their exemption', () => {
    const root = sceneOf(mesh(twoAt(0.2), 'Mesh_leaf_cluster'));
    expect(floating(root)).toEqual([]);
    expect(analyzePartConnectivity(root).groups).toEqual([]);
  });

  test('instanced and skinned meshes stay one part', () => {
    const instanced = new THREE.InstancedMesh(twoAt(0.2), undefined, 1);
    instanced.setMatrixAt(0, new THREE.Matrix4());
    instanced.name = 'Mesh_instanced';
    expect(meshComponentBoxes(instanced, splitBudget())).toBeUndefined();
    const skinned = new THREE.SkinnedMesh(twoAt(0.2));
    expect(meshComponentBoxes(skinned, splitBudget())).toBeUndefined();
  });

  test('an LOD alternate is not split', () => {
    const alternate = mesh(twoAt(0.2), 'Mesh_body_LOD1');
    const body = mesh(box(1), 'Mesh_body');
    const report = analyzePartConnectivity(sceneOf(body, alternate));
    expect(report.groups.filter((group) => group.parts.join().includes('welded'))).toEqual([]);
  });

  test('over the component budget a mesh stays one box and the report says so', () => {
    const scatter = merged(
      ...Array.from({ length: MAX_MESH_COMPONENTS + 1 }, (_, i) => box(0.1, [i, 0, 0])),
    );
    const root = sceneOf(mesh(scatter), mesh(box(1, [0, -5, 0]), 'Mesh_base'));
    const report = analyzePartConnectivity(root);
    expect(report.unsplit).toEqual(['Mesh_receiver']);
    expect(report.partsAnalyzed).toBe(2);
    const findings = inspectPartConnectivity(root);
    expect(findings.map((finding) => finding.message).join()).toContain('Mesh_receiver');
  });

  test('over the vertex budget a mesh stays one box without walking it', () => {
    const big = new THREE.BufferGeometry();
    big.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((MAX_SPLIT_VERTICES + 1) * 3), 3),
    );
    const budget = splitBudget();
    expect(meshComponentBoxes(mesh(big), budget)).toBeUndefined();
    expect(budget.unsplit).toEqual(['Mesh_receiver']);
  });
});
