import * as T from 'three/webgpu';
import {Fn,attribute,texture,uniform,vec2,vec3,mat3,positionLocal,normalLocal,tangentLocal,cross,dot,mix,select,acos,sin,instancedMesh} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {prepareRigidGeometry} from '../landing-v10/src/rigid-geometry.mjs';
import {validateBakePayload} from '../landing-v10/src/bake-intake.mjs';
import {createActorTransformState} from '../landing-v10/src/actor-transforms.mjs';
import {createClipPoseState} from '../landing-v10/src/rigid-clip-bank.mjs';
export function createRigidPlayback(root,manifest,bytes,actors,{poseState=null,texturePool=null}={}){
 validateBakePayload(manifest,bytes.byteLength);const actorState=createActorTransformState(actors);actors=actorState.actors;
 if(poseState&&JSON.stringify(poseState.ids)!==JSON.stringify(actors.map(a=>a.id)))throw Error('Pose actor identity mismatch');
 const frameAttribute=poseState?new T.InstancedBufferAttribute(poseState.frames,1).setUsage(T.DynamicDrawUsage):null;
 const originAttribute=poseState?new T.InstancedBufferAttribute(poseState.origins,3).setUsage(T.DynamicDrawUsage):null;
 const textureLease=texturePool?.acquire(manifest,bytes);
 const data=manifest.texture.format==='RGBA16F'?new Uint16Array(bytes):new Float32Array(bytes);
 const tex=textureLease?.resource??new T.DataTexture(data,manifest.texture.width,manifest.texture.height,T.RGBAFormat,manifest.texture.format==='RGBA16F'?T.HalfFloatType:T.FloatType);
 if(!textureLease){tex.minFilter=tex.magFilter=T.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;}
 const time=uniform(0),loop=uniform(0),part=attribute('bakePart','float'),phase=attribute('bakePhase','float');
 const tick=time.add(phase),seconds=mix(tick.clamp(0,manifest.duration),tick.mod(manifest.duration),loop);
 const frame=poseState?attribute('bakeFrame','float'):seconds.div(manifest.duration).mul(manifest.frameCount-1),lo=frame.floor(),hi=lo.add(1).min(manifest.frameCount-1),alpha=frame.fract();
 const sample=(offset,f)=>texture(tex,vec2(part.mul(3).add(offset+.5).div(manifest.texture.width),f.add(.5).div(manifest.frameCount))).level(0);
 const tr=mix(sample(0,lo).xyz,sample(0,hi).xyz,alpha).add(poseState?attribute('bakeOrigin','vec3'):vec3(...(manifest.origin??[0,0,0]))),scale=mix(sample(2,lo).xyz,sample(2,hi).xyz,alpha);
 const qa=sample(1,lo).normalize(),qb0=sample(1,hi).normalize(),qb=select(dot(qa,qb0).lessThan(0),qb0.negate(),qb0);
 const cos=dot(qa,qb).clamp(-1,1),theta=acos(cos),denom=sin(theta).max(.00001);
 const q=select(cos.greaterThan(.9995),mix(qa,qb,alpha),qa.mul(sin(theta.mul(alpha.oneMinus()))).add(qb.mul(sin(theta.mul(alpha)))).div(denom)).normalize();
 const rotate=v=>v.add(cross(q.xyz,cross(q.xyz,v).add(v.mul(q.w))).mul(2));
 const position=v=>rotate(v.mul(scale)).add(tr);
 class RigidMaterial extends T.MeshStandardNodeMaterial{
  setupPosition(builder){
   positionLocal.assign(position(positionLocal));
   normalLocal.assign(rotate(normalLocal.div(scale)).normalize());
   // Three's instance path transforms normals but not tangentLocal. Include
   // the actor's linear transform here so tangent-space normal maps rotate too.
   if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(attribute('actorColumn0','vec3'),attribute('actorColumn1','vec3'),attribute('actorColumn2','vec3')).mul(rotate(tangentLocal.mul(scale))).normalize());
   return super.setupPosition(builder);
  }
 }
 const group=new T.Group();
const actorData=new T.InstancedInterleavedBuffer(new Float32Array(actors.flatMap(a=>[...a.matrix.elements.slice(0,3),...a.matrix.elements.slice(4,7),...a.matrix.elements.slice(8,11),a.phase||0])),10);
 actorData.setUsage(T.DynamicDrawUsage);
 for(const {geometry,material:source} of prepareRigidGeometry(T,mergeGeometries,root,manifest)){

  for(let column=0;column<3;column++)geometry.setAttribute(`actorColumn${column}`,new T.InterleavedBufferAttribute(actorData,3,column*3));
  geometry.setAttribute('bakePhase',new T.InterleavedBufferAttribute(actorData,1,9));
  if(frameAttribute){geometry.setAttribute('bakeFrame',frameAttribute);geometry.setAttribute('bakeOrigin',originAttribute);}
  const material=new RigidMaterial().copy(source);
  // Shadow override materials do not inherit setupPosition. Reconstruct from raw
  // geometry, then apply actor instancing exactly once, in the shadow vertex pass.
  material.castShadowPositionNode=Fn(builder=>{positionLocal.assign(position(attribute('position','vec3')));instancedMesh(builder.object);return positionLocal;})();
  const mesh=new T.InstancedMesh(geometry,material,actors.length);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  actors.forEach((a,i)=>mesh.setMatrixAt(i,a.matrix));mesh.instanceMatrix.needsUpdate=true;
  // Sampled bake bounds aren't certified swept bounds. Disable culling in this lab.
  mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 const updateActorTransforms=patches=>{const changed=actorState.update(patches);for(const i of changed){const e=actors[i].matrix.elements;actorData.array.set([...e.slice(0,3),...e.slice(4,7),...e.slice(8,11)],i*10);actorData.addUpdateRange(i*10,9);for(const mesh of group.children){mesh.setMatrixAt(i,actors[i].matrix);mesh.instanceMatrix.addUpdateRange(i*16,16);}}if(changed.length){actorData.needsUpdate=true;for(const mesh of group.children)mesh.instanceMatrix.needsUpdate=true;}return changed.length;};
 const updateActorPoses=patches=>{if(!poseState)throw Error('Per-actor clips require a clip bank');const changed=poseState.update(patches);for(const i of changed){frameAttribute.addUpdateRange(i,1);originAttribute.addUpdateRange(i*3,3);}if(changed.length){frameAttribute.needsUpdate=true;originAttribute.needsUpdate=true;}return changed.length;};
 return {group,time,loop,texture:tex,updateActorTransforms,updateActorPoses,poses:()=>poseState?.snapshot(),dispose(){if(textureLease)textureLease.release();else tex.dispose();group.children.forEach(m=>{m.geometry.dispose();m.material.dispose();m.dispose();});}};
}
export function createRigidClipPlayback(root,bank,actors,options={}){return createRigidPlayback(root,bank.manifest,bank.bytes,actors,{...options,poseState:createClipPoseState(bank,actors)});}
