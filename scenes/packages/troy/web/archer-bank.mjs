// Scene consumer bank. Explicitly owns vertex deformation and inherited visibility;
// it does not claim compatibility with the earlier rigid-only baker's contract.
import {ARCHER} from './archer-config.mjs';
export function archerParts(root,projectile){
 const parts=[];
 function visit(node,path){if(node===projectile)return;if(node.isSkinnedMesh||node.morphTargetInfluences?.length)throw Error('Unsupported archer skin/morph');if(node.isMesh)parts.push({node,path});node.children.forEach((n,i)=>visit(n,`${path}/${n.name||n.type}[${i}]`));}
 visit(root,`${root.name||root.type}[0]`);return parts;
}
const visible=node=>node.visible&&(!node.parent||visible(node.parent));
const values=p=>Float32Array.from({length:p.count*p.itemSize},(_,i)=>p.getComponent(Math.floor(i/p.itemSize),i%p.itemSize));
export function encodeArcherHalf(T,v){
 const lower=T.DataUtils.toHalfFloat(v);if((lower&0x7fff)>=0x7bff)return lower;
 const upper=lower+1,a=Math.abs(v-T.DataUtils.fromHalfFloat(lower)),b=Math.abs(v-T.DataUtils.fromHalfFloat(upper));
 return b<a||b===a&&(lower&1)?upper:lower;
}
export function bakeArcherBank(T,{createReference,fps=50,sampleTimes,precision='float16',maxBytes=16*1024*1024}){
 if(typeof createReference!=='function'||!Number.isInteger(fps)||fps<1||fps>100||!['float16','float32'].includes(precision)||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Invalid archer bake options');
 const a=createReference();
 try{
  const times=sampleTimes??Array.from({length:ARCHER.duration*fps+1},(_,i)=>i/fps);
  if(times[0]!==0||times.at(-1)!==ARCHER.duration||times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1])))throw Error('Invalid archer sample times');
  a.sample(0);const parts=archerParts(a.group,a.projectile),frameCount=times.length;let vertexCount=0;
  const basePositions=[],snapshots=[];
  const records=parts.map(({node,path},index)=>{
   if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial||node.material.isMeshPhysicalMaterial||node.material.displacementMap)throw Error('Unsupported archer material');
   const g=node.geometry;if(!g.attributes.position||!g.attributes.normal||g.drawRange.start!==0||g.drawRange.count!==Infinity||Object.keys(g.attributes).some(k=>!['position','normal','uv','uv1','tangent'].includes(k)))throw Error('Unsupported archer geometry');
   const deform=/^Mesh_Bow_Limb_(Upper|Lower)$/.test(node.name),vertexOffset=deform?vertexCount:null;if(deform)vertexCount+=g.attributes.position.count;
   basePositions.push(values(g.attributes.position));snapshots.push(Object.fromEntries(Object.entries(g.attributes).map(([key,p])=>[key,values(p)])));
   return {index,path,name:node.name,vertices:g.attributes.position.count,attributes:Object.keys(g.attributes).sort(),vertexOffset};
  });
  const format=precision==='float16'?'RGBA16F':'RGBA32F',bytesPer=precision==='float16'?2:4;
  const transformLength=parts.length*12*frameCount,vertexLength=vertexCount*8*frameCount;
  if((transformLength+vertexLength)*bytesPer>maxBytes||parts.length*3>8192||vertexCount*2>8192||frameCount>8192||!vertexCount)throw Error('Archer bank byte/dimension budget exceeded');
  const make=n=>precision==='float16'?new Uint16Array(n):new Float32Array(n),transforms=make(transformLength),vertices=make(vertexLength);
  const put=(dest,offset,data)=>data.forEach((v,i)=>{if(!Number.isFinite(v)||precision==='float16'&&Math.abs(v)>65504)throw Error('Nonfinite archer sample');dest[offset+i]=precision==='float16'?encodeArcherHalf(T,v):v;});
  const previous=parts.map(()=>null),bounds=new T.Box3(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),recomposed=new T.Matrix4();
  for(let frame=0;frame<frameCount;frame++){
   a.sample(times[frame]);a.group.updateMatrixWorld(true);
   for(let i=0;i<parts.length;i++){
    const {node}=parts[i],record=records[i],g=node.geometry;
    if(node.matrixWorld.determinant()<=0)throw Error('Singular/mirrored archer transform');node.matrixWorld.decompose(p,q,s);recomposed.compose(p,q,s);
    if(Math.max(...node.matrixWorld.elements.map((v,j)=>Math.abs(v-recomposed.elements[j])))>1e-5)throw Error('Archer affine shear');
    if(previous[i]&&q.dot(previous[i])<0)q.set(-q.x,-q.y,-q.z,-q.w);previous[i]=q.clone();
    if(precision==='float16'&&s.toArray().some(v=>T.DataUtils.fromHalfFloat(T.DataUtils.toHalfFloat(v))<=0))throw Error('Archer scale underflow');
    put(transforms,(frame*parts.length+i)*12,[...p.toArray(),visible(node)?1:0,...q.toArray(),...s.toArray(),0]);
    for(const [key,attribute] of Object.entries(g.attributes)){
     if(record.vertexOffset!==null&&['position','normal'].includes(key))continue;
     const initial=snapshots[i][key];for(let j=0;j<initial.length;j++)if(attribute.getComponent(Math.floor(j/attribute.itemSize),j%attribute.itemSize)!==initial[j])throw Error('Unrepresented changing archer attribute '+key);
    }
    if(record.vertexOffset!==null){const pos=g.attributes.position,n=g.attributes.normal;for(let j=0;j<pos.count;j++)put(vertices,(frame*vertexCount+record.vertexOffset+j)*8,[pos.getX(j),pos.getY(j),pos.getZ(j),0,n.getX(j),n.getY(j),n.getZ(j),0]);}
    if(visible(node))bounds.union(new T.Box3().setFromBufferAttribute(g.attributes.position).applyMatrix4(node.matrixWorld));
   }
  }
  return {transforms,vertices,basePositions,manifest:{schema:'troy.archer-pose-bank/1',status:'candidate-not-runtime-qualified',duration:ARCHER.duration,fps,frameCount,sampleTimes:[...times],parts:records,vertexCount,
   transformTexture:{width:parts.length*3,height:frameCount,format,byteLength:transforms.byteLength,layout:'translation.xyz + inherited visibility; quaternion.xyzw; positive scale.xyz + padding'},
   vertexTexture:{width:vertexCount*2,height:frameCount,format,byteLength:vertices.byteLength,layout:'deforming mesh-local position.xyz + padding; normal.xyz + padding'},
   interpolation:'linear translation/scale/vertices, normalized shortest-path quaternion slerp; lower-frame visibility; modulo source time',quantization:'round to nearest; half ties to even',
   projectile:'excluded; exact per-actor ballistic pose and terrain impact required',bounds:{kind:'sampled visible local surfaces; not swept certification',min:bounds.min.toArray(),max:bounds.max.toArray()},
   limitations:['Troy consumer bank, not a generic engine format','No renderer, contact, animated-shadow, culling or performance qualification implied','Static tangent and material inputs retained; changing unsupported attributes rejected']}};
 }finally{a.dispose();}
}
export function validateArcherBank(m,tBytes,vBytes){
 if(m?.schema!=='troy.archer-pose-bank/1'||!Array.isArray(m.parts)||!m.parts.length||!Number.isInteger(m.frameCount)||m.frameCount<2||m.duration!==ARCHER.duration||!Number.isInteger(m.vertexCount)||m.vertexCount<1||!Array.isArray(m.sampleTimes)||m.sampleTimes.length!==m.frameCount||m.sampleTimes[0]!==0||m.sampleTimes.at(-1)!==m.duration||m.sampleTimes.some((t,i)=>!Number.isFinite(t)||(i&&t<=m.sampleTimes[i-1])))throw Error('Invalid archer bank dimensions');
 let offset=0;for(const [i,p] of m.parts.entries()){if(p.index!==i||typeof p.path!=='string'||!Number.isInteger(p.vertices)||p.vertices<1||!Array.isArray(p.attributes))throw Error('Invalid archer part');if(p.vertexOffset!==null){if(p.vertexOffset!==offset)throw Error('Invalid archer vertex offset');offset+=p.vertices;}}
 if(offset!==m.vertexCount||new Set(m.parts.map(p=>p.path)).size!==m.parts.length)throw Error('Invalid archer part identity');
 for(const [tex,width,size] of [[m.transformTexture,m.parts.length*3,tBytes],[m.vertexTexture,m.vertexCount*2,vBytes]]){if(!tex||!['RGBA16F','RGBA32F'].includes(tex.format)||tex.width!==width||tex.height!==m.frameCount||width>8192||m.frameCount>8192)throw Error('Invalid archer texture');const expected=width*m.frameCount*4*(tex.format==='RGBA16F'?2:4);if(size!==expected||tex.byteLength!==expected)throw Error('Archer texture byte mismatch');}
 if(m.transformTexture.format!==m.vertexTexture.format||tBytes+vBytes>16*1024*1024)throw Error('Archer byte budget/format mismatch');
 return true;
}
export function readArcherFrame(T,bank,part,time){
 const m=bank.manifest;if(!Number.isInteger(part)||part<0||part>=m.parts.length)throw Error('Invalid archer part');if(!Number.isFinite(time))throw Error('Finite archer time required');
 const frame=archerBankFrame(m,time),lo=Math.floor(frame),hi=Math.min(lo+1,m.frameCount-1),u=frame-lo,record=m.parts[part];
 const read=(array,i)=>array instanceof Uint16Array?T.DataUtils.fromHalfFloat(array[i]):array[i];
 const row=f=>Array.from({length:12},(_,j)=>read(bank.transforms,(f*m.parts.length+part)*12+j)),a=row(lo),b=row(hi);
 const matrix=new T.Matrix4().compose(new T.Vector3(...a.slice(0,3)).lerp(new T.Vector3(...b.slice(0,3)),u),new T.Quaternion(...a.slice(4,8)).normalize().slerp(new T.Quaternion(...b.slice(4,8)).normalize(),u),new T.Vector3(...a.slice(8,11)).lerp(new T.Vector3(...b.slice(8,11)),u));
 const surface=(vertex,offset)=>{if(!Number.isInteger(vertex)||vertex<0||vertex>=record.vertices)throw Error('Invalid archer vertex');const at=f=>(f*m.vertexCount+record.vertexOffset+vertex)*8+offset;return new T.Vector3(...[0,1,2].map(j=>read(bank.vertices,at(lo)+j)*(1-u)+read(bank.vertices,at(hi)+j)*u));};
 return {matrix,visible:a[3]===1,vertex:record.vertexOffset===null?i=>new T.Vector3().fromArray(bank.basePositions[part],i*3):i=>surface(i,0),normal:record.vertexOffset===null?null:i=>surface(i,4).normalize()};
}
export function archerBankFrame(m,time){
 if(!Number.isFinite(time))throw Error('Finite archer time required');const t=((time%m.duration)+m.duration)%m.duration,times=m.sampleTimes;let lo=0,hi=times.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<=t)lo=mid;else hi=mid;}
 return lo+(t-times[lo])/(times[hi]-times[lo]);
}
export function bakeAdaptiveArcherBank(T,{createReference,fps=50,tolerance=.0015,normalTolerance=.004,maxFrames=901,...options}){
 if(!Number.isFinite(normalTolerance)||normalTolerance<=0||!Number.isFinite(tolerance)||tolerance<=0||!Number.isInteger(maxFrames)||maxFrames<fps*ARCHER.duration+1)throw Error('Invalid adaptive archer budget');
 let times=[...new Set([...Array.from({length:fps*ARCHER.duration+1},(_,i)=>i/fps),5.18,5.25,7.4,8.5])].sort((a,b)=>a-b),passes=0,probes=0;
 const a=createReference();a.sample(0);const parts=archerParts(a.group,a.projectile),corners=parts.map(({node})=>{const b=new T.Box3().setFromBufferAttribute(node.geometry.attributes.position);return [0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>new T.Vector3(x?b.max.x:b.min.x,y?b.max.y:b.min.y,z?b.max.z:b.min.z))));});
 try{for(;;){passes++;const bank=bakeArcherBank(T,{...options,createReference,fps,sampleTimes:times}),split=[];let maxProbeError=0,maxNormalError=0,location;
  for(let k=0;k<times.length-1;k++){
   let error=0,normalError=0;
   for(const fraction of [.25,.5,.75]){
    const time=times[k]+fraction*(times[k+1]-times[k]);a.sample(time);probes++;
    for(let i=0;i<parts.length;i++){
     const {node}=parts[i],decoded=readArcherFrame(T,bank,i,time);
     if(decoded.visible!==visible(node))throw Error('Archer visibility event missing from samples '+time+' '+parts[i].path);
     // Inactive carried arrows can reset their orientation while hidden. Their
     // vertices are parked by playback; only visible surfaces require fitting.
     if(!decoded.visible)continue;
     const note=e=>{error=Math.max(error,e);if(e>maxProbeError){maxProbeError=e;location={time,path:parts[i].path};}};
     if(bank.manifest.parts[i].vertexOffset===null){for(const v of corners[i])note(v.clone().applyMatrix4(decoded.matrix).distanceTo(v.clone().applyMatrix4(node.matrixWorld)));}
     else{const p=node.geometry.attributes.position,n=node.geometry.attributes.normal;for(let j=0;j<p.count;j++){note(decoded.vertex(j).applyMatrix4(decoded.matrix).distanceTo(new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(node.matrixWorld)));normalError=Math.max(normalError,decoded.normal(j).angleTo(new T.Vector3().fromBufferAttribute(n,j)));}}
    }
   }
   maxProbeError=Math.max(maxProbeError,error);maxNormalError=Math.max(maxNormalError,normalError);if(error>tolerance||normalError>normalTolerance)split.push(k);
  }
  if(!split.length){bank.manifest.fitting={passes,probes,maxProbeError,tolerance,maxNormalError,normalTolerance,scope:'quarter-interval affine bounds/deforming vertices; not a continuous motion certificate'};return bank;}
  if(times.length+split.length>maxFrames)throw Error('Adaptive archer sample budget exceeded '+maxProbeError+' '+JSON.stringify({frames:times.length,split:split.length,passes,location}));
  const selected=new Set(split);times=times.flatMap((t,i)=>selected.has(i)?[t,(t+times[i+1])/2]:[t]);
 }}finally{a.dispose();}
}

