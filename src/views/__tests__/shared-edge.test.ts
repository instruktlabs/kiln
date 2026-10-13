import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { rasterizeCamera, type ResolvedAssetCameraV1 } from '../camera';
import { rasterizeView } from '../raster';
import { resolveBackdrop } from '../background';
import { prepareTriangleCoverage } from '../triangle-coverage';

const size = 128;
const background = resolveBackdrop(undefined).rgb;
type Projection = 'grid' | 'orthographic' | 'perspective';
const indices = [
  [0, 1, 2, 2, 1, 3],
  [0, 1, 3, 0, 3, 2],
];
function panel(diagonal: number, reverse = false) {
  const geometry = new THREE.PlaneGeometry();
  const index = [...indices[diagonal]!];
  if (reverse)
    for (let i = 0; i < index.length; i += 3) [index[i], index[i + 2]] = [index[i + 2]!, index[i]!];
  geometry.setIndex(index);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
}
function camera(projection: 'orthographic' | 'perspective'): ResolvedAssetCameraV1 {
  return {
    version: 'kiln.camera.v1',
    projection,
    position: [0, 0, 2],
    target: [0, 0, 0],
    up: [0, 1, 0],
    near: 0.1,
    far: 5,
    aspect: 1,
    ...(projection === 'orthographic' ? { halfHeight: 0.8 } : { fovDeg: 50 }),
  };
}
function render(mesh: THREE.Mesh, projection: Projection, override?: ResolvedAssetCameraV1) {
  return projection === 'grid'
    ? rasterizeView(mesh, [0, 0, 1], {
        size,
        frameBounds: { min: [-0.8, -0.8, 0], max: [0.8, 0.8, 0] },
      })
    : rasterizeCamera(mesh, override ?? camera(projection), size);
}
function drawn(rgb: Uint8Array, i: number) {
  return background.some((value, c) => rgb[i * 3 + c] !== value);
}
function assertPanel(rgb: Uint8Array) {
  let checked = 0;
  for (let y = 0; y < size; y++) {
    const xs = Array.from({ length: size }, (_, x) => x).filter((x) => drawn(rgb, y * size + x));
    if (xs.length < 6) continue;
    for (let x = xs[0]! + 2; x <= xs.at(-1)! - 2; x++) {
      expect(drawn(rgb, y * size + x)).toBe(true);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(500);
}
test('NM-012: the original two-triangle PlaneGeometry has no perspective diagonal holes', () => {
  assertPanel(
    render(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()), 'perspective'),
  );
});
for (const projection of ['grid', 'orthographic', 'perspective'] as const) {
  test(`${projection}: continuous panel has no internal cracks across diagonals and transforms`, () => {
    for (const diagonal of [0, 1])
      for (const reverse of [false, true])
        for (const mirror of [1, -1])
          for (const offset of [0, 0.00123, 0.016]) {
            const mesh = panel(diagonal, reverse);
            mesh.position.set(offset, -offset / 3, 0);
            mesh.scale.x = mirror;
            assertPanel(render(mesh, projection));
          }
  });

  test(`${projection}: neighbouring triangles own shared samples exactly once`, () => {
    for (const diagonal of [0, 1])
      for (const reverse of [false, true]) {
        const mesh = panel(diagonal, reverse);
        const full = render(mesh, projection);
        const index = [...mesh.geometry.index!.array];
        mesh.geometry.setIndex(index.slice(0, 3));
        const a = render(mesh, projection);
        mesh.geometry.setIndex(index.slice(3));
        const b = render(mesh, projection);
        for (let i = 0; i < size * size; i++) {
          const owners = +drawn(a, i) + +drawn(b, i);
          expect(owners).toBeLessThanOrEqual(1);
          expect(owners > 0).toBe(drawn(full, i));
        }
      }
  });

  test(`${projection}: translucent panels blend once regardless of triangle order`, () => {
    const mesh = panel(0);
    const opaque = render(mesh, projection);
    mesh.material.opacity = 0.5;
    mesh.material.transparent = true;
    for (const index of [indices[0]!, [...indices[0]!.slice(3), ...indices[0]!.slice(0, 3)]]) {
      mesh.geometry.setIndex(index);
      const translucent = render(mesh, projection);
      assertPanel(translucent);
      for (let i = 0; i < size * size; i++)
        for (let c = 0; c < 3; c++)
          expect(translucent[i * 3 + c]).toBe(
            Math.round(opaque[i * 3 + c]! * 0.5 + background[c]! * 0.5),
          );
    }
  });
}

for (const projection of ['orthographic', 'perspective'] as const) {
  test(`${projection}: clipped sloping panel has continuous coverage and single ownership`, () => {
    const mesh = panel(0);
    mesh.rotation.y = 0.7;
    mesh.scale.set(3, 3, 3);
    const shot = { ...camera(projection), near: 1.6, far: 2.6 };
    const full = render(mesh, projection, shot);
    assertPanel(full);
    mesh.geometry.setIndex(indices[0]!.slice(0, 3));
    const a = render(mesh, projection, shot);
    mesh.geometry.setIndex(indices[0]!.slice(3));
    const b = render(mesh, projection, shot);
    for (let i = 0; i < size * size; i++) {
      const owners = +drawn(a, i) + +drawn(b, i);
      expect(owners).toBeLessThanOrEqual(1);
      expect(owners > 0).toBe(drawn(full, i));
    }
  });
}

test('coverage leaves analytic vertex interpolation unbiased on included edges', () => {
  const weights = new Float64Array(3);
  // P=(2,2) is halfway from A to the midpoint of BC.
  const triangle = prepareTriangleCoverage(0, 0, 8, 0, 0, 8, 16)!;
  expect(triangle.sample(2, 2, weights)).toBe(true);
  expect([...weights]).toEqual([0.5, 0.25, 0.25]);
  expect(triangle.sample(4, 0, weights)).toBe(true);
  expect([...weights]).toEqual([0.5, 0.5, 0]);
  // A subpixel triangle is allowed to own the pixel centre; no area epsilon.
  const small = prepareTriangleCoverage(
    0.5 - 1e-7,
    0.5 - 1e-7,
    0.5 + 1e-7,
    0.5 - 1e-7,
    0.5,
    0.5 + 1e-7,
    1,
  )!;
  expect(small.sample(0.5, 0.5, weights)).toBe(true);
  expect(weights[0]! + weights[1]! + weights[2]!).toBeCloseTo(1, 15);
});

test('horizontal, vertical and diagonal shared edges have exactly one owner', () => {
  const weights = new Float64Array(3);
  for (const [a, b, otherA, otherB] of [
    [
      [0, 4.5],
      [8, 4.5],
      [4, 0],
      [4, 8],
    ],
    [
      [4.5, 0],
      [4.5, 8],
      [0, 4],
      [8, 4],
    ],
    [
      [0, 0],
      [8, 8],
      [0, 8],
      [8, 0],
    ],
  ] as const) {
    for (const reverse of [false, true]) {
      const [start, end] = reverse ? [b, a] : [a, b];
      const first = prepareTriangleCoverage(
        start[0],
        start[1],
        end[0],
        end[1],
        otherA[0],
        otherA[1],
        16,
      )!;
      const second = prepareTriangleCoverage(
        end[0],
        end[1],
        start[0],
        start[1],
        otherB[0],
        otherB[1],
        16,
      )!;
      expect(+first.sample(4.5, 4.5, weights) + +second.sample(4.5, 4.5, weights)).toBe(1);
    }
  }
});

test('out-of-frame, degenerate and nonfinite projected triangles remain bounded', () => {
  expect(prepareTriangleCoverage(0, 0, 1, 1, 2, 2, 128)).toBeNull();
  expect(prepareTriangleCoverage(200, 200, 300, 200, 200, 300, 128)).toBeNull();
  expect(prepareTriangleCoverage(NaN, 0, 1, 0, 0, 1, 128)).toBeNull();
  expect(prepareTriangleCoverage(0, Infinity, 1, 0, 0, 1, 128)).toBeNull();
  expect(prepareTriangleCoverage(-1e200, 0, 1e200, 0, 0, 1e200, 128)).toBeNull();
  const huge = prepareTriangleCoverage(-1e6, -1e6, 1e6, -1e6, 0, 1e6, 128)!;
  expect([huge.minX, huge.maxX, huge.minY, huge.maxY]).toEqual([0, 127, 0, 127]);
  const weights = new Float64Array(3);
  expect(huge.sample(64.5, 64.5, weights)).toBe(true);
  expect(weights[0]! + weights[1]! + weights[2]!).toBeCloseTo(1, 15);
});
