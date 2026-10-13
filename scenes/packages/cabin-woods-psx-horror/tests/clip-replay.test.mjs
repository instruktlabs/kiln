import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {setClip} from '../src/game/assets.mjs';
test('explicit new-use restart replays a completed one-shot at the same midpoint',()=>{
 const root=new THREE.Group(),motion=new THREE.Group();motion.name='Motion';root.add(motion);
 const clip=new THREE.AnimationClip('Use',1,[new THREE.VectorKeyframeTrack('Motion.position',[0,.5,1],[0,0,0,0,0,-.12,0,0,0])]);
 const instance={root,animations:[clip],mixer:new THREE.AnimationMixer(root)};
 setClip(instance,'Use',{once:true});instance.mixer.update(1.1);assert(instance.mixer.clipAction(clip).paused);
 setClip(instance,'Use',{once:true,restart:true});instance.mixer.setTime(.5);assert(Math.abs(motion.position.z+.12)<1e-6);assert.equal(instance.mixer.clipAction(clip).paused,false);
});
