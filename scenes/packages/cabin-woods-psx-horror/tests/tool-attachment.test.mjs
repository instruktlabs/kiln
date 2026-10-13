import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';import {attachAtSocket} from '../src/game/tool-attachment.mjs';
test('nested nonidentity tool grip closes exactly against moving character socket, preserving tool geometry',()=>{
 const world=new THREE.Group(),actor=new THREE.Group(),socket=new THREE.Object3D(),tool=new THREE.Group(),frame=new THREE.Group(),grip=new THREE.Object3D(),mesh=new THREE.Mesh(new THREE.BoxGeometry());
 actor.position.set(3,1,-2);actor.rotation.y=.7;socket.position.set(.4,.2,-.1);socket.rotation.z=.5;actor.add(socket);world.add(actor,tool);
 frame.position.set(.2,-.1,.3);frame.rotation.x=.3;grip.position.set(-.075,.0445,0);grip.rotation.z=-.4;frame.add(grip,mesh);tool.add(frame);world.updateMatrixWorld(true);
 const geometry=mesh.geometry.attributes.position.array.slice(),frameMatrix=frame.matrix.clone();attachAtSocket(socket,tool,grip);
 for(const angle of [0,.4,-.8]){actor.rotation.y=angle;socket.rotation.x=angle*.5;world.updateMatrixWorld(true);assert.ok(grip.getWorldPosition(new THREE.Vector3()).distanceTo(socket.getWorldPosition(new THREE.Vector3()))<1e-7);assert.ok(grip.getWorldQuaternion(new THREE.Quaternion()).angleTo(socket.getWorldQuaternion(new THREE.Quaternion()))<1e-7);}
 assert.deepEqual(mesh.geometry.attributes.position.array,geometry);assert.deepEqual(frame.matrix.elements,frameMatrix.elements);
});
