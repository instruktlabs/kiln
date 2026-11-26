import { expect, test } from 'bun:test';
import type { KitDeclaration, KitMeshSpec } from '../src/kit-spec';
import type { TownPlacement, TownPlan } from '../src/plan/town-plan.js';
await import('three');
const { Box3, BufferAttribute, BufferGeometry, Color, Matrix4, MeshStandardMaterial, Vector3 } = await import('three/webgpu');
const { backingOf, BACKING, bakeKits, bakePart, castsSun, createTownView, placementBox, placementMatrix } = await import('../src/town');
type Kit = import('../src/town').Kit;

/** One triangle with a width target that moves its second corner 1 m along +Z, and a second, optional triangle. */
function testKit(): Kit {
  const triangle = () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 3));
    return geometry;
  };
  const wallGeometry = triangle();
  wallGeometry.morphAttributes.position = [
    new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, -0.5, 0, 0, 0]), 3),
    new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 0]), 3),
  ];
  wallGeometry.morphTargetsRelative = true;
  const declaration: KitDeclaration = {
    defaults: { width: 1, door: false, wall: '#808080' },
    sizes: { width: { min: 0.5, default: 1, max: 2 } },
  };
  const wall: KitMeshSpec = {
    node: 1, name: 'Mesh_Wall', mesh: 0, material: 0, conditions: [], colour: 'wall',
    targets: [{ param: 'width', value: 0.5, index: 0 }, { param: 'width', value: 2, index: 1 }],
  };
  const door: KitMeshSpec = {
    node: 2, name: 'Mesh_Door', mesh: 1, material: 1, conditions: [{ param: 'door', visibleWhen: [true] }], colour: null, targets: [],
  };
  return {
    id: 'bay', declaration,
    parts: [
      { spec: wall, geometry: wallGeometry, material: new MeshStandardMaterial({ color: 0xffffff }), shadows: true },
      { spec: door, geometry: triangle(), material: new MeshStandardMaterial({ color: 0x402010 }), shadows: true },
    ],
  };
}

const place = (id: string, values: TownPlacement['values'], pos: [number, number, number], yaw = 0): TownPlacement => ({ id, kit: 'bay', values, pos, yaw });
const plan = (placements: TownPlacement[]): TownPlan => ({ placements } as TownPlan);
const kits = () => new Map([['bay', testKit()]]);

test('each shown part gets one instance per placement, with its matrix, size and colour', () => {
  const view = createTownView(kits());
  const replaced = view.apply(plan([
    place('a', { width: 2, wall: '#ff0000' }, [10, 0, 0]),
    place('b', { width: 0.75, door: true }, [0, 0, 5], 90),
    place('c', {}, [1, 2, 3]),
  ]));
  expect(replaced).toBe(true);
  const [wall, door] = view.root.children as import('three/webgpu').InstancedMesh[];
  expect([wall!.name, wall!.count, wall!.visible]).toEqual(['bay:Mesh_Wall', 3, true]);
  expect([door!.name, door!.count, door!.visible]).toEqual(['bay:Mesh_Door', 1, true]);
  const matrix = new Matrix4();
  wall!.getMatrixAt(0, matrix);
  expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([10, 0, 0]);
  // A quarter turn about Y carries the kit's +Z onto +X.
  wall!.getMatrixAt(1, matrix);
  const turned = new Vector3(0, 0, 1).applyMatrix4(matrix);
  expect(turned.x).toBeCloseTo(1, 6);
  expect(turned.z).toBeCloseTo(5, 6);
  // The sizes ride in the view's own textures (morph.test.ts), not in three's per-mesh morph texture.
  expect(wall!.morphTexture).toBeNull();
  const colour = new Color();
  wall!.getColorAt(0, colour);
  expect(colour.getHexString()).toBe('ff0000');
  wall!.getColorAt(2, colour);
  expect(colour.getHexString()).toBe('808080');
  expect(door!.instanceColor).toBeNull();
  expect(view.stats).toEqual({ placements: 3, instances: 4, draws: 2, triangles: 4, parts: 2 });
  view.dispose();
});

test('a new plan rewrites the same meshes, and only outgrowing them replaces one', () => {
  const view = createTownView(kits());
  view.apply(plan([place('a', {}, [0, 0, 0]), place('b', {}, [1, 0, 0]), place('c', {}, [2, 0, 0])]));
  const first = [...view.root.children];
  expect(view.apply(plan([place('a', { width: 2 }, [5, 0, 0])]))).toBe(false);
  expect(view.root.children).toEqual(first);
  const wall = first[0] as import('three/webgpu').InstancedMesh;
  expect([wall.count, wall.visible]).toEqual([1, true]);
  // No door anywhere: the mesh stays, hidden, and counts as no draw.
  expect((first[1] as import('three/webgpu').InstancedMesh).visible).toBe(false);
  expect(view.stats.draws).toBe(1);
  const many = Array.from({ length: 40 }, (_, i) => place(`p${i}`, { door: true }, [i, 0, 0]));
  expect(view.apply(plan(many))).toBe(true);
  expect((view.root.children.find(child => child.name === 'bay:Mesh_Wall') as import('three/webgpu').InstancedMesh).count).toBe(40);
  expect(view.stats).toMatchObject({ instances: 80, draws: 2 });
  expect(() => view.apply(plan([{ id: 'x', kit: 'tower', values: {}, pos: [0, 0, 0], yaw: 0 }]))).toThrow('unknown kit: tower');
  view.dispose();
  expect(() => view.apply(plan([]))).toThrow('disposed');
});

