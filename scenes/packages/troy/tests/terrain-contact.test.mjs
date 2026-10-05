import {test} from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {createContactHeightfield} from '../scripts/lib/contact-heightfield.mjs';
test('terrain contacts retain actual upward triangle heights and normals in transformed coordinates',()=>{
 const g=new T.PlaneGeometry(12,12,2,2);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,.1*p.getX(i)+.2*p.getZ(i));const mesh=new T.Mesh(g);mesh.position.set(8,2,-3);mesh.updateMatrixWorld(true);const h=createContactHeightfield(T,[mesh]),point=h.hit(9,-1),normal=new T.Vector3(-.1,1,-.2).normalize();assert.ok(Math.abs(point.height-2.5)<1e-7);assert.ok(new T.Vector3(...point.normal).distanceTo(normal)<1e-7);assert.equal(h.hit(50,50),null);
});
import {createTerrainFootprints} from '../web/terrain-footprints.mjs';
test('sand tolerance accepts a measured submillimetre crease but rejects a centimetre step',()=>{
 const root=new T.Group();for(const side of ['left','right']){const ankle=new T.Group();ankle.name='Joint_ankle_'+side;const foot=new T.Mesh(new T.BoxGeometry(.18,.17,.34));foot.name='Mesh_foot_'+side;ankle.add(foot);root.add(ankle);}root.updateMatrixWorld(true);
 const heightfield={hit(x,z){return {height:Math.max(0,z)*.005,normal:new T.Vector3(0,1,z>=0?-.005:0).normalize().toArray()};}};
 const strict=createTerrainFootprints(T,{root,heightfield}),sand=createTerrainFootprints(T,{root,heightfield,tolerance:.001});assert.equal(strict.candidate('left',0,0,0),null);assert.ok(sand.candidate('left',0,0,0));assert.ok(sand.metrics().maxAcceptedSoleError>.0007&&sand.metrics().maxAcceptedSoleError<.001);
 const ledge=createTerrainFootprints(T,{root,heightfield:{hit(x,z){return {height:z<0?.01:0,normal:[0,1,0]};}},tolerance:.001});assert.equal(ledge.candidate('left',0,0,0),null);assert.throws(()=>createTerrainFootprints(T,{root,heightfield,tolerance:.01}));
});
