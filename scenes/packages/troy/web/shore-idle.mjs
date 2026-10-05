import {readRuntimeBytes} from './runtime-transport.mjs';
import {createRigidClipPlayback} from './runtime/fleet-v2/rigid-playback.mjs';
export async function createShoreIdlePlayback(T,human,actors,sourceHash,{poseTextures=null}={}){
 const base=new URL('./runtime/crew-idle-v2/',import.meta.url),digest=async b=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join(''),manifest=await(await fetch(new URL('manifest.json',base))).json();
 const read=async file=>{const b=await readRuntimeBytes(new URL(file,base));if(await digest(b)!==manifest.files[file])throw Error('Idle identity mismatch '+file);return b;};
 const [json,bytes,boundBytes]=await Promise.all([read('bank.json'),read('transforms.bin'),read('bounds.json')]),record=JSON.parse(new TextDecoder().decode(json));if(record.source.sha256!==sourceHash||record.data.sha256!==await digest(bytes))throw Error('Idle source mismatch');
 const boundRecord=JSON.parse(new TextDecoder().decode(boundBytes));if(boundRecord.bankSha256!==await digest(json))throw Error('Idle bound bank mismatch');const bounds=new Map(boundRecord.bounds.map(b=>[b.name,b])),actorBounds=actors.map(a=>{const b=bounds.get(a.clip);if(!b)throw Error('Missing idle bound');return new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)).applyMatrix4(a.matrix);});
 const texturePool=await poseTextures?.register(record.manifest,bytes),runtime=createRigidClipPlayback(human,{manifest:record.manifest,clips:record.clips,bytes},actors,{texturePool});return {...runtime,actorBounds,atlasBytes:bytes.byteLength,record};
}
