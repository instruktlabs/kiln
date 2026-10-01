import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Box3, Mesh, Ray, Triangle, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseCampus, placePoint } from '../../src/campus/data';
import { buildInteriorContext, interiorContextPlan } from '../../src/campus/interior-context';
import { buildTour, pathPoint } from '../../src/scene/tour';
import { FAB_DATA } from '../../src/sim/index';

test('registered cutaway uses the saved SW head, bounded geometry and an exact floor opening',async()=>{
  const data=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const bytes=readFileSync(new URL('../../staged/ff3/models/structures/s1-head-W.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const before=new Box3().setFromObject(gltf.scene),plan=interiorContextPlan(data),context=buildInteriorContext(data,gltf);
  expect(plan.entrance.map(n=>Math.round(n))).toEqual([55,-8,185]);
  expect(placePoint(data.interior.campus,data.interior.yawDeg,...plan.entrance)).toEqual(data.interior.entrance);
  expect(context.root.name).toBe('campus-interior-context');
  expect(context.triangles).toBeGreaterThan(100);expect(context.triangles).toBeLessThan(18_375);
  expect(context.root.children.length).toBeLessThanOrEqual(10);
  expect(new Box3().setFromObject(gltf.scene).equals(before)).toBe(true);
  for(const node of context.root.children){const mesh=node as Mesh,pos=mesh.geometry.getAttribute('position');
    for(let i=0;i<pos.count;i++){const p=new Vector3().fromBufferAttribute(pos,i);expect(plan.bounds.distanceToPoint(p)).toBeLessThan(1e-5);} // Float32 upload rounding only.
  }
  // The old architectural floors must not draw over the twin's walking/subfab surfaces.
  for(const polygon of context.audit){
    expect(/roof|ffu|L2|topSlab/i.test(polygon.part)).toBe(false);
    if(['floorSlab','waffleSlabL1','cleanFloorL1'].includes(polygon.part)){
      const centre=polygon.vertices.reduce((p,v)=>p.add(new Vector3(...v)),new Vector3()).multiplyScalar(1/polygon.vertices.length);
      expect(centre.x>plan.hole.min.x&&centre.x<plan.hole.max.x&&centre.z>plan.hole.min.z&&centre.z<plan.hole.max.z).toBe(false);
    }
  }
  // Every existing stop and continuous fly path stays at least 20cm from the newly introduced context.
  const tour=buildTour(FAB_DATA.layout),points=tour.stops.map(s=>new Vector3(...s.position));
  for(const segment of tour.segments)if(segment.path)for(let s=0;s<=segment.path.length;s+=.1)points.push(new Vector3(...pathPoint(segment.path,s,[0,0,0])));
  const nearest=new Vector3();let clearance=Infinity;
  for(const polygon of context.audit)for(let i=1;i<polygon.vertices.length-1;i++){
    const triangle=new Triangle(new Vector3(...polygon.vertices[0]!),new Vector3(...polygon.vertices[i]!),new Vector3(...polygon.vertices[i+1]!));
    for(const point of points)clearance=Math.min(clearance,triangle.closestPointToPoint(point,nearest).distanceTo(point));
  }
  expect(clearance).toBeGreaterThanOrEqual(.2);
  const blocked:string[]=[];
  for(const stop of tour.stops){const origin=new Vector3(...stop.position),target=new Vector3(...stop.feature.anchor),ray=new Ray(origin,target.clone().sub(origin).normalize());
    for(const polygon of context.audit)for(let i=1;i<polygon.vertices.length-1;i++){
      const hit=ray.intersectTriangle(new Vector3(...polygon.vertices[0]!),new Vector3(...polygon.vertices[i]!),new Vector3(...polygon.vertices[i+1]!),false,new Vector3());
      if(hit&&origin.distanceTo(hit)<origin.distanceTo(target))blocked.push(`${stop.name}:${polygon.part}`);
    }
  }
  expect([...new Set(blocked)]).toEqual([]);
  console.log(JSON.stringify({contextTriangles:context.triangles,batches:context.root.children.length,tourSamples:points.length,minimumCameraClearance:clearance,bounds:plan.bounds}));
  context.dispose();expect(context.root.children.length).toBe(0);
});
