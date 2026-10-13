import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {createWorldModels} from '../src/game/world-models.mjs';import {createGameState} from '../src/game/state.mjs';
test('background visibility changes synchronize batches once; unchanged frames do not rescan batches',()=>{
 const master=new THREE.Group(),geometry=new THREE.BoxGeometry(.2,2,.2),material=new THREE.MeshStandardMaterial();master.add(new THREE.Mesh(geometry,material));
 const collection={manifest:{},masters:new Map([['pine',master]]),surfaceMaterials:new Map(),instantiate(key){return {root:master.clone(true),entry:{key},animations:[],mixer:new THREE.AnimationMixer(master)};}};
 const models=createWorldModels(collection,{}, {vegetationStrategy:'cells'}),state=createGameState(models.layout),camera=new THREE.PerspectiveCamera(),batch=models.merges.find(m=>m.stats.strategy==='cells');
 const total=()=>batch.meshes.reduce((n,m)=>n+m.count,0),before=total();let calls=0;const original=batch.sync;batch.sync=()=>{calls++;original();};
 const input={position:[6.5,0,0],heading:Math.PI,pitch:0,walking:false,swing:null,camera};
 models.update(state,0,input);assert.equal(calls,0);
 state.trees.find(t=>t.id==='woodland-screen-1').felled=true;models.update(state,0,input);
 assert.equal(models.byId.get('woodland-screen-1').root.visible,false);assert.equal(total(),before-1);assert.equal(calls,1);
 models.update(state,0,input);assert.equal(calls,1);
 state.trees.find(t=>t.id==='woodland-screen-1').felled=false;models.update(state,0,input);
 assert.equal(models.byId.get('woodland-screen-1').root.visible,true);assert.equal(total(),before);assert.equal(calls,2);
 models.update(state,0,input);assert.equal(calls,2);
 models.dispose();geometry.dispose();material.dispose();
});

test('aerial review hides local body, FPS rig and light without overwriting the review camera',()=>{
 const keys=['caretaker','fpsArms','axe','shotgun','flashlight'],masters=new Map();
 for(const key of keys){const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshStandardMaterial()));masters.set(key,root);}
 const collection={manifest:{},masters,surfaceMaterials:new Map(),instantiate(key){const root=masters.get(key).clone(true);return {root,entry:{key},animations:[],mixer:new THREE.AnimationMixer(root)};}};
 const models=createWorldModels(collection),state=createGameState(models.layout),camera=new THREE.PerspectiveCamera();camera.position.set(20,16,22);camera.lookAt(1,1,0);const q=camera.quaternion.toArray();
 const input={position:[6.5,0,.05],heading:Math.PI,pitch:0,walking:false,swing:null,camera,firstPerson:false};
 models.update(state,0,input);
 assert.deepEqual(camera.position.toArray(),[20,16,22]);assert.deepEqual(camera.quaternion.toArray(),q);
 assert.equal(models.byId.get('player').root.visible,false);assert.equal(models.byId.get('fpsArms').root.visible,false);assert.equal(models.byId.get('player-flashlight').root.visible,false);
 assert.equal(models.instances.length,5);
 models.update(state,0,{...input,firstPerson:true});assert.equal(models.byId.get('player').root.visible,true);assert.equal(models.byId.get('fpsArms').root.visible,true);assert.deepEqual(camera.position.toArray(),[6.5,1.61,.05]);
 models.dispose();for(const master of masters.values())master.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
});
