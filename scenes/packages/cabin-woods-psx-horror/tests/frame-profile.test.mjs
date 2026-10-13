import test from 'node:test';import assert from 'node:assert/strict';
import {installFrameProfile} from '../src/game/frame-profile.mjs';
test('profile counts actual submissions and instances, resets each frame and restores renderer',()=>{
 const info={draws:0,reset(){this.draws=0;},update(){this.draws++;}},original=info.update;
 const profile=installFrameProfile(info);profile.begin();
 info.update({isMesh:true,parent:{userData:{assetKey:'pine'}}},18,4);info.update({isMesh:true},6,1);
 const snapshot=profile.snapshot();assert.deepEqual(snapshot,[{asset:'pine',draws:1,triangles:24},{asset:'post / other',draws:1,triangles:2}]);
 assert.equal(info.draws,2);profile.begin();assert.equal(info.draws,0);assert.deepEqual(profile.snapshot(),[]);
 info.update({isMesh:true,parent:{userData:{assetKey:'pine'}}},6,1);assert.deepEqual(snapshot,[{asset:'pine',draws:1,triangles:24},{asset:'post / other',draws:1,triangles:2}],'retained snapshots must not alias reused counters');
 profile.dispose();assert.equal(info.update,original);
});

test('sprite triangles match the renderer while line submissions do not invent triangles',()=>{
 const info={reset(){},update(){}},profile=installFrameProfile(info);profile.begin();
 info.update({isSprite:true,parent:{userData:{assetKey:'effect'}}},6,1);
 info.update({isLine:true,parent:{userData:{assetKey:'effect'}}},12,1);
 assert.deepEqual(profile.snapshot(),[{asset:'effect',draws:2,triangles:2}]);
 profile.dispose();
});
