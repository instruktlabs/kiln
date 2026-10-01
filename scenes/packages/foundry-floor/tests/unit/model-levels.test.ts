import { expect, test } from 'bun:test';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, VectorKeyframeTrack } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { bakeModel } from '../../src/scene/glb/bake';
import { prepareModelLevels } from '../../src/scene/glb/model-levels';
import { sceneTree, worldMatrices } from '../../scripts/glb';

test('declared off-scene LOD keeps parent transforms, coarse animation and plain scene fallback', async () => {
  const scene = new Group(), asset = new Group(), detail = new Group(), coarse = new Group(), legacy = new Group();
  asset.name = 'Asset'; asset.position.x = 5; scene.add(asset);
  detail.name = 'LOD0'; coarse.name = 'LOD1'; legacy.name = 'lod1'; asset.add(detail); coarse.add(legacy);
  const detailed = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()); detailed.name = 'shell'; detail.add(detailed);
  const deck = new Mesh(new BoxGeometry(1, .1, 1), new MeshStandardMaterial()); deck.name = 'lod1Deck'; deck.position.y = 1; legacy.add(deck);
  const objects = [asset, detail, coarse, legacy, detailed, deck];
  const nodes = objects.map((obj, i) => ({ name: obj.name, children: obj.children.map(c => objects.indexOf(c)).filter(n => n >= 0), translation: obj.position.toArray(), ...(i === 1 ? { extensions: { MSFT_lod: { ids: [2] } } } : {}) }));
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes };
  const associations = new Map(objects.map((obj, i) => [obj, { nodes: i }]));
  // GLTFLoader loads animated off-scene targets early, then prunes their parser associations to the default scene.
  // A later getDependency returns the cached object without restoring that association.
  associations.delete(deck);
  const gltf = { scene, animations: [new AnimationClip('DeckUp', 2, [new VectorKeyframeTrack('lod1Deck.position', [0, 2], [0, 1, 0, 0, 1.15, 0])])], parser: { json, associations, getDependency: async (_: string, index: number) => objects[index] } } as unknown as GLTF;
  await prepareModelLevels(gltf);
  const model = bakeModel('fixture', gltf, { anchors: ['lod1Deck'], clips: ['DeckUp'], forms: [] });
  expect(scene.getObjectByName('LOD1')).toBeUndefined();
  expect(model.forms[0]!.triangles).toEqual([12, 12]);
  expect(model.locator('lod1Deck')!.elements[12]).toBe(5);
  const posed = new Float32Array(model.anchors.length * 16); model.pose({ clips: [['DeckUp', 2]] }, posed);
  expect(posed[model.anchorIndex('lod1Deck') * 16 + 13]).toBeCloseTo(1.15, 6);
  const tree = sceneTree({ json, bin: new Uint8Array() }), world = worldMatrices(tree);
  expect(world[5]![12]).toBe(5);
  expect(world[5]![13]).toBe(1);
  model.dispose(); detailed.geometry.dispose(); deck.geometry.dispose();
});
