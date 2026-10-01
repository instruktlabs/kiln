import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry } from 'three/webgpu';
import { stageFiles, verifyStaged } from '../src/staging';
import { sha256Pure } from '../src/assets/hash';

/** Generated, self-contained GLB with one indexed cube; no network or external assets. */
function cubeGlb(color: [number, number, number]): Uint8Array {
  const geometry = new BoxGeometry(1, 1, 1);
  const positions = geometry.getAttribute('position').array as Float32Array;
  const normals = geometry.getAttribute('normal').array as Float32Array;
  const indices = geometry.index!.array as Uint16Array;
  const normalOffset = positions.byteLength, indexOffset = normalOffset + normals.byteLength;
  const byteLength = indexOffset + indices.byteLength;
  const bin = new Uint8Array(Math.ceil(byteLength / 4) * 4);
  bin.set(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength));
  bin.set(new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength), normalOffset);
  bin.set(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength), indexOffset);
  const json = {
    asset: { version: '2.0', generator: 'scene-kit deterministic synthetic fixture' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Synthetic cube', mesh: 0 }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: normalOffset, byteLength: normals.byteLength }, { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-.5, -.5, -.5], max: [.5, .5, .5] }, { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' }],
    materials: [{ name: 'Synthetic authored colour', pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: .65 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json)), jsonLength = Math.ceil(encoded.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + bin.length), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true); out.fill(32, 20, 20 + jsonLength); out.set(encoded, 20);
  view.setUint32(20 + jsonLength, bin.length, true); view.setUint32(24 + jsonLength, 0x004e4942, true); out.set(bin, 28 + jsonLength);
  geometry.dispose(); return out;
}
const demo = fileURLToPath(new URL('.', import.meta.url)), input = resolve(demo, '.tmp/generated');
mkdirSync(input, { recursive: true });
const authored = new Map<string, Uint8Array>([
  ['amber.glb', cubeGlb([1, .45, .08])], ['blue.glb', cubeGlb([.08, .35, 1])],
  ['cell.glb', cubeGlb([.25, .8, .35])],
  ['layout.json', new TextEncoder().encode(JSON.stringify({ description: 'Two eager cubes, one lazy verified cell.', count: 10000 }) + '\n')],
  ['LICENSE.txt', new TextEncoder().encode('Synthetic demonstration assets: CC0-1.0. Generated for scene-kit.\n')],
]);
for (const [name, bytes] of authored) writeFileSync(resolve(input, name), bytes);
const destinations: Record<string, string> = { 'amber.glb': 'models/amber.glb', 'blue.glb': 'models/blue.glb', 'cell.glb': 'cells/0-0-0.glb', 'layout.json': 'data/layout.json', 'LICENSE.txt': 'licenses/ASSET-LICENSE.txt' };
const out = resolve(demo, 'staged/assets');
const result = stageFiles({
  id: 'scene-kit-demo', release: 'synthetic-1', three: '0.186.0', out,
  models: [{ id: 'amber', to: 'models/amber.glb' }, { id: 'blue', to: 'models/blue.glb' }], data: { layout: 'data/layout.json' },
  files: [...authored].map(([name, bytes]) => ({ from: resolve(input, name), to: destinations[name]!, sha256: sha256Pure(bytes) })),
  cells: [{ id: '0,0,0', center: [0, 0, 0], radius: 16, files: ['cells/0-0-0.glb'] }],
  credits: [{ name: 'scene-kit synthetic demonstration assets', licence: 'CC0-1.0', note: 'Generated locally; no downloaded content.' }],
});
if (!verifyStaged(out).ok) throw new Error('Synthetic pack verification failed');
console.log(JSON.stringify({ staged: out, ...result }));
