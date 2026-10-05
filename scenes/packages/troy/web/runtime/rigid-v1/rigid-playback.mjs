import * as T from 'three/webgpu';
import {Fn,attribute,texture,uniform,vec2,mat3,positionLocal,normalLocal,tangentLocal,cross,dot,mix,select,acos,sin,instancedMesh} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {prepareRigidGeometry} from './rigid-geometry.mjs';
import {validateBakePayload,validateActors} from './bake-intake.mjs';
export function createRigidPlayback(root,manifest,bytes,actors){
 validateBakePayload(manifest,bytes.byteLength);validateActors(actors);
 const data=manifest.texture.format==='RGBA16F'?new Uint16Array(bytes):new Float32Array(bytes);
 const tex=new T.DataTexture(data,manifest.texture.width,manifest.texture.height,T.RGBAFormat,manifest.texture.format==='RGBA16F'?T.HalfFloatType:T.FloatType);
 tex.minFilter=tex.magFilter=T.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;
 const time=uniform(0),loop=uniform(0),part=attribute('bakePart','float'),phase=attribute('bakePhase','float');
 const tick=time.add(phase),seconds=mix(tick.clamp(0,manifest.duration),tick.mod(manifest.duration),loop);
 const frame=seconds.div(manifest.duration).mul(manifest.frameCount-1),lo=frame.floor(),hi=lo.add(1).min(manifest.frameCount-1),alpha=frame.fract();
 const sample=(offset,f)=>texture(tex,vec2(part.mul(3).add(offset+.5).div(manifest.texture.width),f.add(.5).div(manifest.frameCount))).level(0);
 const tr=mix(sample(0,lo).xyz,sample(0,hi).xyz,alpha),scale=mix(sample(2,lo).xyz,sample(2,hi).xyz,alpha);
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
 for(const {geometry,material:source} of prepareRigidGeometry(T,mergeGeometries,root,manifest)){
  const actorData=new T.InstancedInterleavedBuffer(new Float32Array(actors.flatMap(a=>[...a.matrix.elements.slice(0,3),...a.matrix.elements.slice(4,7),...a.matrix.elements.slice(8,11),a.phase||0])),10);
  for(let column=0;column<3;column++)geometry.setAttribute(`actorColumn${column}`,new T.InterleavedBufferAttribute(actorData,3,column*3));
  geometry.setAttribute('bakePhase',new T.InterleavedBufferAttribute(actorData,1,9));
  const material=new RigidMaterial().copy(source);
  // Shadow override materials do not inherit setupPosition. Reconstruct from raw
  // geometry, then apply actor instancing exactly once, in the shadow vertex pass.
  material.castShadowPositionNode=Fn(builder=>{positionLocal.assign(position(attribute('position','vec3')));instancedMesh(builder.object);return positionLocal;})();
  const mesh=new T.InstancedMesh(geometry,material,actors.length);
  actors.forEach((a,i)=>mesh.setMatrixAt(i,a.matrix));mesh.instanceMatrix.needsUpdate=true;
  // Sampled bake bounds aren't certified swept bounds. Disable culling in this lab.
  mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 return {group,time,loop,texture:tex,dispose(){tex.dispose();group.children.forEach(m=>{m.geometry.dispose();m.material.dispose();m.dispose();});}};
}
