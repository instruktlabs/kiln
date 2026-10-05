import {readRuntimeBytes} from './runtime-transport.mjs';
import {createResourceScope,ownObjectResources} from './resource-scope.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {createPoseTexturePool} from './pose-texture-pool.mjs';
export async function createFleetResources(T,{poseTextures:injectedPoseTextures=null}={}){
 const scope=createResourceScope();try{
 const base=new URL('./runtime/landing-v11/',import.meta.url),manifest=await(await fetch(new URL('manifest.json',base))).json(),files=new Map(),hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
 await Promise.all(['ship.glb','crew.glb','bank.json','transforms.bin','queue.json','profile.json'].map(async file=>{const entry=manifest.files.find(f=>f.file===file);if(!entry)throw Error('Missing fleet manifest entry '+file);const b=await readRuntimeBytes(new URL(file,base));if(await hash(b)!==entry.sha256)throw Error('Fleet source mismatch '+file);files.set(file,b);}));
 const json=f=>JSON.parse(new TextDecoder().decode(files.get(f))),record=json('bank.json'),bytes=files.get('transforms.bin');for(const [file,r]of [['ship.glb',record.ship],['crew.glb',record.source],['transforms.bin',record.data]])if('sha256:'+await hash(files.get(file))!==r.sha256)throw Error('Fleet bank identity mismatch');
 const loader=new GLTFLoader(),ship=ownObjectResources(scope,(await loader.parseAsync(files.get('ship.glb'),'')).scene,'ship source'),human=ownObjectResources(scope,(await loader.parseAsync(files.get('crew.glb'),'')).scene,'crew source');
 const poseTextures=injectedPoseTextures??createPoseTexturePool(T);if(!injectedPoseTextures)scope.defer(()=>poseTextures.close(),'pose pool');const texturePool=await poseTextures.register(record.manifest,bytes);
 return {ship,human,record,bytes,data:json('queue.json'),profile:json('profile.json'),poseTextures,texturePool,stats:()=>({...texturePool.stats(),sharedPosePool:Boolean(injectedPoseTextures),atlasBytes:bytes.byteLength}),dispose:scope.close};
 }catch(error){return scope.fail(error);}
}
