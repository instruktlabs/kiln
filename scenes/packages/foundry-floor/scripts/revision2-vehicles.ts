import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './structures';
import { checkVehicleGlb, VEHICLES, VEHICLE_TYPES, vehiclePath, type CampusModel, type VehicleType } from './stage-campus';
import { PACKAGE_ROOT } from './stage';
export const REVIEW2_VEHICLES=resolve(PACKAGE_ROOT,'../../../engine-work/local-v09-review/revision2-20260930/vehicles-runtime-final');
export const REVIEW2_DELIVERY_SHA256='578f0a9f7f536b8ffa92b2a79e392cb8b4eeb2b97ac4fa00ca1fcf4c45efa981';
export function revision2Vehicles():CampusModel[]{
 const source=readFileSync(resolve(REVIEW2_VEHICLES,'delivery.json'));
 if(sha256(source)!==REVIEW2_DELIVERY_SHA256)throw new Error('Final review2 vehicle delivery changed');
 const delivery=JSON.parse(source.toString()) as {release:string;assets:{slug:string;assetId:string;revisionId:string;parentRevision:string|null;model:string;licence:string;savedChain:{revisionId:string;parentRevision?:string}[]}[];files:Record<string,{bytes:number;sha256:string}>};
 if(delivery.release!=='r4-local-review'||delivery.assets.length!==6)throw new Error('Unexpected revision2 vehicle delivery');
 return VEHICLE_TYPES.map(type=>{
  const old=VEHICLES[type],asset=delivery.assets.find(a=>a.slug===type);
  if(!asset||asset.assetId!==old.asset||asset.revisionId===old.revision||asset.model!==`models/${type}.glb`||asset.licence!==`licenses/${type}.ASSET-LICENSE.txt`)throw new Error(`Unexpected vehicle identity: ${type}`);
  const chain=asset.savedChain,last=chain.at(-1);
  if(!chain.length||chain[0]!.revisionId!==asset.revisionId||chain[0]!.parentRevision!==asset.parentRevision||new Set(chain.map(r=>r.revisionId)).size!==chain.length||chain.some((r,i)=>i<chain.length-1&&r.parentRevision!==chain[i+1]!.revisionId)||(last!.revisionId!==old.revision&&last!.parentRevision!==old.revision))throw new Error(`Unexpected vehicle lineage: ${type}`);
  const from=resolve(REVIEW2_VEHICLES,asset.model),bytes=readFileSync(from),declared=delivery.files[asset.model];
  if(!declared||sha256(bytes)!==declared.sha256||declared.bytes!==bytes.length)throw new Error(`Vehicle pin mismatch: ${type}`);
  checkVehicleGlb(type,bytes);
  const licence=readFileSync(resolve(REVIEW2_VEHICLES,asset.licence)),lpin=delivery.files[asset.licence];
  if(licence.length!==lpin?.bytes||sha256(licence)!==lpin.sha256)throw new Error(`Vehicle licence pin mismatch: ${type}`);
  for(const text of ['SPDX-License-Identifier: CC0-1.0',`Saved revision: ${asset.revisionId}`,`Delivered GLB SHA-256: ${declared.sha256}`])if(!licence.toString().includes(text))throw new Error(`Vehicle licence identity mismatch: ${type}`);
  return {id:`vehicle-${type}`,group:'vehicle',name:old.name,asset:old.asset,to:vehiclePath(type),from,bytes:bytes.length,sha256:declared.sha256,revision:asset.revisionId,author:'codex-review2-asset-repairs'};
 });
}
export function revision2VehicleLicence(type:VehicleType){const from=resolve(REVIEW2_VEHICLES,`licenses/${type}.ASSET-LICENSE.txt`);return {from,text:readFileSync(from,'utf8')};}
