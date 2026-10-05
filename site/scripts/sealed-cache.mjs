import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyPack,NOTICES} from './scene-pack.mjs';

/** Only an actually verified, isolated release tree may use immutable URLs. */
export async function sealedTroyCache(dist){
 const root=join(dist,'scene-packs/troy');let entries;
 try{entries=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {headers:'',files:[]};throw error;}
 if(entries.length!==1||!entries[0].isDirectory()||!/^[a-z0-9-]+$/.test(entries[0].name))throw Error('Expected one sealed Troy cache release');
 const release=entries[0].name,dir=join(root,release),pack=await verifyPack(dir,join(dir,NOTICES));
 if(pack.id!=='troy'||pack.release!==release)throw Error('Troy cache identity differs from its directory');
 const base=`scene-packs/troy/${release}`;
 return {files:[...pack.paths,'pack.json','SHA256SUMS',NOTICES].map(path=>`${base}/${path}`),headers:`\n# Verified immutable Troy release; page routes continue to revalidate.\n/${base}/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n\n/${base}/delivery.json\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate\n`};
}
