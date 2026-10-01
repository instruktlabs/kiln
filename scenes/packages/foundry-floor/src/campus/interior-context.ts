// SPDX-License-Identifier: MIT
// One bounded derivative of the saved SW head. The asset, twin coordinates and simulation remain unchanged.
import { Box3, BufferGeometry, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, Vector3 } from 'three/webgpu';
import type { Material } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { placementMatrix, unplacePoint, type CampusData, type V3 } from './data';

type Vertex={p:Vector3;n:Vector3};
type Plane={axis:'x'|'y'|'z';value:number;sign:1|-1};
const FLOORS=new Set(['floorSlab','waffleSlabL1','cleanFloorL1']);

export function interiorContextPlan(data:CampusData){
  const i=data.interior,entrance=unplacePoint(i.campus,i.yawDeg,...i.entrance);
  // Twenty metres of contextual margin around the actual slice and its entrance. Upper enclosure is cut at 6m.
  const bounds=new Box3(new Vector3(Math.min(i.twinExtents.x[0],entrance[0])-20,-i.walkingSurfaceY,Math.min(i.twinExtents.z[0],entrance[2])-20),
    new Vector3(Math.max(i.twinExtents.x[1],entrance[0])+20,6,Math.max(i.twinExtents.z[1],entrance[2])+20));
  // Extend the opening through the context's east edge: that is the twin's established section viewing aperture.
  // Otherwise the head's real level-1 floor conceals the subfab section from its outside camera.
  const hole=new Box3(new Vector3(i.twinExtents.x[0]-.05,bounds.min.y,i.twinExtents.z[0]-.05),new Vector3(bounds.max.x,bounds.max.y,i.twinExtents.z[1]+.05));
  return {entrance,bounds,hole};
}
function clip(poly:Vertex[],plane:Plane):Vertex[]{
  if(!poly.length)return [];const out:Vertex[]=[];
  const d=(v:Vertex)=>(v.p[plane.axis]-plane.value)*plane.sign;
  for(let k=0;k<poly.length;k++){
    const a=poly[k]!,b=poly[(k+1)%poly.length]!,da=d(a),db=d(b),insideA=da>=0,insideB=db>=0;
    if(insideA)out.push(a);
    if(insideA!==insideB){const t=da/(da-db),p=a.p.clone().lerp(b.p,t);p[plane.axis]=plane.value;out.push({p,n:a.n.clone().lerp(b.n,t).normalize()});}
  }
  return out;
}
function planes(box:Box3,vertical=true):Plane[]{return (vertical?['x','y','z']:['x','z']).flatMap(axis=>[
  {axis:axis as Plane['axis'],value:box.min[axis as Plane['axis']],sign:1 as const},
  {axis:axis as Plane['axis'],value:box.max[axis as Plane['axis']],sign:-1 as const},
]);}
function subtractHole(poly:Vertex[],hole:Box3):Vertex[][]{
  const out:Vertex[][]=[];let remaining=poly;
  for(const plane of planes(hole,false)){
    const outside=clip(remaining,{...plane,sign:plane.sign===1?-1:1});if(outside.length>=3)out.push(outside);
    remaining=clip(remaining,plane);if(remaining.length<3)break;
  }return out;
}

/** Context materials are borrowed from the loaded pack; only derived geometry is owned and disposed here. */
export function buildInteriorContext(data:CampusData,gltf:GLTF){
  const placement=data.placements.find(p=>p.id===data.interior.placement);if(!placement)throw new Error('Missing SW interior placement');
  const plan=interiorContextPlan(data),root=new Group();root.name='campus-interior-context';
  const transform=new Matrix4().fromArray(placementMatrix(data.interior.campus,data.interior.yawDeg)).invert()
    .multiply(new Matrix4().fromArray(placementMatrix(placement.position,placement.yawDeg)));
  gltf.scene.updateMatrixWorld(true);
  const inverseRoot=gltf.scene.matrixWorld.clone().invert(),buckets=new Map<Material,{positions:number[];normals:number[]}>();
  const audit:{part:string;vertices:V3[]}[]=[];
  gltf.scene.traverseVisible(node=>{
    const mesh=node as Mesh;if(!mesh.isMesh||/roof|ffu|L2|topSlab/i.test(mesh.name))return;
    if(Array.isArray(mesh.material))throw new Error('Head context expects single-material mesh parts');
    const matrix=transform.clone().multiply(inverseRoot).multiply(mesh.matrixWorld),normal=new Matrix3().getNormalMatrix(matrix);
    const geometry=mesh.geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),index=geometry.index;
    const bucket=buckets.get(mesh.material)??{positions:[],normals:[]};buckets.set(mesh.material,bucket);
    for(let k=0;k<(index?.count??p.count);k+=3){
      let poly:Vertex[]=[0,1,2].map(j=>{const id=index?index.getX(k+j):k+j;return {p:new Vector3().fromBufferAttribute(p,id).applyMatrix4(matrix),n:n?new Vector3().fromBufferAttribute(n,id).applyMatrix3(normal).normalize():new Vector3(0,1,0)};});
      for(const plane of planes(plan.bounds))poly=clip(poly,plane);if(poly.length<3)continue;
      for(const part of FLOORS.has(mesh.name)?subtractHole(poly,plan.hole):[poly]){
        for(let j=1;j<part.length-1;j++){
          const tri=[part[0]!,part[j]!,part[j+1]!];
          if(tri[1]!.p.clone().sub(tri[0]!.p).cross(tri[2]!.p.clone().sub(tri[0]!.p)).lengthSq()<1e-16)continue;
          audit.push({part:mesh.name,vertices:tri.map(v=>v.p.toArray() as V3)});
          for(const v of tri){bucket.positions.push(...v.p.toArray());bucket.normals.push(...v.n.toArray());}
        }
      }
    }
  });
  let triangles=0;
  for(const [material,bucket]of buckets){if(!bucket.positions.length)continue;
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(bucket.positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(bucket.normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new Mesh(geometry,material);mesh.name=`head-context-${material.name}`;root.add(mesh);triangles+=bucket.positions.length/9;
  }
  return {root,plan,triangles,audit,dispose(){root.removeFromParent();for(const mesh of root.children as Mesh[])mesh.geometry.dispose();root.clear();}};
}
