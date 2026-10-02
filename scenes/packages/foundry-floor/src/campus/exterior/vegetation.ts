// SPDX-License-Identifier: MIT
// Shared geometry per saved model/LOD. No per-tree clones or geometry generated in the frame loop. Shared planting (the
// default; dev parameter plantingShared=false keeps the per-material path) merges a level's parts into one geometry with
// each part's colour and roughness as vertex data and draws it through the one material of ./plant-material: one draw per
// plant type and level, one pipeline for all of them. The per-material path (one InstancedMesh per type, level and
// material) still serves a level whose material the vertex data cannot reproduce exactly.
import { Box3, Float32BufferAttribute, Frustum, Group, InstancedBufferGeometry, InstancedInterleavedBuffer, InstancedMesh, InterleavedBufferAttribute, Matrix4, Mesh, Sphere, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material, MeshStandardNodeMaterial, Object3D, PerspectiveCamera } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plantLod } from './plant-lod';
import { createPlantMaterial, PLANT_COLUMNS, plantLook } from './plant-material';
import type { CampusData } from '../data';
import { PLANT_SIZES, type PlantPlacement, type PlantType } from './planting';

/** A shared mesh's instance buffer: the placement row in each slot, so a slot is rewritten only when its row changes. */
interface Slots { geometry: InstancedBufferGeometry; data: InstancedInterleavedBuffer; rows: Int32Array; changed: boolean }
interface Bucket { mesh: Mesh; count: number; triangles: number; slots?: Slots }
interface PlantModel { levels: Bucket[][]; centre: Vector3; radius: number; height:number }

