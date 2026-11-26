import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyPack,NOTICES} from './scene-pack.mjs';

const IMMUTABLE='  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n';
const REVALIDATE='  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate\n';
/** Files in a release tree that its pack does not seal, so they keep revalidating. */
const UNSEALED={troy:['delivery.json']};

/**
 * Only an actually verified, isolated release tree may use immutable URLs. Every scene under dist/scene-packs is such
 * a tree when it holds one release whose pack verifies and names that scene and release: a changed pack takes a new
 * release, so its files never need revalidating, and a visitor who returns asks for none of them again.
 */
export async function sealedPackCache(dist){
 const root=join(dist,'scene-packs');let scenes;
 try{scenes=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {headers:'',files:[]};throw error;}
 const files=[];let headers='';
 for(const scene of scenes.filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort()){
  const entries=await readdir(join(root,scene),{withFileTypes:true});
  if(entries.length!==1||!entries[0].isDirectory()||!/^[a-z0-9-]+$/.test(entries[0].name))throw Error(`Expected one sealed ${scene} cache release`);
  const release=entries[0].name,dir=join(root,scene,release),pack=await verifyPack(dir,join(dir,NOTICES));
  if(pack.id!==scene||pack.release!==release)throw Error(`${scene} cache identity differs from its directory`);
  const base=`scene-packs/${scene}/${release}`;
  files.push(...[...pack.paths,'pack.json','SHA256SUMS',NOTICES].map(path=>`${base}/${path}`));
  headers+=`\n# Verified immutable ${scene} release; page routes continue to revalidate.\n/${base}/*\n${IMMUTABLE}`;
  for(const path of UNSEALED[scene]??[])headers+=`\n/${base}/${path}\n${REVALIDATE}`;
 }
 return {files,headers};
}
