import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { stageCabinWoods } from './stage-cabin-woods.mjs';
import { hashBytes, verifyArchive } from './mirror-core.mjs';
import { decodeAssetBundle } from '../../src/assets';
import { exportAssetGlb } from '../../src/asset-export';
import type { AssetRecord } from '../../src/assets';
import { createMaterialLibraryPayload, createMaterialRecordV2 } from '../../src/material-library-node';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true }); });
const aid = 'a_' + 'a'.repeat(32), rid = 'r_' + 'b'.repeat(32), parent = 'r_' + 'c'.repeat(32);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzVkAAAAASUVORK5CYII=', 'base64');
const source = Buffer.from("const meta={name:'Fixture prop'};function build(){return createRoot('Fixture');}");
function triangleGlb(edit?: (document: any) => void) {
  const bin = Buffer.alloc(44); for (const [i,v] of [0,0,0,1,0,0,0,1,0].entries()) bin.writeFloatLE(v,i*4); for (let i=0;i<3;i++) bin.writeUInt16LE(i,36+i*2);
  const document = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Fixture',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}],buffers:[{byteLength:44}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}]};
  edit?.(document);const raw=Buffer.from(JSON.stringify(document));const json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const b=Buffer.alloc(28+json.length+bin.length);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(json.length,12);b.write('JSON',16);json.copy(b,20);b.writeUInt32LE(bin.length,20+json.length);b.write('BIN\0',24+json.length);bin.copy(b,28+json.length);return b;
}
async function fixture({reviewClips=false,reviewOnly=false,emptyAssetExtras=false,exporter=false,separateScene=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'kiln-cabin-stage-'));directories.push(root);const workspace=join(root,'author'),scene=separateScene?join(root,'maintained-scene'):join(workspace,'review'),sourceDir=join(root,'source'),site=join(root,'site'),sourceRoot=join(root,'packs');
  const put=async(path:string,data:Buffer|string)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,data);};
  const saved=join(workspace,'assets/kiln',aid,'revisions',rid);const glb=triangleGlb(d=>{if(reviewClips)d.scenes[0].extras={kilnReviewClipsV1:{version:1,clips:[]},author:'preserved'};if(reviewOnly)d.scenes[0].extras={kilnReviewClipsV1:{version:1,clips:[]}};if(emptyAssetExtras)d.asset.extras={};});const files={'asset.glb':glb,'source.kiln.js':source,'preview.png':png};
  const manifest={version:'kiln.asset.v1',assetId:aid,revisionId:rid,parentRevision:parent,name:'Fixture prop',tags:[],createdAt:'2026-10-12T00:00:00.000Z',editable:true,files:Object.fromEntries(Object.entries(files).map(([key,b])=>[key,{bytes:b.length,sha256:'sha256:'+hashBytes(b)}]))};
  await put(join(saved,'manifest.json'),JSON.stringify(manifest));for(const [key,b]of Object.entries(files))await put(join(saved,key),b);
  let metadata=Buffer.from(JSON.stringify({version:'kiln.runtime-metadata.v1',source:{assetId:aid,revisionId:rid,glbSha256:'sha256:'+hashBytes(glb),sourceSha256:'sha256:'+hashBytes(source)}}));let runtime=triangleGlb(d=>{if(reviewClips)d.scenes[0].extras={author:'preserved'};d.asset.extras={kilnProvenanceV1:{version:'kiln.provenance.v1',profile:'runtime',metadata:{uri:'fixture.kiln-metadata.json',sha256:'sha256:'+hashBytes(metadata)}}};});if(exporter){const exported=await exportAssetGlb({manifest,files} as AssetRecord,{profile:'runtime',metadataFileName:'fixture.kiln-metadata.json'});if(exported.profile!=='runtime')throw Error('Expected runtime fixture');runtime=Buffer.from(exported.glb);metadata=Buffer.from(exported.metadata.bytes);}await put(join(workspace,'delivery/fixture-runtime.glb'),runtime);await put(join(workspace,'delivery/fixture-runtime.kiln-metadata.json'),metadata);
  const selection=join(workspace,'review','production-selection.json');await put(selection,JSON.stringify({schemaVersion:1,assets:{fixture:{name:'Fixture prop',description:'Original test fixture.',collection:'project',assetId:aid,revisionId:rid,sourceFile:'../delivery/fixture-runtime.glb',canonicalFile:`../assets/kiln/${aid}/revisions/${rid}/asset.glb`,canonicalSha256:hashBytes(glb),runtimeSha256:hashBytes(runtime),sourceSha256:hashBytes(source),manifestSha256:hashBytes(Buffer.from(JSON.stringify(manifest)))}},materials:{}}));
  const collection=Buffer.from(JSON.stringify({schemaVersion:1,assets:{fixture:{collection:'project',assetId:aid,revisionId:rid,canonicalSha256:hashBytes(glb),runtimeSha256:hashBytes(runtime),sha256:hashBytes(runtime),bytes:runtime.length,url:'./assets/fixture.glb',metadataURL:'./assets/fixture.kiln-metadata.json',metadataSha256:hashBytes(metadata),metadataBytes:metadata.length}}}));
  const sceneFiles=[['web/game.html','dist-game/game.html',Buffer.from('<!doctype html><title>Cabin in the Woods: PSX Horror</title>')],['web/assets/main.js','dist-game/assets/main.js',Buffer.from('console.log("fixture")')],['web/woodland/assets/fixture.glb','public/woodland/assets/fixture.glb',runtime],['web/woodland/assets/fixture.kiln-metadata.json','public/woodland/assets/fixture.kiln-metadata.json',metadata],['web/woodland/collection.json','public/woodland/collection.json',collection]] as const;
  for(const [,path,b]of sceneFiles)await put(join(scene,path),b);
  await put(join(scene,'stage-manifest.json'),JSON.stringify({schemaVersion:1,selectionSha256:hashBytes(await readFile(selection)),files:sceneFiles.map(([path,relative,b])=>({path,source:relative,bytes:b.length,sha256:hashBytes(b)}))}));
  const sourceFiles=[['game.html','<title>Cabin in the Woods: PSX Horror</title>'],['src/game/main.jsx','export const scene = "fixture";'],['LICENSE','SPDX-License-Identifier: MIT\nFixture software.'],['THIRD-PARTY-NOTICES.txt','Fixture: no third party runtime dependencies.']];
  for(const [path,data]of sourceFiles)await put(join(sourceDir,path),data);
  await put(join(sourceDir,'source-manifest.json'),JSON.stringify({schemaVersion:1,files:sourceFiles.map(([path,data])=>({path,bytes:Buffer.byteLength(data),sha256:hashBytes(Buffer.from(data))}))}));
  await put(join(site,'src/data/cabin-woods-psx-horror.json'),JSON.stringify({id:'cabin-woods-psx-horror',name:'Cabin in the Woods: PSX Horror',base:'/asset-demos/cabin-woods-psx-horror/',available:false,assets:[],posters:[],downloads:[],unknownField:'preserved'}));
  return {workspace,scene,source:sourceDir,selection,site,sourceRoot,release:'review-fixture',expectedAssets:1,saved,put};
}
test('selection paths remain relative to the author selection when scene output is maintained elsewhere',async()=>{
  const f=await fixture({separateScene:true});const staged=await stageCabinWoods(f);expect(staged.assets).toHaveLength(1);expect(staged.assets[0].revisionId).toBe(rid);expect(staged.available).toBe(false);
});
test('explicit public staging exposes the approved selection without changing revision bytes',async()=>{
 const f=await fixture(),preview=await stageCabinWoods(f),published=await stageCabinWoods({...f,publication:'public'});
 expect(published.available).toBe(true);expect(published.status).toBe('Available');
 expect(published.assets[0].review).toEqual({ownerAccepted:true,status:'accepted'});
 expect(published.assets[0].canonicalDownload.sha256).toBe(preview.assets[0].canonicalDownload.sha256);
 const target=join(f.site,'public');
 for(const profile of ['scene','editable']){const download=published.downloads.find((d:{profile:string})=>d.profile===profile),archive=verifyArchive(await readFile(join(target,download.url)));expect(Buffer.from(archive.files['README.txt']).toString()).not.toMatch(/owner approval|approval pending|owner release approval/i);}
 await expect(stageCabinWoods({...f,publication:'typo'})).rejects.toThrow('publication');
});
test('selected-only full Kiln bundles retain all exact editing files and parent identity, deterministic archives',async()=>{
  const f=await fixture();const staged=await stageCabinWoods(f);expect(staged.assets).toHaveLength(1);const asset=staged.assets[0];
  const target=join(f.site,'public');const editable=await readFile(join(target,asset.editableDownload.url));const decoded=decodeAssetBundle(editable);expect(decoded[0].manifest.parentRevision).toBe(parent);expect(Buffer.from(decoded[0].files['source.kiln.js']).equals(source)).toBe(true);expect(Buffer.from(decoded[0].files['preview.png']).equals(png)).toBe(true);expect(decoded[0].files['asset.glb']).toBeDefined();
  const first=await readFile(join(target,staged.downloads.find((d:{profile:string})=>d.profile==='editable').url));await stageCabinWoods(f);expect((await readFile(join(target,staged.downloads.find((d:{profile:string})=>d.profile==='editable').url))).equals(first)).toBe(true);
  const envelope=verifyArchive(first).manifest;expect(envelope.assets[0].includedRevisions).toEqual([rid]);expect(envelope.assets[0].historyScope).toBe('selected-only');expect(envelope.assets[0]).not.toHaveProperty('missingParents');
  const catalog=JSON.parse(await readFile(join(f.site,'src/data/cabin-woods-psx-horror.json'),'utf8'));expect(catalog.unknownField).toBe('preserved');expect(catalog.available).toBe(false);expect(catalog.assetCount).toBe(1);expect(asset.metrics.triangles).toBe(1);
});
async function resealRuntime(f: Awaited<ReturnType<typeof fixture>>, edit: (document:any)=>void) {
  const metadata=await readFile(join(f.workspace,'delivery/fixture-runtime.kiln-metadata.json'));const runtime=triangleGlb(d=>{d.asset.extras={kilnProvenanceV1:{version:'kiln.provenance.v1',profile:'runtime',metadata:{uri:'fixture.kiln-metadata.json',sha256:'sha256:'+hashBytes(metadata)}}};edit(d);});await writeFile(join(f.workspace,'delivery/fixture-runtime.glb'),runtime);const selected=JSON.parse(await readFile(f.selection,'utf8'));selected.assets.fixture.runtimeSha256=hashBytes(runtime);await writeFile(f.selection,JSON.stringify(selected));await syncSceneRuntime(f);
}
async function syncSceneRuntime(f: Awaited<ReturnType<typeof fixture>>) {
  const selected=JSON.parse(await readFile(f.selection,'utf8'));const key=Object.keys(selected.assets)[0],chosen=selected.assets[key];const runtime=await readFile(join(f.workspace,'delivery/fixture-runtime.glb')),metadata=await readFile(join(f.workspace,'delivery/fixture-runtime.kiln-metadata.json'));const document=JSON.parse(runtime.subarray(20,20+runtime.readUInt32LE(12)).toString());const uri=document.asset.extras?.kilnProvenanceV1?.metadata?.uri??'fixture.kiln-metadata.json';const collection=Buffer.from(JSON.stringify({schemaVersion:1,assets:{[key]:{collection:chosen.collection,assetId:chosen.assetId,revisionId:chosen.revisionId,canonicalSha256:chosen.canonicalSha256,runtimeSha256:hashBytes(runtime),sha256:hashBytes(runtime),bytes:runtime.length,url:'./assets/fixture.glb',metadataURL:'./assets/'+uri,metadataSha256:hashBytes(metadata),metadataBytes:metadata.length}}}));const members=[['web/woodland/assets/fixture.glb',runtime],['web/woodland/assets/'+uri,metadata],['web/woodland/collection.json',collection]] as const;const path=join(f.scene,'stage-manifest.json'),seal=JSON.parse(await readFile(path,'utf8'));seal.files=seal.files.filter((e:{path:string})=>!e.path.startsWith('web/woodland/'));for(const [path,bytes]of members){const relative='public/'+path.slice(4);await f.put(join(f.scene,relative),bytes);seal.files.push({path,source:relative,bytes:bytes.length,sha256:hashBytes(bytes)});}seal.selectionSha256=hashBytes(await readFile(f.selection));await writeFile(path,JSON.stringify(seal));
}
test('runtime provenance must seal the exact staged sibling metadata basename and bytes before writes',async()=>{
  for(const edit of [(d:any)=>{d.asset.extras.kilnProvenanceV1.metadata.uri='old-export-stem.kiln-metadata.json';},(d:any)=>{d.asset.extras.kilnProvenanceV1.metadata.sha256='sha256:'+'e'.repeat(64);},(d:any)=>{delete d.asset.extras.kilnProvenanceV1;}]){const f=await fixture();await resealRuntime(f,edit);await expect(stageCabinWoods(f)).rejects.toThrow('provenance');await expect(readFile(join(f.site,'public/asset-demos/cabin-woods-psx-horror/pack.json'))).rejects.toThrow();}
});
test('same binary cannot hide runtime node, sampler, material, animation or unowned extras changes',async()=>{
  for(const edit of [(d:any)=>{d.nodes[0].translation=[2,0,0];},(d:any)=>{d.samplers=[{magFilter:9728}];},(d:any)=>{d.materials[0].doubleSided=true;},(d:any)=>{d.animations=[];},(d:any)=>{d.scenes[0].extras={unexpected:'notowned'};}]){const f=await fixture();await resealRuntime(f,edit);await expect(stageCabinWoods(f)).rejects.toThrow('semantics');await expect(readFile(join(f.site,'public/asset-demos/cabin-woods-psx-horror/pack.json'))).rejects.toThrow();}
});
test('runtime profile removes only owned review clips and adds exact provenance',async()=>{const f=await fixture({reviewClips:true});const staged=await stageCabinWoods(f);expect(staged.assetCount).toBe(1);});
test('actual exporter retains review-only scene extras and explicitly empty canonical asset extras',async()=>{
  for(const options of [{reviewOnly:true,exporter:true},{emptyAssetExtras:true,exporter:true}]){const f=await fixture(options);const runtime=await readFile(join(f.workspace,'delivery/fixture-runtime.glb')),document=JSON.parse(runtime.subarray(20,20+runtime.readUInt32LE(12)).toString());if(options.reviewOnly)expect(document.scenes[0].extras).toEqual({});if(options.emptyAssetExtras)expect(document.asset.extras.kilnProvenanceV1).toBeDefined();expect((await stageCabinWoods(f)).assetCount).toBe(1);}
});
test('runtime comparison includes complete BIN chunk length and type headers',async()=>{
  for(const kind of ['length','type']){const f=await fixture();const runtime=await readFile(join(f.workspace,'delivery/fixture-runtime.glb')),offset=20+runtime.readUInt32LE(12);if(kind==='length')runtime.writeUInt32LE(runtime.readUInt32LE(offset)-4,offset);else runtime.writeUInt32LE(0x4e494258,offset+4);await writeFile(join(f.workspace,'delivery/fixture-runtime.glb'),runtime);const selected=JSON.parse(await readFile(f.selection,'utf8'));selected.assets.fixture.runtimeSha256=hashBytes(runtime);await writeFile(f.selection,JSON.stringify(selected));await syncSceneRuntime(f);await expect(stageCabinWoods(f)).rejects.toThrow('binary');await expect(readFile(join(f.site,'public/asset-demos/cabin-woods-psx-horror/pack.json'))).rejects.toThrow();}
});
test('scene collection must reference the exact selected model and sibling sidecar hash pairs',async()=>{
  const f=await fixture();const path=join(f.scene,'public/woodland/collection.json'),collection=JSON.parse(await readFile(path,'utf8'));collection.assets.fixture.metadataSha256='e'.repeat(64);await writeFile(path,JSON.stringify(collection));const sealPath=join(f.scene,'stage-manifest.json'),seal=JSON.parse(await readFile(sealPath,'utf8'));const entry=seal.files.find((e:{path:string})=>e.path==='web/woodland/collection.json');const bytes=await readFile(path);entry.bytes=bytes.length;entry.sha256=hashBytes(bytes);await writeFile(sealPath,JSON.stringify(seal));await expect(stageCabinWoods(f)).rejects.toThrow('Scene runtime');await expect(readFile(join(f.site,'public/asset-demos/cabin-woods-psx-horror/pack.json'))).rejects.toThrow();
  const g=await fixture();const other=join(g.scene,'stage-manifest.json'),missing=JSON.parse(await readFile(other,'utf8'));missing.files=missing.files.filter((e:{path:string})=>!e.path.endsWith('fixture.kiln-metadata.json'));await writeFile(other,JSON.stringify(missing));await expect(stageCabinWoods(g)).rejects.toThrow('Scene runtime');
});
test('changed saved source fails before any staged delivery appears',async()=>{
  const f=await fixture();await writeFile(join(f.saved,'source.kiln.js'),'tampered');await expect(stageCabinWoods(f)).rejects.toThrow('verification failed');await expect(readFile(join(f.site,'public/asset-demos/cabin-woods-psx-horror/pack.json'))).rejects.toThrow();
});
test('changed runtime bytes or scene sealed entry are rejected',async()=>{
  const f=await fixture();await writeFile(join(f.workspace,'delivery/fixture-runtime.glb'),'tampered');await expect(stageCabinWoods(f)).rejects.toThrow('verification failed');
  const g=await fixture();await writeFile(join(g.scene,'dist-game/game.html'),'tampered');await expect(stageCabinWoods(g)).rejects.toThrow('verification failed');
});
test('sealed source paths reject traversal and duplicate output members',async()=>{
  const f=await fixture();const file=join(f.source,'source-manifest.json');const m=JSON.parse(await readFile(file,'utf8'));m.files.push({...m.files[0],path:'../outside.js'});await writeFile(file,JSON.stringify(m));await expect(stageCabinWoods(f)).rejects.toThrow('Unsafe');
  const g=await fixture();const seal=join(g.scene,'stage-manifest.json');const n=JSON.parse(await readFile(seal,'utf8'));n.files.push(n.files[0]);await writeFile(seal,JSON.stringify(n));await expect(stageCabinWoods(g)).rejects.toThrow('Duplicate');
});
test('modern material closure remains a full remixable resource with a separately maintained scene',async()=>{
  const f=await fixture({separateScene:true});
  const material=await createMaterialRecordV2({schemaVersion:2,materialId:'fixture-pixel',name:'Fixture pixels',tileable:false,sources:[{id:'original',kind:'procedural',provider:'fixture',creator:'fixture',license:{spdx:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:'original fixture'},originalFiles:[]}],maps:[{slot:'baseColor',sourceId:'original',transforms:[],sampler:{minFilter:'nearest',magFilter:'nearest',wrapS:'clamp-to-edge',wrapT:'clamp-to-edge'},procedural:{schemaVersion:3,width:4,height:4,usage:'albedo',background:[65,81,53,255],operations:[]}}]});
  const manifest=JSON.parse(await readFile(join(f.saved,'manifest.json'),'utf8'));manifest.build={engine:'sha256:'+ 'd'.repeat(64),options:{},warnings:[],rebuild:'external-dependencies-required',dependencies:[{kind:'kiln.material.v2',delivery:'runtime',manifest:material.manifest}]};await writeFile(join(f.saved,'manifest.json'),JSON.stringify(manifest));await writeFile(join(f.saved,'materials.kiln.json'),JSON.stringify(await createMaterialLibraryPayload([material])));
  const selection=JSON.parse(await readFile(f.selection,'utf8'));selection.assets.fixture.manifestSha256=hashBytes(await readFile(join(f.saved,'manifest.json')));selection.assets.fixture.materialsSha256=hashBytes(await readFile(join(f.saved,'materials.kiln.json')));selection.materials.ground='../ground.kiln.json';const groundBytes=await readFile(join(f.saved,'materials.kiln.json'));await writeFile(join(f.workspace,'ground.kiln.json'),groundBytes);selection.materialSeals={ground:{bytes:groundBytes.length,sha256:hashBytes(groundBytes)}};await writeFile(f.selection,JSON.stringify(selection));const build=JSON.parse(await readFile(join(f.scene,'stage-manifest.json'),'utf8'));build.selectionSha256=hashBytes(await readFile(f.selection));await writeFile(join(f.scene,'stage-manifest.json'),JSON.stringify(build));
  const staged=await stageCabinWoods(f);const nested=await readFile(join(f.site,'public',staged.assets[0].editableDownload.url));const decoded=decodeAssetBundle(nested);expect(decoded[0].materialResources?.records).toHaveLength(1);expect(decoded[0].materialResources?.records[0].manifest).toEqual(material.manifest);expect(Buffer.from(decoded[0].files['asset.glb']).equals(triangleGlb())).toBe(true);
  const wire=unzipSync(nested);const payload=JSON.parse(new TextDecoder().decode(wire[`${aid}/${rid}/materials.kiln.json`]));expect(Buffer.from(payload.records[0].files['baseColor.png'],'base64').equals(Buffer.from(material.files['baseColor.png']))).toBe(true);
  expect(staged.textureResources).toHaveLength(1);expect(staged.textureResources[0].records[0].materialId).toBe(material.manifest.materialId);expect((await readFile(join(f.site,'public',staged.textureResources[0].editableDownload.url))).equals(groundBytes)).toBe(true);
});
test('scene archive seals runnable web, maintained source, notices and a local web-root server',async()=>{
  const f=await fixture();const result=await stageCabinWoods(f);const scene=result.downloads.find((d:{profile:string})=>d.profile==='scene');const archive=verifyArchive(await readFile(join(f.site,'public',scene.url)));expect(archive.manifest.profile).toBe('scene');for(const name of ['web/game.html','web/assets/main.js','web/woodland/assets/fixture.glb','web/woodland/assets/fixture.kiln-metadata.json','web/woodland/collection.json','scene-source/src/game/main.jsx','scene-source/source-manifest.json','serve.mjs','LICENSE','THIRD-PARTY-NOTICES.txt'])expect(archive.files[name]).toBeDefined();expect(new TextDecoder().decode(archive.files['serve.mjs'])).toContain("new URL('./web/'");expect(Object.keys(archive.files).some(x=>x.includes('node_modules'))).toBe(false);
});
test('sealed shared Three facade snapshot survives standalone source delivery byte-exact',async()=>{
  const f=await fixture();const path='shared/three-runtime.ts';const bytes=Buffer.from("export * from 'three/webgpu';\n// exact maintained snapshot fixture\n");await f.put(join(f.source,path),bytes);const sealPath=join(f.source,'source-manifest.json');const seal=JSON.parse(await readFile(sealPath,'utf8'));seal.files.push({path,bytes:bytes.length,sha256:hashBytes(bytes)});await writeFile(sealPath,JSON.stringify(seal));const result=await stageCabinWoods(f);const scene=result.downloads.find((d:{profile:string})=>d.profile==='scene');const archive=verifyArchive(await readFile(join(f.site,'public',scene.url)));expect(Buffer.from(archive.files['scene-source/'+path]).equals(bytes)).toBe(true);
});
test('restaging refuses unsealed leftover files instead of exposing or deleting them',async()=>{
  const f=await fixture();await stageCabinWoods(f);const stale=join(f.site,'public/asset-demos/cabin-woods-psx-horror/private-old.js');await writeFile(stale,'retained owner draft');await expect(stageCabinWoods(f)).rejects.toThrow('Unsealed existing staged file');expect(await readFile(stale,'utf8')).toBe('retained owner draft');
});
test('frozen source and manifest seals reject coordinated editing-file tampering',async()=>{
  const f=await fixture();const changed=Buffer.from("const meta={name:'tampered'};function build(){return createRoot('Changed');}");const manifest=JSON.parse(await readFile(join(f.saved,'manifest.json'),'utf8'));manifest.files['source.kiln.js']={bytes:changed.length,sha256:'sha256:'+hashBytes(changed)};await writeFile(join(f.saved,'manifest.json'),JSON.stringify(manifest));await writeFile(join(f.saved,'source.kiln.js'),changed);const sidecar=join(f.workspace,'delivery/fixture-runtime.kiln-metadata.json');const metadata=JSON.parse(await readFile(sidecar,'utf8'));metadata.source.sourceSha256='sha256:'+hashBytes(changed);await writeFile(sidecar,JSON.stringify(metadata));await expect(stageCabinWoods(f)).rejects.toThrow('verification failed');
});
test('technical nightman selection key delivers only public stone-golem gallery/download names',async()=>{
  const f=await fixture();await resealRuntime(f,d=>{d.asset.extras.kilnProvenanceV1.metadata.uri='stone-golem.kiln-metadata.json';});const selection=JSON.parse(await readFile(f.selection,'utf8'));selection.assets.nightman={...selection.assets.fixture,name:'Stone Golem'};delete selection.assets.fixture;await writeFile(f.selection,JSON.stringify(selection));await syncSceneRuntime(f);const sealPath=join(f.scene,'stage-manifest.json');const seal=JSON.parse(await readFile(sealPath,'utf8'));seal.selectionSha256=hashBytes(await readFile(f.selection));await writeFile(sealPath,JSON.stringify(seal));const staged=await stageCabinWoods(f);const asset=staged.assets[0];expect(asset.slug).toBe('stone-golem');expect(asset.assetId).toBe(aid);expect(asset.revisionId).toBe(rid);for(const url of [asset.modelPath,asset.poster.src,asset.runtimeDownload.url,asset.editableDownload.url]){expect(url).toContain('stone-golem');expect(url).not.toContain('nightman');}expect(asset.sourcePath).toContain(aid);expect(asset.sourcePath).not.toContain('nightman');
});

