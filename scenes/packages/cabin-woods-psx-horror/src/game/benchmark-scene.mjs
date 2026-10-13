/** Benchmark-only metadata and closed paused scene presets. No renderer or asset mutation. */
const cache=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
const array=value=>value?.toArray?.()??null;
const triangleCount=geometry=>(geometry?.index?.count??geometry?.attributes?.position?.count??0)/3;
function materialDescription(material){
 const textures={};for(const slot of ['map','alphaMap','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','bumpMap','displacementMap','lightMap','envMap']){const t=material[slot];if(!t?.isTexture)continue;textures[slot]={textureId:t.uuid,colorSpace:t.colorSpace,magFilter:t.magFilter,minFilter:t.minFilter,wrapS:t.wrapS,wrapT:t.wrapT,flipY:t.flipY,generateMipmaps:t.generateMipmaps,anisotropy:t.anisotropy,repeat:array(t.repeat),offset:array(t.offset),rotation:t.rotation};}
 return{type:material.type,alphaMode:material.transparent?'BLEND':material.alphaTest>0?'MASK':'OPAQUE',alphaTest:material.alphaTest??0,transparent:!!material.transparent,side:material.side??0,depthWrite:material.depthWrite!==false,depthTest:material.depthTest!==false,colorWrite:material.colorWrite!==false,blending:material.blending,opacity:material.opacity,alphaToCoverage:!!material.alphaToCoverage,premultipliedAlpha:!!material.premultipliedAlpha,roughness:material.roughness,metalness:material.metalness,color:array(material.color),emissive:array(material.emissive),emissiveIntensity:material.emissiveIntensity,nodeMaterial:!!material.isNodeMaterial,textures};
}
/** Call after initial update/lazy pickup spawning and after the selected preset.
 * Collections/instance identities are immutable; appending lazy instances refreshes
 * the cache. Visibility/material values are labelled at-build snapshots, not live
 * GPU/frustum evidence. Serialize this cached object once, outside per-frame work.
 */
