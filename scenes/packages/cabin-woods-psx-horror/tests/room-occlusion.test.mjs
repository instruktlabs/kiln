import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createRoomOcclusion,CABIN_ROOM_MEMBER_IDS} from '../src/game/room-occlusion.mjs';

function fixture(extra={}){
 const scene=extra.scene??new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,100),roomRoot=new THREE.Group();camera.position.set(0,2,8);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
 const member=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());member.position.y=1;roomRoot.add(member);scene.add(roomRoot);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(4,3,.2),new THREE.MeshStandardMaterial());wall.position.set(0,1.5,2);scene.add(wall);
 const target=new THREE.RenderTarget(320,180),results=new Map();let token='closed';
 const renderer={backend:{isWebGPUBackend:true},sortObjects:true,depth:true,samples:0,isOccluded:p=>results.get(p)};
 const rooms=[{id:'living',meshes:[member]}],h=createRoomOcclusion({scene,renderer,camera,rooms,opaqueOccluders:[wall],getEpochToken:()=>token,enabled:true,...extra});
 const frame=(inspect=()=>{},parameters={})=>h.render(()=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);scene.onBeforeRender(parameters.renderer??renderer,scene,parameters.camera??camera,parameters.target===undefined?target:parameters.target);inspect();});
 return {scene,camera,roomRoot,member,wall,target,renderer,results,h,frame,setToken:v=>{token=v;}};
}
test('unknown remains visible; current-epoch true hides only during the armed world draw',()=>{
 const f=fixture();f.frame(()=>assert.equal(f.member.layers.mask,1));assert.equal(f.h.proxies.length,1);const p=f.h.proxies[0];assert.equal(p.occlusionTest,true);assert.equal(p.material.colorWrite,false);assert.equal(p.material.depthWrite,false);assert.equal(p.material.depthTest,true);assert.equal(p.material.side,THREE.DoubleSide);assert.equal(p.frustumCulled,false);
 f.results.set(p,true);f.frame(()=>{assert.equal(f.member.layers.mask&1,0);assert.equal(f.member.visible,true);assert.equal(f.roomRoot.visible,true);assert.equal(p.visible,true);const hits=[];p.raycast({},hits);assert.deepEqual(hits,[]);});assert.equal(f.member.layers.mask,1);assert.equal(f.wall.renderOrder,0);f.h.dispose();
});
test('fresh identities discard delayed camera/door/target results; false and undefined stay visible',()=>{
 const f=fixture();f.frame();let old=f.h.proxies[0];f.results.set(old,true);f.frame(()=>assert.equal(f.member.layers.mask&1,0));
 f.camera.position.x=.000001;f.frame(()=>assert.equal(f.member.layers.mask&1,1));assert.notEqual(f.h.proxies[0],old);old=f.h.proxies[0];f.results.set(old,true);f.setToken('opening:.001');f.frame(()=>assert.equal(f.member.layers.mask&1,1));assert.notEqual(f.h.proxies[0],old);
 old=f.h.proxies[0];f.results.set(old,true);f.frame(()=>assert.equal(f.member.layers.mask&1,1),{target:new THREE.RenderTarget(320,180)});assert.notEqual(f.h.proxies[0],old);f.results.set(f.h.proxies[0],false);f.frame(()=>assert.equal(f.member.layers.mask&1,1));f.h.dispose();
});
test('camera inside or near-plane straddling cannot consume an occluded result',()=>{
 const f=fixture();f.frame();f.results.set(f.h.proxies[0],true);f.camera.position.set(0,1,0);f.camera.lookAt(0,1,-1);f.frame(()=>assert.equal(f.member.layers.mask&1,1));
 f.camera.position.set(0,1,1.05);f.camera.lookAt(0,1,0);f.frame();f.results.set(f.h.proxies[0],true);f.frame(()=>assert.equal(f.member.layers.mask&1,1));f.h.dispose();
});
test('prior scene hook is chained; unarmed compile/foreign context never applies suppression',()=>{
 const scene=new THREE.Scene();let calls=0;const prior=function(){assert.equal(this,scene);calls++;};scene.onBeforeRender=prior;const f=fixture({scene});
 // fixture roots are explicit meshes; this test only needs the hook context.
 f.frame();f.results.set(f.h.proxies[0],true);scene.onBeforeRender(f.renderer,scene,f.camera,f.target);assert.equal(f.member.layers.mask,1);assert.equal(calls,2);f.frame(()=>assert.equal(f.member.layers.mask,1),{camera:new THREE.PerspectiveCamera()});f.frame(()=>assert.equal(f.member.layers.mask,1),{renderer:{}});f.h.dispose();assert.equal(scene.onBeforeRender,prior);
});
test('finally restores its bit and orders, retaining unrelated layer changes and thrown-render cleanup',()=>{
 const f=fixture();f.member.layers.enable(7);f.frame();f.results.set(f.h.proxies[0],true);assert.throws(()=>f.frame(()=>{assert.equal(f.member.layers.mask&1,0);assert.equal(f.member.layers.mask&(1<<7),1<<7);f.member.layers.enable(12);assert(f.wall.renderOrder<f.h.proxies[0].renderOrder);assert(f.h.proxies[0].renderOrder<f.member.renderOrder);throw Error('draw failed');}),/draw failed/);
 assert.equal(f.member.layers.mask,1|(1<<7)|(1<<12));assert.equal(f.wall.renderOrder,0);assert.equal(f.h.proxies.length,0);f.h.setEnabled(false);f.frame(()=>assert.equal(f.member.layers.mask&1,1));f.h.dispose();f.h.setEnabled(true);assert.equal(f.h.diagnostics.enabled,false);
});
test('unsupported shaders, alpha blends, unexpected ordering or scene overrides fail visible',()=>{
 for(const change of[f=>f.member.material.transparent=true,f=>f.member.material.polygonOffset=true,f=>f.member.material.depthFunc=THREE.AlwaysDepth,f=>f.wall.material.depthWrite=false,f=>f.scene.overrideMaterial=new THREE.MeshBasicMaterial(),f=>f.roomRoot.renderOrder=4,f=>f.renderer.sortObjects=false]){
  const f=fixture();f.frame();f.results.set(f.h.proxies[0],true);change(f);f.frame(()=>assert.equal(f.member.layers.mask&1,1));f.h.dispose();
 }
});
test('query box remains a world-space enclosure when the Scene itself is transformed',()=>{
 const f=fixture();f.scene.position.set(3,0,0);f.scene.rotation.y=.3;f.frame();const actual=new THREE.Box3().setFromObject(f.member),proxy=new THREE.Box3().setFromObject(f.h.proxies[0]);assert(proxy.containsBox(actual));f.h.dispose();
});
test('bounded inputs and ambiguous/mixed batch room ownership reject before hook installation',()=>{
 const scene=new THREE.Scene(),renderer={};const prior=scene.onBeforeRender;assert.throws(()=>createRoomOcclusion({scene,renderer,camera:new THREE.PerspectiveCamera(),rooms:Array.from({length:5},(_,i)=>({id:String(i),meshes:[]})),opaqueOccluders:[],getEpochToken:()=>''}),/room|bound/i);assert.equal(scene.onBeforeRender,prior);
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);const camera=new THREE.PerspectiveCamera();assert.throws(()=>createRoomOcclusion({scene,renderer,camera,rooms:[{id:'living',meshes:[mesh]}],opaqueOccluders:[],getEpochToken:()=>'',batchMembership:new Map([[mesh,['living','bedroom']]])}),/batch|room/i);
 assert.throws(()=>createRoomOcclusion({scene,renderer,camera,rooms:[{id:'living',meshes:[mesh]}],opaqueOccluders:[],getEpochToken:()=>''}),/batch|room/i);
});
test('same-room instance bounds enclose every admitted instance and invalidate on changed instance version',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,100);camera.position.set(0,2,8);camera.lookAt(0,1,0);const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial(),2);mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-2,1,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,1,0));scene.add(mesh);const renderer={backend:{isWebGPUBackend:true},sortObjects:true,depth:true,isOccluded:()=>true},h=createRoomOcclusion({scene,renderer,camera,rooms:[{id:'living',meshes:[mesh]}],opaqueOccluders:[],batchMembership:new Map([[mesh,['living','living']]]),getEpochToken:()=>'',enabled:true});const frame=()=>h.render(()=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);scene.onBeforeRender(renderer,scene,camera,null);});frame();const p=h.proxies[0];assert(p.geometry);assert(h.roomBounds.get('living').containsPoint(new THREE.Vector3(-2.5,.5,-.5)));assert(h.roomBounds.get('living').containsPoint(new THREE.Vector3(2.5,1.5,.5)));mesh.instanceMatrix.needsUpdate=true;frame();assert.notEqual(h.proxies[0],p);h.dispose();
});
test('disable/dispose remove proxies, restore hook only if owned, and preserve later hook replacement',()=>{
 const f=fixture();f.frame();assert.equal(f.h.proxies.length,1);const proxy=f.h.proxies[0],later=()=>{};f.h.setEnabled(false);assert.equal(proxy.parent,null);f.scene.onBeforeRender=later;f.h.dispose();assert.equal(f.scene.onBeforeRender,later);assert.equal(f.member.layers.mask,1);f.h.dispose();
});
test('dedicated layer is pass-local; overlapping camera channels fail visible and default is disabled',()=>{
 const f=fixture({renderLayer:7});f.member.layers.set(7);f.camera.layers.enable(7);f.frame();f.results.set(f.h.proxies[0],true);f.frame(()=>assert.equal(f.member.layers.mask,0));assert.equal(f.member.layers.mask,1<<7);f.member.layers.enable(0);f.frame(()=>assert.equal(f.member.layers.mask,1|(1<<7)));f.h.dispose();
 const off=fixture({enabled:false});off.frame();assert.equal(off.h.proxies.length,0);off.h.dispose();const all=Object.values(CABIN_ROOM_MEMBER_IDS).flat();assert.equal(all.length,28);assert.equal(new Set(all).size,28);
});
test('actual occluder transform, board visibility, target dimensions and alpha transform invalidate identities',()=>{
 const f=fixture();f.member.material.map=new THREE.Texture();for(const change of[()=>f.wall.position.x+=.01,()=>f.wall.visible=!f.wall.visible,()=>f.target.setSize(640,180),()=>f.member.material.map.offset.x+=.01,()=>{f.member.geometry.attributes.position.needsUpdate=true;},()=>{f.renderer.backend.device={};}]){f.frame();const old=f.h.proxies[0];f.results.set(old,true);change();f.frame(()=>assert.equal(f.member.layers.mask&1,1));assert.notEqual(f.h.proxies[0],old);}f.h.dispose();
});
test('unsupported bounds, query exceptions and multiple world callbacks restore before returning',()=>{
 const f=fixture();f.frame();f.renderer.isOccluded=()=>{throw Error('readback failed');};f.frame(()=>assert.equal(f.member.layers.mask,1));assert.equal(f.h.proxies.length,0);assert.match(f.h.diagnostics.reasons[0],/readback/);f.h.dispose();
 const g=fixture();g.frame();g.results.set(g.h.proxies[0],true);g.h.render(()=>{g.scene.onBeforeRender(g.renderer,g.scene,g.camera,g.target);assert.equal(g.member.layers.mask&1,0);g.scene.onBeforeRender(g.renderer,g.scene,g.camera,g.target);assert.equal(g.member.layers.mask&1,1);});assert.equal(g.member.layers.mask,1);g.h.dispose();
 const scene=new THREE.Scene(),bad=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(bad);const a=fixture({scene,rooms:[{id:'bad',meshes:[bad],bounds:new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(.01,.01,.01))}]});a.frame();assert.equal(a.h.proxies.length,0);assert.match(a.h.diagnostics.reasons[0],/envelope/);a.h.dispose();
});
test('replacing equal-version position attributes or uploading occluder indices invalidates the query',()=>{
 for(const change of[f=>{const p=f.member.geometry.attributes.position,copy=new Float32Array(p.array);for(let i=0;i<copy.length;i+=3)copy[i]+=4;f.member.geometry.setAttribute('position',new THREE.BufferAttribute(copy,3));},f=>{f.wall.geometry.index.needsUpdate=true;}]){const f=fixture();f.frame();const old=f.h.proxies[0];f.results.set(old,true);change(f);f.frame(()=>assert.equal(f.member.layers.mask&1,1));assert.notEqual(f.h.proxies[0],old);f.h.dispose();}
});
test('custom material callbacks, renderer overrides and nonaffine member matrices fail visible',()=>{
 for(const change of[f=>{f.member.material.onBeforeRender=()=>{};},f=>{f.renderer.contextNode={};},f=>{f.renderer.getRenderObjectFunction=()=>()=>{};},f=>{f.member.matrixAutoUpdate=false;f.member.matrix.elements[3]=.2;}]){const f=fixture();f.frame();f.results.set(f.h.proxies[0],true);change(f);f.frame(()=>assert.equal(f.member.layers.mask&1,1));assert.equal(f.h.proxies.length,0);f.h.dispose();}
});
