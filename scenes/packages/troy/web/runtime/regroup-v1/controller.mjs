import {createRegroupTimeline} from './timeline.mjs';import {createCrewMarch} from './march.mjs';import {createCrewShoreIdle} from '../crew-idle-v1/shore-idle.mjs';
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*u*(10+u*(-15+6*u));};
export function createRegroupController(T,{ships,record,landingDuration,queueDuration,planForRoute}){
 const timeline=createRegroupTimeline({units:record.units,landingDuration}),units=new Map(record.units.map(u=>[u.id,u])),cache=new Map();
 // These paths are tied to a measured landing frame, clock and actor roster.
 // Reject stale placement inputs rather than walking a valid route in the wrong place.
 if(!Array.isArray(ships)||ships.length!==units.size||new Set(ships.map(s=>s.roster.id)).size!==ships.length)throw Error('Regroup ship roster mismatch');
 for(const ship of ships){const unit=units.get(ship.roster.id);if(!unit)throw Error('Regroup ship roster mismatch');
  if((ship.roster.initialTime===Infinity?'landed':ship.roster.initialTime)!==unit.initialTime)throw Error('Regroup landing clock mismatch');
  const frame=ship.roster.frame;if(!frame||frame.yaw!==unit.frame.yaw||frame.position?.length!==3||frame.position.some((v,i)=>v!==unit.frame.position[i]))throw Error('Regroup landing frame mismatch');
  const ids=ship.crew.actors.map(a=>a.entry.id),routes=unit.routes.map(r=>r.id);if(ids.length!==routes.length||new Set(ids).size!==ids.length||new Set(routes).size!==routes.length||ids.some(id=>!routes.includes(id)))throw Error('Regroup actor roster mismatch');
 }
 const snapshot=root=>{const pose=[];root.traverse(n=>pose.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]));return pose;},restore=pose=>{for(const [n,p,q,s]of pose){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}};
 function ensure(ship){if(cache.has(ship.roster.id))return cache.get(ship.roster.id);const unit=units.get(ship.roster.id);if(!unit||unit.routes.length!==ship.crew.actors.length)throw Error('Regroup roster mismatch');const routes=new Map(unit.routes.map(r=>[r.id,r]));const actors=ship.crew.actors.map(a=>{const route=routes.get(a.entry.id);if(!route)throw Error('Missing regroup actor');a.actor.sample(a.actor.duration);const initial=snapshot(a.root),idle=createCrewShoreIdle(T,{root:a.root}),march=createCrewMarch(T,{root:a.root,id:a.entry.id,plan:route.plan,travelPlan:planForRoute?.(route,unit)});march.sample(march.duration);const final=snapshot(a.root),finalIdle=createCrewShoreIdle(T,{root:a.root});restore(initial);a.root.updateMatrixWorld(true);return {a,initial,idle,march,final,finalIdle};});cache.set(ship.roster.id,actors);return actors;}
 function update(ship,time,state,{tryMarch}={}){if(state.phase==='waiting')return [];const unit=units.get(ship.roster.id),actors=ensure(ship),clock=(ship.roster.initialTime===Infinity?landingDuration:ship.roster.initialTime)+time;
  const changed=[];for(const [i,{a,initial,idle,march,final,finalIdle}]of actors.entries()){if(state.phase==='preparing'){restore(initial);idle.sample(Math.max(0,clock-(landingDuration-queueDuration+a.entry.start+a.entry.duration)));const weight=smooth(state.localTime/unit.prepareDuration);for(const [n,,q]of initial)n.quaternion.slerp(q,weight);a.root.updateMatrixWorld(true);}else if(state.phase==='marching'){if(tryMarch?.({id:unit.id+'/'+a.entry.id,index:ship.start+i,actor:a,plan:march.plan,time:state.localTime,ship})===true)continue;march.sample(state.localTime);}else{restore(final);finalIdle.sample(state.localTime);}changed.push(ship.start+i);}
  return changed;
 }
 return {duration:timeline.duration,sample:timeline.sample,update,stats:time=>record.units.map(u=>({...timeline.sample(u.id,time),targetCenter:u.targetCenter})),dispose:()=>cache.clear()};
}
