import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadAssetCollection} from '../src/game/assets.mjs';

function animatedTriangle(){
 const bin=Buffer.concat([Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),Buffer.from(new Float32Array([0,1]).buffer),Buffer.from(new Float32Array([0,0,0,2,0,0]).buffer)]);
 const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'AnimatedPart',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:8},{buffer:0,byteOffset:44,byteLength:24}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:2,componentType:5126,count:2,type:'VEC3'}],animations:[{name:'Move',samplers:[{input:1,output:2}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]};
 const json=Buffer.from(JSON.stringify(document)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const glb=Buffer.alloc(28+padded.length+bin.length);glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(padded.length,12);glb.writeUInt32LE(0x4e4f534a,16);padded.copy(glb,20);glb.writeUInt32LE(bin.length,20+padded.length);glb.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(glb,28+padded.length);return glb;
}

test('loaded collection retains renderable assets and animation without retaining parser workspaces',async t=>{
 const bytes=animatedTriangle(),entry={url:'triangle.glb',sha256:createHash('sha256').update(bytes).digest('hex')},manifest={schemaVersion:1,assets:{triangle:entry}};
 const previousFetch=globalThis.fetch,previousLocation=globalThis.location;
 globalThis.location={href:'http://scene.test/'};globalThis.fetch=async url=>new Response(String(url).endsWith('collection.json')?JSON.stringify(manifest):bytes);
 t.after(()=>{globalThis.fetch=previousFetch;if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;});
 const collection=await loadAssetCollection('collection.json'),master=collection.masters.get('triangle');
 assert(!('parser' in master),'parser caches and plugins must be scoped to loading');
 assert.equal(master.entry.sha256,entry.sha256);assert.equal(master.animations[0].name,'Move');
 const a=collection.instantiate('triangle'),b=collection.instantiate('triangle');
 a.mixer.clipAction(a.animations[0]).play();a.mixer.setTime(.5);
 assert.equal(a.root.getObjectByName('AnimatedPart').position.x,1);assert.equal(b.root.getObjectByName('AnimatedPart').position.x,0);
 assert.equal(master.scene.getObjectByName('AnimatedPart').position.x,0);
 assert.equal(a.root.children[0].geometry,b.root.children[0].geometry);assert.notEqual(a.root.children[0].material,b.root.children[0].material);
 a.root.children[0].material.dispose();b.root.children[0].material.dispose();collection.dispose();assert.equal(collection.masters.size,0);
});
