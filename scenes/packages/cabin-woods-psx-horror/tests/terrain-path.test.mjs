import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainPathMask,sampleTerrainMask} from '../src/game/terrain-path.mjs';

test('joined trails share one mask with feathered edges and untouched forest ground',()=>{
 const paths=[{halfWidth:2,points:[[-12,0,0],[12,0,0]]},{halfWidth:1.4,points:[[0,0,-10],[0,0,10]]}];
 const mask=createTerrainPathMask(paths,{size:128,span:32});
 assert.ok(sampleTerrainMask(mask,0,0)>.99);
 assert.ok(sampleTerrainMask(mask,8,0)>.99);
 assert.ok(sampleTerrainMask(mask,0,8)>.99);
 assert.equal(sampleTerrainMask(mask,8,8),0);
 const edge=sampleTerrainMask(mask,8,1.6);assert.ok(edge>0&&edge<1);
 assert.ok(sampleTerrainMask(mask,8,1.2)>edge);
 assert.deepEqual(mask.data,createTerrainPathMask(paths,{size:128,span:32}).data);
});

test('short narrow harvest spurs and reversed routes remain visible with matching world UVs',()=>{
 const route={halfWidth:.3,points:[[4,0,2],[4,0,5],[6,0,5]]};
 const mask=createTerrainPathMask([route],{size:256,span:32});
 assert.ok(sampleTerrainMask(mask,4,3.5)>.95);
 assert.ok(sampleTerrainMask(mask,5,5)>.95);
 assert.equal(sampleTerrainMask(mask,4,-3.5),0,'world Z is not mirrored');
 assert.deepEqual(mask.data,createTerrainPathMask([{...route,points:[...route.points].reverse()}],{size:256,span:32}).data);
});

test('invalid paths and unbounded mask allocations fail before creating a texture',()=>{
 assert.throws(()=>createTerrainPathMask([],{size:8192}),/size/);
 assert.throws(()=>createTerrainPathMask([{halfWidth:0,points:[[0,0,0],[1,0,0]]}]),/width/);
 assert.throws(()=>createTerrainPathMask([{halfWidth:1,points:[[0,0,0],[Infinity,0,0]]}]),/finite/);
});
