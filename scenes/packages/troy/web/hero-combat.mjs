// Deterministic fixed-step arena rules. Rendering and input devices are adapters.
export const COMBAT=Object.freeze({step:1/120,arenaRadius:9,bodySeparation:1.12,speed:1.45,botReaction:.24,botThink:.18,attacks:Object.freeze({light:Object.freeze({cost:16,wind:.44,active:.12,recovery:.40,damage:14,guard:15,range:1.25}),heavy:Object.freeze({cost:34,wind:.82,active:.16,recovery:.68,damage:29,guard:38,range:1.28})})});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function createHeroCombat({seed=17,bot=true,startDistance=2.8,contacts=null}={}){
 if(!Number.isInteger(seed)||!Number.isFinite(startDistance)||startDistance<COMBAT.bodySeparation||startDistance>10)throw Error('Invalid combat configuration');
 if(contacts&&(typeof contacts.reset!=='function'||typeof contacts.sample!=='function'))throw Error('Invalid combat contact port');
 let sampled=[],actors=[],player='achilles',tick=0,remainder=0,status='inactive',winner=null,random=seed>>>0,events=[],history=[],decisions=[],nextThink=.36,botInput={forward:0,right:0,block:false};
 const now=()=>tick*COMBAT.step,find=id=>{const a=actors.find(a=>a.id===id);if(!a)throw Error('Unknown fighter');return a;},rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;},event=e=>{events.push({time:now(),...e});if(events.length>512)events.shift();};
 function start(side='achilles'){
  if(!['achilles','hector'].includes(side))throw Error('Invalid player hero');player=side;tick=0;remainder=0;status='fighting';winner=null;random=seed>>>0;events=[];decisions=[];history=[];nextThink=.36;botInput={forward:0,right:0,block:false};
  actors=['achilles','hector'].map((id,i)=>({id,control:id===side?'player':'bot',x:0,z:250+(i===0?-1:1)*startDistance/2,yaw:i===0?0:Math.PI,health:100,stamina:100,action:null,blocking:false,blockHeld:false,lastSpend:-10,vx:0,vz:0}));history.push({time:0,actors:structuredClone(actors)});contacts?.reset(state());return stats();
 }
 function command(id,kind){
  const a=find(id),spec=COMBAT.attacks[kind];if(!spec)throw Error('Invalid attack');if(status!=='fighting'||a.action||a.blocking||a.stamina<spec.cost)return false;a.stamina-=spec.cost;a.lastSpend=now();a.action={kind,start:now(),resolved:false,result:null};event({type:'attack',actor:id,kind});return true;
 }
 function setBlock(id,value){find(id).blockHeld=Boolean(value);}
 function stats(){return {status,player,winner,time:now(),seed,actors:structuredClone(actors),events:structuredClone(events),botDecisions:structuredClone(decisions),scope:'Initial arena combat candidate; balance, motion and opponent quality need playtests'};}
 function state(){return {status,player,winner,time:now(),actors:structuredClone(actors)};}
 function think(time,b){
  nextThink=time+COMBAT.botThink;let old=history[0];for(const h of history){if(h.time<=time-COMBAT.botReaction+1e-12)old=h;else break;}
  const seen=old.actors.find(a=>a.id===player),range=Math.hypot(seen.x-b.x,seen.z-b.z),incoming=seen.action&&COMBAT.attacks[seen.action.kind]&&old.time-seen.action.start<COMBAT.attacks[seen.action.kind].wind+.1;
  botInput={forward:0,right:0,block:false};let intent='hold';
  if(b.stamina<24){botInput.forward=range<2.6?-1:0;intent='recover';}
  else if(incoming&&range<1.9){botInput.block=true;intent='defend';}
  else if(range>1.25){botInput.forward=1;intent='approach';}
  else if(!b.action){b.blocking=false;b.blockHeld=false;const kind=seen.blocking&&b.stamina>45?'heavy':rng()<.72?'light':'heavy';command(b.id,kind);intent='attack';}
  else if(b.action.kind==='stun')intent='stunned';
  decisions.push({time,perceivedAt:old.time,intent});if(decisions.length>512)decisions.shift();
 }
 function move(a,controls){
  const opponent=actors.find(o=>o!==a),wanted=Math.atan2(opponent.x-a.x,opponent.z-a.z);a.yaw+=clamp(wrap(wanted-a.yaw),-2.4*COMBAT.step,2.4*COMBAT.step);
  const f=clamp(controls.forward||0,-1,1),r=clamp(controls.right||0,-1,1),len=Math.max(1,Math.hypot(f,r)),scale=a.action?.kind==='stun'?0:a.action?.kind==='heavy'?.15:a.action?.kind==='light'?.35:a.blocking?.5:1,speed=COMBAT.speed*scale;
  a.vx=(Math.sin(a.yaw)*f-Math.cos(a.yaw)*r)*speed/len;a.vz=(Math.cos(a.yaw)*f+Math.sin(a.yaw)*r)*speed/len;a.x+=a.vx*COMBAT.step;a.z+=a.vz*COMBAT.step;
  const radius=Math.hypot(a.x,a.z-250);if(radius>COMBAT.arenaRadius){a.x*=COMBAT.arenaRadius/radius;a.z=250+(a.z-250)*COMBAT.arenaRadius/radius;}
 }
 function resolveHits(time){
  const hits=[];
  for(const a of actors){
   const action=a.action,s=COMBAT.attacks[action?.kind];if(!s||action.resolved||time-action.start+1e-12<s.wind)continue;
   const target=actors.find(o=>o!==a),contact=sampled.find(c=>c.actor===a.id&&c.target===target.id&&(c.type==='body'||c.type==='guard'&&target.blocking));
   if(time-action.start>s.wind+s.active+1e-12){action.resolved=true;action.result='miss';event({type:'miss',actor:a.id,kind:action.kind});continue;}
   if(!contact)continue;action.resolved=true;hits.push({a,target,action,s,contact});
  }
  // Gather first so equal-tick attacks can trade without array-order advantage.
  for(const {a,target,action,s,contact}of hits){
   const blocking=target.blocking&&contact.type==='guard';let damage=s.damage,type='hit';
   if(blocking&&target.stamina>=s.guard){target.stamina-=s.guard;target.lastSpend=time;damage=action.kind==='heavy'?2:0;type='block';}
   else if(blocking){target.stamina=0;target.lastSpend=time;type='guard-break';}
   action.result=type;target.health=Math.max(0,target.health-damage);
   if(type!=='block'){target.action={kind:'stun',start:time,duration:type==='guard-break'?.8:action.kind==='heavy'?.42:.26,resolved:true,result:type};target.blocking=false;}
   event({type,actor:a.id,target:target.id,kind:action.kind,damage,contact:structuredClone(contact.proof)});
  }
 }
 function update(dt,input={}){
  if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error('Invalid bounded combat delta');if(status!=='fighting')return state();
  for(const k of ['forward','right'])if(input[k]!==undefined&&!Number.isFinite(input[k]))throw Error('Invalid movement input');
  remainder+=dt;
  while(remainder+1e-12>=COMBAT.step&&status==='fighting'){
   remainder-=COMBAT.step;tick++;const time=now(),p=find(player),b=actors.find(a=>a.id!==player);p.blockHeld=Boolean(input.block);
   if(bot&&time>=nextThink)think(time,b);if(bot)b.blockHeld=botInput.block;
   for(const a of actors){
    if(a.action){const s=COMBAT.attacks[a.action.kind],duration=s?s.wind+s.active+s.recovery:a.action.duration;if(time-a.action.start>=duration)a.action=null;}
    a.blocking=a.blockHeld&&!a.action&&a.stamina>=2;
    if(a.blocking){a.stamina=Math.max(0,a.stamina-5*COMBAT.step);a.lastSpend=time;}
    else if(!a.action&&time-a.lastSpend>.75)a.stamina=Math.min(100,a.stamina+19*COMBAT.step);
   }
   for(const a of actors)move(a,a===p?input:bot?botInput:{});
   const dx=actors[1].x-actors[0].x,dz=actors[1].z-actors[0].z,d=Math.hypot(dx,dz);
   if(d<COMBAT.bodySeparation){const nx=d>1e-9?dx/d:0,nz=d>1e-9?dz/d:1,shift=(COMBAT.bodySeparation-d)/2;actors[0].x-=nx*shift;actors[0].z-=nz*shift;actors[1].x+=nx*shift;actors[1].z+=nz*shift;}
   // Pose and contact are sampled at every simulation tick, before damage.
   // A headless rules host without a contact port cannot invent weapon hits.
   sampled=contacts?.sample(state())??[];resolveHits(time);
   if(actors.some(a=>a.health===0)){status='finished';winner=actors.every(a=>a.health===0)?'draw':actors.find(a=>a.health>0).id;for(const a of actors){a.vx=0;a.vz=0;a.blocking=false;}event({type:'finished',winner});}
   history.push({time,actors:structuredClone(actors)});while(history.length>100)history.shift();
  }
  return state();
 }
 return {start,reset:()=>start(player),stop(){status='inactive';return stats();},command,setBlock,update,stats,state};
}
