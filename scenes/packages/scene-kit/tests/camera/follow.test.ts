import { describe, expect, test } from 'bun:test';
import { Object3D, PerspectiveCamera, Vector3 } from 'three/webgpu';
import type { FollowOptions } from '../../src/camera/core';
import { createFollowController } from '../../src/camera/follow';

/** Native OrbitControls events, with a rendered follow frame after every pointer move. */
function fixture() {
  const root = new EventTarget(), captured = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    style: { touchAction: '', cursor: '' }, ownerDocument: root, getRootNode: () => root,
    clientWidth: 412, clientHeight: 915,
    setPointerCapture: (id: number) => captured.add(id), releasePointerCapture: (id: number) => captured.delete(id),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 412, height: 915 }),
  });
  const camera = new PerspectiveCamera(), subject = new Object3D(); subject.position.set(4, 1.9, -7);
  const visibility: boolean[] = [];
  let hit = Infinity;
  const options: FollowOptions & { active: boolean } = {
    active: true, subject: { current: subject }, targetHeight: 0, offset: () => [0, .6, 4.8],
    fov: 58, maxPolar: Math.PI * .54, minDistance: 1.6, maxDistance: 10,
    obstruction: { ray: (from, to) => Math.min(hit, from.distanceTo(to)), pad: .14, minDistance: .22,
      hideSubjectBelow: 1.11, onSubjectVisible: v => visibility.push(v) },
  };
  const follow = createFollowController(camera, canvas as unknown as HTMLCanvasElement, root as HTMLElement, () => options);
  follow.update();
  const pointer = (type: string, id: number, x: number, y = 350, pointerType = 'touch') => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1, pageX: x, pageY: y, clientX: x, clientY: y, ctrlKey: false, metaKey: false, shiftKey: false });
    (type === 'pointerdown' || type === 'pointercancel' ? canvas : root).dispatchEvent(event);
    follow.update();
  };
  const pinch = (from: number, to: number, steps = 24) => {
    pointer('pointerdown', 1, 206 - from); pointer('pointerdown', 2, 206 + from);
    for (let i = 1; i <= steps; i++) { const half = from + (to - from) * i / steps; pointer('pointermove', 1, 206 - half); pointer('pointermove', 2, 206 + half); }
    pointer('pointerup', 2, 206 + to); pointer('pointerup', 1, 206 - to);
  };
  return { follow, options, camera, subject, visibility, pointer, pinch, captured,
    distance: () => camera.position.distanceTo(follow.handle.controls.target),
    direction: () => camera.position.clone().sub(follow.handle.controls.target).normalize(),
    obstruct(distance: number) { hit = distance; follow.update(); },
    wheel(deltaY: number) { canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY, deltaMode: 0, clientX: 206, clientY: 350, ctrlKey: false })); follow.update(); },
  };
}
const initialDistance = Math.hypot(.6, 4.8);

