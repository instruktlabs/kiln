// SPDX-License-Identifier: MIT
// A review candidate can replace historical bytes only through this explicit, retained pin ledger.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PACKAGE_ROOT,readAssetMap} from './stage';
import {revisionDirectory} from './attribution';
import {sha256} from './structures';

interface RevisionPin {asset:string;revision:string;bytes:number;sha256:string}
interface LineagePin extends RevisionPin {model:string;harness:string;role:string}
export interface ReviewReplacement {
  id:string;path:string;previous:RevisionPin;
  next:RevisionPin & {author:string;file:string};reason:string;
  lineage?:LineagePin[];
}
export function reviewReplacements():ReviewReplacement[] {
  const value=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,'scripts/ff3-model-replacements.json'),'utf8')) as {schema:string;entries:ReviewReplacement[]};
  if(value.schema!=='foundry-floor.review-replacements/1'||!Array.isArray(value.entries)||new Set(value.entries.map(e=>e.id)).size!==value.entries.length||new Set(value.entries.map(e=>e.path)).size!==value.entries.length)throw new Error('Invalid review replacement ledger');
  for(const r of value.entries)for(const pin of [r.previous,r.next])if(!pin.asset||!/^r_[0-9a-f]{32}$/.test(pin.revision)||!Number.isInteger(pin.bytes)||pin.bytes<1||!/[0-9a-f]{64}/.test(pin.sha256))throw new Error(`${r.id}: invalid review replacement pin`);
  return value.entries;
}
export function verifyReplacementMap(map:ReturnType<typeof readAssetMap>,replacements:readonly ReviewReplacement[]):void {
  for(const r of replacements){
    const e=map.entities[r.id],n=r.next;
    if(!e||e.status!=='review-candidate'||e.glb!==r.path||e.asset!==n.asset||e.source?.author!==n.author||e.source.file!==n.file||e.source.revision!==n.revision||e.pins?.bytes!==n.bytes||e.pins.sha256!==n.sha256)throw new Error(`${r.id}: replacement does not match its explicit map pins`);
    const dir=revisionDirectory(n.author,n.revision),manifest=JSON.parse(readFileSync(resolve(dir,'manifest.json'),'utf8'));
    const saved=readFileSync(resolve(dir,'asset.glb')),output=readFileSync(resolve(PACKAGE_ROOT,'../../../showcase/authors',n.author,n.file));
    if(manifest.assetId!==n.asset||manifest.revisionId!==n.revision||saved.length!==n.bytes||sha256(saved)!==n.sha256||output.length!==n.bytes||sha256(output)!==n.sha256||manifest.files['asset.glb'].sha256!==`sha256:${n.sha256}`)throw new Error(`${r.id}: replacement saved revision and delivered bytes disagree`);
  }
  for(const [id,e] of Object.entries(map.entities))if(e.status==='review-candidate'&&!replacements.some(r=>r.id===id))throw new Error(`${id}: review candidate has no explicit replacement`);
}
export function publicReplacementEvidence(replacements=reviewReplacements()) {
  return {schema:'foundry-floor.asset-replacements/1',status:'Technical local review candidates; owner visual review pending.',
    entries:replacements.map(r=>({id:r.id,path:r.path,previous:r.previous,next:{asset:r.next.asset,revision:r.next.revision,bytes:r.next.bytes,sha256:r.next.sha256},reason:r.reason,
      ...(r.lineage?{lineage:r.lineage.map(p=>({asset:p.asset,revision:p.revision,bytes:p.bytes,sha256:p.sha256,model:p.model,harness:p.harness,role:p.role}))}:{})}))};
}
