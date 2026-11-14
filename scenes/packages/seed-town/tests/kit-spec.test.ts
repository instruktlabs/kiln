import { expect, test } from 'bun:test';
import { kitSpec, shows, valueOf, weights } from '../src/kit-spec';
import type { KitDeclaration, KitGltf } from '../src/kit-spec';

/** A kit in miniature: a wall that is always drawn, a choice of two windows, a shutter inside one of them, and a glow. */
const KIT: KitGltf = {
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'Bay', children: [1, 2, 4, 7, 8] },
    { name: 'Mesh_Wall', mesh: 0 },
    { name: 'Window_sash', children: [3], extras: { kilnParamV1: { name: 'window', type: 'choice', visibleWhen: ['sash'] } } },
    { name: 'Mesh_Sash', mesh: 1 },
    { name: 'Window_casement', children: [5, 6], extras: { kilnParamV1: { name: 'window', type: 'choice', visibleWhen: ['casement', 'arched'] } } },
    { name: 'Mesh_Casement', mesh: 2 },
    { name: 'Mesh_Shutters', mesh: 3, extras: { kilnParamV1: { name: 'shutters', type: 'toggle', visibleWhen: [true] } } },
    { name: 'Mesh_Glow', mesh: 4, extras: { kilnParamV1: { name: 'lit', type: 'toggle', visibleWhen: [true] } } },
    { name: 'Port_z1', translation: [0, 0, 1.8] },
  ],
  meshes: [
    { primitives: [{ material: 0, targets: [{}, {}, {}] }], extras: { targetNames: ['bayWidth=1.6', 'bayWidth=2', 'storeyHeight=3.3'] } },
    { primitives: [{ material: 1, targets: [{}, {}] }], extras: { targetNames: ['bayWidth=1.6', 'bayWidth=2'] } },
    { primitives: [{ material: 1 }] },
    { primitives: [{ material: 1 }] },
    { primitives: [{ material: 2 }] },
  ],
  materials: [
    { extras: { kilnParamV1: { name: 'wall', type: 'color' } } },
    { extras: { kilnParamV1: { name: 'joinery', type: 'color' } } },
    {},
  ],
};

const DECLARATION: KitDeclaration = {
  defaults: { bayWidth: 1.8, storeyHeight: 3, window: 'sash', shutters: false, lit: false, wall: '#d9c7a3', joinery: '#3f5a4a' },
  sizes: { bayWidth: { min: 1.6, default: 1.8, max: 2 }, storeyHeight: { min: 3, default: 3, max: 3.3 } },
};

const spec = kitSpec('bay', KIT);
const part = (name: string) => spec.meshes.find(mesh => mesh.name === name)!;

test('a kit lists its drawn parts with their material colour, option tags and targets', () => {
  expect(spec.meshes.map(mesh => mesh.name)).toEqual(['Mesh_Wall', 'Mesh_Sash', 'Mesh_Casement', 'Mesh_Shutters', 'Mesh_Glow']);
  expect(part('Mesh_Wall')).toMatchObject({ node: 1, mesh: 0, material: 0, colour: 'wall', conditions: [] });
  expect(part('Mesh_Wall').targets).toEqual([
    { param: 'bayWidth', value: 1.6, index: 0 }, { param: 'bayWidth', value: 2, index: 1 }, { param: 'storeyHeight', value: 3.3, index: 2 },
  ]);
  expect(part('Mesh_Glow').colour).toBeNull();
  // A part inherits the tags above it and adds its own.
  expect(part('Mesh_Shutters').conditions).toEqual([
    { param: 'window', visibleWhen: ['casement', 'arched'] }, { param: 'shutters', visibleWhen: [true] },
  ]);
});

test('a part shows only when every tag on its path holds, with the kit defaults filling what a plan leaves out', () => {
  expect(shows(part('Mesh_Wall'), DECLARATION, {})).toBe(true);
  expect(shows(part('Mesh_Sash'), DECLARATION, {})).toBe(true);
  expect(shows(part('Mesh_Casement'), DECLARATION, {})).toBe(false);
  expect(shows(part('Mesh_Casement'), DECLARATION, { window: 'arched' })).toBe(true);
  expect(shows(part('Mesh_Sash'), DECLARATION, { window: 'arched' })).toBe(false);
  expect(shows(part('Mesh_Shutters'), DECLARATION, { shutters: true })).toBe(false);
  expect(shows(part('Mesh_Shutters'), DECLARATION, { shutters: true, window: 'casement' })).toBe(true);
  expect(shows(part('Mesh_Glow'), DECLARATION, { lit: true })).toBe(true);
  expect(valueOf(DECLARATION, { wall: '#aa0000' }, 'wall')).toBe('#aa0000');
  expect(valueOf(DECLARATION, {}, 'wall')).toBe('#d9c7a3');
});

test('a size is a fraction of the way from its default to the end on its side', () => {
  const out: number[] = [];
  weights('bay', part('Mesh_Wall'), DECLARATION, {}, out);
  expect(out).toEqual([0, 0, 0]);
  weights('bay', part('Mesh_Wall'), DECLARATION, { bayWidth: 2, storeyHeight: 3.3 }, out);
  expect(out).toEqual([0, 1, 1]);
  weights('bay', part('Mesh_Wall'), DECLARATION, { bayWidth: 1.6 }, out);
  expect(out).toEqual([1, 0, 0]);
  weights('bay', part('Mesh_Wall'), DECLARATION, { bayWidth: 1.7, storeyHeight: 3.1 }, out);
  expect(out[0]).toBeCloseTo(0.5, 9);
  expect(out[1]).toBe(0);
  expect(out[2]).toBeCloseTo(1 / 3, 9);
  expect(() => weights('bay', part('Mesh_Wall'), DECLARATION, { bayWidth: 2.4 }, out)).toThrow('outside 1.6 to 2');
});

test('a kit the page could not draw correctly is refused', () => {
  const moved: KitGltf = { ...KIT, nodes: KIT.nodes!.map(node => (node.name === 'Mesh_Sash' ? { ...node, translation: [0, 1, 0] } : node)) };
  expect(() => kitSpec('bay', moved)).toThrow('not at the kit origin');
  const unnamed: KitGltf = { ...KIT, meshes: KIT.meshes!.map((mesh, i) => (i === 1 ? { primitives: mesh.primitives } : mesh)) };
  expect(() => kitSpec('bay', unnamed)).toThrow('unnamed morph targets');
  const odd: KitGltf = { ...KIT, meshes: KIT.meshes!.map((mesh, i) => (i === 1 ? { ...mesh, extras: { targetNames: ['bayWidth', 'bayWidth=2'] } } : mesh)) };
  expect(() => kitSpec('bay', odd)).toThrow('<parameter>=<value>');
  expect(() => kitSpec('bay', { scenes: [{ nodes: [0] }], nodes: [{ name: 'Empty' }] })).toThrow('no drawn parts');
  const undeclared: KitDeclaration = { ...DECLARATION, sizes: { bayWidth: DECLARATION.sizes.bayWidth! } };
  expect(() => weights('bay', part('Mesh_Wall'), undeclared, {}, [])).toThrow('storeyHeight is not declared');
});
