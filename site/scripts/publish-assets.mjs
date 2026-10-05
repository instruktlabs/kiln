import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {assetPath,verifyBytes,ASSET_BASE} from './mirror-core.mjs';
import {resolveNpmCli,WRANGLER_VERSION} from './deploy.mjs';

export function assetContentType(path){if(path.endsWith('.zip'))return 'application/zip';if(path.endsWith('.glb'))return 'model/gltf-binary';throw Error('Unsupported asset upload type: '+path);}
/** New immutable keys only. Existing different bytes are never overwritten. */
export async function publishAssets({mirror,records,request=fetch,upload,log=()=>{}}){
 const seen=new Set();
 for(const record of records){assetPath(record.path);assetContentType(record.path);if(seen.has(record.path))throw Error('Duplicate upload path');seen.add(record.path);verifyBytes(await readFile(join(mirror,record.path)),record,record.path);}
 const receipt={files:[]};
 for(const record of records){
  const url=new URL(record.path,ASSET_BASE).href,probe=new URL(url),nonce=randomUUID();probe.searchParams.set('__kiln_publish',nonce);probe.searchParams.set('phase','before');
  let response=await request(probe.href,{signal:AbortSignal.timeout(60000)}),uploaded=false;
  // A pre-upload miss must not poison the clean download URL with a cached 404.
  if(response.status===404){await upload(record,join(mirror,record.path),assetContentType(record.path));uploaded=true;probe.searchParams.set('phase','after');response=await request(probe.href,{signal:AbortSignal.timeout(60000)});}
  if(!response.ok)throw Error(`Asset verification HTTP ${response.status}: ${record.path}`);
  verifyBytes(Buffer.from(await response.arrayBuffer()),record,record.path);
  receipt.files.push({...record,url,verifiedUrl:probe.href,uploaded,cacheControl:response.headers.get('cache-control'),cacheStatus:response.headers.get('cf-cache-status')});
  log(`${receipt.files.length}/${records.length}: ${uploaded?'uploaded':'verified existing'} ${record.path}`);
 }
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [mirrorArg,listArg,...flags]=process.argv.slice(2);if(!mirrorArg||!listArg||flags.some(f=>!['--upload','--oauth'].includes(f)))throw Error('Usage: node publish-assets.mjs MIRROR_ROOT UPLOAD_LIST [--upload] [--oauth]');
 const mirror=resolve(mirrorArg),records=JSON.parse(await readFile(resolve(listArg),'utf8'));
 if(!flags.includes('--upload')){for(const r of records){assetPath(r.path);assetContentType(r.path);verifyBytes(await readFile(join(mirror,r.path)),r,r.path);}console.log(JSON.stringify({files:records.length,bytes:records.reduce((n,r)=>n+r.bytes,0),dryRun:true}));}
 else{
  const env={...process.env};if(flags.includes('--oauth'))delete env.CLOUDFLARE_API_TOKEN;
  const prefix=[await resolveNpmCli(),'exec','--yes',`--package=wrangler@${WRANGLER_VERSION}`,'--','wrangler'];
  const run=args=>new Promise((done,fail)=>{const child=spawn(process.execPath,[...prefix,...args],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',fail);child.on('exit',code=>code===0?done(output):fail(Error(`Wrangler failed (${code}): ${output}`)));});
  const version=await run(['--version']);if(!new RegExp(`(^|\\s)${WRANGLER_VERSION.replaceAll('.','\\.')}($|\\s)`,'m').test(version))throw Error('Pinned Wrangler version mismatch');
  const receipt=await publishAssets({mirror,records,upload:(r,file,type)=>run(['r2','object','put','kiln-assets/'+r.path,'--file',file,'--content-type',type,'--cache-control','public, max-age=31536000, immutable','--remote']),log:console.log});
  await writeFile(resolve(listArg)+'.published.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({verified:receipt.files.length,uploaded:receipt.files.filter(f=>f.uploaded).length}));
 }
}
