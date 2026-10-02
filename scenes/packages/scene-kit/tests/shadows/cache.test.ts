import { expect, test } from 'bun:test';
import { BoxGeometry, DirectionalLight, Group, HalfFloatType, InstancedMesh, Layers, Mesh, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, SkinnedMesh } from 'three/webgpu';
import { cachedSunShadow } from '../../src/shadows/cache';
import type { CachedSunShadowOptions } from '../../src/shadows/cache';
import { keepsShadowMask, layerBit, ShadowLayers, suppressedCasters } from '../../src/shadows/layers';

const material = new MeshStandardMaterial(), geometry = new BoxGeometry();
const S_BIT = 1 << 30, D_BIT = 1 << 31;
const box = (name: string, cast = true) => { const m = new Mesh(geometry, material); m.name = name; m.castShadow = cast; return m; };
const main = Object.assign(new PerspectiveCamera(), { name: 'main' }), mirror = Object.assign(new PerspectiveCamera(), { name: 'mirror' });

function farmSun() {
  const light = new DirectionalLight(); light.name = 'sun'; light.position.set(25, 42, 20); light.castShadow = true; light.shadow.mapSize.setScalar(2048);
  Object.assign(light.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 115 }); light.shadow.camera.updateProjectionMatrix();
  return light;
}
/**
 * Drives one child ShadowNode through three r186's own updateBefore gating (per camera and frame dedupe, never during
 * pre-compile, needsUpdate cleared only when the depth version held). updateShadow is stubbed: it logs the casters the
 * shadow camera would draw (visible through ancestors, on a camera layer, castShadow) and bumps the depth version on the
 * first render, as the first updateRenderTarget does.
 */
function drive(node: any, scene: Scene) {
  let first = true;const log: (string | number)[][] = [];
  node.shadowMap = { depthTexture: { version: 0 }, dispose() {} };
  node.updateShadow = (frame: { frameId: number }) => {
    node._depthVersionCached = node.shadowMap.depthTexture.version; if (first) { node.shadowMap.depthTexture.version++; first = false; }
    const drawn: (string | number)[] = [frame.frameId]; const layers: Layers = node.shadow.camera.layers;
    scene.traverseVisible(o => { if ((o as Mesh).isMesh && o.castShadow && o.layers.test(layers)) drawn.push(o.name); });
    log.push(drawn);
  };
  return { log, draw: (frameId: number, camera: PerspectiveCamera) => node.updateBefore({ renderer: { _isPreCompiling: false }, camera, frameId }) };
}
function setup(o: Partial<CachedSunShadowOptions> = {}) {
  const scene = new Scene(), light = farmSun(); scene.add(light, light.target); scene.updateMatrixWorld(true);
  const cache = cachedSunShadow({ light, settleFrames: 3, ...o }), composite = (light.shadow as any).shadowNode.node;
  const S = drive(composite.aNode, scene), D = drive(composite.bNode, scene);let frame = 0;
  /** One frame: the scene's update at SystemOrder.shadows, then every camera that draws a receiver. */
  const step = (cameras = [main]) => { cache.update(); for (const c of cameras) { S.draw(frame, c); D.draw(frame, c); } frame++; };
  return { scene, light, cache, S, D, step, composite };
}

test('mask math: kit bits sit above every scene layer and keep their own shadow masks', () => {
  expect(ShadowLayers).toEqual({ static: 30, live: 31 });
  const l = new Layers(); l.set(31); expect(l.test({ mask: layerBit(31) } as Layers)).toBe(true);
  expect([layerBit(30), layerBit(31)]).toEqual([S_BIT, D_BIT]);
  expect([keepsShadowMask(0), keepsShadowMask(1), keepsShadowMask(5), keepsShadowMask(S_BIT), keepsShadowMask(D_BIT), keepsShadowMask(S_BIT | D_BIT)]).toEqual([false, false, true, true, true, true]);
  for (const layers of [{ static: 0, live: 2 }, { static: 3, live: 3 }, { static: 1, live: 32 }]) expect(() => cachedSunShadow({ light: farmSun(), layers })).toThrow('distinct');
  const custom = cachedSunShadow({ light: farmSun(), layers: { static: 1, live: 2 } });
  expect([custom.staticShadow.camera.layers.mask, custom.liveShadow.camera.layers.mask]).toEqual([2, 4]);
});

