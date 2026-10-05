import * as T from 'three/webgpu';
import {Fn,attribute,texture,vec2,vec4,mat3,mat4,positionLocal,normalLocal,tangentLocal,transformNormal} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createPoseBindings} from './runtime/landing-v10/src/pose-bindings.mjs';
import {createInstanceSelection} from './instance-selection.mjs';

// Consumer derivative: original rigs remain the transform/contact owners. Only
// compatible opaque draw geometry is grouped; no authored mesh is rewritten.
export function createMergedFramedPose(roots,frames,{maxBytes=16*1024*1024}={}){
 if(!Array.isArray(frames)||frames.length!==roots?.length||frames.some(m=>!m?.isMatrix4||!m.elements.every(Number.isFinite)))throw Error('Pose frame count/value mismatch');
 const {parts,actors}=createPoseBindings(roots),width=parts.length*4,height=roots.length,bytes=width*height*16;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||bytes>maxBytes||width>4096||height>4096)throw Error('Pose atlas dimension/byte budget exceeded');
 for(const {node}of parts){
  if(node.isSkinnedMesh||Object.values(node.geometry.morphAttributes).some(a=>a.length))throw Error('Only rigid pose parts supported');
  if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial||node.material.isMeshPhysicalMaterial||node.material.transparent||node.material.opacity!==1||node.material.displacementMap)throw Error('Unsupported pose material');
  if(node.geometry.drawRange.start!==0||node.geometry.drawRange.count!==Infinity)throw Error('Partial draw geometry unsupported');
  if(!node.geometry.attributes.normal||Object.keys(node.geometry.attributes).some(n=>!['position','normal','uv','uv1','tangent'].includes(n)))throw Error('Unsupported pose vertex attributes');
 }
 const group=new T.Group(),selection=createInstanceSelection(roots.length),matrix=new T.Matrix4(),data=new Float32Array(bytes/4),atlas=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
 atlas.minFilter=atlas.magFilter=T.NearestFilter;atlas.generateMipmaps=false;atlas.colorSpace=T.NoColorSpace;atlas.needsUpdate=true;
 for(let i=0;i<parts.length*roots.length;i++)matrix.toArray(data,i*16);
 const part=attribute('posePart','float'),slot=attribute('poseSlot','float'),sample=c=>texture(atlas,vec2(part.mul(4).add(c+.5).div(width),slot.add(.5).div(height))).level(0),pose=mat4(sample(0),sample(1),sample(2),sample(3));
 class PoseMaterial extends T.MeshStandardNodeMaterial{
  setupPosition(builder){positionLocal.assign(pose.mul(vec4(positionLocal,1)).xyz);normalLocal.assign(transformNormal(normalLocal,pose));if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(pose).mul(tangentLocal).normalize());return super.setupPosition(builder);}
 }
 const shadowPosition=Fn(builder=>{positionLocal.assign(pose.mul(vec4(attribute('position','vec3'),1)).xyz);if(builder.geometry.hasAttribute('normal'))normalLocal.assign(transformNormal(attribute('normal','vec3'),pose));return positionLocal;})();
 const ownedGeometry=[],ownedMaterials=[],temporary=[],slotAttribute=new T.InstancedBufferAttribute(Float32Array.from({length:roots.length},(_,i)=>i),1);let active=[],disposed=false;
 function dispose(){if(disposed)return;disposed=true;atlas.dispose();for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();for(const g of temporary)g.dispose();temporary.length=0;}
 try{
  const groups=new Map();
  for(const [index,{node}]of parts.entries()){
   const g=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();temporary.push(g);g.clearGroups();g.setAttribute('posePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(index),1));
   // Incompatible layouts stay in separate batches even when material is shared.
   const layout=Object.keys(g.attributes).sort().map(n=>{const a=g.attributes[n];return [n,a.itemSize,a.normalized,a.array.constructor.name].join(':');}).join('/');
   let byLayout=groups.get(node.material);if(!byLayout)groups.set(node.material,byLayout=new Map());if(!byLayout.has(layout))byLayout.set(layout,[]);byLayout.get(layout).push(g);
  }
  for(const [source,layouts]of groups)for(const geometries of layouts.values()){
   const merged=mergeGeometries(geometries,false);if(!merged)throw Error('Pose geometry merge failed');
   const geometry=new T.InstancedBufferGeometry().copy(merged);merged.dispose();ownedGeometry.push(geometry);geometry.instanceCount=0;geometry.setAttribute('poseSlot',slotAttribute);
   const material=new PoseMaterial().copy(source);ownedMaterials.push(material);material.castShadowPositionNode=shadowPosition;
   const mesh=new T.Mesh(geometry,material);mesh.name='rigid-pose-material-batch';mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);
  }
  for(const g of temporary)g.dispose();temporary.length=0;
  function update(next,dirty){
   if(disposed)throw Error('Pose playback disposed');const {count,writes}=selection.update(next,dirty);active=[...next];for(const mesh of group.children)mesh.geometry.instanceCount=count;
   for(const {slot,actor}of writes)for(let p=0;p<parts.length;p++){matrix.multiplyMatrices(frames[actor],actors[actor][p].matrixWorld);matrix.toArray(data,(slot*parts.length+p)*16);}
   if(writes.length)atlas.needsUpdate=true;return writes.length;
  }
  function verifyBindings(){
   let maxMatrixError=0,worst=null;for(const mesh of group.children)if(mesh.geometry.instanceCount!==active.length)throw Error('Visible pose count mismatch');
   for(const [slot,actor]of active.entries())for(let p=0;p<parts.length;p++){matrix.multiplyMatrices(frames[actor],actors[actor][p].matrixWorld);for(let j=0;j<16;j++){const actual=data[(slot*parts.length+p)*16+j],error=Math.abs(actual-matrix.elements[j]);if(error>maxMatrixError){maxMatrixError=error;worst={actor,slot,part:parts[p].name,element:j,actual,expected:matrix.elements[j]};}}}
   return {activeActors:active.length,partInstances:active.length*parts.length,maxMatrixError,worst};
  }
  return {group,atlas,update,verifyBindings,partCount:parts.length,drawBatches:group.children.length,atlasBytes:bytes,dispose};
 }catch(error){dispose();throw error;}
}
