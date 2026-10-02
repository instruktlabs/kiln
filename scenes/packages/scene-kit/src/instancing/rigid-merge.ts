import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Matrix3, Matrix4, Mesh, Vector3 } from 'three/webgpu';
import type { Material, Object3D } from 'three/webgpu';
export interface RigidMergeOptions {
 isAnchor(n:Object3D):boolean;keepMesh?(m:Mesh):boolean;cache?:Map<string,BufferGeometry>;cacheKey?(anchor:Object3D):string|undefined;minGroup?:number;
 /**
  * Merged vertex layout. 'canonical' (default): one Float32 attribute each, so parts of any layout share a pipeline. 'source':
  * the first part's interleaved Float32 buffers keep their stride and offsets, so the merged mesh shares three r186's geometry
  * pipeline key (RenderObject.getGeometryCacheKey) with unmerged meshes of that layout; other attributes stay canonical.
  */
 layout?:'canonical'|'source';
 /** Parts with a lower value come first in their merged mesh (ties keep scene order): one draw resolves coplanar depth ties by index order. */
 order?(m:Mesh):number;
}
export interface RigidMerge {merged:Mesh[];sources:Mesh[];stats:{sourceMeshes:number;mergedMeshes:number;keptMeshes:number;groups:number;triangles:number};restore():void}
interface Part {m:Mesh;r:Matrix4}
const LINEAR=[1,0,0,0,0,1,0,0,0,0,1,0],is=(x:object,k:string)=>!!(x as Record<string,unknown>)[k];
function local(n:Object3D,out:Matrix4):Matrix4{if(!n.matrixAutoUpdate)return out.copy(n.matrix);out.compose(n.position,n.quaternion,n.scale);const p=n.pivot,e=out.elements;if(p){e[12]+=p.x-e[0]*p.x-e[4]*p.y-e[8]*p.z;e[13]+=p.y-e[1]*p.x-e[5]*p.y-e[9]*p.z;e[14]+=p.z-e[2]*p.x-e[6]*p.y-e[10]*p.z;}return out;}
/** Local matrices from the mesh up to, not including, the anchor: pose-independent. */
function relative(m:Object3D,anchor:Object3D):Matrix4{const out=new Matrix4(),l=new Matrix4();for(let n:Object3D|null=m;n!==anchor;n=n.parent){if(!n)throw new Error(`${m.name} is not under ${anchor.name}`);out.premultiply(local(n,l));}return out;}
/**
 * Concatenates parts into one indexed Float32 geometry in the anchor frame, reading through the attribute accessors (interleaved,
 * normalised and quantised inputs). A pure translation copies normals and tangents bit for bit and only offsets positions; other
 * matrices transform positions, normals (normal matrix) and tangent xyz (w kept) and reverse the winding when mirrored.
 */
function build(parts:Part[],names:string[],mirror=false):BufferGeometry{
 const first=parts[0]!.m.geometry,sizes=names.map(n=>first.getAttribute(n).itemSize);let verts=0,indices=0;
 for(const{m}of parts){const g=m.geometry,c=g.attributes.position!.count;verts+=c;indices+=g.index?g.index.count:c;}
 const arrays=sizes.map(s=>new Float32Array(verts*s)),index=verts>65535?new Uint32Array(indices):new Uint16Array(indices),v=new Vector3(),nm=new Matrix3(),lin=new Matrix3();let v0=0,i0=0;
 for(const{m,r}of parts){
  const g=m.geometry,count=g.attributes.position!.count,e=r.elements,shift=LINEAR.every((x,i)=>e[i]===x),flip=r.determinant()<0,src=g.index,n=src?src.count:count;
  if(!shift){nm.getNormalMatrix(r);lin.setFromMatrix4(r);}
  names.forEach((name,j)=>{
   const a=g.getAttribute(name),s=sizes[j]!,o=arrays[j]!;if(a?.itemSize!==s)throw new Error(`${m.name}: attribute ${name} differs`);
   for(let k=0;k<count;k++)for(let c=0;c<s;c++)o[(v0+k)*s+c]=a.getComponent(k,c);
   if(name==='position'){if(!shift)for(let k=v0;k<v0+count;k++)v.fromArray(o,k*3).applyMatrix4(r).toArray(o,k*3);else for(let c=0;c<3;c++)if(e[12+c])for(let k=v0;k<v0+count;k++)o[k*3+c]+=e[12+c]!;}
   else if(!shift&&(name==='normal'||name==='tangent'))for(let k=v0;k<v0+count;k++)v.fromArray(o,k*s).applyMatrix3(name==='normal'?nm:lin).normalize().toArray(o,k*s);
  });
  for(let k=0;k<n;k+=3){const a=src?src.getX(k):k,b=src?src.getX(k+1):k+1,c=src?src.getX(k+2):k+2;index[i0+k]=v0+a;index[i0+k+1]=v0+(flip?c:b);index[i0+k+2]=v0+(flip?b:c);}
  v0+=count;i0+=n;
 }
 const out=new BufferGeometry(),buffers=new Map<InterleavedBuffer,InterleavedBuffer>();
 names.forEach((n,j)=>{
  const a=first.getAttribute(n) as InterleavedBufferAttribute,s=sizes[j]!,o=arrays[j]!;
  if(!(mirror&&a.isInterleavedBufferAttribute&&a.data.array instanceof Float32Array&&!a.normalized)){out.setAttribute(n,new BufferAttribute(o,s));return;}
  let ib=buffers.get(a.data);if(!ib)buffers.set(a.data,ib=new InterleavedBuffer(new Float32Array(verts*a.data.stride),a.data.stride));
  const d=ib.array as Float32Array,st=ib.stride;for(let k=0;k<verts;k++)for(let c=0;c<s;c++)d[k*st+a.offset+c]=o[k*s+c]!;
  out.setAttribute(n,new InterleavedBufferAttribute(ib,s,a.offset,false));
 });
 out.setIndex(new BufferAttribute(index,1));out.computeBoundingBox();out.computeBoundingSphere();return out;
}
/** One geometry for meshes baked into the anchor frame; `position` alone serves material-free stand-ins. The caller owns it. */
export function bakeRigidGeometry(meshes:Mesh[],anchor:Object3D,o:{attributes:'all'|'position'}):BufferGeometry{if(!meshes.length)throw new Error('No meshes to bake');return build(meshes.map(m=>({m,r:relative(m,anchor)})),o.attributes==='position'?['position']:Object.keys(meshes[0]!.geometry.attributes));}
/**
 * Merges rigid parts by material inside each anchor: a mesh belongs to its nearest isAnchor ancestor (the root always counts) and
 * merges with parts of the same anchor, material, attribute layout, shadow flags, render order, layers and culling. Anchors keep
 * their identity, transform and children; merged meshes are their children with identity transforms; sources stay in the graph,
 * hidden. Never merged: transparent or transmissive, multi-material or grouped, skinned, morphed or instanced meshes, meshes with
 * children, anchors, meshes with userData beyond name, a partial drawRange, hidden meshes (directly or below their anchor),
 * keepMesh, and tangent-bearing parts mirrored against their anchor (three r186 builds the bitangent with no determinant term).
 * Merged meshes copy their anchor's matrix flags, so a merge after freezeTransforms keeps a frozen owner frozen.
 */
