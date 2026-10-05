import {namedMeshParts,validateBakePayload} from '../landing-v10/src/bake-intake.mjs';
// Conservative for the retained decoder's linear translation/scale and unit
// quaternion rotation at EVERY interpolated time, not only captured poses.
// For each part, an origin-centred sphere encloses its scaled local AABB for all
// endpoint scales; rotation preserves radius. Add every endpoint translation's
// range, then restore the clip origin. Consumer actor placement transforms this
// box once. The guard allows floating-point shader/instance arithmetic error.
export function certifyRigidClipBounds(T,root,{manifest,clips,bytes},{guard=.005}={}){
 validateBakePayload(manifest,bytes.byteLength);if(!Number.isFinite(guard)||guard<0)throw Error('Invalid bound guard');
 const parts=namedMeshParts(root);if(parts.length!==manifest.parts.length||parts.some((p,i)=>p.path!==manifest.parts[i].path))throw Error('Bound part identity mismatch');
 const half=manifest.texture.format==='RGBA16F',data=half?new Uint16Array(bytes):new Float32Array(bytes),read=i=>half?T.DataUtils.fromHalfFloat(data[i]):data[i],extents=parts.map(({node})=>{const b=new T.Box3().setFromBufferAttribute(node.geometry.attributes.position);if(![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite))throw Error('Invalid local geometry bounds');return b.min.toArray().map((v,i)=>Math.max(Math.abs(v),Math.abs(b.max.getComponent(i))));});
 return clips.map(clip=>{
  const {startFrame,frameCount,origin=[0,0,0]}=clip;if(!Number.isInteger(startFrame)||!Number.isInteger(frameCount)||startFrame<0||frameCount<2||startFrame+frameCount>manifest.frameCount||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid bound clip');const box=new T.Box3();
  for(let part=0;part<parts.length;part++){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],scale=[0,0,0];for(let frame=startFrame;frame<startFrame+frameCount;frame++){const offset=(frame*parts.length+part)*12;for(let axis=0;axis<3;axis++){const t=read(offset+axis),s=read(offset+8+axis);if(!Number.isFinite(t)||!Number.isFinite(s))throw Error('Invalid bound sample');min[axis]=Math.min(min[axis],t);max[axis]=Math.max(max[axis],t);scale[axis]=Math.max(scale[axis],Math.abs(s));}}
   const radius=Math.hypot(...extents[part].map((v,i)=>v*scale[i]));box.union(new T.Box3(new T.Vector3(...min.map((v,i)=>v+origin[i]-radius-guard)),new T.Vector3(...max.map((v,i)=>v+origin[i]+radius+guard))));
  }
  return {name:clip.name,min:box.min.toArray(),max:box.max.toArray(),guard,kind:'linear T/S extrema plus rotation-invariant part spheres; restored clip origin'};
 });
}
