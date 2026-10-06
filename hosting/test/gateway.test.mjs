import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime;
const origin = 'https://kiln.example.com',
  user = `ka_${'1'.repeat(32)}`;
const nativeBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'kiln_validate', arguments: { code: 'function build(){}' } },
});
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
    import {forwardTenant} from './src/gateway';
    import {serviceFailure} from './src/http';
    export default {async fetch(request){
      const result=async(target,tenant,incoming)=>Response.json({target,tenant,path:new URL(incoming.url).pathname,headers:Object.fromEntries(incoming.headers),body:await incoming.text()});
      const env={TENANTS:{getByName:tenant=>({fetch:incoming=>result('storage',tenant,incoming)})}};
      if(!request.headers.has('x-fixture-no-compute'))env.NATIVE_COMPUTE={dispatch:(tenant,incoming)=>result('compute',tenant,incoming)};
      try{return await forwardTenant(request,env,{auth:{userId:'${user}',scope:['kiln:use']}},'${origin}');}catch(e){return serviceFailure(e);}
    }};`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
    }),
  );
});
after(async () => runtime?.dispose());

test('authenticated MCP routes only to admission using a trusted account hash and stripped credentials', async () => {
  const response = await runtime.dispatchFetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer fixture-secret',
      cookie: 'fixture=secret',
      'x-tenant': 'other',
      'mcp-protocol-version': '2025-11-25',
    },
    body: nativeBody,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.target, 'compute');
  assert.equal(body.path, '/mcp');
  assert.equal(body.body, nativeBody);
  assert.equal(
    body.tenant,
    createHash('sha256')
      .update(JSON.stringify(['kiln-tenant-v1', origin, user]))
      .digest('base64url'),
  );
  assert.equal(body.headers.authorization, undefined);
  assert.equal(body.headers.cookie, undefined);
  assert.equal(body.headers['x-tenant'], undefined);
  assert.equal(body.headers['mcp-protocol-version'], '2025-11-25');
});

test('missing compute binding fails closed while artifact downloads remain available without compute admission', async () => {
  const headers = { 'x-fixture-no-compute': '1' };
  assert.equal(
    (
      await runtime.dispatchFetch(`${origin}/mcp`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: nativeBody,
      })
    ).status,
    503,
  );
  const download = await runtime.dispatchFetch(`${origin}/mcp/artifacts/${'a'.repeat(32)}`, {
    headers,
  });
  assert.equal(download.status, 200);
  assert.equal((await download.json()).target, 'storage');
});

test('authenticated discovery and malformed messages never call storage or require native admission', async () => {
  for (const [method, params] of [
    ['tools/list', {}],
    ['tools/call', { name: 'kiln_discover', arguments: { query: 'wheel' } }],
  ]) {
    const response = await runtime.dispatchFetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'x-fixture-no-compute': '1',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.ok(!text.includes('"target":"compute"'));
    assert.ok(!text.includes('"target":"storage"'));
    assert.ok(text.includes(method === 'tools/list' ? '"tools":' : '"content":'));
  }
  const malformed = await runtime.dispatchFetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await runtime.dispatchFetch(`${origin}/mcp`)).status, 405);
});
