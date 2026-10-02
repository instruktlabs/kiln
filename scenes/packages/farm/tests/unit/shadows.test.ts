import { expect, test } from 'bun:test';
import { AnimationClip, AnimationMixer, BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Scene, Texture } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import type { CachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import type { FarmInstance } from '../../src/world/types';
// Finish the pinned ESM three load before R3F's CJS entry requires it in Bun.
await import('three');
const { cachedSunShadow } = await import('@kiln-scenes/scene-kit/shadows');
const { buildFarmLighting } = await import('../../src/world/lighting');
const { bindFarmShadow, createFarmSun, farmShadowMovers, farmShadowOptions } = await import('../../src/world/shadows');
const { FARM_LOOK, FARM_SHADOW } = await import('../../src/constants');

const S_BIT = 1 << 30, D_BIT = 1 << 31, STAND_IN = 1 << FARM_SHADOW.standInLayer;
const tier = (enabled: boolean, mapSize: number) => ({ enabled, type: enabled ? 'pcf' as const : 'basic' as const, mapSize, maxCasters: enabled ? 1 : 0 });
const environment = () => { const texture = new Texture(); return { texture, dispose: () => texture.dispose() }; };
const on = { cache: true, standIns: true, minCasterTexels: 2, settleFrames: 30 };

test('S5 options: FARM_SHADOW defaults, overridden by the dev parameters (casterTexels 0 turns the threshold off)', () => {
  expect(FARM_SHADOW).toMatchObject({ cache: true, standIns: true, minCasterTexels: 2, settleFrames: 30 });
  expect(FARM_SHADOW.standInLayer).toBeGreaterThanOrEqual(1); expect(FARM_SHADOW.standInLayer).toBeLessThan(30);
  expect(farmShadowOptions({})).toEqual(on);
  expect(farmShadowOptions({ shadowCache: false, standIns: false, casterTexels: 0 })).toEqual({ cache: false, standIns: false, minCasterTexels: 0, settleFrames: 30 });
});

test('S5 sun: the INV 4.1 shadow frame at the tier map size', () => {
  const sun = createFarmSun(1024), c = sun.shadow.camera;
  expect([sun.position.toArray(), sun.color.getHex(), sun.intensity, sun.shadow.mapSize.toArray(), sun.shadow.normalBias]).toEqual([FARM_LOOK.sunPosition, FARM_LOOK.sunColor, FARM_LOOK.sunIntensity, [1024, 1024], FARM_LOOK.shadowNormalBias]);
  expect([c.left, c.right, c.top, c.bottom, c.near, c.far]).toEqual([-44, 44, 44, -44, 1, 115]);
  expect(c.projectionMatrix.elements[0]).toBeCloseTo(1 / 44, 12);
});

test('S5 lighting: the cached sun shadow exists only on shadow tiers, is published on the session and goes with its lights', () => {
  const scene = new Scene(), session: { shadow: CachedSunShadow | null } = { shadow: null };
  const high = buildFarmLighting(scene, tier(true, 2048), environment, on, session);
  expect(high.root.name).toBe('Farm lighting'); expect(high.sun.castShadow).toBe(true);
  expect(high.shadow).not.toBeNull(); expect(session.shadow).toBe(high.shadow);
  expect((high.sun.shadow as { shadowNode?: unknown }).shadowNode).toBeDefined();
  expect([high.shadow!.staticShadow.mapSize.x, high.shadow!.liveShadow.mapSize.x]).toEqual([2048, 2048]);
  // Without the cache the sun's own camera must see the stand-in layer as well as layer 0.
  expect(high.sun.shadow.camera.layers.mask).toBe(1 | STAND_IN);
  // A tier change: React disposes the old lights, then builds the new ones.
  high.dispose();
  expect(session.shadow).toBeNull(); expect((high.sun.shadow as { shadowNode?: unknown }).shadowNode).toBeUndefined(); expect(high.root.parent).toBeNull();
  const economy = buildFarmLighting(scene, tier(true, 512), environment, on, session);
  expect(session.shadow).toBe(economy.shadow); expect(economy.shadow!.staticShadow.mapSize.x).toBe(512);
  // Built before the old one is disposed: disposing the older build never unpublishes the newer cache.
  const balanced = buildFarmLighting(scene, tier(true, 1024), environment, on, session);
  expect(session.shadow).toBe(balanced.shadow); economy.dispose(); expect(session.shadow).toBe(balanced.shadow);
  balanced.dispose(); expect(session.shadow).toBeNull();
  const minimal = buildFarmLighting(scene, tier(false, 512), environment, on, session);
  expect([minimal.shadow, session.shadow, minimal.sun.castShadow, minimal.sun.shadow.camera.layers.mask]).toEqual([null, null, false, 1]);
  expect((minimal.sun.shadow as { shadowNode?: unknown }).shadowNode).toBeUndefined(); minimal.dispose();
  const plain = buildFarmLighting(scene, tier(true, 2048), environment, { ...on, cache: false, standIns: false }, session);
  expect([plain.shadow, session.shadow, plain.sun.shadow.camera.layers.mask]).toEqual([null, null, 1]); plain.dispose();
  expect(scene.environment).toBeNull();
});

// A world as World.tsx binds it: a farmhouse with a door, a fixed fence, the herd's dynamic batch.
function world(optimized = true) {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), root = new Scene();
  const cast = (m: Mesh) => { m.castShadow = true; return m; };
  const place = (id: string, extra?: (clone: Group) => void, action = false): FarmInstance => {
    const object = new Group(), clone = new Group(); object.name = `${id}-0`; clone.name = id; object.add(clone); clone.add(cast(new Mesh(geometry, material))); extra?.(clone); root.add(object);
    const mixer = new AnimationMixer(clone), clips = action ? [new AnimationClip('Spin', 1, [])] : [];
    return { id: object.name, asset: { id }, object, mixer, clips, action: action ? mixer.clipAction(clips[0]!) : null, clipIndex: action ? '0' : '' };
  };
  const pivot = new Group(); pivot.name = 'Joint_FrontDoor'; pivot.position.set(1, 0, 0);
  const leaf = cast(new Mesh(geometry, material)); pivot.add(leaf);
  const house = place('farmhouse', clone => clone.add(pivot)), fence = place('fence-straight'), windmill = place('windmill', undefined, true), tractor = place('tractor'), cow = place('cow', undefined, true);
  const herd = cast(new InstancedMesh(geometry, material, 2)), still = cast(new InstancedMesh(geometry, material, 2)); root.add(herd, still);
  root.updateMatrixWorld(true);
  const batches = { batches: [{ mesh: herd, sources: [], dynamic: true }, { mesh: still, sources: [], dynamic: false }] };
  return { root, house, fence, windmill, tractor, cow, pivot, leaf, herd, still, body: house.object.children[0]!.children[0] as Mesh,
    farm: { root, placements: { instances: [house, fence, windmill, tractor, cow] }, sim: { doors: [{ pivots: [pivot] }] }, optimization: optimized ? { heroes: [house, windmill, tractor], batches } : null } };
}

