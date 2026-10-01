import { expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractVehicle } from '../../src/campus/exterior/vehicles';
import { parseDriving } from '../../src/campus/drive/driving';
import { parseCampus } from '../../src/campus/data';
import { articulateFreight, createFreightCoupling } from '../../src/campus/exterior/freight';
import { drivableArea } from '../../src/campus/roads';
import { InstancedBufferGeometry, PerspectiveCamera } from 'three/webgpu';
import { createCampusTraffic } from '../../src/campus/exterior/traffic';
import { FREIGHT_TYPES, freightWheels } from '../../src/campus/exterior/freight';
import { buildCampusGround } from '../../src/campus/exterior/ground';
import { campusPlantings, PLANT_SIZES } from '../../src/campus/exterior/planting';
import { buildDriveWorld } from '../../src/campus/exterior/drive-world';
import { vehicleModels } from '../../scripts/stage-campus';
import type { LoadedPack } from '@kiln-scenes/scene-kit';

const driving=parseDriving(readFileSync(new URL('../../data/driving.json',import.meta.url),'utf8'));
const expected={ 'truck-tractor':[2808,2584,108], 'trailer-dryvan':[2516,2012,72], 'trailer-flatbed':[2804,2276,108], 'trailer-tanker':[3628,2292,188], 'van-delivery':[1404,1176,72] };
test('failed freight loading releases successful vehicle extractions before rejecting',async()=>{
  const models=new Map();
  const sources=[...vehicleModels(),...FREIGHT_TYPES.map(type=>({id:`freight-${type}`,from:new URL(`../../../../../showcase/authors/sol-ff-freight/outputs/${type}.glb`,import.meta.url)}))];
  for(const model of sources){const bytes=readFileSync(model.from);models.set(model.id,await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));}
  models.get('freight-trailer-tanker').parser.getDependency=()=>Promise.reject(new Error('simulated freight decode failure'));
  const bytes=readFileSync(new URL('../../data/driving.json',import.meta.url));
  const pack={models,data:new Map([['driving',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)]])} as unknown as LoadedPack;
  const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const disposal=spyOn(InstancedBufferGeometry.prototype,'dispose');
  try {
    await expect(buildDriveWorld(campus,pack,campus.tiers.high)).rejects.toThrow('simulated freight decode failure');
    expect(disposal.mock.calls.length).toBeGreaterThanOrEqual(18);
  } finally {disposal.mockRestore();}
});
test('freight extraction retains all six tractor wheels and rear-only trailers through medium LOD', async()=>{
  for(const [type,triangles] of Object.entries(expected)){
    const bytes=readFileSync(new URL(`../../../../../showcase/authors/sol-ff-freight/outputs/${type}.glb`,import.meta.url));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const wheels=type.startsWith('trailer-')?['Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2']:type==='truck-tractor'?['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2']:['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'];
    const extracted=await extractVehicle(type,gltf,driving.lamps,driving.flow.paint.material,{wheelNames:wheels});
    expect(extracted.model.triangles).toEqual(triangles);expect(extracted.model.wheels.length).toBe(wheels.length);
    if(type==='truck-tractor')expect(extracted.model.locators.FifthWheel?.[1]).toBeCloseTo(1.25,5);
    if(type.startsWith('trailer-'))expect(extracted.model.locators.Kingpin).toEqual([0,1.25,0]);
    for(const geometry of extracted.model.lods)geometry.dispose();extracted.release();
  }
});

