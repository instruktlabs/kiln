import {readRuntimeBytes} from './runtime-transport.mjs';
import {openFootprintBank} from './runtime/motion-v1/footprint-bank.mjs';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function checked(url,expected){const bytes=await readRuntimeBytes(url);if(await hash(bytes)!==expected)throw Error('Regroup route identity mismatch');return bytes;}
export async function loadPackedRegroup(){
 const base=new URL('./runtime/regroup-v2/',import.meta.url),response=await fetch(new URL('manifest.json',base));if(!response.ok)throw Error('Regroup manifest fetch failed');const manifest=await response.json();
 if(manifest.schema!=='troy.packed-regroup-runtime/1'||manifest.record?.file!=='record.json'||manifest.payload?.file!=='footprints.bin')throw Error('Invalid packed regroup manifest');
 const [metadata,payload]=await Promise.all([checked(new URL('record.json',base),manifest.record.sha256),checked(new URL('footprints.bin',base),manifest.payload.sha256)]),record=JSON.parse(new TextDecoder().decode(metadata));
 if(record.schema!=='troy.packed-regroup/1'||record.sourcePlanSha256!==manifest.sourcePlanSha256||record.data.sha256!==manifest.payload.sha256)throw Error('Packed regroup provenance mismatch');
 const bank=openFootprintBank(record.bank,new Uint8Array(payload));
 return {record,recordIdentity:'sha256:'+manifest.record.sha256,planForRoute:route=>bank.plan(route.planId),stats:bank.stats};
}
