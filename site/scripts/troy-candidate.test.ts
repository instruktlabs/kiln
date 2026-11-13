import { expect, test } from 'bun:test';
import { hashBytes } from './mirror-core.mjs';
import { overlayTroyWeb, replaceTroySceneModels, troySceneBounds, updateTroyCatalog } from './troy-candidate.mjs';

/** One triangle under a node turned 45 degrees about Y: its vertices reach x = 0.7071, its accessor box corners 1.4142. */
function glb(points: number[], rotation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]) {
  const bin = Buffer.from(new Float32Array(points).buffer);
  const min = [0, 1, 2].map(a => Math.min(...points.filter((_, i) => i % 3 === a))), max = [0, 1, 2].map(a => Math.max(...points.filter((_, i) => i % 3 === a)));
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, rotation }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: points.length / 3, type: 'VEC3', min, max }], bufferViews: [{ buffer: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
  let text = Buffer.from(JSON.stringify(json)); text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  jsonHeader.writeUInt32LE(text.length); jsonHeader.write('JSON', 4); binHeader.writeUInt32LE(bin.length); binHeader.write('BIN\0', 4);
  return Buffer.concat([header, jsonHeader, text, binHeader, bin]);
}
const OLD = glb([1, 0, 0, 0, 1, 0, 0, 0, 1]), NEW = glb([1, 0, 0, 0, 2, 0, 0, 0, 1]);
const sha = (bytes: Buffer) => `sha256:${hashBytes(bytes)}`;
const hero = (revisionId: string, source: string, glbSha: string) => ({ id: 'hector', revisionId, programRef: `p_${source.slice(0, 12)}`, sourceSha256: `sha256:${source}`, artifactGlbSha256: glbSha });
function sceneSeed() {
  const inputs = { schema: 'troy.blockout-inputs/1', assets: [
    { slug: 'hector', assetId: 'hector', revisionId: 'r_old', sha256: sha(OLD), bytes: OLD.length, url: 'assets/hector.glb', bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1], center: [.5, .5, .5] }, sourceFile: '../sources/assets/hector/r_old/asset.glb' },
    { slug: 'olive', assetId: 'a_olive', revisionId: 'r_olive', sha256: 'sha256:' + 'e'.repeat(64), bytes: 3, url: 'assets/olive.glb', bounds: {}, sourceFile: '../sources/assets/a_olive/r_olive/asset.glb' },
  ], heroEquipment: { ownerAccepted: false, assets: [hero('r_old', 'a'.repeat(64), sha(OLD)), { ...hero('r_other', 'c'.repeat(64), 'sha256:' + 'f'.repeat(64)), id: 'achilles' }] },
  shieldSupport: { ownerAccepted: false, assets: [{ ...hero('r_old', 'a'.repeat(64), sha(OLD)), parentRevision: 'r_grand', ownerAccepted: false }] } };
  // Archive members arrive as Uint8Array (fflate), not Buffer.
  return { 'web/inputs.json': new Uint8Array(Buffer.from(JSON.stringify(inputs, null, 2) + '\n')), 'web/assets/hector.glb': OLD, 'web/assets/olive.glb': Buffer.from('olv'), 'web/transport.json': Buffer.from(JSON.stringify({ files: { 'assets/hector.glb': { sha256: sha(OLD) } } })) };
}
const replacement = { slug: 'hector', assetId: 'hector', revisionId: 'r_new', bytes: NEW, sourceSha256: 'sha256:' + 'b'.repeat(64) };

test('scene bounds are three.js precise object bounds: transformed vertices, not transformed accessor corners', async () => {
  const bounds = await troySceneBounds(OLD);
  expect(bounds.max[0]).toBeCloseTo(Math.SQRT1_2, 6);
  expect(bounds.min[2]).toBeCloseTo(-Math.SQRT1_2, 6);
  expect(bounds.max[1]).toBeCloseTo(1, 6);
  expect(bounds.size).toEqual(bounds.max.map((v: number, i: number) => v - bounds.min[i]));
  expect(bounds.center).toEqual(bounds.max.map((v: number, i: number) => (v + bounds.min[i]) / 2));
});

test('a replacement scene model swaps its runtime bytes and rewrites its scene input from the new bytes', async () => {
  const seed = sceneSeed();
  const { files, replaced } = await replaceTroySceneModels(seed, [replacement]);
  expect(files['web/assets/hector.glb'].equals(NEW)).toBe(true);
  expect(files['web/assets/olive.glb'].equals(seed['web/assets/olive.glb'])).toBe(true);
  const inputs = JSON.parse(files['web/inputs.json'].toString());
  const before = JSON.parse(Buffer.from(seed['web/inputs.json']).toString());
  expect(inputs.assets[0]).toEqual({ ...before.assets[0], revisionId: 'r_new', sha256: sha(NEW), bytes: NEW.length, bounds: await troySceneBounds(NEW), sourceFile: '../sources/assets/hector/r_new/asset.glb' });
  expect(inputs.assets[1]).toEqual(before.assets[1]);
  // Equipment records that name the replaced GLB move with it; descriptive fields and review states stay.
  expect(inputs.heroEquipment.assets[0]).toEqual({ ...before.heroEquipment.assets[0], revisionId: 'r_new', programRef: 'p_' + 'b'.repeat(12), sourceSha256: replacement.sourceSha256, artifactGlbSha256: sha(NEW) });
  expect(inputs.heroEquipment.assets[1]).toEqual(before.heroEquipment.assets[1]);
  expect(inputs.shieldSupport.assets[0]).toEqual({ ...before.shieldSupport.assets[0], revisionId: 'r_new', programRef: 'p_' + 'b'.repeat(12), sourceSha256: replacement.sourceSha256, artifactGlbSha256: sha(NEW) });
  expect(inputs.heroEquipment.ownerAccepted).toBe(false);
  expect(files['web/inputs.json'].toString()).toBe(JSON.stringify(inputs, null, 2) + '\n');
  expect(replaced).toEqual([{ slug: 'hector', from: { revisionId: 'r_old', sha256: sha(OLD), bytes: OLD.length }, to: { revisionId: 'r_new', sha256: sha(NEW), bytes: NEW.length } }]);
  expect(seed['web/assets/hector.glb'].equals(OLD)).toBe(true);
});

