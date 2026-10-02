// The shared planting path (dev parameter plantingShared): one material graph for every plant, each part's colour and
// roughness carried in its vertices, one instanced draw per plant type and LOD level. Synthetic plants (the real GLBs
// are not in a fresh clone), built the way the saved ones are: three declared levels, material objects shared by level.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BoxGeometry, Group, InstancedBufferGeometry, InstancedMesh, InterleavedBufferAttribute, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseCampus } from '../../src/campus/data';
import { campusPlantings, PLANT_SIZES } from '../../src/campus/exterior/planting';
import type { PlantType } from '../../src/campus/exterior/planting';
import { buildCampusVegetation } from '../../src/campus/exterior/vegetation';
import { PLANT_COLUMNS, plantLook } from '../../src/campus/exterior/plant-material';

const PACKAGE = resolve(import.meta.dir, '../..');
const data = parseCampus(readFileSync(resolve(PACKAGE, 'data/campus.json'), 'utf8')), placements = campusPlantings(data);
const BARK = { color: 0x6b6259, roughness: 0.95 }, MID = { color: 0x4f7a3a, roughness: 0.9 }, LIGHT = { color: 0x6e9a47, roughness: 0.9 }, DARK = { color: 0x37592b, roughness: 0.9 };
const LAYERS: Record<string, { name: string; look: { color: number; roughness: number } }[][]> = {
  broad: [[{ name: 'Trunk', look: BARK }, { name: 'CrownMid', look: MID }, { name: 'CrownLight', look: LIGHT }, { name: 'CrownDark', look: DARK }], [{ name: 'Trunk', look: BARK }, { name: 'CrownMid', look: MID }, { name: 'CrownDark', look: DARK }], [{ name: 'Trunk', look: BARK }, { name: 'CrownMid', look: MID }]],
  bush: [[{ name: 'Foliage', look: MID }], [{ name: 'Foliage', look: MID }], [{ name: 'Foliage', look: MID }]],
};

/** A plant shaped like the saved ones: LOD0 under the scene root, the two lower levels reached through MSFT_lod. */
function plant(type: PlantType, layers = LAYERS[type.startsWith('shrub') || type.startsWith('hedge') ? 'bush' : 'broad']!, extra?: (material: MeshStandardMaterial) => void): GLTF {
  const height = PLANT_SIZES[type][1], materials = new Map<string, MeshStandardMaterial>(), root = new Group(), levels: Object3D[] = [];
  root.name = `${type}_1`;
  layers.forEach((parts, level) => {
    const node = new Group(); node.name = `LOD${level}`;
    parts.forEach((part, k) => {
      const key = `${part.look.color}`;
      let material = materials.get(key);
      if (!material) { material = new MeshStandardMaterial({ color: part.look.color, roughness: part.look.roughness, name: part.name }); extra?.(material); materials.set(key, material); }
      const geometry = new BoxGeometry(1 + k, height / (k + 2), 1 + k).translate(0, height * (k + 1) / (k + 3), 0);
      const mesh = new Mesh(geometry, material); mesh.name = `${part.name}_${level}`; node.add(mesh);
    });
    levels.push(node);
  });
  root.add(levels[0]!);
  return { scene: root, parser: { associations: new Map([[levels[0], { nodes: 0 }]]), json: { nodes: [{ extensions: { MSFT_lod: { ids: [1, 2] } } }] }, getDependency: async (_: string, id: number) => levels[id]! } } as unknown as GLTF;
}
const models = (make: (type: PlantType) => GLTF = type => plant(type)) => new Map(Object.keys(PLANT_SIZES).map(type => [`plant-${type}`, make(type as PlantType)]));

const near = () => { const c = new PerspectiveCamera(50, 1, .1, 20000); c.position.set(0, 50, 110); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };
const far = () => { const c = new PerspectiveCamera(50, 1, .1, 20000); c.position.set(0, 2200, 2800); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };
const meshes = (root: Group) => root.children as Mesh[];
const columnsOf = (mesh: Mesh) => PLANT_COLUMNS.map(name => (mesh.geometry.getAttribute(name) as InterleavedBufferAttribute));