export async function buildCampusVegetation(data:CampusData,models:ReadonlyMap<string,GLTF>,placements:readonly PlantPlacement[],options:{shared?:boolean}={}) {
  const types=Object.keys(PLANT_SIZES) as PlantType[], shared=options.shared!==false;
  if(!types.some(type=>models.has(`plant-${type}`)))return null;
  const root=new Group();root.name='campus-planting';
  const materials=new Map<Material,Material>(), geometry:BufferGeometry[]=[];
  let plantMaterial:MeshStandardNodeMaterial|null=null;
  const extracted=new Map<PlantType,PlantModel>();
  const dispose=()=>{root.removeFromParent();for(const mesh of root.children as InstancedMesh[])if(mesh.isInstancedMesh)mesh.dispose();root.clear();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());plantMaterial?.dispose();};
  try {
    for(const type of types){
      const gltf=models.get(`plant-${type}`);if(!gltf)throw new Error(`Missing plant-${type} in the campus pack`);
      gltf.scene.updateMatrixWorld(true);
      const base=gltf.scene.getObjectByName('LOD0');if(!base)throw new Error(`${type}: missing LOD0`);
      const index=gltf.parser.associations.get(base)?.nodes;
      const ids=index===undefined?undefined:gltf.parser.json.nodes?.[index]?.extensions?.MSFT_lod?.ids;
      if(!Array.isArray(ids)||ids.length!==2)throw new Error(`${type}: expected three declared plant levels`);
      const levels=[base,...await Promise.all(ids.map(id=>gltf.parser.getDependency('node',id) as Promise<Object3D>))];
      const bounds=new Box3(), capacity=Math.max(1,placements.filter(p=>p.model===type).length);
      const buckets:Bucket[][]=[];
      for(const [level,object] of levels.entries()){
        const parts=new Map<Material,BufferGeometry[]>();
        const visit=(node:Object3D,parent:Matrix4)=>{
          if(!node.visible)return;node.updateMatrix();const world=parent.clone().multiply(node.matrix),mesh=node as Mesh;
          if(mesh.isMesh){
            if(Array.isArray(mesh.material))throw new Error(`${type}: multi-material mesh is unsupported`);
            const copy=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
            for(const key of Object.keys(copy.attributes))if(key!=='position'&&key!=='normal')copy.deleteAttribute(key);
            if(!copy.getAttribute('normal'))copy.computeVertexNormals();copy.applyMatrix4(world);copy.computeBoundingBox();
            if(level===0)bounds.union(copy.boundingBox!);
            const list=parts.get(mesh.material)??[];list.push(copy);parts.set(mesh.material,list);
          }
          for(const child of node.children)visit(child,world);
        };
        visit(object,base.parent?.matrixWorld??new Matrix4());
        const levelBuckets:Bucket[]=[], triangles=(g:BufferGeometry)=>(g.index?.count??g.getAttribute('position').count)/3;
        const looks=shared?[...parts.keys()].map(plantLook):[];
        if(shared&&parts.size&&looks.every(Boolean)){
          // One geometry for the level: each part's look as a vertex attribute, then one instanced draw on the shared material.
          const all:BufferGeometry[]=[];
          [...parts.values()].forEach((list,k)=>{for(const part of list){
            const n=part.getAttribute('position').count,look=new Float32Array(n*4);for(let i=0;i<n;i++)look.set(looks[k]!,i*4);
            part.setAttribute('plantLook',new Float32BufferAttribute(look,4));all.push(part);
          }});
          const merged=mergeGeometries(all);all.forEach(p=>p.dispose());
          if(!merged)throw new Error(`${type}: plant geometry could not be merged`);
          const instanced=new InstancedBufferGeometry();instanced.name=`${type}-lod${level}`;
          for(const [name,attribute] of Object.entries(merged.attributes))instanced.setAttribute(name,attribute);
          const buffer=new InstancedInterleavedBuffer(new Float32Array(capacity*16),16,1);
          PLANT_COLUMNS.forEach((column,k)=>instanced.setAttribute(column,new InterleavedBufferAttribute(buffer,4,k*4)));
          instanced.instanceCount=0;geometry.push(instanced);
          const mesh=new Mesh(instanced,plantMaterial??=createPlantMaterial());mesh.name=instanced.name;mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.visible=false;root.add(mesh);
          levelBuckets.push({mesh,count:0,triangles:triangles(merged),slots:{geometry:instanced,data:buffer,rows:new Int32Array(capacity).fill(-1),changed:true}});
        } else for(const [material,partsForMaterial] of parts){
          const merged=mergeGeometries(partsForMaterial);partsForMaterial.forEach(p=>p.dispose());
          if(!merged)throw new Error(`${type}: plant geometry could not be merged`);geometry.push(merged);
          let owned=materials.get(material);if(!owned){owned=material.clone();materials.set(material,owned);}
          const mesh=new InstancedMesh(merged,owned,capacity);mesh.name=`${type}-lod${level}-${material.name}`;mesh.frustumCulled=false;mesh.count=0;root.add(mesh);
          levelBuckets.push({mesh,count:0,triangles:triangles(merged)});
        }
        buckets.push(levelBuckets);
      }
      const sphere=bounds.getBoundingSphere(new Sphere());extracted.set(type,{levels:buckets,centre:sphere.center,radius:sphere.radius,height:bounds.max.y-bounds.min.y});
    }
  } catch(error){dispose();throw error;}
  const rows=placements.map(p=>({p,level:2,matrix:new Matrix4().makeRotationY(p.yaw).setPosition(p.x,data.roads.gradeY,p.z)}));
  const frustum=new Frustum(),projection=new Matrix4(),sphere=new Sphere(),eye=new Vector3(),cameraPoint=new Vector3();
  let visible=0,draws=0,triangles=0;const perLevel=[0,0,0];
  return {
    root,
    update(camera:PerspectiveCamera,lodBias:number){
      camera.updateMatrixWorld();eye.setFromMatrixPosition(camera.matrixWorld);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      for(const model of extracted.values())for(const level of model.levels)for(const bucket of level)bucket.count=0;
      visible=0;draws=0;triangles=0;perLevel.fill(0);
      for(let i=0;i<rows.length;i++){
        const row=rows[i]!,{p}=row,model=extracted.get(p.model)!;
        sphere.center.copy(model.centre).applyMatrix4(row.matrix);sphere.radius=model.radius;
        const distance=eye.distanceTo(sphere.center),small=p.model==='shrub-mound'||p.model==='hedge-4m';
        if((small&&distance>600)||!frustum.intersectsSphere(sphere))continue;
        // Camera-space depth and the live projection include the drive camera's speed-dependent FOV.
        const depth=Math.max(.1,-cameraPoint.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse).z);
        row.level=plantLod(model.height*camera.projectionMatrix.elements[5]!/(2*depth),lodBias,row.level);
        for(const bucket of model.levels[row.level]!){
          const slot=bucket.count++,slots=bucket.slots;
          if(!slots)(bucket.mesh as InstancedMesh).setMatrixAt(slot,row.matrix);
          else if(slots.rows[slot]!==i){slots.rows[slot]=i;row.matrix.toArray(slots.data.array as Float32Array,slot*16);slots.changed=true;}
        }
        visible++;perLevel[row.level]!++;
      }
      for(const model of extracted.values())for(const level of model.levels)for(const bucket of level){
        const {mesh,count,slots}=bucket;mesh.visible=count>0;
        if(slots){
          // Upload only when a slot's row or the count changed, and only the slots in use.
          if(slots.geometry.instanceCount!==count){slots.geometry.instanceCount=count;slots.changed=true;}
          if(slots.changed&&count){slots.data.clearUpdateRanges();slots.data.addUpdateRange(0,count*16);slots.data.needsUpdate=true;}
          slots.changed=false;
        } else {(mesh as InstancedMesh).count=count;if(count)(mesh as InstancedMesh).instanceMatrix.needsUpdate=true;}
        if(count){draws++;triangles+=count*bucket.triangles;}
      }
    },
    stats:()=>({placed:placements.length,visible,draws,triangles,perLevel:[...perLevel],shared,byZone:Object.fromEntries(['avenue','windbreak','parking','island','arrival'].map(zone=>[zone,placements.filter(p=>p.zone===zone).length]))}),
    dispose,
  };
}
export type CampusVegetation=NonNullable<Awaited<ReturnType<typeof buildCampusVegetation>>>;