test('a scene model replacement refuses unknown, mismatched and unchanged models', async () => {
  await expect(replaceTroySceneModels(sceneSeed(), [{ ...replacement, slug: 'missing' }])).rejects.toThrow(/not a Troy scene input/);
  await expect(replaceTroySceneModels(sceneSeed(), [{ ...replacement, assetId: 'other' }])).rejects.toThrow(/asset/);
  await expect(replaceTroySceneModels(sceneSeed(), [{ ...replacement, bytes: OLD }])).rejects.toThrow(/changes nothing/);
});

test('maintained source overlays runtime data while retaining the site lifecycle hook', () => {
  const old = { 'web/main.mjs': Buffer.from('old'), 'web/banks/pose.bin': Buffer.from([1,2]), 'web/site-frame.mjs': Buffer.from('hook') };
  const sources = { 'main.mjs': Buffer.from('new'), 'index.html': Buffer.from('<html><head><script type="importmap">{"imports":{"three":"/vendor/three/build/three.webgpu.js"}}</script></head><body><script type="module" src="./main.mjs"></script></body></html>') };
  const files = overlayTroyWeb(old, sources);
  expect(files['web/main.mjs'].toString()).toBe('new');
  expect(files['web/banks/pose.bin']).toEqual(Buffer.from([1,2]));
  expect(files['web/site-frame.mjs'].toString()).toBe('hook');
  expect(files['web/index.html'].toString()).toContain('src="./site-frame.mjs"');
  expect(files['web/index.html'].toString()).toContain('./vendor/three/build/three.webgpu.js');
  expect(old['web/main.mjs'].toString()).toBe('old');
  expect(() => overlayTroyWeb(old, { '../escape.mjs': Buffer.from('x') })).toThrow('Unsafe');
});

test('catalog adopts every verified selected revision and retains accepted scene framing', () => {
  const old = {base:'/scene-packs/troy/old/',release:'old',assets:[{slug:'wooden-horse',revisionId:'parent',runtimeDownload:{url:'/scene-packs/troy/old/models/wooden-horse.glb'},poster:{src:'/scene-packs/troy/old/media/wooden-horse.webp'}}],posters:[{src:'/scene-packs/troy/old/media/scene-coast.webp',alt:'coast',width:1440,height:900}]};
  const group = {assets:[{slug:'wooden-horse',revisionId:'child',assetId:'horse',runtimeDownload:{bytes:3,sha256:'a'.repeat(64)}}]};
  const catalog = updateTroyCatalog(old, group, 'troy-20261005-05');
  expect(catalog.assets[0].revisionId).toBe('child');
  expect(catalog.assets[0].runtimeDownload.url).toBe('/scene-packs/troy/troy-20261005-05/models/wooden-horse.glb');
  expect(catalog.assets[0].poster.src).toBe('/scene-packs/troy/troy-20261005-05/media/wooden-horse.webp');
  expect(catalog.posters[0]).toEqual({...old.posters[0],src:'/scene-packs/troy/troy-20261005-05/media/scene-coast.webp'});
  expect(old.assets[0].revisionId).toBe('parent');
  expect(() => updateTroyCatalog(old,{assets:[]},'new')).toThrow('Missing selected');
});

test('the new public candidate omits historical browser qualification fixtures without changing its seed', () => {
  const seed = {'web/qualification/startup-cleanup.html':Buffer.from('historical fixture'),'web/banks/pose.bin':Buffer.from([1]),'web/site-frame.mjs':Buffer.from('hook')};
  const files=overlayTroyWeb(seed,{'main.mjs':Buffer.from('scene'),'index.html':Buffer.from('<html><body></body></html>')});
  expect(files['web/qualification/startup-cleanup.html']).toBeUndefined();
  expect(files['web/banks/pose.bin']).toEqual(seed['web/banks/pose.bin']);
  expect(seed['web/qualification/startup-cleanup.html'].toString()).toBe('historical fixture');
});

test('a new bundle starts without the previous release compiled chunks', () => {
  const seed={'web/bundle/old.js':Buffer.from('old chunk'),'web/site-frame.mjs':Buffer.from('hook')};
  const files=overlayTroyWeb(seed,{'main.mjs':Buffer.from('scene'),'index.html':Buffer.from('<html><body></body></html>')});
  expect(files['web/bundle/old.js']).toBeUndefined();
  expect(seed['web/bundle/old.js'].toString()).toBe('old chunk');
});
