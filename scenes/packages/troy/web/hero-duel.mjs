import {createTravelPlan} from './runtime/landing-v10/src/travel-footprints.mjs';
import {createJointPoseSolver} from './runtime/crew-v3/joint-pose.mjs';
import {heroShieldPose} from './hero-shield.mjs';
import {createHeroGripAdapter} from './hero-grips.mjs';
import {createShieldStrikePose} from './hero-shield-strike.mjs';
import {createMeshContacts} from './hero-weapon-contacts.mjs';

// Troy consumer choreography. The exported masters and their clips are retained;
// two detailed rigid rigs are driven here, separately from the distant crowds.
export const HERO_DUEL=Object.freeze({approachDuration:6.16,retreatStart:14,duration:20.16,contacts:Object.freeze([8.8,11.6]),shieldContacts:Object.freeze([Object.freeze({time:9.75,attacker:'achilles',defender:'hector'}),Object.freeze({time:12.5,attacker:'hector',defender:'achilles'})]),bladeContact:.46});
const ease=x=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(10+t*(-15+6*t));};
const validTime=t=>{if(!Number.isFinite(t)||t<0)throw Error('Invalid hero time');};
export function createHeroDuel(T,{models,placements,groundHeight,jointPoseFactory=createJointPoseSolver,lookupMode='cached'}){
 if(!['cached','reference'].includes(lookupMode))throw Error('Invalid hero lookup mode');
 const group=new T.Group();group.name='hero-pair';
 const up=new T.Vector3(0,1,0),sole=new T.Vector3(0,-.085,.065),v=a=>new T.Vector3(...a);
 const actors=placements.map(p=>{
  if(!models[p.asset]||p.scale!==1)throw Error('Unsupported hero input '+p.asset);
  const actor=new T.Group(),body=models[p.asset].clone(true);actor.name=p.id;actor.add(body);group.add(actor);actor.rotation.y=p.yaw;
  // This private clone has fixed node ownership. Equipment reparenting keeps
  // node identity; preserve Three's first-name match when building the index.
  const nodes=new Map();body.traverse(n=>{if(!nodes.has(n.name))nodes.set(n.name,n);});
  const get=name=>{const n=lookupMode==='cached'?nodes.get(name):body.getObjectByName(name);if(!n)throw Error('Missing hero joint '+name);return n;};
  const baseline=[];body.traverse(n=>{baseline.push([n,n.position.clone(),n.quaternion.clone()]);if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  const solver=jointPoseFactory(T,body),yaw=new T.Quaternion().setFromAxisAngle(up,p.yaw),grips=createHeroGripAdapter(T,{body,get,solver}),socket=grips.originalSocket;
  // Intersect the actual blade triangles at the chosen contact height. Its
  // thin dimension is X; the broad blade is Z, unlike a cylinder proxy.
  const geo=get('sword').geometry,pos=geo.attributes.position,index=geo.index,section=[];
  for(let k=0;k<(index?index.count:pos.count);k+=3)for(let j=0;j<3;j++){const a=new T.Vector3().fromBufferAttribute(pos,index?index.getX(k+j):k+j),b=new T.Vector3().fromBufferAttribute(pos,index?index.getX(k+(j+1)%3):k+(j+1)%3);if((a.y-HERO_DUEL.bladeContact)*(b.y-HERO_DUEL.bladeContact)<=0&&a.y!==b.y)section.push(a.x+(b.x-a.x)*(HERO_DUEL.bladeContact-a.y)/(b.y-a.y));}
  if(!section.length)throw Error('Missing hero blade section');const bladeFaces=[Math.min(...section),Math.max(...section)];
  const footQ=f=>new T.Quaternion().setFromUnitVectors(up,v(f.normal)).multiply(new T.Quaternion().setFromAxisAngle(up,f.yaw));
  function footprint(side,rootZ){
   const local=v([side==='left'?.13:-.13,0,.065+(side==='left'?.14:-.14)]).applyQuaternion(yaw),x=p.position[0]+local.x,z=rootZ+local.z,h=groundHeight;
   const normal=v([-(h(x+.05,z)-h(x-.05,z))/.1,1,-(h(x,z+.05)-h(x,z-.05))/.1]).normalize(),f={position:[x,0,z],yaw:p.yaw,normal:normal.toArray()},q=footQ(f),pos=get('Mesh_foot_'+side).geometry.attributes.position;
   let y=-Infinity;for(let i=0;i<pos.count;i++){const delta=new T.Vector3().fromBufferAttribute(pos,i).sub(sole).applyQuaternion(q);y=Math.max(y,h(x+delta.x,z+delta.z)-delta.y);}f.position[1]=y+.0003;return f;
  }
  const midpoint=(placements[0].position[2]+placements[1].position[2])/2,from=p.position[2],to=midpoint+(from<midpoint?-.75:.75),feet={left:footprint('left',from),right:footprint('right',from)},steps=[];
  // Eleven full strides. Each stance anchor stays fixed while the other foot
  // swings; the body follows the admitted contacts instead of sliding a clip.
  for(let k=1;k<=11;k++)for(const side of ['left','right'])steps.push({...footprint(side,from+(to-from)*k/11),side});
  const plan=createTravelPlan({feet,steps,duration:.28,lift:.085});
  return {id:p.id,group:actor,body,get,baseline,solver,yaw,socket,shieldMount:grips.shieldMount,applySwordPose:grips.swordPose,applyShieldPose:grips.shieldPose,footQ,plan,feet,from,to,bladeFaceX:bladeFaces[placements.indexOf(p)===0?0:1]};
 });
 const shieldStrikes=actors.map((actor,i)=>createShieldStrikePose(T,{actor,target:actors[1-i]})),shieldDetector=createMeshContacts(T);
 let epoch=null,last=0,current=null;
 const phase=t=>t<HERO_DUEL.approachDuration?'approach':t<7.4?'guard':t<9.15?'Achilles strike and Hector parry':t<10.45?'Achilles follow-up and Hector shield block':t<12?'Hector counter and Achilles parry':t<13.6?'Hector follow-up and Achilles shield block':t<14?'recover':t<HERO_DUEL.duration?'retreat':'complete';
 function sample(time){
  validTime(time);last=time;const elapsed=epoch===null?0:time>=epoch+HERO_DUEL.duration?HERO_DUEL.duration:Math.max(0,time-epoch),active=epoch!==null,travel=elapsed< HERO_DUEL.approachDuration?elapsed:elapsed<HERO_DUEL.retreatStart?HERO_DUEL.approachDuration:Math.max(0,HERO_DUEL.approachDuration-(elapsed-HERO_DUEL.retreatStart));
  const clock=active?elapsed:time;
  // All previous pose state is restored, including reverse seeks and reset.
  for(const [i,a]of actors.entries()){
   for(const [n,p,q]of a.baseline){n.position.copy(p);n.quaternion.copy(q);}
   const s=a.plan.sample(active?travel:0),c=s.bodyCenter,offset=v([0,0,.065]).applyQuaternion(a.yaw);
   a.group.position.set(c[0]-offset.x,c[1],c[2]-offset.z);a.group.quaternion.copy(a.yaw);
   const pulse=(from,peak,to)=>active?(elapsed<=peak?ease((elapsed-from)/(peak-from)):1-ease((elapsed-peak)/(to-peak))):0,wind=pulse(i===0?7.4:10.3,i===0?8.25:11.05,i===0?8.8:11.6),strike=pulse(i===0?8.25:11.05,i===0?8.8:11.6,i===0?10.2:12.8),block=pulse(i===0?10.4:7.6,i===0?11.6:8.8,i===0?12.8:10.2);
   const crouch=active?.04*ease(travel/.4)*ease((HERO_DUEL.approachDuration-travel)/.4):0,twist=.025*Math.sin(clock*.8+i)-.22*wind+.16*strike-.07*block,lean=.035-.04*wind+.05*strike-.035*block;
   a.get('Joint_hips').position.y=.88-crouch-.012*strike+.003*Math.sin(clock*2+i*.6);a.get('Joint_hips').position.z=.01-.025*wind+.04*strike-.02*block;
   a.get('Joint_spine').rotation.set(lean,twist,0);a.get('Joint_neck').rotation.set(-lean,-twist*.85,0);a.get('Joint_head').rotation.set(0,-twist*.15,0);
   group.updateMatrixWorld(true);
   // Keep both admitted sole targets fixed. Retreat can put the planted ankle
   // briefly beyond full extension between frame samples; lower the pelvis
   // enough to leave 10 mm of knee reach, as in the live combat adapter.
   let lower=0;const targets={};for(const side of ['left','right']){const f=s.feet[side],q=a.footQ(f),ankle=v(f.position).sub(sole.clone().applyQuaternion(q)),origin=a.get('Joint_hip_'+side).getWorldPosition(new T.Vector3()),horizontal=(origin.x-ankle.x)**2+(origin.z-ankle.z)**2;if(horizontal>=.825**2)throw Error('Paired hero foot exceeds leg reach');lower=Math.max(lower,origin.y-ankle.y-Math.sqrt(.825**2-horizontal));targets[side]={ankle,q};}
   a.get('Joint_hips').position.y-=lower;group.updateMatrixWorld(true);
   for(const side of ['left','right']){
    const {ankle,q}=targets[side],target=a.body.worldToLocal(ankle),relative=a.group.getWorldQuaternion(new T.Quaternion()).invert().multiply(q);
    a.solver.chain(a.get('Joint_hip_'+side),a.get('Joint_knee_'+side),a.get('Joint_ankle_'+side),target,[.42,.415],[0,0,1],relative);
   }
   a.footState=s;a.stance=s.swing?(s.swing==='left'?'right':'left'):'both';
   a.shieldCatchWeight=pulse(i===0?11.85:9.05,i===0?12.5:9.75,i===0?13.6:10.45);a.shieldGuardWeight=Math.max(block,a.shieldCatchWeight);
  }
  // Pose both shields before deriving a strike from the opponent's current
  // original triangle surface. Seeking never reads a previous shield pose.
  for(const a of actors){const shield=heroShieldPose(T,a,a.shieldGuardWeight);a.applyShieldPose(shield.w,shield.q);}group.updateMatrixWorld(true);
  // A blade frame lies 46 cm above each actual hilt. At the two parries, both
  // frames meet at one world-space point, rather than playing unrelated clips.
  const contact=v([0,(actors[0].group.position.y+actors[1].group.position.y)/2+1.4,(actors[0].to+actors[1].to)/2]);
  for(const [i,a]of actors.entries()){
   const swordQ=axis=>new T.Quaternion().setFromUnitVectors(up,v(axis).normalize()),guard={w:v([-.30,1.12,.31]),q:swordQ([-.10,.76,.64])},wind={w:v([-.36,1.56,.22]),q:swordQ([-.28,.96,.12])};
   function contactPose(attacking){
    const direction=v(attacking?[.35,-.20,.916]:[.35,.60,.72]).normalize(),other=v(attacking?[.35,.60,.72]:[.35,-.20,.916]).normalize().applyQuaternion(actors[1-i].yaw),world=direction.clone().applyQuaternion(a.yaw),normal=(i===0?world.clone().cross(other):other.clone().cross(world)).normalize(),localNormal=normal.clone().applyQuaternion(a.yaw.clone().invert()),z=localNormal.clone().cross(direction).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(localNormal,direction,z));
    const hand=q.clone().multiply(a.socket.quaternion.clone().invert()),point=a.body.worldToLocal(contact.clone().addScaledVector(normal,i===0?.00015:-.00015));
    return {w:point.sub(v([a.bladeFaceX,HERO_DUEL.bladeContact,0]).applyQuaternion(q)).sub(a.socket.position.clone().applyQuaternion(hand)),q};
   }
   const attack=contactPose(true),parry=contactPose(false),recoil={w:v([-.37,1.29,.26]),q:swordQ([-.40,.43,.80])};
   let keys=[{t:0,...guard},{t:7.4,...guard}];
   const shieldHit=shieldStrikes[i](),shieldGuard={w:v([-.36,1.10,.14]),q:swordQ([-.10,.95,.25])};
   if(i===0)keys.push({t:8.25,...wind},{t:8.8,...attack},{t:8.96,...attack},{t:9.30,...wind},{t:9.75,...shieldHit},{t:9.81,...shieldHit},{t:10.15,...recoil},{t:10.45,...guard},{t:11.2,...parry},{t:11.6,...parry},{t:11.8,...parry},{t:12.2,...shieldGuard},{t:12.9,...shieldGuard},{t:13.6,...guard});
   else keys.push({t:8.35,...parry},{t:8.8,...parry},{t:8.96,...parry},{t:9.35,...shieldGuard},{t:10.05,...shieldGuard},{t:10.45,...guard},{t:11.05,...wind},{t:11.6,...attack},{t:11.76,...attack},{t:12.05,...wind},{t:12.5,...shieldHit},{t:12.56,...shieldHit},{t:12.95,...recoil},{t:13.6,...guard});
   keys.push({t:HERO_DUEL.duration,...guard});let b=keys.findIndex(k=>k.t>elapsed);if(b<0)b=keys.length-1;const start=keys[Math.max(0,b-1)],end=keys[b],u=active&&end.t!==start.t?ease((elapsed-start.t)/(end.t-start.t)):0;
   const right=start.w.clone().lerp(end.w,u),q=start.q.clone().slerp(end.q,u);
   a.applySwordPose(right,q);
   // Stop the full posed blade during the follow-up approach, not only its
   // exact impact key. A stateless bisection from the safe wind-up preserves
   // reverse seeking; the authored vertices and original parries are intact.
   if(active&&elapsed>=(i===0?9.30:12.05)&&elapsed<=(i===0?10.45:13.6)){
    const target=shieldDetector.snapshot(actors[1-i].get('shield')),blocked=()=>Boolean(shieldDetector.contact(shieldDetector.snapshot(a.get('sword'),true),target,null,null,.0003));
    if(blocked()){
     const apply=t=>a.applySwordPose(wind.w.clone().lerp(right,t),wind.q.clone().slerp(q,t));apply(0);if(blocked())throw Error('No safe paired shield wind-up');
     let lo=0,hi=1;for(let k=0;k<16;k++){const mid=(lo+hi)/2;apply(mid);if(blocked())hi=mid;else lo=mid;}apply(lo);
    }
   }
  }
  group.updateMatrixWorld(true);
  current={mode:active?'duel':'face-off',elapsed,duration:HERO_DUEL.duration,phase:active?phase(elapsed):'face-off',complete:active&&elapsed>=HERO_DUEL.duration,contacts:HERO_DUEL.contacts,shieldContacts:HERO_DUEL.shieldContacts,actors:actors.map(a=>({id:a.id,position:a.group.position.toArray(),stance:a.stance,feet:a.footState.feet,bladeContact:a.get('sword').localToWorld(v([a.bladeFaceX,HERO_DUEL.bladeContact,0])).toArray()}))};return current;
 }
 sample(0);
 return {group,actors,sample,stats:()=>current,start(time=last){validTime(time);epoch=time;return sample(time);},reset(time=last){validTime(time);epoch=null;return sample(time);},seek(elapsed,time=last){validTime(elapsed);validTime(time);if(elapsed>HERO_DUEL.duration)throw Error('Hero seek exceeds duration');epoch=time-elapsed;return sample(time);},dispose(){group.removeFromParent();}};
}
