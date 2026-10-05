import * as T from 'three';import {attribute,mat3,tangentLocal} from 'three/tsl';import {createPoseBindings} from '../src/pose-bindings.mjs';
// Reference CPU poses with instanced rigid parts. This is not final crowd baking.
export function createPoseInstances(roots){
 const {parts,actors}=createPoseBindings(roots),group=new T.Group(),buffers=[];
 class PoseMaterial extends T.MeshStandardNodeMaterial{setupPosition(builder){if(builder.geometry.hasAttribute('tangent'))tangentLocal.assign(mat3(attribute('poseColumn0','vec3'),attribute('poseColumn1','vec3'),attribute('poseColumn2','vec3')).mul(tangentLocal).normalize());return super.setupPosition(builder);}}
 for(const {name,node} of parts){if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial)throw Error('Unsupported rigid pose material');const geometry=node.geometry.clone(),material=new PoseMaterial().copy(node.material),mesh=new T.InstancedMesh(geometry,material,roots.length);mesh.name=name;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);const buffer=new T.InstancedInterleavedBuffer(mesh.instanceMatrix.array,16);buffer.setUsage(T.DynamicDrawUsage);for(let c=0;c<3;c++)geometry.setAttribute(`poseColumn${c}`,new T.InterleavedBufferAttribute(buffer,3,c*4));buffers.push(buffer);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);}
 function update(indices=actors.map((_,i)=>i)){if(!indices.length)return;for(let p=0;p<parts.length;p++){for(const i of indices)group.children[p].setMatrixAt(i,actors[i][p].matrixWorld);group.children[p].instanceMatrix.needsUpdate=true;buffers[p].needsUpdate=true;}}
 update();return {group,update,partCount:parts.length,dispose(){for(const m of group.children){m.geometry.dispose();m.material.dispose();m.dispose();}}};
}
