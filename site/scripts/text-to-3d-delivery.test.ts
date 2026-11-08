import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { inspectGlb } from './generate-commons.mjs';
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

/**
 * One triangle under a joint that a clip turns: as saved, with a mesh node per part, or delivered skinned. `skinJoint`
 * is the node the skin binds the triangle to; null leaves the merged mesh unskinned, so nothing carries it.
 */
function model({
  skinned = false,
  joint = 'Joint_Knee',
  turn = 0.5,
  triangles = 1,
  aimAt = 'Joint_Hip',
  skinJoint = 2 as number | null,
  kneeAt = [0, 0.5, 0],
  material = { name: 'Gunmetal' } as Record<string, unknown>,
  socketNote = 'muzzle',
} = {}) {
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
  // Two sockets share a name, as repeated parts do; three's getObjectByName answers with the first.
  const sockets = [
    { name: 'Socket', extras: { role: socketNote } },
    { name: 'Socket', extras: { role: 'exhaust' } },
  ];
  const nodes = skinned
    ? [
        { name: 'Walker', children: [1, 2, 3, 4, 5], extras: { rig: { clip: 'Walk' } } },
        { name: 'Joint_Hip' },
        { name: joint, extras: { aimAt }, translation: kneeAt },
        { name: 'Walker_Body', mesh: 0, ...(skinJoint === null ? {} : { skin: 0 }) },
        ...sockets,
      ]
    : [
        { name: 'Walker', children: [1, 2, 4, 5], extras: { rig: { clip: 'Walk' } } },
        { name: 'Joint_Hip' },
        { name: joint, extras: { aimAt }, translation: kneeAt, children: [3] },
        { name: 'Mesh_Shin_steel', mesh: 0 },
        ...sockets,
      ];
  return glb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes,
      ...(skinned && skinJoint !== null ? { skins: [{ joints: [skinJoint] }] } : {}),
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [material],
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

test('a delivery file whose parts no longer follow a joint the clip moves is refused', () => {
  // Merged but unskinned: the joint keeps its clip and name, and moves nothing.
  expect(() => checkDelivery(saved, model({ skinned: true, skinJoint: null }), madeFrom)).toThrow(/Joint_Knee.*parts/);
  // Skinned to the wrong joint: the knee's parts ride the hip.
  expect(() => checkDelivery(saved, model({ skinned: true, skinJoint: 1 }), madeFrom)).toThrow(/Joint_Knee.*parts/);
});

test('a delivery file that moves or reparents a named node is refused', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, kneeAt: [0, 0.6, 0] }), madeFrom)).toThrow(/Joint_Knee/);
});

test('a delivery file whose materials differ beyond their names is refused', () => {
  const glowing = { name: 'Gunmetal', emissiveFactor: [1, 0.4, 0] };
  expect(() => checkDelivery(model({ material: glowing }), model({ skinned: true }), madeFromOf(model({ material: glowing })))).toThrow(/Gunmetal/);
});

test('a delivery file is compared on every node of a repeated name, in order', () => {
  expect(() => checkDelivery(saved, model({ skinned: true, socketNote: 'exhaust' }), madeFrom)).toThrow(/Socket/);
});

test('a grouping node the record lets the delivery drop may go, and one code can reach for may not', () => {
  // The knee carries notes and the clip moves it, so naming it in drops does not let it go.
  const renamed = model({ skinned: true, joint: 'Joint_Shin' });
  expect(() => checkDelivery(saved, renamed, madeFrom, { drops: ['Joint_Knee'] })).toThrow(/may not drop Joint_Knee/);
  expect(() => checkDelivery(saved, renamed, madeFrom, { drops: ['Joint_Hip'] })).toThrow(/Joint_Knee/);
});

test('a delivery file without a grouping node it names in drops is served', () => {
  const hipless = Buffer.from(model({ skinned: true }));
  const { gltf, bin } = splitGlb(hipless);
  gltf.nodes[1].name = 'Unnamed';
  const withoutHip = glb(gltf, bin);
  const base = Buffer.from(saved);
  expect(checkDelivery(base, withoutHip, madeFrom, { drops: ['Joint_Hip'] })).toBe(withoutHip);
  expect(() => checkDelivery(base, withoutHip, madeFrom)).toThrow(/Joint_Hip/);
});

test('an instanced batch counts a triangle and a place for every copy', () => {
  // One triangle drawn three times by EXT_mesh_gpu_instancing, the copies 10 m apart along x.
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const offsets = Buffer.from(new Float32Array([0, 0, 0, 10, 0, 0, 20, 0, 0]).buffer);
  const batched = glb(
    {
      asset: { version: '2.0' },
      extensionsUsed: ['EXT_mesh_gpu_instancing'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1 } } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: 72 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      ],
    },
    Buffer.concat([positions, offsets]),
  );
  const facts = inspectGlb(batched);
  expect(facts.triangles).toBe(3);
  expect(facts.boundsMax[0]).toBe(21);
});

function splitGlb(bytes: Buffer) {
  const length = bytes.readUInt32LE(12);
  return { gltf: JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')), bin: bytes.subarray(20 + length + 8) };
}

function madeFromOf(bytes: Buffer) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