test('S5 movers: hero wrappers, dynamic batches and door pivots; without optimization every animated, driven or walked owner', () => {
  const w = world(), names = (set: Set<Object3D>) => [...set].map(o => o.name || (o === w.herd ? 'herd' : '?')).sort();
  expect(names(farmShadowMovers(w.farm))).toEqual(['Joint_FrontDoor', 'farmhouse-0', 'herd', 'tractor-0', 'windmill-0']);
  const b = world(false);
  expect([...farmShadowMovers(b.farm)].map(o => o.name).sort()).toEqual(['Joint_FrontDoor', 'cow-0', 'tractor-0', 'windmill-0']);
});

test('S5 binding: tracks once the world shows (a hidden first world would all go live at reveal), promotes only what moves and re-tracks a new cache', () => {
  const w = world(), light = createFarmSun(2048); light.castShadow = true;
  let cache: CachedSunShadow | null = cachedSunShadow({ light, settleFrames: 2 });
  const binding = bindFarmShadow(w.farm, () => cache);
  w.root.visible = false; binding.update();
  expect(w.body.layers.mask).toBe(1); expect(cache.stats.reasons.track).toBeUndefined();
  w.root.visible = true; binding.update();
  expect([w.body.layers.mask, w.leaf.layers.mask, w.herd.layers.mask, w.still.layers.mask]).toEqual([1 | S_BIT, 1 | S_BIT, 1 | S_BIT, 1 | S_BIT]);
  expect(cache.stats.reasons.track).toBe(1); binding.update(); expect(cache.stats.reasons.track).toBe(1);
  // The door swings: only its leaf goes live and the static map re-arms; two still frames later it is static again.
  const armed = cache.stats.staticRenders;
  w.pivot.rotation.y = 1; w.root.updateMatrixWorld(true); binding.update();
  expect([w.leaf.layers.mask, w.body.layers.mask]).toEqual([1 | D_BIT, 1 | S_BIT]); expect(cache.stats.staticRenders).toBe(armed + 1);
  binding.update(); binding.update(); expect(w.leaf.layers.mask).toBe(1 | S_BIT); expect(cache.stats.pendingSettle).toBeGreaterThanOrEqual(0);
  // The herd's instance matrices change: the batch goes live; a static batch never does.
  w.herd.instanceMatrix.needsUpdate = true; w.still.instanceMatrix.needsUpdate = true; binding.update();
  expect([w.herd.layers.mask, w.still.layers.mask]).toEqual([1 | D_BIT, 1 | S_BIT]);
  binding.prime(); expect(cache.liveShadow.camera.layers.mask).toBe(S_BIT | D_BIT);
  // Lights rebuilt: a new cache tracks the same world again.
  cache.dispose(); const next = cachedSunShadow({ light, settleFrames: 2 }); cache = next; binding.update();
  expect(next.stats.reasons.track).toBe(1); expect(w.body.layers.mask).toBe(1 | S_BIT);
  cache = null; binding.update(); next.dispose();
});
