import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groundHeight} from '../web/layout.mjs';
import {createTerrainCoverage,continuousHeight,COVERAGE,limitOrbitEnvelope} from '../web/terrain-coverage.mjs';
import {waterGrid} from '../web/water-model.mjs';
import * as coverageModule from '../web/terrain-coverage.mjs';

test('continuous coverage is the default preview environment',()=>{
 assert.equal(coverageModule.DEFAULT_ENVIRONMENT,'continuous');
});

test('continuous ground preserves every original dense-grid contact and diagonal',()=>{
 const {sand,rock}=createTerrainCoverage();
 assert.equal(sand.xs.length,rock.xs.length);assert.deepEqual(sand.xs,rock.xs);
 for(let iz=0;iz<=192;iz++)for(let ix=0;ix<=192;ix++){
  const x=-1200+ix*12.5,z=-550+iz*12.5;
  const a=sand.xs.indexOf(x),b=sand.zs.indexOf(z),index=(b*sand.xs.length+a)*3;
  assert.ok(a>=0&&b>=0);assert.equal(sand.positions[index+1],Math.fround(groundHeight(x,z)));
  assert.equal(continuousHeight(x,z),groundHeight(x,z));
 }
 const boundary=sand.zs.length-1;
 assert.equal(sand.zs[boundary],1850);assert.equal(rock.zs[0],1850);
 for(let ix=0;ix<sand.xs.length;ix++){
  const a=(boundary*sand.xs.length+ix)*3,b=ix*3;
  assert.deepEqual(sand.positions.slice(a,a+3),rock.positions.slice(b,b+3));
 }
 const x=sand.xs.indexOf(0),z=sand.zs.indexOf(0),a=z*sand.xs.length+x,b=a+1,c=a+sand.xs.length,d=c+1;
 const cell=(z*(sand.xs.length-1)+x)*6;
 assert.deepEqual([...sand.indices.slice(cell,cell+6)],[a,c,b,b,c,d]);
});

test('outer ground is bounded, deterministic, nondegenerate and extends past the admitted view',()=>{
 const first=createTerrainCoverage(),second=createTerrainCoverage();
 for(const kind of ['sand','rock']){
  const g=first[kind];assert.deepEqual(g.positions,second[kind].positions);
  assert.ok(g.positions.length/3<50000);assert.ok(g.positions.every(Number.isFinite));
  assert.equal(g.xs[0],-COVERAGE.extent);assert.equal(g.xs.at(-1),COVERAGE.extent);
  for(let i=1;i<g.xs.length;i++)assert.ok(g.xs[i]>g.xs[i-1]);
  for(let i=1;i<g.zs.length;i++)assert.ok(g.zs[i]>g.zs[i-1]);
  for(let i=0;i<g.indices.length;i++)assert.ok(g.indices[i]<g.positions.length/3);
 }
 assert.equal(first.rock.zs.at(-1),COVERAGE.extent);
 assert.ok(COVERAGE.extent-COVERAGE.targetLimit-COVERAGE.orbitDistance>COVERAGE.cameraFar);
 assert.ok(COVERAGE.fogFar<COVERAGE.cameraFar);
 assert.throws(()=>continuousHeight(NaN,0),/finite/);
});

test('orbit bounds retain offset and leave all existing views unchanged',()=>{
 const position={x:4,y:200,z:-200},target={x:0,y:12,z:335};
 limitOrbitEnvelope(position,target);assert.deepEqual(position,{x:4,y:200,z:-200});
 const offset={x:position.x-target.x,y:position.y-target.y,z:position.z-target.z};
 target.x=10000;position.x=target.x+offset.x;target.z=-10000;position.z=target.z+offset.z;
 limitOrbitEnvelope(position,target);assert.equal(target.x,COVERAGE.targetLimit);assert.equal(target.z,-COVERAGE.targetLimit);
 for(const key of ['x','y','z'])assert.equal(position[key]-target[key],offset[key]);
});

test('extended water retains the entire original near grid for every quality',()=>{
 for(const tier of ['low','balanced','high']){
  const old=waterGrid(tier),wide=waterGrid(tier,{extent:COVERAGE.extent});
  assert.deepEqual(wide.xs.filter(x=>x>=-2600&&x<=2600),old.xs);
  assert.deepEqual(wide.zs.filter(z=>z>=-3000),old.zs);
  assert.equal(wide.xs[0],-COVERAGE.extent);assert.equal(wide.xs.at(-1),COVERAGE.extent);
  assert.equal(wide.zs[0],-COVERAGE.extent);assert.equal(wide.zs.at(-1),20);
  assert.ok(wide.xs.length<=old.xs.length+8);assert.ok(wide.zs.length<=old.zs.length+4);
 }
 assert.throws(()=>waterGrid('balanced',{extent:1000}),/extent/);
});
