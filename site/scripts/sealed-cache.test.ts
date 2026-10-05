import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hashBytes} from './mirror-core.mjs';
import {sealedTroyCache} from './sealed-cache.mjs';
import {headersErrors} from './static-validation-core.mjs';

test('immutable release caching requires verified file seals, not a version-looking URL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-sealed-cache-'));
 try{
  const base='scene-packs/troy/troy-01',dir=join(root,base);await mkdir(join(dir,'web'),{recursive:true});
  const bytes=Buffer.from('bank'),record={path:'web/pose.bin',bytes:bytes.length,sha256:hashBytes(bytes)};
  await writeFile(join(dir,record.path),bytes);await writeFile(join(dir,'THIRD-PARTY-NOTICES.txt'),'MIT');
  await writeFile(join(dir,'pack.json'),JSON.stringify({schema:'kiln.scene-pack/1',id:'troy',release:'troy-01',files:[record]}));
  await writeFile(join(dir,'SHA256SUMS'),record.sha256+'  '+record.path+'\n');
  const inventory=await sealedTroyCache(root);
  expect(inventory.headers).toContain('/scene-packs/troy/troy-01/*');expect(inventory.files).toContain(base+'/web/pose.bin');
  const header='/*\n Cache-Control: public, max-age=0, must-revalidate\n'+inventory.headers;
  expect(headersErrors({text:header,files:[base+'/web/pose.bin'],sealedFiles:inventory.files}).filter(e=>e.includes('immutable'))).toEqual([]);
  expect(headersErrors({text:header,files:[base+'/unknown.bin'],sealedFiles:inventory.files}).some(e=>e.includes('immutable'))).toBe(true);
  await writeFile(join(dir,record.path),'changed');await expect(sealedTroyCache(root)).rejects.toThrow('verification failed');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('asset-free output emits no release cache rule',async()=>{const root=await mkdtemp(join(tmpdir(),'kiln-no-sealed-cache-'));try{expect(await sealedTroyCache(root)).toEqual({headers:'',files:[]});}finally{await rm(root,{recursive:true,force:true});}});
