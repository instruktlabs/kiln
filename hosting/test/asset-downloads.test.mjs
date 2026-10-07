import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime, namespace;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: String.raw`
      import {DurableObject} from 'cloudflare:workers';
      import {ArtifactStore} from './src/artifact-store';
      import {AssetIndex} from './src/asset-index';
      import {AssetDownloadTickets} from './src/asset-downloads';
      import {serviceFailure} from './src/http';
      export class Fixture extends DurableObject {
        constructor(ctx,env) {
          super(ctx,env);
          const now=()=>ctx.storage.kv.get('fixtureTime')??Date.now();
          this.store=new ArtifactStore(ctx,env.ARTIFACTS,{maxBytes:1048576,maxObjects:32,maxGroups:8},now);
          this.assets=new AssetIndex(this.store);
          this.downloads=new AssetDownloadTickets(ctx.storage,{
            group:id=>this.store.group(id),
            download:async(id,head)=>{
              const response=await this.store.download(id,head);
              const race=await ctx.storage.get('readRace');
              if(race?.group) await this.store.deleteGroup(race.group);
              if(race?.time) await ctx.storage.put('fixtureTime',race.time);
              return response;
            }
          },this.assets,now);
        }
        async fetch(request){
          try{
            const path=new URL(request.url).pathname;
            if(path==='/upload') return Response.json(await this.store.upload(request));
            if(path==='/commit') return Response.json(this.assets.commit(await request.json()).record);
            if(path==='/issue') {const a=await request.json();return Response.json(await this.downloads.issue(a.collection,a.assetId,a.revisionId));}
            if(path==='/delete') {await this.store.deleteGroup(await request.text());return new Response('deleted');}
            if(path==='/command') {const {key,value}=await request.json();await this.ctx.storage.put(key,value);return new Response('set');}
            if(path==='/snapshot') return Response.json(this.ctx.storage.sql.exec('SELECT * FROM asset_download_tickets').toArray());
            if(path==='/cleanup') {this.downloads.sweep();return new Response('swept');}
            const file=path.match(/^\/file\/([^/]+)\/([^/]+)$/);
            if(file)return await this.downloads.download(file[1],decodeURIComponent(file[2]),request.method==='HEAD');
            return new Response('not found',{status:404});
          }catch(error){return serviceFailure(error);}
        }
        alarm(){return this.store.sweep();}
      }
      export default {fetch(){return new Response('private',{status:404});}};`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'download-fixture',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      durableObjects: { TENANTS: { className: 'Fixture', useSQLite: true } },
      r2Buckets: ['ARTIFACTS'],
      outboundService: async () => {
        throw Error('No network');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('TENANTS');
});
after(async () => runtime?.dispose());

const send = (owner, path, init) =>
  namespace.getByName(owner).fetch(`https://fixture.invalid${path}`, init);
const post = (owner, path, value) =>
  send(owner, path, { method: 'POST', body: JSON.stringify(value) });
const command = (owner, key, value) => post(owner, '/command', { key, value });
const selector = { collection: 'project', assetId: 'a_box', revisionId: 'r_one' };
const issue = (owner, extra = {}) => post(owner, '/issue', { ...selector, ...extra });
const file = (owner, token, name = 'asset.glb', method = 'GET') =>
  send(owner, `/file/${encodeURIComponent(token)}/${encodeURIComponent(name)}`, { method });
async function seed(owner) {
  const files = {};
  for (const [name, data] of [
    ['asset.glb', 'glTFfixture'],
    ['source.kiln.js', 'function build(){}'],
    ['manifest.json', '{}'],
  ]) {
    const bytes = Buffer.from(data);
    const response = await send(owner, '/upload', {
      method: 'POST',
      body: bytes,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.length),
        'x-artifact-name': name,
        'x-artifact-sha256': createHash('sha256').update(bytes).digest('hex'),
      },
    });
    assert.equal(response.status, 200);
    files[name] = (await response.json()).id;
  }
  const response = await post(owner, '/commit', { ...selector, files, mode: 'save' });
  assert.equal(response.status, 200);
  return { group: await response.json(), files };
}