test('install: two armed clones with their own placeholder lights, combined with min; one custom node per light', () => {
  const light = farmSun(), filter = () => 0; Object.assign(light.shadow, { filterNode: filter, mapType: HalfFloatType });
  const cache = cachedSunShadow({ light, liveMapSize: 1024 }), template = light.shadow as any, composite = template.shadowNode.node;
  const S = cache.staticShadow as any, D = cache.liveShadow as any;
  expect(composite.method).toBe('min');
  const nodes = [composite.aNode, composite.bNode];
  expect(nodes.map(n => [n.isShadowNode, n.shadow])).toEqual([[true, S], [true, D]]);
  expect(nodes[0].light).not.toBe(nodes[1].light);
  for (const n of nodes) {
    expect(n.light).not.toBe(light); expect(n.light.shadow).toBe(n.shadow); expect(n.light.castShadow).toBe(true);
    expect(n.light.matrixWorld).toBe(light.matrixWorld); expect(n.light.target).toBe(light.target); expect(n.light.parent).toBeNull();
  }
  expect(nodes.map(n => n.light.name)).toEqual(['sun static', 'sun live']);
  expect(new Set([template, S, D]).size).toBe(3); expect(new Set([template.camera, S.camera, D.camera]).size).toBe(3);
  expect([S.filterNode, D.filterNode, S.mapType, D.mapType]).toEqual([filter, filter, HalfFloatType, HalfFloatType]);
  expect([S.autoUpdate, S.needsUpdate, D.autoUpdate, D.needsUpdate]).toEqual([false, true, false, true]);
  expect([S.camera.layers.mask, D.camera.layers.mask]).toEqual([S_BIT, D_BIT]);
  expect([S.mapSize.x, D.mapSize.x, template.mapSize.x, template.mapSize.y]).toEqual([2048, 1024, 2048, 2048]);
  expect(light.castShadow).toBe(true); expect(template.map).toBeNull();
  expect(() => cachedSunShadow({ light })).toThrow('custom shadow node');
});

test('track adds the static bit per object to casters, suppressed casters and stand-ins, once', () => {
  const { scene, cache } = setup(), group = new Group(), caster = box('caster'), quiet = box('quiet', false), dropped = box('dropped', false), standIn = box('standIn');
  const batch = new InstancedMesh(geometry, material, 2); batch.castShadow = true; suppressedCasters.add(dropped);
  standIn.userData.kilnShadowStandIn = true; standIn.castShadow = false; standIn.layers.disableAll();
  group.add(caster, quiet, dropped, standIn, batch); scene.add(group);
  expect(cache.track(scene)).toBe(4);
  expect([caster, dropped, batch].map(m => m.layers.mask)).toEqual([1 | S_BIT, 1 | S_BIT, 1 | S_BIT]);
  expect([standIn.layers.mask, quiet.layers.mask, group.layers.mask]).toEqual([S_BIT, 1, 1]);
  expect(cache.track(scene)).toBe(0); expect(cache.track(group, { movable: () => true })).toBe(0);
  expect(cache.stats).toMatchObject({ staticCasters: 4, liveCasters: 0 });
});

