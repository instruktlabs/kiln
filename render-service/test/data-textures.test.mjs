import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { DATA_TEXTURE_SLOTS, toDataTextures } from '../src/data-textures.mjs';

// The renderer's decode path, so GLTFLoader yields the same `{ width, height, data }` bitmaps
// it does in the service (renderer.mjs installs the same two globals).
globalThis.self ??= globalThis;
globalThis.createImageBitmap = async (blob) => {
  const png = PNG.sync.read(Buffer.from(await blob.arrayBuffer()));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data), close() {} };
};

function pngBytes() {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(200);
  return PNG.sync.write(png);
}

function pad4(bytes, fill = 0) {
  const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
  out.set(bytes);
  return out;
}

/**
 * One triangle with TEXCOORD_0..3. The base colour samples TEXCOORD_2 through `texCoord`; the
 * normal map samples TEXCOORD_1 through KHR_texture_transform, with offset, rotation and scale.
 */
function glb() {
  const floats = [
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 1],
    [0.1, 0.1, 0.9, 0.1, 0.1, 0.9],
    [0.2, 0.2, 0.8, 0.2, 0.2, 0.8],
    [0.3, 0.3, 0.7, 0.3, 0.3, 0.7],
  ].map((a) => new Uint8Array(new Float32Array(a).buffer));
  const image = pad4(pngBytes());
  const chunks = [...floats, image];
  const bin = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  const bufferViews = [];
  let offset = 0;
  for (const chunk of chunks) {
    bin.set(chunk, offset);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: chunk.length });
    offset += chunk.length;
  }
  bufferViews[5].byteLength = pngBytes().length;
  const json = {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_texture_transform'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2, TEXCOORD_2: 3, TEXCOORD_3: 4 },
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: { baseColorTexture: { index: 0, texCoord: 2 } },
        normalTexture: {
          index: 0,
          extensions: {
            KHR_texture_transform: {
              offset: [0.25, 0.5],
              rotation: 0.75,
              scale: [2, 3],
              texCoord: 1,
            },
          },
        },
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ wrapS: 33071, wrapT: 33648 }],
    images: [{ bufferView: 5, mimeType: 'image/png' }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      ...[1, 2, 3, 4].map((bufferView) => ({
        bufferView,
        componentType: 5126,
        count: 3,
        type: 'VEC2',
      })),
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const out = new Uint8Array(12 + 8 + jsonBytes.length + 8 + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  view.setUint32(20 + jsonBytes.length, bin.length, true);
  view.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  out.set(bin, 28 + jsonBytes.length);
  return out.buffer;
}

async function loadMaterial() {
  const gltf = await new GLTFLoader().parseAsync(glb(), '');
  let material = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh) material = o.material;
  });
  return { scene: gltf.scene, material };
}

/** Everything that decides where a texel is sampled from. */
function sampling(texture) {
  texture.updateMatrix();
  return {
    channel: texture.channel,
    offset: texture.offset.toArray(),
    repeat: texture.repeat.toArray(),
    rotation: texture.rotation,
    center: texture.center.toArray(),
    matrixAutoUpdate: texture.matrixAutoUpdate,
    matrix: texture.matrix.toArray(),
    flipY: texture.flipY,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    colorSpace: texture.colorSpace,
  };
}

describe('toDataTextures', () => {
  it('keeps the UV set and KHR_texture_transform GLTFLoader gave each map', async () => {
    const { scene, material } = await loadMaterial();
    const before = { map: sampling(material.map), normalMap: sampling(material.normalMap) };
    // The fixture really exercises both: a non-zero UV set and a non-identity transform.
    assert.equal(before.map.channel, 2);
    assert.equal(before.normalMap.channel, 1);
    assert.deepEqual(before.normalMap.repeat, [2, 3]);

    toDataTextures(scene, THREE);

    assert.ok(material.map.isDataTexture);
    assert.ok(material.normalMap.isDataTexture);
    assert.deepEqual(sampling(material.map), before.map);
    assert.deepEqual(sampling(material.normalMap), before.normalMap);
  });

  it('keeps a hand-set centre and a manual matrix in every converted slot', () => {
    const material = new THREE.MeshStandardMaterial();
    const expected = {};
    DATA_TEXTURE_SLOTS.forEach((slot, i) => {
      const texture = new THREE.Texture({ data: new Uint8Array(4), width: 1, height: 1 });
      texture.channel = i % 4;
      texture.center.set(0.5, 0.25);
      texture.rotation = 0.1 * (i + 1);
      texture.offset.set(0.1, 0.2);
      texture.repeat.set(1.5, 0.5);
      if (i === 0) {
        texture.matrixAutoUpdate = false;
        texture.matrix.set(1, 0, 0.3, 0, 1, 0.4, 0, 0, 1);
      }
      material[slot] = texture;
      expected[slot] = sampling(texture);
    });
    const root = new THREE.Mesh(new THREE.BufferGeometry(), material);

    toDataTextures(root, THREE);

    for (const slot of DATA_TEXTURE_SLOTS) {
      assert.ok(material[slot].isDataTexture, slot);
      assert.deepEqual(sampling(material[slot]), expected[slot], slot);
    }
  });
});
