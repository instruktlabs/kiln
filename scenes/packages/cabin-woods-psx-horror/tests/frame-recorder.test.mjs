import test from 'node:test';import assert from 'node:assert/strict';import {createFrameRecorder} from '../src/game/frame-recorder.mjs';
test('benchmark records bounded frame intervals without affecting ordinary scene diagnostics',()=>{
 const off=createFrameRecorder(false),on=createFrameRecorder(true,3);off.record(1,{frameTimestamp:10});assert.deepEqual(off.snapshot(),[]);
 for(let i=1;i<=5;i++)on.record(i,{frameTimestamp:i*20,collidersMs:.1});
 const samples=on.snapshot();assert.equal(samples.length,3);assert.deepEqual(samples.map(s=>s.serial),[3,4,5]);assert.ok(samples.every(s=>s.frameIntervalMs===20));
 on.record(6,{frameTimestamp:120});assert.deepEqual(samples.map(s=>s.serial),[3,4,5],'snapshot ownership survives new frames');
});
