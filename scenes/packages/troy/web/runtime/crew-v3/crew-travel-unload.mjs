import {applyTravelClearance,mastCorridorTuck,travelClearanceWeight} from '../landing-v11/web/crew-travel-clearance.mjs';
import {createCrewStand} from '../landing-v11/web/crew-exit.mjs';import {createCrewAisleStep} from './crew-step.mjs';import {createCrewTravelWalk} from './crew-travel-walk.mjs';
export function createCrewTravelUnload(T,{root,ship,surfaces,row,side,id,stand:existingStand,staging,cachedPlan,finalHeading}){
 const stand=existingStand||createCrewStand(T,{root,ship,row,side,id});stand.sample(3.6);
 // The completed stand is invariant. Preserve its exact local transforms and
 // this actor's parked oar; reverse seeks may have put both back into rowing.
 const baseline=[];root.traverse(n=>baseline.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]));
 for(const name of [`OarPivot_${row}_${side}`,`OarGrip_${row}_${side}`,`Mesh_ArticulatedOar_${row}_${side}`]){const n=ship.getObjectByName(name);if(!n)throw Error('Missing cached oar '+name);baseline.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]);}
 const pivot=ship.getObjectByName(`OarPivot_${row}_${side}`);
 function restoreStand(){for(const [n,p,q,s]of baseline){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}root.updateMatrixWorld(true);pivot.updateWorldMatrix(true,true);}
 const aisle=createCrewAisleStep(T,{root,ship,id});aisle.sample(aisle.duration);const walk=createCrewTravelWalk(T,{root,ship,surfaces,id,staging,cachedPlan,finalHeading});
 const walkStart=3.6+aisle.duration,duration=walkStart+walk.duration;
 function sampleBase(time){if(!Number.isFinite(time)||time<0)throw Error('Invalid unloading time');if(time<=3.6)return {...stand.sample(time),stage:'stand'};restoreStand();if(time<walkStart)return {...aisle.sample(time-3.6),stage:'aisle'};return {...walk.sample(time-walkStart),stage:time>=duration?'ashore':'walking'};}
 function sample(time){const state=sampleBase(time);// Local exit-01 mast corridor: briefly fold the forearms to pass the mast
 // and waiting occupants, without moving the weapon or shortening the arms.
 const tuck=mastCorridorTuck(root);
 applyTravelClearance(T,root,travelClearanceWeight(time),{tuck});return state;}
 sample(0);const seatedPosition=root.position.toArray();
 function positionAt(time){if(time<=3.6){const u=Math.max(0,Math.min(1,(time-2)/1.6)),s=u*u*u*(10+u*(-15+6*u));return seatedPosition.map((v,i)=>v+(stand.endPosition.toArray()[i]-v)*s);}const state=time<walkStart?aisle.plan.sample(time-3.6):walk.plan.sample(time-walkStart),a=state.feet.left.position,b=state.feet.right.position;return [state.bodyCenter?.[0]??(a[0]+b[0])/2,Math.min(a[1],b[1])-.085,state.bodyCenter?.[2]??(a[2]+b[2])/2];}
 return {positionAt,sample,duration,walkStart,stand,aisle,walk,id,root};
}
