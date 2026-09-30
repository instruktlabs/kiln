import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { applyNodeVisibility, expandByDrawnObject } from '../src/node-visibility.mjs';

/**
 * A GLB with one triangle per node: Low (y 0..1) and High (y 5..6) at the scene root, and Tip
 * (y 5..9) under High. `hide` flags High with KHR_node_visibility.
 */
function glb(hide) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  const mesh = { primitives: [{ attributes: { POSITION: 0 } }] };
  const json = {
    asset: { version: '2.0' },
    ...(hide ? { extensionsUsed: ['KHR_node_visibility'] } : {}),
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'Low', mesh: 0 },
      {
        name: 'High',
        mesh: 0,
        translation: [0, 5, 0],
        children: [2],
        ...(hide ? { extensions: { KHR_node_visibility: { visible: false } } } : {}),
      },
      { name: 'Tip', mesh: 0, translation: [0, 3, 0] },
    ],
    meshes: [mesh],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: bin.byteLength }],
    buffers: [{ byteLength: bin.byteLength }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binAt = 20 + jsonBytes.length;
  view.setUint32(binAt, bin.byteLength, true);
  view.setUint32(binAt + 4, 0x004e4942, true);
  out.set(bin, binAt + 8);
  return out.buffer;
}

const parse = (bytes) => new GLTFLoader().parseAsync(bytes, '');
const drawn = (scene) => expandByDrawnObject(new Box3(), new Box3(), scene);

describe('KHR_node_visibility in the service', () => {
  it('hides a flagged node with its subtree and frames what draws', async () => {
    const gltf = await parse(glb(true));
    assert.equal(applyNodeVisibility(gltf), 1);
    assert.equal(gltf.scene.getObjectByName('High').visible, false);
    assert.equal(gltf.scene.getObjectByName('Tip').visible, true);
    assert.equal(gltf.scene.getObjectByName('Low').visible, true);
    const box = drawn(gltf.scene);
    assert.deepEqual(box.min.toArray(), [0, 0, 0]);
    assert.deepEqual(box.max.toArray(), [1, 1, 0]);
  });

  it('leaves an unflagged model alone and frames it as setFromObject does', async () => {
    const gltf = await parse(glb(false));
    assert.equal(applyNodeVisibility(gltf), 0);
    const box = drawn(gltf.scene);
    assert.deepEqual(box.max.toArray(), [1, 9, 0]);
    assert.deepEqual(box, new Box3().setFromObject(gltf.scene));
  });
});
