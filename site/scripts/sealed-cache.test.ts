import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hashBytes} from './mirror-core.mjs';
import {sealedPackCache} from './sealed-cache.mjs';
import {headersErrors} from './static-validation-core.mjs';

/** A sealed pack with one file, written as the site stages one: pack.json, SHA256SUMS and the notices beside it. */
async function pack(root:string,scene:string,release:string,path:string,id=scene){
 const base=`scene-packs/${scene}/${release}`,dir=join(root,base);await mkdir(join(dir,path,'..'),{recursive:true});
 const bytes=Buffer.from('bank'),record={path,bytes:bytes.length,sha256:hashBytes(bytes)};
 await writeFile(join(dir,record.path),bytes);await writeFile(join(dir,'THIRD-PARTY-NOTICES.txt'),'MIT');
 await writeFile(join(dir,'pack.json'),JSON.stringify({schema:'kiln.scene-pack/1',id,release,files:[record]}));
 await writeFile(join(dir,'SHA256SUMS'),record.sha256+'  '+record.path+'\n');
 return {base,dir,record};
}

test('immutable release caching requires verified file seals, not a version-looking URL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-sealed-cache-'));
 try{
  const {base,dir,record}=await pack(root,'troy','troy-01','web/pose.bin');
  const inventory=await sealedPackCache(root);
  expect(inventory.headers).toContain('/scene-packs/troy/troy-01/*');expect(inventory.files).toContain(base+'/web/pose.bin');
  const header='/*\n Cache-Control: public, max-age=0, must-revalidate\n'+inventory.headers;
  expect(headersErrors({text:header,files:[base+'/web/pose.bin'],sealedFiles:inventory.files}).filter(e=>e.includes('immutable'))).toEqual([]);
  expect(headersErrors({text:header,files:[base+'/unknown.bin'],sealedFiles:inventory.files}).some(e=>e.includes('immutable'))).toBe(true);
  await writeFile(join(dir,record.path),'changed');await expect(sealedPackCache(root)).rejects.toThrow('verification failed');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('every verified scene pack is cached as immutable under its own release, and only Troy keeps a revalidating delivery record',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-sealed-cache-'));
 try{
  await pack(root,'troy','troy-01','web/pose.bin');
  const town=await pack(root,'seed-town','st4','models/roof.glb');
  const farm=await pack(root,'farm','r36-flush2','models/barn.glb');
  const inventory=await sealedPackCache(root);
  for(const base of ['scene-packs/farm/r36-flush2','scene-packs/seed-town/st4','scene-packs/troy/troy-01'])
   expect(inventory.headers).toContain(`\n/${base}/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n`);
  expect(inventory.headers.match(/delivery\.json/g)).toEqual(['delivery.json']);
  expect(inventory.headers).toContain('/scene-packs/troy/troy-01/delivery.json\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate\n');
  for(const path of [town.base+'/models/roof.glb',town.base+'/pack.json',town.base+'/SHA256SUMS',town.base+'/THIRD-PARTY-NOTICES.txt',farm.base+'/models/barn.glb'])
   expect(inventory.files).toContain(path);
  // The same scenes in the same order give the same text: the header file is part of the sealed build.
  expect((await sealedPackCache(root)).headers).toBe(inventory.headers);
  expect(inventory.headers.indexOf('/scene-packs/farm/')).toBeLessThan(inventory.headers.indexOf('/scene-packs/seed-town/'));
  const header='/*\n Cache-Control: public, max-age=0, must-revalidate\n'+inventory.headers;
  expect(headersErrors({text:header,files:inventory.files,sealedFiles:inventory.files}).filter(e=>e.includes('immutable'))).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a scene with two releases, or a pack that names another scene or release, gets no immutable rule',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-sealed-cache-'));
 try{
  await pack(root,'seed-town','st4','models/roof.glb');await pack(root,'seed-town','st5','models/roof.glb');
  await expect(sealedPackCache(root)).rejects.toThrow('Expected one sealed seed-town cache release');
  await rm(join(root,'scene-packs/seed-town/st5'),{recursive:true});
  await pack(root,'farm','r36','models/barn.glb','seed-town');
  await expect(sealedPackCache(root)).rejects.toThrow('farm cache identity differs from its directory');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('asset-free output emits no release cache rule',async()=>{const root=await mkdtemp(join(tmpdir(),'kiln-no-sealed-cache-'));try{expect(await sealedPackCache(root)).toEqual({headers:'',files:[]});}finally{await rm(root,{recursive:true,force:true});}});
