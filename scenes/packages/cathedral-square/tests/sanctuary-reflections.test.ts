import { expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
await import('three');
const { Group, Mesh, MeshStandardMaterial, Texture } = await import('three/webgpu');
const { createSanctuaryGoldBinding } = await import('../src/sanctuary-gold');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

test('the staged cathedral and crucifix select both intended authored gold materials', async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'reflection-image-free', loadTexture: () => Promise.resolve(null) }));
  const load = async (id: string) => {
    const bytes = readFileSync(new URL(`../standalone/public/assets/models/${id}.glb`, import.meta.url));
    return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  };
  const [cathedral, crucifix] = await Promise.all([load('cathedral'), load('crucifix')]);
  const binding = createSanctuaryGoldBinding(cathedral, crucifix);
  expect(binding.materialCount).toBe(2);
  binding.dispose();
});

test('sanctuary reflections preserve authored gold and exterior materials and never own borrowed textures', () => {
  const cathedral = new Group(), furnishings = new Group(), map = new Texture(), reflection = new Texture();
  const gilt = new MeshStandardMaterial({ name: 'Gilding', color: 0xd8b35c, metalness: 1, roughness: .25, map });
  const gold = new MeshStandardMaterial({ name: 'Gold_Leaf', color: 0xd4a343, metalness: 1, roughness: .25 });
  const retable = new Mesh(undefined, gilt), exterior = new Mesh(undefined, gilt), halo = new Mesh(undefined, gold);
  retable.name = 'Mesh_Sanctuary_Gilt'; exterior.name = 'Mesh_West_Gable_Gilt'; halo.name = 'Mesh_Halo_Disk';
  cathedral.add(retable, exterior); furnishings.add(halo);
  const binding = createSanctuaryGoldBinding(cathedral, furnishings);
  expect(retable.material === gilt).toBe(false);
  expect(exterior.material).toBe(gilt);
  expect(halo.material === gold).toBe(false);
  expect(retable.material.color.equals(gilt.color)).toBe(true);
  expect(retable.material.metalness).toBe(1);
  expect(retable.material.roughness).toBe(.25);
  expect(retable.material.map).toBe(map);
  binding.setEnvironment(reflection);
  expect(retable.material.envMap).toBe(reflection);
  expect(halo.material.envMap).toBe(reflection);
  expect(gilt.envMap).toBeNull(); expect(gold.envMap).toBeNull();
  const scene = new Group(); scene.add(cathedral, furnishings);
  const restoreCapture = binding.hideForCapture(scene);
  expect(retable.visible).toBe(false); expect(halo.visible).toBe(false); expect(exterior.visible).toBe(true);
  restoreCapture(); expect(retable.visible).toBe(true); expect(halo.visible).toBe(true);
  const owned = spyOn(retable.material, 'dispose'), borrowed = spyOn(gilt, 'dispose'), image = spyOn(map, 'dispose'), env = spyOn(reflection, 'dispose');
  binding.dispose(); binding.dispose();
  expect(retable.material).toBe(gilt); expect(halo.material).toBe(gold);
  expect(owned).toHaveBeenCalledTimes(1); expect(borrowed).not.toHaveBeenCalled();
  expect(image).not.toHaveBeenCalled(); expect(env).not.toHaveBeenCalled();
});