import { main as stageLegacyPacks } from './scene-pack.mjs';
import { stagedScenes } from './scene-source.mjs';
test('independently staged Cabin delivery survives the normal scene-pack build cleanup',async()=>{
  const f=await fixture();const staged=await stageCabinWoods(f);const archive=staged.downloads.find((d:{profile:string})=>d.profile==='editable');const before=await readFile(join(f.site,'public',archive.url));
  await stageLegacyPacks([],{KILN_SITE_SCENES_DIR:'off'},f.site);
  expect((await readFile(join(f.site,'public',archive.url))).equals(before)).toBe(true);
  expect(stagedScenes(f.site)['cabin-woods-psx-horror']?.url).toBe(staged.base+'web/game.html');
});
test('source runtime pin must match the archive release and selected bytes',async()=>{
 for(const mismatch of ['release','selectionSha256']){const f=await fixture();const pin={schemaVersion:1,release:f.release,selectionSha256:hashBytes(await readFile(f.selection))};pin[mismatch]=mismatch==='release'?'other-release':'f'.repeat(64);const bytes=Buffer.from(JSON.stringify(pin));await f.put(join(f.source,'runtime-pin.json'),bytes);const sealPath=join(f.source,'source-manifest.json'),seal=JSON.parse(await readFile(sealPath,'utf8'));seal.files.push({path:'runtime-pin.json',bytes:bytes.length,sha256:hashBytes(bytes)});await writeFile(sealPath,JSON.stringify(seal));await expect(stageCabinWoods(f)).rejects.toThrow('Source runtime pin');}
});

