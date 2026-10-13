import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';import {setPlayerPose,playerPoseName} from '../src/game/player-pose.mjs';
test('unarmed uses authored idle/walk, equipment uses dedicated holds and actions override locomotion',()=>{
 assert.equal(playerPoseName({weapon:'unarmed'}),'Idle');assert.equal(playerPoseName({weapon:'unarmed',walking:true}),'Walk');
 assert.equal(playerPoseName({weapon:'axe'}),'AxeHold');assert.equal(playerPoseName({weapon:'axe',walking:true}),'WalkAxe');
 assert.equal(playerPoseName({weapon:'shotgun'}),'GripAim');assert.equal(playerPoseName({weapon:'shotgun',walking:true}),'WalkShotgun');
 assert.equal(playerPoseName({weapon:'axe',walking:true,swingWeapon:'axe'}),'AxeUse');assert.equal(playerPoseName({weapon:'shotgun',walking:true,swingWeapon:'shotgun'}),'ShotgunFire');assert.equal(playerPoseName({weapon:'shotgun',reloading:true}),'Reload');
});
test('left hold stays authored during walking, right hand continues its motion, off restores base pose',()=>{
 const root=new THREE.Group(),left=new THREE.Object3D(),right=new THREE.Object3D();left.name='Left';right.name='Right';root.add(left,right);
 const track=(name,values)=>new THREE.NumberKeyframeTrack(name+'.position[y]',[0,1],values);
 const walk=new THREE.AnimationClip('Walk',1,[track('Left',[0,.3]),track('Right',[0,.6])]),hold=new THREE.AnimationClip('FlashlightHold',.2,[new THREE.NumberKeyframeTrack('Left.position[y]',[0,.2],[.8,.8])]);
 const instance={root,animations:[walk,hold],mixer:new THREE.AnimationMixer(root)};
 for(let i=0;i<6;i++){assert(setPlayerPose(instance,'Walk',{flashlight:true}));instance.mixer.update(.15);assert.ok(Math.abs(left.position.y-.8)<1e-7);assert.ok(right.position.y>0);}
 setPlayerPose(instance,'Walk',{flashlight:false});instance.mixer.setTime(.5);assert.ok(Math.abs(left.position.y-.15)<1e-7);assert.ok(Math.abs(right.position.y-.3)<1e-7);
 assert.equal(walk.tracks.length,2,'canonical animation is not modified');instance.mixer.stopAllAction();instance.mixer.uncacheRoot(root);
});
