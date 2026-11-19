import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { geometryDiagnostics } from '../geometry';
import { diagnosticWeld } from '../geometry-frame';

/**
 * `diagnosticWeld` welds positions on a quantized grid for `geometryDiagnostics` (and so
 * REQUIRE_SOLID) and the print export. Issue #431 replaced its string keys with numeric ones;
 * these cases pin every vertex's weld id and the full diagnostic report on inputs where a key
 * could change: -0 beside 0, every position coincident (zero tolerance), non-finite positions
 * (repeated ones too: each still takes an id of its own), invalid and partial index triples,
 * half-way rounding, interleaved data and a mirrored soup.
 */
const soup = (values: number[], index?: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  if (index) g.setIndex(index);
  return g;
};

const CASES: Record<string, () => [THREE.BufferGeometry, number?]> = {
  'signed zeros weld': () => [
    soup([0, 0, 0, 1, 0, 0, 0, 1, 0, -0, -0, 0, 0, 1, 0, 0, 0, 1, -0, 0, -0, 0, 0, 1, 1, 0, 0]),
  ],
  'all coincident (zero tolerance)': () => [
    soup([0, 0, 0, -0, 0, 0, 0, -0, -0, 0, 0, 0, Number.NaN, 0, 0, -0, -0, -0]),
  ],
  'non-finite and invalid indices': () => [
    soup(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, Number.NaN, 0, 0, Number.POSITIVE_INFINITY, 1, 1, 1, 1, 0],
      [0, 1, 2, 0, 3, 2, 2, 1, 5, 0, 1, 7, 0, 2, 4, 5, 1],
    ),
  ],
  'repeated non-finite positions': () => [
    soup(
      [
        [0, 0, 0],
        [Number.NaN, 0, 0],
        [1, 0, 0],
        [Number.NaN, 0, 0],
        [0, 1, 0],
        [Number.POSITIVE_INFINITY, 1, 1],
        [Number.POSITIVE_INFINITY, 1, 1],
        [0, 0, 0],
        [1, 0, 0],
      ].flat(),
      [0, 2, 4, 7, 8, 4, 1, 3, 5, 0, 4, 2],
    ),
  ],
  'half-way rounding at an absolute tolerance': () => [
    soup(
      [0, 0, 0, 0.25, 0, 0, 0.75, 0, 0, 0.5, 1, 0, 1.25, 1, 0, 0.25, 0.5, 1, 1.75, 0.5, 1, 0, 0, 1],
      [0, 1, 3, 1, 2, 3, 2, 4, 3, 5, 6, 7, 1, 5, 7],
    ),
    0.5,
  ],
  'box with split seams': () => [new THREE.BoxGeometry(1.3, 0.7, 2.1, 2, 1, 3)],
  'open cylinder': () => [new THREE.CylinderGeometry(0.5, 0.8, 1.2, 9, 2, true)],
  'mirrored sphere soup': () => {
    const g = new THREE.SphereGeometry(0.7, 7, 5).toNonIndexed();
    g.scale(-1, 1, 1);
    return [g, 1e-4];
  },
  interleaved: () => {
    const data = new THREE.InterleavedBuffer(
      new Float32Array([0, 0, 0, 9, 1, 0, 0, 9, 0, 1, 0, 9, 1, 1, 0, 9, 0, 0, 0, 9, 1, 1, 0, 9]),
      4,
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    return [g];
  },
};

test('weld diagnostics keep their exact reports', () => {
  const reports = Object.fromEntries(
    Object.entries(CASES).map(([name, make]) => {
      const [geometry, tolerance] = make();
      return [name, geometryDiagnostics(geometry, tolerance)];
    }),
  );
  expect(reports).toEqual(EXPECTED as never);
});

test('the shared weld keeps its exact ids', () => {
  const welds = Object.fromEntries(
    Object.entries(CASES).map(([name, make]) => {
      const [geometry, tolerance] = make();
      const weld = diagnosticWeld(geometry.getAttribute('position'), tolerance);
      return [
        name,
        {
          ids: Array.from(weld.ids).join(' '),
          nonFinite: Array.from(weld.finite)
            .flatMap((finite, i) => (finite ? [] : [i]))
            .join(' '),
          count: weld.count,
        },
      ];
    }),
  );
  expect(welds).toEqual(EXPECTED_WELDS);
});

