import { expect, test } from 'bun:test';
import { comparePlacement, lineCount, mergeGlbs, openGlb } from './stage-text-to-3d.mjs';

/** The smallest GLB that holds named meshes: each part is one triangle at its own offset, with a node translation and a material. */
function glb(parts: { name: string; at?: number[]; size?: number; material?: string; colour?: number }[]) {
  const stride = 16;
  const bin = Buffer.alloc(parts.length * 3 * stride);
  const materials = [...new Set(parts.map((part) => part.material ?? 'Stone'))];
  parts.forEach(({ size = 1, colour = 0 }, index) => {
    [[0, 0, 0], [size, 0, 0], [0, size, 0]].forEach((corner, vertex) => {
      const offset = (index * 3 + vertex) * stride;
      corner.forEach((value, axis) => bin.writeFloatLE(value, offset + axis * 4));
      bin.writeFloatLE(colour, offset + 12);
    });
  });
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: parts.map((_, index) => index) }],
    nodes: parts.map(({ name, at = [0, 0, 0] }, index) => ({ name, mesh: index, translation: at })),
    materials: materials.map((name) => ({ name })),
    meshes: parts.map(({ material = 'Stone' }, index) => ({ primitives: [{ attributes: { POSITION: index }, material: materials.indexOf(material) }] })),
    accessors: parts.map(({ size = 1 }, index) => ({ bufferView: 0, byteOffset: index * 3 * stride, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [size, size, 0] })),
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, byteStride: stride }],
    buffers: [{ byteLength: bin.length }],
  };
  const text = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (bytes: Buffer, type: string) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(bytes.length, 0);
    head.write(type, 4);
    return Buffer.concat([head, bytes]);
  };
  return Buffer.concat([header, chunk(text, 'JSON'), chunk(bin, 'BIN\0')]);
}

test('two saved GLBs make one scene, with every mesh kept and the second one placed by a single new node', () => {
  const church = glb([{ name: 'Tower' }, { name: 'Apse', at: [-10, 0, 0], material: 'Lead' }]);
  const walker = glb([{ name: 'Leg', size: 2, material: 'Paint' }]);
  const scene = mergeGlbs(church, walker, { name: 'Placed', translation: [5, 0, 7] });
  const { gltf } = openGlb(scene);
  // The first model is exactly where it was and the second has only moved.
  const first = comparePlacement(church, scene);
  expect(first).toMatchObject({ unmoved: 2, moved: 0, reshaped: 0, gone: 0, added: 1 });
  const second = comparePlacement(walker, scene);
  expect(second).toMatchObject({ unmoved: 0, moved: 1, reshaped: 0, gone: 0, added: 2 });
  expect(second.movedTogether).toEqual({ by: [5, 0, 7], count: 1 });
  expect(gltf.materials.map((material: { name: string }) => material.name)).toEqual(['Stone', 'Lead', 'Paint']);
  const leg = gltf.nodes.find((node: { name: string }) => node.name === 'Leg');
  expect(gltf.materials[gltf.meshes[leg.mesh].primitives[0].material].name).toBe('Paint');
  expect(gltf.scenes[gltf.scene].nodes.map((index: number) => gltf.nodes[index].name)).toEqual(['Tower', 'Apse', 'Placed']);
});

