import { describe, expect, test } from 'bun:test';
import { Box3, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { applyOrbitClamps, clampOrbitZoom, createChaseDrag, createPathController, samplePath, stepChase, stepChaseZoom, type ChaseOptions, type ChaseState, type PathDef, type Pose } from '../../src/camera/core';
import { createScopedControlsElement } from '../../src/camera/scoped-controls';
import { createOrbitController } from '../../src/camera/orbit';
const pose = (): Pose => ({ position: [0, 0, 0], target: [0, 0, 0] });
describe('U-24 paths and orbit clamps', () => {
  const linear: PathDef = { name: 'fly', seconds: 4, keys: [{ position: [0, 0, 10], target: [0, 0, 0] }, { position: [4, 4, 6], target: [0, 2, 0] }, { position: [8, 0, 2], target: [0, 4, 0] }] };
  test.each(['linear', 'catmull-rom'] as const)('%s fixtures at 0/.5/1 and no roll', interpolation => {
    const path = { ...linear, interpolation };
    for (const [u, expected] of [[0, [0, 0, 10]], [.5, [4, 4, 6]], [1, [8, 0, 2]]] as const) {
      const out = samplePath(path, u, pose()); expected.forEach((n, i) => expect(out.position[i]).toBeCloseTo(n, 9)); expect(out.roll).toBe(0);
    }
  });
  test('centripetal interpolation has curved fixture and honors key durations', () => {
    const out = samplePath({ ...linear, interpolation: 'catmull-rom' }, .25, pose()); expect(out.position).toEqual([2, 2.5, 8]);
    const timed = { ...linear, keys: [linear.keys[0], { ...linear.keys[1], seconds: 1 }, { ...linear.keys[2], seconds: 3 }] };
    expect(samplePath(timed, .25, pose()).position).toEqual([4, 4, 6]);
  });
  test.each(['linear', 'smoothstep', 'ease-in-out'] as const)('%s easing endpoints and roll', easing => {
    const path = { ...linear, easing }; expect(samplePath(path, -1, pose()).position).toEqual([0, 0, 10]); expect(samplePath(path, 2, pose()).position).toEqual([8, 0, 2]);
  });
  test('clock-based play, frozen seek, single interrupt and continuity', () => {
    let time = 5, interrupted = 0, done = 0; const out = pose();
    const c = createPathController([linear], { time: () => time, onInterrupt: p => { interrupted++; out.position = [...p.position]; }, onDone: () => done++ });
    c.play('fly'); time = 6; c.update(); expect(c.u).toBe(.25);
    c.seek(.5); c.update(); expect(c.pose.position).toEqual([4, 4, 6]);
    c.interrupt(); c.interrupt(); expect(interrupted).toBe(1); expect(out.position).toEqual(c.pose.position); expect(c.playing).toBe(null);
    c.play('fly', { from: .5 }); time = 8; c.update(); expect(done).toBe(1); expect(c.u).toBe(1);
  });
  test('reduced motion completes at endpoint and looping paths remain deterministic', () => {
    const reduced = createPathController([linear], { time: () => 0, reduced: () => true }); reduced.play('fly'); expect(reduced.u).toBe(1); expect(reduced.playing).toBe(null);
    let time = 0; const loop = createPathController([{ ...linear, loop: true }], { time: () => time }); loop.play('fly'); time = 5; loop.update(); expect(loop.u).toBe(.25);
  });
  test('floor plus clearance and bounds constrain the pose', () => {
    const camera = new PerspectiveCamera(); camera.position.set(10, -5, -10); const target = new Vector3(30, 2, 40);
    applyOrbitClamps(camera, target, { floor: () => 3, clearance: .5, bounds: new Box3(new Vector3(-2, 0, -2), new Vector3(2, 1, 2)) });
    expect(camera.position.y).toBe(3.5); expect(target.toArray()).toEqual([2, 1, 2]);
  });
  test('U-17 overview and follow zoom limits apply to wheel/pinch/button factors', () => {
    expect(clampOrbitZoom(3, .8, 3, 160)).toBe(3); expect(clampOrbitZoom(159, 1.25, 3, 160)).toBe(160);
    expect(clampOrbitZoom(1.6, .8, 1.6, 10)).toBe(1.6); expect(clampOrbitZoom(9, 1.25, 1.6, 10)).toBe(10);
    expect(clampOrbitZoom(6, .8, 1.6, 10)).toBeCloseTo(4.8);
  });
  test('OrbitControls adapter scopes root and document listeners without changing canvas', () => {
    const root = new EventTarget(), originalDocument = new EventTarget();
    const canvas = { ownerDocument: originalDocument, getRootNode: () => originalDocument, marker: 3, read() { return this.marker; } };
    const scoped = createScopedControlsElement(canvas as unknown as HTMLCanvasElement, root as HTMLElement);
    expect(scoped.ownerDocument).toBe(root); expect(scoped.getRootNode()).toBe(root); expect((scoped as unknown as typeof canvas).read()).toBe(3); expect(canvas.ownerDocument).toBe(originalDocument);
  });
  test('inactive follow controls leave the shared overview pose unchanged; handles clamp zoom and preserve handoff', () => {
    const root = new EventTarget();
    const canvas = Object.assign(new EventTarget(), { style: { touchAction: '', cursor: '' }, ownerDocument: root, getRootNode: () => root, clientWidth: 960, clientHeight: 720 });
    const camera = new PerspectiveCamera(40); camera.position.set(15, 15, 25); camera.lookAt(0, 1, 0);
    const position = camera.position.clone(), rotation = camera.quaternion.clone();
    const inactive = createOrbitController(camera, canvas as unknown as HTMLCanvasElement, root as HTMLElement, () => ({ active: false, minDistance: 1.6, maxDistance: 10 }));
    expect(camera.position.equals(position)).toBe(true); expect(camera.quaternion.equals(rotation)).toBe(true); inactive.dispose();
    const active = createOrbitController(camera, canvas as unknown as HTMLCanvasElement, root as HTMLElement, () => ({ target: [0, 1, 0], minDistance: 3, maxDistance: 160 }));
    active.handle.setView({ position: [12, 9, -12], target: [0, 1, 0], fov: 47 });
    expect(camera.position.distanceTo(new Vector3(12, 9, -12))).toBeLessThan(1e-10); expect(camera.fov).toBe(47);
    active.handle.zoomBy(.00001); expect(camera.position.distanceTo(active.controls.target)).toBeCloseTo(3);
    active.handle.zoomBy(10000); expect(camera.position.distanceTo(active.controls.target)).toBeCloseTo(160);
    active.dispose();
  });
});
describe('U-25 chase camera', () => {
  const options: Omit<ChaseOptions, 'subject' | 'active'> = { yaw: () => 0, distance: 5, height: 3, targetHeight: 1, lookAhead: 2, fov: 50, fovAtTopSpeed: 70, topSpeed: 10, positionLag: 0, yawLag: 0 };
  const state = (): ChaseState => ({ position: [0, 3, -5], smoothedYaw: 0, appliedDistance: Math.hypot(5, 2), orbitAngle: 0, orbitHoldS: 0, subjectVisible: true });
  const subject = { position: [0, 0, 0] as [number, number, number], yaw: 0, speed: 0 };
  test('rest pose and speed field of view', () => {
    const s = state(), out = pose(); stepChase(s, options, subject, 1 / 60, out); expect(out.position).toEqual([0, 3, -5]); expect(out.target).toEqual([0, 1, 2]); expect(out.fov).toBe(50);
    stepChase(s, options, { ...subject, speed: 5 }, 1 / 60, out); expect(out.fov).toBe(60);
  });
  test('five ray minimum, immediate pull, minimum distance, visibility and bounded relaxation', () => {
    const s = state(), out = pose(); let rays = 0, hit = .8; const visibility: boolean[] = [];
    const obstruction = { ray: () => { rays++; return rays % 5 === 4 ? hit : 100; }, castRadius: .2, pad: .1, minDistance: .3, relaxPerSecond: 1, hideSubjectBelow: 1, onSubjectVisible: (v: boolean) => visibility.push(v) };
    stepChase(s, { ...options, obstruction }, subject, .1, out); expect(rays).toBe(5); expect(s.appliedDistance).toBeCloseTo(.7); expect(visibility).toEqual([false]);
    hit = 0; stepChase(s, { ...options, obstruction }, subject, .1, out); expect(s.appliedDistance).toBe(.3);
    hit = 100; stepChase(s, { ...options, obstruction }, subject, .1, out); expect(s.appliedDistance).toBeCloseTo(.4);
  });
  test('yaw lag converges and stationary-target smoothing agrees at 60 and 144Hz', () => {
    const s = state(), out = pose(); for (let n = 0; n < 300; n++) stepChase(s, { ...options, yawLag: .2 }, { ...subject, yaw: Math.PI / 2 }, 1 / 60, out);
    expect(s.smoothedYaw).toBeCloseTo(Math.PI / 2, 6);
    const run = (fps: number) => { const s = state(); s.position = [20, 20, 20]; const out = pose(); for (let n = 0; n < fps; n++) stepChase(s, { ...options, positionLag: .5 }, subject, 1 / fps, out); return out; };
    const a = run(60), b = run(144); a.position.forEach((v, i) => expect(Math.abs(v - b.position[i])).toBeLessThan(1e-3));
  });
  test('combined yaw and position springs agree at 60 and 144Hz', () => {
    const run = (fps: number) => { const s = state(), out = pose(); for (let n = 0; n < fps; n++) stepChase(s, { ...options, positionLag: .5, yawLag: .2 }, { ...subject, yaw: Math.PI / 2 }, 1 / fps, out); return out; };
    const a = run(60), b = run(144); a.position.forEach((v, i) => expect(Math.abs(v - b.position[i])).toBeLessThan(1e-3));
  });
  test('orbit offset holds three seconds then returns', () => {
    const s = state(), out = pose(); s.orbitAngle = 1; s.orbitHoldS = 3;
    stepChase(s, { ...options, orbitOffset: true }, subject, 1, out); expect(s.orbitAngle).toBe(1); expect(s.orbitHoldS).toBe(2);
    for (let n = 0; n < 600; n++) stepChase(s, { ...options, orbitOffset: true }, subject, .01, out); expect(s.orbitAngle).toBeLessThan(.001);
  });
});
describe('GG-010 chase pinch zoom and drag', () => {
  test('zoom input scales within the range, outward positive, and ignores non-finite input', () => {
    const range = { min: .7, max: 1.7 };
    expect(stepChaseZoom(1, 0, range)).toBe(1);
    expect(stepChaseZoom(1, .2, range)).toBeCloseTo(Math.exp(.1), 12);
    expect(stepChaseZoom(1, -.2, { ...range, rate: 1 })).toBeCloseTo(Math.exp(-.2), 12);
    expect(stepChaseZoom(1, 100, range)).toBe(1.7); expect(stepChaseZoom(1, -100, range)).toBe(.7);
    expect(stepChaseZoom(1.2, Number.NaN, range)).toBe(1.2); expect(stepChaseZoom(1.2, Number.POSITIVE_INFINITY, range)).toBe(1.2);
  });
  test('scaled distance and height move the rest pose', () => {
    const options: Omit<ChaseOptions, 'subject' | 'active'> = { yaw: () => 0, distance: 5 * 1.5, height: 3 * 1.5, targetHeight: 1, lookAhead: 2, fov: 50, positionLag: 0, yawLag: 0 };
    const s: ChaseState = { position: [0, 0, 0], smoothedYaw: 0, appliedDistance: 0, orbitAngle: 0, orbitHoldS: 0, subjectVisible: true }, out = pose();
    stepChase(s, options, { position: [0, 0, 0], yaw: 0, speed: 0 }, 1 / 60, out); expect(out.position).toEqual([0, 4.5, -7.5]);
  });
  test('one pointer drags; a second pointer ends the drag until every pointer lifts', () => {
    const drag = createChaseDrag();
    expect(drag.down(1, 100)).toBe(true); expect(drag.move(1, 110)).toBe(10); expect(drag.move(2, 50)).toBe(0);
    expect(drag.down(2, 300)).toBe(false); expect(drag.pointer).toBeNull(); expect(drag.pointers).toBe(2);
    expect(drag.move(1, 140)).toBe(0); expect(drag.move(2, 260)).toBe(0);
    drag.up(2); expect(drag.move(1, 180)).toBe(0); expect(drag.down(3, 10)).toBe(false);
    drag.up(1); drag.up(3); expect(drag.pointers).toBe(0);
    expect(drag.down(4, 20)).toBe(true); expect(drag.move(4, 15)).toBe(-5); drag.up(4); expect(drag.pointer).toBeNull(); expect(drag.move(4, 30)).toBe(0);
  });
});
