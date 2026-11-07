import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AZIMUTH, frameAsset, groundGrid, meshTops, orbitDirection, wantsMeshTops } from '../src/components/viewer-framing';

test('a very large model offers each mesh\'s top, so a slim spire stays in the frame', () => {
  const body = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 40));
  body.position.set(0, 20, 0);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 60, 8));
  spire.position.set(0, 70, 0);
  const root = new THREE.Group();
  root.add(body, spire);
  root.updateWorldMatrix(true, true);
  // A coarse stride over the vertices lands on the body and steps over the spire altogether.
  const sampled: THREE.Vector3[] = [];
  const position = body.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) sampled.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(body.matrixWorld));
  const center = new THREE.Vector3(0, 50, 0);
  const tipInFrame = (points: THREE.Vector3[]) => {
    const framed = frameAsset(points, center, 100, 34, 2);
    const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 5000);
    camera.position.copy(framed.target).addScaledVector(orbitDirection(AZIMUTH), framed.distance * 1.04);
    camera.lookAt(framed.target);
    camera.updateMatrixWorld();
    return new THREE.Vector3(0, 100, 0).project(camera).y < 1;
  };
  expect(tipInFrame(sampled)).toBe(false);
  const tops = meshTops([body, spire]);
  expect(tops.some((point) => point.y === 100)).toBe(true);
  expect(tipInFrame([...sampled, ...tops])).toBe(true);
});

test('only a model past a million vertices offers its mesh tops', () => {
  expect(wantsMeshTops(80_069)).toBe(false);
  expect(wantsMeshTops(1_000_000)).toBe(false);
  expect(wantsMeshTops(2_489_344)).toBe(true);
});

// One unit in the last place of a 32-bit float, which is what the grid's shader has.
const precisionAt = (value: number) => 2 ** (Math.floor(Math.log2(value)) - 23);

test('the ground grid\'s plane is just big enough for its fade and travels with the camera', () => {
  // Reach and cell size both scale with the radius, so one radius stands for all of them.
  const radius = 1042;
  const grid = groundGrid(radius);
  // The fade hides everything further than this from the camera's spot on the ground.
  expect(grid.args[0] / 2).toBeGreaterThanOrEqual(grid.fadeDistance);
  // The orbit limit is 14 radii, so this is the largest coordinate the shader sees.
  const reach = radius * 14 + grid.args[0] / 2;
  expect(precisionAt(reach)).toBeLessThan(grid.cellSize / 1000);
  expect(grid.followCamera).toBe(true);
});

for (const aspect of [0.59, 1, 2.4]) {
  test(`frames a building around the vertical center at aspect ${aspect}`, () => {
    const points: THREE.Vector3[] = [];
    for (const x of [-5, 5])
      for (const y of [0, 7])
        for (const z of [-4.5, 4.5]) points.push(new THREE.Vector3(x, y, z));
    const framed = frameAsset(points, new THREE.Vector3(0, 3.5, 0), 7, 34, aspect);
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.01, 1000);
    camera.position.copy(framed.target).addScaledVector(orbitDirection(AZIMUTH), framed.distance * 1.04);
    camera.lookAt(framed.target);
    camera.updateMatrixWorld();
    const projected = points.map((point) => point.clone().project(camera));
    const centerY = (Math.min(...projected.map((point) => point.y)) + Math.max(...projected.map((point) => point.y))) / 2;
    expect(Math.abs(centerY)).toBeLessThan(0.16);
    for (const point of projected) {
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
    }
  });
}
