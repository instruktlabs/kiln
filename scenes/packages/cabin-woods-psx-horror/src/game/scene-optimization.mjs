import*as THREE from'three/webgpu';
import{mergeGeometries}from'three/addons/utils/BufferGeometryUtils.js';
const identity=new WeakMap();let nextIdentity=0;const id=o=>{if(!identity.has(o))identity.set(o,++nextIdentity);return identity.get(o);};
const effectiveVisible=n=>{for(let p=n;p;p=p.parent)if(!p.visible)return false;return true;};
const cellSizeOf=o=>{const n=o.cellSize??4;if(!Number.isFinite(n)||n<=0)throw new TypeError('cellSize must be finite and positive');return n;};
const stateKey=n=>[n.layers.mask,n.renderOrder,n.castShadow,n.receiveShadow,n.frustumCulled].join('/');
// Interleaved attributes omit gpuType; their effective default is FloatType,
// just like ordinary BufferAttribute. Storage packing is not a render-state split.
function layoutKey(g){return Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k];return[k,a.itemSize,a.normalized,a.isInterleavedBufferAttribute?a.data.array.constructor.name:a.array.constructor.name,a.gpuType??THREE.FloatType].join('/');}).join('|');}
function relativeMatrix(node,root){const chain=[];for(let n=node;n&&n!==root;n=n.parent)chain.push(n);const matrix=new THREE.Matrix4();for(let i=chain.length-1;i>=0;i--)matrix.multiply(chain[i].matrix);return matrix;}
function eligible(n){if(!n.isMesh||n.isSkinnedMesh||n.isInstancedMesh||n.isBatchedMesh||n.userData?.sceneOptimization||!effectiveVisible(n)||!n.layers.mask||Array.isArray(n.material)||!n.material||!n.material.visible||n.material.transparent||n.material.isNodeMaterial||n.material.transmission>0)return false;const g=n.geometry;if(!g?.attributes.position||Object.keys(g.morphAttributes??{}).length||g.drawRange.start!==0||g.drawRange.count!==Infinity||Object.values(g.attributes).some(a=>a.isInstancedBufferAttribute)||n.matrixWorld.determinant()<=0)return false;if(n.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||n.onAfterRender!==THREE.Object3D.prototype.onAfterRender||n.material.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)return false;return true;}
function boundary(n){return n.isBone||/^(Joint_|Scene_)/.test(n.name)||!!(n.userData?.interaction||n.userData?.dynamic||n.userData?.visibilityBoundary||n.userData?.lod||n.userData?.role);}
function protectedNodes(root,options){const set=new Set([root]);for(const value of options.preserveNodes??[]){const n=typeof value==='string'?root.getObjectByName(value):value;if(n)set.add(n);}root.traverse(n=>{if(boundary(n))set.add(n);});for(const clip of options.animations??[])for(const track of clip.tracks){const name=THREE.PropertyBinding.parseTrackName(track.name).nodeName;if(name){const n=root.getObjectByName(name);if(n)set.add(n);}}return set;}
function prepare(bucket){const parts=[];try{for(const n of bucket.nodes){const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone();g.applyMatrix4(relativeMatrix(n,bucket.anchor));parts.push(g);}const merged=mergeGeometries(parts,false);if(!merged)return null;merged.computeBoundingBox();merged.computeBoundingSphere();return merged;}finally{for(const g of parts)g.dispose();}}
/** Explicit per-asset opt-in. Source frame graph/geometry/material are retained.
 * Preserve every runtime-controlled mesh via preserveNodes; changing a merged local
 * part independently requires disabling/rebuilding. Animation target groups become
 * independent anchors. BLEND, skin/morph, mirrors and shader deformation stay source.
 */