test('merging keeps the second model\'s textures on its own materials and drops its animation', () => {
  const textured = (image: string) => {
    const bytes = glb([{ name: image }]);
    const length = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
    gltf.images = [{ name: image, bufferView: 0, mimeType: 'image/png' }];
    gltf.textures = [{ source: 0, sampler: 0 }];
    gltf.samplers = [{ magFilter: 9729 }];
    gltf.materials[0].pbrMetallicRoughness = { baseColorTexture: { index: 0 } };
    gltf.materials[0].normalTexture = { index: 0 };
    gltf.animations = [{ name: 'Walk', channels: [], samplers: [] }];
    gltf.extensionsUsed = [`EXT_${image}`];
    const text = JSON.stringify(gltf);
    const padded = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
    const head = Buffer.alloc(8);
    head.writeUInt32LE(padded.length, 0);
    head.write('JSON', 4);
    return Buffer.concat([bytes.subarray(0, 12), head, padded, bytes.subarray(20 + length)]);
  };
  const { gltf } = openGlb(mergeGlbs(textured('a'), textured('b'), { name: 'Placed' }));
  expect(gltf.images.map((image: { name: string }) => image.name)).toEqual(['a', 'b']);
  expect(gltf.images[1].bufferView).toBe(gltf.bufferViews.length - 1);
  expect(gltf.textures[1]).toEqual({ source: 1, sampler: 1 });
  expect(gltf.materials[1].pbrMetallicRoughness.baseColorTexture.index).toBe(1);
  expect(gltf.materials[1].normalTexture.index).toBe(1);
  expect(gltf.extensionsUsed).toEqual(['EXT_a', 'EXT_b']);
  expect(gltf.animations).toHaveLength(1);
  expect(gltf.animations[0].name).toBe('Walk');
});

test('comparing two saved GLBs separates what stayed, what moved and what changed shape', () => {
  const before = glb([{ name: 'Tower' }, { name: 'Apse', at: [-10, 0, 0] }, { name: 'Choir', at: [-20, 0, 0] }, { name: 'Roof', size: 2 }, { name: 'Old' }]);
  const after = glb([{ name: 'Tower', colour: 1 }, { name: 'Apse', at: [-23.2, 0, 0] }, { name: 'Choir', at: [-33.2, 0, 0] }, { name: 'Roof', size: 3 }, { name: 'New' }]);
  const placement = comparePlacement(before, after);
  expect(placement.unmoved).toBe(1);
  expect(placement.moved).toBe(2);
  expect(placement.movedTogether).toEqual({ by: [-13.2, 0, 0], count: 2 });
  expect(placement.reshaped).toBe(1);
  expect(placement.gone).toBe(1);
  expect(placement.added).toBe(1);
  expect(placement.materialsSame).toBe(true);
});

test('matching by geometry and place sees through a part that was only renamed', () => {
  const before = glb([{ name: 'Tower' }, { name: 'Statue_3', at: [5, 0, 0], size: 2 }, { name: 'Choir', at: [-10, 0, 0], size: 3 }, { name: 'Apse', at: [-20, 0, 0], size: 4 }, { name: 'Roof', size: 5 }, { name: 'Fleche', at: [-5, 0, 0], size: 6 }]);
  const after = glb([{ name: 'Tower' }, { name: 'Statue_4', at: [5, 0, 0], size: 2 }, { name: 'Choir', at: [-23.2, 0, 0], size: 3 }, { name: 'Apse', at: [-33.2, 0, 0], size: 4 }, { name: 'Roof', size: 7 }, { name: 'Spire', size: 8 }]);
  const { geometry } = comparePlacement(before, after);
  expect(geometry).toEqual({ parent: 6, inPlace: 2, moved: 2, other: ['Roof', 'Fleche'] });
});

test('a program\'s line count is what wc -l says, whether or not the file ends in a newline', () => {
  expect(lineCount('a\nb\n')).toBe(2);
  expect(lineCount('a\nb')).toBe(2);
  expect(lineCount('')).toBe(0);
});

test('the ground is left out of a building\'s extent', () => {
  const placement = comparePlacement(glb([{ name: 'Tower', at: [5, 0, 0] }, { name: 'Mesh_Ground_Earth', at: [90, 0, 0], size: 9 }]), glb([{ name: 'Tower', at: [5, 0, 0] }, { name: 'Mesh_Ground_Earth', at: [90, 0, 0], size: 9 }]));
  expect(placement.extent.before).toEqual({ min: [5, 0, 0], max: [6, 1, 0] });
});
