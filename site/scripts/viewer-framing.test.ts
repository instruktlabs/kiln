import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AZIMUTH, frameAsset, orbitDirection } from '../src/components/viewer-framing';

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