export function optimizeStaticAsset(root,options={}){
 const cellSize=cellSizeOf(options),meshes=[],snapshots=[],stats={before:0,after:0,skipped:0},anchors=protectedNodes(root,options);let enabled=false,disposed=false;if(options.enabled!==true)return{...stats,stats,meshes,setEnabled(){},dispose(){}};
 root.updateWorldMatrix(true,true);const buckets=new Map();root.traverse(n=>{if(!eligible(n)||anchors.has(n)){if(n.isMesh)stats.skipped++;return;}let anchor=n.parent;while(anchor&&!anchors.has(anchor))anchor=anchor.parent;anchor??=root;const matrix=relativeMatrix(n,anchor);if(matrix.determinant()<=0){stats.skipped++;return;}const p=new THREE.Vector3().setFromMatrixPosition(matrix),cell=[p.x,p.y,p.z].map(v=>Math.floor((v+cellSize/2)/cellSize)).join('/'),key=[id(anchor),id(n.material),stateKey(n),layoutKey(n.geometry),cell].join(':');let b=buckets.get(key);if(!b){b={anchor,material:n.material,nodes:[]};buckets.set(key,b);}b.nodes.push(n);});
 const ready=[];try{for(const b of buckets.values()){stats.before+=b.nodes.length;if(b.nodes.length<2){stats.after+=b.nodes.length;continue;}const geometry=prepare(b);if(!geometry){stats.after+=b.nodes.length;continue;}const first=b.nodes[0],mesh=new THREE.Mesh(geometry,b.material);mesh.name='SceneOptimized_'+ready.length;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.frustumCulled=first.frustumCulled;mesh.userData.sceneOptimization={kind:'static-asset',sources:b.nodes.map(n=>n.name),anchor:b.anchor.name};ready.push({mesh,b,mask:mesh.layers.mask});stats.after++;}}catch(e){for(const r of ready)r.mesh.geometry.dispose();throw e;}
 for(const r of ready){r.b.anchor.add(r.mesh);meshes.push(r.mesh);for(const node of r.b.nodes)snapshots.push({node,mask:node.layers.mask});}
 function setEnabled(value){if(disposed)return;enabled=!!value;for(const s of snapshots)s.node.layers.mask=enabled?0:s.mask;for(const r of ready)r.mesh.layers.mask=enabled?r.mask:0;}
 setEnabled(true);return{before:stats.before,after:stats.after,stats,meshes,get enabled(){return enabled;},setEnabled,dispose(){if(disposed)return;setEnabled(false);disposed=true;for(const r of ready){r.mesh.removeFromParent();r.mesh.geometry.dispose();}}};
}
function materialKey(m){function key(v){if(v===null||v===undefined||typeof v==='number'||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='function')return'function:'+id(v);if(v.isTexture||v.isNode)return'reference:'+id(v);if(Array.isArray(v))return v.map(key);if(v.toArray)return[v.constructor.name,...v.toArray()];if(Object.getPrototypeOf(v)===Object.prototype){const out={};for(const k of Object.keys(v).sort())out[k]=key(v[k]);return out;}return'reference:'+id(v);}const result={};for(const k of Object.keys(m).sort()){if(['uuid','id','version','_listeners'].includes(k))continue;result[k]=key(m[k]);}return JSON.stringify(result);}
/** Noninteractive static background only, before the legacy per-instance merge.
 * Each exact geometry/local-transform/material-state template gets ordinary
 * InstancedMesh batches by12m XZ cell or family-frustum compaction. No canonical changes.
 * Whole-root/ancestor visibility is synchronized; local children/materials are
 * immutable for this opt-in static representation. Cells call sync after discrete
 * root visibility changes; family-frustum calls cull(camera) after camera/world
 * matrices, before rendering. It tests cached conservative instance boxes, and
 * only uploads when the ordered visible set changes. It does not infer occlusion.
 */
