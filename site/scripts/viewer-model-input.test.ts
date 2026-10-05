import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hashBytes} from './mirror-core.mjs';
import {viewerModelInput} from './viewer-model-input.mjs';

test('external previews resolve only to hash-verified local mirror bytes',async()=>{
 const mirror=await mkdtemp(join(tmpdir(),'kiln-viewer-pin-'));
 try{
  const bytes=Buffer.from('web model'),pin={path:'web.glb',bytes:bytes.length,sha256:hashBytes(bytes)};await writeFile(join(mirror,pin.path),bytes);
  expect(await viewerModelInput('https://assets.kilnstudio.tools/web.glb',{dist:'/dist',mirror,records:[pin]})).toBe(join(mirror,pin.path));
  await writeFile(join(mirror,pin.path),'wrong');await expect(viewerModelInput('https://assets.kilnstudio.tools/web.glb',{dist:'/dist',mirror,records:[pin]})).rejects.toThrow('verification failed');
  await expect(viewerModelInput('https://assets.kilnstudio.tools/unpinned.glb',{dist:'/dist',mirror,records:[pin]})).rejects.toThrow('Unpinned');
  await expect(viewerModelInput('https://other.test/web.glb',{dist:'/dist',mirror,records:[pin]})).rejects.toThrow('Unsupported');
 }finally{await rm(mirror,{recursive:true,force:true});}
});