export function buildBenchmarkInventory(models,collection){
 if(!Array.isArray(models.instances)||!collection.manifest?.assets)throw new TypeError('Benchmark inventory requires models and selected collection');
 const saved=cache.get(models);if(saved&&saved.instances===models.instances&&saved.count===models.instances.length&&saved.collection===collection)return saved.inventory;
 const roots=new Set(models.instances.map(i=>i.root)),families=new Map();
 function family(key){let f=families.get(key);if(f)return f;const pin=collection.manifest.assets[key];if(!pin)throw new TypeError('Unselected instantiated asset '+key);f={assetKey:key,pin:{assetId:pin.assetId,revisionId:pin.revisionId,sha256:pin.sha256},placements:[],rootVisibleAtBuild:[],sourceMeshCount:0,derivativeMeshCount:0,skinnedMeshCount:0,morphMeshCount:0,sourceTrianglesAcrossPlacements:0,renderCandidateMeshesAtBuild:0,frustumCulledMeshes:0,doubleSidedMeshes:0,transparentMeshes:0,maskedMeshes:0,sourceGeometryCount:0,sourceMaterialObjectCount:0,materialVariants:[],batchMeshCount:0,batchInstanceCount:0,batches:[],clips:[],geometryIds:new Set(),materialObjects:new Set(),variants:new Map(),clipNames:new Set()};families.set(key,f);return f;}
 function variant(f,material){const d=materialDescription(material),key=JSON.stringify(d);let id=f.variants.get(key);if(id===undefined){id=f.materialVariants.length;f.variants.set(key,id);f.materialVariants.push({id,...d});}return id;}
 for(const instance of models.instances){const key=instance.assetKey??instance.root.userData?.assetKey;if(!key)throw new TypeError('Instantiated asset key required');const f=family(key),root=instance.root,source=instance.sourceRoot??root;f.placements.push(root.name);if(visible(root))f.rootVisibleAtBuild.push(root.name);for(const clip of instance.animations??[])f.clipNames.add(clip.name);
  function visit(node){if(node!==source&&roots.has(node))return;if(node.isMesh&&node.geometry){const derivative=!!node.userData?.sceneOptimization||/^SceneMerged_/.test(node.name);if(derivative)f.derivativeMeshCount++;else{f.sourceMeshCount++;f.sourceTrianglesAcrossPlacements+=triangleCount(node.geometry);f.geometryIds.add(node.geometry.uuid);if(node.isSkinnedMesh)f.skinnedMeshCount++;if(Object.keys(node.geometry.morphAttributes??{}).length)f.morphMeshCount++;}if(visible(node)&&node.layers.mask!==0)f.renderCandidateMeshesAtBuild++;if(node.frustumCulled)f.frustumCulledMeshes++;for(const m of Array.isArray(node.material)?node.material:[node.material]){if(!m)continue;variant(f,m);if(!derivative)f.materialObjects.add(m);if(m.side===2)f.doubleSidedMeshes++;if(m.transparent)f.transparentMeshes++;if(m.alphaTest>0)f.maskedMeshes++;}}for(const child of node.children??[])visit(child);}
  visit(source);
 }
 for(const merge of models.merges??[]){if(!merge.group)continue;merge.group.traverse(node=>{if(!node.isInstancedMesh||!node.userData?.assetKey)return;const f=family(node.userData.assetKey),data=node.userData.sceneOptimization??{};f.batchMeshCount++;f.batchInstanceCount+=node.count;f.batches.push({mesh:node.name,geometryId:node.geometry.uuid,materialVariantId:variant(f,node.material),activeInstanceCountAtBuild:node.count,memberRootCount:data.roots?.length??node.count,cellSize:data.cellSize??null,cellOrigin:array(node.position),trianglesPerInstance:triangleCount(node.geometry),frustumCulled:node.frustumCulled,alphaMode:node.material.transparent?'BLEND':node.material.alphaTest>0?'MASK':'OPAQUE',side:node.material.side});});}
 const rows=[...families.values()].sort((a,b)=>a.assetKey.localeCompare(b.assetKey)).map(f=>{f.sourceGeometryCount=f.geometryIds.size;f.sourceMaterialObjectCount=f.materialObjects.size;f.materialVariantCount=f.materialVariants.length;f.clips=[...f.clipNames].sort();delete f.geometryIds;delete f.materialObjects;delete f.variants;delete f.clipNames;return f;});
 const inventory=freeze({schemaVersion:1,scope:'Structural inventory only; render candidates are not actual visible submissions. Root/material snapshots at build, cached until new instances append.',manifestSha256:collection.manifestSha256??null,selectedFamilyCount:Object.keys(collection.manifest.assets).length,instantiatedFamilyCount:rows.length,placementCount:models.instances.length,packOnlyKeys:Object.keys(collection.manifest.assets).filter(key=>!families.has(key)).sort(),families:rows});cache.set(models,{instances:models.instances,count:models.instances.length,collection,inventory});return inventory;
}
/** Only a fresh paused benchmark state should be passed. Disabled is an exact noop.
 * Returned playerPitch is applied by the host after viewpoint selection; this
 * helper never reaches controls, DOM, assets, matrices or renderer globals.
 */
export function applyBenchmarkPreset(state,preset,{enabled=false}={}){
 if(enabled!==true)return{applied:false};if(!['axeFlash','shotgunFlash','lookDown','stump','fullStock'].includes(preset))throw new TypeError('Unknown benchmark preset '+preset);
 if(!state||typeof state!=='object')throw new TypeError('Benchmark state required');
 if(preset==='stump'){const tree=state.trees?.find(t=>t.id==='pine-harvest-1');if(!tree)throw new TypeError('Benchmark stump requires pine-harvest-1');tree.felled=true;return{applied:true,preset,focusTreeId:tree.id};}
 if(preset==='fullStock'){if(!state.storage)throw new TypeError('Benchmark fullStock requires storage');state.storage.logs=18;state.storage.firewood=0;state.storage.planks=9;return{applied:true,preset};}
 state.weapon=preset==='shotgunFlash'?'shotgun':'axe';state.flashlight=true;return{applied:true,preset,...(preset==='lookDown'?{playerPitch:-1.15}:{})};
}
/** Closed additional review views, shown only by the benchmark host. Feet origin. */
export const BENCHMARK_REVIEW_VIEWS=freeze({
 batteryCache:{label:'Benchmark battery cache',position:[17,0,-3],target:[17,.25,-4.5]},
 woodCache:{label:'Benchmark wood bundle cache',position:[14.2,0,1.45],target:[15.7,.2,1.45]},
 clock:{label:'Benchmark wall clock',position:[-3.45,0,-1.1],target:[-4.8,1.95,-1.1]},
 toolRack:{label:'Benchmark tool room rack',position:[.5,0,3.85],target:[-.88,1.55,3.85]}
});
