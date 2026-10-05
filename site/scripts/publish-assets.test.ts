import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hashBytes} from './mirror-core.mjs';
import {publishAssets,assetContentType} from './publish-assets.mjs';

test('publication verifies every local pin before any mutation and refuses different immutable bytes',async()=>{
 const mirror=await mkdtemp(join(tmpdir(),'kiln-upload-'));
 try {
  const bytes=Buffer.from('zip'),record={path:'a.zip',bytes:bytes.length,sha256:hashBytes(bytes)};await writeFile(join(mirror,record.path),bytes);
  const uploads:string[]=[];
  await expect(publishAssets({mirror,records:[record,{...record,path:'missing.zip'}],request:async()=>new Response(null,{status:404}),upload:async r=>{uploads.push(r.path)}})).rejects.toThrow();expect(uploads).toEqual([]);
  await expect(publishAssets({mirror,records:[record],request:async()=>new Response('other'),upload:async r=>{uploads.push(r.path)}})).rejects.toThrow('verification failed');expect(uploads).toEqual([]);
  let live=false;const checkedUrls:string[]=[];
  const receipt=await publishAssets({mirror,records:[record],request:async url=>{checkedUrls.push(String(url));return live?new Response(bytes,{headers:{'Cache-Control':'public, max-age=31536000, immutable'}}):new Response(null,{status:404});},upload:async r=>{uploads.push(r.path);live=true;}});
  expect(uploads).toEqual(['a.zip']);expect(receipt.files[0].sha256).toBe(record.sha256);
  expect(new URL(checkedUrls[0]).searchParams.get('phase')).toBe('before');
  expect(new URL(checkedUrls[1]).searchParams.get('phase')).toBe('after');
  expect(assetContentType('x.glb')).toBe('model/gltf-binary');expect(assetContentType('x.zip')).toBe('application/zip');expect(()=>assetContentType('x.exe')).toThrow('Unsupported');
  await expect(publishAssets({mirror,records:[{...record,path:'../a.zip'}],upload:async()=>{}})).rejects.toThrow('Unsafe');
 }finally{await rm(mirror,{recursive:true,force:true});}
});
