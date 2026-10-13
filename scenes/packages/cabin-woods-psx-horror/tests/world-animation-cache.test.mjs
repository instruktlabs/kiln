import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {createWorldModels} from '../src/game/world-models.mjs';import {createGameState} from '../src/game/state.mjs';
test('unchanged held poses are evaluated once; equipment, flashlight and action changes still evaluate',()=>{
 const keys=['caretaker','fpsArms','shotgun','nightman'],collection={manifest:{},masters:new Map(keys.map(key=>[key,true])),surfaceMaterials:new Map(),instantiate(key){const root=new THREE.Group(),joint=new THREE.Object3D();joint.name='Joint';root.add(joint);const animations=['Idle','Walk','GripAim','FlashlightHold','Reload'].map((name,i)=>new THREE.AnimationClip(name,2,[new THREE.NumberKeyframeTrack('Joint.position[y]',[0,2],[i,i+.5])]));return {root,entry:{key},animations,mixer:new THREE.AnimationMixer(root)};}};
 const models=createWorldModels(collection),state=createGameState(models.layout),input={position:[6.5,0,.05],heading:Math.PI,pitch:0,walking:false,camera:new THREE.PerspectiveCamera(),firstPerson:true};
 let evaluations=0;for(const i of models.instances){const set=i.mixer.setTime.bind(i.mixer);i.mixer.setTime=t=>{evaluations++;return set(t);};}
 models.update(state,0,input);const initial=evaluations;assert(initial>=4);models.update(state,0,input);assert.equal(evaluations,initial);
 state.weapon='shotgun';models.update(state,0,input);assert.equal(evaluations,initial+2);const held=evaluations;models.update(state,0,input);assert.equal(evaluations,held);
 state.flashlight=false;models.update(state,0,input);assert.equal(evaluations,held+2);
 input.reload={time:.5};models.update(state,0,input);const action=evaluations;input.reload.time=.8;models.update(state,0,input);assert.equal(evaluations,action+3);models.dispose();
});
