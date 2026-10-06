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
      export * from './src/request-worker';
      export {KilnTenant} from './src/tenant';
      export class RequestFixture extends KilnNativeRequest {
        async fixtureSeed(tenant) { await this.ctx.storage.put('request', {state:'running',tenant,deadlineAt:Date.now()+60000,children:[]}); }
        async fixtureRecord() { return this.ctx.storage.get('request'); }
      }
      export default {async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/public') return production.fetch(request);
        const requestId = env.REQUESTS.idFromName(url.searchParams.get('owner')).toString();
        const stub = env.REQUESTS.get(env.REQUESTS.idFromString(requestId));
        if (url.pathname === '/fixture-seed') { await stub.fixtureSeed(await request.text()); return new Response('seeded'); }
        if (url.pathname === '/fixture-record') return Response.json(await stub.fixtureRecord());
        if (url.pathname === '/cancel') { await stub.cancel(); return new Response('cancelled'); }
        const service = ctx.exports.KilnNativeStorage({props: {requestId}});
        // The fixture enters through a public test listener; real VM loopback
        // requests do not carry Miniflare's public ingress client-IP header.
        const headers = new Headers(request.headers); headers.delete('cf-connecting-ip');
        return service.fetch(new Request('http://kiln-storage.internal'+url.pathname, new Request(request,{headers})));
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
