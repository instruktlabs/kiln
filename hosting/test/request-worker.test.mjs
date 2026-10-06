import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime, namespace;
before(async () => {
  const result = await build({
    stdin: {
      contents: `
      import production from './src/request-worker';
      import {KilnNativeRequest} from './src/request-worker';
      import {DurableObject} from 'cloudflare:workers';
      import {handleRenderRequest} from './src/evaluation-request';
      export * from './src/request-worker';
      export {KilnTenant} from './src/tenant';
      export class RequestFixture extends KilnNativeRequest {
        async fixtureSeed(tenant) { await this.ctx.storage.put('request', {state:'running',tenant,deadlineAt:Date.now()+60000,children:[]}); }
        async fixtureRecord() { return this.ctx.storage.get('request'); }
        async fixtureClose() { const record=await this.ctx.storage.get('request'); await this.ctx.storage.put('request',{...record,state:'finished'}); }
      }
      export class RenderFixture extends DurableObject {
        fetch(request) { return handleRenderRequest(request,{run:async(bytes)=>{
          if(await this.ctx.storage.get('used')) throw Error('duplicate');
          await this.ctx.storage.put('used',true); return bytes;
        }}); }
        async cancel(){await this.ctx.storage.put('cancelled',true);}
        async fixtureRecord(){return {used:await this.ctx.storage.get('used'),cancelled:await this.ctx.storage.get('cancelled')};}
      }
      export default {async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/public') return production.fetch(request);
        const requestId = env.REQUESTS.idFromName(url.searchParams.get('owner')).toString();
        const stub = env.REQUESTS.get(env.REQUESTS.idFromString(requestId));
        if (url.pathname === '/fixture-seed') { await stub.fixtureSeed(await request.text()); return new Response('seeded'); }
        if (url.pathname === '/fixture-record') return Response.json(await stub.fixtureRecord());
        if (url.pathname === '/fixture-close') {await stub.fixtureClose();return new Response('closed');}
        if (url.pathname === '/fixture-render-record') {const record=await stub.fixtureRecord();return Response.json(await env.RENDERS.getByName(record.children.at(-1).id).fixtureRecord());}
        if (url.pathname === '/cancel') { await stub.cancel(); return new Response('cancelled'); }
        const render=url.pathname==='/render';
        const service = render ? ctx.exports.KilnNativeRender({props: {requestId}}) : ctx.exports.KilnNativeStorage({props: {requestId}});
        // The fixture enters through a public test listener; real VM loopback
        // requests do not carry Miniflare's public ingress client-IP header.
        const headers = new Headers(request.headers); headers.delete('cf-connecting-ip');
        return service.fetch(new Request((render?'http://kiln-renderer.internal':'http://kiln-storage.internal')+url.pathname, new Request(request,{headers})));
      }};`,
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
      name: 'request-fixture',
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      durableObjects: {
        REQUESTS: { className: 'RequestFixture', useSQLite: true },
        TENANTS: { className: 'KilnTenant', useSQLite: true },
        RENDERS: { className: 'RenderFixture', useSQLite: true },
      },
      bindings: {
        PUBLIC_ORIGIN: 'https://kiln.example.com',
        STORAGE_MAX_BYTES: '1048576',
        STORAGE_MAX_OBJECTS: '32',
        STORAGE_MAX_GROUPS: '8',
      },
      r2Buckets: ['ARTIFACTS'],
      outboundService: async () => {
        throw Error('No external fetch in private fixture');
      },
    }),
    unsafeInspectDurableObjects: true,
  });
  namespace = await runtime.getDurableObjectNamespace('REQUESTS');
});
after(async () => runtime?.dispose());
const send = (owner, path, init) =>
  runtime.dispatchFetch(`https://fixture.invalid${path}?owner=${owner}`, init);
async function active(owner, tenant) {
  assert.equal((await send(owner, '/fixture-seed', { method: 'POST', body: tenant })).status, 200);
}

test('private request Worker exposes no default public service', async () => {
  assert.equal((await send('no-owner', '/public')).status, 404);
});

test('actual loopback props and DO RPC route storage using the outside durable tenant record', async () => {
  await active('alice', 'a'.repeat(43));
  await active('bob', 'b'.repeat(43));
  const source = '// private Alice source\nfunction build(){return createRoot();}';
  const saved = await send('alice', '/internal/programs', {
    method: 'POST',
    headers: { 'content-type': 'application/javascript' },
    body: source,
  });
  assert.equal(saved.status, 201);
  const { programRef } = await saved.json();
  const path = `/internal/programs/${encodeURIComponent(programRef)}`;
  assert.equal(await (await send('alice', path)).text(), source);
  assert.equal((await send('bob', path)).status, 404);
  assert.equal((await send('bob', path, { headers: { 'x-tenant': 'a'.repeat(43) } })).status, 400);
  await runtime.unsafeEvictDurableObject('request-fixture', 'RequestFixture', {
    id: namespace.idFromName('alice').toString(),
  });
  assert.equal(await (await send('alice', path)).text(), source);
});

test('actual cancellation RPC writes a persistent pre-arrival fence and rejects storage afterward', async () => {
  assert.equal((await send('cancelled', '/cancel')).status, 200);
  assert.equal((await (await send('cancelled', '/fixture-record')).json()).state, 'finished');
  await runtime.unsafeEvictDurableObject('request-fixture', 'RequestFixture', {
    id: namespace.idFromName('cancelled').toString(),
  });
  assert.equal((await send('cancelled', '/internal/programs')).status, 409);
});

test('actual renderer loopback uses host-owned props and a fresh durable child, then acknowledges cancellation', async () => {
  const owner = 'render-owner';
  await active(owner, 'r'.repeat(43));
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-kiln-deadline-ms': '30000',
      'x-kiln-max-response-bytes': '20971520',
    },
    body: '{}',
  };
  const result = await send(owner, '/render', init);
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '{}');
  const record = await (await send(owner, '/fixture-record')).json();
  assert.equal(record.children.length, 1);
  assert.equal(record.children[0].kind, 'render');
  assert.match(record.children[0].id, /^[a-f0-9-]{36}$/);
  assert.equal(record.activeChild, undefined);
  assert.deepEqual(await (await send(owner, '/fixture-render-record')).json(), {
    used: true,
    cancelled: true,
  });
  const forged = await send(owner, '/render', {
    ...init,
    headers: { ...init.headers, 'x-request-id': 'other', 'x-tenant': 'other' },
  });
  assert.equal(forged.status, 400);
  await send(owner, '/fixture-close', { method: 'POST' });
  await runtime.unsafeEvictDurableObject('request-fixture', 'RequestFixture', {
    id: namespace.idFromName(owner).toString(),
  });
  assert.equal((await send(owner, '/render', init)).status, 409);
  assert.equal((await (await send(owner, '/fixture-record')).json()).children.length, 1);
});
