import test from 'node:test';import assert from 'node:assert/strict';
import {createGameState,tick} from '../src/game/state.mjs';
test('stationary and collision-blocked spiders do not advance the walking gait',()=>{
 const s=createGameState({spiders:[{id:'s',position:[12,0,0]}]});
 for(let i=0;i<12;i++)tick(s,.1,[0,0,0]);assert.equal(s.spiders[0].phase,0);assert.equal(s.spiders[0].moving,false);
 tick(s,.1,[10,0,0],{move:position=>[...position]});assert.equal(s.spiders[0].phase,0);assert.equal(s.spiders[0].moving,false);
 tick(s,.1,[10,0,0]);assert.ok(s.spiders[0].phase>0);assert.equal(s.spiders[0].moving,true);
 const phase=s.spiders[0].phase;tick(s,.1,[0,0,0]);assert.equal(s.spiders[0].phase,phase);assert.equal(s.spiders[0].moving,false);
});