test('a part baked on the CPU is the instance the GPU draws: sizes applied, then the placement', () => {
  const kit = testKit(), out: number[] = [];
  bakePart(kit, kit.parts[0]!, place('a', { width: 2 }, [10, 0, 0]), out);
  expect(out).toEqual([10, 0, 0, 10, 0, 2, 10, 1, 0]);
  out.length = 0;
  bakePart(kit, kit.parts[0]!, place('b', { width: 0.75 }, [0, 0, 0]), out, new Vector3(0, 0, 100));
  expect(out).toEqual([0, 0, 100, 0, 0, 100.75, 0, 1, 100]);
  const town = plan([place('a', { width: 2, door: true }, [0, 0, 0]), place('b', {}, [0, 0, 10])]);
  // Two walls and one door: three triangles.
  expect(bakeKits(new Map([['bay', kit]]), town, ['bay']).length).toBe(27);
  expect(bakeKits(new Map([['bay', kit]]), town, ['paving']).length).toBe(0);
  const box = placementBox(new Map([['bay', kit]]), town.placements[0]!, new Box3());
  expect([box.min.toArray(), box.max.toArray()]).toEqual([[0, 0, 0], [0, 1, 2]]);
});

test('a placement turns about Y by its yaw in degrees', () => {
  const matrix = placementMatrix(place('a', {}, [1, 2, 3], 180), new Matrix4());
  const point = new Vector3(1, 0, 1).applyMatrix4(matrix);
  expect(point.x).toBeCloseTo(0, 6);
  expect(point.y).toBeCloseTo(2, 6);
  expect(point.z).toBeCloseTo(2, 6);
});

test('window glass casts into the sun shadow though it takes none: no sun crosses a building through its windows', () => {
  expect(castsSun('facade-bay', 'glass', false)).toBe(true);
  expect(castsSun('ground-bay', 'glow', false)).toBe(true);
  expect(castsSun('roof', 'wall', false)).toBe(true);
  expect(castsSun('street-furniture', 'water', true)).toBe(false);
  // Trees stand outside the shadow map; their shade is drawn on the ground.
  expect(castsSun('tree', 'bark', false)).toBe(false);
});

/** A bay kit with one triangle, enough for the view to stand a backing behind it. */
function bayKit(id: string, defaults: KitDeclaration['defaults']): Kit {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 3));
  const spec: KitMeshSpec = { node: 1, name: 'Mesh_Wall', mesh: 0, material: 0, conditions: [], colour: null, targets: [] };
  return { id, declaration: { defaults, sizes: {} }, parts: [{ spec, geometry, material: new MeshStandardMaterial(), shadows: true }] };
}

test('every bay but a passage stands in front of a dark slab that casts, so a gap in a front shows a dark room and not the sky', () => {
  const facade = bayKit('facade-bay', { bayWidth: 1.8, storeyHeight: 3 }), ground = bayKit('ground-bay', { bayWidth: 1.8, shopHeight: 3.5, front: 'shopWindow' });
  const at = (id: string, kit: string, values: TownPlacement['values'], pos: [number, number, number], yaw = 0): TownPlacement => ({ id, kit, values, pos, yaw });
  expect(backingOf(at('a', 'facade-bay', { bayWidth: 2 }, [0, 0, 0]), facade.declaration)).toEqual({ height: 3, width: 2 });
  expect(backingOf(at('b', 'ground-bay', {}, [0, 0, 0]), ground.declaration)).toEqual({ height: 3.5, width: 1.8 });
  expect(backingOf(at('c', 'ground-bay', { front: 'passage' }, [0, 0, 0]), ground.declaration)).toBeNull();
  expect(backingOf(at('d', 'roof', {}, [0, 0, 0]), facade.declaration)).toBeNull();

  const view = createTownView(new Map([['facade-bay', facade], ['ground-bay', ground]]));
  expect(view.apply(plan([
    at('a', 'facade-bay', { bayWidth: 2 }, [10, 3.5, 0]),
    at('b', 'ground-bay', {}, [0, 0, 5], 90),
    at('c', 'ground-bay', { front: 'passage' }, [0, 0, 9]),
  ]))).toBe(true);
  const backing = view.root.children.find(child => child.name === 'Bay backing') as import('three/webgpu').InstancedMesh;
  expect([backing.count, backing.visible, backing.castShadow, backing.receiveShadow]).toEqual([2, true, true, false]);
  const matrix = new Matrix4(), centre = new Vector3(), size = new Vector3();
  backing.getMatrixAt(0, matrix);
  // Behind the wall's own depth, as wide and tall as the bay.
  expect(centre.setFromMatrixPosition(matrix).toArray().map(v => +v.toFixed(4))).toEqual([10 - BACKING.back - BACKING.thick / 2, 5, 1]);
  expect(size.setFromMatrixScale(matrix).toArray().map(v => +v.toFixed(4))).toEqual([BACKING.thick, 3, 2]);
  expect(BACKING.back).toBeGreaterThan(0.3);
  // A quarter turn carries the kit's -X (into the building) onto +Z.
  backing.getMatrixAt(1, matrix);
  expect(centre.setFromMatrixPosition(matrix).toArray().map(v => +v.toFixed(4))).toEqual([0.9, 1.75, +(5 + BACKING.back + BACKING.thick / 2).toFixed(4)]);
  // Three kit draws and the backing.
  expect(view.stats.draws).toBe(3);
  // Fewer bays reuse the mesh.
  expect(view.apply(plan([at('a', 'facade-bay', {}, [0, 0, 0])]))).toBe(false);
  expect(backing.count).toBe(1);
  view.dispose();
});
