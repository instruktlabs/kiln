import { expect, test } from 'bun:test';
import { Box3, BoxGeometry, BufferAttribute, BufferGeometry, Group, InstancedMesh, InterleavedBuffer, InterleavedBufferAttribute, Matrix3, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Scene, SkinnedMesh, SphereGeometry, Vector3 } from 'three/webgpu';
import type { Material, Object3D } from 'three/webgpu';
import { bakeRigidGeometry, mergeRigidByMaterial } from '../../src/instancing/rigid-merge';
import { createFrameGraph, freezeTransforms } from '../../src/instancing/core';
import type { InstanceOwner } from '../../src/instancing/core';
const isAnchor=(n:Object3D)=>/^Joint_/.test(n.name);
const box=(x=1,y=1,z=1)=>{const g=new BoxGeometry(x,y,z);g.clearGroups();return g;};
const node=(name:string,parent:Object3D|null,x=0,y=0,z=0)=>{const g=new Group();g.name=name;g.position.set(x,y,z);parent?.add(g);return g;};
const mesh=(name:string,material:Material|Material[],parent:Object3D,x=0,y=0,z=0,geometry:BufferGeometry=box())=>{const m=new Mesh(geometry,material);m.name=name;m.position.set(x,y,z);parent.add(m);return m;};
const tris=(g:BufferGeometry)=>(g.index?g.index.count:g.attributes.position!.count)/3;
const drawn=(root:Object3D)=>{const out:Mesh[]=[];root.traverseVisible(o=>{if((o as Mesh).isMesh)out.push(o as Mesh);});return out;};
const allMeshes=(root:Object3D)=>{let n=0;root.traverse(o=>{if((o as Mesh).isMesh)n++;});return n;};
const worldBox=(root:Object3D)=>{root.updateMatrixWorld(true);const b=new Box3(),v=new Vector3();for(const m of drawn(root)){const p=m.geometry.attributes.position!;for(let i=0;i<p.count;i++)b.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld));}return b;};
const anchorOf=(m:Object3D,root:Object3D)=>{let n=m.parent!;while(n!==root&&!isAnchor(n))n=n.parent!;return n;};
const bits=(a:ArrayLike<number>)=>Array.from(new Uint32Array(Float32Array.from(a).buffer));
const slice=(g:BufferGeometry,name:string,from:number,count:number)=>{const a=g.getAttribute(name)!;return Array.from(a.array as Float32Array).slice(from*a.itemSize,(from+count)*a.itemSize);};
/** A farmhouse-like placement: shell parts sharing materials, a door anchor with hardware, a nested anchor and every never-merge case. */
function house(){
 const stone=new MeshStandardMaterial({name:'Stone'}),trim=new MeshStandardMaterial({name:'Trim'}),wood=new MeshStandardMaterial({name:'Wood'}),iron=new MeshStandardMaterial({name:'Iron'});
 const glass=new MeshStandardMaterial({name:'Glass',transparent:true,opacity:.4}),clear=new MeshPhysicalMaterial({name:'Clear',transmission:1});
 const root=node('House',null,10,0,-4);root.rotation.y=.5;const shell=node('Shell',root,1,0,0);shell.rotation.z=.2;shell.scale.set(1,2,1);
 const merged=[mesh('ShellA',stone,shell),mesh('ShellB',stone,shell,2,0,0),mesh('Roof',stone,root,0,3,0)];
 const parentA=mesh('ParentA',stone,root,0,0,5),parentB=mesh('ParentB',stone,root,1,0,5);merged.push(mesh('ChildA',stone,parentA,0,1,0),mesh('ChildB',stone,parentB,0,1,0));
 const shadowed=[mesh('ShadowA',stone,root,0,0,8),mesh('ShadowB',stone,root,2,0,8)];for(const m of shadowed)m.castShadow=true;
 const kept=[mesh('Trim',trim,shell,0,1,0),parentA,parentB,mesh('GlassA',glass,shell,0,0,1),mesh('GlassB',glass,shell,1,0,1),mesh('ClearA',clear,root,0,1,1),mesh('ClearB',clear,root,1,1,1),
  mesh('ExtrasA',stone,root,0,2,2),mesh('ExtrasB',stone,root,1,2,2),mesh('MultiA',[stone,trim],root,0,0,3),mesh('MultiB',[stone,trim],root,1,0,3),mesh('GroupedA',stone,root,0,0,4,new BoxGeometry()),mesh('GroupedB',stone,root,1,0,4,new BoxGeometry()),
  mesh('Hidden',stone,shell,0,-2,0),mesh('Veiled',stone,node('Shutters',root,0,0,6),0,0,0),mesh('MorphA',stone,root,0,4,0,box()),mesh('MorphB',stone,root,1,4,0,box()),mesh('Ranged',stone,root,2,4,0,box()),mesh('Kept',stone,root,3,4,0),
  mesh('Ordered',stone,root,0,5,0),mesh('Layered',stone,root,1,5,0),mesh('Unculled',stone,root,2,5,0),mesh('Joint_LampA',stone,root,0,6,0),mesh('Joint_LampB',stone,root,1,6,0)];
 const byName=(n:string)=>kept.find(m=>m.name===n)!;
 byName('ExtrasA').userData={name:'ExtrasA',rowanComponents:{}};byName('ExtrasB').userData={optimization:{}};byName('Hidden').visible=false;byName('Veiled').parent!.visible=false;merged[0]!.userData={name:'ShellA'};
 for(const n of ['MorphA','MorphB'])byName(n).geometry.morphAttributes.position=[new BufferAttribute(new Float32Array(72),3)];
 byName('Ranged').geometry.setDrawRange(0,12);byName('Ordered').renderOrder=1;byName('Layered').layers.set(2);byName('Unculled').frustumCulled=false;
 for(const n of ['SkinA','SkinB']){const s=new SkinnedMesh(box(),stone);s.name=n;root.add(s);kept.push(s);}
 for(const n of ['InstA','InstB']){const s=new InstancedMesh(box(),stone,2);s.name=n;root.add(s);kept.push(s);}
 const door=node('Joint_FrontDoor',root,3,0,0);door.rotation.y=.3;kept.push(mesh('Leaf',wood,door,.5,1,0));
 merged.push(mesh('HingeA',iron,door,0,.5,0),mesh('HingeB',iron,door,0,1.5,0),mesh('KnobPlate',iron,node('Knob',door,.8,1,.1)));
 const inner=node('Joint_Inner',door,0,2,0);merged.push(mesh('InnerA',stone,inner),mesh('InnerB',stone,inner,0,1,0));
 root.updateMatrixWorld(true);
 return{root,door,inner,anchors:[root,door,inner] as Object3D[],merged:[...merged,...shadowed],kept,materials:{stone,iron}};
}
const keepKept=(m:Object3D)=>m.name==='Kept';
test('anchors keep identity, names, transforms and children; no merged mesh spans two anchors',()=>{
 const h=house(),before=h.anchors.map(a=>({a,name:a.name,parent:a.parent,children:[...a.children],matrix:a.matrix.clone(),flags:[a.matrixAutoUpdate,a.matrixWorldAutoUpdate]})),total=allMeshes(h.root);
 const r=mergeRigidByMaterial(h.root,{isAnchor,keepMesh:keepKept});
 for(const b of before){expect(b.a.name).toBe(b.name);expect(b.a.parent).toBe(b.parent);expect(b.children.every((c,i)=>b.a.children[i]===c)).toBe(true);expect(b.a.matrix.equals(b.matrix)).toBe(true);expect([b.a.matrixAutoUpdate,b.a.matrixWorldAutoUpdate]).toEqual(b.flags);}
 expect(h.root.getObjectByName('Joint_FrontDoor')).toBe(h.door);expect(h.root.getObjectByName('ShellA')).toBe(h.merged[0]!);
 expect(r.stats).toEqual({sourceMeshes:12,mergedMeshes:4,keptMeshes:total-12,groups:9,triangles:12*12});
 expect(r.sources.map(s=>s.name).sort()).toEqual(h.merged.map(m=>m.name).sort());
 for(const m of r.merged){
  expect(h.anchors).toContain(m.parent!);expect(m.name).toMatch(/^Merged (House|Joint_FrontDoor|Joint_Inner)\/(Stone|Iron)$/);expect(m.matrix.equals(new Matrix4())).toBe(true);
  expect(m.userData.kilnMerged).toBe(true);expect(m.matrixWorld.equals(m.parent!.matrixWorld)).toBe(true);expect(m.geometry.boundingBox).not.toBeNull();expect(m.geometry.boundingSphere).not.toBeNull();
  const own=r.sources.filter(s=>anchorOf(s,h.root)===m.parent&&s.material===m.material&&s.castShadow===m.castShadow);
  expect(own.reduce((n,s)=>n+tris(s.geometry),0)).toBe(tris(m.geometry));
 }
 expect(r.merged.filter(m=>m.castShadow).length).toBe(1);
});
test('singletons, transparent, transmissive, extras, multi-material, grouped, skinned, morphed, instanced, parent, anchor, hidden, ranged and kept meshes are left alone',()=>{
 const h=house(),r=mergeRigidByMaterial(h.root,{isAnchor,keepMesh:keepKept});
 const names=r.sources.map(s=>s.name);for(const m of h.kept){expect(names).not.toContain(m.name);expect(m.visible).toBe(m.name!=='Hidden');}
 for(const m of h.merged)expect(m.visible).toBe(false);
});
test('triangle totals and world-space bounds are equal before and after',()=>{
 const h=house(),count=(root:Object3D)=>drawn(root).reduce((n,m)=>n+tris(m.geometry),0),t0=count(h.root),b0=worldBox(h.root);
 const r=mergeRigidByMaterial(h.root,{isAnchor});expect(r.stats.triangles).toBeGreaterThan(0);
 expect(count(h.root)).toBe(t0);const b1=worldBox(h.root);
 for(const k of ['x','y','z'] as const){expect(b1.min[k]).toBeCloseTo(b0.min[k],5);expect(b1.max[k]).toBeCloseTo(b0.max[k],5);}
 const door=new Box3(),probe=new Box3();h.door.updateMatrixWorld(true);for(const m of r.merged.filter(m=>m.parent===h.door))door.union(probe.setFromObject(m,true));
 const src=new Box3();for(const s of r.sources.filter(s=>anchorOf(s,h.root)===h.door))src.union(probe.setFromObject(s,true));
 expect(door.min.distanceTo(src.min)).toBeLessThan(1e-5);expect(door.max.distanceTo(src.max)).toBeLessThan(1e-5);
});
test('identity and pure-translation paths are bit-exact; tangent w is kept',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),g1=box(),g2=box(1,2,3);g1.computeTangents();g2.computeTangents();
 const tw=g1.getAttribute('tangent')!;tw.setW(0,-1);g1.attributes.normal!.setXYZ(0,.3,.4,0);g1.attributes.position!.setY(0,-0);// a short normal and a negative zero survive only a copy
 const a=mesh('a',mat,root,0,0,0,g1),b=mesh('b',mat,root,0,0,0,g2),c=mesh('c',mat,node('T',root,.1,-2.7,3.3),1.5,0,0,g1);root.updateMatrixWorld(true);
 const r=mergeRigidByMaterial(root,{isAnchor});expect(r.merged.length).toBe(1);const g=r.merged[0]!.geometry,n=g1.attributes.position!.count;
 for(const name of ['position','normal','uv','tangent'])for(const [src,at] of [[a,0],[b,n]] as const)expect(bits(slice(g,name,at,src.geometry.attributes.position!.count))).toEqual(bits(src.geometry.getAttribute(name)!.array as Float32Array));
 for(const name of ['normal','uv','tangent'])expect(bits(slice(g,name,2*n,n))).toEqual(bits(g1.getAttribute(name)!.array as Float32Array));
 const t=new Vector3().setFromMatrixPosition(c.matrixWorld),p=g1.attributes.position!.array as Float32Array;
 expect(bits(slice(g,'position',2*n,n))).toEqual(bits(Array.from(p,(v,i)=>v+t.getComponent(i%3))));
 expect(slice(g,'tangent',0,1)[3]).toBe(-1);expect(Array.from(g.index!.array).slice(0,g1.index!.count)).toEqual(Array.from(g1.index!.array));
});
test('a mirrored transform flips winding so faces stay front-facing',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),m=node('M',root);m.scale.set(-1,1,1);m.rotation.y=.4;mesh('a',mat,m,1,0,0);mesh('b',mat,m,-1,0,0);root.updateMatrixWorld(true);
 const facing=(g:BufferGeometry,matrix=m.matrixWorld)=>{const p=g.attributes.position!,nn=g.attributes.normal!,i=g.index!,nm=new Matrix3().getNormalMatrix(matrix),v=[0,1,2].map(()=>new Vector3()),nv=new Vector3();let agree=0,count=0;for(let k=0;k<i.count;k+=3){for(let j=0;j<3;j++)v[j]!.fromBufferAttribute(p,i.getX(k+j)).applyMatrix4(matrix);nv.fromBufferAttribute(nn,i.getX(k)).applyMatrix3(nm);const f=v[1]!.clone().sub(v[0]!).cross(v[2]!.clone().sub(v[0]!));if(f.dot(nv)>0)agree++;count++;}return agree/count;};
 expect(facing(box())).toBe(0);
 const r=mergeRigidByMaterial(root,{isAnchor});expect(r.merged.length).toBe(1);expect(facing(r.merged[0]!.geometry,root.matrixWorld)).toBe(1);
});
test('other transforms carry normals by the normal matrix and tangent xyz by the linear part, keeping w',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),s=node('S',root,1,2,3),g=new SphereGeometry(1,6,4);s.rotation.set(.3,.5,.1);s.scale.set(1,3,.5);g.computeTangents();g.getAttribute('tangent')!.setW(1,-1);
 const a=mesh('a',mat,s,0,0,0,g);mesh('b',mat,s,2,0,0,g);root.updateMatrixWorld(true);const out=mergeRigidByMaterial(root,{isAnchor}).merged[0]!.geometry;
 const nm=new Matrix3().getNormalMatrix(a.matrixWorld),lin=new Matrix3().setFromMatrix4(a.matrixWorld),u=new Vector3(),w=new Vector3(),t=g.getAttribute('tangent')!,o=out.getAttribute('tangent')!;
 for(let i=0;i<g.attributes.position!.count;i++){u.fromBufferAttribute(g.attributes.normal!,i).applyMatrix3(nm).normalize();w.fromBufferAttribute(out.attributes.normal!,i);expect(u.distanceTo(w)).toBeLessThan(1e-6);
  u.set(t.getX(i),t.getY(i),t.getZ(i)).applyMatrix3(lin).normalize();w.set(o.getX(i),o.getY(i),o.getZ(i));expect(u.distanceTo(w)).toBeLessThan(1e-6);expect(o.getW(i)).toBe(t.getW(i));}
});
test('a mirrored tangent-bearing part stays unmerged',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),g=box();g.computeTangents();const a=mesh('a',mat,root,0,0,0,g),b=mesh('b',mat,root,2,0,0,g),c=mesh('c',mat,root,4,0,0,g);c.scale.x=-1;
 const r=mergeRigidByMaterial(root,{isAnchor});expect(r.sources.map(s=>s.name)).toEqual([a.name,b.name]);expect(c.visible).toBe(true);expect(r.stats.keptMeshes).toBe(1);
});
test('interleaved, normalised and non-indexed input is read through the accessors into Float32 attributes',()=>{
 const interleaved=()=>{const s=box(),n=s.attributes.position!.count,data=new Float32Array(n*8);for(let i=0;i<n;i++){data.set([s.attributes.position!.getX(i),s.attributes.position!.getY(i),s.attributes.position!.getZ(i)],i*8);data.set([s.attributes.normal!.getX(i),s.attributes.normal!.getY(i),s.attributes.normal!.getZ(i)],i*8+3);data.set([s.attributes.uv!.getX(i),s.attributes.uv!.getY(i)],i*8+6);}
  const ib=new InterleavedBuffer(data,8),g=new BufferGeometry();g.setAttribute('position',new InterleavedBufferAttribute(ib,3,0));g.setAttribute('normal',new InterleavedBufferAttribute(ib,3,3));g.setAttribute('uv',new InterleavedBufferAttribute(ib,2,6));
  g.setAttribute('color',new BufferAttribute(new Uint8Array(n*4).map((_,i)=>i%256),4,true));g.setIndex(s.index);return g;};
 const root=node('R',null),mat=new MeshStandardMaterial(),g=interleaved(),before=Float32Array.from((g.attributes.position as InterleavedBufferAttribute).data.array);
 const a=mesh('a',mat,root,0,0,0,g),b=mesh('b',mat,root,0,2,0,interleaved());b.rotation.x=.7;root.updateMatrixWorld(true);
 const r=mergeRigidByMaterial(root,{isAnchor}),m=r.merged[0]!.geometry,n=g.attributes.position!.count;expect(r.sources.map(s=>s.name)).toEqual([a.name,b.name]);
 for(const name of ['position','normal','uv','color']){const out=m.getAttribute(name)!;expect(out.array).toBeInstanceOf(Float32Array);expect(out.normalized).toBe(false);expect((out as InterleavedBufferAttribute).isInterleavedBufferAttribute).toBeUndefined();}
 for(let i=0;i<n;i++){expect(m.attributes.position!.getY(i)).toBe(g.attributes.position!.getY(i));expect(m.attributes.uv!.getX(n+i)).toBe(g.attributes.uv!.getX(i));expect(m.attributes.color!.getW(n+i)).toBeCloseTo(g.attributes.color!.getW(i),7);}
 const v=new Vector3();for(let i=0;i<n;i++){v.fromBufferAttribute(b.geometry.attributes.position!,i).applyMatrix4(b.matrix);expect(m.attributes.position!.getY(n+i)).toBeCloseTo(v.y,6);}
 expect((g.attributes.position as InterleavedBufferAttribute).data.array).toEqual(before);
 const flat=new BufferGeometry();flat.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
 const baked=bakeRigidGeometry([mesh('f1',mat,root,0,0,0,flat),mesh('f2',mat,root,5,0,0,flat)],root,{attributes:'all'});expect(Array.from(baked.index!.array)).toEqual([0,1,2,3,4,5]);expect(baked.attributes.position!.getX(4)).toBe(6);
});
test('the index switches to Uint32 above 65535 vertices',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),soup=(n:number)=>{const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(n*3).map((_,i)=>i%7),3));return g;};
 const small=bakeRigidGeometry([mesh('a',mat,root,0,0,0,soup(32766)),mesh('b',mat,root,0,0,0,soup(32769))],root,{attributes:'all'});
 expect(small.index!.array).toBeInstanceOf(Uint16Array);expect(small.index!.count).toBe(65535);expect(small.index!.getX(65534)).toBe(65534);
 const large=bakeRigidGeometry([mesh('c',mat,root,0,0,0,soup(32766)),mesh('d',mat,root,0,0,0,soup(32772))],root,{attributes:'all'});
 expect(large.index!.array).toBeInstanceOf(Uint32Array);expect(large.index!.getX(65537)).toBe(65537);
});
test('position bakes recompose auto-updated nodes, read frozen matrices and leave the graph untouched',()=>{
 const root=node('R',null),mat=new MeshStandardMaterial(),a=node('A',root),f=node('F',root);a.position.x=5;f.matrixAutoUpdate=false;f.matrix.makeTranslation(7,0,0);
 const g1=box();g1.computeTangents();const g=bakeRigidGeometry([mesh('a',mat,a,0,0,0,g1),mesh('f',mat,f)],root,{attributes:'position'});
 expect(Object.keys(g.attributes)).toEqual(['position']);expect(g.index!.count).toBe(72);expect(a.matrix.elements[12]).toBe(0);expect(f.position.x).toBe(0);
 const xs=(from:number)=>{const b=new Box3();for(let i=from;i<from+24;i++)b.expandByPoint(new Vector3().fromBufferAttribute(g.attributes.position!,i));return(b.min.x+b.max.x)/2;};
 expect(xs(0)).toBe(5);expect(xs(24)).toBe(7);expect(()=>bakeRigidGeometry([mesh('x',mat,node('Other',null))],root,{attributes:'position'})).toThrow();
});
test('restore shows sources, removes merged meshes and disposes only owned geometry',()=>{
 const h=house(),r=mergeRigidByMaterial(h.root,{isAnchor,keepMesh:keepKept});let owned=0,borrowed=0;
 for(const m of r.merged)m.geometry.addEventListener('dispose',()=>owned++);for(const s of r.sources)s.geometry.addEventListener('dispose',()=>borrowed++);let materials=0;h.materials.stone.addEventListener('dispose',()=>materials++);
 r.restore();r.restore();expect(owned).toBe(4);expect(borrowed).toBe(0);expect(materials).toBe(0);
 expect(r.sources.every(s=>s.visible)).toBe(true);expect(r.merged.every(m=>m.parent===null)).toBe(true);expect(h.kept.find(m=>m.name==='Hidden')!.visible).toBe(false);
});
test('identical placements share cached geometry that restore never disposes',()=>{
 const wood=new MeshStandardMaterial({name:'Wood'}),iron=new MeshStandardMaterial({name:'Iron'});
 const gate=(x:number)=>{const g=node('Gate',null,x,0,0);g.rotation.y=x;mesh('PostL',wood,g,-1,0,0);mesh('PostR',wood,g,1,0,0);const leaf=node('Joint_GateLeaf',g,-1,0,0);mesh('Plank',wood,leaf,1,0,0);mesh('Rail',wood,leaf,1,1,0);mesh('HingeA',iron,leaf);mesh('HingeB',iron,leaf,0,1,0);g.updateMatrixWorld(true);return g;};
 const cache=new Map<string,BufferGeometry>(),cacheKey=(a:Object3D)=>a.name==='Gate'?'gate':a.name==='Joint_GateLeaf'?'gate/leaf':undefined;
 const r1=mergeRigidByMaterial(gate(3),{isAnchor,cache,cacheKey}),r2=mergeRigidByMaterial(gate(-4),{isAnchor,cache,cacheKey});
 expect(r1.merged.length).toBe(3);expect(cache.size).toBe(3);r1.merged.forEach((m,i)=>expect(r2.merged[i]!.geometry).toBe(m.geometry));
 let disposed=0;for(const g of cache.values())g.addEventListener('dispose',()=>disposed++);r1.restore();r2.restore();expect(disposed).toBe(0);
 const r3=mergeRigidByMaterial(gate(1),{isAnchor,cache,cacheKey:()=>undefined});expect(r3.merged.every(m=>![...cache.values()].includes(m.geometry))).toBe(true);
 const odd=gate(2);mesh('Extra',wood,odd,0,3,0);expect(()=>mergeRigidByMaterial(odd,{isAnchor,cache,cacheKey})).toThrow();
});
test('minGroup sets the smallest group that merges',()=>{
 const scene=()=>{const root=node('R',null),stone=new MeshStandardMaterial(),iron=new MeshStandardMaterial();for(let i=0;i<3;i++)mesh('S'+i,stone,root,i,0,0);for(let i=0;i<2;i++)mesh('I'+i,iron,root,i,1,0);return root;};
 expect(mergeRigidByMaterial(scene(),{isAnchor}).stats).toMatchObject({mergedMeshes:2,sourceMeshes:5,keptMeshes:0,groups:2});
 expect(mergeRigidByMaterial(scene(),{isAnchor,minGroup:3}).stats).toMatchObject({mergedMeshes:1,sourceMeshes:3,keptMeshes:2,groups:2});
});
// Wave-B review fixes (tmp/drawcalls/wave-b-review/fix-kit). Finding ids name the review items.
test('RK-7d merged meshes copy their anchor matrix flags, so a merge after freezeTransforms leaves the owner frozen',()=>{
 const scene=new Scene(),world=new Group();scene.add(world);const owner=node('barn',world),mat=new MeshStandardMaterial();for(let i=0;i<3;i++)mesh('part'+i,mat,owner,i);
 const owners:InstanceOwner[]=[{id:'barn',object:owner,dynamic:false,assetId:'barn'}];scene.updateMatrixWorld(true);
 const frozen=freezeTransforms(owners,()=>true),merge=mergeRigidByMaterial(owner,{isAnchor});expect(merge.merged).toHaveLength(1);
 expect([merge.merged[0]!.matrixAutoUpdate,merge.merged[0]!.matrixWorldAutoUpdate]).toEqual([false,false]);expect(merge.merged[0]!.matrixWorld.equals(owner.matrixWorld)).toBe(true);
 const graph=createFrameGraph({scene,worldRoot:world,owners,batches:null,isFixed:()=>true});expect(graph.stats.dynamicRoots).toBe(0);
 graph.restore();merge.restore();frozen.restore();
 expect(mergeRigidByMaterial(house().root,{isAnchor}).merged.every(m=>m.matrixAutoUpdate&&m.matrixWorldAutoUpdate)).toBe(true);
});
/** A box whose position, normal and uv share one Float32 InterleavedBuffer of stride 8, as GLTFLoader builds a strided bufferView. */
const interleavedBox=()=>{const s=box(),n=s.attributes.position!.count,data=new Float32Array(n*8);for(let i=0;i<n;i++){data.set([s.attributes.position!.getX(i),s.attributes.position!.getY(i),s.attributes.position!.getZ(i)],i*8);data.set([s.attributes.normal!.getX(i),s.attributes.normal!.getY(i),s.attributes.normal!.getZ(i)],i*8+3);data.set([s.attributes.uv!.getX(i),s.attributes.uv!.getY(i)],i*8+6);}
 const ib=new InterleavedBuffer(data,8),g=new BufferGeometry();g.setAttribute('position',new InterleavedBufferAttribute(ib,3,0));g.setAttribute('normal',new InterleavedBufferAttribute(ib,3,3));g.setAttribute('uv',new InterleavedBufferAttribute(ib,2,6));g.setIndex(s.index);return g;};
