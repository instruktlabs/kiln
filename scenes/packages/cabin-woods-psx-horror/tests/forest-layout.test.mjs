import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestLayout,forestClearance} from '../src/game/forest-layout.mjs';
test('mixed woodland leaves a clear cabin apron, workyard and path',()=>{
 const forest=createForestLayout();
 assert.ok(forest.trees.length>=150);
 assert.ok(forest.trees.some(t=>t.key==='birch'));
 assert.ok(forest.rocks.length>=25);
 assert.equal(forestClearance([0,0,0]),false);assert.equal(forestClearance([80,0,70]),true);
 assert.ok(Math.hypot(...[forest.nightmanSpawn[0],forest.nightmanSpawn[2]])>35);
 assert.ok(forest.trees.filter(t=>Math.hypot(t.position[0]-forest.nightmanSpawn[0],t.position[2]-forest.nightmanSpawn[2])<12).length>=8);
});
test('forest distribution is deterministic, spaced and harvest trees remain independent',()=>{
 const a=createForestLayout(),b=createForestLayout();assert.deepEqual(a,b);
 assert.ok(a.trees.filter(t=>t.harvest).length>=3);
 for(let i=0;i<a.trees.length;i++)for(let j=i+1;j<a.trees.length;j++) assert.ok(Math.hypot(a.trees[i].position[0]-a.trees[j].position[0],a.trees[i].position[2]-a.trees[j].position[2])>=2.7);
});

test('actual projected asset footprints clear cabin/porch by three metres and protect workyard',()=>{const f=createForestLayout(),box={minX:-5.3200001717,maxX:7.1500000954,minZ:-6.3200001717,maxZ:7.600000012};const distance=p=>Math.hypot(Math.max(box.minX-p[0],0,p[0]-box.maxX),Math.max(box.minZ-p[2],0,p[2]-box.maxZ));for(const t of f.trees){const radius=(t.key==='birch'?3.132102:2.260422)*t.scale;assert(distance(t.position)-radius>=2.9999,t.id+' canopy enters cabin apron');}assert(f.trees.every(t=>Number.isFinite(t.colliderRadius)&&t.colliderRadius>0));});
test('woodland supplies a connected branching loop and only authored visible pickup families',()=>{const f=createForestLayout();assert(Array.isArray(f.pathNetwork)&&f.pathNetwork.length>=4,'missing branching path network');assert(f.pathNetwork.some(p=>p.loop),'missing closed returning route');assert(Array.isArray(f.pickups)&&f.pickups.some(p=>p.kind==='logs')&&f.pickups.some(p=>p.kind==='shells'));assert(f.pickups.every(p=>['logs','shells','batteries'].includes(p.kind)),'unauthored pickup');});
test('rock placements describe actual transformed collision footprints and paths are walkable',()=>{const f=createForestLayout();assert(f.rockPlacements?.length===f.rocks.length,'missing scale/rotation/bounds');for(const r of f.rockPlacements){assert(Number.isFinite(r.colliderRadius)&&r.colliderRadius>=.65);assert(r.bounds.min[1]>=-1e-5);}assert(f.pathNetwork.every(p=>p.halfWidth>=(p.harvestId ? .3 : .8)&&p.halfWidth<=1.2));});
test('tree distribution has irregular clumps, source-based clear pickup pads and hidden encounter space',()=>{const f=createForestLayout();assert(f.clumpCentres?.length>=8);assert(f.trees.some(t=>t.clumpId));assert(f.pickups.every(p=>p.clearanceRadius>=1.2));assert(f.trees.filter(t=>Math.hypot(t.position[0]-f.nightmanSpawn[0],t.position[2]-f.nightmanSpawn[2])<10).length>=8);});
import{fixedColliders}from'../src/game/layout.mjs';import{resolvePlayer,PLAYER}from'../src/game/collision.mjs';
test('actual capsule follows every branch and closed loop both ways without collider displacement',()=>{const f=createForestLayout(),colliders=fixedColliders(f);assert.equal(colliders.length,f.trees.length+f.rocks.length);for(const path of f.pathNetwork)for(const points of[path.points,[...path.points].reverse()]){let position=[...points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.12);for(let s=1;s<=steps;s++){const target=[a[0]+(b[0]-a[0])*s/steps,0,a[2]+(b[2]-a[2])*s/steps],resolved=resolvePlayer(position,target.map((v,k)=>v-position[k]),colliders);assert(Math.hypot(resolved[0]-target[0],resolved[2]-target[2])<1e-5,path.id+' blocked');position=resolved;}}}});
test('pickups and creature pads clear actual solid footprints; harvest standing points are in axe range',()=>{const f=createForestLayout(),colliders=fixedColliders(f);for(const p of[...f.pickups,...f.creaturePads])for(const c of colliders)assert(Math.hypot(p.position[0]-c.x,p.position[2]-c.z)>=c.radius+(p.clearanceRadius??p.radius));for(const t of f.trees.filter(t=>t.harvest)){const access=f.pathNetwork.find(p=>p.harvestId===t.id),standing=access.points.at(-1);assert(Math.hypot(standing[0]-t.position[0],standing[2]-t.position[2])<=1);assert(Math.hypot(standing[0]-t.position[0],standing[2]-t.position[2])>=PLAYER.radius+t.colliderRadius);const adjusted=resolvePlayer(standing,[0,0,0],colliders);assert(Math.hypot(adjusted[0]-standing[0],adjusted[2]-standing[2])<1e-6);}});

test('independent layout snapshots cannot mutate future path generation',()=>{const a=createForestLayout(),expected=createForestLayout();a.pathNetwork[0].points[0][0]+=1;assert.deepEqual(createForestLayout(),expected);});