// Recorded from the string-keyed weld before #431 changed it. A non-finite vertex takes the
// next id when it is met; the vertices after it go on welding as before.
const EXPECTED_WELDS = {
  'signed zeros weld': { ids: '0 1 2 0 2 3 0 3 1', nonFinite: '', count: 4 },
  'all coincident (zero tolerance)': { ids: '0 0 0 0 1 0', nonFinite: '4', count: 2 },
  'non-finite and invalid indices': { ids: '0 1 2 3 4 5', nonFinite: '3 4', count: 6 },
  'repeated non-finite positions': { ids: '0 1 2 3 4 5 6 0 2', nonFinite: '1 3 5 6', count: 7 },
  'half-way rounding at an absolute tolerance': {
    ids: '0 1 2 3 4 5 6 7',
    nonFinite: '',
    count: 8,
  },
  'box with split seams': {
    ids: [
      '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 8 16 3 9 17 2 10 18 1 11 19 0 15 20 4 14 21 5 13 22',
      '6 12 23 7 11 19 0 15 20 4 3 16 8 7 23 12',
    ].join(' '),
    nonFinite: '',
    count: 24,
  },
  'open cylinder': {
    ids: '0 1 2 3 4 5 6 7 8 0 9 10 11 12 13 14 15 16 17 9 18 19 20 21 22 23 24 25 26 18',
    nonFinite: '',
    count: 27,
  },
  'mirrored sphere soup': {
    ids: [
      '0 1 2 0 2 3 0 3 4 0 4 5 0 5 6 0 6 7 0 7 1 2 1 8 1 9 8 3 2 10 2 8 10 4 3 11 3 10 11 5 4 12',
      '4 11 12 6 5 13 5 12 13 7 6 14 6 13 14 1 7 9 7 14 9 8 9 15 9 16 15 10 8 17 8 15 17 11 10 18',
      '10 17 18 12 11 19 11 18 19 13 12 20 12 19 20 14 13 21 13 20 21 9 14 16 14 21 16 15 16 22',
      '16 23 22 17 15 24 15 22 24 18 17 25 17 24 25 19 18 26 18 25 26 20 19 27 19 26 27 21 20 28',
      '20 27 28 16 21 23 21 28 23 22 23 29 24 22 29 25 24 29 26 25 29 27 26 29 28 27 29 23 28 29',
    ].join(' '),
    nonFinite: '',
    count: 30,
  },
  interleaved: { ids: '0 1 2 3 0 3', nonFinite: '', count: 4 },
};

// Recorded from the string-keyed weld before #431 changed it.
const EXPECTED = {
  'signed zeros weld': {
    tolerance: 0.0000017320508075688771,
    toleranceMode: 'relative',
    positionScale: 1.7320508075688772,
    vertices: 9,
    triangles: 3,
    boundaryEdges: 3,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'mixed',
      signedVolume: 0,
    },
  },
  'all coincident (zero tolerance)': {
    tolerance: 0,
    toleranceMode: 'relative',
    positionScale: 0,
    vertices: 6,
    triangles: 2,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 1,
    collapsedByToleranceTriangles: 1,
    invalidIndices: 0,
    nonFiniteVertices: 1,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'mixed',
      signedVolume: 0,
    },
  },
  'non-finite and invalid indices': {
    tolerance: 0.0000014142135623730952,
    toleranceMode: 'relative',
    positionScale: Math.SQRT2,
    vertices: 6,
    triangles: 6,
    boundaryEdges: 4,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 2,
    nonFiniteVertices: 2,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'mixed',
      signedVolume: 0,
    },
  },
  'repeated non-finite positions': {
    tolerance: 0.0000014142135623730952,
    toleranceMode: 'relative',
    positionScale: Math.SQRT2,
    vertices: 9,
    triangles: 4,
    boundaryEdges: 0,
    nonManifoldEdges: 3,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 4,
    solid: {
      closed: true,
      manifold: false,
      orientation: 'mixed',
      signedVolume: 0,
    },
  },
  'half-way rounding at an absolute tolerance': {
    tolerance: 0.5,
    toleranceMode: 'absolute',
    positionScale: 2.25,
    vertices: 8,
    triangles: 5,
    boundaryEdges: 9,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 1,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'inward',
      signedVolume: -0.10416666666666667,
    },
  },
  'box with split seams': {
    tolerance: 0.0000025670994251859113,
    toleranceMode: 'relative',
    positionScale: 2.5670994251859116,
    vertices: 52,
    triangles: 44,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: true,
      manifold: true,
      orientation: 'outward',
      signedVolume: 1.9109998105764454,
    },
  },
  'open cylinder': {
    tolerance: 0.0000025160976812400266,
    toleranceMode: 'relative',
    positionScale: 2.516097681240027,
    vertices: 30,
    triangles: 36,
    boundaryEdges: 18,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'outward',
      signedVolume: 0.9776799875588347,
    },
  },
  'mirrored sphere soup': {
    tolerance: 0.0001,
    toleranceMode: 'absolute',
    positionScale: 2.2905612355572984,
    vertices: 168,
    triangles: 56,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 0,
    collapsedByToleranceTriangles: 0,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: true,
      manifold: true,
      orientation: 'inward',
      signedVolume: -1.1319485599687988,
    },
  },
  interleaved: {
    tolerance: 0.0000014142135623730952,
    toleranceMode: 'relative',
    positionScale: Math.SQRT2,
    vertices: 6,
    triangles: 2,
    boundaryEdges: 3,
    nonManifoldEdges: 0,
    orientationConflicts: 0,
    degenerateTriangles: 1,
    collapsedByToleranceTriangles: 1,
    invalidIndices: 0,
    nonFiniteVertices: 0,
    solid: {
      closed: false,
      manifold: true,
      orientation: 'mixed',
      signedVolume: 0,
    },
  },
};
