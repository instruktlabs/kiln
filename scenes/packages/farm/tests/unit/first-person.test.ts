import { expect, test } from 'bun:test';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { createFirstPersonPose, bindWalkCapture } from '../../src/play/first-person';

test('walking stays at eye height, looks independently of avatar yaw, and never zooms', () => {
  const camera = new PerspectiveCamera(), position = new Vector3(4, 2, 7), pose = createFirstPersonPose();
  pose.reset(0); pose.update(camera, position, { x: 0, y: 0 });
  expect(camera.position.distanceTo(new Vector3(4, 3.72, 7))).toBeLessThan(1e-12);
  const forward = camera.getWorldDirection(new Vector3());
  expect(forward.x).toBeCloseTo(1, 6); expect(forward.y).toBeCloseTo(0, 6);
  pose.update(camera, position, { x: .5, y: 100 });
  expect(camera.position.distanceTo(new Vector3(4, 3.72, 7))).toBeLessThan(1e-12);
  expect(camera.getWorldDirection(forward).y).toBeGreaterThan(-1);
  expect(camera.fov).toBe(58);
});

test('pointer capture owns relative mouse look and exits on native Escape release, with cleanup', async () => {
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, exitPointerLock() { this.pointerLockElement = null; this.dispatchEvent(new Event('pointerlockchange')); } });
  const canvas = Object.assign(new EventTarget(), { ownerDocument: doc, requestPointerLock() { doc.pointerLockElement = this; doc.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); } });
  const look = { x: 0, y: 0 }; let active = true, exits = 0, captured = false;
  const control = bindWalkCapture(canvas as unknown as HTMLCanvasElement, { active: () => active, look, onCaptured: value => { captured = value; }, onExit: () => { exits++; } });
  await control.request(); expect(captured).toBe(true);
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 10, movementY: -5 }));
  expect(look).toEqual({ x: .025, y: -.0125 });
  doc.exitPointerLock(); expect(exits).toBe(1); expect(captured).toBe(false);
  await control.request(); active = false; control.release(); expect(exits).toBe(1);
  active = true; await control.request(); control.dispose(); expect(exits).toBe(1); expect(doc.pointerLockElement).toBeNull();
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 100, movementY: 100 }));
  expect(look).toEqual({ x: .025, y: -.0125 });
});
