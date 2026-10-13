import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createSourceArchive} from '../src/game/source-archive.mjs';

test('batched static sources retain transforms and provenance outside renderer traversal, with reversible ownership',()=>{
 const parent=new THREE.Group(),before=new THREE.Object3D(),source=new THREE.Group(),after=new THREE.Object3D(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 source.add(mesh);source.position.set(2,0,3);mesh.layers.mask=0;parent.position.x=5;parent.add(before,source,after);parent.updateMatrixWorld(true);const matrix=mesh.matrixWorld.clone();
 const archive=createSourceArchive([source],parent);assert.equal(source.parent,archive.root);assert.deepEqual(parent.children,[before,after]);assert(mesh.matrixWorld.equals(matrix));assert.equal(archive.root.children[0],source);
 let visits=0;const update=source.updateMatrixWorld;source.updateMatrixWorld=function(force){visits++;return update.call(this,force);};
 parent.updateMatrixWorld(true);archive.sync();assert.equal(visits,0,'unchanged source graph is not revisited');
 source.traverse(n=>{n.matrixAutoUpdate=false;n.matrixWorldAutoUpdate=false;});parent.position.x=7;parent.updateMatrixWorld(true);archive.sync();assert.equal(mesh.matrixWorld.elements[12],9);
 parent.visible=false;archive.sync();assert.equal(archive.root.visible,false);parent.visible=true;source.visible=false;archive.sync();assert.equal(source.visible,false,'authored logical visibility is retained');
 archive.dispose();assert.deepEqual(parent.children,[before,source,after]);assert.equal(source.parent,parent);archive.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('archive rejects interactive or incompletely batched source roots without changing their hierarchy',()=>{
 const parent=new THREE.Group(),live=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),interactive=new THREE.Group();interactive.userData.interaction={kind:'tree'};parent.add(live,interactive);parent.updateMatrixWorld(true);
 const archive=createSourceArchive([live,interactive],parent);assert.equal(archive.root.children.length,0);assert.deepEqual(parent.children,[live,interactive]);archive.dispose();live.geometry.dispose();live.material.dispose();
});
