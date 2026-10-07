import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateEdgeManifest } from '../scripts/edge-manifest.mjs';
import { createKilnToolHost } from '../../dist/mcp-engine.mjs';
import { createPublicTools, hostedInstructions } from '../src/public-tools.ts';

let runtime, manifest;
before(async () => {
  manifest = JSON.parse(
    await readFile(new URL('../src/generated/edge-manifest.json', import.meta.url), 'utf8'),
  );
  const bundle = await build({
    stdin: {
      contents: `
    import {routeEdgeMcp} from './src/edge-mcp';
    export default {async fetch(request){const routed=await routeEdgeMcp(request);return routed instanceof Response?routed:new Response('compute',{status:599});}};
  `,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  assert.equal(
    Object.keys(bundle.metafile?.inputs ?? {}).some((p) => p.includes('mcp-engine')),
    false,
  );
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      outboundService: async () => {
        throw Error('No network');
      },
    }),
  );
});
after(async () => runtime?.dispose());
const meta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'edge-fixture', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};
function request(method, params = {}, modern = true, headers = {}) {
  return runtime.dispatchFetch('https://tenant.internal/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': modern ? '2026-07-28' : '2025-11-25',
      ...(modern
        ? { 'mcp-method': method, ...(params.name ? { 'mcp-name': params.name } : {}) }
        : {}),
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: { ...params, ...(modern ? { _meta: meta } : {}) },
    }),
  });
}
async function message(response) {
  const body = await response.text();
  return response.headers.get('content-type')?.includes('text/event-stream')
    ? body
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => JSON.parse(l.slice(5)))
        .findLast((x) => x.id !== undefined)
    : JSON.parse(body);
}
test('committed metadata is regenerated from the actual native engine protocol', async () => {
  assert.deepEqual(manifest, await generateEdgeManifest());
  assert.equal(manifest.tools.length, 15);
});
test('modern metadata and legacy initialization expose the derived hosted contract without compute', async () => {
  for (const [method, key] of [
    ['tools/list', 'tools'],
    ['resources/list', 'resources'],
    ['resources/templates/list', 'resourceTemplates'],
  ]) {
    const r = await request(method);
    assert.equal(r.status, 200);
    assert.deepEqual(
      (await message(r)).result[key],
      key === 'tools' ? createPublicTools(manifest.tools).tools : manifest[key],
    );
  }
  const discover = await message(await request('server/discover'));
  assert.deepEqual(
    discover.result._meta['io.modelcontextprotocol/serverInfo'],
    manifest.serverInfo,
  );
  const legacy = await request(
    'initialize',
    {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'legacy', version: '1' },
    },
    false,
  );
  assert.equal(legacy.status, 200);
  const result = (await message(legacy)).result;
  assert.deepEqual(result.serverInfo, manifest.serverInfo);
  assert.deepEqual(result.capabilities, manifest.capabilities);
  assert.equal(result.instructions, hostedInstructions);
});
test('helper discovery uses the engine service and preserves exact compact results and errors', async () => {
  const native = createKilnToolHost();
  for (const args of [
    {},
    { query: 'wheel spokes' },
    { ids: ['createPart'] },
    { ids: ['shape:capture'] },
    { query: 1 },
  ]) {
    const r = await request('tools/call', { name: 'kiln_discover', arguments: args });
    assert.equal(r.status, 200);
    const actual = (await message(r)).result;
    const expected = await native.callTool('kiln_discover', args, {
      signal: new AbortController().signal,
    });
    assert.deepEqual(actual.content, expected.content);
    assert.equal(actual.isError, expected.isError);
  }
});

test('hosted discovery rejects local-only aliases and hostile keys without echoing private paths', async () => {
  for (const args of [
    { category: 'prop' },
    { 'C:/Users/private/input': true },
    { capabilities: true },
  ]) {
    const result = await message(
      await request('tools/call', { name: 'kiln_discover', arguments: args }),
    );
    assert.equal(result.error.code, -32602);
    assert.doesNotMatch(JSON.stringify(result), /C:\/Users|private\/input/);
  }
});
test('source operations, private resource reads and live host capabilities still require the admitted native path', async () => {
  assert.equal(
    (
      await request('tools/call', {
        name: 'kiln_render',
        arguments: { code: 'function build(){}' },
      })
    ).status,
    599,
  );
  assert.equal((await request('resources/read', { uri: 'kiln://assets/private' })).status, 599);
  assert.equal(
    (await request('tools/call', { name: 'kiln_capabilities', arguments: {} })).status,
    599,
  );
});
test('invalid and unknown protocol messages cannot start compute, including forged routing headers', async () => {
  assert.equal((await request('tools/call', { name: 'not_a_tool', arguments: {} })).status, 200);
  const r = await request('tools/list', {}, true, {
    'mcp-method': 'tools/call',
    'mcp-name': 'kiln_render',
  });
  assert.notEqual(r.status, 599);
  for (const body of [
    '{',
    '[]',
    JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'kiln_render' } }),
  ]) {
    const invalid = await runtime.dispatchFetch('https://tenant.internal/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body,
    });
    assert.notEqual(invalid.status, 599);
  }
  assert.equal((await runtime.dispatchFetch('https://tenant.internal/mcp')).status, 405);
});