describe('follow camera desired orbit versus collision view', () => {
  test.each(['touch', 'mouse'])('%s one-pointer orbit preserves zoom across many collision-padded frames', pointerType => {
    const f = fixture();
    try {
      const before = f.direction(), target = f.subject.position.clone();
      f.pointer('pointerdown', 1, 180, 350, pointerType);
      for (let i = 1; i <= 48; i++) f.pointer('pointermove', 1, 180 + i * 2, 350, pointerType);
      f.pointer('pointerup', 1, 276, 350, pointerType);
      expect(f.distance()).toBeCloseTo(initialDistance - .14, 9);
      expect(before.angleTo(f.direction())).toBeGreaterThan(.5);
      expect(f.follow.handle.controls.target.distanceTo(target)).toBeLessThan(1e-10);
      expect(f.subject.position.equals(target)).toBe(true);
      expect(f.captured.size).toBe(0);
    } finally { f.follow.dispose(); }
  });
  test('pinch scales desired distance in both directions and clamps at follow limits', () => {
    const f = fixture();
    try {
      const before = f.direction(), target = f.subject.position.clone();
      f.pinch(60, 90); expect(f.distance()).toBeCloseTo(initialDistance * 2 / 3 - .14, 8);
      f.pinch(90, 60); expect(f.distance()).toBeCloseTo(initialDistance - .14, 8);
      f.pinch(120, 10); expect(f.distance()).toBeCloseTo(10 - .14, 8);
      f.pinch(10, 180); expect(f.distance()).toBeCloseTo(1.6 - .14, 8);
      expect(before.angleTo(f.direction())).toBeLessThan(1e-7);
      expect(f.subject.position.equals(target)).toBe(true);
      expect(f.follow.handle.controls.target.distanceTo(target)).toBeLessThan(1e-10);
    } finally { f.follow.dispose(); }
  });
  test('orbit behind a close obstacle retains requested distance when the obstacle clears', () => {
    const f = fixture();
    try {
      f.obstruct(.5); expect(f.distance()).toBeCloseTo(.36, 9); expect(f.visibility).toEqual([false]);
      expect(f.follow.handle.pose.position).toEqual(f.camera.position.toArray());
      expect(f.follow.handle.pose.target).toEqual(f.subject.position.toArray());
      f.pointer('pointerdown', 1, 180);
      for (let i = 1; i <= 20; i++) f.pointer('pointermove', 1, 180 + i * 2);
      f.pointer('pointerup', 1, 220);
      f.obstruct(Infinity); expect(f.distance()).toBeCloseTo(initialDistance - .14, 9);
      expect(f.visibility).toEqual([false, true]);
      expect(f.follow.handle.pose.position).toEqual(f.camera.position.toArray());
    } finally { f.follow.dispose(); }
  });
  test('pinch and wheel change the desired zoom while obstructed without putting the camera through a wall', () => {
    const f = fixture();
    try {
      f.obstruct(.3); f.pinch(120, 10); expect(f.distance()).toBeCloseTo(.22, 9);
      f.obstruct(Infinity); expect(f.distance()).toBeCloseTo(9.86, 8);
      f.obstruct(.3); f.wheel(-100); expect(f.distance()).toBeCloseTo(.22, 9);
      f.obstruct(Infinity); expect(f.distance()).toBeLessThan(9.86); expect(f.distance()).toBeGreaterThan(8);
      f.follow.handle.zoomBy(.0001); f.follow.update(); expect(f.distance()).toBeCloseTo(1.46, 8);
      f.follow.handle.zoomBy(10000); f.follow.update(); expect(f.distance()).toBeCloseTo(9.86, 8);
    } finally { f.follow.dispose(); }
  });
  test('subject translation preserves orbit; inactive controls leave overview alone; reentry and vehicle target reset offset', () => {
    const f = fixture();
    try {
      const relative = f.camera.position.clone().sub(f.subject.position);
      f.subject.position.add(new Vector3(3, 1, -2)); f.follow.update();
      expect(f.camera.position.clone().sub(f.subject.position).distanceTo(relative)).toBeLessThan(1e-10);
      f.options.active = false; f.follow.update(); f.camera.position.set(10, 20, 30);
      f.pointer('pointerdown', 1, 100); f.pointer('pointermove', 1, 160); f.pointer('pointerup', 1, 160);
      expect(f.camera.position.toArray()).toEqual([10, 20, 30]);
      f.options.active = true; f.follow.update(); expect(f.distance()).toBeCloseTo(initialDistance - .14, 9);
      const tractor = new Object3D(); tractor.position.set(10, 1.6, 6);
      f.options.subject.current = tractor; f.options.offset = () => [0, 2.6, 4.8]; f.follow.update();
      expect(f.follow.handle.controls.target.distanceTo(tractor.position)).toBeLessThan(1e-10);
      expect(f.distance()).toBeCloseTo(Math.hypot(2.6, 4.8) - .14, 9);
    } finally { f.follow.dispose(); }
  });
  test('canceling both touches releases capture and ends the gesture; a fresh drag still orbits', () => {
    const f = fixture();
    try {
      f.pointer('pointerdown', 1, 140); f.pointer('pointerdown', 2, 260);
      f.pointer('pointermove', 1, 120); f.pointer('pointermove', 2, 280);
      f.pointer('pointercancel', 2, 280); f.pointer('pointercancel', 1, 120);
      expect(f.captured.size).toBe(0);
      const position = f.camera.position.clone(), distance = f.distance(), direction = f.direction();
      f.pointer('pointermove', 1, 180); f.pointer('pointermove', 2, 220);
      expect(f.camera.position.distanceTo(position)).toBeLessThan(1e-10);
      f.pointer('pointerdown', 3, 180); f.pointer('pointermove', 3, 240); f.pointer('pointerup', 3, 240);
      expect(direction.angleTo(f.direction())).toBeGreaterThan(.3);
      expect(f.distance()).toBeCloseTo(distance, 9);
      expect(f.captured.size).toBe(0);
    } finally { f.follow.dispose(); }
  });
});
