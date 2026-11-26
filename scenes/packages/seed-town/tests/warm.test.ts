import { expect, test } from 'bun:test';
import { Group, PerspectiveCamera, Scene } from 'three/webgpu';
import { inScene, WARM_WAIT_FRAMES, warmDue, warmHidden } from '../src/warm';

test('inScene follows the parents up to the scene', () => {
  const scene = new Scene(), rig = new Group(), light = new Group(), loose = new Group();
  scene.add(rig); rig.add(light);
  expect(inScene(light, scene)).toBe(true);
  expect(inScene(scene, scene)).toBe(true);
  expect(inScene(loose, scene)).toBe(false);
  expect(inScene(null, scene)).toBe(false);
  expect(inScene(undefined, scene)).toBe(false);
});

test('the warm-up waits for the renderer and the sun, but not for ever', () => {
  expect(warmDue(false, true, 0)).toBe(false);
  expect(warmDue(true, true, 0)).toBe(true);
  expect(warmDue(true, false, 0)).toBe(false);
  expect(warmDue(true, false, WARM_WAIT_FRAMES - 1)).toBe(false);
  // A scene whose sun never arrives still shows its town: the pipelines then compile on the first frame, as before.
  expect(warmDue(true, false, WARM_WAIT_FRAMES)).toBe(true);
  expect(warmDue(false, false, WARM_WAIT_FRAMES)).toBe(false);
});

test('warmHidden shows the root only inside the compile call and reports whether it compiled', async () => {
  const scene = new Scene(), root = new Group(), camera = new PerspectiveCamera();
  scene.add(root); root.visible = false;
  const seen: unknown[] = [];
  let finish!: () => void;
  const pending = warmHidden({ compileAsync: (object, cam, target) => { seen.push(object, cam, target, root.visible); return new Promise<void>(done => { finish = done; }); } }, root, camera, scene);
  expect(seen).toEqual([root, camera, scene, true]);
  expect(root.visible).toBe(false);
  finish();
  expect(await pending).toBe(true);
  expect(root.visible).toBe(false);
});

test('a warm-up that fails leaves the root hidden and resolves false', async () => {
  const scene = new Scene(), root = new Group(), camera = new PerspectiveCamera();
  root.visible = false;
  expect(await warmHidden({ compileAsync: () => Promise.reject(new Error('lost')) }, root, camera, scene)).toBe(false);
  expect(await warmHidden({ compileAsync: () => { throw new Error('sync'); } }, root, camera, scene)).toBe(false);
  expect(root.visible).toBe(false);
});
