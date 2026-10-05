import {createSharedResource} from './shared-resource.mjs';
import {validateBakePayload} from './runtime/rigid-v3/bake-intake.mjs';
const descriptor=m=>{const t=m.texture;return JSON.stringify([t.format,t.width,t.height,t.channels,t.byteLength,t.byteOrder,t.mipmaps]);};
// The scene owns the pool; playback consumers own leases. Copy at admission so
// the texture does not borrow mutable buffers from a loader or another actor.
// Geometry, materials, part bindings, origins, phases and time remain per consumer.
export function createPoseTexturePool(T,{mode='shared',maxPayloadBytes=64*1024*1024}={}){
 if(!['shared','separate'].includes(mode)||!Number.isSafeInteger(maxPayloadBytes)||maxPayloadBytes<=0)throw Error('Invalid pose texture pool options');
 const entries=new Map();let closed=false,sequence=0;
 const retained=()=>[...entries.values()].reduce((n,e)=>n+(e.payload?.byteLength??0),0);
 function makeEntry(key,layout,digest,payload){
  const entry={key,layout,digest,payload,byteLength:payload.byteLength};
  entry.pool=createSharedResource(()=>{const [format,width,height]=JSON.parse(layout),data=format==='RGBA16F'?new Uint16Array(entry.payload.buffer):new Float32Array(entry.payload.buffer),tex=new T.DataTexture(data,width,height,T.RGBAFormat,format==='RGBA16F'?T.HalfFloatType:T.FloatType);tex.minFilter=tex.magFilter=T.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;return tex;},tex=>{tex.dispose();entry.payload=null;});return entry;
 }
 async function register(manifest,bytes){
  if(closed)throw Error('Pose texture pool closed');if(!(bytes instanceof ArrayBuffer))throw Error('Pose texture payload must be an ArrayBuffer');validateBakePayload(manifest,bytes.byteLength);
  const layout=descriptor(manifest),snapshot=new Uint8Array(bytes).slice(),digest='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',snapshot)),v=>v.toString(16).padStart(2,'0')).join('');
  if(closed)throw Error('Pose texture pool closed');const key=layout+'/'+digest+(mode==='separate'?'/'+sequence++:'');let entry=entries.get(key);
  if(!entry){if(retained()+snapshot.byteLength>maxPayloadBytes)throw Error('Pose texture pool payload budget exceeded');entry=makeEntry(key,layout,digest,snapshot);entries.set(key,entry);}
  return {stats:()=>({...entry.pool.stats(),atlasBytes:entry.byteLength}),acquire(m,b){if(m!==manifest||b!==bytes||descriptor(m)!==layout)throw Error('Pose texture identity mismatch');const lease=entry.pool.acquire();return {resource:lease.resource,release:lease.release};}};
 }
 function close(){closed=true;for(const e of entries.values()){e.pool.close();if(e.pool.stats().references===0)e.payload=null;}}
 function stats(){const values=[...entries.values()].map(e=>({...e.pool.stats(),byteLength:e.byteLength,digest:e.digest,layout:JSON.parse(e.layout)}));return {mode,closed,entries:values.length,references:values.reduce((n,e)=>n+e.references,0),allocations:values.reduce((n,e)=>n+e.allocations,0),disposals:values.reduce((n,e)=>n+e.disposals,0),liveTextures:values.filter(e=>e.live).length,textureBytes:values.reduce((n,e)=>n+(e.live?e.byteLength:0),0),logicalConsumerBytes:values.reduce((n,e)=>n+e.references*e.byteLength,0),retainedPayloadBytes:retained(),banks:values};}
 return {register,close,stats};
}
