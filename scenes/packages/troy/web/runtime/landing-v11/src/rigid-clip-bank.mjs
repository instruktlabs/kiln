import {validateBakePayload} from './bake-intake.mjs';
// In-memory atlas only. Consumers verify each retained source/payload hash before
// assembly; these derived descriptors do not replace those provenance records.
export function assembleRigidClipBank(entries){
 if(!Array.isArray(entries)||!entries.length)throw Error('Empty clip bank');
 let frames=0,byteLength=0;const clips=[],names=new Set(),first=entries[0].manifest;
 for(const {manifest:m,bytes} of entries){
  if(!(bytes instanceof ArrayBuffer))throw Error('Expected owned ArrayBuffer payload');
  validateBakePayload(m,bytes.byteLength);
  if(typeof m.clip!=='string'||!m.clip||names.has(m.clip))throw Error('Invalid clip identity');names.add(m.clip);
  if(!m.source?.sha256||m.source.sha256!==first.source?.sha256||JSON.stringify(m.parts)!==JSON.stringify(first.parts)||m.texture.format!==first.texture.format)throw Error('Inconsistent clip source, parts or format');
  const origin=m.origin??[0,0,0];if(!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid clip origin');
  clips.push(Object.freeze({origin:[...origin],name:m.clip,startFrame:frames,frameCount:m.frameCount,duration:m.duration}));frames+=m.frameCount;byteLength+=bytes.byteLength;
 }
 if(frames>8192||first.texture.width>8192||byteLength>16*1024*1024)throw Error('Clip bank texture budget exceeded');
 const data=new Uint8Array(byteLength);let offset=0;for(const e of entries){data.set(new Uint8Array(e.bytes),offset);offset+=e.bytes.byteLength;}
 const manifest={schema:first.schema,clip:'clip-bank',duration:1,frameCount:frames,parts:structuredClone(first.parts),source:structuredClone(first.source),texture:{...first.texture,height:frames,byteLength}};
 return {manifest,bytes:data.buffer,clips:Object.freeze(clips)};
}
export function createClipPoseState(bank,actors){
 if(!Array.isArray(actors)||!actors.length||actors.length>65535)throw Error('Invalid actor count');
 const clips=new Map(bank.clips.map(c=>[c.name,{...c,origin:[...(c.origin??[0,0,0])]}])),ids=actors.map(a=>a.id),index=new Map(ids.map((id,i)=>[id,i]));
 if(index.size!==ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('Invalid actor identity');
 const frames=new Float32Array(actors.length),origins=new Float32Array(actors.length*3),records=[];for(const c of clips.values())if(c.origin.length!==3||!c.origin.every(Number.isFinite))throw Error('Invalid clip origin');
 const evaluate=p=>{const c=clips.get(p.clip);if(!c||!Number.isFinite(p.time)||p.time<0||typeof p.loop!=='boolean')throw Error('Invalid clip pose');const seconds=p.loop?p.time%c.duration:Math.min(c.duration,p.time);return c.startFrame+seconds/c.duration*(c.frameCount-1);};
 actors.forEach((a,i)=>{frames[i]=evaluate(a);origins.set(clips.get(a.clip).origin,i*3);records.push({id:a.id,clip:a.clip,time:a.time,loop:a.loop});});
 return {ids:Object.freeze([...ids]),frames,origins,snapshot:()=>records.map(r=>({...r})),update(patches){
  if(!Array.isArray(patches)||patches.length>actors.length)throw Error('Invalid pose patch batch');const seen=new Set();
  const next=patches.map(p=>{const i=index.get(p.id);if(i===undefined||seen.has(p.id))throw Error('Invalid actor identity');seen.add(p.id);return {i,frame:evaluate(p),record:{id:p.id,clip:p.clip,time:p.time,loop:p.loop}};});
  for(const n of next){frames[n.i]=n.frame;origins.set(clips.get(n.record.clip).origin,n.i*3);records[n.i]=n.record;}return next.map(n=>n.i);
 }};
}
