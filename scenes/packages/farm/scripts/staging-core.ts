// SPDX-License-Identifier: MIT
// Farm receipt validation stays separate from the CLI so synthetic corruption cases never touch sealed inputs.
import {createHash} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {readZip,verifyArchiveMembers} from '@kiln-scenes/scene-kit/staging';
export type Release='r33'|'r34';
export interface StageOptions {release:Release;force:boolean;source?:string;out?:string;siteManifest?:string}
export interface ModelReceipt {id:string;path:string;bytes:number;sha256:string;scenePath:string}
interface Download {profile:'runtime'|'scene';archive:string;bytes:number;sha256:string;files:number;assets:number}
interface Downloads {schemaVersion:number;projectRevision:string;parentDeliveryManifestSha256:string;fullPackAccepted:boolean;downloads:Download[]}
interface Delivery {schemaVersion:number;projectRevision?:string;parentDeliveryManifestSha256?:string;files:Record<string,{bytes:number;sha256:string}>}
export const sha256=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(file:string,reason:string):never=>{throw new Error(`${file}: ${reason}`);};
export function required(entries:Map<string,Uint8Array>,path:string):Uint8Array{return entries.get(path)??fail(path,'missing member');}
function json(entries:Map<string,Uint8Array>,path:string):any{try{return JSON.parse(new TextDecoder().decode(required(entries,path)));}catch(error){return fail(path,String(error));}}
function canonical(v:unknown):string{if(Array.isArray(v))return`[${v.map(canonical).join(',')}]`;if(plain(v))return`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;return JSON.stringify(v);}
export function parseStageOptions(args:readonly string[]):StageOptions{
 const options:StageOptions={release:'r33',force:false};
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--')continue;if(key==='--force'){options.force=true;continue;}
  if(!['--release','--source','--out','--check-site-manifest'].includes(key!))throw new Error(`Unknown staging option: ${key}`);
  const value=args[++i];if(!value||value.startsWith('--'))throw new Error(`Missing value: ${key}`);
  if(key==='--release'){if(value!=='r33'&&value!=='r34')throw new Error(`Unsupported release: ${value}`);options.release=value;}
  else if(key==='--source')options.source=value;else if(key==='--out')options.out=value;else options.siteManifest=value;
 }
 return options;
}
export function verifyDelivery(entries:Map<string,Uint8Array>,archive:string):{delivery:Delivery;verifiedMembers:number}{
 const delivery=json(entries,'delivery.json') as Delivery;
 if(!plain(delivery)||delivery.schemaVersion!==1||!plain(delivery.files))fail(`${archive}/delivery.json`,'expected schemaVersion 1 with a files object');
 const files=Object.entries(delivery.files).map(([path,f])=>{
  if(!plain(f)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^sha256:[0-9a-f]{64}$/.test(f.sha256))fail(`${archive}/delivery.json`, `invalid member receipt ${path}`);
  return{path,bytes:f.bytes,sha256:f.sha256};
 });
 // A manifest cannot include its own digest. The archive SHA-256 authenticates this one explicit exclusion.
 verifyArchiveMembers(entries,files,new Set(['delivery.json']));
 return{delivery,verifiedMembers:files.length};
}
export function verifyFarmModels(runtime:Map<string,Uint8Array>,scene:Map<string,Uint8Array>):{models:ModelReceipt[];sceneManifest:any;modelBytes:number}{
 const manifest=json(scene,'scene/scene.json');
 if(!Array.isArray(manifest.assets)||manifest.assets.length!==23)fail('scene/scene.json','expected 23 model assets');
 if(canonical(json(scene,'scene/layout.json'))!==canonical(manifest.layout))fail('scene/layout.json','does not equal scene.json.layout');
 const ids=new Set<string>(),scenePaths=new Set<string>();
 const models:ModelReceipt[]=manifest.assets.map((asset:any):ModelReceipt=>{
  const {id,file,runtimeSha256,runtimeBytes}=asset;
  if(typeof id!=='string'||!/^[a-z0-9-]+$/.test(id)||ids.has(id)||typeof file!=='string'||!/^assets\/[0-9a-f]{64}\.glb$/.test(file)||!/^sha256:[0-9a-f]{64}$/.test(runtimeSha256)||!Number.isSafeInteger(runtimeBytes))fail('scene/scene.json',`invalid or duplicate asset ${String(id)}`);
  ids.add(id);const path=`models/${id}.glb`,scenePath=`scene/${file}`,expected=runtimeSha256.slice(7),a=required(runtime,path),b=required(scene,scenePath);scenePaths.add(scenePath);
  if(a.length!==runtimeBytes||b.length!==runtimeBytes||sha256(a)!==expected||sha256(b)!==expected)fail(path,'runtime/scene/scene.json GLB cross-check failed');
  return{id,path,bytes:a.length,sha256:expected,scenePath};
 });
 if([...runtime.keys()].filter(p=>p.endsWith('.glb')).length!==23||[...scene.keys()].filter(p=>p.endsWith('.glb')).length!==23||scenePaths.size!==23)fail('models','model count differs from exact 23-model set');
 return{models,sceneManifest:manifest,modelBytes:models.reduce((n,m)=>n+m.bytes,0)};
}
export function verifySiteModels(value:unknown,release:Release,models:readonly ModelReceipt[]):void{
 if(!plain(value)||!Array.isArray(value.files))fail('upload-manifest.json','expected files array');
 const prefix=`packs/farm/${release}/models/`,files=(value as {files:any[]}).files.filter((f:any)=>typeof f.path==='string'&&f.path.startsWith(prefix));
 if(files.length!==23)fail('upload-manifest.json',`expected 23 model entries for ${release}`);
 const paths=new Set<string>();
 for(const model of models){const path=`packs/farm/${release}/${model.path}`,matches=files.filter((f:any)=>f.path===path);if(matches.length!==1||matches[0].bytes!==model.bytes||matches[0].sha256.replace(/^sha256:/,'')!==model.sha256)fail(path,'website byte/hash/path comparison failed');paths.add(path);}
 if(paths.size!==23)fail('upload-manifest.json','duplicate models');
}
export function verifySource(source:string,release:Release){
 const downloadsPath=resolve(source,'downloads.json'),bytes=readFileSync(downloadsPath),downloads=JSON.parse(new TextDecoder().decode(bytes)) as Downloads;
 if(downloads.schemaVersion!==1||!Array.isArray(downloads.downloads)||!downloads.projectRevision?.startsWith(`r_${release.slice(1).padStart(10,'0')}_`))fail(downloadsPath,'schema or release mismatch');
 const archives={} as Record<'runtime'|'scene',{receipt:Download;entries:Map<string,Uint8Array>;verifiedMembers:number}>;
 for(const profile of ['runtime','scene'] as const){
  const matches=downloads.downloads.filter(d=>d.profile===profile),item=matches[0];
  if(matches.length!==1||!item||item.archive!==`shapes-and-seasons-farm-${profile}.zip`||!Number.isSafeInteger(item.bytes)||item.bytes<=0||!/^sha256:[0-9a-f]{64}$/.test(item.sha256)||item.assets!==23)fail(downloadsPath,`invalid ${profile} archive receipt`);
  const entries=readZip(resolve(source,item.archive),{bytes:item.bytes,sha256:item.sha256.slice(7)}),checked=verifyDelivery(entries,item.archive);
  if(entries.size!==item.files)fail(item.archive,'download file count mismatch');
  if(checked.delivery.projectRevision!==downloads.projectRevision||checked.delivery.parentDeliveryManifestSha256!==downloads.parentDeliveryManifestSha256)fail(`${item.archive}/delivery.json`,'revision or parent manifest mismatch');
  archives[profile]={receipt:item,entries,verifiedMembers:checked.verifiedMembers};
 }
 const checked=verifyFarmModels(archives.runtime.entries,archives.scene.entries);
 if(checked.sceneManifest.projectRevision!==downloads.projectRevision)fail('scene/scene.json','revision linkage mismatch');
 // scene.json carries an earlier runtimeArchiveSha256 and a null deliverySha256 in both seals.
 // downloads.json authenticates the documented archive; actual GLB bytes are cross-checked above as SPEC 6.3 requires.
 const expectedBytes=release==='r33'?7_070_552:7_098_444;if(checked.modelBytes!==expectedBytes)fail('models',`expected ${expectedBytes} bytes, got ${checked.modelBytes}`);
 return{source:resolve(source),downloads,downloadsSha256:sha256(bytes),archives,...checked};
}
export type VerifiedSource=ReturnType<typeof verifySource>;
export function resolveSources(workspace:string,options:StageOptions):{selected:VerifiedSource;checked:VerifiedSource[]}{
 const candidates=[resolve(workspace,`../site-build/mirror/packs/farm/${options.release}`),resolve(workspace,`../farm-pilot/delivery/farm-${options.release}-documented-downloads`)].filter(p=>existsSync(resolve(p,'downloads.json')));
 if(options.source){const explicit=resolve(options.source);if(!candidates.includes(explicit))candidates.unshift(explicit);else candidates.splice(0,0,...candidates.splice(candidates.indexOf(explicit),1));}
 if(!candidates.length)fail('downloads.json',`no source for ${options.release}`);
 const checked=candidates.map(source=>verifySource(source,options.release)),selected=checked[0]!;
 for(const other of checked.slice(1))for(const profile of ['runtime','scene'] as const)if(other.archives[profile].receipt.sha256!==selected.archives[profile].receipt.sha256)fail(other.source,`${profile} archive differs from ${selected.source}`);
 return{selected,checked};
}
/** Writes are confined to this repository and cannot pass through a symbolic-link parent. */
export function workspaceTarget(workspace:string,path:string):string{
 const root=resolve(workspace),target=resolve(path);if(!target.startsWith(root+sep))fail(target,'output must be inside scenes workspace');
 let parent=target;while(parent!==root){if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())fail(parent,'symbolic-link output is not allowed');parent=dirname(parent);}return target;
}
export function extractVerified(workspace:string,source:VerifiedSource,release:Release):{sceneRoot:string;runtimeRoot:string}{
 const sceneRoot=workspaceTarget(workspace,resolve(workspace,'.tmp',`pilot-${release}`)),runtimeRoot=resolve(sceneRoot,'runtime');
 const copies=[...source.archives.scene.entries].map(([path,bytes])=>({target:resolve(sceneRoot,path),bytes})).concat([...source.archives.runtime.entries].map(([path,bytes])=>({target:resolve(runtimeRoot,path),bytes})));
 for(const {target,bytes}of copies){workspaceTarget(workspace,target);if(existsSync(target)&&sha256(readFileSync(target))!==sha256(bytes))fail(target,'existing sealed extraction differs');}
 for(const {target,bytes}of copies){mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))writeFileSync(target,bytes);}
 return{sceneRoot,runtimeRoot};
}
