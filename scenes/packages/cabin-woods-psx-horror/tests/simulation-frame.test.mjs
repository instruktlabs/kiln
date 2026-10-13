import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulationFrame} from '../src/game/simulation-frame.mjs';
import {createGameState,tick,RULES} from '../src/game/state.mjs';import {resolvePlayer} from '../src/game/collision.mjs';
test('30, 60 and 120 FPS plus a slow 100ms frame preserve movement, timers and battery consumption',()=>{
 const run=interval=>{const step=createSimulationFrame(),state=createGameState(),frames=Math.round(2/interval);let position=[0,0,0];for(let i=0;i<frames;i++){const frame=step(interval);for(let j=0;j<frame.count;j++){position=resolvePlayer(position,[RULES.walkSpeed*frame.step,0,0],[]);tick(state,frame.step,position);}}return {position,time:state.time,battery:state.battery};};
 const expected=run(1/120);for(const interval of [1/60,1/30,.1]){const actual=run(interval);for(const key of ['time','battery'])assert(Math.abs(actual[key]-expected[key])<1e-10);assert(Math.abs(actual.position[0]-5.2)<1e-10);}
});
test('catch-up work is bounded, reports discarded stall time and reuses its result',()=>{const step=createSimulationFrame(),first=step(1/60);assert.equal(first.count,1);assert.equal(step(1),first);assert.equal(first.elapsed,.25);assert.equal(first.dropped,.75);assert.equal(first.count,15);assert(first.step<=1/60);assert.throws(()=>step(NaN));assert.throws(()=>step(-1));});
