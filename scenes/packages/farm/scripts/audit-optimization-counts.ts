/** Count-only R3-08 evidence. Every input is checked against the sealed delivery.
 * No renderer, network, image decoder or elapsed-time measurement is used.
 * Run after staging: bun packages/farm/scripts/audit-optimization-counts.ts
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {LoadedPack} from '@kiln-scenes/scene-kit';
await import('three');
const {optimizeFarmWorld}=await import('../src/world/optimize');
const {buildPlacements,setCropShadows}=await import('../src/world/placements');
const {addWoodland}=await import('../src/world/woodland');
const {createFrameGraph}=await import('@kiln-scenes/scene-kit/instancing');
const base=resolve('.tmp/pilot-r33'), receipts=JSON.parse(readFileSync(resolve(base,'delivery.json'),'utf8')), hashes:Record<string,string>={};
function read(name:string){const bytes=readFileSync(resolve(base,name)),hash=createHash('sha256').update(bytes).digest('hex'),receipt=receipts.files[name];if(!receipt||receipt.bytes!==bytes.length||receipt.sha256!=='sha256:'+hash)throw Error('Sealed member mismatch: '+name);hashes[name]=hash;return bytes;}
const source=(name:string)=>new TextDecoder().decode(read('scene/'+name)), manifest=JSON.parse(source('scene.json')), viewer=source('viewer.mjs');
const models=new Map(),textures=new Map<number,T.Texture>(),loader=new GLTFLoader();loader.register(()=>({name:'COUNT_ONLY_NO_IMAGE_DECODE',loadTexture(index:number){let t=textures.get(index);if(!t){t=new T.Texture();textures.set(index,t);}return Promise.resolve(t);}}));
for(const asset of manifest.assets){textures.clear();const b=read('scene/'+asset.file);models.set(asset.id,await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer,''));}
const planting=new Function(source('planting.mjs').replaceAll('export ','')+';return{soilPartName,applyPlanting};')();
const clipScale=new Function(source('scene-motion.mjs').replaceAll('export ','')+';return sceneClipTimeScale;')();
const chooseStart=viewer.indexOf('function chooseClip('),chooseEnd=viewer.indexOf('\nconst playbackLabel',chooseStart),placementStart=viewer.indexOf(' for(const placement of manifest.layout.placements)'),placementEnd=viewer.indexOf('\n play=createFarmPlay',placementStart),initialStart=viewer.indexOf(' for(const i of instances){const preferred='),initialEnd=viewer.indexOf('\n',initialStart+1);
if([chooseStart,chooseEnd,placementStart,placementEnd,initialStart,initialEnd].some(n=>n<0))throw Error('Pilot extraction marker missing');
const scene=new T.Scene(),instances:any[]=[];
new Function('THREE','clone','manifest','models','scene','instances','soilPartName','applyPlanting',viewer.slice(placementStart,placementEnd))(T,clone,manifest,models,scene,instances,planting.soilPartName,planting.applyPlanting);
const chooseClip=new Function('THREE','sceneClipTimeScale',viewer.slice(chooseStart,chooseEnd)+';return chooseClip;')(T,clipScale);new Function('instances','chooseClip',viewer.slice(initialStart,initialEnd))(instances,chooseClip);
new Function(source('crop-shadows.mjs').replaceAll('export ','')+';return setCropShadows;')()(instances,false,false);
scene.updateMatrixWorld(true);let visibleMeshes=0,eligibleMeshes=0;const excluded=new Set(['farmer','tractor','trailer','farmhouse','barn','watermill','fence-gate']);
for(const i of instances)i.object.traverseVisible((o:any)=>{if(!o.isMesh)return;visibleMeshes++;if(!excluded.has(i.asset.id)&&!o.isSkinnedMesh&&!Array.isArray(o.material)&&!o.material.transparent&&!o.morphTargetInfluences?.length&&o.matrixWorld.determinant()>0)eligibleMeshes++;});
const batchSource=source('instance-batches.mjs'), batchFactory=(s:string)=>new Function(s.replaceAll('export ','')+';return batchInstances;')();
const cacheFactory=new Function(source('static-transforms.mjs').replaceAll('export ','')+';return cacheStaticPlacements;')(),graphFactory=new Function(source('frame-graph.mjs').replaceAll('export ','')+';return createFrameGraph;')();
const narrow=batchFactory(batchSource.replaceAll('(pos.x+48)/96','pos.x/24').replaceAll('(pos.z+48)/96','pos.z/24'))(T,scene,instances),narrowFrozen=cacheFactory(instances),narrowGraph=graphFactory(scene,instances,narrow),narrowStats={...narrow.stats,tangentDerivatives:new Set(narrow.batches.filter((b:any)=>b.mesh.geometry!==b.sources[0].o.geometry).map((b:any)=>b.mesh.geometry)).size,frameGraph:narrowGraph.stats};narrowGraph.restore();narrowFrozen.restore();narrow.restore();
const wide=batchFactory(batchSource)(T,scene,instances),derived=new Set(wide.batches.filter((b:any)=>b.mesh.geometry!==b.sources[0].o.geometry).map((b:any)=>b.mesh.geometry));
const frozen=new Function(source('static-transforms.mjs').replaceAll('export ','')+';return cacheStaticPlacements;')()(instances),graph=new Function(source('frame-graph.mjs').replaceAll('export ','')+';return createFrameGraph;')()(scene,instances,wide);
const result={method:'Verified extracted r33 delivery members; exact sealed placement/clip/crop/batch/freeze/framegraph functions. GLTFLoader texture placeholders preserve normal-map presence; no image decoding, GPU, timing or network. Historical 24m replay substitutes only cell expression with pos/24.',visibleMeshes,eligibleMeshes,narrow24m:narrowStats,wide96m:{...wide.stats,tangentDerivatives:derived.size},frozen:frozen.stats,frameGraph:graph.stats,hashes};
graph.restore();frozen.restore();wide.restore();
// The frozen expected counts come only from the sealed implementation above.
// The independent Farm assembly and optimization below must agree with them.
const outer=new T.Scene(),farm=new T.Scene();outer.add(farm);
const placements=buildPlacements({models} as LoadedPack,manifest.layout);
while(placements.root.children.length)farm.add(placements.root.children[0]!);
placements.initializeClips();setCropShadows(placements.instances,false,false);
const forest=addWoodland(farm,models.get('faceted-tree').scene),optimized=optimizeFarmWorld(farm,placements.instances,forest,{packWoodland:true});
const farmGraph=createFrameGraph({scene:outer,worldRoot:farm,owners:optimized.owners,batches:optimized.batches,isFixed:optimized.isFixed});
optimized.stats.frameGraph={...farmGraph.stats};
const actual={...optimized.stats};
const golden={visibleMeshes:result.visibleMeshes,eligibleMeshes:result.eligibleMeshes,narrow24m:result.narrow24m,wide96m:result.wide96m,frozen:result.frozen,frameGraph:result.frameGraph};
const fixturePath=resolve('packages/farm/fixtures/optimization.json');
if(existsSync(fixturePath)){if(JSON.stringify(JSON.parse(readFileSync(fixturePath,'utf8')))!==JSON.stringify(golden))throw Error('Frozen optimization oracle changed');}
else if(process.env.ORACLE==='1')throw Error('Missing frozen optimization fixture');
else writeFileSync(fixturePath,JSON.stringify(golden,null,2)+'\n');
const equal=(a:unknown,b:unknown,label:string)=>assert.deepEqual(a,b,'Farm optimization differs: '+label);
equal(actual.batching,{...golden.wide96m,totalSourceMeshes:golden.visibleMeshes,eligibleSourceMeshes:golden.eligibleMeshes,tangentDerivatives:golden.wide96m.tangentDerivatives},'batching');
equal(actual.frozen,golden.frozen,'frozen');equal(actual.frameGraph?.hiddenRoots,golden.frameGraph.hiddenSourceRoots,'hidden roots');
equal(actual.woodland,{packed:true,groups:8,instances:3372,sourceMeshes:64,tangentDerivatives:1},'woodland');
const batchDerivatives=new Set(optimized.batches.batches.filter(b=>b.mesh.geometry!==b.sources[0]!.o.geometry).map(b=>b.mesh.geometry));
let batchGeometryDisposals=0;for(const geometry of batchDerivatives)geometry.addEventListener('dispose',()=>batchGeometryDisposals++);
farmGraph.restore();optimized.restore();optimized.restore();equal(batchGeometryDisposals,golden.wide96m.tangentDerivatives,'derivative release count');
equal(placements.instances.every(i=>i.object.visible&&i.object.matrixAutoUpdate&&i.object.matrixWorldAutoUpdate),true,'placement restoration');
forest.dispose();placements.dispose();
const output={...result,farm:actual,verification:'Port policies, grouping, freezing, frame-graph hiding, woodland packing and derivative disposal match the sealed r33 counts. Texture placeholders verify normalMap presence only; browser X-02/B-07 independently qualify rendered resources and pixels.'};
mkdirSync('evidence/m2/optimization',{recursive:true});writeFileSync('evidence/m2/optimization/source-counts.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
