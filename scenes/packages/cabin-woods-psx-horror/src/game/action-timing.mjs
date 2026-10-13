import {act} from './state.mjs';
export const canChopAt=(position,station)=>!!station&&Math.hypot(position[0]-station[0],position[2]-station[2])<=.85;

/** The animation drives impact timing; aim and range are sampled when contact occurs. */
export function beginAttack(state,{duration=.78,impactPhase=.58,action='attack',targetId}={}){
 if(!['axe','shotgun'].includes(state.weapon)){state.message='Equip the axe or shotgun first.';return null;}
 if(state.health<=0||state.cooldown>0)return null;
 if(state.weapon==='shotgun'&&!state.inventory.shells){state.message='No shells. Search the forest supply cache.';return null;}
 if(state.weapon==='shotgun'&&state.loadedShells===0){state.message='The chambers are empty. Press R to reload.';return null;}
 return {weapon:state.weapon,action,targetId,time:0,duration,impactTime:duration*(state.weapon==='shotgun'?.05:impactPhase),applied:false,done:false};
}
export function advanceAttack(swing,state,delta,targetAtImpact){
 if(!swing||swing.done)return null;
 swing.time+=delta;let result=null;
 if(!swing.applied&&swing.time>=swing.impactTime){
  swing.applied=true;
  // Tool switching is locked by the runtime while a swing is active.
  if(state.weapon===swing.weapon){const aim=targetAtImpact();if(swing.action==='attack'||aim.targetId===swing.targetId)result=act(state,swing.action,aim);else state.message='The axe misses the chopping block.';}
 }
 swing.done=swing.time>=swing.duration;
 return result;
}
