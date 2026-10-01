import { expect, test } from 'bun:test';
import { AnimationClip, BoxGeometry, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, NumberKeyframeTrack } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LoadedPack } from '@kiln-scenes/scene-kit';
import { applyPlanting, buildPlacements, chooseClip, setCropShadows } from '../../src/world/placements';
import type { FarmLayout } from '../../src/world/types';
import fixture from '../../fixtures/placements.json';
import layoutFixture from '../../fixtures/layout.json';
import { fixturePack } from './placement-fixture';

test('U-19 sealed layout expands to all 589 frozen placements and per-asset totals', () => {
  const source = fixturePack(), data = layoutFixture as FarmLayout, built = buildPlacements(source.pack, data);
  expect(data.placements).toHaveLength(168); expect(built.instances).toHaveLength(589);
  expect(new Set(built.instances.map(i => i.id)).size).toBe(589);
  expect(built.stats.byAsset).toEqual(fixture.byAsset); expect(built.stats.mixers).toBe(589);
  for (let n = 0; n < built.instances.length; n++) {
    const instance = built.instances[n]!, expected = fixture.placements[n]!;
    expect(instance.id).toBe(expected.id); expect(instance.asset.id).toBe(expected.asset);
    for (let axis = 0; axis < 3; axis++) expect(instance.object.position.getComponent(axis)).toBeCloseTo(expected.position[axis]!, 6);
    expect(instance.object.rotation.y).toBeCloseTo(expected.yaw, 6);
    expect(instance.soilVisible ?? null).toBe(expected.soilVisible);
    expect(instance.object.parent).toBe(built.root);
  }
  expect(built.stats.hiddenSoil).toBe(461);
  built.dispose(); source.dispose();
});

test('U-19b every initial clip and global-index offset equals the sealed viewer', () => {
  const source = fixturePack(), built = buildPlacements(source.pack, layoutFixture as FarmLayout);
  const initial = built.initializeClips(); expect(initial).toHaveLength(589); expect(built.stats.activeMixers).toBe(22);
  for (let n = 0; n < initial.length; n++) {
    const actual = initial[n]!, expected = fixture.placements[n]!.initial;
    expect(actual.id).toBe(expected.id); expect(actual.instanceIndex).toBe(expected.instanceIndex);
    expect(actual.clipIndex).toBe(expected.clipIndex); expect(actual.clip).toBe(expected.clip);
    expect(actual.time).toBeCloseTo(expected.time, 6); expect(actual.timeScale).toBe(expected.timeScale);
  }
  expect(built.initializeClips()).toBe(initial); // no accidental restart during assembly
  built.dispose(); source.dispose();
});

if (process.env.ORACLE === '1') test('live sealed r33 oracle still matches frozen placement and herd fixtures', async () => {
  await import('../../scripts/gen-placement-golden');
});

function layout(placements: FarmLayout['placements']): FarmLayout {
  return { version: 2, name: 'Fixture', note: '', sizeMeters: 72, placements,
    presentation: { paths: [], beds: [], river: { millX: 25, millZ: -26.31, waterY: -.12 }, grass: { tufts: 14000, seed: 271026, quality: [7000, 14000] } }, views: {}, route: [] };
}
function model(root: Group, animations: AnimationClip[] = []): GLTF {
  return { scene: root, scenes: [root], animations, cameras: [], asset: { version: '2.0' }, parser: {} } as GLTF;
}
function pack(models: [string, GLTF][]): LoadedPack { return { models: new Map(models) } as LoadedPack; }
function crop() {
  const root = new Group(), soil = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), plant = new Group();
  soil.name = 'Mesh_Soil'; plant.name = 'Plant'; plant.add(new Mesh(soil.geometry, soil.material)); root.add(soil, plant);
  return { root, soil, plant };
}

