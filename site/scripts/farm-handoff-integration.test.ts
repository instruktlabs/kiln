import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import farm from '../src/data/packs/farm.json';
import { hashBytes } from './mirror-core.mjs';
import { switchFarmDelivery } from './switch-farm-delivery.mjs';

const saveJson = async (path: string, value: unknown) => { await mkdir(dirname(path), {recursive:true}); await writeFile(path,JSON.stringify(value)); };
const seal = (bytes: Uint8Array) => ({bytes:bytes.length,sha256:hashBytes(bytes)});
function fixtureGlb() {
  const json=JSON.stringify({scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Farmhouse',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],accessors:[{count:3,min:[0,0,0],max:[1,1,1]},{count:3}],materials:[{}]});
  const length=Math.ceil(Buffer.byteLength(json)/4)*4;const glb=Buffer.alloc(length+20,32);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(length,12);glb.writeUInt32LE(0x4e4f534a,16);glb.write(json,20);return glb;
}

test('one supplied sealed handoff switches sources, models, media and acceptance together; corrupt input leaves data untouched', async () => {
  const temp=await mkdtemp(join(tmpdir(),'kiln-site-handoff-'));
  try {
    const dataDir=join(temp,'data');const cache=join(temp,'cache');const delivery=join(temp,'farm-r34-documented-downloads');await mkdir(delivery,{recursive:true});
    const baseline=structuredClone(farm);baseline.revision='r33';baseline.fullPackAccepted=false;baseline.ownerApprovedAssets=0;baseline.assets=baseline.assets.filter((asset)=>asset.id==='farmhouse');baseline.assets[0]!.revisionId=baseline.floorRevision.parentRevision;baseline.assets[0]!.review.ownerAccepted=false;baseline.ownerReview.revisions=baseline.ownerReview.revisions.filter((asset)=>asset.id==='farmhouse');
    await saveJson(join(dataDir,'packs/farm.json'),baseline);await saveJson(join(dataDir,'owner-review.json'),{assetId:'farmhouse',revisionId:baseline.floorRevision.asset.revisionId,ownerAccepted:true,date:'2026-09-29',statement:'Accepted',source:'owner.md'});
    await saveJson(join(dataDir,'mirror-manifest.json'),{base:'https://assets.kilnstudio.tools/',files:[]});await saveJson(join(dataDir,'commons-build.json'),{images:[],archives:[],models:[],sources:[]});
    const glb=fixtureGlb();const source=strToU8('function build() { return createRoot(); }');const revisionId=baseline.floorRevision.asset.revisionId;const projectRevision='r_project_34';
    const authored={id:'farmhouse',revisionId,name:'Farmhouse',triangles:1,authorship:{originalModel:'claude-opus-5-5',refinementModels:['gemini-3.8-flash-high'],history:[{stage:'wood-floor',revisionId,parentRevisionId:baseline.assets[0]?.revisionId,requested:{model:'gemini-3.8-flash-high',effort:'high'},confirmed:{model:'gemini-3.8-flash-high',effort:null},harness:{name:'agy',version:'1.2.12'}}]}};
    const metadata={revisionId,runtime:{file:'models/farmhouse.glb',...seal(glb)},source:{sourceSha256:hashBytes(source)}};
    const files=[];
    for(const profile of ['runtime','editable','scene']) {
      const members:Record<string,Uint8Array>=profile==='runtime'?{'models/farmhouse.glb':glb,'models/farmhouse.json':strToU8(JSON.stringify(metadata))}:profile==='editable'?{'sources/farmhouse.kiln.js':source}:{'scene/README.txt':strToU8('Fixture scene')};
      const manifest={projectRevision,fullPackAccepted:true,assets:[authored],files:Object.fromEntries(Object.entries(members).map(([name,bytes])=>[name,seal(bytes)]))};
      const archive=zipSync({...members,'delivery.json':strToU8(JSON.stringify(manifest))});const file=`shapes-and-seasons-farm-${profile}.zip`;await writeFile(join(delivery,file),archive);files.push({file,profile,...seal(archive)});
    }
    const index={projectRevision,fullPackAccepted:true,downloads:files.map(({file,profile,...pin})=>({profile,archive:file,...pin}))};const indexBytes=strToU8(JSON.stringify(index));await writeFile(join(delivery,'downloads.json'),indexBytes);
    const image=await sharp({create:{width:2,height:2,channels:4,background:'#eee9df'}}).png().toBuffer();
    const changedMedia=[];
    for(const kind of ['cutout','poster']){const file=`farmhouse-${kind}.png`;await writeFile(join(delivery,file),image);changedMedia.push({file,assetId:'farmhouse',kind,revisionId,...seal(image)});}
    const handoff={files:[{file:'downloads.json',...seal(indexBytes)},...files],changedMedia};const handoffPath=join(delivery,'site-handoff.json');await saveJson(handoffPath,handoff);
    await writeFile(join(delivery,'shapes-and-seasons-farm-scene.zip'),'corrupted');
    await expect(switchFarmDelivery({handoff:handoffPath,dataDir,cache})).rejects.toThrow('SHA-256');
    expect(JSON.parse(await readFile(join(dataDir,'packs/farm.json'),'utf8')).revision).toBe('r33');
    const sceneManifest={projectRevision,fullPackAccepted:true,assets:[authored],files:{'scene/README.txt':seal(strToU8('Fixture scene'))}};await writeFile(join(delivery,'shapes-and-seasons-farm-scene.zip'),zipSync({'scene/README.txt':strToU8('Fixture scene'),'delivery.json':strToU8(JSON.stringify(sceneManifest))}));
    expect(await switchFarmDelivery({handoff:handoffPath,dataDir,cache})).toEqual({revision:'r34',assets:1,fullPackAccepted:true,newPinnedFiles:6});
    const output=JSON.parse(await readFile(join(dataDir,'packs/farm.json'),'utf8'));expect(output.assets[0].revisionId).toBe(revisionId);expect(output.assets[0].poster.inputPath).toBe('media/farm/r34/cutout/farmhouse.png');expect(output.deliveryReview.fullPackAccepted).toBe(true);expect(output.floorRevision.parentRevision).toBe(baseline.floorRevision.parentRevision);
    const plan=JSON.parse(await readFile(join(dataDir,'commons-build.json'),'utf8'));expect(plan.models[0].archive).toContain('/r34/');expect(plan.sources[0].sha256).toBe(hashBytes(source));
  } finally {
    const target=resolve(temp);if(!target.startsWith(resolve(tmpdir()))||!target.includes('kiln-site-handoff-'))throw new Error('Unsafe test cleanup path');await rm(target,{recursive:true,force:true});
  }
});
