import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {verifyDelivery,verifyFarmModels,verifySiteModels,parseStageOptions} from '../../scripts/staging-core';
const bytes=(s:string)=>new TextEncoder().encode(s);
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const runtime=new Map<string,Uint8Array>(),scene=new Map<string,Uint8Array>(),assets=[];
 for(let i=0;i<23;i++){const b=bytes(`synthetic model ${i}`),id=`model-${i}`,sha256=hash(b);runtime.set(`models/${id}.glb`,b);scene.set(`scene/assets/${sha256}.glb`,b);assets.push({id,file:`assets/${sha256}.glb`,runtimeSha256:`sha256:${sha256}`,runtimeBytes:b.length});}
 scene.set('scene/layout.json',bytes('{"placements":[],"a":1}'));scene.set('scene/scene.json',bytes(JSON.stringify({assets,layout:{a:1,placements:[]},uniqueAssetCount:23})));
 return{runtime,scene,assets};
}
function seal(entries:Map<string,Uint8Array>){const files=Object.fromEntries([...entries].map(([path,b])=>[path,{sha256:`sha256:${hash(b)}`,bytes:b.length}]));entries.set('delivery.json',bytes(JSON.stringify({schemaVersion:1,files})));return entries;}
test('U-03 Farm receipt schema verifies all members except its own authenticated receipt',()=>{
 const entries=seal(new Map([['sample.bin',bytes('sample')]]));expect(verifyDelivery(entries,'synthetic.zip').verifiedMembers).toBe(1);
 entries.set('extra.bin',bytes('extra'));expect(()=>verifyDelivery(entries,'synthetic.zip')).toThrow('extra.bin');entries.delete('extra.bin');
 entries.set('sample.bin',bytes('tampered'));expect(()=>verifyDelivery(entries,'synthetic.zip')).toThrow('sample.bin');entries.delete('sample.bin');expect(()=>verifyDelivery(entries,'synthetic.zip')).toThrow('sample.bin');
 entries.set('delivery.json',bytes('{"schemaVersion":1,"files":[]}'));expect(()=>verifyDelivery(entries,'synthetic.zip')).toThrow('delivery.json');
});
test('U-03 Farm cross-check requires 23 unique models and identical runtime/scene bytes and layout',()=>{
 const {runtime,scene,assets}=fixture();expect(verifyFarmModels(runtime,scene).models).toHaveLength(23);
 scene.set(`scene/${assets[0]!.file}`,bytes('broken'));expect(()=>verifyFarmModels(runtime,scene)).toThrow('model-0');
 const next=fixture();next.runtime.set('models/extra.glb',bytes('extra'));expect(()=>verifyFarmModels(next.runtime,next.scene)).toThrow('model count');
 const layout=fixture();layout.scene.set('scene/layout.json',bytes('{"placements":[1]}'));expect(()=>verifyFarmModels(layout.runtime,layout.scene)).toThrow('layout.json');
});
test('U-04 optional website comparison requires the exact release model set, lengths and hashes',()=>{
 const {runtime,scene}=fixture(),models=verifyFarmModels(runtime,scene).models;
 const site={files:models.map(m=>({path:`packs/farm/r34/${m.path}`,bytes:m.bytes,sha256:m.sha256}))};
 expect(()=>verifySiteModels(site,'r34',models)).not.toThrow();expect(()=>verifySiteModels(site,'r33',models)).toThrow('23 model');
 site.files[0]!.bytes++;expect(()=>verifySiteModels(site,'r34',models)).toThrow('model-0');
});
test('U-04 staging CLI defaults r33 and rejects unknown releases/options or absent arguments',()=>{
 expect(parseStageOptions([])).toEqual({release:'r33',force:false});expect(parseStageOptions(['--','--release','r34','--force'])).toEqual({release:'r34',force:true});
 for(const args of [['--release','r35'],['--source'],['--mystery']])expect(()=>parseStageOptions(args)).toThrow();
});
