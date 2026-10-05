import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyTroyPublication} from './troy-publication.mjs';
const catalog={models:{url:'https://assets.kilnstudio.tools/packs/troy/release/models.zip'},scene:{url:'https://assets.kilnstudio.tools/packs/troy/release/scene.zip'},posters:[{src:'/scene-packs/troy/release/media/coast.webp'}],assets:[{slug:'hero',runtimeDownload:{url:'/scene-packs/troy/release/models/hero.glb'}}]};
async function fixture(files:Record<string,string>,run:(dist:string)=>Promise<void>){const dist=await mkdtemp(join(tmpdir(),'troy-pages-'));try{for(const [path,html]of Object.entries(files)){const target=join(dist,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,html);}await run(dist);}finally{if(dirname(dist)!==tmpdir())throw Error('Fixture escaped its temporary directory');await rm(dist,{recursive:true,force:true});}}
test('asset-free pages cannot expose dead preview or gallery links',async()=>{await fixture({'scenes/troy/index.html':'<button data-explore>Explore</button>'},async dist=>{await expect(verifyTroyPublication({dist,catalog,enabled:false})).rejects.toThrow('unavailable');});});
test('asset-free pages may redirect to catalogs without producing model pages',async()=>{await fixture({'scenes/troy/index.html':'<a href="/scenes/">Scenes</a>','packs/troy/index.html':'<a href="/packs/">Packs</a>'},async dist=>{expect(await verifyTroyPublication({dist,catalog,enabled:false})).toEqual({enabled:false,models:0});});});
test('public pack must offer both archives and every standalone model viewer and download',async()=>{const scene='<button data-explore>Explore</button><img src="'+catalog.posters[0].src+'">',pack=catalog.posters.map(p=>'<img src="'+p.src+'">').join('')+[catalog.models,catalog.scene].map(p=>'<a href="'+p.url+'">Download</a>').join('');await fixture({'scenes/troy/index.html':scene,'packs/troy/index.html':pack,'gallery/troy/hero/index.html':'<asset-viewer></asset-viewer><a href="'+catalog.assets[0].runtimeDownload.url+'">GLB</a>'},async dist=>{expect(await verifyTroyPublication({dist,catalog,enabled:true})).toEqual({enabled:true,models:1});await writeFile(join(dist,'packs/troy/index.html'),'<p>No downloads</p>');await expect(verifyTroyPublication({dist,catalog,enabled:true})).rejects.toThrow('lacks a download');});});

test('archived composition stays downloadable without a gallery route or pack card', async () => {
  const archived = { slug: 'battle-scene-reference', runtimeDownload: { url: '/scene-packs/troy/release/models/battle-scene-reference.glb' } };
  const curated = { ...catalog, assets: [...catalog.assets, archived] };
  const scene = '<button data-explore>Explore</button><img src="'+catalog.posters[0].src+'">';
  const pack = '<img src="'+catalog.posters[0].src+'">'+[catalog.models,catalog.scene].map(p=>'<a href="'+p.url+'">Download</a>').join('');
  await fixture({ 'scenes/troy/index.html': scene, 'packs/troy/index.html': pack, 'gallery/troy/hero/index.html': '<asset-viewer></asset-viewer><a href="'+catalog.assets[0].runtimeDownload.url+'">GLB</a>' }, async dist => {
    expect(await verifyTroyPublication({ dist, catalog: curated, enabled: true })).toEqual({ enabled: true, models: 1 });
    await mkdir(join(dist, 'gallery/troy/battle-scene-reference'), { recursive: true });
    await writeFile(join(dist, 'gallery/troy/battle-scene-reference/index.html'), '<asset-viewer></asset-viewer>');
    await expect(verifyTroyPublication({ dist, catalog: curated, enabled: true })).rejects.toThrow('excluded');
  });
});

test('unified public delivery checks runtime and editable pins instead of the legacy models ZIP', async () => {
  const downloads = { downloads: [
    { profile: 'runtime', url: 'https://assets.kilnstudio.tools/packs/troy/new/runtime.zip' },
    { profile: 'editable', url: 'https://assets.kilnstudio.tools/packs/troy/new/editable.zip' },
  ], assets: [{ ...catalog.assets[0]!, editableDownload: { url: 'https://assets.kilnstudio.tools/packs/troy/new/hero-editable.zip' } }] };
  const scene = '<button data-explore>Explore</button><img src="'+catalog.posters[0].src+'">';
  const pack = '<img src="'+catalog.posters[0].src+'">'+[...downloads.downloads,catalog.scene].map(p=>'<a href="'+p.url+'">Download</a>').join('');
  const model = '<asset-viewer></asset-viewer>'+[downloads.assets[0]!.runtimeDownload,downloads.assets[0]!.editableDownload].map(p=>'<a href="'+p.url+'">Download</a>').join('');
  await fixture({ 'scenes/troy/index.html': scene, 'packs/troy/index.html': pack, 'gallery/troy/hero/index.html': model }, async dist => {
    expect(await verifyTroyPublication({ dist, catalog, enabled: true, downloads })).toEqual({ enabled: true, models: 1 });
    await writeFile(join(dist, 'packs/troy/index.html'), pack.replace(downloads.downloads[1]!.url, '/missing.zip'));
    await expect(verifyTroyPublication({ dist, catalog, enabled: true, downloads })).rejects.toThrow('lacks a download');
  });
});
