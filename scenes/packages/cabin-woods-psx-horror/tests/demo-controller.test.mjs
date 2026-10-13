import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {applyStableDemoCamera,installDemoControls} from '../src/game/demo-controller.mjs';

class Surface extends EventTarget {
 listeners=new Map();addEventListener(type,listener,options){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);super.addEventListener(type,listener,options);}removeEventListener(type,listener,options){this.listeners.get(type)?.delete(listener);super.removeEventListener(type,listener,options);}listenerCount(){return [...this.listeners.values()].reduce((n,s)=>n+s.size,0);}
 emit(type,fields={}){const e=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(fields))Object.defineProperty(e,key,{value});this.dispatchEvent(e);return e;}
}
function fixture(options={}){const element=new Surface(),document=new Surface(),window=new Surface(),player={position:[1,0,2],heading:0,pitch:0,reviewTravel:0},controls={active:true,keys:new Set(),commands:[]};document.pointerLockElement=null;document.exitPointerLock=()=>{document.pointerLockElement=null;document.emit('pointerlockchange',{timeStamp:100});};let requests=0;element.requestPointerLock=()=>{requests++;};const input=installDemoControls({element,document,window,controls,getPlayer:()=>player,...options});const lock=(timeStamp=10)=>{input.requestPlay();document.pointerLockElement=element;document.emit('pointerlockchange',{timeStamp});};return {element,document,window,player,controls,input,lock,requests:()=>requests};}

test('request diagnostics expose detached acquisition and current browser rejection',async()=>{
 const f=fixture();assert.equal(f.input.getRequestStatus().pending,false);f.input.requestPlay();const before=f.input.getRequestStatus();assert.equal(before.pending,true);f.input.pause();assert.equal(f.input.getRequestStatus().canceled,true);assert.equal(before.canceled,false);
 f.document.emit('pointerlockerror');f.element.requestPointerLock=()=>Promise.reject(new DOMException('Document is not focused','WrongDocumentError'));f.input.requestPlay();await Promise.resolve();
 const failed=f.input.getRequestStatus();assert.equal(failed.lastError.name,'WrongDocumentError');assert.equal(failed.pending,false);assert.equal(failed.active,false);f.input.dispose();
});

test('overview and orbit cannot capture mouse or activate first-person movement',()=>{
 let enabled=false;const f=fixture({canPlay:()=>enabled});
 f.element.emit('mousedown',{button:0});assert.equal(f.requests(),0);
 f.window.emit('keydown',{code:'KeyW'});assert.equal(f.controls.keys.size,0);
 f.lock();assert.equal(f.controls.active,false);assert.equal(f.document.pointerLockElement,null);
 f.document.emit('mousemove',{movementX:50,movementY:20,timeStamp:11});assert.equal(f.player.heading,0);
 enabled=true;f.document.exitPointerLock();f.element.emit('mousedown',{button:0});assert.equal(f.requests(),1);
 f.lock(100);assert.equal(f.controls.active,true);f.input.dispose();
});

