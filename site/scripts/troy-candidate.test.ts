import { expect, test } from 'bun:test';
import { overlayTroyWeb, updateTroyCatalog } from './troy-candidate.mjs';

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
