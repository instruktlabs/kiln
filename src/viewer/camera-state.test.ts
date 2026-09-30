import { expect, test } from 'bun:test';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { captureCameraView, restoreCameraView, explorationOffset } from './camera-state';

test('revision replacement keeps the inspected camera and target while fitting clipping to new bounds', () => {
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(3, 4, 5);
  const target = new Vector3(1, 2, 0);
  const saved = captureCameraView(camera, target);
  camera.position.set(20, 20, 20);
  target.set(0, 0, 0);
  restoreCameraView(
    camera,
    target,
    saved,
    new Box3(new Vector3(-500, -2, -2), new Vector3(500, 2, 2)),
  );
  expect(camera.position.toArray()).toEqual([3, 4, 5]);
  expect(target.toArray()).toEqual([1, 2, 0]);
  expect(camera.far).toBeGreaterThan(1000);
  expect(camera.near).toBeLessThan(0.1);
});

test('exploration uses camera orientation, remains level and normalizes diagonal speed', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 3);
  camera.lookAt(0, -2, 0);
  const forward = explorationOffset(camera, new Set(['KeyW']), 2);
  expect(forward.y).toBe(0);
  expect(forward.z).toBeCloseTo(-2);
  const diagonal = explorationOffset(camera, new Set(['KeyW', 'KeyD']), 2);
  expect(diagonal.length()).toBeCloseTo(2);
  expect(diagonal.x).toBeGreaterThan(0);
  expect(explorationOffset(camera, new Set(['KeyE']), 2).toArray()).toEqual([0, 2, 0]);
  expect(explorationOffset(camera, new Set(), 2).length()).toBe(0);
});