test('camera stays at fixed feet-relative eye; yaw/pitch have zero roll and no turn translation',()=>{
 const camera=new THREE.PerspectiveCamera(),position=[3,.1,-2];
 for(let step=0;step<200;step++){const heading=step*.03,pitch=Math.sin(step)*.4;applyStableDemoCamera(camera,{position,heading,pitch,time:step,walking:true});assert.deepEqual(camera.position.toArray(),[3,.1+1.61,-2]);assert.equal(camera.rotation.z,0);const direction=camera.getWorldDirection(new THREE.Vector3());assert.ok(direction.distanceTo(new THREE.Vector3(Math.cos(heading)*Math.cos(pitch),Math.sin(pitch),Math.sin(heading)*Math.cos(pitch)))<1e-12);}
 applyStableDemoCamera(camera,{position,heading:.2,pitch:.3});const q=camera.quaternion.toArray();for(let step=0;step<100;step++)applyStableDemoCamera(camera,{position,heading:.2,pitch:.3});assert.deepEqual(camera.quaternion.toArray(),q);
});
test('mouse look uses each fresh event once regardless of frame batching',()=>{
 const a=fixture(),b=fixture();a.lock();b.lock();
 for(let i=0;i<20;i++){a.document.emit('mousemove',{movementX:3,movementY:-2,timeStamp:11+i});if(i%4===0)applyStableDemoCamera(new THREE.PerspectiveCamera(),a.player);b.document.emit('mousemove',{movementX:3,movementY:-2,timeStamp:11+i});}
 assert.equal(a.player.heading,b.player.heading);assert.ok(Math.abs(a.player.heading-.12)<1e-12);assert.ok(Math.abs(a.player.pitch-.08)<1e-12);a.input.dispose();b.input.dispose();
});
test('unlock clears movement, queued commands and auto review travel; reacquire accepts fresh look only',()=>{
 const f=fixture();f.lock();f.controls.keys.add('KeyW');f.controls.commands.push('attack');f.player.reviewTravel=1;f.document.exitPointerLock();assert.equal(f.controls.active,false);assert.equal(f.controls.keys.size,0);assert.deepEqual(f.controls.commands,[]);assert.equal(f.player.reviewTravel,0);
 f.document.emit('mousemove',{movementX:500,movementY:500,timeStamp:110});assert.equal(f.player.heading,0);f.element.emit('mousedown',{button:0});assert.equal(f.requests(),2);f.lock(200);assert.equal(f.controls.active,true);f.document.emit('mousemove',{movementX:500,movementY:500,timeStamp:150});assert.equal(f.player.heading,0);f.document.emit('mousemove',{movementX:10,movementY:-10,timeStamp:201});assert.equal(f.player.heading,.02);assert.equal(f.player.pitch,.02);assert.deepEqual(f.controls.commands,[]);f.input.dispose();
});
test('Escape and blur cancel stale input without changing look and handlers stop on disposal',()=>{
 const f=fixture();f.lock();f.player.heading=.4;f.controls.keys.add('KeyW');f.player.reviewTravel=-1;f.window.emit('keydown',{code:'Escape'});assert.equal(f.document.pointerLockElement,null);assert.equal(f.player.heading,.4);assert.equal(f.player.reviewTravel,0);f.lock(210);f.window.emit('blur');assert.equal(f.controls.active,false);assert.equal(f.document.pointerLockElement,null);f.input.dispose();f.document.emit('mousemove',{movementX:20,movementY:0,timeStamp:230});assert.equal(f.player.heading,.4);
});
test('pointer lock handles rejected promise and synchronous throw; a failed request can be retried',async()=>{
 const f=fixture();f.element.requestPointerLock=()=>Promise.reject(Error('denied'));f.element.emit('mousedown',{button:0});await Promise.resolve();assert.equal(f.controls.active,false);f.element.requestPointerLock=()=>{throw Error('blocked');};assert.doesNotThrow(()=>f.element.emit('mousedown',{button:0}));f.element.requestPointerLock=()=>{f.lock(300);};f.element.emit('mousedown',{button:0});assert.equal(f.controls.active,true);f.input.dispose();
});
test('locked click attacks once; acquiring click does not attack; form keys and invalid deltas are ignored',()=>{
 const f=fixture();f.element.emit('mousedown',{button:0});assert.deepEqual(f.controls.commands,[]);f.lock();f.element.emit('mousedown',{button:0});assert.deepEqual(f.controls.commands,['attack']);f.window.emit('keydown',{code:'KeyW',target:{tagName:'INPUT'}});assert.equal(f.controls.keys.size,0);f.document.emit('mousemove',{movementX:Infinity,movementY:0,timeStamp:11});f.document.emit('mousemove',{movementX:1,movementY:NaN,timeStamp:12});assert.equal(f.player.heading,0);f.input.dispose();
});
test('pause discards review travel and queued actions, and releases only its own lock',()=>{
 const f=fixture();const foreign=new Surface();f.document.pointerLockElement=foreign;f.controls.commands.push('use');f.player.reviewTravel=1;f.input.pause();assert.equal(f.document.pointerLockElement,foreign);assert.equal(f.player.reviewTravel,0);assert.deepEqual(f.controls.commands,[]);f.input.dispose();
});
test('R requests reload and B retains battery use without implicit camera motion',()=>{
 const f=fixture();f.lock();f.window.emit('keydown',{code:'KeyR'});f.window.emit('keydown',{code:'KeyB'});assert.deepEqual(f.controls.commands,['reload','battery']);assert.equal(f.player.heading,0);assert.equal(f.player.pitch,0);f.input.dispose();
});
test('number slots map 1 to unarmed, 2 to axe and 3 to shotgun',()=>{
 const f=fixture();f.lock();for(const code of ['Digit1','Digit2','Digit3'])f.window.emit('keydown',{code});assert.deepEqual(f.controls.commands,['unarmed','axe','shotgun']);f.input.dispose();
});