export function mergeRigidByMaterial(root:Object3D,o:RigidMergeOptions):RigidMerge{
 const min=o.minGroup??2,buckets=new Map<string,{anchor:Object3D;key:string;parts:Part[]}>();let all=0;
 const solo=(m:Mesh)=>{const g=m.geometry,mat=m.material as Material&{transmission?:number};return Array.isArray(mat)||g.groups.length>0||mat.transparent||(mat.transmission??0)>0||['isSkinnedMesh','isInstancedMesh','isBatchedMesh'].some(k=>is(m,k))||is(g,'isInstancedBufferGeometry')||Object.keys(g.morphAttributes).length>0||m.children.length>0||Object.keys(m.userData).some(k=>k!=='name')||g.drawRange.start!==0||g.drawRange.count!==Infinity||!g.attributes.position||!!o.keepMesh?.(m);};
 const visit=(node:Object3D,anchor:Object3D,hidden:boolean)=>{for(const c of node.children){const own=o.isAnchor(c),m=c as Mesh;
  if(m.isMesh){all++;if(!own&&!hidden&&m.visible&&!solo(m)){const r=relative(m,anchor),g=m.geometry;if(!(r.determinant()<0&&g.attributes.tangent)){
   const sig=Object.keys(g.attributes).sort().map(n=>`${n}:${g.attributes[n]!.itemSize}:${g.attributes[n]!.normalized}`).join(),key=[(m.material as Material).uuid,sig,m.castShadow,m.receiveShadow,m.renderOrder,m.layers.mask,m.frustumCulled].join('|'),id=anchor.id+'|'+key;
   let b=buckets.get(id);if(!b)buckets.set(id,b={anchor,key,parts:[]});b.parts.push({m,r});}}}
  visit(c,own?c:anchor,!own&&(hidden||!c.visible));}};
 visit(root,root,false);
 const owned:BufferGeometry[]=[],plan=[...buckets.values()].filter(b=>b.parts.length>=min).map(b=>{
  if(o.order){const k=new Map(b.parts.map(p=>[p,o.order!(p.m)]));b.parts.sort((x,y)=>k.get(x)!-k.get(y)!);}
  const name=o.cache&&o.cacheKey?.(b.anchor),k=name===undefined?undefined:name+'|'+b.key+(o.layout==='source'?'|source':''),verts=b.parts.reduce((n,p)=>n+p.m.geometry.attributes.position!.count,0);let g=k===undefined?undefined:o.cache!.get(k);
  if(g){if(g.attributes.position!.count!==verts)throw new Error(`Cached merge ${k} does not fit ${b.anchor.name}`);}else{g=build(b.parts,Object.keys(b.parts[0]!.m.geometry.attributes),o.layout==='source');if(k===undefined)owned.push(g);else o.cache!.set(k,g);}
  return{b,g};});
 const merged:Mesh[]=[],sources:Mesh[]=[];let triangles=0,restored=false;
 for(const{b,g}of plan){const f=b.parts[0]!.m,mat=f.material as Material,m=new Mesh(g,mat);m.name=`Merged ${b.anchor.name}/${mat.name}`;m.castShadow=f.castShadow;m.receiveShadow=f.receiveShadow;m.renderOrder=f.renderOrder;m.layers.mask=f.layers.mask;m.frustumCulled=f.frustumCulled;m.userData.kilnMerged=true;m.matrixAutoUpdate=b.anchor.matrixAutoUpdate;m.matrixWorldAutoUpdate=b.anchor.matrixWorldAutoUpdate;b.anchor.add(m);m.matrixWorld.copy(b.anchor.matrixWorld);merged.push(m);triangles+=g.index!.count/3;for(const p of b.parts){p.m.visible=false;sources.push(p.m);}}
 return{merged,sources,stats:{sourceMeshes:sources.length,mergedMeshes:merged.length,keptMeshes:all-sources.length,groups:buckets.size,triangles},restore(){if(restored)return;restored=true;for(const s of sources)s.visible=true;for(const m of merged)m.removeFromParent();for(const g of owned)g.dispose();}};
}
