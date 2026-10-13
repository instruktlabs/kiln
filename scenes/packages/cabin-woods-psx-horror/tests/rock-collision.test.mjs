import test from 'node:test';import assert from 'node:assert/strict';
import {resolvePlayer} from '../src/game/collision.mjs';
import {convexHullXZ} from '../src/game/convex-footprint.mjs';
test('distant bounded rocks skip hull queries while capsule-radius overlaps still resolve',()=>{
 const distant={type:'convex',minX:10,maxX:12,minZ:10,maxZ:12,minY:0,maxY:1,get points(){throw Error('Distant hull must not be visited');}};
 assert.deepEqual(resolvePlayer([0,0,0],[1,0,0],[distant]),[1,0,0]);
 const rock={type:'convex',minX:0,maxX:2,minZ:0,maxZ:2,minY:0,maxY:1,points:[[0,0],[2,0],[2,2],[0,2]]};
 const near=resolvePlayer([-.1,0,1],[0,0,0],[rock]);assert(Math.abs(near[0]+.28)<1e-12);assert.equal(near[2],1);
 const inside=resolvePlayer([1,0,1],[0,0,0],[rock]);assert.deepEqual(inside,[1,0,-.28]);
 assert.deepEqual(resolvePlayer([1,2,1],[0,0,0],[rock]),[1,2,1]);
});
test('irregular rock uses its hull, preserves empty bbox corners, and blocks a fast crossing',()=>{
 const rock={id:'rock',type:'convex',points:convexHullXZ([[0,0],[2,0],[0,2],[.2,.2]]),minY:0,maxY:1};
 assert.deepEqual(resolvePlayer([1.8,0,1.8],[0,0,0],[rock]),[1.8,0,1.8]);
 const inside=resolvePlayer([.4,0,.4],[0,0,0],[rock]);assert.ok(inside[0]<=-.279||inside[2]<=-.279);
 const blocked=resolvePlayer([-1,0,.3],[4,0,0],[rock]);assert.ok(blocked[2]<=-.279||blocked[0]<2.3,'crossing diverts around the rock instead of tunneling');
});
test('rock collision respects actor vertical range and hull winding is normalized',()=>{
 const points=convexHullXZ([[0,0],[0,2],[2,0],[0,0]]);assert.equal(points.length,3);
 const rock={type:'convex',points,minY:0,maxY:.8};assert.deepEqual(resolvePlayer([.3,1,.3],[0,0,0],[rock]),[.3,1,.3]);
});
