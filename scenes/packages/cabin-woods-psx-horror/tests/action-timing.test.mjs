import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/game/state.mjs';
import {beginAttack,advanceAttack,canChopAt} from '../src/game/action-timing.mjs';
test('chopping reach uses body-to-station spacing rather than a sloped eye ray',()=>{assert(canChopAt([5.3,0,5.6],[6,0,5.6]));assert(!canChopAt([4.5,0,5.6],[6,0,5.6]));});
test('unarmed input cannot start an attack animation or spend ammunition',()=>{const state=createGameState();state.weapon='unarmed';assert.equal(beginAttack(state),null);assert.equal(state.loadedShells,2);assert.equal(state.cooldown,0);});

test('axe impact is delayed to the clip event and uses the target at impact, exactly once',()=>{
 const state=createGameState({trees:[{id:'tree',position:[1,0,0]}]});
 state.weapon='axe';
 const swing=beginAttack(state,{duration:1,impactPhase:.58});assert(swing);assert.equal(state.trees[0].hits,0);
 advanceAttack(swing,state,.57,()=>({position:[0,0,0],targetId:'tree'}));assert.equal(state.trees[0].hits,0);
 advanceAttack(swing,state,.02,()=>({position:[0,0,0],targetId:'tree'}));assert.equal(state.trees[0].hits,1);
 advanceAttack(swing,state,.5,()=>({position:[0,0,0],targetId:'tree'}));assert.equal(state.trees[0].hits,1);assert(swing.done);
});
test('moving away before impact misses, and empty shells cannot start a shot',()=>{
 const state=createGameState({trees:[{id:'tree',position:[1,0,0]}]});
 state.weapon='axe';
 const swing=beginAttack(state,{duration:1,impactPhase:.58});advanceAttack(swing,state,.7,()=>({position:[8,0,0],targetId:'tree'}));assert.equal(state.trees[0].hits,0);
 state.weapon='shotgun';state.inventory.shells=0;state.cooldown=0;assert.equal(beginAttack(state),null);
});
test('splitting consumes a log at impact only while the station remains in reach',()=>{
 const state=createGameState();state.weapon='axe';state.inventory.logs=2;
 const swing=beginAttack(state,{duration:1.4,action:'chop',targetId:'chop'});
 advanceAttack(swing,state,.7,()=>({targetId:'chop',near:true}));assert.equal(state.inventory.logs,2);
 advanceAttack(swing,state,.2,()=>({targetId:'chop',near:true}));assert.equal(state.inventory.logs,1);assert.equal(state.inventory.firewood,4);
 advanceAttack(swing,state,.5,()=>({targetId:'chop',near:true}));assert.equal(state.inventory.logs,1);
 const miss=beginAttack(state,{duration:1.4,action:'chop',targetId:'chop'});advanceAttack(miss,state,1,()=>({targetId:'tree',near:false}));assert.equal(state.inventory.logs,1);
});
