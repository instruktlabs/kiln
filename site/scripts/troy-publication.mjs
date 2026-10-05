import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Check rendered pages, including the asset-free CI mode. */
export async function verifyTroyPublication({dist,catalog,enabled}) {
  const read=async path=>readFile(resolve(dist,path),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
  const scene=await read('scenes/troy/index.html'),pack=await read('packs/troy/index.html');
  if(!enabled){
    for(const html of [scene,pack])assert.ok(!/data-explore|\/scene-packs\/troy\/|\/gallery\/troy\/|assets\.kilnstudio\.tools\/packs\/troy\//.test(html),'Asset-free build exposes unavailable Troy content');
    const entries=await readdir(resolve(dist,'gallery/troy')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    assert.equal(entries.length,0,'Asset-free build emitted Troy model pages');
    return {enabled:false,models:0};
  }
  assert.ok(scene.includes('data-explore'),'Public Troy scene has no Explore control');
  for(const url of [catalog.models.url,catalog.scene.url])assert.ok(pack.includes(`href="${url}"`),'Public Troy pack lacks a download: '+url);
  for(const poster of catalog.posters)for(const html of [scene,pack])assert.ok(html.includes(poster.src),'Public Troy page lacks its captured picture');
  for(const asset of catalog.assets){
    const html=await read(`gallery/troy/${asset.slug}/index.html`);
    assert.ok(html.includes('<asset-viewer'),'Public Troy model lacks a viewer: '+asset.slug);
    assert.ok(html.includes(`href="${asset.runtimeDownload.url}"`),'Public Troy model lacks its download: '+asset.slug);
  }
  return {enabled:true,models:catalog.assets.length};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const site=resolve(import.meta.dirname,'..'),catalog=JSON.parse(await readFile(resolve(site,'src/data/troy.json'),'utf8'));
  console.log(JSON.stringify(await verifyTroyPublication({dist:resolve(process.argv[2]??resolve(site,'dist')),catalog,enabled:!['0','false'].includes(process.env.KILN_SITE_PACKS??'1')})));
}
