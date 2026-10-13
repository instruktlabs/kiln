import * as THREE from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createTexturePool,embeddedImageHashes,shareGltfTextures} from './resource-sharing.mjs';

function cloneAssetRoot(master){
 const root=cloneSkeleton(master.scene),materials=new Map();
 root.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=true;node.material=(Array.isArray(node.material)?node.material:[node.material]).map(m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);});if(node.material.length===1)node.material=node.material[0];}});
 return root;
}

/** Immutable scenery shares one authored graph. Only its placement is per instance.
 * A full independently owned graph can still be materialized for source rendering.
 * Canonical geometry, textures, metadata and the saved files are never modified.
 */
export function createStaticPlacement(master){
 if(master.animations.length)throw Error('Static placement cannot contain animation');
 if(!master.scene.isGroup&&!master.scene.isScene)throw Error('Static placement requires a non-renderable scene container');
 const root=master.scene.clone(false);let materialized=false;
 return {root,sourceRoot:master.scene,animations:master.animations,entry:master.entry,mixer:new THREE.AnimationMixer(root),
  materialize(){if(materialized)return;const copy=cloneAssetRoot(master);root.add(...copy.children.slice());materialized=true;root.updateWorldMatrix(true,true);},
  releaseSource(){if(!materialized)return;const materials=new Set();root.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])materials.add(m);});root.clear();for(const material of materials)material.dispose();materialized=false;}
 };
}

export async function loadAssetCollection(url,onProgress=()=>{}){
 url=new URL(url,location.href).href;
 const response=await fetch(url);if(!response.ok)throw Error(`Collection manifest: ${response.status}`);
 const manifestBytes=await response.arrayBuffer(),manifestSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',manifestBytes)),v=>v.toString(16).padStart(2,'0')).join(''),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));if(manifest.schemaVersion!==1||!manifest.assets)throw Error('Unsupported collection manifest');
 const masters=new Map(),surfaceMaterials=new Map(),loader=new GLTFLoader(),entries=Object.entries(manifest.assets),texturePool=createTexturePool();
 for(const [key,record] of Object.entries(manifest.materials??{})){
  const material=new THREE.MeshStandardMaterial({color:record.parameters.baseColor,roughness:record.parameters.roughness,metalness:record.parameters.metalness});
  for(const map of record.maps){
   if(map.slot!=='baseColor')throw Error(`Unimplemented terrain material slot: ${map.slot}`);
   const response=await fetch(new URL(map.url,url));if(!response.ok)throw Error(`Material ${key}: ${response.status}`);const bytes=await response.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(`sha256:${hash}`!==map.sha256)throw Error(`Material map hash mismatch: ${key}`);
   const blobUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));let texture;try{texture=await new THREE.TextureLoader().loadAsync(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}
   texture.colorSpace=map.colorSpace==='srgb'?THREE.SRGBColorSpace:THREE.NoColorSpace;
   texture.magFilter=map.sampler.magFilter==='nearest'?THREE.NearestFilter:THREE.LinearFilter;
   const filters={'nearest':THREE.NearestFilter,'linear':THREE.LinearFilter,'nearest-mipmap-linear':THREE.NearestMipmapLinearFilter,'linear-mipmap-linear':THREE.LinearMipmapLinearFilter,'nearest-mipmap-nearest':THREE.NearestMipmapNearestFilter,'linear-mipmap-nearest':THREE.LinearMipmapNearestFilter};
   if(!filters[map.sampler.minFilter])throw Error(`Unknown minification filter ${map.sampler.minFilter}`);texture.minFilter=filters[map.sampler.minFilter];
   const wraps={repeat:THREE.RepeatWrapping,clamp:THREE.ClampToEdgeWrapping,'mirrored-repeat':THREE.MirroredRepeatWrapping};texture.wrapS=wraps[map.sampler.wrapS];texture.wrapT=wraps[map.sampler.wrapT];texture.needsUpdate=true;material.map=texture;
  }
  surfaceMaterials.set(key,material);
 }
 for(const [key,entry] of entries){
  const result=await fetch(new URL(entry.url,url));if(!result.ok)throw Error(`${key}: ${result.status}`);const bytes=await result.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256.replace(/^sha256:/,''))throw Error(`Asset hash mismatch: ${key}`);
  const gltf=await loader.parseAsync(bytes,new URL(entry.url,url).href);shareGltfTextures(gltf,await embeddedImageHashes(bytes),texturePool);gltf.scene.updateMatrixWorld(true);
  // Parser plugins/caches belong to loading, not the runtime asset lifetime.
  masters.set(key,{scene:gltf.scene,animations:gltf.animations,entry});onProgress(masters.size,entries.length,key);
 }
 return {manifest,manifestSha256,masters,surfaceMaterials,instantiate(key,options={}){
  const master=masters.get(key);if(!master)throw Error(`No saved asset for ${key}`);
  if(options.staticPlacement&&master.animations.length===0)return createStaticPlacement(master);
  const root=cloneAssetRoot(master);
  return {root,animations:master.animations,mixer:new THREE.AnimationMixer(root),entry:master.entry};
 },dispose(){const geometries=new Set(),materials=new Set(surfaceMaterials.values()),textures=new Set();for(const master of masters.values())master.scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);for(const t of textures)t.dispose();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();masters.clear();surfaceMaterials.clear();}};
}

export function findRole(root,name){let found=null;root.traverse(node=>{if(!found&&(node.name===name||node.name===`Mesh_${name}`||node.userData?.role===name))found=node;});return found;}
/** Build after authoring graph load; rebuild explicitly if names or roles change. */
export function createRoleLookup(root){
 const roles=new Map();root.traverse(node=>{for(const key of [node.name,node.name.startsWith('Mesh_')?node.name.slice(5):null,node.userData?.role])if(typeof key==='string'&&!roles.has(key))roles.set(key,node);});
 return name=>roles.get(name)??null;
}
export function setClip(instance,name,options={}){
 if(instance.clipName===name&&!options.restart)return;const clip=instance.animations.find(c=>c.name===name);if(!clip)return;
 instance.mixer.stopAllAction();const action=instance.mixer.clipAction(clip);action.reset().setLoop(options.once?THREE.LoopOnce:THREE.LoopRepeat,options.once?1:Infinity);action.clampWhenFinished=!!options.once;action.play();instance.clipName=name;
}
