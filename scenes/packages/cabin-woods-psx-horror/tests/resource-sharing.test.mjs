import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createTexturePool} from '../src/game/resource-sharing.mjs';
const texture=()=>{const t=new THREE.Texture({width:2,height:2});t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
test('equal encoded content and complete sampler state reuse one texture across GLBs',()=>{
 const pool=createTexturePool(),a=texture(),b=texture();a.name='wood-a';b.name='wood-b';
 assert.equal(pool.intern(a,'abc'),a);assert.equal(pool.intern(b,'abc'),a);
 assert.equal(pool.intern(texture(),'different'),pool.intern(texture(),'different'));
});
test('UV transforms, channels, orientation, colorspace, sampler and upload differences never alias',()=>{
 for(const change of [t=>t.offset.x=.2,t=>t.repeat.y=2,t=>t.rotation=.5,t=>t.center.x=.4,t=>t.channel=1,t=>t.flipY=false,t=>t.colorSpace=THREE.NoColorSpace,t=>t.wrapS=THREE.RepeatWrapping,t=>t.minFilter=THREE.NearestFilter,t=>t.magFilter=THREE.NearestFilter,t=>t.anisotropy=4,t=>t.premultiplyAlpha=true,t=>t.generateMipmaps=false,t=>t.unpackAlignment=1,t=>t.matrixAutoUpdate=false,t=>t.matrix.elements[0]=2]){
  const pool=createTexturePool(),a=texture(),b=texture();change(b);assert.notEqual(pool.intern(a,'abc'),pool.intern(b,'abc'));
 }
});
test('missing provenance, custom callbacks and dynamic textures stay private',()=>{
 const pool=createTexturePool(),a=texture(),b=texture();assert.equal(pool.intern(a,null),a);assert.equal(pool.intern(b,null),b);
 b.onUpdate=()=>{};assert.notEqual(pool.intern(a,'abc'),pool.intern(b,'abc'));
 const c=new THREE.CanvasTexture({width:2,height:2});assert.equal(pool.intern(c,'abc'),c);
});
