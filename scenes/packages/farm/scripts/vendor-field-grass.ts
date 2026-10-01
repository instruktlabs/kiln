// SPDX-License-Identifier: MIT
// Reproduce the exact vendored subset and the two documented integration patches from the authenticated r33 archive.
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveSources,workspaceTarget,sha256} from './staging-core';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const {selected}=resolveSources(workspace,{release:'r33',force:false});
const prefix='scene/source/field-grass/',out=workspaceTarget(workspace,resolve(workspace,'packages/farm/vendor/field-grass'));
const entries=[...selected.archives.scene.entries].filter(([path])=>path.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));
const files:{path:string;bytes:number;upstreamSha256:string;localSha256:string;changes:string[]}[]=[];
const writes:{target:string;bytes:Uint8Array}[]=[];
function replaceOnce(text:string,from:string,to:string):string{if(text.split(from).length!==2)throw new Error(`Upstream patch context changed: ${from}`);return text.replace(from,to);}
for(const [sourcePath,original]of entries){
 const path=sourcePath.slice(prefix.length),changes:string[]=[];let bytes=original;
 if(path==='src/three/grassMaterial.ts'){
  let text=new TextDecoder().decode(original);
  text=replaceOnce(text,'export interface GrassMaterialInputs {','export interface GrassMaterialInputs {\n  /** Scene-owned clock; omitted retains the upstream three time node. */\n  readonly timeNode?: TSLNode;');
  text=replaceOnce(text,'function octave(root: TSLNode, travel: TSLNode, index: number): TSLNode {','function octave(root: TSLNode, travel: TSLNode, index: number, time: TSLNode): TSLNode {');
  text=replaceOnce(text,'export function makeGrassMaterial(inputs: GrassMaterialInputs): THREE.MeshBasicNodeMaterial {','export function makeGrassMaterial(inputs: GrassMaterialInputs): THREE.MeshBasicNodeMaterial {\n  const windTime = inputs.timeNode ?? time;');
  text=replaceOnce(text,'mul(time.mul(float(style.windSpeed)))','mul(windTime.mul(float(style.windSpeed)))');
  for(const index of [0,1,2])text=replaceOnce(text,`octave(root, travel, ${index})`,`octave(root, travel, ${index}, windTime)`);
  text=replaceOnce(text,'sin(time.mul(float(style.flutterRate))','sin(windTime.mul(float(style.flutterRate))');
  bytes=new TextEncoder().encode(text);changes.push('Optional timeNode drives all wind expressions; default remains upstream three time.');
 }
 if(path==='src/three/grassLayer.ts'){
  let text=new TextDecoder().decode(original);
  text=replaceOnce(text,'    tufts: tuftAttribute,','    tufts: tuftAttribute,\n    timeNode: options.timeNode,');
  text=replaceOnce(text,'      geometry.dispose();','      mesh.dispose();\n      geometry.dispose();');
  bytes=new TextEncoder().encode(text);changes.push('Forward optional timeNode to makeGrassMaterial.','Dispose the InstancedMesh before its owned geometry/material so renderer instance buffers release.');
 }
 if(path==='src/react/GrassLayer.tsx'){
  const text=replaceOnce(new TextDecoder().decode(original),'      options.sunDirection,','      options.sunDirection,\n      options.timeNode,');
  bytes=new TextEncoder().encode(text);changes.push('Include optional timeNode in the upstream React wrapper memo dependencies.');
 }
 const target=workspaceTarget(workspace,resolve(out,path));if(existsSync(target)&&sha256(readFileSync(target))!==sha256(bytes))throw new Error(`Existing vendored file differs: ${target}`);
 files.push({path,bytes:bytes.length,upstreamSha256:sha256(original),localSha256:sha256(bytes),changes});writes.push({target,bytes});
}
const upstream={repository:'Field Grass (Matthew Kissinger; repository URL absent from the sealed source subset)',repositoryUrl:null,commit:'2a0d3a3256dc8d8f6d9de68f3dc1636a621559c5',version:'0.1.0',license:'MIT',holder:'Copyright (c) 2026 Matthew Kissinger',source:{release:'r33',archive:selected.archives.scene.receipt.archive,archiveSha256:selected.archives.scene.receipt.sha256,path:prefix},imports:'The sealed source already uses three/webgpu and three/tsl; no import rewrite was necessary.',files};
for(const {target,bytes}of writes){mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))writeFileSync(target,bytes);}
writeFileSync(resolve(out,'UPSTREAM.json'),JSON.stringify(upstream,null,2)+'\n');
console.log(JSON.stringify({out,files:files.length,patched:files.filter(f=>f.changes.length).map(f=>f.path),verified:true},null,2));
