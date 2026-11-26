import { expect, test } from 'bun:test';
import type { KitDeclaration, KitMeshSpec } from '../src/kit-spec';
import type { TownPlacement, TownPlan } from '../src/plan/town-plan.js';
await import('three');
const { BufferAttribute, BufferGeometry, Matrix4, MeshStandardMaterial, Vector3 } = await import('three/webgpu');
const { deltaTexel, MORPH, morphOf, packDeltas, sampleMorph, townMorph, weightRows } = await import('../src/morph');
const { bakePart, createTownView, placementMatrix } = await import('../src/town');
type Kit = import('../src/town').Kit;
type InstancedMesh = import('three/webgpu').InstancedMesh;

const attribute = (values: number[]) => new BufferAttribute(new Float32Array(values), 3);
function geometry(vertices: number, positions: number[][] = [], normals?: number[][]) {
  const made = new BufferGeometry();
  made.setAttribute('position', attribute(Array.from({ length: vertices * 3 }, (_, i) => i)));
  if (positions.length) made.morphAttributes.position = positions.map(attribute);
  if (normals) made.morphAttributes.normal = normals.map(attribute);
  return made;
}

test('every part gets a block of whole rows in one delta texture: a position and a normal texel per vertex per target', () => {
  const a = geometry(3, [[1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15, 16, 17, 18]]);
  const b = geometry(4, [[1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0]], [[0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]]);
  const atlas = packDeltas([a, geometry(5), b], 4);
  // 2 targets x 3 vertices x 2 texels = 12 texels = 3 rows; a part without sizes takes none; 1 x 4 x 2 = 8 texels = 2 rows.
  expect(atlas.blocks).toEqual([{ row: 0, vertices: 3, targets: 2 }, { row: 3, vertices: 5, targets: 0 }, { row: 3, vertices: 4, targets: 1 }]);
  expect([atlas.width, atlas.height]).toEqual([4, 5]);
  expect(atlas.data.length).toBe(4 * 5 * 4);
  const texel = (x: number, y: number) => Array.from(atlas.data.slice((y * atlas.width + x) * 4, (y * atlas.width + x) * 4 + 3));
  // Target 1 of part a, vertex 1: texel (1 x 3 + 1) x 2 = 8, the first of row 2. No normal target: its texel stays zero.
  expect(deltaTexel(atlas.blocks[0]!, 1, 1, 4)).toEqual([0, 2]);
  expect(texel(0, 2)).toEqual([13, 14, 15]);
  expect(texel(1, 2)).toEqual([0, 0, 0]);
  // Part b, vertex 3: texel 6 of its block, in its second row; the normal delta follows the position delta.
  expect(deltaTexel(atlas.blocks[2]!, 0, 3, 4)).toEqual([2, 4]);
  expect(texel(2, 4)).toEqual([4, 0, 0]);
  expect(texel(3, 4)).toEqual([0, 4, 0]);
  // Nothing to pack still makes a texture the shader can bind.
  expect(packDeltas([geometry(3)], 4)).toMatchObject({ width: 4, height: 1, blocks: [{ row: 0, vertices: 3, targets: 0 }] });
  // A pair of texels never straddles two rows.
  expect(MORPH.width % 2).toBe(0);
  expect(() => packDeltas([a], 3)).toThrow('even');
});

test('each mesh gets a run of texels in one weight texture: a turn and one weight per target for every instance', () => {
  expect(weightRows([{ count: 3, targets: 2 }, { count: 0, targets: 5 }, { count: 2, targets: 0 }])).toEqual({ bases: [0, 12, 12], texels: 16 });
});

function testKit(): Kit {
  const wallGeometry = new BufferGeometry();
  wallGeometry.setAttribute('position', attribute([0, 0, 0, 0, 0, 1, 0, 1, 0]));
  wallGeometry.setAttribute('normal', attribute([1, 0, 0, 1, 0, 0, 1, 0, 0]));
  wallGeometry.setIndex([0, 1, 2]);
  wallGeometry.morphAttributes.position = [attribute([0, 0, 0, 0, 0, -0.5, 0, 0, 0]), attribute([0, 0, 0, 0.25, 0, 1, 0, 0, 0])];
  wallGeometry.morphAttributes.normal = [attribute([0, 0, 0, 0, 0, 0, 0, 0, 0]), attribute([0, 0, 0, 0, 0, 0.5, 0, 0, 0])];
  wallGeometry.morphTargetsRelative = true;
  const doorGeometry = new BufferGeometry();
  doorGeometry.setAttribute('position', attribute([0, 0, 0, 0, 0, 1, 0, 1, 0]));
  const declaration: KitDeclaration = { defaults: { width: 1, door: false, wall: '#808080' }, sizes: { width: { min: 0.5, default: 1, max: 2 } } };
  const wall: KitMeshSpec = {
    node: 1, name: 'Mesh_Wall', mesh: 0, material: 0, conditions: [], colour: 'wall',
    targets: [{ param: 'width', value: 0.5, index: 0 }, { param: 'width', value: 2, index: 1 }],
  };
  const door: KitMeshSpec = { node: 2, name: 'Mesh_Door', mesh: 1, material: 1, conditions: [{ param: 'door', visibleWhen: [true] }], colour: null, targets: [] };
  return {
    id: 'bay', declaration,
    parts: [
      { spec: wall, geometry: wallGeometry, material: new MeshStandardMaterial({ color: 0xffffff }), shadows: true },
      { spec: door, geometry: doorGeometry, material: new MeshStandardMaterial({ color: 0x402010 }), shadows: true },
    ],
  };
}
const place = (id: string, values: TownPlacement['values'], pos: [number, number, number], yaw = 0): TownPlacement => ({ id, kit: 'bay', values, pos, yaw });
const plan = (placements: TownPlacement[]): TownPlan => ({ placements } as TownPlan);

