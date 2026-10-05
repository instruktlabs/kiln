import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeTerrainTexture,periodicNoise,bakeTerrainTint,terrainDetailPolicy} from '../web/terrain-texture.mjs';

test('terrain detail generation is deterministic, bounded and seed-specific',()=>{
 const a=makeTerrainTexture(),b=makeTerrainTexture(),c=makeTerrainTexture({seed:17});
 assert.equal(a.length,256*256*4);assert.deepEqual(a,b);
 assert.notEqual(createHash('sha256').update(a).digest('hex'),createHash('sha256').update(c).digest('hex'));
 for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);
 for(const size of [0,16,255,512,NaN])assert.throws(()=>makeTerrainTexture({size}),/size/i);
 assert.throws(()=>makeTerrainTexture({seed:Infinity}),/seed/i);
});

test('low-frequency terrain noise wraps smoothly across world tile boundaries',()=>{
 for(const n of [4,8,16,32])for(const [x,z] of [[.13,.71],[-.01,1.12],[4.25,-7.23]]){
  const v=periodicNoise(x,z,n,13);
  assert.ok(v>=0&&v<=1);
  assert.ok(Math.abs(v-periodicNoise(x+1,z,n,13))<1e-12);
  assert.ok(Math.abs(v-periodicNoise(x,z+1,n,13))<1e-12);
 }
 const epsilon=1e-7;
 assert.ok(Math.abs(periodicNoise(-epsilon,.37,16,13)-periodicNoise(epsilon,.37,16,13))<1e-5);
});

test('procedural vertex tints retain exact terrain coordinates and repeat across chunks',()=>{
 const input=new Float32Array([0,0,0,12.5,0,12.5,-20,120,2300]),original=input.slice();
 for(const kind of ['sand','rock']){
  const colors=bakeTerrainTint(input,kind);assert.equal(colors.length,input.length);
  assert.deepEqual(colors,bakeTerrainTint(input,kind));assert.deepEqual(input,original);
  const chunk=bakeTerrainTint(input.slice(3,6),kind);assert.deepEqual(chunk,colors.slice(3,6));
  for(let i=0;i<colors.length;i+=3){assert.equal(colors[i],colors[i+1]);assert.equal(colors[i],colors[i+2]);assert.ok(colors[i]>=.7&&colors[i]<=1.2);}
 }
 assert.throws(()=>bakeTerrainTint(new Float32Array([NaN,0,0]),'sand'),/finite/i);
 assert.throws(()=>bakeTerrainTint(new Float32Array(2),'sand'),/positions/i);
 assert.throws(()=>bakeTerrainTint(input,'grass'),/kind/i);
});

test('terrain material LOD fades to matching macro colour before removing texture sampling',()=>{
 assert.deepEqual(terrainDetailPolicy(10),{near:true,blend:1});
 assert.deepEqual(terrainDetailPolicy(160),{near:true,blend:1});
 assert.deepEqual(terrainDetailPolicy(220),{near:false,blend:0});
 assert.deepEqual(terrainDetailPolicy(1000),{near:false,blend:0});
 let previous=1;for(let distance=160;distance<=220;distance+=.5){const p=terrainDetailPolicy(distance);assert.ok(p.blend<=previous&&p.blend>=0);previous=p.blend;}
 assert.ok(terrainDetailPolicy(219.99).blend<1e-6);
 for(const distance of [-1,NaN,Infinity])assert.throws(()=>terrainDetailPolicy(distance),/distance/i);
});

test('continuous rock tint matches sand on the shared seam and blends into rock',()=>{
 const positions=new Float32Array([-1200,15,1850,0,15,1850,1200,15,1850,0,150,2200]);
 const sand=bakeTerrainTint(positions,'sand'),rock=bakeTerrainTint(positions,'rock'),joined=bakeTerrainTint(positions,'rock',{joinStart:1850});
 assert.deepEqual(joined.slice(0,9),sand.slice(0,9));assert.ok(joined[9]>=.85&&joined[9]<=1.1);
 // Continuous terrain needs macro colour resolvable by its progressively coarse grid.
 for(let x=-1000;x<1000;x+=15){const pair=bakeTerrainTint(new Float32Array([x,150,2400,x+1,150,2400]),'rock',{joinStart:1850});assert.ok(Math.abs(pair[0]-pair[3])<.002);}
});
