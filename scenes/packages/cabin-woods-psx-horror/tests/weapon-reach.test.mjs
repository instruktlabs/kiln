import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createGameState} from '../src/game/state.mjs';
test('axe cannot harvest at ordinary prop-use distance but hits within the local melee envelope',()=>{
 const s=createGameState({trees:[{id:'t',position:[1.5,0,0]}]});
 act(s,'equip',{kind:'axe'});
 act(s,'attack',{targetId:'t',position:[0,0,0]});assert.equal(s.trees[0].hits,0);
 s.cooldown=0;act(s,'attack',{targetId:'t',position:[.7,0,0]});assert.equal(s.trees[0].hits,1);
});
