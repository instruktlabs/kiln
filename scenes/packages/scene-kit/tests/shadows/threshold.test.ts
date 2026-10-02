import { expect, test } from 'bun:test';
import { BoxGeometry, CylinderGeometry, DirectionalLight, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, SpotLight } from 'three/webgpu';
import { casterTexels, shadowTexelSize, smallCasterThreshold } from '../../src/shadows/threshold';
import { suppressedCasters } from '../../src/shadows/layers';
import { casterSize } from '../../src/testing/probe-core';

const material = new MeshStandardMaterial();
/** A Farm-like sun: ±44 m orthographic box, looking down from `position` at the origin. */
function sun(position: [number, number, number], mapSize = 2048) {
  const light = new DirectionalLight(); light.position.set(...position); light.castShadow = true; light.shadow.mapSize.setScalar(mapSize);
  Object.assign(light.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 115 }); light.shadow.camera.updateProjectionMatrix();
  light.updateMatrixWorld(true); light.target.updateMatrixWorld(true); return light;
}
const mesh = (w: number, h: number, d: number, cast = true) => { const m = new Mesh(new BoxGeometry(w, h, d), material); m.castShadow = cast; return m; };

test('texel size is the orthographic width over zoom and map width; other shadows never read as small', () => {
  const light = sun([25, 42, 20]);
  expect(shadowTexelSize(light.shadow)).toBe(88 / 2048);
  light.shadow.camera.zoom = 2; expect(shadowTexelSize(light.shadow)).toBe(44 / 2048);
  light.shadow.mapSize.setScalar(512); expect(shadowTexelSize(light.shadow)).toBe(44 / 512);
  expect(shadowTexelSize(new SpotLight().shadow)).toBe(0);
  expect(casterTexels(mesh(.01, .01, .01), light, 0)).toBe(Infinity);
});

test('light measure: box extent across the sun view, through world scale; sphere measure ignores orientation', () => {
  const overhead = sun([0, 50, 0]), side = sun([50, 0, 0]), box = mesh(1, 2, 4), parent = new Group();
  parent.add(box); parent.updateMatrixWorld(true);
  expect(casterTexels(box, overhead, .5)).toBeCloseTo(8);  // x 1, z 4 seen from above
  expect(casterTexels(box, side, .5)).toBeCloseTo(8);      // y 2, z 4 seen from the side
  box.rotation.y = Math.PI / 2; parent.scale.setScalar(2); parent.updateMatrixWorld(true);
  expect(casterTexels(box, side, .5)).toBeCloseTo(8);      // z now lies along the sun: y 2 × 2 = 4 m
  const diameter = 2 * Math.sqrt(.25 + 1 + 4) * 2;
  expect(casterTexels(box, side, .5, 'sphere')).toBeCloseTo(diameter / .5);
  expect(casterTexels(box, overhead, .5, 'sphere')).toBeCloseTo(diameter / .5);
});

test('an InstancedMesh is sized by its largest drawn instance in both measures, aligned with the count probe', () => {
  const light = sun([0, 50, 0]), batch = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 3);
  batch.setMatrixAt(0, new Matrix4().makeScale(1, 1, 1)); batch.setMatrixAt(1, new Matrix4().makeScale(2, 2, 2)); batch.setMatrixAt(2, new Matrix4().makeScale(5, 5, 5));
  batch.scale.setScalar(.5); batch.updateMatrixWorld(true);
  expect(casterTexels(batch, light, .1)).toBeCloseTo(25);
  batch.count = 2;
  expect(casterTexels(batch, light, .1)).toBeCloseTo(10);
  expect(casterTexels(batch, light, .1, 'sphere')).toBeCloseTo(Math.sqrt(3) * 10);
  // The sphere measure is the count probe's casters-under-N-texels measure (probe-core casterSize).
  const single = mesh(.3, 2, .1); single.scale.set(1, 3, 1); single.updateMatrixWorld(true);
  for (const m of [batch, single]) expect(casterTexels(m, light, .1, 'sphere')).toBeCloseTo(casterSize(m, .1).texels!);
});

test('threshold drops visible small casters, keeps the rest, marks them suppressed and restores', () => {
  const scene = new Scene(), light = sun([25, 42, 20], 512), texel = 88 / 512;
  const big = mesh(2, 2, 2), small = mesh(.1, .1, .1), quiet = mesh(.1, .1, .1, false), hidden = mesh(.1, .1, .1), kept = mesh(.1, .1, .1), hiddenParent = new Group();
  const batch = new InstancedMesh(new BoxGeometry(.1, .1, .1), material, 2); batch.castShadow = true; batch.setMatrixAt(1, new Matrix4().makeScale(40, 40, 40));
  const tiny = new InstancedMesh(new BoxGeometry(.1, .1, .1), material, 2); tiny.castShadow = true;
  hiddenParent.visible = false; hiddenParent.add(hidden); kept.name = 'keep';
  scene.add(big, small, quiet, hiddenParent, kept, batch, tiny); scene.updateMatrixWorld(true);
  let changes = 0;
  const t = smallCasterThreshold(scene, light, { include: m => m.name !== 'keep', onChange: () => changes++ });
  expect(new Set(t.dropped)).toEqual(new Set<Mesh>([small, tiny]));
  expect(t.stats).toEqual({ casters: 4, dropped: 2, texel });
  expect([small.castShadow, tiny.castShadow, big.castShadow, batch.castShadow, hidden.castShadow, kept.castShadow, quiet.castShadow]).toEqual([false, false, true, true, true, true, false]);
  expect(suppressedCasters.has(small) && suppressedCasters.has(tiny) && !suppressedCasters.has(big)).toBe(true);
  expect(changes).toBe(1);
  t.restore(); t.restore();
  expect([small.castShadow, tiny.castShadow, quiet.castShadow]).toEqual([true, true, false]);
  expect(suppressedCasters.has(small)).toBe(false);
  expect(t.dropped).toEqual([]);
  expect(changes).toBe(2);
  expect(() => t.update()).toThrow('restored');
});

test('update re-evaluates on a texel change in both directions and reports only real changes', () => {
  const scene = new Scene(), light = sun([25, 42, 20], 2048), a = mesh(.04, .04, .04), b = mesh(.15, .15, .15);
  scene.add(a, b); scene.updateMatrixWorld(true);
  let changes = 0;
  const t = smallCasterThreshold(scene, light, { minTexels: 2, onChange: () => changes++ });
  expect(t.dropped).toEqual([a]); expect(changes).toBe(1);
  t.update(); expect(changes).toBe(1);
  light.shadow.mapSize.setScalar(512); t.update();
  expect(new Set(t.dropped)).toEqual(new Set([a, b])); expect(b.castShadow).toBe(false); expect(changes).toBe(2);
  light.shadow.mapSize.setScalar(4096); t.update();
  expect(t.dropped).toEqual([]); expect([a.castShadow, b.castShadow]).toEqual([true, true]); expect(changes).toBe(3);
  expect(t.stats.dropped).toBe(0);
});

test('the default sphere measure keeps a rod pointed at the sun; the light measure drops it', () => {
  const scene = new Scene(), light = sun([0, 50, 0], 512), rod = new Mesh(new CylinderGeometry(.02, .02, 3), material);
  rod.castShadow = true; scene.add(rod); scene.updateMatrixWorld(true);
  const sphere = smallCasterThreshold(scene, light);
  expect(sphere.dropped).toEqual([]); sphere.restore();
  const projected = smallCasterThreshold(scene, light, { measure: 'light' });
  expect(projected.dropped).toEqual([rod]); projected.restore();
  expect(rod.castShadow).toBe(true);
});
