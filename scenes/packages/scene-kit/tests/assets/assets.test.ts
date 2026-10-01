import { describe, expect, test } from 'bun:test';
import { sha256Hex, sha256Pure, resolveAssetUrl, validateManifest, embeddedImageHashes, poolTextures, fetchVerified, loadPack, createPackReader, disposeLoadedModels } from '../../src/assets/index';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture, RepeatWrapping } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const bytes = (s: string) => new TextEncoder().encode(s);
describe('U-01 SHA256', () => {
 test('known vectors and deterministic buffer comparison', async () => {
  for (const [s, hash] of [['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'], ['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'], ['a'.repeat(1_000_000),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0']]) expect(sha256Pure(bytes(s!))).toBe(hash!);
  let seed=186;
  for(let n=0;n<100;n++) { const b=new Uint8Array(n*31); for(let i=0;i<b.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;b[i]=seed>>>24;} const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)), x=>x.toString(16).padStart(2,'0')).join(''); expect(sha256Pure(b)).toBe(h);expect(await sha256Hex(b)).toBe(h); }
 });
});
test('U-02 contained URL resolution', () => {
 const page='https://example.test/app/index.html';
 expect(resolveAssetUrl('https://assets.test/pack','models/a.glb',page).href).toBe('https://assets.test/pack/models/a.glb');
 expect(resolveAssetUrl('/pack/','data/a.bin',page).href).toBe('https://example.test/pack/data/a.bin');
 expect(resolveAssetUrl('./pack','data/a.bin',page).href).toBe('https://example.test/app/pack/data/a.bin');
 for(const p of ['../x','%2e%2e/x','/outside','https://evil.test/x','a\\..\\x','a/%252e%252e/x']) expect(()=>resolveAssetUrl('/pack',p,page)).toThrow();
});
test('U-01b sampler-aware pooling disposes only unreferenced duplicates', () => {
 const make=(repeat=false)=>{const t=new Texture(); if(repeat)t.wrapS=RepeatWrapping;const material=new MeshStandardMaterial({map:t});const scene=new Group();scene.add(new Mesh(new BoxGeometry(),material));return {scene,parser:{json:{textures:[{source:0}]},associations:new Map([[t,{textures:0}]])},t,material} as any;};
 const a=make(), b=make(), c=make(true);let disposed=0;b.t.addEventListener('dispose',()=>disposed++);
 const hashes=new Map([[a.scene.uuid,new Map([[0,'same']])],[b.scene.uuid,new Map([[0,'same']])],[c.scene.uuid,new Map([[0,'same']])]]);
 expect(poolTextures([a,b,c],hashes)).toEqual({uniqueBefore:3,uniqueAfter:2,sharedAssignments:1});expect(b.material.map).toBe(a.t);expect(c.material.map).toBe(c.t);expect(disposed).toBe(1);
});
test('U-01b discarded image bitmaps close only when no retained texture uses them',()=>{
 const make=(image:object)=>{const t=new Texture(image);const material=new MeshStandardMaterial({map:t}),scene=new Group();scene.add(new Mesh(new BoxGeometry(),material));return{scene,parser:{json:{textures:[{source:0}]},associations:new Map([[t,{textures:0}]])},t,material}as any;};let closed=0;const a=make({close(){}}),b=make({close(){closed++;}}),c=make(a.t.image);const hashes=new Map([a,b,c].map(m=>[m.scene.uuid,new Map([[0,'same']])]));poolTextures([a,b,c],hashes);expect(closed).toBe(1);expect(b.material.map).toBe(a.t);expect(c.material.map).toBe(a.t);
});
test('manifest rejects missing references and invalid paths',()=>{
 const m={schema:'kiln.scene-pack/1',id:'demo',release:'r1',three:'0.186.0',models:[],data:{},files:[]};expect(validateManifest(m)).toEqual(m);
 expect(()=>validateManifest({...m,data:{missing:'nope.bin'}})).toThrow();expect(()=>validateManifest({...m,files:[{path:'../x',bytes:0,sha256:'0'.repeat(64)}]})).toThrow();
});
test('embedded image hashes use GLB binary bytes',async()=>{
 const json={images:[{bufferView:0}],bufferViews:[{buffer:0,byteOffset:0,byteLength:3}]};const j=bytes(JSON.stringify(json));const jl=Math.ceil(j.length/4)*4;const glb=new ArrayBuffer(20+jl+8+4);const view=new DataView(glb);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,glb.byteLength,true);view.setUint32(12,jl,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(glb,20,jl).fill(32);new Uint8Array(glb,20,j.length).set(j);view.setUint32(20+jl,4,true);view.setUint32(24+jl,0x004e4942,true);new Uint8Array(glb,28+jl,3).set(bytes('abc'));
 expect((await embeddedImageHashes(glb)).get(0)).toBe(sha256Pure(bytes('abc')));
});
test('verified fetch hash mismatch is asset-hash',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(bytes('bad'));
 try{await expect(fetchVerified(new URL('https://example.test/a'),{path:'a',bytes:3,sha256:'0'.repeat(64)},new AbortController().signal)).rejects.toMatchObject({code:'asset-hash'});}finally{globalThis.fetch=original;}
});
test('loader fetches only eager files and reader verifies lazy cell files',async()=>{
 const j=bytes(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}]})),length=Math.ceil(j.length/4)*4,glb=new Uint8Array(20+length),v=new DataView(glb.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,glb.length,true);v.setUint32(12,length,true);v.setUint32(16,0x4e4f534a,true);glb.fill(32,20);glb.set(j,20);
 const data=bytes('{}'),paths=new Map([['models/a.glb',glb],['models/b.glb',glb],['data/layout.json',data],['cells/later.glb',glb]]),files=[...paths].map(([path,b])=>({path,bytes:b.length,sha256:sha256Pure(b)})),manifest={schema:'kiln.scene-pack/1',id:'demo',release:'r1',three:'0.186.0',models:[{id:'a',path:'models/a.glb'},{id:'b',path:'models/b.glb'}],data:{layout:'data/layout.json'},files,cells:[{id:'later',center:[0,0,0],radius:10,files:['cells/later.glb']}]},fetched:string[]=[],original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{expect(init?.credentials).toBe('omit');expect(init?.mode).toBe('cors');const path=new URL(String(input)).pathname.replace('/pack/','');fetched.push(path);return path==='pack.json'?Response.json(manifest):new Response(paths.get(path));};
 try{const pack=await loadPack('https://example.test/pack',{signal:new AbortController().signal});expect(pack.models.size).toBe(2);expect(pack.data.size).toBe(1);expect(fetched).not.toContain('cells/later.glb');expect(pack.timings.every(x=>x.fetchMs===0&&x.parseMs===0)).toBe(true);const reader=createPackReader('https://example.test/pack',pack.manifest);expect(reader.cell('later')?.files).toEqual(['cells/later.glb']);await reader.loadGlb('cells/later.glb',new AbortController().signal);expect(fetched).toContain('cells/later.glb');await expect(reader.fetchFile('not-listed.bin',new AbortController().signal)).rejects.toMatchObject({code:'pack-invalid'});}finally{globalThis.fetch=original;}
});
test('loader labels malformed embedded image offsets as asset-parse before creating resources',async()=>{
 const j=bytes(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],buffers:[{byteLength:4}],images:[{bufferView:0}],bufferViews:[{buffer:0,byteOffset:100,byteLength:4}]})),length=Math.ceil(j.length/4)*4,glb=new Uint8Array(28+length+4),v=new DataView(glb.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,glb.length,true);v.setUint32(12,length,true);v.setUint32(16,0x4e4f534a,true);glb.fill(32,20,20+length);glb.set(j,20);v.setUint32(20+length,4,true);v.setUint32(24+length,0x004e4942,true);
 const manifest={schema:'kiln.scene-pack/1',id:'demo',release:'r1',three:'0.186.0',models:[{id:'broken',path:'broken.glb'}],data:{},files:[{path:'broken.glb',bytes:glb.length,sha256:sha256Pure(glb)}]},original=globalThis.fetch;globalThis.fetch=async input=>String(input).endsWith('pack.json')?Response.json(manifest):new Response(glb);
 try{await expect(loadPack('https://example.test/pack',{signal:new AbortController().signal})).rejects.toMatchObject({code:'asset-parse'});}finally{globalThis.fetch=original;}
});