/** three r186 RenderObject.getGeometryCacheKey, which the WebGPU pipeline key includes. */
const geometryKey=(g:BufferGeometry)=>Object.keys(g.attributes).sort().map(n=>{const a=g.attributes[n] as BufferAttribute&{data?:{stride:number};offset?:number};return n+','+(a.data?a.data.stride+',':'')+(a.offset?a.offset+',':'')+a.itemSize+','+(a.normalized?'n,':'');}).join('');
test("RK-1 layout 'source' mirrors the first part's interleaved Float32 layout, so the pipeline geometry key matches its parts; values equal the canonical merge",()=>{
 const merge=(layout?:'canonical'|'source',cache?:Map<string,BufferGeometry>)=>{const root=node('R',null),mat=new MeshStandardMaterial({name:'M'});mesh('a',mat,root,0,0,0,interleavedBox());const b=mesh('b',mat,root,0,2,0,interleavedBox());b.rotation.x=.7;root.updateMatrixWorld(true);return mergeRigidByMaterial(root,{isAnchor,layout,cache,cacheKey:cache&&(()=>'r')}).merged[0]!.geometry;};
 const source=merge('source'),canonical=merge(),part=interleavedBox();
 expect(geometryKey(source)).toBe(geometryKey(part));expect(geometryKey(canonical)).not.toBe(geometryKey(part));expect(geometryKey(merge('canonical'))).toBe(geometryKey(canonical));
 const p=source.attributes.position as InterleavedBufferAttribute;expect(p.isInterleavedBufferAttribute).toBe(true);expect(p.data).toBe((source.attributes.uv as InterleavedBufferAttribute).data);expect(p.data.array).toBeInstanceOf(Float32Array);expect(p.data.count).toBe(2*part.attributes.position!.count);
 for(const name of ['position','normal','uv']){const s=source.getAttribute(name)!,c=canonical.getAttribute(name)!;expect(s.count).toBe(c.count);for(let i=0;i<s.count;i++)for(let k=0;k<s.itemSize;k++)expect(s.getComponent(i,k)).toBe(c.getComponent(i,k));}
 expect(Array.from(source.index!.array)).toEqual(Array.from(canonical.index!.array));expect(source.boundingSphere!.equals(canonical.boundingSphere!)).toBe(true);
 const shared=new Map<string,BufferGeometry>(),a=merge('canonical',shared),b=merge('source',shared);expect(shared.size).toBe(2);expect(geometryKey(b)).toBe(geometryKey(part));expect(a).not.toBe(b);
 // Plain and normalised inputs keep the canonical non-interleaved Float32 output in either layout.
 const plain=()=>{const root=node('R',null),mat=new MeshStandardMaterial();mesh('a',mat,root);mesh('b',mat,root,2);return mergeRigidByMaterial(root,{isAnchor,layout:'source'}).merged[0]!.geometry;};
 expect(geometryKey(plain())).toBe(geometryKey(box()));
});
test('R1 order puts parts with a lower value first in the merged vertex and index ranges; ties keep scene order',()=>{
 const build=(order?:(m:Mesh)=>number)=>{const root=node('R',null),mat=new MeshStandardMaterial();mesh('Walk',mat,root,0,0,0);mesh('Curb',mat,root,5,0,0);mesh('Rail',mat,root,10,0,0);root.updateMatrixWorld(true);return mergeRigidByMaterial(root,{isAnchor,order});};
 const centres=(g:BufferGeometry)=>[0,1,2].map(k=>{let x=0;for(let i=24*k;i<24*k+24;i++)x+=g.attributes.position!.getX(i);return x/24;});
 const firstTriangles=(g:BufferGeometry)=>Array.from(g.index!.array).slice(0,36).every(i=>i<24);
 const plain=build(),ordered=build(m=>m.name==='Curb'?-1:0);
 expect(centres(plain.merged[0]!.geometry)).toEqual([0,5,10]);expect(centres(ordered.merged[0]!.geometry)).toEqual([5,0,10]);expect(firstTriangles(ordered.merged[0]!.geometry)).toBe(true);
 expect(ordered.sources.map(s=>s.name)).toEqual(['Curb','Walk','Rail']);expect(ordered.stats).toEqual(plain.stats);
});
