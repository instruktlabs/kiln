import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadAssetGlb } from '../../src/viewer/glb-loader.ts';

const results = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
  }
}
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 2;
const context = canvas.getContext('2d');
context.fillStyle = '#ff0000';
context.fillRect(0, 0, 1, 2);
context.fillStyle = '#00ff00';
context.fillRect(1, 0, 1, 2);
const map = new THREE.CanvasTexture(canvas);
map.colorSpace = THREE.SRGBColorSpace;
map.magFilter = THREE.NearestFilter;
map.minFilter = THREE.NearestFilter;
map.wrapS = THREE.MirroredRepeatWrapping;
map.offset.set(0.25, 0.5);
map.repeat.set(2, 3);
const model = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map }));
const original = new Uint8Array(await new GLTFExporter().parseAsync(model, { binary: true }));
const originalCopy = original.slice();

function rewrite(bytes, change) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  const bin = bytes.slice(28 + length);
  change(json, bin);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.length / 4) * 4;
  const out = new Uint8Array(28 + padded + bin.length);
  const header = new DataView(out.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, out.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + padded);
  out.set(text, 20);
  header.setUint32(20 + padded, bin.length, true);
  header.setUint32(24 + padded, 0x004e4942, true);
  out.set(bin, 28 + padded);
  return out;
}
function loadedMap(gltf) {
  let texture;
  gltf.scene.traverse((node) => {
    if (node.isMesh) texture = node.material.map;
  });
  assert(texture, 'Embedded base-color texture disappeared');
  return texture;
}
function inspectPixels(texture) {
  const pixels = document.createElement('canvas');
  pixels.width = pixels.height = 2;
  const ctx = pixels.getContext('2d');
  ctx.drawImage(texture.image, 0, 0);
  assert(
    [...ctx.getImageData(0, 0, 2, 1).data].join(',') === '255,0,0,255,0,255,0,255',
    'Texture pixels changed',
  );
}
await check('embedded PNG, sampler, color space and UV transform under strict CSP', async () => {
  const texture = loadedMap(await loadAssetGlb(original));
  inspectPixels(texture);
  assert(
    texture.colorSpace === THREE.SRGBColorSpace && !texture.flipY,
    'glTF color space/orientation changed',
  );
  assert(
    texture.magFilter === THREE.NearestFilter && texture.wrapS === THREE.MirroredRepeatWrapping,
    'Sampler changed',
  );
  assert(
    texture.offset.equals(map.offset) && texture.repeat.equals(map.repeat),
    'UV transform changed',
  );
  assert(
    original.every((v, i) => v === originalCopy[i]),
    'Input GLB was mutated',
  );
});
await check('data-URI PNG uses the same image path', async () => {
  const bytes = rewrite(original, (json, bin) => {
    const image = json.images[0],
      buffer = json.bufferViews[image.bufferView];
    image.uri = `data:image/png;base64,${btoa(String.fromCharCode(...bin.subarray(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)))}`;
    delete image.bufferView;
  });
  inspectPixels(loadedMap(await loadAssetGlb(bytes)));
});
await check('corrupt embedded texture rejects instead of returning white geometry', async () => {
  const bytes = rewrite(original, (json, bin) => {
    const buffer = json.bufferViews[json.images[0].bufferView];
    bin.fill(0, buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
  let rejected = false;
  try {
    await loadAssetGlb(bytes);
  } catch (error) {
    rejected = /texture|image/i.test(String(error));
  }
  assert(rejected, 'Corrupt texture was accepted silently');
});
await check('external image rejects before any request', async () => {
  const bytes = rewrite(original, (json) => {
    json.images[0] = { uri: 'https://example.invalid/forbidden.png' };
  });
  let rejected = false;
  try {
    await loadAssetGlb(bytes);
  } catch (error) {
    rejected = /embed/i.test(String(error));
  }
  assert(rejected, 'External texture was accepted');
});
document.body.textContent = JSON.stringify(results, null, 2);
window.audit = { passed: results.every((row) => row.passed), results };
window.viewerFixture = {
  glb: Array.from(original),
  corrupt: Array.from(
    rewrite(original, (json, bin) => {
      const buffer = json.bufferViews[json.images[0].bufferView];
      bin.fill(0, buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }),
  ),
  preview: canvas.toDataURL('image/png').split(',')[1],
};
