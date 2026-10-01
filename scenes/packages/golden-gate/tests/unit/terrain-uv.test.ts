import { expect, test } from 'bun:test';
import { BufferAttribute, BufferGeometry, Mesh } from 'three/webgpu';
import { bakeTileGeometry } from '../../src/world/terrain';

/** A 10 m quad at the origin whose UVs come from `uvAt(x, z)`. */
function quad(uvAt: (x: number, z: number) => [number, number]): Mesh {
  const corners: [number, number][] = [[0, 0], [10, 0], [0, 10], [10, 10]];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(corners.flatMap(([x, z]) => [x, 0, z])), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(corners.flatMap(() => [0, 1, 0])), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(corners.flatMap(([x, z]) => uvAt(x, z))), 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return new Mesh(geometry);
}
const uvs = (geometry: BufferGeometry) => Array.from(geometry.getAttribute('uv').array as Float32Array);

// The imagery's top row is +Z and its left column is -X, sampled with flipY = false, so v must grow
// toward -Z. The delivered tiles carry v growing toward +Z (manifest: "v increases -Z").
test('terrain tiles with v growing toward +Z are flipped to the imagery orientation', () => {
  const baked = bakeTileGeometry(quad((x, z) => [x / 10, z / 10]));
  expect(uvs(baked)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  expect(baked.userData.uvFlipped).toEqual({ u: false, v: true });
});

test('terrain tiles already in the imagery orientation keep their UVs', () => {
  const baked = bakeTileGeometry(quad((x, z) => [x / 10, (10 - z) / 10]));
  expect(uvs(baked)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  expect(baked.userData.uvFlipped).toEqual({ u: false, v: false });
});

test('terrain tiles with u growing toward -X are mirrored', () => {
  const baked = bakeTileGeometry(quad((x, z) => [(10 - x) / 10, (10 - z) / 10]));
  expect(uvs(baked)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  expect(baked.userData.uvFlipped).toEqual({ u: true, v: false });
});
