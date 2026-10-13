import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';import {createEffects} from '../src/game/effects.mjs';
test('effects query impact targets once per new impact event, never on ordinary redraws',t=>{
 const original=globalThis.document;globalThis.document={createElement(){return {getContext(){return {createRadialGradient(){return {addColorStop(){}};},fillRect(){}};}};}};t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 const models={root:new THREE.Group(),byId:new Map()},effects=createEffects(models),state={time:0,fire:0,tv:false,lastAction:null},camera=new THREE.PerspectiveCamera();let queries=0;const target=()=>{queries++;return {point:new THREE.Vector3(1,2,3)};};
 effects.update(state,.016,camera,target);assert.equal(queries,0);state.lastAction={sequence:1,type:'tree-hit',weapon:'axe'};effects.update(state,.016,camera,target);assert.equal(queries,1);const impact=models.root.getObjectByName('Scene_effects').children.find(n=>n.isSprite&&n.visible);assert.deepEqual(impact.position.toArray(),[1,2,3]);
 effects.update(state,.016,camera,target);assert.equal(queries,1);state.lastAction={sequence:2,type:'equip'};effects.update(state,.016,camera,target);assert.equal(queries,1);effects.dispose();
});
