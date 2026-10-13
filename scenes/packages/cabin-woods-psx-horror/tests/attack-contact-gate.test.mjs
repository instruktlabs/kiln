import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,tick} from '../src/game/state.mjs';
test('distance alone cannot damage a player when physical contact is missing',()=>{
 const state=createGameState({nightmanSpawn:[1.45,0,0]});Object.assign(state.nightman,{active:true,mode:'strike',clock:.17,attackApplied:false,target:'player'});
 tick(state,.02,[0,0,0],{attackContact:()=>false});assert.equal(state.health,100);assert.equal(state.nightman.attackApplied,true);
});
test('a board selected for the swing is hit at its own phase and cannot retarget after removal',()=>{
 const state=createGameState({nightmanSpawn:[1.3,0,0],windows:[{id:'w',position:[0,.95,0]}]});state.windows[0].boards=[0,0,2];Object.assign(state.nightman,{active:true,mode:'approach'});
 const samples=[],env={canReach:()=>false,windowTarget:()=>({id:'w',position:[0,.95,0],approach:[1.3,0,0]}),attackContact:input=>{samples.push(input);return true;}};
 tick(state,.01,[-1,0,0],env);assert.equal(state.nightman.boardIndex,2);Object.assign(state.nightman,{mode:'strike',clock:0});tick(state,.03,[-1,0,0],env);assert.equal(samples.length,0);tick(state,.02,[-1,0,0],env);assert.equal(samples[0].time,.04);assert.equal(samples[0].index,2);assert.equal(state.windows[0].boards[2],1);
 Object.assign(state.nightman,{mode:'strike',clock:0,attackApplied:false});state.windows[0].boards=[2,0,0];tick(state,.05,[-1,0,0],env);assert.equal(state.windows[0].boards[0],2);assert.equal(samples.length,1);
});
