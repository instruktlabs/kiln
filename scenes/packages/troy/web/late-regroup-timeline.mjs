import {createRegroupTimeline} from './runtime/regroup-block-v1/timeline.mjs';
export function createLateRegroupTimeline({units,landingDuration}){
 if(!Array.isArray(units)||units.some(u=>!Number.isFinite(u.initialTime)||u.initialTime>0||!Number.isFinite(u.holdDuration)))throw Error('Invalid later regroup clocks');
 // A negative local offset is a later queue start. Express the same waiting
 // boundary as an extended hold, preserving the original bank generator module.
 return createRegroupTimeline({landingDuration,units:units.map(u=>({...u,initialTime:0,holdDuration:u.holdDuration-u.initialTime}))});
}
