import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hashBytes, verifyArchive, verifyBytes, fetchPinnedFile } from './mirror-core.mjs';
import { overlayTroyWeb, updateTroyCatalog } from './troy-candidate.mjs';
import { deterministicZip } from './asset-delivery.mjs';
import { inspectGlb } from './generate-commons.mjs';
import { verifyPack, NOTICES } from './scene-pack.mjs';
import { prepareRuntimeTransport } from '../../scenes/packages/troy/scripts/prepare-runtime-transport.mjs';

// Explicit release preparation. Normal site builds consume only the resulting sealed archive.
const [mirrorArg, horsePosterArg, release = 'troy-20261005-05', seedPinArg] = process.argv.slice(2);
if (!mirrorArg || !horsePosterArg) throw new Error('Usage: node prepare-troy-candidate.mjs MIRROR_ROOT HORSE_POSTER [RELEASE]');
const site=resolve(import.meta.dirname,'..'),repo=resolve(site,'..'),mirror=resolve(mirrorArg),source=join(repo,'scenes/packages/troy');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const oldPin=await json(seedPinArg?resolve(seedPinArg):join(site,'src/data/troy-delivery.json')),oldCatalog=await json(join(site,'src/data/troy.json'));
if(oldPin.release===release) throw new Error('Candidate release must be new; prepare from an explicitly selected previous release');
const archive=await fetchPinnedFile(oldPin,{cache:join(site,'.cache/troy')});
const {files:seed}=verifyArchive(await readFile(archive));
const sourceFiles={};
async function collect(dir,into){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink())throw new Error('Source staging refuses symlinks');const path=join(dir,entry.name);if(entry.isDirectory())await collect(path,into);else into[relative(join(source,'web'),path).replaceAll('\\','/')]=await readFile(path);}}
await collect(join(source,'web'),sourceFiles);
const sources=Object.entries(sourceFiles).sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hashBytes(bytes)}));
const sourceManifest=Buffer.from(JSON.stringify({schema:'kiln.troy-source/1',files:sources},null,2)+'\n'),sourceManifestSha256=hashBytes(sourceManifest);
for(const path of Object.keys(seed)) if(['delivery.json','pack.json','SHA256SUMS'].includes(path)||path.startsWith('sources/')) delete seed[path];
let files=overlayTroyWeb(seed,sourceFiles);
const group=(await json(join(site,'src/data/asset-delivery.json'))).groups.troy,catalog=updateTroyCatalog(oldCatalog,group,release);
for(const asset of group.assets){const bytes=await readFile(join(mirror,asset.runtimeDownload.path));verifyBytes(bytes,asset.runtimeDownload,asset.slug);files[`models/${asset.slug}.glb`]=bytes;}
files['media/wooden-horse.webp']=await readFile(resolve(horsePosterArg));
catalog.assets.find(a=>a.slug==='wooden-horse').metrics=inspectGlb(files['models/wooden-horse.glb']);
files['browser-manifest.json']=sourceManifest;
files['README.md']=Buffer.from('# Troy\n\nRun `node serve.mjs`, then open http://127.0.0.1:4440/web/.\n\nChoose Explore or Fight, and select Achilles or Hector. WASD moves; left click or J is a light attack; right click or K is a heavy attack; hold Space to block. More opens secondary controls.\n\nThis archive is the compiled runnable scene, including pinned models and pose banks. Editable scene code is at https://github.com/matthew-kissinger/kiln/tree/main/scenes/packages/troy . Asset pages offer separate Runtime assets and Editable assets downloads; the latter retain authoring sources, available revisions and material resources. See LICENSE.txt and SCENE-LICENSE.txt.\n');
files['THIRD-PARTY-NOTICES.txt']=Buffer.from('Authored asset content: CC0 1.0, see LICENSE.txt. Kiln scene code: MIT, see SCENE-LICENSE.txt. Three.js 0.186.1: MIT, see web/vendor/three/LICENSE. Editable asset downloads retain their material records and applicable attribution.\n');
const stagingRoot=join(mirror,'.staging');await mkdir(stagingRoot,{recursive:true});const stage=await mkdtemp(join(stagingRoot,'troy-'));
for(const [path,bytes]of Object.entries(files)){const dest=join(stage,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);}
const transport=await prepareRuntimeTransport(join(stage,'web'));
const bundle=spawnSync('bun',[join(source,'scripts/bundle-scene.mjs'),join(stage,'web'),join(repo,'scenes/node_modules/three'),repo],{encoding:'utf8'});
if(bundle.status!==0)throw new Error(`Troy bundle failed: ${bundle.stderr}\n${bundle.stdout}`);
files={};async function staged(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await staged(path);else files[relative(stage,path).replaceAll('\\','/')]=await readFile(path);}}await staged(stage);
const seals=()=>Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>[path,{bytes:bytes.length,sha256:hashBytes(bytes)}]));
const sceneFiles=Object.entries(seals()).filter(([path])=>path!==NOTICES).map(([path,record])=>({path,...record}));
files['pack.json']=Buffer.from(JSON.stringify({schema:'kiln.scene-pack/1',id:'troy',release,three:'0.186.1',models:catalog.assets.map(a=>({id:a.slug,path:`models/${a.slug}.glb`})),source:{browserManifestSha256:sourceManifestSha256},files:sceneFiles},null,2)+'\n');
files['SHA256SUMS']=Buffer.from(sceneFiles.map(f=>`${f.sha256}  ${f.path}`).join('\n')+'\n');
files['delivery.json']=Buffer.from(JSON.stringify({schema:'kiln.delivery/1',release,files:seals()},null,2)+'\n');
for(const path of ['pack.json','SHA256SUMS','delivery.json'])await writeFile(join(stage,path),files[path]);
await verifyPack(stage,join(stage,NOTICES));
const zip=deterministicZip(files),record={release,path:`packs/troy/${release}/troy-scene.zip`,bytes:zip.length,sha256:hashBytes(zip),sourceManifestSha256};
verifyArchive(zip);
const output=join(mirror,record.path);await mkdir(dirname(output),{recursive:true});await writeFile(output,zip);
catalog.scene={...record,url:'https://assets.kilnstudio.tools/'+record.path};
// Legacy model inventory remains exact; public download choices use the unified group.
const runtime=group.downloads.find(d=>d.profile==='runtime');catalog.models={...runtime};
await writeFile(join(site,'src/data/troy-delivery.json'),JSON.stringify(record,null,2)+'\n');
await writeFile(join(site,'src/data/troy.json'),JSON.stringify(catalog,null,2)+'\n');
await writeFile(join(source,'runtime-pin.json'),JSON.stringify({schema:'kiln.troy-runtime-pin/1',base:'https://assets.kilnstudio.tools/',...record},null,2)+'\n');
const receipt={record,stage,sourceFiles:sources.length,transport,bundle:JSON.parse(bundle.stdout.trim()),posterSha256:hashBytes(files['media/wooden-horse.webp'])};
await writeFile(join(stagingRoot,release+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