test('download tickets select exact private saved bytes and survive object eviction without retaining raw tokens', async () => {
  await seed('alice');
  const now = Date.UTC(2030, 0, 1);
  await command('alice', 'fixtureTime', now);
  const issued = await (await issue('alice')).json();
  assert.match(issued.ticket, /^[a-f0-9]{64}$/);
  assert.equal(issued.expiresAt, now + 600000);
  assert.deepEqual(issued.files, ['asset.glb', 'manifest.json', 'source.kiln.js']);
  const rows = await (await send('alice', '/snapshot')).json();
  assert.equal(rows.length, 1);
  assert(!JSON.stringify(rows).includes(issued.ticket));
  const result = await file('alice', issued.ticket);
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'glTFfixture');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.match(result.headers.get('content-disposition'), /attachment; filename="asset.glb"/);
  assert.equal((await file('bob', issued.ticket)).status, 404);
  await runtime.unsafeEvictDurableObject('download-fixture', 'Fixture', {
    id: namespace.idFromName('alice').toString(),
  });
  assert.equal(
    await (await file('alice', issued.ticket, 'source.kiln.js')).text(),
    'function build(){}',
  );
});

test('unknown revisions and unsafe filenames fail without issuing or spending a ticket', async () => {
  await seed('invalid');
  assert.equal((await issue('invalid', { revisionId: 'r_missing' })).status, 404);
  assert.equal((await issue('invalid', { collection: '../project' })).status, 400);
  assert.deepEqual(await (await send('invalid', '/snapshot')).json(), []);
  const { ticket } = await (await issue('invalid')).json();
  for (const name of ['../source.kiln.js', 'not-saved.txt', 'preview.png', 'asset.glb\n']) {
    assert.equal((await file('invalid', ticket, name)).status, 404);
  }
  assert.equal((await file('invalid', `${ticket}\n`)).status, 404);
  assert.equal((await (await send('invalid', '/snapshot')).json())[0].uses, 0);
});

test('ticket expiry is independent of saved retention and is rechecked after reading storage', async () => {
  await seed('expiry');
  const now = Date.UTC(2030, 0, 2);
  await command('expiry', 'fixtureTime', now);
  const { ticket } = await (await issue('expiry')).json();
  await command('expiry', 'readRace', { time: now + 600000 });
  assert.equal((await file('expiry', ticket)).status, 404);
  await command('expiry', 'readRace', null);
  const renewed = await (await issue('expiry')).json();
  assert.notEqual(renewed.ticket, ticket);
  assert.equal(await (await file('expiry', renewed.ticket)).text(), 'glTFfixture');
  assert.equal((await (await send('expiry', '/snapshot')).json()).length, 1);
});

test('deleting the selected revision revokes its ticket even when another revision keeps the same bytes', async () => {
  const { group, files } = await seed('deleted');
  assert.equal(
    (await post('deleted', '/commit', { ...selector, revisionId: 'r_two', files, mode: 'import' }))
      .status,
    200,
  );
  const { ticket } = await (await issue('deleted')).json();
  await command('deleted', 'readRace', { group: group.id });
  assert.equal((await file('deleted', ticket)).status, 404);
  await command('deleted', 'readRace', null);
  const next = await (await issue('deleted', { revisionId: 'r_two' })).json();
  assert.equal(await (await file('deleted', next.ticket)).text(), 'glTFfixture');
});

test('concurrent redemption cannot exceed the per-ticket transfer limit and HEAD returns no bytes', async () => {
  await seed('uses');
  const { ticket } = await (await issue('uses')).json();
  const head = await file('uses', ticket, 'asset.glb', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const results = await Promise.all(
    Array.from({ length: 40 }, async () => {
      const r = await file('uses', ticket);
      await r.arrayBuffer();
      return r.status;
    }),
  );
  assert.equal(results.filter((status) => status === 200).length, 31);
  assert.equal(results.filter((status) => status === 429).length, 9);
  assert.equal((await (await send('uses', '/snapshot')).json())[0].uses, 32);
});

test('issuance has a bounded persistent count and expired rows can be reclaimed', async () => {
  await seed('capacity');
  const now = Date.UTC(2030, 0, 3);
  await command('capacity', 'fixtureTime', now);
  const results = await Promise.all(
    Array.from({ length: 135 }, async () => {
      const r = await issue('capacity');
      await r.text();
      return r.status;
    }),
  );
  assert.equal(results.filter((s) => s === 200).length, 128);
  assert.equal(results.filter((s) => s === 429).length, 7);
  await command('capacity', 'fixtureTime', now + 600000);
  assert.equal((await send('capacity', '/cleanup', { method: 'POST' })).status, 200);
  assert.deepEqual(await (await send('capacity', '/snapshot')).json(), []);
  assert.equal((await issue('capacity')).status, 200);
});
