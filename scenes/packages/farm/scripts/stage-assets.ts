// SPDX-License-Identifier: MIT
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stageFiles,verifyStaged,type StagePlan} from '@kiln-scenes/scene-kit/staging';
import {parseStageOptions,resolveSources,extractVerified,workspaceTarget,verifySiteModels,sha256,required} from './staging-core';

export function stageFarm(args:readonly string[]=process.argv.slice(2)){
 const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),options=parseStageOptions(args);
 const {selected,checked}=resolveSources(workspace,options);
 const out=workspaceTarget(workspace,resolve(options.out??resolve(workspace,'packages/farm/staged',options.release)));
 for(const source of checked)if(out===source.source||out.startsWith(source.source+sep)||source.source.startsWith(out+sep))throw new Error('Output overlaps a read-only source');
 if(options.siteManifest)verifySiteModels(JSON.parse(readFileSync(resolve(options.siteManifest),'utf8')),options.release,selected.models);
 const {sceneRoot,runtimeRoot}=extractVerified(workspace,selected,options.release);
 const files:StagePlan['files']=selected.models.map(m=>({from:resolve(runtimeRoot,m.path),to:m.path,sha256:m.sha256}));
 const data:Record<string,string>={};
 for(const name of ['layout.json','grass.json','grass.bin']){const path=`scene/${name}`,to=`data/${name}`;files.push({from:resolve(sceneRoot,path),to,sha256:sha256(required(selected.archives.scene.entries,path))});data[name==='layout.json'?'layout':name==='grass.json'?'grass':'grassBin']=to;}
 // Preserve exact authored asset declarations and legal text; no paraphrase stands in for a licence.
 for(const [path,body]of selected.archives.runtime.entries)if(path.startsWith('licenses/'))files.push({from:resolve(runtimeRoot,path),to:path,sha256:sha256(body)});
 for(const name of ['LICENSE-FIELD-GRASS.txt','LICENSE-VIEWER.txt','LICENSE-THREE.txt','LICENSE-BVH.txt']){const path=`scene/${name}`;files.push({from:resolve(sceneRoot,path),to:`licenses/${name}`,sha256:sha256(required(selected.archives.scene.entries,path))});}
 const source={projectRevision:selected.downloads.projectRevision,downloadsSha256:selected.downloadsSha256,runtimeZipSha256:selected.archives.runtime.receipt.sha256.slice(7),sceneZipSha256:selected.archives.scene.receipt.sha256.slice(7),parentDeliveryManifestSha256:selected.downloads.parentDeliveryManifestSha256.slice(7),fullPackAccepted:selected.downloads.fullPackAccepted,archives:Object.fromEntries(Object.entries(selected.archives).map(([profile,v])=>[profile,{...v.receipt,verifiedMembers:v.verifiedMembers}])),sceneMetadata:{runtimeArchiveSha256:selected.sceneManifest.runtimeArchiveSha256,deliverySha256:selected.sceneManifest.deliverySha256},memberReceiptSelfExclusion:'delivery.json only; authenticated by enclosing archive SHA-256'};
 const result=stageFiles({id:'farm',release:options.release,three:'0.186.0',out,force:options.force,models:selected.models.map(m=>({id:m.id,to:m.path})),data,files,source,credits:[
  {name:'Shapes & Seasons Farm assets',licence:'CC0-1.0',note:'Designated CC0-1.0 by the project owner. Exact declaration and legal text: licenses/ASSET-LICENSE.txt and licenses/CC0-1.0.txt.'},
  {name:'Field Grass 0.1.0',licence:'MIT',holder:'Matthew Kissinger',note:'Vendored source, commit 2a0d3a3256dc8d8f6d9de68f3dc1636a621559c5; licenses/LICENSE-FIELD-GRASS.txt.'},
  {name:'Farm viewer derivative',licence:'MIT',holder:'Matthew Kissinger',note:'licenses/LICENSE-VIEWER.txt.'},
  {name:'three',licence:'MIT',note:'licenses/LICENSE-THREE.txt; runtime package pinned to 0.186.0.'},
  {name:'three-mesh-bvh',licence:'MIT',note:'licenses/LICENSE-BVH.txt.'},
 ]});
 const verification=verifyStaged(out);if(!verification.ok)throw new Error(verification.problems.join('\n'));
 const evidence=workspaceTarget(workspace,resolve(workspace,'evidence/m2/staging',`${options.release}.json`));mkdirSync(dirname(evidence),{recursive:true});
 const report={release:options.release,source:selected.source,checkedSources:checked.map(s=>({path:s.source,downloadsSha256:s.downloadsSha256,archives:Object.fromEntries(Object.entries(s.archives).map(([p,a])=>[p,{...a.receipt,verifiedMembers:a.verifiedMembers}]))})),out,oracle:sceneRoot,runtimeOracle:runtimeRoot,models:selected.models,modelCount:selected.models.length,modelBytes:selected.modelBytes,...result,verification,siteManifest:options.siteManifest?{path:resolve(options.siteManifest),verified:true}:null,sourceMetadata:source,packSha256:sha256(readFileSync(resolve(out,'pack.json'))),sumsSha256:sha256(readFileSync(resolve(out,'SHA256SUMS')))};
 writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({release:options.release,source:selected.source,out,models:selected.models.length,modelBytes:selected.modelBytes,...result,allHashesVerified:true,evidence},null,2));
 return report;
}
if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??'')){try{stageFarm();}catch(error){console.error(error);process.exitCode=1;}}
