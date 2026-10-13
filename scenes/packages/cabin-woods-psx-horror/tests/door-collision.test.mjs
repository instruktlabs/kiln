import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlayer} from '../src/game/collision.mjs';
test('rotated leaf uses its oriented footprint and leaves diagonal AABB corners open',()=>{
 const leaf={type:'obb',x:0,z:0,halfX:.03,halfZ:.55,angle:Math.PI/4,minY:0,maxY:2.2};
 const inside=resolvePlayer([0,0,0],[0,0,0],[leaf]);
 assert(Math.hypot(inside[0],inside[2])>=.309);
 assert.deepEqual(resolvePlayer([.4,0,.4],[0,0,0],[leaf]),[.4,0,.4]);
 const from=[-.8,0,-.8],blocked=resolvePlayer(from,[1.6,0,1.6],[leaf]);
 assert(blocked[0]+blocked[2]<-.43);
});