test('placement wrappers preserve source resources, assembly omissions, soil and repeat transforms', () => {
  const wheat = crop(), original = model(wheat.root), fence = new Group(), assembly = new Group(), post = new Mesh(wheat.soil.geometry, wheat.soil.material);
  assembly.name = 'Fence'; post.name = 'Post'; assembly.add(post); fence.add(assembly);
  const built = buildPlacements(pack([['wheat', original], ['fence-straight', model(fence)]]), layout([
    { id: 'row', asset: 'wheat', position: [1, 2, 3], yaw: 90, soilMode: 'terrain', repeat: { count: 2, step: [2, .5, -1] } },
    { id: 'fence', asset: 'fence-straight', position: [0, 0, 0], yaw: 0, omittedPartPaths: ['Fence/Post'] },
  ]));
  expect(built.instances.map(i => i.id)).toEqual(['row-0', 'row-1', 'fence-0']);
  expect(built.root.children).toEqual(built.instances.map(i => i.object));
  expect(built.instances[1]!.object.position.toArray()).toEqual([3, 2.5, 2]);
  expect(built.instances[1]!.object.rotation.y).toBeCloseTo(Math.PI / 2, 12);
  expect(built.instances[0]!.object.getObjectByName('Mesh_Soil')!.visible).toBe(false);
  expect(wheat.soil.visible).toBe(true);
  expect(built.instances[2]!.object.getObjectByName('Post')).toBeUndefined();
  expect(fence.getObjectByName('Post')).toBe(post);
  const copied = built.instances[0]!.object.getObjectByName('Mesh_Soil') as Mesh;
  expect(copied.geometry).toBe(wheat.soil.geometry); expect(copied.material).toBe(wheat.soil.material);
  expect(copied.castShadow).toBe(true); expect(copied.receiveShadow).toBe(true);
  expect(setCropShadows(built.instances, false, false)).toBe(4);
  expect(copied.castShadow).toBe(false); expect(copied.receiveShadow).toBe(false);
  let geometryDisposals = 0, materialDisposals = 0;
  wheat.soil.geometry.addEventListener('dispose', () => geometryDisposals++);
  (wheat.soil.material as MeshBasicMaterial).addEventListener('dispose', () => materialDisposals++);
  const destination = new Group(); for (const i of built.instances) destination.add(i.object);
  built.dispose(); built.dispose();
  expect(destination.children).toHaveLength(0); expect(geometryDisposals).toBe(0); expect(materialDisposals).toBe(0);
  expect(() => built.updateMixers(.1)).toThrow(/disposed/);
  wheat.soil.geometry.dispose(); (wheat.soil.material as MeshBasicMaterial).dispose();
});

test('invalid omission and independent soil contracts fail before retaining a world', () => {
  const root = new Group(); root.name = 'Root';
  expect(() => buildPlacements(pack([['fence', model(root)]]), layout([{ id: 'broken', asset: 'fence', position: [0, 0, 0], yaw: 0, omittedPartPaths: ['missing'] }]))).toThrow('Missing removable assembly part broken: missing');
  expect(() => applyPlanting(root, 'wheat', false)).toThrow('Missing independent soil/plant contract: wheat');
  expect(applyPlanting(root, 'barrel', false)).toBeUndefined();
  expect(() => buildPlacements(pack([]), layout([{ id: 'missing', asset: 'cow', position: [0, 0, 0], yaw: 0 }]))).toThrow(/Missing.*cow/);
});

test('one-shot and reverse clips, action-only mixer steps and teardown cache ownership', () => {
  const root = new Group(); root.name = 'Wheel';
  const animations = ['Spin', 'DoorOpen', 'Idle'].map(name => new AnimationClip(name, 2, [new NumberKeyframeTrack('Wheel.rotation[x]', [0, 2], [0, 1])]));
  const built = buildPlacements(pack([['watermill', model(root, animations)]]), layout([{ id: 'mill', asset: 'watermill', position: [0, 0, 0], yaw: 0 }]));
  const instance = built.instances[0]!;
  expect(instance.action).toBeNull(); expect(built.initialClips).toHaveLength(0);
  built.initializeClips();
  expect(instance.action!.getClip().name).toBe('Spin'); expect(instance.action!.timeScale).toBe(-1); expect(instance.action!.loop).toBe(LoopRepeat);
  built.updateMixers(.8); expect(instance.mixer.time).toBeCloseTo(.1, 12);
  chooseClip(instance, '1'); expect(instance.action!.loop).toBe(LoopOnce); expect(instance.action!.clampWhenFinished).toBe(true); expect(instance.action!.timeScale).toBe(1);
  built.updateMixers(.1); expect(instance.action!.time).toBeCloseTo(.1, 12);
  chooseClip(instance, ''); const time = instance.mixer.time; built.updateMixers(.1); expect(instance.mixer.time).toBe(time);
  chooseClip(instance, '2'); expect(instance.action!.loop).toBe(LoopRepeat);
  built.dispose(); expect(instance.action).toBeNull(); expect(instance.mixer.existingAction(animations[2]!)).toBeNull();
});

test('placement teardown continues through a throwing mixer and clears retained instance roots', () => {
  const source = fixturePack(), built = buildPlacements(source.pack, layoutFixture as FarmLayout); built.initializeClips();
  const animated = built.instances.filter(i => i.action), failing = animated[0]!, another = animated[1]!, oldClip = failing.action!.getClip();
  failing.mixer.stopAllAction = () => { throw new Error('injected stop failure'); };
  expect(() => built.dispose()).toThrow('Farm placement cleanup failed');
  expect(failing.mixer.existingAction(oldClip)).toBeNull(); expect(failing.action).toBeNull(); expect(another.action).toBeNull();
  expect(failing.object.parent).toBeNull(); expect(another.object.parent).toBeNull();
  expect(built.instances).toHaveLength(0); expect(built.initialClips).toHaveLength(0); expect(built.root.children).toHaveLength(0);
  built.dispose(); source.dispose();
});
