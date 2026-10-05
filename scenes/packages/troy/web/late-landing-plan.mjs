import {sampleFleetShip} from './fleet-plan.mjs';
// These outer bays reuse the proved X-invariant beach, local landing frame and
// supported queue paths. They do not imply arbitrary-terrain navigation support.
export function createLateLandingPlan(fleet,entries,{joinOffset,shipY}){
 if(fleet.length!==4||new Set(fleet.map(s=>s.id)).size!==4)throw Error('Later wave needs four ships');
 if(entries.length!==28||!Array.isArray(joinOffset)||joinOffset.length!==3||!joinOffset.every(Number.isFinite)||!Number.isFinite(shipY))throw Error('Invalid later landing inputs');
 const xs=[-354,-294,246,306],handoffTime=240,rosters=fleet.map((ship,i)=>{
  const actorIds={};for(const e of entries){const a=ship.crew.find(a=>a.row===e.row&&a.side===e.side);if(!a)throw Error('Missing later rower');actorIds[e.id]=a.id;}
  if(new Set(Object.values(actorIds)).size!==28)throw Error('Later crew identity mismatch');
  return {id:ship.id,frame:{position:[xs[i],0,3],yaw:-.65},initialTime:-i*6,actorIds};
 }),byId=new Map(rosters.map(r=>[r.id,r]));
 const owner=time=>{if(!Number.isFinite(time)||time<0)throw Error('Invalid later landing time');return time<handoffTime?'rowing':'landing';};
 function sampleApproach(ship,time){owner(time);const r=byId.get(ship.id);if(!r)throw Error('Unknown later ship');const [x,y,z]=joinOffset,c=Math.cos(r.frame.yaw),s=Math.sin(r.frame.yaw),target=[r.frame.position[0]+c*x+s*z,r.frame.position[1]+y+shipY,r.frame.position[2]-s*x+c*z];
  // Stretch the proved approach over240seconds and finish on a recovery pose
  // (174source seconds,58whole strokes). Landing starts at the same frame/phase.
  const distance=140,state=sampleFleetShip({...ship,delay:0,yaw:r.frame.yaw,position:[target[0]-s*distance,target[1],target[2]-c*distance],endZ:target[2]},time*180/handoffTime);state.position[0]=target[0]-s*distance*(1-state.rowingTime/174);return state;
 }
 return {rosters,handoffTime,owner,sampleApproach,duration:sequenceDuration=>handoffTime+sequenceDuration+18};
}
