// SPDX-License-Identifier: MIT
// Shared geometry per saved model/material/LOD. No per-tree clones or geometry generated in the frame loop.
import { Box3, Frustum, Group, InstancedMesh, Matrix4, Sphere, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material, Mesh, Object3D, PerspectiveCamera } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plantLod } from './plant-lod';
import type { CampusData } from '../data';
import { PLANT_SIZES, type PlantPlacement, type PlantType } from './planting';

interface Bucket { mesh: InstancedMesh; count: number; triangles: number }
interface PlantModel { levels: Bucket[][]; centre: Vector3; radius: number; height:number }

export async function buildCampusVegetation(data:CampusData,models:ReadonlyMap<string,GLTF>,placements:readonly PlantPlacement[]) {
  const types=Object.keys(PLANT_SIZES) as PlantType[];
  if(!types.some(type=>models.has(`plant-${type}`)))return null;
  const root=new Group();root.name='campus-planting';
  const materials=new Map<Material,Material>(), geometry:BufferGeometry[]=[];
  const extracted=new Map<PlantType,PlantModel>();
  const dispose=()=>{root.removeFromParent();for(const mesh of root.children as InstancedMesh[])mesh.dispose();root.clear();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());};
  try {
    for(const type of types){
      const gltf=models.get(`plant-${type}`);if(!gltf)throw new Error(`Missing plant-${type} in the campus pack`);
      gltf.scene.updateMatrixWorld(true);
      const base=gltf.scene.getObjectByName('LOD0');if(!base)throw new Error(`${type}: missing LOD0`);
      const index=gltf.parser.associations.get(base)?.nodes;
      const ids=index===undefined?undefined:gltf.parser.json.nodes?.[index]?.extensions?.MSFT_lod?.ids;
      if(!Array.isArray(ids)||ids.length!==2)throw new Error(`${type}: expected three declared plant levels`);
      const levels=[base,...await Promise.all(ids.map(id=>gltf.parser.getDependency('node',id) as Promise<Object3D>))];
      const bounds=new Box3(), capacity=placements.filter(p=>p.model===type).length;
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
        const levelBuckets:Bucket[]=[];
        for(const [material,partsForMaterial] of parts){
          const merged=mergeGeometries(partsForMaterial);partsForMaterial.forEach(p=>p.dispose());
          if(!merged)throw new Error(`${type}: plant geometry could not be merged`);geometry.push(merged);
          let owned=materials.get(material);if(!owned){owned=material.clone();materials.set(material,owned);}
          const mesh=new InstancedMesh(merged,owned,Math.max(1,capacity));mesh.name=`${type}-lod${level}-${material.name}`;mesh.frustumCulled=false;mesh.count=0;root.add(mesh);
          levelBuckets.push({mesh,count:0,triangles:(merged.index?.count??merged.getAttribute('position').count)/3});
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
      for(const row of rows){
        const {p}=row,model=extracted.get(p.model)!;
        sphere.center.copy(model.centre).applyMatrix4(row.matrix);sphere.radius=model.radius;
        const distance=eye.distanceTo(sphere.center),small=p.model==='shrub-mound'||p.model==='hedge-4m';
        if((small&&distance>600)||!frustum.intersectsSphere(sphere))continue;
        // Camera-space depth and the live projection include the drive camera's speed-dependent FOV.
        const depth=Math.max(.1,-cameraPoint.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse).z);
        row.level=plantLod(model.height*camera.projectionMatrix.elements[5]!/(2*depth),lodBias,row.level);
        for(const bucket of model.levels[row.level]!)bucket.mesh.setMatrixAt(bucket.count++,row.matrix);
        visible++;perLevel[row.level]!++;
      }
      for(const model of extracted.values())for(const level of model.levels)for(const bucket of level){
        bucket.mesh.count=bucket.count;bucket.mesh.visible=bucket.count>0;
        if(bucket.count){bucket.mesh.instanceMatrix.needsUpdate=true;draws++;triangles+=bucket.count*bucket.triangles;}
      }
    },
    stats:()=>({placed:placements.length,visible,draws,triangles,perLevel:[...perLevel],byZone:Object.fromEntries(['avenue','windbreak','parking','island','arrival'].map(zone=>[zone,placements.filter(p=>p.zone===zone).length]))}),
    dispose,
  };
}
export type CampusVegetation=NonNullable<Awaited<ReturnType<typeof buildCampusVegetation>>>;
