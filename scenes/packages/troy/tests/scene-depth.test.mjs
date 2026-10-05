import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {depthRendererOptions,configureDepthCamera} from '../web/scene-depth.mjs';
import {createViewCuller} from '../web/view-culling.mjs';

test('depth comparisons are explicit and incompatible depth modes cannot combine',()=>{
 assert.deepEqual(depthRendererOptions(),{reversedDepthBuffer:true,logarithmicDepthBuffer:false});
 assert.deepEqual(depthRendererOptions('standard'),{reversedDepthBuffer:false,logarithmicDepthBuffer:false});
 assert.deepEqual(depthRendererOptions('reversed'),{reversedDepthBuffer:true,logarithmicDepthBuffer:false});
 assert.deepEqual(depthRendererOptions('logarithmic'),{reversedDepthBuffer:false,logarithmicDepthBuffer:true});
 assert.throws(()=>depthRendererOptions('unknown'),/depth mode/i);
});

test('effective backend depth config reaches projection and culling before the first render',()=>{
 for(const coordinateSystem of [T.WebGPUCoordinateSystem,T.WebGLCoordinateSystem])for(const supported of [true,false]){
  const camera=new T.PerspectiveCamera(48,1,.2,6000);
  configureDepthCamera(camera,{coordinateSystem,reversedDepthBuffer:supported});
  assert.equal(camera.reversedDepth,supported);
  const near=new T.Vector3(0,0,-.2).applyMatrix4(camera.projectionMatrix).z;
  const far=new T.Vector3(0,0,-6000).applyMatrix4(camera.projectionMatrix).z;
  assert.ok(Math.abs(near-(supported?1:coordinateSystem===T.WebGPUCoordinateSystem?0:-1))<1e-10);
  assert.ok(Math.abs(far-(supported?0:1))<1e-10);
  const culler=createViewCuller(T,{receiverFloorY:-16,lightDirection:new T.Vector3(0,-1,0)});culler.prepare(camera);
  const box=z=>new T.Box3(new T.Vector3(-.01,0,z-.01),new T.Vector3(.01,.01,z+.01));
  assert.equal(culler.visible(box(-500)),true,'interior survives');
  assert.equal(culler.visible(box(1)),false,'behind eye rejected');
  assert.equal(culler.visible(box(-7000)),false,'beyond far rejected');
  // Reapplying an unsupported backend must restore conventional projection.
  configureDepthCamera(camera,{coordinateSystem,reversedDepthBuffer:false});
  assert.equal(camera.reversedDepth,false);
 }
});
