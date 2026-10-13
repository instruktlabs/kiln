/** Local review-scene rules. Asset authoring and saved revisions do not depend on these. */
import {NIGHTMAN_CONTACT} from './nightman-contact.mjs';
export const RULES=Object.freeze({reach:2.1,axeReach:1,carry:10,treeHits:3,boardSlots:3,boardHealth:2,axeCooldown:.78,shotCooldown:1.15,fireSeconds:35,walkSpeed:2.6,runSpeed:4.2});
export const NIGHTMAN_TIMING=Object.freeze({telegraph:.8,strike:.5,impact:.18,recover:.9});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function createGameState(layout={}){
 return {time:0,health:100,inventory:{logs:0,firewood:2,planks:2,shells:6,batteries:1},storage:{logs:3,firewood:4,planks:3},weapon:'unarmed',loadedShells:2,cooldown:0,flashlight:true,battery:1,tv:false,fire:90,
  trees:(layout.trees??[]).map((t,i)=>({id:t.id??`tree-${i}`,position:[...t.position],hits:0,felled:false})),
  pickups:(layout.pickups??[]).map(p=>({...p,position:[...p.position],active:true})),
  windows:(layout.windows??[]).map(w=>({...w,position:[...w.position],boards:[2,2,0]})),
  doors:(layout.doors??[]).map(d=>({...d,open:true})),
  nightman:{position:[...(layout.nightmanSpawn??[38,0,-8])],spawn:[...(layout.nightmanSpawn??[38,0,-8])],mode:'watch',clock:0,active:false,health:3,attackApplied:false},
  spiders:(layout.spiders??[]).map((s,i)=>({id:s.id??`spider-${i}`,position:[...s.position],home:[...s.position],phase:0,moving:false,health:1,hitCooldown:0})),
  events:[],message:'The cabin is yours to keep. Wood and supplies are beyond the porch.',lastAction:null,encounters:0};
}
function emit(state,type,message,extra={}){const event={sequence:(state.events.at(-1)?.sequence??0)+1,time:state.time,type,...extra};state.events.push(event);if(state.events.length>80)state.events.shift();state.message=message;state.lastAction=event;return {ok:true,event};}
const reject=(state,message)=>{state.message=message;return {ok:false,message};};
const woodLoad=s=>s.inventory.logs+s.inventory.firewood+s.inventory.planks;
export function act(state,action,{position=[0,0,0],targetId,kind,near=true}={}){
 if(state.health<=0&&action!=='reset')return reject(state,'Reset the scene to try again.');
 if(action==='equip'){if(!['unarmed','axe','shotgun'].includes(kind))return reject(state,'Unknown tool.');state.weapon=kind;return emit(state,'equip',kind==='unarmed'?'Weapon stowed.':kind==='axe'?'Axe ready.':'Shotgun ready.',{weapon:kind});}
 if(action==='flashlight'){state.flashlight=!state.flashlight;return emit(state,'flashlight',state.flashlight?'Flashlight on.':'Flashlight off.');}
 if(action==='battery'){if(!state.inventory.batteries)return reject(state,'Your spare battery has been used.');state.inventory.batteries--;state.battery=1;return emit(state,'battery','Fresh battery fitted.');}
 if(action==='encounter'){state.nightman.active=true;state.nightman.mode='watch';state.nightman.clock=0;state.encounters++;return emit(state,'encounter','Something moves between the trees.');}
 if(action==='attack'){
  if(!['axe','shotgun'].includes(state.weapon))return reject(state,'Equip the axe or shotgun first.');
  if(state.cooldown>0)return reject(state,'Let the swing recover.');
  if(state.weapon==='shotgun'&&!state.inventory.shells)return reject(state,'No shells. Search the marked supply cache.');
  if(state.weapon==='shotgun'&&state.loadedShells===0)return reject(state,'The chambers are empty. Press R to reload.');
  const shotgun=state.weapon==='shotgun';state.cooldown=shotgun?RULES.shotCooldown:RULES.axeCooldown;if(shotgun){state.inventory.shells--;state.loadedShells=Math.max(0,(state.loadedShells??2)-1);}
  const tree=state.trees.find(t=>t.id===targetId&&!t.felled);
  if(tree&&distance(position,tree.position)<=RULES.axeReach&&!shotgun){tree.hits++;if(tree.hits>=RULES.treeHits){tree.felled=true;state.pickups.push({id:`wood-${tree.id}`,kind:'logs',amount:2,position:[tree.position[0]+.7,0,tree.position[2]],active:true});return emit(state,'tree-felled','The trunk gives way. Walk over the wood bundle.',{targetId});}return emit(state,'tree-hit','The axe bites into the bark.',{targetId});}
  const range=shotgun?22:RULES.axeReach;
  if(targetId==='nightman'&&state.nightman.mode!=='retreat'&&distance(position,state.nightman.position)<=range){state.nightman.health--;state.nightman.mode=state.nightman.health<=0?'retreat':'stagger';state.nightman.clock=0;return emit(state,'nightman-hit',state.nightman.health<=0?'It withdraws into the woods.':'The blow interrupts its advance.',{weapon:state.weapon});}
  const spider=state.spiders.find(s=>s.id===targetId&&s.health>0);if(spider&&distance(position,spider.position)<=range){spider.health=0;return emit(state,'spider-hit','The spider folds to the ground.',{targetId,weapon:state.weapon});}
  return emit(state,shotgun?'shot':'axe-miss',shotgun?'The report rolls through the trees.':'The axe cuts empty air.',{weapon:state.weapon});
 }
 if(!near)return reject(state,'Move closer.');
 if(action==='tv'){state.tv=!state.tv;return emit(state,'tv',state.tv?'A pale broadcast fills the room.':'The television goes dark.');}
 if(action==='door'){const d=state.doors.find(x=>x.id===targetId);if(!d)return reject(state,'No door selected.');d.open=!d.open;return emit(state,'door',d.open?'Door open.':'Door closed.',{targetId,open:d.open});}
 if(action==='chop'||action==='saw'){const output=action==='chop'?'firewood':'planks',yieldCount=action==='chop'?2:3;if(!state.inventory.logs)return reject(state,'Bring a log bundle from the woods.');if(woodLoad(state)-1+yieldCount>RULES.carry)return reject(state,'Store some wood before processing more.');state.inventory.logs--;state.inventory[output]+=yieldCount;return emit(state,action,action==='chop'?'Split firewood is ready for the hearth.':'Three boards are ready for the windows.',{output,amount:yieldCount});}
 if(action==='store'){let count=0;for(const k of ['logs','firewood','planks']){count+=state.inventory[k];state.storage[k]+=state.inventory[k];state.inventory[k]=0;}return count?emit(state,'store','Wood stacked in the rack.',{amount:count}):reject(state,'You are not carrying wood.');}
 if(action==='withdraw'){const item=kind??'logs';if(!['logs','firewood','planks'].includes(item)||!state.storage[item])return reject(state,`No ${item} in storage.`);if(woodLoad(state)>=RULES.carry)return reject(state,'Your arms are full.');state.storage[item]--;state.inventory[item]++;return emit(state,'withdraw',`Took one ${item} from storage.`,{kind:item});}
 if(action==='fire'){if(!state.inventory.firewood)return reject(state,'Split a log at the outdoor block first.');state.inventory.firewood--;state.fire+=RULES.fireSeconds;return emit(state,'fire','The fire catches on the fresh wood.');}
 if(action==='board'){const w=state.windows.find(x=>x.id===targetId);if(!w)return reject(state,'No window selected.');const index=w.boards.findIndex(h=>h<RULES.boardHealth);if(index<0)return reject(state,'This window is secure.');if(!state.inventory.planks)return reject(state,'Saw a log into boards outside.');state.inventory.planks--;w.boards[index]=RULES.boardHealth;return emit(state,'board','A fresh board closes the opening.',{targetId,index});}
 if(action==='breach'){const w=state.windows.find(x=>x.id===targetId);if(!w)return reject(state,'No window selected.');const index=w.boards.findIndex(h=>h>0);if(index<0)return reject(state,'The window is already open.');w.boards[index]=0;return emit(state,'breach','A board splits away from the frame.',{targetId,index});}
 return reject(state,'Nothing to use here.');
}
export function collectNearby(state,position){for(const p of state.pickups){if(!p.active||distance(position,p.position)>.75)continue;const amount=p.amount??1;if(['logs','firewood','planks'].includes(p.kind)&&woodLoad(state)+amount>RULES.carry){state.message='Your arms are full. Store wood at the cabin.';continue;}if(!(p.kind in state.inventory))continue;state.inventory[p.kind]+=amount;p.active=false;emit(state,'pickup',`Picked up ${amount} ${p.kind}.`,{targetId:p.id,kind:p.kind,amount});}}
const moveToward=(position,target,speed,dt)=>{const d=distance(position,target);if(d<.001)return;const step=Math.min(d,speed*dt);position[0]+=(target[0]-position[0])*step/d;position[2]+=(target[2]-position[2])*step/d;};
export function tick(state,delta,player,environment={}){
 if(!Number.isFinite(delta)||delta<0)throw Error('Finite nonnegative simulation delta required');
 const dt=Math.min(delta,.1);state.time+=dt;state.cooldown=Math.max(0,state.cooldown-dt);state.fire=Math.max(0,state.fire-dt);if(state.flashlight){state.battery=Math.max(0,state.battery-dt/300);if(!state.battery)state.flashlight=false;}
 collectNearby(state,player);const n=state.nightman;n.clock+=dt;
 const move=(position,target,speed,radius,height)=>{const proposed=[...position];moveToward(proposed,target,speed,dt);const result=environment.move?.(position,proposed.map((v,i)=>v-position[i]),radius,height)??proposed;position.splice(0,3,...result);};
 const canReach=(from,to)=>environment.canReach?.(from,to)??true;
 if(!n.active&&n.mode!=='gone'&&state.health>0&&distance(player,n.position)<13){act(state,'encounter');}
 if(n.active&&state.health>0){
  const d=distance(player,n.position);
  if(n.mode==='watch'&&n.clock>=4){n.mode='approach';n.clock=0;emit(state,'nightman-advance','The red eyes start moving toward you.');}
  else if(n.mode==='stagger'&&n.clock>=1.3){n.mode='approach';n.clock=0;}
  else if(n.mode==='approach'){
   const reachable=canReach(n.position,player),window=reachable?null:environment.windowTarget?.(n.position,player);
   const target=window?.position??player;n.facing=[...target];
   if(distance(n.position,target)<=(window?NIGHTMAN_CONTACT.windowStop:NIGHTMAN_CONTACT.playerStop)+1e-6&&(reachable||window)){n.mode='windup';n.clock=0;n.attackApplied=false;n.target=window?.id??'player';n.boardIndex=window?state.windows.find(w=>w.id===window.id)?.boards.findIndex(h=>h>0):null;emit(state,'nightman-windup',window?'It raises its arms toward the boards.':'It raises its arms. Move away.');}
   else move(n.position,window?.approach??player,1.35,.4,2.35);
  }
  else if(n.mode==='windup'&&n.clock>=NIGHTMAN_TIMING.telegraph){n.mode='strike';n.clock=0;emit(state,'nightman-strike','The arms come down.');}
  else if(n.mode==='strike'){
   const window=state.windows.find(w=>w.id===n.target),index=window?(n.boardIndex??window.boards.findIndex(h=>h>0)):null,impact=window?NIGHTMAN_CONTACT.boardTimes[index]??NIGHTMAN_TIMING.impact:NIGHTMAN_TIMING.impact;
   if(!n.attackApplied&&n.clock>=impact){
    n.attackApplied=true;
    if(window&&index>=0&&window.boards[index]>0&&distance(n.position,window.position)<=NIGHTMAN_CONTACT.windowMaxDistance&&environment.attackContact?.({kind:'window',targetId:window.id,index,time:impact,position:player})===true){window.boards[index]--;emit(state,window.boards[index]?'board-hit':'breach',window.boards[index]?'The wood cracks under the blow.':'A board breaks away from the frame.',{targetId:window.id,index});}
    else if(!window&&d<=NIGHTMAN_CONTACT.playerMaxDistance&&canReach(n.position,player)&&environment.attackContact?.({kind:'player',time:impact,position:player})===true){state.health=Math.max(0,state.health-22);emit(state,'player-hit','The stone fists connect.');}
   }
   if(n.clock>=NIGHTMAN_TIMING.strike){n.mode='recover';n.clock=0;}
  }
  else if(n.mode==='recover'&&n.clock>=NIGHTMAN_TIMING.recover){n.mode='approach';n.clock=0;}
  else if(n.mode==='retreat'){move(n.position,n.spawn,2.8,.4,2.35);if(distance(n.position,n.spawn)<.3){n.active=false;n.mode='gone';}}
 }
 for(const s of state.spiders){s.moving=false;s.hitCooldown=Math.max(0,s.hitCooldown-dt);if(s.health<=0)continue;const d=distance(player,s.position),before=[...s.position];if(d<4&&d>.9)move(s.position,player,.65,.3,.5);s.moving=distance(before,s.position)>1e-5;if(s.moving)s.phase+=dt;if(d<.85&&!s.hitCooldown&&canReach(s.position,player)){state.health=Math.max(0,state.health-5);s.hitCooldown=2;emit(state,'spider-contact','A spider snaps at your boots.');}}
 return state;
}
