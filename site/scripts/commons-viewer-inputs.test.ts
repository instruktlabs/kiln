import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildCommons} from './fetch-mirror.mjs';
import {hashBytes} from './mirror-core.mjs';

test('Commons hydrates exact external viewer inputs for offline model validation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-viewer-build-'));
 try{
  const dataDir=join(root,'data'),mirror=join(root,'mirror'),cache=join(root,'cache'),publicDir=join(root,'public');await mkdir(join(dataDir,'standalone'),{recursive:true});await mkdir(mirror);
  const bytes=Buffer.from('web tier'),pin={path:'web.glb',bytes:bytes.length,sha256:hashBytes(bytes)};await writeFile(join(mirror,pin.path),bytes);
  await writeFile(join(dataDir,'mirror-manifest.json'),JSON.stringify({base:'https://assets.kilnstudio.tools/',files:[pin]}));
  await writeFile(join(dataDir,'commons-build.json'),JSON.stringify({archives:[],sources:[],models:[],images:[],viewerModels:[pin.path]}));
  await writeFile(join(dataDir,'upload-manifest.json'),JSON.stringify({files:[]}));await writeFile(join(dataDir,'standalone/golden-gate-reference.md'),'reference');
  await buildCommons({mirror,cache,dataDir,publicDir,enabled:true});
  expect(await readFile(join(cache,'mirror',pin.path))).toEqual(bytes);
  await writeFile(join(cache,'mirror',pin.path),'wrong');await expect(buildCommons({mirror,cache,dataDir,publicDir,enabled:true})).rejects.toThrow('verification failed');
 }finally{await rm(root,{recursive:true,force:true});}
});
