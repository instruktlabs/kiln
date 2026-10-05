import {COMBAT} from './hero-combat.mjs';
import {heroShieldPose} from './hero-shield.mjs';
import {heroExplorationPose} from './hero-exploration-pose.mjs';
import {createMeshContacts} from './hero-weapon-contacts.mjs';
const ease=x=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(10+t*(-15+6*t));},wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
// Stateful live-input adapter, distinct from the exactly seekable paired clip.
// Source geometry is immutable. Only the two consumer rigs are articulated.
export function createHeroCombatRig(T,{pair,groundHeight}){
 // A 0.22s alternating swing left the opposite planted foot behind the
 // full-speed bot through recovery/approach reversals. Keep the same authored
 // contact targets and lift, but complete each swing before that reach is lost.
 const swingDuration=.16;
 const up=new T.Vector3(0,1,0),sole=new T.Vector3(0,-.085,.065),v=a=>new T.Vector3(...a),detector=createMeshContacts(T);let last=-1,feet=new Map(),pose=new Map(),metrics=null;
 const footQ=f=>new T.Quaternion().setFromUnitVectors(up,v(f.normal)).multiply(new T.Quaternion().setFromAxisAngle(up,f.yaw));
 function support(a,fighter,side,lead=0,exploring=false){
  const yaw=new T.Quaternion().setFromAxisAngle(up,fighter.yaw),offset=v([side==='left'?.13:-.13,0,exploring?.065:.065+(side==='left'?.14:-.14)]).applyQuaternion(yaw),x=fighter.x+offset.x+fighter.vx*lead,z=fighter.z+offset.z+fighter.vz*lead,h=groundHeight,normal=v([-(h(x+.05,z)-h(x-.05,z))/.1,1,-(h(x,z+.05)-h(x,z-.05))/.1]).normalize(),f={position:[x,0,z],normal:normal.toArray(),yaw:fighter.yaw},q=footQ(f),p=a.get('Mesh_foot_'+side).geometry.attributes.position;let y=-Infinity;
  for(let i=0;i<p.count;i++){const delta=new T.Vector3().fromBufferAttribute(p,i).sub(sole).applyQuaternion(q);y=Math.max(y,h(x+delta.x,z+delta.z)-delta.y);}f.position[1]=y+.0003;return f;
 }
 function render(state){
  const dt=last<0||state.time<last?0:state.time-last,reset=last<0||state.time<last;last=state.time;if(reset){feet.clear();pose.clear();}
  const measurements=[],before=new Map();
  for(const a of pair.actors){
   const f=state.actors.find(f=>f.id===a.id),enemy=state.actors.find(o=>o.id!==a.id);if(!f)throw Error('Missing combat actor');
   for(const[n,p,q]of a.baseline){n.position.copy(p);n.quaternion.copy(q);}a.group.position.set(f.x,groundHeight(f.x,f.z),f.z);a.group.rotation.set(0,f.yaw,0);
   const exploring=state.status==='exploring',carry=exploring?heroExplorationPose(T,a):null;
   let steps=feet.get(a.id);if(!steps){steps={left:support(a,f,'left',0,exploring),right:support(a,f,'right',0,exploring),next:'left',swing:null};feet.set(a.id,steps);}
   if(steps.swing&&state.time>=steps.swing.start+swingDuration){steps[steps.swing.side]=steps.swing.to;steps.next=steps.swing.side==='left'?'right':'left';steps.swing=null;}
   if(!steps.swing&&dt>0&&(state.status==='fighting'||state.status==='exploring')){
    const side=steps.next,desired=support(a,f,side,.12,exploring),old=steps[side],distance=Math.hypot(desired.position[0]-old.position[0],desired.position[2]-old.position[2]);if(distance>.16||Math.abs(wrap(desired.yaw-old.yaw))>.18)steps.swing={side,start:state.time,from:structuredClone(old),to:desired};
   }
   const sampled={left:structuredClone(steps.left),right:structuredClone(steps.right)};
   if(steps.swing){const s=steps.swing,p=(state.time-s.start)/swingDuration,u=ease(p),side=s.side;sampled[side]={position:s.from.position.map((n,i)=>n+(s.to.position[i]-n)*u+(i===1?.07*Math.sin(Math.PI*p)**2:0)),yaw:s.from.yaw+wrap(s.to.yaw-s.from.yaw)*u,normal:v(s.from.normal).lerp(v(s.to.normal),u).normalize().toArray()};}
   const action=f.action,spec=COMBAT.attacks[action?.kind],age=action?state.time-action.start:0,wind=spec?1-ease((age-spec.wind*.7)/(spec.wind*.3)):0,strike=spec?ease(age/spec.wind)*(1-ease((age-spec.wind-spec.active)/spec.recovery)):0,twist=-.2*wind+.16*strike;
   a.get('Joint_hips').position.y=.88-.01*strike-(action?.kind==='stun'?.025:0)-(f.health===0?.10:0);a.get('Joint_hips').position.z=.01-.02*wind+.03*strike;
   a.get('Joint_spine').rotation.set(.035+.04*strike,twist,0);const look=state.status==='exploring'?0:wrap(Math.atan2(enemy.x-f.x,enemy.z-f.z)-f.yaw);a.get('Joint_neck').rotation.set(-.035,Math.max(-.6,Math.min(.6,look-twist))*.85,0);a.get('Joint_head').rotation.set(0,Math.max(-.6,Math.min(.6,look-twist))*.15,0);pair.group.updateMatrixWorld(true);
   let lower=0;const targets={};for(const side of ['left','right']){const q=footQ(sampled[side]),ankle=v(sampled[side].position).sub(sole.clone().applyQuaternion(q)),origin=a.get('Joint_hip_'+side).getWorldPosition(new T.Vector3()),horizontal=(origin.x-ankle.x)**2+(origin.z-ankle.z)**2;if(horizontal>=.825**2)throw Error('Live combat foot exceeds leg reach');lower=Math.max(lower,origin.y-ankle.y-Math.sqrt(.825**2-horizontal));targets[side]={ankle,q};}
   a.get('Joint_hips').position.y-=lower;pair.group.updateMatrixWorld(true);
   for(const side of ['left','right']){const {ankle,q}=targets[side];a.solver.chain(a.get('Joint_hip_'+side),a.get('Joint_knee_'+side),a.get('Joint_ankle_'+side),a.body.worldToLocal(ankle.clone()),[.42,.415],[0,0,1],a.group.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));}
   const swordQ=axis=>new T.Quaternion().setFromUnitVectors(up,v(axis).normalize()),guard=carry?.sword??{w:v([-.36,1.10,.14]),q:swordQ([-.10,.95,.25])},windPose={w:v([-.36,1.56,.22]),q:swordQ([-.28,.96,.12])};let wanted=guard,driven=false;
   // Recover on the sword side, keeping the hand in front until it clears
   // the shield edge, then lower it. A straight line cut through that edge.
   function recover(from,progress){const via={w:v([-.42,1.30,.42]),q:guard.q},first=progress<.5,a=first?from:via,b=first?via:guard,u=ease(first?progress*2:(progress-.5)*2);return{w:a.w.clone().lerp(b.w,u),q:a.q.clone().slerp(b.q,u)};}
   let old=pose.get(a.id);if(!old){old={w:guard.w.clone(),q:guard.q.clone()};pose.set(a.id,old);}
   before.set(a.id,{w:old.w.clone(),q:old.q.clone(),guard});
   if(spec){
    if(old.attackKey!==action.start){old.attackKey=action.start;old.attackFrom={w:old.w.clone(),q:old.q.clone()};old.impact=null;}
    const dist=Math.hypot(enemy.x-f.x,enemy.z-f.z),q=swordQ([.27,-.21,.94]),hand=q.clone().multiply(a.socket.quaternion.clone().invert()),contact=v([enemy.blocking?-.08:.20,1.27,Math.min(1.03,Math.max(.87,dist-.18))]);let hit={w:contact.sub(v([0,.63,0]).applyQuaternion(q)).sub(a.socket.position.clone().applyQuaternion(hand)),q};
    if(age<spec.wind){const u=ease(age/(spec.wind*.8));wanted={w:old.attackFrom.w.clone().lerp(windPose.w,u),q:old.attackFrom.q.clone().slerp(windPose.q,u)};}
    else if(age<spec.wind+spec.active){const u=ease((age-spec.wind)/(spec.active*.7));wanted={w:windPose.w.clone().lerp(hit.w,u),q:windPose.q.clone().slerp(hit.q,u)};}
    else wanted=recover(hit,(age-spec.wind-spec.active)/spec.recovery);driven=true;
    if(old.impact&&['block','guard-break'].includes(action.result))wanted=recover(old.impact,(state.time-old.impact.time)/.18);
   }
   if(action?.kind==='stun'||f.health===0)wanted={w:v([-.36,.99,.14]),q:swordQ(f.health===0?[-.10,-.95,.15]:[-.10,.95,.25])};
   if(driven){old.w.copy(wanted.w);old.q.copy(wanted.q);}else if(dt>0){const blend=1-Math.exp(-35*dt);old.w.lerp(wanted.w,blend);old.q.slerp(wanted.q,blend);}
   a.applySwordPose(old.w,old.q);
   const guardWeightTarget=exploring?0:Number(f.blocking);old.shieldWeight??=guardWeightTarget;
   if(dt>0)old.shieldWeight+=(guardWeightTarget-old.shieldWeight)*(1-Math.exp(-25*dt));
   // Smooth the guard action, then solve from this frame's actual shoulder.
   // Smoothing a stale world target tilted the forearm during exploration.
   old.shield=heroShieldPose(T,a,old.shieldWeight);a.applyShieldPose(old.shield.w,old.shield.q);
   measurements.push({id:a.id,pelvisLowering:lower,stance:steps.swing?(steps.swing.side==='left'?'right':'left'):'both',feet:sampled});
  }
  // Stop the actual arm pose at a shield interception before the contact host
  // samples it. Bisection is bounded to this tick's target path; it is not a
  // rigid-body solver. The 0.3 mm visual clearance lies within the 0.5 mm guard skin.
  pair.group.updateMatrixWorld(true);
  for(const a of pair.actors){
   const f=state.actors.find(f=>f.id===a.id),enemy=state.actors.find(f=>f.id!==a.id),other=pair.actors.find(b=>b!==a),old=pose.get(a.id),spec=COMBAT.attacks[f.action?.kind];
   if(!spec)continue;
   const shield=detector.snapshot(other.get('shield'));
   const blocked=()=>Boolean(detector.contact(detector.snapshot(a.get('sword'),true),shield,null,null,.0003));
   if(!blocked())continue;
   const end={w:old.w.clone(),q:old.q.clone()},start=before.get(a.id);
   const apply=u=>{old.w.copy(start.w).lerp(end.w,u);old.q.copy(start.q).slerp(end.q,u);a.applySwordPose(old.w,old.q);};
   apply(0);if(blocked()){start.w.copy(start.guard.w);start.q.copy(start.guard.q);apply(0);}
   if(blocked())throw Error('No safe shield recoil pose');
   let lo=0,hi=1;for(let i=0;i<16;i++){const mid=(lo+hi)/2;apply(mid);if(blocked())hi=mid;else lo=mid;}apply(lo);
   if(!old.impact)old.impact={time:state.time,w:old.w.clone(),q:old.q.clone()};
  }
  pair.group.updateMatrixWorld(true);metrics={actors:measurements,scope:'Live feet/arm IK with bounded shield interception/recoil; contact host samples the displayed pose at each fixed tick'};return metrics;
 }
 return {render,reset(){last=-1;feet.clear();pose.clear();},stats:()=>metrics};
}
