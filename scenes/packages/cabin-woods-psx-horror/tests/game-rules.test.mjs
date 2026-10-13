import test from 'node:test';import assert from 'node:assert/strict';
import {createGameState,act,tick,collectNearby,RULES} from '../src/game/state.mjs';
import {resolvePlayer} from '../src/game/collision.mjs';
test('normal entry starts unarmed with flashlight on and requires explicit weapon equipment',()=>{
 const s=createGameState();assert.equal(s.weapon,'unarmed');assert.equal(s.flashlight,true);assert.equal(act(s,'attack').ok,false);assert.equal(s.cooldown,0);assert.equal(s.inventory.shells,6);
 assert.equal(act(s,'equip',{kind:'axe'}).ok,true);assert.equal(s.weapon,'axe');assert.equal(act(s,'equip',{kind:'shotgun'}).ok,true);assert.equal(s.weapon,'shotgun');
 assert.equal(act(s,'equip',{kind:'unarmed'}).ok,true);assert.equal(s.weapon,'unarmed');assert.equal(act(s,'equip',{kind:'unknown'}).ok,false);assert.equal(s.weapon,'unarmed');
});
test('harvest, pickup, processing, storage, fire and boarding conserve and consume resources',()=>{
 const s=createGameState({trees:[{id:'pine',position:[3,0,0]}],windows:[{id:'window',position:[0,1,1]}]});act(s,'equip',{kind:'axe'});s.inventory={logs:0,firewood:0,planks:0,shells:2,batteries:0};
 for(let i=0;i<3;i++){s.cooldown=0;assert.equal(act(s,'attack',{position:[2,0,0],targetId:'pine'}).ok,true);}assert(s.trees[0].felled);collectNearby(s,[3.7,0,0]);assert.equal(s.inventory.logs,2);collectNearby(s,[3.7,0,0]);assert.equal(s.inventory.logs,2);
 assert(act(s,'saw').ok);assert.equal(s.inventory.planks,3);assert(act(s,'chop').ok);assert.equal(s.inventory.firewood,2);assert.equal(s.inventory.logs,0);assert(!act(s,'saw').ok);
 assert(act(s,'board',{targetId:'window'}).ok);assert.deepEqual(s.windows[0].boards,[2,2,2]);assert.equal(s.inventory.planks,2);assert(!act(s,'board',{targetId:'window'}).ok);act(s,'breach',{targetId:'window'});act(s,'board',{targetId:'window'});assert.equal(s.inventory.planks,1);
 const fuel=s.fire;assert(act(s,'fire').ok);assert.equal(s.fire,fuel+RULES.fireSeconds);assert.equal(s.inventory.firewood,1);act(s,'store');assert.equal(s.inventory.planks,0);assert.equal(s.inventory.firewood,0);act(s,'withdraw',{kind:'planks'});assert.equal(s.inventory.planks,1);
});
test('range, capacity, cooldown and ammo prevent free resources or attacks',()=>{
 const s=createGameState({trees:[{id:'pine',position:[9,0,0]}]});act(s,'equip',{kind:'axe'});act(s,'attack',{targetId:'pine',position:[0,0,0]});assert.equal(s.trees[0].hits,0);assert(!act(s,'attack').ok);s.inventory.logs=10;assert(!act(s,'chop').ok);assert.equal(s.inventory.logs,10);act(s,'equip',{kind:'shotgun'});s.cooldown=0;s.inventory.shells=0;assert(!act(s,'attack').ok);assert.equal(s.cooldown,0);assert(!act(s,'fire',{near:false}).ok);
});
test('Nightman starts deep, telegraphs, permits evasion and recovers between hits',()=>{
 const s=createGameState({nightmanSpawn:[38,0,-8]});for(let i=0;i<100;i++)tick(s,.1,[0,0,0]);assert.equal(s.nightman.active,false);assert.deepEqual(s.nightman.position,[38,0,-8]);
 act(s,'encounter');s.nightman.position=[1.3,0,0];for(let i=0;i<43;i++)tick(s,.1,[0,0,0]);assert.equal(s.nightman.mode,'windup');const h=s.health;for(let i=0;i<12;i++)tick(s,.1,[-4,0,0]);assert.equal(s.health,h);assert.equal(s.nightman.mode,'recover');
});
test('reset creates fresh inventory, pickups and encounter state',()=>{const layout={pickups:[{id:'shells',kind:'shells',amount:2,position:[0,0,0]}]};const a=createGameState(layout);collectNearby(a,[0,0,0]);const b=createGameState(layout);assert.equal(b.inventory.shells,6);assert(b.pickups[0].active);assert.equal(b.time,0);});
test('a defeated encounter stays gone until explicit reset instead of restarting by proximity',()=>{const s=createGameState({nightmanSpawn:[38,0,-8]});s.nightman.mode='gone';s.nightman.health=0;tick(s,.1,[38,0,-8]);assert.equal(s.nightman.active,false);assert.equal(s.nightman.mode,'gone');assert.equal(s.encounters,0);});
test('encounter collision hooks constrain movement and prevent a strike through a solid wall',()=>{const s=createGameState({nightmanSpawn:[1.5,0,0]});s.nightman.active=true;s.nightman.mode='windup';s.nightman.clock=1.14;tick(s,.1,[0,0,0],{canReach:()=>false});assert.equal(s.health,100);s.nightman.mode='approach';s.nightman.position=[5,0,0];tick(s,.1,[0,0,0],{move:position=>[...position]});assert.deepEqual(s.nightman.position,[5,0,0]);});
test('native strike applies damage only once at contact and a interrupted strike cannot land',()=>{
 const s=createGameState({nightmanSpawn:[1.5,0,0]});Object.assign(s.nightman,{active:true,mode:'windup',clock:.79,target:'player'});
 tick(s,.02,[0,0,0]);assert.equal(s.nightman.mode,'strike');assert.equal(s.health,100);
 const env={attackContact:()=>true};tick(s,.1,[0,0,0],env);assert.equal(s.health,100);tick(s,.1,[0,0,0],env);assert.equal(s.health,78);tick(s,.1,[0,0,0],env);assert.equal(s.health,78);
 Object.assign(s.nightman,{mode:'strike',clock:.1,attackApplied:false});s.cooldown=0;act(s,'equip',{kind:'axe'});act(s,'attack',{targetId:'nightman',position:[.6,0,0]});tick(s,.1,[0,0,0]);assert.equal(s.health,78);assert.equal(s.nightman.mode,'stagger');
});
test('blocked cabin pursuit attacks a reachable board and never damages the player through it',()=>{
 const s=createGameState({nightmanSpawn:[1.3,0,0],windows:[{id:'w',position:[0,1,0]}]});Object.assign(s.nightman,{active:true,mode:'approach'});
 const env={attackContact:()=>true,canReach:()=>false,windowTarget:()=>({id:'w',position:[0,0,0],approach:[1.3,0,0]})};tick(s,.1,[-1,0,0],env);assert.equal(s.nightman.mode,'windup');assert.equal(s.nightman.target,'w');
 for(let i=0;i<13;i++)tick(s,.1,[-1,0,0],env);assert.equal(s.health,100);assert.deepEqual(s.windows[0].boards,[1,2,0]);
 Object.assign(s.nightman,{mode:'strike',clock:.17,attackApplied:false});tick(s,.02,[-1,0,0],env);assert.deepEqual(s.windows[0].boards,[0,2,0]);assert(s.events.some(e=>e.type==='breach'));
 act(s,'board',{targetId:'w'});assert.equal(s.windows[0].boards[0],2);
});
test('swept capsule cannot tunnel through a thin wall, slides and passes a usable opening',()=>{
 const wall={type:'box',minX:0,maxX:.15,minZ:-2,maxZ:2,minY:0,maxY:2.8};const blocked=resolvePlayer([-1,0,0],[3,0,1],[wall]);assert(blocked[0]<=-.279);assert(blocked[2]>.9);
 const gap=[{...wall,maxZ:-.55},{...wall,minZ:.55}];const through=resolvePlayer([-1,0,0],[3,0,0],gap);assert(through[0]>1.9);
 const lowLintel={...wall,minZ:-.55,maxZ:.55,minY:1.6,maxY:2.8};assert(resolvePlayer([-1,0,0],[3,0,0],[...gap,lowLintel])[0]<0);
});
