import * as T from 'three/webgpu';import {attribute,mat3,tangentLocal} from 'three/tsl';
import {namedMeshParts} from './bake-intake.mjs';import {createPoseSampler} from './rigid-instancing-model.mjs';
export function createRigidInstancing(root,clip,actors){
 const sampler=createPoseSampler(T,root,clip,actors),parts=namedMeshParts(root),group=new T.Group(),matrix=new T.Matrix4(),buffers=[];
 class PartMaterial extends T.MeshStandardNodeMaterial{setupPosition(builder){if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(attribute('poseColumn0','vec3'),attribute('poseColumn1','vec3'),attribute('poseColumn2','vec3')).mul(tangentLocal).normalize());return super.setupPosition(builder);}}
 for(const {node} of parts){
  if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial)throw Error('Unsupported baseline material');
  const geometry=node.geometry.clone(),material=new PartMaterial().copy(node.material),mesh=new T.InstancedMesh(geometry,material,actors.length);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const buffer=new T.InstancedInterleavedBuffer(mesh.instanceMatrix.array,16);buffer.setUsage(T.DynamicDrawUsage);buffers.push(buffer);
  for(let c=0;c<3;c++)geometry.setAttribute(`poseColumn${c}`,new T.InterleavedBufferAttribute(buffer,3,c*4));
  mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 const update=(time,loop=true)=>{sampler.update(time,loop);for(let p=0;p<parts.length;p++){const mesh=group.children[p];for(let i=0;i<actors.length;i++){matrix.multiplyMatrices(actors[i].matrix,sampler.poseForActor(i)[p].matrixWorld);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;buffers[p].needsUpdate=true;}};
 update(0,false);
 return {group,update,phaseGroups:sampler.groupCount,dispose(){sampler.dispose();group.children.forEach(m=>{m.geometry.dispose();m.material.dispose();m.dispose();});}};
}
