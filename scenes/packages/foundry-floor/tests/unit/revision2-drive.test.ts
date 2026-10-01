import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { advanceCar, createCarWorld, footprintCentre, placeCar, type CarInput } from '../../src/campus/drive/car';
import { parseDriving } from '../../src/campus/drive/driving';
import { parseCampus } from '../../src/campus/data';
import { vehicleBodies } from '../../scripts/drive-check';
const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
const data=parseDriving(readFileSync(new URL('../../data/driving.json',import.meta.url),'utf8'));
const body=vehicleBodies()[data.vehicle],world=createCarWorld(campus,data);
const input=(patch:Record<string,unknown>):CarInput=>({throttle:0,reverse:0,steer:0,brake:0,handbrake:false,...patch});
function run(speed:number,controls:CarInput,seconds:number,start=-3000,boxes:any[]=[]){
  const car=placeCar(start,7.25,0,speed,body),acc={t:0};
  for(let i=0;i<seconds*120;i++)advanceCar(car,controls,body,world,boxes,1/120,acc);
  return car;
}
test('holding boost provides sustained extra forward speed and releases back toward the normal cap',()=>{
  const normal=run(0,input({throttle:1}),30),boosted=run(0,input({throttle:1,boost:true}),30);
  expect(boosted.speed).toBeGreaterThan(normal.speed*1.4);
  expect(boosted.speed).toBeLessThanOrEqual(data.topSpeed*1.5);
  const released=run(boosted.speed,input({throttle:1}),15);
  expect(released.speed).toBeLessThan(boosted.speed);expect(released.speed).toBeLessThan(data.topSpeed*1.05);
});
test('boost never overrides brakes, reverse limits, road-end stops or traffic clearance',()=>{
  const fast=run(35,input({throttle:1,boost:true,brake:1}),4);
  expect(fast.speed).toBeLessThan(20);
  const reverse=run(0,input({reverse:1,boost:true}),8);expect(-reverse.speed).toBeLessThanOrEqual(data.reverse.maxSpeed+.05);
  const end=run(40,input({throttle:1,boost:true}),20,campus.roads.split.carEnd-250);
  expect(footprintCentre(end,body)[0]+body.length/2).toBeLessThanOrEqual(campus.roads.split.carEnd-data.roadEnd.stopDistance+1e-5);
  const box={u:-2800,v:7.25,heading:0,halfLength:3,halfWidth:1.5,speed:0};
  const stopped=run(40,input({throttle:1,boost:true}),15,-3000,[box]);
  expect(footprintCentre(stopped,body)[0]+body.length/2+data.traffic.minGap).toBeLessThanOrEqual(box.u-box.halfLength+1e-5);
});
