import test from 'node:test';
import assert from 'node:assert/strict';
import {framePresetView,portraitDistanceScale} from '../web/view-framing.mjs';
test('portrait presets preserve the reference horizontal field without changing desktop composition',()=>{
 const view={position:[10,6,239],target:[0,2,250]},desktop=framePresetView(view,1.6),portrait=framePresetView(view,823/1142);
 assert.deepEqual(desktop,view);assert.notEqual(desktop.position,view.position);
 const scale=1.6/(823/1142);for(let i=0;i<3;i++)assert.equal(portrait.position[i],view.target[i]+(view.position[i]-view.target[i])*scale);
 assert.deepEqual(portrait.target,view.target);assert.deepEqual(view.position,[10,6,239]);
 assert.equal(portraitDistanceScale(2),1);
});
test('framing rejects invalid viewport and coordinates before changing the camera',()=>{
 for(const aspect of [0,-1,NaN,Infinity])assert.throws(()=>portraitDistanceScale(aspect));
 assert.throws(()=>framePresetView({position:[1,2],target:[0,0,0]},1));
 assert.throws(()=>framePresetView({position:[1,2,NaN],target:[0,0,0]},1));
});