export function batchStaticVegetation(instances,options={}){
 const strategy=options.strategy??'cells';if(!['cells','family-frustum'].includes(strategy))throw new TypeError('Unknown vegetation strategy');
 const familyCulling=strategy==='family-frustum',cellSize=cellSizeOf({...options,cellSize:options.cellSize??12});
 const meshes=[],templates=new Map(),batches=new Map(),snapshots=[],compactInstances=[],stats={before:0,after:0,acceptedInstances:0,skippedInstances:0,strategy};
 const allowed=new Set(options.allowedKeys??['pine','birch','bush','rock']),materialKeys=new WeakMap(),equivalentKeys=new Map();
 const getMaterialKey=m=>{if(!materialKeys.has(m)){const descriptor=materialKey(m);if(!equivalentKeys.has(descriptor))equivalentKeys.set(descriptor,equivalentKeys.size);materialKeys.set(m,equivalentKeys.get(descriptor));}return materialKeys.get(m);};
 const parent=options.parent??instances[0]?.root.parent,group=new THREE.Group();group.name='SceneOptimized_Vegetation';group.userData.sceneOptimization={kind:familyCulling?'vegetation-family-frustum':'vegetation-cells',cellSize:familyCulling?null:cellSize};
 let enabled=false,disposed=false,hasCamera=false;const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),previousParent=new THREE.Matrix4();
 const empty=()=>({stats,meshes,group,sync(){},cull(){},setEnabled(){},dispose(){}});if(options.enabled!==true||!parent)return empty();
 parent.updateWorldMatrix(true,true);previousParent.copy(parent.matrixWorld);const inverseParent=parent.matrixWorld.clone().invert();
 try{for(const instance of instances){
  const root=instance.root,source=instance.sourceRoot??root,compact=source!==root,key=instance.entry?.key??instance.assetKey,reject=()=>{instance.materialize?.();stats.skippedInstances++;};
  if(!allowed.has(key)||instance.animations?.length||!root.parent||root.matrixWorld.determinant()<=0||(options.allowInstance&&!options.allowInstance(instance))){reject();continue;}source.updateWorldMatrix(true,true);
  let hasInteraction=false;for(let n=root;n&&n!==parent;n=n.parent)if(n.userData?.interaction||n.userData?.dynamic)hasInteraction=true;
  const nodes=[];source.traverse(n=>{if(n.userData?.interaction||n.userData?.dynamic||n.isSkinnedMesh||n.isBone||Object.keys(n.geometry?.morphAttributes??{}).length)hasInteraction=true;if(eligible(n)&&!boundary(n))nodes.push(n);});
  let partial=false;if(compact){const accepted=new Set(nodes);source.traverse(n=>{if(n.isLight||n.isCamera||(n.isMesh&&effectiveVisible(n)&&n.layers.mask&&!accepted.has(n)))partial=true;});}
  if(hasInteraction||!nodes.length||partial){reject();continue;}
  const rootMatrix=inverseParent.clone().multiply(root.matrixWorld);if(rootMatrix.determinant()<=0){reject();continue;}
  const layout=nodes.map(n=>[id(n.geometry),relativeMatrix(n,source).elements,getMaterialKey(n.material),stateKey(n),layoutKey(n.geometry)]),signature=JSON.stringify([key,instance.entry?.sha256??null,layout]);
  let template=templates.get(signature);
  if(!template){
   const buckets=new Map();for(const n of nodes){const k=[getMaterialKey(n.material),stateKey(n),layoutKey(n.geometry)].join(':');let b=buckets.get(k);if(!b){b={anchor:source,material:n.material,nodes:[]};buckets.set(k,b);}b.nodes.push(n);}
   template=[];templates.set(signature,template);
   for(const b of buckets.values()){const geometry=prepare(b);if(!geometry)throw Error('Vegetation geometry layouts could not merge');template.push({geometry,material:b.material,state:compact?{castShadow:false,receiveShadow:true,layers:b.nodes[0].layers,renderOrder:b.nodes[0].renderOrder,frustumCulled:b.nodes[0].frustumCulled}:b.nodes[0]});}
  }
  const pos=new THREE.Vector3().setFromMatrixPosition(rootMatrix),cell=familyCulling?[0,0]:[Math.floor(pos.x/cellSize),Math.floor(pos.z/cellSize)],origin=new THREE.Vector3(cell[0]*cellSize,0,cell[1]*cellSize);
  for(let i=0;i<template.length;i++){
   const bKey=signature+':'+i+':'+cell.join('/');let b=batches.get(bKey);
   if(!b){b={template:template[i],assetKey:key,origin,entries:[],mesh:null,active:null,nextActive:[]};batches.set(bKey,b);}
   const local=new THREE.Matrix4().makeTranslation(-origin.x,0,-origin.z).multiply(rootMatrix);
   const parentBox=template[i].geometry.boundingBox.clone().applyMatrix4(rootMatrix),worldBox=parentBox.clone().applyMatrix4(parent.matrixWorld);
   b.entries.push({root,matrix:local,parentBox,worldBox});
  }
  if(compact)compactInstances.push(instance);else for(const node of nodes)snapshots.push({node,mask:node.layers.mask});stats.before+=nodes.length;stats.acceptedInstances++;
 }}catch(error){for(const t of templates.values())for(const p of t)p.geometry.dispose();throw error;}
 for(const b of batches.values()){
  const p=b.template,n=new THREE.InstancedMesh(p.geometry,p.material,b.entries.length);n.name='SceneVegetation_'+meshes.length;n.position.copy(b.origin);
  n.castShadow=p.state.castShadow;n.receiveShadow=p.state.receiveShadow;n.layers.mask=p.state.layers.mask;n.renderOrder=p.state.renderOrder;n.frustumCulled=p.state.frustumCulled;
  n.userData.assetKey=b.assetKey;n.userData.sceneOptimization={kind:familyCulling?'vegetation-family-frustum':'vegetation-cell',roots:b.entries.map(e=>e.root.name),cellSize:familyCulling?null:cellSize};
  b.mesh=n;group.add(n);meshes.push(n);
 }parent.add(group);
 function sync(){
  if(disposed||!enabled)return;
  for(const b of batches.values()){
   const active=b.nextActive;active.length=0;
   for(const entry of b.entries)if(effectiveVisible(entry.root)&&(!familyCulling||!hasCamera||!b.template.state.frustumCulled||frustum.intersectsBox(entry.worldBox)))active.push(entry);
   const changed=!b.active||active.length!==b.active.length||active.some((entry,index)=>entry!==b.active[index]);
   if(changed){
    for(let i=0;i<active.length;i++)b.mesh.setMatrixAt(i,active[i].matrix);
    b.mesh.count=active.length;b.mesh.visible=active.length>0;b.mesh.instanceMatrix.needsUpdate=true;b.mesh.computeBoundingBox();b.mesh.computeBoundingSphere();
    b.nextActive=b.active??[];b.active=active;
   }
  }stats.after=meshes.filter(n=>n.visible&&n.count>0).length;
 }
 function cull(camera){
  if(!familyCulling||disposed||!enabled)return;if(!camera?.isCamera)throw new TypeError('A camera is required for family frustum culling');
  camera.updateWorldMatrix(true,false);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  hasCamera=projection.elements.every(Number.isFinite)&&projection.determinant()!==0;
  if(hasCamera)frustum.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth===true);
  parent.updateWorldMatrix(true,false);
  if(!parent.matrixWorld.equals(previousParent)){for(const b of batches.values())for(const entry of b.entries)entry.worldBox.copy(entry.parentBox).applyMatrix4(parent.matrixWorld);previousParent.copy(parent.matrixWorld);}
  sync();
 }
 function setEnabled(value){if(disposed)return;enabled=!!value;for(const s of snapshots)s.node.layers.mask=enabled?0:s.mask;for(const instance of compactInstances)if(enabled)instance.releaseSource();else instance.materialize();group.visible=enabled;if(enabled)sync();}
 setEnabled(true);return{stats,meshes,group,get enabled(){return enabled;},sync,cull,setEnabled,dispose(){if(disposed)return;for(const s of snapshots)s.node.layers.mask=s.mask;for(const instance of compactInstances)instance.releaseSource();disposed=true;group.removeFromParent();for(const n of meshes)n.dispose();for(const t of templates.values())for(const p of t)p.geometry.dispose();}};
}
