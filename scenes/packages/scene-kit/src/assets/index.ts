import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Material, Texture, Mesh } from 'three/webgpu';
import { SceneError, asSceneError } from '../contract/core';
import type { SceneProgress } from '../contract/types';
import { sha256Hex } from './hash';
import { resolveAssetUrl, validateManifest } from './manifest';
import type { PackManifest, PackFile, PackCell } from './manifest';
import { useRuntime } from '../internal/runtime';
export * from './hash';export * from './manifest';
export interface LoadedPack {manifest:PackManifest;models:Map<string,GLTF>;data:Map<string,ArrayBuffer>;imageHashes:Map<string,Map<number,string>>;timings:{id:string;bytes:number;fetchMs:number;parseMs:number}[]}
export interface LoadPackOptions {
 signal:AbortSignal;onProgress?:(p:SceneProgress)=>void;concurrency?:number;measure?:boolean;
 /** Optional startup subset; the complete verified manifest remains available to PackReader for lazy reads. */
 startupModel?:(model:{id:string;path:string})=>boolean;
 /** Opt in to data-first scheduling and a synchronous snapshot after each verified data file, before its progress event. */
 onData?:(data:ReadonlyMap<string,ArrayBuffer>)=>void;
}
export interface PackReader {readonly manifest:PackManifest;readonly cells:readonly PackCell[];cell(id:string):PackCell|undefined;fetchFile(path:string,signal:AbortSignal):Promise<ArrayBuffer>;loadGlb(path:string,signal:AbortSignal):Promise<GLTF>}
/** The verified startup pack owned by the nearest SceneRoot; no extra fetch is performed. */
export function useLoadedPack():LoadedPack{const pack=useRuntime().pack;if(!pack)throw new SceneError('runtime','Scene pack is not available before startup');return pack;}
/** Verified lazy reads share the mounted pack manifest and its lifecycle. */
export function usePackReader():PackReader{const reader=useRuntime().reader;if(!reader)throw new SceneError('runtime','Scene pack reader is not available before startup');return reader;}
function abort(signal:AbortSignal){if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}
async function response(url:URL,signal:AbortSignal):Promise<Response>{try{abort(signal);const r=await fetch(url,{mode:'cors',credentials:'omit',signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r;}catch(cause){abort(signal);throw new SceneError('asset-fetch',`Could not fetch ${url.pathname}`,cause);}}
export async function fetchVerified(url:URL,file:PackFile,signal:AbortSignal):Promise<ArrayBuffer>{let bytes:ArrayBuffer;try{bytes=await(await response(url,signal)).arrayBuffer();}catch(cause){abort(signal);if(cause instanceof SceneError)throw cause;throw new SceneError('asset-fetch',`Could not read ${file.path}`,cause);}abort(signal);if(bytes.byteLength!==file.bytes||await sha256Hex(bytes)!==file.sha256)throw new SceneError('asset-hash',`Integrity mismatch: ${file.path}`);abort(signal);return bytes;}
function glbJson(bytes:ArrayBuffer):{json:any;bin:Uint8Array|null}{const v=new DataView(bytes);if(bytes.byteLength<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw new Error('Invalid GLB header');let at=12,json:any,bin:Uint8Array|null=null;while(at+8<=bytes.byteLength){const size=v.getUint32(at,true),type=v.getUint32(at+4,true);at+=8;if(at+size>bytes.byteLength)throw new Error('Truncated GLB chunk');if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,at,size)).trim());if(type===0x004e4942)bin=new Uint8Array(bytes,at,size);at+=size;}if(!json||at!==bytes.byteLength)throw new Error('Invalid GLB chunks');return {json,bin};}
export async function embeddedImageHashes(bytes:ArrayBuffer):Promise<Map<number,string>>{const {json,bin}=glbJson(bytes),result=new Map<number,string>();if(!bin)return result;await Promise.all((json.images??[]).map(async(image:any,i:number)=>{const b=json.bufferViews?.[image.bufferView];if(!b||b.buffer!==0||image.uri)return;const at=b.byteOffset??0;if(!Number.isInteger(at)||!Number.isInteger(b.byteLength)||at<0||b.byteLength<0||at+b.byteLength>bin.length)throw new Error('Image outside GLB binary chunk');result.set(i,await sha256Hex(bin.subarray(at,at+b.byteLength)));}));return result;}
/** Prevent unverified external resources or decoder downloads during parsing. */
function validateSelfContained(bytes:ArrayBuffer){const {json}=glbJson(bytes);for(const item of [...(json.buffers??[]),...(json.images??[])])if(item.uri&&!item.uri.startsWith('data:'))throw new Error('External GLB resource is not in the verified pack');if((json.extensionsRequired??[]).some((x:string)=>/draco|basisu|meshopt/i.test(x)))throw new Error('Compressed decoder extensions are unsupported');}
/** Terminal release: attempts each distinct resource once, then reports all disposal failures together. */
export function disposeLoadedModels(models:Iterable<GLTF>):void {
 const geometries=new Set<any>(),materials=new Set<any>(),textures=new Set<any>(),skeletons=new Set<any>(),images=new Set<any>();
 for(const gltf of models)for(const scene of gltf.scenes??[gltf.scene])scene.traverse(o=>{const m=o as Mesh&{skeleton?:{dispose():void}};if(m.geometry)geometries.add(m.geometry);if(m.skeleton)skeletons.add(m.skeleton);for(const mat of Array.isArray(m.material)?m.material:m.material?[m.material]:[]){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
 const errors:unknown[]=[],release=(fn:()=>void)=>{try{fn();}catch(error){errors.push(error);}};
 for(const texture of textures){if(texture.source?.data?.close)images.add(texture.source.data);release(()=>texture.dispose());}
 for(const geometry of geometries)release(()=>geometry.dispose());for(const material of materials)release(()=>material.dispose());for(const skeleton of skeletons)release(()=>skeleton.dispose());for(const image of images)release(()=>image.close());
 if(errors.length)throw new AggregateError(errors,'One or more loaded model resources could not be disposed');
}
/** Loading errors remain primary; cleanup errors are retained without replacing the asset classification. */
function failAfterCleanup(error:unknown,models:Iterable<GLTF>):never {
 try{disposeLoadedModels(models);}catch(cleanup){const cause=new AggregateError([error,cleanup],'Asset loading failed and resource cleanup also failed');if(error instanceof SceneError)throw new SceneError(error.code,error.message,cause);const result=new Error(error instanceof Error?error.message:'Asset loading failed',{cause});if(error instanceof Error)result.name=error.name;throw result;}
 throw error;
}
async function parseGlb(bytes:ArrayBuffer,assetBase:string,path:string,signal:AbortSignal):Promise<GLTF>{let gltf:GLTF;try{validateSelfContained(bytes);abort(signal);gltf=await new GLTFLoader().parseAsync(bytes,resolveAssetUrl(assetBase,'placeholder').href.replace(/placeholder$/,''));}catch(cause){abort(signal);throw new SceneError('asset-parse',`Could not parse ${path}`,cause);}if(signal.aborted)failAfterCleanup(signal.reason??new DOMException('Aborted','AbortError'),[gltf]);return gltf;}
export function createPackReader(assetBase:string,manifest:PackManifest):PackReader{validateManifest(manifest);const files=new Map(manifest.files.map(f=>[f.path,f]));const reader:PackReader={manifest,cells:manifest.cells??[],cell:id=>manifest.cells?.find(c=>c.id===id),fetchFile(path,signal){const file=files.get(path);if(!file)return Promise.reject(new SceneError('pack-invalid',`Unlisted pack file: ${path}`));return fetchVerified(resolveAssetUrl(assetBase,path),file,signal);},async loadGlb(path,signal){return parseGlb(await reader.fetchFile(path,signal),assetBase,path,signal);}};return reader;}
export async function loadPack(assetBase:string,o:LoadPackOptions):Promise<LoadedPack>{
 o.onProgress?.({phase:'pack',loaded:0,total:1,text:'Reading scene pack'});const r=await response(resolveAssetUrl(assetBase,'pack.json'),o.signal);let manifest:PackManifest;try{manifest=validateManifest(await r.json());}catch(cause){abort(o.signal);if(cause instanceof SceneError)throw cause;throw new SceneError('pack-invalid','Invalid pack.json',cause);}abort(o.signal);
 const result:LoadedPack={manifest,models:new Map(),data:new Map(),imageHashes:new Map(),timings:[]},reader=createPackReader(assetBase,manifest);
 const local=new AbortController(),onAbort=()=>local.abort(o.signal.reason);o.signal.addEventListener('abort',onAbort,{once:true});
 const modelTasks=manifest.models.filter(m=>o.startupModel?.(m)??true).map(m=>({id:m.id,path:m.path,model:true})),dataTasks=Object.entries(manifest.data).map(([id,path])=>({id,path,model:false}));
 // Preserve the M1 scheduling contract unless a consumer explicitly requests early CPU preparation.
 const tasks=o.onData?[...dataTasks,...modelTasks]:[...modelTasks,...dataTasks];
 let cursor=0,loaded=0,failed:unknown;const now=()=>o.measure?performance.now():0;
 try{
  await Promise.all(Array.from({length:Math.max(1,Math.min(tasks.length,o.concurrency??tasks.length))},async()=>{
   while(cursor<tasks.length&&!failed){const task=tasks[cursor++]!;
    try{
     const begin=now(),bytes=await reader.fetchFile(task.path,local.signal),fetched=now();
     if(task.model){
      let hashes:Map<number,string>;try{hashes=await embeddedImageHashes(bytes);}catch(cause){throw new SceneError('asset-parse',`Could not read embedded images: ${task.path}`,cause);}
      const gltf=await parseGlb(bytes,assetBase,task.path,local.signal);
      if(local.signal.aborted)failAfterCleanup(local.signal.reason??new DOMException('Aborted','AbortError'),[gltf]);
      result.models.set(task.id,gltf);result.imageHashes.set(task.id,hashes);result.imageHashes.set(gltf.scene.uuid,hashes);
     }else{
      result.data.set(task.id,bytes);
      if(o.onData){abort(local.signal);try{o.onData(new Map(result.data));}catch(error){throw asSceneError(error);}abort(local.signal);}
     }
     result.timings.push({id:task.id,bytes:bytes.byteLength,fetchMs:fetched-begin,parseMs:now()-fetched});
     o.onProgress?.({phase:'assets',loaded:++loaded,total:tasks.length,text:`Loaded ${task.id}`});
    }catch(error){if(!failed)failed=error;local.abort(error);}
   }
  }));
  if(failed)throw failed;abort(o.signal);return result;
 }catch(error){failAfterCleanup(error,result.models.values());}finally{o.signal.removeEventListener('abort',onAbort);}
}
const samplerFields=['mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','normalized','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace','rotation','matrixAutoUpdate'];
function textureKey(t:Texture,model:GLTF,hashes:Map<number,string>|undefined):string|null{const x=t as any;if(x.isDataTexture||x.isCompressedTexture||x.isVideoTexture||x.isCubeTexture||x.isDepthTexture||x.isRenderTargetTexture||x.isArrayTexture||x.mipmaps?.length||x.onUpdate)return null;const index=model.parser.associations.get(t)?.textures,definition=model.parser.json.textures?.[index!],hash=hashes?.get(definition?.source);if(!definition||definition.extensions||!hash)return null;return JSON.stringify([hash,...samplerFields.map(k=>x[k]),t.offset.toArray(),t.repeat.toArray(),t.center.toArray(),t.matrixAutoUpdate?null:t.matrix.toArray(),t.userData]);}
export function poolTextures(models: Iterable<GLTF>, imageHashes: LoadedPack['imageHashes']): { uniqueBefore: number; uniqueAfter: number; sharedAssignments: number } {
  const pool = new Map<string, Texture>(), keys = new WeakMap<Texture, string | null>();
  const before = new Set<Texture>(), after = new Set<Texture>(), replaced = new Set<Texture>();
  let sharedAssignments = 0;
  for (const model of models) {
    const materials = new Set<Material>();
    for (const scene of model.scenes ?? [model.scene]) scene.traverse(o => {
      const mesh = o as Mesh;
      for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) materials.add(material);
    });
    for (const material of materials) for (const [slot, value] of Object.entries(material)) if (value?.isTexture) {
      const texture = value as Texture; before.add(texture);
      if (!keys.has(texture)) keys.set(texture, textureKey(texture, model, imageHashes.get(model.scene.uuid)));
      const key = keys.get(texture);
      if (key != null) {
        const shared = pool.get(key);
        if (shared && shared !== texture) { (material as any)[slot] = shared; sharedAssignments++; replaced.add(texture); }
        else if (!shared) pool.set(key, texture);
      }
      after.add((material as any)[slot]);
    }
  }
  const retainedImages = new Set([...after].map(texture => texture.source.data)), closedImages = new Set<unknown>();
  for (const texture of replaced) if (!after.has(texture)) {
    texture.dispose(); const bitmap = texture.source.data as { close?: () => void } | undefined;
    if (bitmap?.close && !retainedImages.has(bitmap) && !closedImages.has(bitmap)) { bitmap.close(); closedImages.add(bitmap); }
  }
  return { uniqueBefore: before.size, uniqueAfter: after.size, sharedAssignments };
}