test('arming: both maps render on the first two frames, a mover goes live and back, the live map clears once', () => {
  const { scene, cache, S, D, step } = setup(), still = box('still'), mover = box('mover'), rig = new Group();
  rig.add(mover); scene.add(still, rig); scene.updateMatrixWorld(true); cache.track(scene, { movable: n => n === rig });
  step([]); step([]);                                                    // no receiver drawn yet: the arms wait
  step(); step(); step();
  expect(S.log).toEqual([[2, 'still', 'mover'], [3, 'still', 'mover']]); // first render recreates the texture: two frames
  expect(D.log).toEqual([[2], [3]]);
  rig.position.x = 1; rig.updateMatrixWorld(true); step();               // frame 5: promote, static map re-armed without it
  expect(mover.layers.mask).toBe(1 | D_BIT);
  expect([S.log.at(-1), D.log.at(-1)]).toEqual([[5, 'still'], [5, 'mover']]);
  expect(cache.stats).toMatchObject({ staticCasters: 1, liveCasters: 1, staticRenders: 2 });
  expect(cache.stats.pendingSettle).toBeGreaterThan(0);
  rig.position.x = 2; rig.updateMatrixWorld(true); step([main, mirror]); // frame 6: live map only, once for two cameras
  expect(S.log.length).toBe(3); expect(D.log.slice(-2)).toEqual([[5, 'mover'], [6, 'mover']]);
  step(); step();                                                        // frames 7, 8: unchanged, still live
  expect(D.log.at(-1)).toEqual([8, 'mover']);
  step();                                                                // frame 9: settled, back to static, live map cleared
  expect(mover.layers.mask).toBe(1 | S_BIT);
  expect([S.log.at(-1), D.log.at(-1)]).toEqual([[9, 'still', 'mover'], [9]]);
  step(); step();
  expect([S.log.length, D.log.length]).toEqual([4, 7]);
  expect(cache.stats).toMatchObject({ staticCasters: 2, liveCasters: 0, staticRenders: 3, pendingSettle: 0 });
});

test('watched casters also go live on ancestor visibility, castShadow and instance changes; unwatched never do', () => {
  const { scene, cache, S, step } = setup(), still = box('still'), mover = box('mover'), rig = new Group(), batch = new InstancedMesh(geometry, material, 3);
  batch.name = 'batch'; batch.castShadow = true; rig.add(mover); scene.add(still, rig, batch); scene.updateMatrixWorld(true);
  cache.track(scene, { movable: n => n === rig || n === batch }); step(); step();
  const live = (m: Mesh, change: () => void) => { change(); step(); const promoted = (m.layers.mask & D_BIT) !== 0; for (let i = 0; i < 3; i++) step(); return promoted && (m.layers.mask & S_BIT) !== 0; };
  expect(live(mover, () => { rig.visible = false; })).toBe(true);
  expect(live(mover, () => { rig.visible = true; })).toBe(true);
  expect(live(mover, () => { mover.castShadow = false; })).toBe(true);
  expect(live(batch, () => { batch.instanceMatrix.needsUpdate = true; })).toBe(true);
  expect(live(batch, () => { batch.count = 1; })).toBe(true);
  const renders = cache.stats.staticRenders, logged = S.log.length;
  still.position.x = 3; still.updateMatrixWorld(true); step(); step();
  expect([still.layers.mask, cache.stats.staticRenders, S.log.length]).toEqual([1 | S_BIT, renders, logged]);
  const skinned = new SkinnedMesh(geometry, material); skinned.castShadow = true; rig.add(skinned); cache.track(rig, { movable: () => true });
  for (let i = 0; i < 6; i++) step();
  expect(skinned.layers.mask).toBe(1 | D_BIT);                           // bones move without a matrixWorld change
});

test('invalidate re-arms the static map and records why; prime fills the live map once, then clears it', () => {
  const { scene, cache, S, D, step } = setup(), still = box('still'), mover = box('mover'), rig = new Group();
  rig.add(mover); scene.add(still, rig); scene.updateMatrixWorld(true); cache.track(scene, { movable: n => n === rig });
  step(); step(); step();
  cache.invalidate('door'); cache.invalidate('door'); cache.invalidate('tier');
  expect(cache.stats).toMatchObject({ invalidations: 3, reasons: { door: 2, tier: 1 }, staticRenders: 4 });
  step(); step();
  expect(S.log.slice(2)).toEqual([[3, 'still', 'mover']]);
  cache.prime();
  expect(cache.liveShadow.camera.layers.mask).toBe(S_BIT | D_BIT);
  step();
  expect([S.log.at(-1), D.log.at(-1)]).toEqual([[5, 'still', 'mover'], [5, 'still', 'mover']]);
  step();
  expect(cache.liveShadow.camera.layers.mask).toBe(D_BIT); expect(D.log.at(-1)).toEqual([6]);
  step(); expect(D.log.at(-1)).toEqual([6]);
  expect(cache.stats.pendingSettle).toBe(0);
});

test('a prime before the first frame holds its mask until three clears the flag', () => {
  const { scene, cache, D, step } = setup(), still = box('still');
  scene.add(still); scene.updateMatrixWorld(true); cache.track(scene); cache.prime();
  step(); step(); step(); step();
  expect(D.log).toEqual([[0, 'still'], [1, 'still'], [2]]);
});

