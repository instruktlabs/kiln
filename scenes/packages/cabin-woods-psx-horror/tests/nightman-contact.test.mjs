import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NIGHTMAN_CONTACT,HAND_CONTACT_VOLUME,segmentToAabbDistanceSquared,nightmanPlayerContact,nightmanBoardContact} from '../src/game/nightman-contact.mjs';
const f=JSON.parse(fs.readFileSync(new URL('fixtures/nightman-contact.json',import.meta.url),'utf8'));
const root={position:[0,0,0],forward:[1,0,0]},player=(feet=[1.45,0,0],wrists=f.phases['0.18'])=>({root,feet,wrists,player:f.player});
const board=(id,time,visible=true)=>({root,target:[1.3,.95,0],wrists:f.phases[String(time)],boardBox:f.boards[String(id)].box,boardVisible:visible});
test('piecewise segment/AABB distance handles interior, parallel face, edge and point cases',()=>{
 const min=[-1,-1,-1],max=[1,1,1];
 assert.equal(segmentToAabbDistanceSquared([-2,0,0],[2,0,0],min,max),0);
 assert.equal(segmentToAabbDistanceSquared([-2,2,0],[2,2,0],min,max),1);
 assert.equal(segmentToAabbDistanceSquared([-2,2,2],[2,2,2],min,max),2);
 assert.equal(segmentToAabbDistanceSquared([2,0,0],[2,0,0],min,max),1);
});
test('actual saved rig fists contact head-on standing player at1.45m and permit backward dodge',()=>{
 assert.equal(nightmanPlayerContact(player()),true);
 assert.equal(nightmanPlayerContact(player([1.6,0,0])),false);
 assert.equal(nightmanPlayerContact(player([2.05,0,0])),false);
 assert.equal(nightmanPlayerContact(player([.7,0,0])),false);
});
test('facing gate rejects side/rear attacks and respects thirty-degree contact envelope',()=>{
 assert.equal(nightmanPlayerContact(player([1.45*Math.cos(Math.PI/6),0,1.45*Math.sin(Math.PI/6)])),true);
 assert.equal(nightmanPlayerContact({...player(),root:{position:[0,0,0],forward:[-1,0,0]}}),false);
 assert.equal(nightmanPlayerContact(player([1.45*Math.cos(Math.PI/4),0,1.45*Math.sin(Math.PI/4)])),false);
});
test('translated/yawed saved wrist matrices preserve actual world contact',()=>{assert.equal(nightmanPlayerContact({...f.placed,player:f.player}),true);});
test('Three-shaped Matrix4/Vector3/Box3 inputs work without importing Three into helper',()=>{
 const v=a=>({x:a[0],y:a[1],z:a[2]}),wrists=Object.fromEntries(Object.entries(f.phases['0.18']).map(([name,elements])=>[name,{elements}]));
 assert.equal(nightmanPlayerContact({wrists,root:{position:v([0,0,0]),forward:v([1,0,0])},feet:v([1.45,0,0]),player:f.player}),true);
 const input=board(1,.18);assert.equal(nightmanBoardContact({...input,wrists,boardBox:{min:v(input.boardBox.min),max:v(input.boardBox.max)}}),true);
});
test('per-board phases touch actual saved board Box3 volumes, wrong phase and hidden board miss',()=>{
 assert.equal(nightmanBoardContact(board(3,.04)),true);
 assert.equal(nightmanBoardContact(board(2,.12)),true);
 assert.equal(nightmanBoardContact(board(1,.18)),true);
 assert.equal(nightmanBoardContact(board(3,.18)),false);
 assert.equal(nightmanBoardContact(board(2,.18)),false);
 assert.equal(nightmanBoardContact(board(1,.18,false)),false);
 assert.equal(nightmanBoardContact({...board(1,.18),target:[1.5,.95,0]}),false);
});
test('rigid/uniform validation rejects shear, unequal scale, missing and nonfinite matrices',()=>{
 const changed=edit=>{const w=structuredClone(f.phases['0.18']);edit(w.Nightman_L_Wrist);return player([1.45,0,0],w);};
 assert.throws(()=>nightmanPlayerContact(changed(m=>{m[0]*=2;m[1]*=2;m[2]*=2;})),/uniform/i);
 assert.throws(()=>nightmanPlayerContact(changed(m=>{m[4]+=.3*m[0];m[5]+=.3*m[1];m[6]+=.3*m[2];})),/orthogonal/i);
 assert.throws(()=>nightmanPlayerContact(changed(m=>{m[12]=NaN;})),/finite/i);
 assert.throws(()=>nightmanPlayerContact(player([1.45,0,0],{})),/Wrist/);
 const uniform=changed(m=>{for(const i of [0,1,2,4,5,6,8,9,10,12,13,14])m[i]*=2;});assert.doesNotThrow(()=>nightmanPlayerContact(uniform));
});
test('malformed capsule/board boxes fail closed with explicit diagnostics',()=>{
 assert.throws(()=>nightmanPlayerContact({...player(),player:{radius:.28,height:.4}}),/capsule/i);
 assert.throws(()=>nightmanBoardContact({...board(1,.18),boardBox:{min:[2,0,0],max:[1,1,1]}}),/box/i);
});
test('contract binds exact inscribed boxes and source timings',()=>{
 assert.deepEqual(HAND_CONTACT_VOLUME,{min:[-.13,-.26,-.13],max:[.13,.04,.13]});assert.deepEqual(NIGHTMAN_CONTACT.boardTimes,[.18,.12,.04]);
});