test('model disposal attempts every distinct resource before reporting disposal failures',()=>{
 const calls:string[]=[],textureError=new Error('texture callback'),geometryError=new Error('geometry callback'),imageError=new Error('bitmap close');
 const image={close(){calls.push('image');throw imageError;}},texture=new Texture(image),otherTexture=new Texture({close(){calls.push('other image');}});
 const geometry=new BoxGeometry(),material=new MeshStandardMaterial({map:texture,normalMap:otherTexture}),root=new Group();
 texture.addEventListener('dispose',()=>{calls.push('texture');throw textureError;});otherTexture.addEventListener('dispose',()=>calls.push('other texture'));
 geometry.addEventListener('dispose',()=>{calls.push('geometry');throw geometryError;});material.addEventListener('dispose',()=>calls.push('material'));
 const mesh=new Mesh(geometry,material);(mesh as any).skeleton={dispose(){calls.push('skeleton');}};root.add(mesh,new Mesh(geometry,material));
 let failure:unknown;try{disposeLoadedModels([{scene:root,scenes:[root]} as any,{scene:root,scenes:[root]} as any]);}catch(error){failure=error;}
 expect(calls).toEqual(['texture','other texture','geometry','material','skeleton','image','other image']);
 expect(failure).toBeInstanceOf(AggregateError);expect((failure as AggregateError).errors).toEqual([textureError,geometryError,imageError]);
});

test('load failure retains its asset error and releases remaining models when cleanup also throws',async()=>{
 const json=bytes(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}]})),length=Math.ceil(json.length/4)*4,glb=new Uint8Array(20+length),view=new DataView(glb.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,glb.length,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);glb.fill(32,20);glb.set(json,20);
 const manifest={schema:'kiln.scene-pack/1',id:'demo',release:'r1',three:'0.186.0',models:[{id:'a',path:'a.glb'},{id:'b',path:'b.glb'}],data:{},files:['a.glb','b.glb'].map(path=>({path,bytes:glb.length,sha256:sha256Pure(glb)}))};
 const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync,primary=new Error('parse fixture'),cleanup=new Error('dispose fixture'),root=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial();let parsed=0,releasedMaterial=0;
 root.add(new Mesh(geometry,material));geometry.addEventListener('dispose',()=>{throw cleanup;});material.addEventListener('dispose',()=>releasedMaterial++);
 globalThis.fetch=async input=>String(input).endsWith('pack.json')?Response.json(manifest):new Response(glb);
 GLTFLoader.prototype.parseAsync=async()=>{if(parsed++)throw primary;return{scene:root,scenes:[root]}as any;};
 try{let failure:any;try{await loadPack('https://example.test/pack',{signal:new AbortController().signal,concurrency:1});}catch(error){failure=error;}
  expect(failure.code).toBe('asset-parse');expect(failure.message).toContain('b.glb');expect(releasedMaterial).toBe(1);
  expect(failure.cause).toBeInstanceOf(AggregateError);expect(failure.cause.errors[0].cause).toBe(primary);expect(failure.cause.errors[1].errors).toEqual([cleanup]);
 }finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});