test('template sync: extents, depth range, zoom and filter values reach the live map every frame, the static map on re-arm', () => {
  const { light, cache, step } = setup(), S = cache.staticShadow, D = cache.liveShadow; step();
  Object.assign(light.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 2, far: 90, zoom: 2 });
  Object.assign(light.shadow, { bias: -.001, normalBias: .05, radius: 3, intensity: .6 });
  cache.update();
  const expected = new OrthographicCamera(-30, 30, 20, -20, 2, 90); expected.zoom = 2;
  const pick = (s: typeof S) => { const c = s.camera as OrthographicCamera; return [c.left, c.right, c.top, c.bottom, c.near, c.far, c.zoom, s.bias, s.normalBias, s.radius, s.intensity]; };
  expect(pick(D)).toEqual([-30, 30, 20, -20, 2, 90, 2, -.001, .05, 3, .6]);
  expected.coordinateSystem = D.camera.coordinateSystem; expected.updateProjectionMatrix();
  expect(D.camera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
  expect(pick(S)).toEqual([-44, 44, 44, -44, 1, 115, 1, 0, 0, 1, 1]);
  cache.invalidate('extent');
  expect(pick(S)).toEqual(pick(D)); expect(S.camera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
});

test('a resize re-arms both maps and moves the real light mapSize sentinel monotonically', () => {
  const { light, cache, step } = setup(), S = cache.staticShadow, D = cache.liveShadow, seen = [light.shadow.mapSize.y];
  step(); step();
  for (const size of [1024, 2048, 1024]) {
    light.shadow.mapSize.setScalar(size); cache.update();
    expect([S.mapSize.x, S.mapSize.y, D.mapSize.x, D.mapSize.y, S.needsUpdate, D.needsUpdate, light.shadow.mapSize.x]).toEqual([size, size, size, size, true, true, size]);
    expect(light.shadow.mapSize.y).toBeGreaterThan(Math.max(...seen, size)); seen.push(light.shadow.mapSize.y);
    step(); step(); cache.update(); expect(light.shadow.mapSize.y).toBe(seen.at(-1)!);
  }
  cache.dispose(); expect(light.shadow.mapSize.toArray()).toEqual([1024, 1024]);
  const small = setup({ liveMapSize: 512 }); small.light.shadow.mapSize.setScalar(1024); small.cache.update();
  expect([small.cache.staticShadow.mapSize.x, small.cache.liveShadow.mapSize.x]).toEqual([1024, 512]);
});

test('dispose: both shadow nodes, both shadows, then the custom node; only the bits it added come off', () => {
  const scene = new Scene(), light = farmSun(), cache = cachedSunShadow({ light, settleFrames: 1 }), composite = (light.shadow as any).shadowNode.node, order: string[] = [];
  const spy = (o: any, name: string) => { const original = o.dispose.bind(o); o.dispose = () => { order.push(name); original(); }; };
  spy(composite.aNode, 'static node'); spy(composite.bNode, 'live node'); spy(cache.staticShadow, 'static shadow'); spy(cache.liveShadow, 'live shadow');
  const plain = box('plain'), owned = box('owned'), mover = box('mover'), rig = new Group(); owned.layers.enable(30); rig.add(mover); scene.add(light, plain, owned, rig); scene.updateMatrixWorld(true);
  cache.track(scene, { movable: n => n === rig }); mover.position.y = 1; mover.updateMatrixWorld(); cache.update();
  expect(mover.layers.mask).toBe(1 | D_BIT);
  cache.dispose(); cache.dispose();
  expect(order).toEqual(['static node', 'live node', 'static shadow', 'live shadow']);
  expect('shadowNode' in light.shadow).toBe(false);
  expect([plain.layers.mask, owned.layers.mask, mover.layers.mask]).toEqual([1, 1 | S_BIT, 1]);
  expect(() => { cache.update(); cache.invalidate('late'); cache.prime(); }).not.toThrow();
  expect(cache.stats.invalidations).toBe(0);
  expect(() => cache.track(scene)).toThrow('disposed');
  expect(() => cachedSunShadow({ light }).dispose()).not.toThrow();
});
