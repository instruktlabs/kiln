import { expect, test } from 'bun:test';
import type { KitDeclaration, KitMeshSpec } from '../src/kit-spec';
import type { TownPlacement, TownPlan } from '../src/plan/town-plan.js';
await import('three');
const { Box3, BufferAttribute, BufferGeometry, Color, Matrix4, MeshStandardMaterial, Vector3 } = await import('three/webgpu');
const { bakeKits, bakePart, createTownView, placementBox, placementMatrix } = await import('../src/town');
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
  // One door, padded to two instances so three reads per-instance data; the pad draws nothing.
  expect([door!.name, door!.count, door!.visible]).toEqual(['bay:Mesh_Door', 2, true]);
  const matrix = new Matrix4();
  door!.getMatrixAt(1, matrix);
  expect(new Vector3(3, 4, 5).applyMatrix4(matrix).toArray()).toEqual([0, 0, 0]);
  wall!.getMatrixAt(0, matrix);
  expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([10, 0, 0]);
  // A quarter turn about Y carries the kit's +Z onto +X.
  wall!.getMatrixAt(1, matrix);
  const turned = new Vector3(0, 0, 1).applyMatrix4(matrix);
  expect(turned.x).toBeCloseTo(1, 6);
  expect(turned.z).toBeCloseTo(5, 6);
  const morph = wall!.morphTexture!.image.data as Float32Array;
  expect(wall!.morphTexture!.image.width).toBe(3);
  expect(Array.from(morph.slice(0, 9))).toEqual([1, 0, 1, 1, 0.5, 0, 1, 0, 0]);
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
  expect([wall.count, wall.visible]).toEqual([2, true]);
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
