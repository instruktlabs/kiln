import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { checkDelivery } from './stage-text-to-3d.mjs';

/** A GLB from a glTF record and its one binary chunk. */
function glb(gltf: object, bin: Buffer): Buffer {
  const pad = (bytes: Buffer, fill: number) => Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, fill)]);
  const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
  const body = pad(bin, 0);
  const chunk = (bytes: Buffer, type: number) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(bytes.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, bytes]);
  };
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(body, 0x004e4942)]);
}

/** One triangle under a joint that a clip turns: as saved, with a mesh node per part, or delivered skinned. */
function model({ skinned = false, joint = 'Joint_Knee', turn = 0.5, triangles = 1, aimAt = 'Joint_Hip' } = {}) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array(Array.from({ length: triangles * 3 }, (_, i) => i % 3));
  const times = new Float32Array([0, 1]);
  const turns = new Float32Array([0, 0, 0, 1, 0, Math.sin(turn / 2), 0, Math.cos(turn / 2)]);
  const parts = [positions, indices, times, turns].map((array) => Buffer.from(array.buffer));
  const views = [];
  let offset = 0;
  for (const part of parts) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: part.length });
    offset += part.length + ((4 - (part.length % 4)) % 4);
  }
  const bin = Buffer.concat(parts.map((part) => Buffer.concat([part, Buffer.alloc((4 - (part.length % 4)) % 4)])));
  const nodes = skinned
    ? [
        { name: 'Walker', children: [1, 2, 3], extras: { rig: { clip: 'Walk' } } },
        { name: 'Joint_Hip' },
        { name: joint, extras: { aimAt } },
        { name: 'Walker_Body', mesh: 0 },
      ]
    : [
        { name: 'Walker', children: [1, 2], extras: { rig: { clip: 'Walk' } } },
        { name: 'Joint_Hip' },
        { name: joint, extras: { aimAt }, children: [3] },
        { name: 'Mesh_Shin_steel', mesh: 0 },
      ];
  return glb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ name: 'Gunmetal' }],
      buffers: [{ byteLength: bin.length }],
      bufferViews: views,
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5123, count: triangles * 3, type: 'SCALAR' },
        { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
        { bufferView: 3, componentType: 5126, count: 2, type: 'VEC4' },
      ],
      animations: [{ name: 'Walk', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }] }],
    },
    bin,
  );
}

const saved = model();
const madeFrom = `sha256:${createHash('sha256').update(saved).digest('hex')}`;

test('a delivery file made from the final revision, with its joints, notes, clips, materials and triangles, is served', () => {
  const delivered = model({ skinned: true });
  expect(checkDelivery(saved, delivered, madeFrom)).toBe(delivered);
});

test('a delivery file made from another revision is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true }), 'sha256:0000')).toThrow(/made from/);
});

test('a delivery file that loses or renames a named node is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, joint: 'Joint_Shin' }), madeFrom)).toThrow(/Joint_Knee/);
});

test('a delivery file whose node notes differ is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, aimAt: 'Joint_Toe' }), madeFrom)).toThrow(/notes/);
});

test('a delivery file whose clip moves differently is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, turn: 0.6 }), madeFrom)).toThrow(/Walk/);
});

test('a delivery file with other triangles is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, triangles: 2 }), madeFrom)).toThrow(/triangles/);
});