test('requestPlay owns deferred acquisition; overview cancellation rejects late owned grant',()=>{
 let canPlay=true;const f=fixture({canPlay:()=>canPlay});assert.equal(f.input.requestPlay(),true);canPlay=false;f.input.pause();f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:400});assert.equal(f.controls.active,false);assert.equal(f.document.pointerLockElement,null);canPlay=true;assert.equal(f.input.requestPlay(),true);f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:410});assert.equal(f.controls.active,true);f.input.dispose();
});
test('pending Escape consumes its layer and blur cannot reactivate from a deferred void grant',()=>{
 for(const cancel of ['Escape','blur']){const f=fixture();f.input.requestPlay();if(cancel==='Escape'){const e=f.window.emit('keydown',{code:'Escape',key:'Escape'});assert.equal(e.defaultPrevented,true);}else f.window.emit('blur');f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:400});assert.equal(f.controls.active,false);assert.equal(f.document.pointerLockElement,null);f.input.dispose();}
});
test('disposed Promise request releases its late owned grant and never a foreign lock',async()=>{
 for(const foreign of [false,true]){const f=fixture();let resolve;f.element.requestPointerLock=()=>new Promise(r=>resolve=r);f.input.requestPlay();f.input.dispose();assert.equal(f.document.listenerCount(),0);assert.equal(f.window.listenerCount(),0);const ownedOrForeign=foreign?new Surface():f.element;f.document.pointerLockElement=ownedOrForeign;resolve();await Promise.resolve();assert.equal(f.document.pointerLockElement,foreign?ownedOrForeign:null);assert.equal(f.controls.active,false);}
});
test('disposed legacy void request releases late grant; canceled pending request cannot overlap',()=>{
 const f=fixture();assert.equal(f.input.requestPlay(),true);f.input.pause();assert.equal(f.input.requestPlay(),false);assert.equal(f.requests(),1);f.input.dispose();assert.equal(f.window.listenerCount(),0);assert.equal(f.document.listenerCount(),2);f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:400});assert.equal(f.document.pointerLockElement,null);assert.equal(f.controls.active,false);assert.equal(f.document.listenerCount(),0);assert.equal(f.input.requestPlay(),false);
});
test('old Promise rejection cannot pause a newer authorized session',async()=>{
 const f=fixture();let reject;f.element.requestPointerLock=()=>new Promise((_,r)=>reject=r);f.input.requestPlay();f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:400});f.input.pause();f.element.requestPointerLock=()=>{};f.input.requestPlay();f.document.pointerLockElement=f.element;f.document.emit('pointerlockchange',{timeStamp:500});reject(Error('stale'));await Promise.resolve();assert.equal(f.controls.active,true);assert.equal(f.document.pointerLockElement,f.element);f.input.dispose();
});
test('legacy disposal settlement listeners have a bounded lease and all input listeners stop immediately',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.input.requestPlay();f.input.dispose();assert.equal(f.window.listenerCount(),0);assert.equal(f.element.listenerCount(),0);assert.equal(f.document.listenerCount(),2);t.mock.timers.tick(29999);assert.equal(f.document.listenerCount(),2);t.mock.timers.tick(1);assert.equal(f.document.listenerCount(),0);assert.equal(f.input.requestPlay(),false);
});

test('explicit keyboard fallback works after rejection and pauses on Escape without accepting mouse look',async()=>{
 const f=fixture();f.element.requestPointerLock=()=>Promise.reject(Error('Mouse capture denied'));f.input.requestPlay();await Promise.resolve();assert.equal(f.input.getRequestStatus().lastError.message,'Mouse capture denied');
 assert.equal(f.input.requestKeyboardPlay(),true);assert.equal(f.input.getRequestStatus().keyboardMode,true);assert.equal(f.controls.active,true);f.window.emit('keydown',{code:'KeyW'});assert(f.controls.keys.has('KeyW'));f.document.emit('mousemove',{movementX:500,movementY:200,timeStamp:500});assert.equal(f.player.heading,0);f.element.emit('mousedown',{button:0});assert.deepEqual(f.controls.commands,['attack']);
 f.window.emit('keydown',{code:'Escape'});assert.equal(f.controls.active,false);assert.equal(f.input.getRequestStatus().keyboardMode,false);f.input.dispose();assert.equal(f.input.requestKeyboardPlay(),false);
});
test('keyboard fallback cannot activate outside Play, during acquisition or while another element owns the pointer',()=>{
 let canPlay=false;const f=fixture({canPlay:()=>canPlay});assert.equal(f.input.requestKeyboardPlay(),false);canPlay=true;f.input.requestPlay();assert.equal(f.input.requestKeyboardPlay(),false);f.document.emit('pointerlockerror');f.document.pointerLockElement=new Surface();assert.equal(f.input.requestKeyboardPlay(),false);f.document.pointerLockElement=null;f.element.requestPointerLock=undefined;assert.equal(f.input.requestPlay(),false);assert.match(f.input.getRequestStatus().lastError.message,/unavailable/);assert.equal(f.input.requestKeyboardPlay(),true);f.window.emit('blur');assert.equal(f.controls.active,false);f.input.dispose();
});