test('two sealed scene captures survive staging and the runnable archive',async()=>{
 const f=await fixture(),sealPath=join(f.scene,'stage-manifest.json'),seal=JSON.parse(await readFile(sealPath,'utf8'));
 const posters=[];
 for(const name of ['aerial','interior']){const path=`web/review-poster-${name}.png`,source=`review-media/${name}.png`;await f.put(join(f.scene,source),png);seal.files.push({path,source,bytes:png.length,sha256:hashBytes(png)});posters.push({src:`/asset-demos/cabin-woods-psx-horror/${path}`,width:1,height:1,alt:name,srcsetAvif:'',srcsetWebp:''});}
 await writeFile(sealPath,JSON.stringify(seal));const catalogPath=join(f.site,'src/data/cabin-woods-psx-horror.json'),catalog=JSON.parse(await readFile(catalogPath,'utf8'));catalog.posters=posters;await writeFile(catalogPath,JSON.stringify(catalog));
 const result=await stageCabinWoods(f);expect(result.posters).toEqual(posters);const download=result.downloads.find((d:{profile:string})=>d.profile==='scene'),archive=verifyArchive(await readFile(join(f.site,'public',download.url)));for(const poster of posters){const path=poster.src.replace(result.base,'');expect(Buffer.from(archive.files[path]).equals(png)).toBe(true);}
});