test('the view draws kit parts without morph attributes, so parts that share a material share one shader', () => {
  const kit = testKit(), view = createTownView(new Map([['bay', kit]]));
  view.apply(plan([place('a', { width: 2, wall: '#ff0000' }, [10, 0, 0]), place('b', { width: 0.75, door: true }, [0, 0, 5], 90), place('c', {}, [1, 2, 3])]));
  const [wall, door] = view.root.children as InstancedMesh[];
  const source = kit.parts[0]!.geometry;
  // three keys a shader build by the ids of a geometry's morph attributes: the drawn geometry has none.
  expect(wall!.geometry).not.toBe(source);
  expect(Object.keys(wall!.geometry.morphAttributes)).toEqual([]);
  expect(wall!.geometry.getAttribute('position')).toBe(source.getAttribute('position'));
  expect(wall!.geometry.getAttribute('normal')).toBe(source.getAttribute('normal'));
  expect(wall!.geometry.index).toBe(source.index);
  expect(wall!.morphTexture).toBeNull();
  // The kit keeps its own geometry whole: the CPU bake and the tree portraits read the targets there.
  expect(source.morphAttributes.position!.length).toBe(2);
  // One node moves every part, in the camera's pass and (three copies positionNode) in the shadow pass.
  expect((wall!.material as unknown as { positionNode: unknown }).positionNode).toBe(townMorph);
  expect((door!.material as unknown as { positionNode: unknown }).positionNode).toBe(townMorph);

  const wallMorph = morphOf(wall!)!, doorMorph = morphOf(door!)!;
  expect(wallMorph.shared).toBe(doorMorph.shared);
  // (first row of the part's deltas, targets, vertices, first texel of the mesh's weights)
  expect(wallMorph.info.toArray()).toEqual([0, 2, 3, 0]);
  expect(doorMorph.info.toArray()).toEqual([1, 0, 3, 12]);
  const weights = wallMorph.shared.weights.image.data as Float32Array;
  expect(wallMorph.shared.weights.image.width).toBe(MORPH.width);
  const rows = Array.from(weights.slice(0, 14)).map(v => +v.toFixed(6));
  // Per instance: cos and sin of its yaw, then the weights. Width 2 is the whole of target 1; 0.75 is half of target 0.
  expect(rows).toEqual([1, 0, 0, 1, 0, 1, 0.5, 0, 1, 0, 0, 0, 0, 1]);
  view.dispose();
});

test('the shader arithmetic, mirrored on the CPU, lands every vertex where the CPU bake puts it', () => {
  const kit = testKit(), view = createTownView(new Map([['bay', kit]]));
  const places = [place('a', { width: 2 }, [10, 0, 0], 30), place('b', { width: 0.75 }, [0, 1, 5], 215), place('c', {}, [1, 2, 3], -90)];
  view.apply(plan(places));
  const wall = view.root.children[0] as InstancedMesh, morph = morphOf(wall)!;
  const base = kit.parts[0]!.geometry.getAttribute('position'), matrix = new Matrix4(), move = new Vector3(), bend = new Vector3(), at = new Vector3();
  places.forEach((item, instance) => {
    const baked: number[] = [];
    bakePart(kit, kit.parts[0]!, item, baked);
    for (let vertex = 0; vertex < 3; vertex++) {
      sampleMorph(morph, instance, vertex, move, bend);
      // three's instancing first, then the node adds the turned delta.
      wall.getMatrixAt(instance, matrix);
      at.fromBufferAttribute(base, vertex).applyMatrix4(matrix).add(move);
      for (let axis = 0; axis < 3; axis++) expect(at.getComponent(axis)).toBeCloseTo(baked[vertex * 3 + axis]!, 5);
    }
  });
  // The normal delta turns with the placement too: target 1 bends vertex 1's normal along the kit's +Z.
  sampleMorph(morph, 0, 1, move, bend);
  const expected = new Vector3(0, 0, 0.5).transformDirection(placementMatrix(places[0]!, new Matrix4())).multiplyScalar(0.5);
  for (let axis = 0; axis < 3; axis++) expect(bend.getComponent(axis)).toBeCloseTo(expected.getComponent(axis), 6);
  view.dispose();
});

test('a plan that outgrows the weight texture gets a larger one, and every mesh reads the new one', () => {
  const kit = testKit(), view = createTownView(new Map([['bay', kit]]));
  view.apply(plan([place('a', {}, [0, 0, 0])]));
  const wall = view.root.children[0] as InstancedMesh, first = morphOf(wall)!.shared.weights;
  const many = Array.from({ length: Math.ceil(MORPH.width * first.image.height / 4) + 8 }, (_, i) => place(`p${i}`, { door: true }, [i, 0, 0]));
  view.apply(plan(many));
  const grown = view.root.children.find(child => child.name === 'bay:Mesh_Wall') as InstancedMesh;
  const second = morphOf(grown)!.shared.weights;
  expect(second).not.toBe(first);
  expect(second.image.width * second.image.height).toBeGreaterThanOrEqual(many.length * 6);
  expect(morphOf(view.root.children.find(child => child.name === 'bay:Mesh_Door') as InstancedMesh)!.info.w).toBe(many.length * 4);
  view.dispose();
});
