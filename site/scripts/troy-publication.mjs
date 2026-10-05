import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isTroyGalleryAsset} from '../src/lib/troy-gallery.mjs';

/** Check rendered pages, including the asset-free CI mode. */
export async function verifyTroyPublication({dist,catalog,enabled,downloads}) {
  const read=async path=>readFile(resolve(dist,path),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
  const scene=await read('scenes/troy/index.html'),pack=await read('packs/troy/index.html');
  if(!enabled){
    for(const html of [scene,pack])assert.ok(!/data-explore|\/scene-packs\/troy\/|\/gallery\/troy\/|assets\.kilnstudio\.tools\/packs\/troy\//.test(html),'Asset-free build exposes unavailable Troy content');
    const entries=await readdir(resolve(dist,'gallery/troy')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    assert.equal(entries.length,0,'Asset-free build emitted Troy model pages');
    return {enabled:false,models:0};
  }
  assert.ok(scene.includes('data-explore'),'Public Troy scene has no Explore control');
  const packDownloads=downloads ? ['runtime','editable'].map(profile=>{
    const item=downloads.downloads.find(item=>item.profile===profile);
    assert.ok(item, 'Missing Troy delivery profile: '+profile);return item.url;
  }) : [catalog.models.url];
  for(const url of [...packDownloads,catalog.scene.url])assert.ok(pack.includes(`href="${url}"`),'Public Troy pack lacks a download: '+url);
  for(const poster of catalog.posters)for(const html of [scene,pack])assert.ok(html.includes(poster.src),'Public Troy page lacks its captured picture');
  for(const asset of catalog.assets.filter(asset => !isTroyGalleryAsset(asset))) {
    assert.equal(await read(`gallery/troy/${asset.slug}/index.html`), '', 'Public Troy emitted an excluded gallery route: '+asset.slug);
    assert.ok(!pack.includes(`/gallery/troy/${asset.slug}/`), 'Public Troy pack links an excluded gallery asset: '+asset.slug);
    assert.ok(!(await read('gallery/index.html')).includes(`/gallery/troy/${asset.slug}/`), 'Public gallery links an excluded Troy asset: '+asset.slug);
  }
  for(const asset of catalog.assets.filter(isTroyGalleryAsset)){
    const html=await read(`gallery/troy/${asset.slug}/index.html`);
    assert.ok(html.includes('<asset-viewer'),'Public Troy model lacks a viewer: '+asset.slug);
    const delivered=downloads?.assets.find(item=>item.slug===asset.slug);
    if(downloads)assert.ok(delivered,'Missing Troy asset delivery: '+asset.slug);
    for(const file of delivered ? [delivered.runtimeDownload,delivered.editableDownload] : [asset.runtimeDownload])assert.ok(html.includes(`href="${file.url}"`),'Public Troy model lacks its download: '+asset.slug);
  }
  return {enabled:true,models:catalog.assets.filter(isTroyGalleryAsset).length};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const site=resolve(import.meta.dirname,'..'),catalog=JSON.parse(await readFile(resolve(site,'src/data/troy.json'),'utf8'));
  const downloads=JSON.parse(await readFile(resolve(site,'src/data/asset-delivery.json'),'utf8')).groups.troy;
  console.log(JSON.stringify(await verifyTroyPublication({dist:resolve(process.argv[2]??resolve(site,'dist')),catalog,downloads,enabled:!['0','false'].includes(process.env.KILN_SITE_PACKS??'1')})));
}
