import * as T from 'three/webgpu';
import {Fn,attribute,texture,uniformArray,uint,vec2,vec3,mat3,positionLocal,normalLocal,tangentLocal,cross,dot,mix,select,acos,sin,instancedMesh} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {validateActors} from './runtime/rigid-v2/bake-intake.mjs';
import {validateArcherBank,archerBankFrame} from './archer-bank.mjs';import {prepareArcherGeometry} from './archer-geometry.mjs';import {archerProjectilePose} from './archer-projectile.mjs';
export function createArcherPlayback(reference,manifest,transformBytes,vertexBytes,actors){
 validateArcherBank(manifest,transformBytes.byteLength,vertexBytes.byteLength);validateActors(actors);
 const makeTexture=(bytes,info)=>{const data=info.format==='RGBA16F'?new Uint16Array(bytes):new Float32Array(bytes),tex=new T.DataTexture(data,info.width,info.height,T.RGBAFormat,info.format==='RGBA16F'?T.HalfFloatType:T.FloatType);tex.minFilter=tex.magFilter=T.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;return tex;};
 const transforms=makeTexture(transformBytes,manifest.transformTexture),vertices=makeTexture(vertexBytes,manifest.vertexTexture);
 const phases=[...new Set(actors.map(a=>a.phase??0))],frames=uniformArray(phases.map(()=>0),'float'),slot=attribute('archerPhaseSlot','float'),frame=frames.element(uint(slot)),lo=frame.floor(),hi=lo.add(1).min(manifest.frameCount-1),alpha=frame.fract(),part=attribute('bakePart','float');
 const sample=(offset,f)=>texture(transforms,vec2(part.mul(3).add(offset+.5).div(manifest.transformTexture.width),f.add(.5).div(manifest.frameCount))).level(0);
 const first=sample(0,lo),tr=mix(first.xyz,sample(0,hi).xyz,alpha),scale=mix(sample(2,lo).xyz,sample(2,hi).xyz,alpha);
 const qa=sample(1,lo).normalize(),qb0=sample(1,hi).normalize(),qb=select(dot(qa,qb0).lessThan(0),qb0.negate(),qb0),cos=dot(qa,qb).clamp(-1,1),theta=acos(cos),denom=sin(theta).max(.00001);
 const q=select(cos.greaterThan(.9995),mix(qa,qb,alpha),qa.mul(sin(theta.mul(alpha.oneMinus()))).add(qb.mul(sin(theta.mul(alpha)))).div(denom)).normalize();
 const rotate=v=>v.add(cross(q.xyz,cross(q.xyz,v).add(v.mul(q.w))).mul(2));
 const vertex=(offset,f)=>texture(vertices,vec2(attribute('bakeVertex','float').mul(2).add(offset+.5).div(manifest.vertexTexture.width),f.add(.5).div(manifest.frameCount))).level(0).xyz;
 const localPosition=(raw,deforming)=>deforming?mix(vertex(0,lo),vertex(0,hi),alpha):raw;
 const position=(raw,deforming)=>select(first.w.lessThan(.5),vec3(0,-10000,0),rotate(localPosition(raw,deforming).mul(scale)).add(tr));
 const columns=new T.InstancedInterleavedBuffer(new Float32Array(actors.flatMap(a=>[...a.matrix.elements.slice(0,3),...a.matrix.elements.slice(4,7),...a.matrix.elements.slice(8,11)])),9),phaseData=new T.InstancedBufferAttribute(Float32Array.from(actors,a=>phases.indexOf(a.phase??0)),1),group=new T.Group();group.name='packed-archers';
 for(const {geometry,material:source,deforming} of prepareArcherGeometry(T,mergeGeometries,reference,manifest)){
  geometry.setAttribute('archerPhaseSlot',phaseData);for(let column=0;column<3;column++)geometry.setAttribute('actorColumn'+column,new T.InterleavedBufferAttribute(columns,3,column*3));
  class ArcherMaterial extends T.MeshStandardNodeMaterial{setupPosition(builder){positionLocal.assign(position(positionLocal,deforming));const n=deforming?mix(vertex(1,lo),vertex(1,hi),alpha).normalize():normalLocal;normalLocal.assign(rotate(n.div(scale)).normalize());if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(attribute('actorColumn0','vec3'),attribute('actorColumn1','vec3'),attribute('actorColumn2','vec3')).mul(rotate(tangentLocal.mul(scale))).normalize());return super.setupPosition(builder);}}
  const material=new ArcherMaterial().copy(source);material.castShadowPositionNode=Fn(builder=>{positionLocal.assign(position(attribute('position','vec3'),deforming));instancedMesh(builder.object);return positionLocal;})();
  const mesh=new T.InstancedMesh(geometry,material,actors.length);actors.forEach((a,i)=>mesh.setMatrixAt(i,a.matrix));mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=deforming?'deforming-archer-batch':'rigid-archer-batch';group.add(mesh);
 }
 // Exact projectile placement is inexpensive independently of the pose hierarchy.
 // Keep terrain contact per actor rather than baking a single placement's impact.
 reference.group.updateMatrixWorld(true);const inverse=reference.projectile.matrixWorld.clone().invert(),projectiles=[];
 reference.projectile.traverse(node=>{if(!node.isMesh)return;const geometry=node.geometry.clone();
  const data=new T.InstancedInterleavedBuffer(new Float32Array(actors.length*16),16);data.setUsage(T.DynamicDrawUsage);for(let c=0;c<3;c++)geometry.setAttribute('projectileColumn'+c,new T.InterleavedBufferAttribute(data,3,c*4));
  class ProjectileMaterial extends T.MeshStandardNodeMaterial{setupPosition(builder){if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(attribute('projectileColumn0','vec3'),attribute('projectileColumn1','vec3'),attribute('projectileColumn2','vec3')).mul(tangentLocal).normalize());return super.setupPosition(builder);}}
  const mesh=new T.InstancedMesh(geometry,new ProjectileMaterial().copy(node.material),actors.length);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='archer-projectile/'+node.name;group.add(mesh);projectiles.push({mesh,data,local:inverse.clone().multiply(node.matrixWorld)});
 });
 const parked=new T.Matrix4().makeTranslation(0,-10000,0),matrix=new T.Matrix4();let stats={};
 const update=time=>{for(let i=0;i<phases.length;i++)frames.array[i]=archerBankFrame(manifest,time+phases[i]);let flying=0,impacted=0;for(let i=0;i<actors.length;i++){
  const pose=archerProjectilePose(T,time,{matrix:actors[i].matrix,phase:actors[i].phase});if(pose.visible)flying++;if(pose.impact)impacted++;
  for(const {mesh,data,local} of projectiles){matrix.multiplyMatrices(pose.visible?pose.matrix:parked,local);mesh.setMatrixAt(i,matrix);data.array.set(matrix.elements,i*16);}
 }for(const {mesh,data} of projectiles){mesh.instanceMatrix.needsUpdate=true;data.needsUpdate=true;}stats={active:actors.length,phaseGroups:phases.length,bodyBatches:group.children.length-projectiles.length,projectileBatches:projectiles.length,flying,impacted,bankFrames:manifest.frameCount,bankBytes:transformBytes.byteLength+vertexBytes.byteLength,maxFittingProbeError:manifest.fitting.maxProbeError,culling:'disabled until swept bounds are certified'};};
 update(0);
 return {group,update,stats:()=>stats,dispose(){transforms.dispose();vertices.dispose();for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}}};
}
