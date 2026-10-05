import * as T from 'three/webgpu';
import {Fn,attribute,mat3,mat4,vec4,positionLocal,normalLocal,tangentLocal,transformNormal} from 'three/tsl';
import {createPoseBindings} from './runtime/landing-v10/src/pose-bindings.mjs';
import {createInstanceSelection} from './instance-selection.mjs';

// Attribute names/layout stay stable across parts. Each draw binds its own rigid
// matrices, while plain Mesh identity does not force an InstancedMesh pipeline.
const poseMatrix=mat4(...Array.from({length:4},(_,c)=>attribute('poseMatrix'+c,'vec4')));
class SharedPoseMaterial extends T.MeshStandardNodeMaterial{
 setupPosition(builder){
  positionLocal.assign(poseMatrix.mul(vec4(positionLocal,1)).xyz);
  if(builder.geometry.hasAttribute('normal'))normalLocal.assign(transformNormal(normalLocal,poseMatrix));
  if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(poseMatrix).mul(tangentLocal).normalize());
  return super.setupPosition(builder);
 }
}
const shadowPosition=Fn(builder=>{
 positionLocal.assign(poseMatrix.mul(vec4(attribute('position','vec3'),1)).xyz);
 if(builder.geometry.hasAttribute('normal'))normalLocal.assign(transformNormal(attribute('normal','vec3'),poseMatrix));
 return positionLocal;
})();

export function createSharedFramedPose(roots,frames){
 if(!Array.isArray(frames)||frames.length!==roots?.length||frames.some(m=>!m?.isMatrix4||!m.elements.every(Number.isFinite)))throw Error('Pose frame count/value mismatch');
 const {parts,actors}=createPoseBindings(roots);
 for(const {node}of parts){
  if(node.isSkinnedMesh||Object.keys(node.geometry.morphAttributes).length)throw Error('Only rigid pose parts supported');
  if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial)throw Error('Unsupported pose material');
 }
 const group=new T.Group(),selection=createInstanceSelection(roots.length),materials=new Map(),geometries=[],buffers=[],matrix=new T.Matrix4();let active=[],disposed=false;
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();}
 try{
  for(const {name,node}of parts){
   const geometry=new T.InstancedBufferGeometry().copy(node.geometry);geometries.push(geometry);geometry.instanceCount=0;
   const buffer=new T.InstancedInterleavedBuffer(new Float32Array(roots.length*16),16);for(let actor=0;actor<roots.length;actor++)matrix.toArray(buffer.array,actor*16);buffer.setUsage(T.DynamicDrawUsage);buffers.push(buffer);
   for(let c=0;c<4;c++)geometry.setAttribute('poseMatrix'+c,new T.InterleavedBufferAttribute(buffer,4,c*4));
   let material=materials.get(node.material);if(!material){material=new SharedPoseMaterial();materials.set(node.material,material);material.copy(node.material);material.castShadowPositionNode=shadowPosition;}
   const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);
  }
  function update(next,dirty){
   if(disposed)throw Error('Pose playback disposed');const {count,writes}=selection.update(next,dirty);active=[...next];
   for(let p=0;p<parts.length;p++){group.children[p].geometry.instanceCount=count;const buffer=buffers[p];for(const {slot,actor}of writes){matrix.multiplyMatrices(frames[actor],actors[actor][p].matrixWorld);buffer.array.set(matrix.elements,slot*16);buffer.addUpdateRange(slot*16,16);}if(writes.length)buffer.needsUpdate=true;}
   return writes.length;
  }
  function verifyBindings(){
   let maxMatrixError=0,worst=null;for(let p=0;p<parts.length;p++){if(group.children[p].geometry.instanceCount!==active.length)throw Error('Visible pose count mismatch');for(let slot=0;slot<active.length;slot++){const actor=active[slot];matrix.multiplyMatrices(frames[actor],actors[actor][p].matrixWorld);for(let j=0;j<16;j++){const actual=buffers[p].array[slot*16+j],error=Math.abs(actual-matrix.elements[j]);if(error>maxMatrixError){maxMatrixError=error;worst={actor,slot,part:parts[p].name,element:j,actual,expected:matrix.elements[j]};}}}}
   return {activeActors:active.length,partInstances:active.length*parts.length,maxMatrixError,worst};
  }
  return {group,update,verifyBindings,partCount:parts.length,dispose};
 }catch(error){dispose();throw error;}
}
