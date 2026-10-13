import test from 'node:test';
import assert from 'node:assert/strict';
import {planPoint,footprintTransform,furnitureDefinitions,doorDefinitions} from '../src/game/cabin-placement.mjs';

const close=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-9,`${actual} vs ${expected}`));
test('the approved floor plan maps the porch to +X front and bedroom to the rear',()=>{
 assert.deepEqual(planPoint(6,10),[5,0,0]);
 assert.deepEqual(planPoint(6,0),[-5,0,0]);
 assert.deepEqual(planPoint(12,5),[0,0,6]);
});
test('footprint alignment uses actual asymmetric bounds and preserves bed scale',()=>{
 const placement=footprintTransform({u:9.25,v:2.85,w:1.9,d:1},{min:[-.8,0,-.4],max:[1.1,.88,.6]},Math.PI/2);
 close(placement.position,[-1.75,0,4.35]);
 close(placement.size,[1,.88,1.9]);
 assert.equal(placement.scale,1);
});
test('all approved major furniture footprints have explicit asset, facing and collision policies',()=>{
 const definitions=furnitureDefinitions();
 assert.equal(definitions.length,20);
 assert.equal(definitions.find(d=>d.planId==='H1').id,'fire');
 assert.equal(definitions.find(d=>d.planId==='R1').id,'storage');
 assert.equal(definitions.find(d=>d.planId==='K1').rotationY,Math.PI/2);
 assert.equal(definitions.find(d=>d.planId==='S1').rotationY,Math.PI/2);
 assert(definitions.every(d=>d.key&&d.solid));
 assert.equal(new Set(definitions.map(d=>d.id)).size,20);
});
test('four door definitions retain starts, centers, normals and designated keys',()=>{
 const doors=doorDefinitions();assert.equal(doors.length,4);
 close(doors.find(d=>d.id==='front_door_mount').position,[4.9,0,.05]);
 close(doors.find(d=>d.id==='bedroom_door_mount').position,[-2,0,2]);
 close(doors.find(d=>d.id==='workyard_door_mount').position,[.65,0,5.9]);
 assert.equal(doors.find(d=>d.id==='utility_door_mount').key,'interiorDoor');
 assert.equal(doors.find(d=>d.id==='workyard_door_mount').openAngleDegrees,-95);
});
