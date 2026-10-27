/**
 * What the structural checks cover (#289).
 *
 * An M16A1 passed QA clean with a front sight post 2 mm off its A-frame and a
 * magazine catch 0.85 mm off the receiver; the consuming game's own contact
 * audit caught both. The reported suspicion was that per-material welding hid
 * the detached primitive inside a mesh the checks treat as one part.
 *
 * Welding does hide a primitive, but it is not what hid these two. Both checks
 * read bounding boxes with a 2 cm adjacency tolerance, so a sub-centimetre gap
 * reads as contact whether or not the parts are welded. These tests pin both
 * limits with the reported measurements, so neither can drift silently and
 * neither gets mistaken for the other again.
 */

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { inspectSceneStructure } from '../render';
import { analyzePartConnectivity, CONNECTIVITY_TOLERANCE } from './part-connectivity';

function boxAt(name: string, size: [number, number, number], at: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

function sceneOf(...meshes: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = 'Asset';
  for (const mesh of meshes) root.add(mesh);
  return root;
}

/** An A-frame with a sight post standing `gap` metres clear of its crown. */
function sightPost(gap: number): THREE.Object3D {
  return sceneOf(
    boxAt('Mesh_a_frame', [0.1, 0.05, 0.05], [0, 0, 0]),
    boxAt('Mesh_front_sight_post', [0.004, 0.02, 0.004], [0, 0.035 + gap, 0]),
  );
}

/** The same two primitives merged into one BufferGeometry: what a per-material weld produces. */
function weldedSightPost(gap: number): THREE.Object3D {
  const frame = new THREE.BoxGeometry(0.1, 0.05, 0.05).toNonIndexed();
  const post = new THREE.BoxGeometry(0.004, 0.02, 0.004).toNonIndexed();
  post.translate(0, 0.035 + gap, 0);
  const merged = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv'] as const) {
    const a = frame.getAttribute(key) as THREE.BufferAttribute;
    const b = post.getAttribute(key) as THREE.BufferAttribute;
    const values = new Float32Array(a.array.length + b.array.length);
    values.set(a.array as Float32Array, 0);
    values.set(b.array as Float32Array, a.array.length);
    merged.setAttribute(key, new THREE.BufferAttribute(values, a.itemSize));
  }
  const mesh = new THREE.Mesh(merged);
  mesh.name = 'Mesh_receiver';
  // A second mesh, so the pairwise check runs at all: it skips single-mesh scenes.
  return sceneOf(mesh, boxAt('Mesh_barrel', [0.3, 0.02, 0.02], [0.2, 0, 0]));
}

const floatingWarnings = (root: THREE.Object3D) =>
  inspectSceneStructure(root, { category: 'weapon' }).filter((w) => w.startsWith('Floating parts'));

// -----------------------------------------------------------------------------
// Limit 1 — the adjacency tolerance, which is what hid the reported defects
// -----------------------------------------------------------------------------

test('a gap below the 2 cm tolerance reads as contact even between separate meshes', () => {
  // The two gaps reported in #289, as separate parts: no weld involved.
  for (const gap of [0.002, 0.00085]) {
    expect(floatingWarnings(sightPost(gap))).toEqual([]);
    expect(analyzePartConnectivity(sightPost(gap)).groups).toEqual([]);
  }
});

test('the warning fires once the gap clears the tolerance it states', () => {
  expect(floatingWarnings(sightPost(CONNECTIVITY_TOLERANCE))).toEqual([]);
  expect(analyzePartConnectivity(sightPost(CONNECTIVITY_TOLERANCE)).groups).toEqual([]);
  const warnings = floatingWarnings(sightPost(0.025));
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('Mesh_a_frame');
  expect(analyzePartConnectivity(sightPost(0.025)).groups).toHaveLength(1);
});

// -----------------------------------------------------------------------------
// Limit 2 — mesh granularity, real but not the cause here
// -----------------------------------------------------------------------------

test('a primitive welded into another mesh is invisible at any separation', () => {
  // 20 cm is ten times the tolerance and still silent: one mesh is one box.
  for (const gap of [0.002, 0.05, 0.2]) {
    expect(floatingWarnings(weldedSightPost(gap))).toEqual([]);
    expect(analyzePartConnectivity(weldedSightPost(gap)).groups).toEqual([]);
  }
  // Unwelded, the same 20 cm separation is reported.
  expect(floatingWarnings(sightPost(0.2))).toHaveLength(1);
});

test('the connectivity report counts welded primitives as one analyzed part', () => {
  const report = analyzePartConnectivity(weldedSightPost(0.2));
  expect(report.partsAnalyzed).toBe(2);
  expect(report.mainComponentSize).toBe(2);
});

// -----------------------------------------------------------------------------
// What the author is told when the warning does fire
// -----------------------------------------------------------------------------

test('the floating-parts warning states what it does not cover', () => {
  const warning = floatingWarnings(sightPost(0.05))[0]!;
  expect(warning).toContain('2cm');
  expect(warning).toMatch(/welded|within a mesh|one mesh/i);
});