describe('plantLook: the parts one vertex material can carry', () => {
  test('a plain opaque matte standard material is carried as its linear colour and roughness', () => {
    const material = new MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 });
    expect(plantLook(material)).toEqual([Math.fround(material.color.r), Math.fround(material.color.g), Math.fround(material.color.b), Math.fround(0.9)]);
  });
  test('anything it cannot reproduce exactly is refused: maps, emission, metal, translucency, two sides, vertex colours', () => {
    const base = () => new MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 });
    const refused = [(m: MeshStandardMaterial) => { m.metalness = 0.5; }, (m: MeshStandardMaterial) => { m.emissive.set(0x101010); }, (m: MeshStandardMaterial) => { m.transparent = true; },
      (m: MeshStandardMaterial) => { m.opacity = 0.5; }, (m: MeshStandardMaterial) => { m.side = 2; }, (m: MeshStandardMaterial) => { m.vertexColors = true; },
      (m: MeshStandardMaterial) => { m.alphaTest = 0.5; }, (m: MeshStandardMaterial) => { m.flatShading = true; }, (m: MeshStandardMaterial) => { m.envMapIntensity = 2; }];
    for (const change of refused) { const m = base(); change(m); expect(plantLook(m)).toBeNull(); }
    const textured = base(); textured.map = { isTexture: true } as never; expect(plantLook(textured)).toBeNull();
  });
});

