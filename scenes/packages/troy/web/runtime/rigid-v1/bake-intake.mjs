export function validateBakePayload(manifest,byteLength){
 if(manifest.schema!=='runtime.rigid-transform-bake/1')throw Error('Unsupported bake schema');
 const {texture,parts,frameCount,duration}=manifest;
 if(!Array.isArray(parts)||!parts.length||!Number.isInteger(frameCount)||frameCount<2||!Number.isFinite(duration)||duration<=0)throw Error('Invalid bake dimensions');
 if(!['RGBA16F','RGBA32F'].includes(texture?.format)||texture.width!==parts.length*3||texture.height!==frameCount||texture.channels!==4)throw Error('Invalid texture layout');
 const expected=texture.width*texture.height*4*(texture.format==='RGBA16F'?2:4);
 if(expected!==byteLength||expected!==texture.byteLength||byteLength>16*1024*1024)throw Error('Payload byte length/budget mismatch');
 if(texture.byteOrder!=='little-endian'||texture.mipmaps!==false)throw Error('Unsupported data convention');
 if(parts.some((p,i)=>p.index!==i||typeof p.path!=='string')||new Set(parts.map(p=>p.path)).size!==parts.length)throw Error('Invalid part identity');
 return true;
}
export function namedMeshParts(root){
 const out=[];function visit(n,path){if(n.isSkinnedMesh||n.morphTargetInfluences?.length)throw Error('Rigid playback cannot preserve skin/morph inputs');if(n.isMesh)out.push({node:n,path});n.children.forEach((c,i)=>visit(c,`${path}/${c.name||c.type}[${i}]`));}
 visit(root,`${root.name||root.type}[0]`);return out;
}
export function validateActors(actors){
 if(!Array.isArray(actors)||!actors.length||actors.length>65535)throw Error('Invalid actor count');
 const ids=new Set();
 for(const actor of actors){
  if(typeof actor.id!=='string'||!actor.id||ids.has(actor.id))throw Error('Invalid actor identity');ids.add(actor.id);
  if(!Number.isFinite(actor.phase??0)||(actor.phase??0)<0)throw Error('Invalid actor phase');
  const e=actor.matrix?.elements;
  if(!e||e.length!==16||!e.every(Number.isFinite)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)throw Error('Unsupported actor transform');
  const cols=[e.slice(0,3),e.slice(4,7),e.slice(8,11)],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),lens=cols.map(c=>Math.sqrt(dot(c,c)));
  const determinant=e[0]*(e[5]*e[10]-e[6]*e[9])-e[4]*(e[1]*e[10]-e[2]*e[9])+e[8]*(e[1]*e[6]-e[2]*e[5]);
  if(determinant<=0||lens.some(n=>n<1e-6)||Math.abs(dot(cols[0],cols[1]))>lens[0]*lens[1]*1e-5||Math.abs(dot(cols[0],cols[2]))>lens[0]*lens[2]*1e-5||Math.abs(dot(cols[1],cols[2]))>lens[1]*lens[2]*1e-5)throw Error('Unsupported actor transform');
 }
 return true;
}
