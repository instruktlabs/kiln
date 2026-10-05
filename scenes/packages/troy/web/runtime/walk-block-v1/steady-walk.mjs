import {planarWalkFootprint} from './steady-slope.mjs';
import {createTravelPlan} from '../landing-v11/src/travel-footprints.mjs';import {createCrewMarch} from '../regroup-block-v1/march.mjs';
// Greek-rig adapter: caller provides the qualified completed unloading stance.
// A middle two-step window avoids route-start/end acceleration. Root travel is
// removed for the bake and supplied separately from each live supported route.
export function createSteadyWalk(T,{root,id,stride=.34,stepDuration=.34,slope={}}){
 const footprint=(side,z)=>planarWalkFootprint(side,z,slope),feet={left:footprint('left',0),right:footprint('right',0)},steps=Array.from({length:32},(_,i)=>footprint(i%2?'right':'left',stride*(i+1))),plan=createTravelPlan({feet,steps,duration:stepDuration,lift:.1}),march=createCrewMarch(T,{root,id,travelPlan:plan}),duration=stepDuration*2;
 return {duration,sample(time){if(!Number.isFinite(time)||time<0||time>duration)throw Error('Invalid cycle time '+time+' duration '+duration);const state=march.sample(8*stepDuration+time);root.position.set(0,0,0);root.quaternion.identity();root.updateMatrixWorld(true);return state;}};
}