describe('shared planting', () => {
  test('every plant draws through one material and one instanced draw per type and level, none an InstancedMesh', async () => {
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!;
    expect(meshes(shared.root)).toHaveLength(Object.keys(PLANT_SIZES).length * 3);
    expect(new Set(meshes(shared.root).map(m => m.material)).size).toBe(1);
    for (const mesh of meshes(shared.root)) {
      expect((mesh as unknown as InstancedMesh).isInstancedMesh).not.toBe(true);
      expect((mesh.geometry as InstancedBufferGeometry).isInstancedBufferGeometry).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
    }
    expect(shared.stats().shared).toBe(true);
    const classic = (await buildCampusVegetation(data, models(), placements, { shared: false }))!;
    expect(meshes(classic.root).length).toBeGreaterThan(meshes(shared.root).length);
    expect(meshes(classic.root).every(m => (m as unknown as InstancedMesh).isInstancedMesh)).toBe(true);
    expect(classic.stats().shared).toBe(false);
    shared.dispose(); classic.dispose();
  });

  test('each vertex carries exactly the colour and roughness of the material its part had', async () => {
    const gltfs = models(), shared = (await buildCampusVegetation(data, gltfs, placements, { shared: true }))!;
    for (const [type, level, parts] of [['tree-broad-l', 0, [BARK, MID, LIGHT, DARK]], ['tree-broad-s', 1, [BARK, MID, DARK]], ['tree-ornamental', 2, [BARK, MID]], ['shrub-mound', 0, [MID]]] as const) {
      const mesh = meshes(shared.root).find(m => m.name === `${type}-lod${level}`)!, look = mesh.geometry.getAttribute('plantLook');
      expect(look.itemSize).toBe(4);
      const tuples = new Map<string, number>();
      for (let i = 0; i < look.count; i++) { const key = [0, 1, 2, 3].map(k => look.array[i * 4 + k]).join(','); tuples.set(key, (tuples.get(key) ?? 0) + 1); }
      const expected = parts.map(p => plantLook(new MeshStandardMaterial(p))!.join(','));
      expect([...tuples.keys()].sort()).toEqual([...expected].sort());
      // Each part is one box, 36 vertices once drawn without an index.
      for (const count of tuples.values()) expect(count).toBe(36);
    }
    shared.dispose();
  });

  test('the instances and counts equal the per-material path: same rows, same slots, same matrices, fewer draws', async () => {
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!, classic = (await buildCampusVegetation(data, models(), placements, { shared: false }))!;
    for (const camera of [near(), far(), near()]) {
      shared.update(camera, 1); classic.update(camera, 1);
      const a = shared.stats(), b = classic.stats();
      expect({ ...a, draws: 0, shared: false }).toEqual({ ...b, draws: 0, shared: false });
      expect(a.visible).toBeGreaterThan(10);
      expect(a.draws).toBeLessThan(b.draws);
      let drawn = 0;
      for (const mesh of meshes(shared.root)) {
        const [type, level] = mesh.name.split('-lod') as [string, string], count = (mesh.geometry as InstancedBufferGeometry).instanceCount;
        expect(mesh.visible).toBe(count > 0);
        const twins = meshes(classic.root).filter(m => m.name.startsWith(`${type}-lod${level}-`)) as InstancedMesh[];
        for (const twin of twins) expect(twin.count).toBe(count);
        if (!count) continue;
        drawn++;
        const [c0, c1, c2, c3] = columnsOf(mesh), data = c0!.data.array as Float32Array;
        expect([c1!.data, c2!.data, c3!.data]).toEqual([c0!.data, c0!.data, c0!.data]);
        expect([c0!.offset, c1!.offset, c2!.offset, c3!.offset]).toEqual([0, 4, 8, 12]);
        expect(c0!.data.stride).toBe(16);
        expect(Array.from(data.subarray(0, count * 16))).toEqual(Array.from((twins[0]!.instanceMatrix.array as Float32Array).subarray(0, count * 16)));
      }
      expect(drawn).toBe(a.draws);
    }
    shared.dispose(); classic.dispose();
  });

  test('no shared plant casts a shadow: its instancing runs in the material setupPosition, which override-material passes skip', async () => {
    // A shadow, depth-prepass or picking pass draws with an override material that never runs setupPosition, so there every
    // plant would sit at its origin (wave-B review R7). Foundry Floor has no such pass; this fails if a shared plant joins one.
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!;
    shared.update(near(), 1);
    expect(meshes(shared.root).filter(m => !(m as unknown as InstancedMesh).isInstancedMesh && m.castShadow).map(m => m.name)).toEqual([]);
    shared.dispose();
  });

  test('a still camera uploads nothing: the instance buffer is rewritten only when a slot or the count changes', async () => {
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!, camera = near();
    shared.update(camera, 1);
    const versions = () => meshes(shared.root).map(m => columnsOf(m)[0]!.data.version);
    const first = versions();
    expect(first.some(v => v > 0)).toBe(true);
    shared.update(camera, 1); expect(versions()).toEqual(first);
    shared.update(far(), 1); expect(versions()).not.toEqual(first);
    shared.dispose();
  });

  test('only the slots in use are uploaded', async () => {
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!;
    shared.update(near(), 1);
    for (const mesh of meshes(shared.root)) {
      const count = (mesh.geometry as InstancedBufferGeometry).instanceCount, data = columnsOf(mesh)[0]!.data;
      if (count) expect(data.updateRanges).toEqual([{ start: 0, count: count * 16 }]);
    }
    shared.dispose();
  });

  test('a level one vertex material cannot reproduce stays on the per-material path, beside the shared ones', async () => {
    const odd = (type: PlantType) => plant(type, undefined, type === 'tree-broad-m' ? m => { m.emissive.set(0x202020); } : undefined);
    const mixed = (await buildCampusVegetation(data, models(odd), placements, { shared: true }))!;
    const own = meshes(mixed.root).filter(m => (m as unknown as InstancedMesh).isInstancedMesh);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every(m => m.name.startsWith('tree-broad-m-lod'))).toBe(true);
    expect(meshes(mixed.root).filter(m => !(m as unknown as InstancedMesh).isInstancedMesh).length).toBeGreaterThan(0);
    mixed.update(near(), 1);
    expect(mixed.stats().visible).toBeGreaterThan(10);
    mixed.dispose(); expect(mixed.root.children).toHaveLength(0);
  });

  test('dispose removes every mesh and frees the geometries and the material', async () => {
    const shared = (await buildCampusVegetation(data, models(), placements, { shared: true }))!, root = shared.root, kept = meshes(root).map(m => m.geometry);
    let disposed = 0; for (const g of kept) g.addEventListener('dispose', () => { disposed++; });
    const material = meshes(root)[0]!.material as { addEventListener(type: string, fn: () => void): void }; let materialDisposed = 0; material.addEventListener('dispose', () => { materialDisposed++; });
    shared.dispose();
    expect(root.children).toHaveLength(0); expect(disposed).toBe(kept.length); expect(materialDisposed).toBe(1);
  });
});

// With the saved plants (staged in the repository's pack, not in a fresh clone): every part of every level is carried.
const STAGED = resolve(PACKAGE, 'staged/revision2/models/vegetation'), saved = existsSync(STAGED);
describe.skipIf(!saved)('shared planting with the saved plants', () => {
  test('every part of the eight saved plants is carried, so every plant draws through one material', async () => {
    const real = new Map<string, GLTF>();
    for (const type of Object.keys(PLANT_SIZES)) { const bytes = readFileSync(resolve(STAGED, `${type}.glb`)); real.set(`plant-${type}`, await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')); }
    const shared = (await buildCampusVegetation(data, real, placements, { shared: true }))!;
    expect(meshes(shared.root)).toHaveLength(24);
    expect(new Set(meshes(shared.root).map(m => m.material)).size).toBe(1);
    shared.dispose();
  });
});