test('freight runs in shared lane traffic and draws articulated bodies from their real LOD geometry', async()=>{
  const extracted=await Promise.all(FREIGHT_TYPES.map(async type=>{
    const bytes=readFileSync(new URL(`../../../../../showcase/authors/sol-ff-freight/outputs/${type}.glb`,import.meta.url));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    return extractVehicle(type,gltf,driving.lamps,'Paint',{wheelNames:freightWheels(type)});
  }));
  const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const traffic=createCampusTraffic({models:new Map(extracted.map(e=>[e.model.type,e.model])),lanes:campus.lanes,driving,
    tier:campus.tiers.high,dissolve:campus.roads.split.dissolve,halfLane:campus.roads.split.lanes.width/2,gradeY:campus.roads.gradeY});
  traffic.advance(10);
  const camera=new PerspectiveCamera(65,1.5,.1,10000);camera.position.set(0,350,700);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  traffic.draw(camera);
  const stats=traffic.stats();
  expect(stats.parked).toBe(4);
  expect(traffic.boxes(920,612,15).length).toBe(2);
  const ground=buildCampusGround(campus,campus.tiers.high,driving);
  expect(ground.root.getObjectByName('ground-freight-aprons')).toBeDefined();
  for(const parking of driving.freightParking!){
    const boxes=traffic.boxes(parking.x,parking.z,15);
    for(const box of boxes){
      expect(Math.abs(box.u-parking.x)+box.halfLength).toBeLessThan(parking.apron[0]/2);
      expect(Math.abs(box.v-parking.z)+box.halfWidth).toBeLessThan(parking.apron[1]/2);
    }
    for(const solid of campus.solids)expect(parking.x+parking.apron[0]/2<solid.min[0]||parking.x-parking.apron[0]/2>solid.max[0]||parking.z+parking.apron[1]/2<solid.min[2]||parking.z-parking.apron[1]/2>solid.max[2]).toBe(true);
    for(const [x,z] of campus.satellites.centres)expect(Math.abs(x-parking.x)>campus.satellites.size[0]/2+parking.apron[0]/2||Math.abs(z-parking.z)>campus.satellites.size[1]/2+parking.apron[1]/2).toBe(true);
    for(const plant of campusPlantings(campus))expect(Math.abs(plant.x-parking.x)>parking.apron[0]/2+PLANT_SIZES[plant.model][0]||Math.abs(plant.z-parking.z)>parking.apron[1]/2+PLANT_SIZES[plant.model][0]).toBe(true);
  }
  expect(stats.vehicles).toBeGreaterThan(20);
  expect(stats.perType['truck-tractor']).toBeGreaterThan(0);
  expect(stats.perType['van-delivery']).toBeGreaterThan(0);
  expect(['trailer-dryvan','trailer-flatbed','trailer-tanker'].every(type=>(stats.perType[type]??0)>0)).toBe(true);
  const carriers=traffic.sample(10000),classes=traffic.sim.o.classes;
  const semi=carriers.find(car=>car.type==='semi-dryvan')!;
  const boxes=traffic.boxes(semi.u,semi.v,20);
  // Actual tractor and trailer rectangles must reach the drive's collision query;
  // one straight full-length rectangle is not the articulated footprint on a bend.
  expect(boxes.some(box=>Math.abs(box.halfLength-extracted[0]!.model.length/2)<1e-8)).toBe(true);
  expect(boxes.some(box=>Math.abs(box.halfLength-extracted[1]!.model.length/2)<1e-8)).toBe(true);
  for(const lane of traffic.sim.lanes)for(let i=1;i<lane.length;i++){
    const ahead=lane[i-1]!,car=lane[i]!;
    expect(ahead.s-car.s-(classes[ahead.cls]!.length+classes[car.cls]!.length)/2).toBeGreaterThanOrEqual(.49);
  }
  traffic.dispose();ground.dispose();extracted.forEach(e=>e.release());
});

test('articulated trailers keep the authored kingpin on the fifth wheel through every campus bend', async()=>{
  const load=async(type:string,wheelNames:string[])=>{
    const bytes=readFileSync(new URL(`../../../../../showcase/authors/sol-ff-freight/outputs/${type}.glb`,import.meta.url));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    return extractVehicle(type,gltf,driving.lamps,'Paint',{wheelNames});
  };
  const tractor=await load('truck-tractor',['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2']);
  const trailer=await load('trailer-dryvan',['Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2']);
  const coupling=createFreightCoupling(tractor.model,trailer.model);
  const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const road=drivableArea(campus.roads);
  let articulated=0;
  for(const lane of campus.lanes)for(let s=25;s<lane.length-25;s+=4){
    const pose=articulateFreight(lane,s,coupling),pin=tractor.model.locators.FifthWheel!;
    expect(Math.hypot(pose.trailer.x-(pose.tractor.x+pin[0]*Math.cos(pose.tractor.heading)),pose.trailer.z-(pose.tractor.z+pin[0]*Math.sin(pose.tractor.heading)))).toBeLessThan(1e-8);
    const angle=Math.atan2(Math.sin(pose.tractor.heading-pose.trailer.heading),Math.cos(pose.tractor.heading-pose.trailer.heading));
    expect(Math.abs(angle)).toBeLessThan(Math.PI/3);if(Math.abs(angle)>.03)articulated++;
    expect(pose.trailer.y).toBeCloseTo(0,5);
    // Check both measured footprint corners through the bends; lane endpoints dissolve
    // outside the drivable player's region and are deliberately excluded from this check.
    if(Math.abs(pose.tractor.x)<300)for(const [part,model] of [[pose.tractor,tractor.model],[pose.trailer,trailer.model]] as const){
      for(const dx of [-1,1])for(const dz of [-1,1]){
        const x=model.boxCentre[0]+dx*model.length/2,z=model.boxCentre[2]+dz*model.width/2;
        expect(road.contains(part.x+x*Math.cos(part.heading)-z*Math.sin(part.heading),part.z+x*Math.sin(part.heading)+z*Math.cos(part.heading),.15)).toBe(true);
      }
    }
  }
  expect(articulated).toBeGreaterThan(50);
  // The saved GLBs' coupled front-to-back extent is 17.5345 m, including mirrors;
  // generic real-world truck lengths are not evidence of this authored model's bounds.
  expect(coupling.length).toBeCloseTo(17.5345,4);
  for(const entry of [tractor,trailer]){entry.model.lods.forEach(g=>g.dispose());entry.release();}
});
