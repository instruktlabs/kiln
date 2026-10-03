import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { stageFiles, verifyStaged, readZip, verifyArchiveMembers } from '../../src/staging/index';
const root=resolve('packages/scene-kit/tests/staging/.tmp');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('new packs require the current renderer pin while historical packs remain verifiable unchanged',()=>{
 const plan={id:'pin',release:'r1',three:'0.186.1' as const,out:join(root,'pin'),models:[],data:{},files:[]};
 try{
  expect(()=>Reflect.apply(stageFiles,null,[{...plan,three:'0.186.0'}])).toThrow('Stage plan three pin must be 0.186.1');
  stageFiles(plan);const path=join(plan.out,'pack.json'),current=JSON.parse(readFileSync(path,'utf8'));
  expect(current.three).toBe('0.186.1');
  const historical=JSON.stringify({...current,three:'0.186.0'},null,2)+'\n';writeFileSync(path,historical);
  expect(verifyStaged(plan.out)).toEqual({ok:true,problems:[]});expect(readFileSync(path,'utf8')).toBe(historical);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('U-03/04 directory staging, zip verification, corruption and idempotence',()=>{
 mkdirSync(root,{recursive:true});const b=new TextEncoder().encode('synthetic glb');writeFileSync(join(root,'a.glb'),b);
 const plan={id:'demo',release:'r1',three:'0.186.1' as const,out:join(root,'out'),models:[{id:'a',to:'models/a.glb'}],data:{},files:[{from:join(root,'a.glb'),to:'models/a.glb',sha256:hash(b)}]};
 try{expect(stageFiles(plan)).toEqual({files:1,bytes:b.length});expect(verifyStaged(plan.out)).toEqual({ok:true,problems:[]});expect(stageFiles(plan)).toEqual({files:1,bytes:b.length});
  writeFileSync(join(plan.out,'models/a.glb'),'corrupt');expect(verifyStaged(plan.out).problems[0]).toContain('models/a.glb');expect(()=>stageFiles(plan)).toThrow('models/a.glb');stageFiles({...plan,force:true});
  const zip=zipSync({'models/a.glb':b});writeFileSync(join(root,'test.zip'),zip);expect(readZip(join(root,'test.zip'),{bytes:zip.length,sha256:hash(zip)}).get('models/a.glb')).toEqual(b);expect(()=>readZip(join(root,'test.zip'),{bytes:zip.length,sha256:'0'.repeat(64)})).toThrow('test.zip');
  const entries=readZip(join(root,'test.zip'));verifyArchiveMembers(entries,[{path:'models/a.glb',bytes:b.length,sha256:hash(b)}]);expect(()=>verifyArchiveMembers(entries,[{path:'models/a.glb',bytes:b.length,sha256:'0'.repeat(64)}])).toThrow('models/a.glb');expect(()=>verifyArchiveMembers(entries,[])).toThrow('models/a.glb');expect(()=>verifyArchiveMembers(new Map(),[{path:'lost.glb',bytes:0,sha256:hash(b)}])).toThrow('lost.glb');
  expect(()=>stageFiles({...plan,files:[{...plan.files[0]!,sha256:'0'.repeat(64)}]})).toThrow('a.glb');
  writeFileSync(join(plan.out,'SHA256SUMS'),'bad');expect(verifyStaged(plan.out).ok).toBe(false);stageFiles({...plan,force:true});writeFileSync(join(plan.out,'extra.bin'),'extra');expect(()=>stageFiles(plan)).toThrow('extra.bin');stageFiles({...plan,force:true});expect(verifyStaged(plan.out).ok).toBe(true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('U-03/04 synthetic runtime and scene archives share a verified model and stage the expected tree',()=>{
 mkdirSync(root,{recursive:true});const glb=new TextEncoder().encode('self-contained synthetic GLB payload'),layout=new TextEncoder().encode('{"placements":[]}\n'),scene=new TextEncoder().encode(JSON.stringify({assets:[{id:'a',runtimeSha256:'sha256:'+hash(glb)}]}));
 const runtimeZip=zipSync({'models/a.glb':glb}),sceneZip=zipSync({'assets/a.glb':glb,'layout.json':layout,'scene.json':scene});writeFileSync(join(root,'runtime.zip'),runtimeZip);writeFileSync(join(root,'scene.zip'),sceneZip);
 try{const runtime=readZip(join(root,'runtime.zip'),{bytes:runtimeZip.length,sha256:hash(runtimeZip)}),source=readZip(join(root,'scene.zip'),{bytes:sceneZip.length,sha256:hash(sceneZip)});verifyArchiveMembers(runtime,[{path:'models/a.glb',bytes:glb.length,sha256:hash(glb)}]);verifyArchiveMembers(source,[...source].map(([path,b])=>({path,bytes:b.length,sha256:hash(b)})));const expected=JSON.parse(new TextDecoder().decode(source.get('scene.json'))).assets[0].runtimeSha256.replace('sha256:','');expect(hash(runtime.get('models/a.glb')!)).toBe(expected);expect(hash(source.get('assets/a.glb')!)).toBe(expected);
  writeFileSync(join(root,'extracted.glb'),runtime.get('models/a.glb')!);writeFileSync(join(root,'layout.json'),source.get('layout.json')!);const plan={id:'synthetic',release:'r1',three:'0.186.1' as const,out:join(root,'out'),models:[{id:'a',to:'models/a.glb'}],data:{layout:'data/layout.json'},files:[{from:join(root,'extracted.glb'),to:'models/a.glb',sha256:expected},{from:join(root,'layout.json'),to:'data/layout.json',sha256:hash(layout)}]};expect(stageFiles(plan)).toEqual({files:2,bytes:glb.length+layout.length});expect(verifyStaged(plan.out).ok).toBe(true);expect(JSON.parse(readFileSync(join(plan.out,'pack.json'),'utf8')).data.layout).toBe('data/layout.json');writeFileSync(join(root,'extracted.glb'),'different model');expect(()=>stageFiles({...plan,force:true})).toThrow('extracted.glb');
 }finally{rmSync(root,{recursive:true,force:true});}
});
